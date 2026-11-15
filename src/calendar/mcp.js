import { GOOGLE_CALENDAR_MCP_URL } from "../connectors/builtin-calendar.js";
import { toUtcIso } from "../instant.js";
import { calendarFakeEnabled, calendarPresentedConnected, createFakeCalendarAdapter } from "./fake.js";
import { CalendarError, asCalendarError, eventUpdateArgs, validateEventUpdate } from "./validate.js";

export { CalendarError, calendarFakeEnabled, calendarPresentedConnected, eventUpdateArgs, validateEventUpdate };
export { GOOGLE_CALENDAR_MCP_URL };

/**
 * Scopes for the shared Calendar grant. Event write covers create, update, and delete.
 * The list and free/busy scopes match the Calendar MCP consent screen.
 */
export const CALENDAR_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
]);

const CALENDAR_URL = GOOGLE_CALENDAR_MCP_URL;

/** Workspace calendar zone. Override with CALENDAR_TIME_ZONE. */
export const CALENDAR_TIME_ZONE = "Asia/Ho_Chi_Minh";
const TIME_ZONE = CALENDAR_TIME_ZONE;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Google Calendar's remote MCP. The tool list is empty until a token is
 * present, so a write is not named from a guess. `update_event` updates the
 * event id it is given, with that event's start and end. It does not search
 * for a throwaway event.
 * An expired access token is refreshed once from the OAuth refresh token.
 * A day read that still cannot be signed returns `{ unavailable: true }`
 * and does not throw. `save` runs only after a refresh succeeds.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fetch?: typeof fetch, save?: (env: NodeJS.ProcessEnv) => void }} [options]
 */
export function createCalendarAdapter(env = process.env, options = {}) {
  if (calendarFakeEnabled(env)) return createFakeCalendarAdapter(env, { timeZone: calendarTimeZone(env), now: options.now });
  const fetchImpl = options.fetch || fetch;
  const save = options.save;
  const tokenOpts = { accessToken: options.accessToken };
  return {
    endpoint: CALENDAR_URL,
    async readDay(day) {
      const names = await listDay(fetchImpl, env, save, day, tokenOpts);
      return names;
    },
    async listTools() {
      const token = await currentToken(env, fetchImpl, save, tokenOpts);
      if (!token) return [];
      const response = await fetchImpl(CALENDAR_URL, {
        method: "POST",
        headers: rpcHeaders(token),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      if (!response.ok) return [];
      const body = parseRpc(await response.text());
      const tools = body?.result?.tools;
      if (!Array.isArray(tools)) return [];
      return tools.map((tool) => ({ ...tool, write: tool.name === "update_event" }));
    },
    async readEvent({ id, title } = {}) {
      const token = await currentToken(env, fetchImpl, save, tokenOpts);
      const zone = zoneOf(env);
      if (!token || !id) return null;
      try {
        const result = await toolsCall(fetchImpl, token, "get_event", { eventId: id });
        const event = singleEvent(result);
        if (event?.start) return { id: event.id || id, start: toUtcIso(event.start), end: toUtcIso(event.end), timeZone: event.timeZone || zone };
      } catch { /* list_events is the fallback when get_event is absent */ }
      try {
        const listed = await toolsCall(fetchImpl, token, "list_events", {
          fullText: title || id,
          timeZone: zone,
          pageSize: 20,
        });
        const event = eventsFrom(listed).find((item) => item.id === id);
        if (!event?.start) return null;
        return { id: event.id, start: toUtcIso(event.start), end: toUtcIso(event.end), timeZone: zone };
      } catch {
        return null;
      }
    },
    async listUpcoming() {
      const zone = zoneOf(env);
      const now = options.now instanceof Date ? options.now : new Date();
      const start = zonedBound(now, zone, 0, "00:00:00");
      const end = zonedBound(now, zone, 2, "00:00:00");
      return withCalendarToken(env, fetchImpl, save, async (token) => {
        const listed = await toolsCall(fetchImpl, token, "list_events", {
          startTime: start,
          endTime: end,
          timeZone: zone,
          pageSize: 20,
        });
        return eventsFrom(listed).filter((event) => event.id).map((event) => ({
          id: event.id,
          title: event.summary || "Meeting",
          start: toUtcIso(event.start),
          end: toUtcIso(event.end),
          readOnly: event.readOnly === true,
        }));
      }, tokenOpts);
    },
    async readEventDetails(id) {
      const clean = String(id || "").trim();
      if (!clean) throw new CalendarError("not-found", "That meeting was not found.");
      const zone = zoneOf(env);
      return withCalendarToken(env, fetchImpl, save, async (token) => {
        try {
          const result = await toolsCall(fetchImpl, token, "get_event", { eventId: clean });
          const event = singleEvent(result);
          if (event && (!event.id || event.id === clean) && (event.id || event.summary || event.start)) return toDetails(event, clean);
        } catch {
          /* list_events is the fallback when get_event is absent or refuses the id */
        }
        let listed;
        try {
          listed = await toolsCall(fetchImpl, token, "list_events", {
            fullText: clean,
            timeZone: zone,
            pageSize: 20,
          });
        } catch (error) {
          if (Number(error?.status) === 401) throw error;
          throw asCalendarError(error);
        }
        const event = eventsFrom(listed).find((item) => item.id === clean);
        if (!event) throw new CalendarError("not-found", "That meeting was not found.");
        return toDetails(event, clean);
      }, tokenOpts);
    },
    async updateEventDetails({ id, description, attendees, sendUpdates } = {}) {
      const current = await this.readEventDetails(id);
      if (current.readOnly) throw new CalendarError("read-only", "This meeting is read-only.");
      const next = validateEventUpdate({ description, attendees, sendUpdates, current });
      const args = eventUpdateArgs(current, next);
      if (args) {
        await withCalendarToken(env, fetchImpl, save, async (token) => {
          try {
            await toolsCall(fetchImpl, token, "update_event", args);
          } catch (error) {
            if (Number(error?.status) === 401) throw error;
            throw asCalendarError(error);
          }
        }, tokenOpts);
      }
      return {
        id: current.id,
        title: current.title,
        start: current.start,
        end: current.end,
        description: next.description,
        attendees: next.attendees,
        readOnly: false,
        changed: Boolean(args),
      };
    },
    async call(name, params) {
      // A person's adapter signs with that person's grant, never the process-wide token
      // (Nov 11 dry run: the in-call create read the env token for a person's calendar).
      if (!name) return { id: "" };
      const token = await currentToken(env, fetchImpl, save, tokenOpts);
      if (!token) return { id: "" };
      return withCalendarToken(env, fetchImpl, save, async (signed) => {
        if (name === "update_event") return updateEvent(fetchImpl, signed, params, zoneOf(env));
        const result = await toolsCall(fetchImpl, signed, name, params || {});
        const link = eventLinkFrom(result);
        return link ? { id: eventIdFrom(result), url: link } : { id: eventIdFrom(result) };
      }, tokenOpts);
    },
  };
}

export function calendarTimeZone(env = process.env) {
  const configured = typeof env?.CALENDAR_TIME_ZONE === "string" ? env.CALENDAR_TIME_ZONE.trim() : "";
  return configured || CALENDAR_TIME_ZONE;
}

function zoneOf(env) {
  return calendarTimeZone(env);
}

async function withCalendarToken(env, fetchImpl, save, run, tokenOpts = {}) {
  let token = await currentToken(env, fetchImpl, save, tokenOpts);
  if (!token) throw new CalendarError("not-connected", "Calendar is not connected.");
  try {
    return await run(token);
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    const status = Number(error?.status) || 0;
    if (status !== 401) throw asCalendarError(error);
    const refreshed = typeof tokenOpts.accessToken === "function"
      ? await tokenOpts.accessToken({ force: true })
      : await refreshAccessToken(env, fetchImpl, save);
    if (!refreshed) throw new CalendarError("not-connected", "Calendar is not connected.");
    try {
      return await run(refreshed);
    } catch (again) {
      if (again instanceof CalendarError) throw again;
      const againStatus = Number(again?.status) || 0;
      if (againStatus === 401) throw new CalendarError("not-connected", "Calendar is not connected.");
      throw asCalendarError(again);
    }
  }
}

function toDetails(event, id) {
  const attendees = Array.isArray(event.attendees) ? event.attendees.map((guest) => ({ ...guest })) : [];
  const orgEmail = String(event.organizerEmail || "").trim();
  if (orgEmail) {
    const found = attendees.find((guest) => guest.email.toLowerCase() === orgEmail.toLowerCase());
    if (found) found.organizer = true;
    else attendees.unshift({ email: orgEmail, ...(event.organizerName ? { name: event.organizerName } : {}), organizer: true });
  }
  return {
    id: event.id || id,
    title: event.summary || "Meeting",
    start: toUtcIso(event.start),
    end: toUtcIso(event.end),
    description: event.description || "",
    attendees,
    readOnly: event.readOnly === true,
  };
}

function zonedBound(now, timeZone, addDays, clock) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const shifted = new Date(Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day) + addDays));
  const day = shifted.toISOString().slice(0, 10);
  return `${day}T${clock}${zoneOffset(timeZone, now)}`;
}

function zoneOffset(timeZone, date) {
  let label = "";
  try {
    label = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).format(date);
  } catch {
    return "+07:00";
  }
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label);
  if (!match) return "+00:00";
  return `${match[1]}${match[2].padStart(2, "0")}:${match[3] || "00"}`;
}

async function updateEvent(fetchImpl, token, params, fallbackZone) {
  const id = String(params?.id || params?.eventId || "").trim();
  const start = String(params?.start || params?.startTime || "").trim();
  const end = String(params?.end || params?.endTime || "").trim();
  if (!id || !start || !end) return { id: "" };
  const result = await toolsCall(fetchImpl, token, "update_event", {
    eventId: id,
    startTime: start,
    endTime: end,
    timeZone: params?.timeZone || fallbackZone,
  });
  return { id: eventIdFrom(result) || id };
}

async function listDay(fetchImpl, env, save, day, tokenOpts = {}) {
  const window = dayBounds(day);
  const args = {
    startTime: window.start,
    endTime: window.end,
    timeZone: zoneOf(env),
    pageSize: 20,
  };
  try {
    const token = await currentToken(env, fetchImpl, save, tokenOpts);
    if (!token) return { day, events: [], unavailable: true };
    const result = await toolsCall(fetchImpl, token, "list_events", args);
    return { day, events: titlesFrom(result), unavailable: false };
  } catch (error) {
    const status = error instanceof Error ? Number(error.status) : 0;
    if (status !== 401 && status !== 403) return { day, events: [], unavailable: true };
    const refreshed = typeof tokenOpts.accessToken === "function"
      ? await tokenOpts.accessToken({ force: true })
      : await refreshAccessToken(env, fetchImpl, save);
    if (!refreshed) return { day, events: [], unavailable: true };
    try {
      const result = await toolsCall(fetchImpl, refreshed, "list_events", args);
      return { day, events: titlesFrom(result), unavailable: false };
    } catch {
      return { day, events: [], unavailable: true };
    }
  }
}

function titlesFrom(result) {
  return eventsFrom(result).map((event) => event.summary || event.id || "").filter(Boolean);
}

function accessExpired(env, now = Date.now()) {
  const expiresAt = Number(env.CALENDAR_OAUTH_EXPIRES_AT);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return expiresAt <= now + 60_000;
}

async function currentToken(env, fetchImpl, save, tokenOpts = {}) {
  if (typeof tokenOpts.accessToken === "function") {
    return (await tokenOpts.accessToken({ force: false })) || "";
  }
  if (env.CALENDAR_MCP_TOKEN && !accessExpired(env)) return env.CALENDAR_MCP_TOKEN;
  if (!env.CALENDAR_OAUTH_REFRESH_TOKEN) return env.CALENDAR_MCP_TOKEN || "";
  return refreshAccessToken(env, fetchImpl, save);
}

/**
 * The access token calendar-edit already refreshes. Callers must not log or return it.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetch?: typeof fetch, save?: (env: NodeJS.ProcessEnv) => void, force?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function calendarAccessToken(env = process.env, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (options.force === true) return refreshAccessToken(env, fetchImpl, options.save);
  return currentToken(env, fetchImpl, options.save);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function scopeList(value) {
  if (Array.isArray(value)) return value.map((scope) => String(scope || "").trim()).filter(Boolean);
  return String(value || "").split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
}

/**
 * @param {unknown} scopes
 */
export function calendarScopesGranted(scopes) {
  const list = scopeList(scopes);
  return CALENDAR_SCOPES.every((scope) => list.includes(scope));
}

/**
 * Whether a declined Calendar consent should be explained on the preset card.
 * A full grant is not partial. Tokens are not part of this view.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function calendarGrantPartial(env = process.env) {
  if (calendarPresentedConnected(env)) return false;
  if (String(env.CALENDAR_OAUTH_DECLINED || "").trim() === "1") return true;
  const scopes = scopeList(env.CALENDAR_OAUTH_SCOPES);
  return scopes.length > 0 && !calendarScopesGranted(scopes);
}

/**
 * Store the Calendar OAuth grant on the same env fields calendar-edit reads.
 * A partial consent does not set the refresh token, so Calendar stays disconnected.
 * The plaintext tokens are not returned.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ accessToken?: string, refreshToken?: string, expiresAt?: number, scopes?: string[] | string }} record
 * @param {(env: NodeJS.ProcessEnv | Record<string, string | undefined>) => void} [save]
 * @returns {boolean}
 */
export function applyCalendarConnection(env, record, save) {
  const scopes = scopeList(record?.scopes);
  const refreshToken = String(record?.refreshToken || "");
  env.CALENDAR_OAUTH_SCOPES = scopes.join(" ");
  if (!refreshToken || !calendarScopesGranted(scopes)) {
    env.CALENDAR_OAUTH_DECLINED = "1";
    return false;
  }
  delete env.CALENDAR_OAUTH_DECLINED;
  const accessToken = String(record?.accessToken || "");
  if (accessToken) env.CALENDAR_MCP_TOKEN = accessToken;
  env.CALENDAR_OAUTH_REFRESH_TOKEN = refreshToken;
  const expiresAt = Number(record?.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > 0) env.CALENDAR_OAUTH_EXPIRES_AT = String(expiresAt);
  if (calendarFakeEnabled(env)) env.SEDERUNT_CALENDAR_FAKE_CONNECTED = "1";
  if (typeof save === "function") {
    try { save(env); } catch { /* the grant is already on env */ }
  }
  return true;
}

async function refreshAccessToken(env, fetchImpl, save) {
  const clientId = env.CALENDAR_OAUTH_CLIENT_ID || "";
  const clientSecret = env.CALENDAR_OAUTH_CLIENT_SECRET || "";
  const refreshToken = env.CALENDAR_OAUTH_REFRESH_TOKEN || "";
  if (!clientId || !clientSecret || !refreshToken) return "";
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!response.ok || !accessToken) return "";
  env.CALENDAR_MCP_TOKEN = accessToken;
  const expiresIn = Number(payload.expires_in);
  env.CALENDAR_OAUTH_EXPIRES_AT = String(Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000);
  if (typeof payload.refresh_token === "string" && payload.refresh_token) {
    env.CALENDAR_OAUTH_REFRESH_TOKEN = payload.refresh_token;
  }
  if (typeof save === "function") {
    try { save(env); } catch { /* the refreshed token is already on env */ }
  }
  return accessToken;
}

export function dayBounds(day, now = new Date()) {
  const date = shiftDate(zonedDate(now), weekdayIndex(day) - zonedWeekday(now));
  if (weekdayIndex(day) < zonedWeekday(now)) {
    return boundsFor(shiftDate(date, 7));
  }
  return boundsFor(date);
}

export function moveStart(event, day) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  const duration = Math.max(end.getTime() - start.getTime(), 30 * 60 * 1000);
  const current = zonedWeekday(start);
  const target = weekdayIndex(day);
  let delta = target - current;
  if (delta <= 0) delta += 7;
  const next = new Date(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return {
    start: next.toISOString(),
    end: new Date(next.getTime() + duration).toISOString(),
  };
}

function boundsFor(date) {
  return {
    start: `${date}T00:00:00+07:00`,
    end: `${date}T23:59:59+07:00`,
  };
}

function zonedDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function zonedWeekday(now) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long" }).format(now);
  return WEEKDAYS.indexOf(name);
}

function weekdayIndex(day) {
  const index = WEEKDAYS.findIndex((name) => name.toLowerCase() === String(day || "").toLowerCase());
  return index < 0 ? 5 : index;
}

function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

async function toolsCall(fetchImpl, token, name, args) {
  const response = await fetchImpl(CALENDAR_URL, {
    method: "POST",
    headers: rpcHeaders(token),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = parseRpc(await response.text());
  if (!response.ok || body?.error) {
    const error = new Error("Calendar request failed");
    error.status = response.status || Number(body?.error?.code) || 0;
    throw error;
  }
  return body?.result;
}

function rpcHeaders(token) {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
}

function parseRpc(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const lines = trimmed.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith("{")) return JSON.parse(lines[index]);
  }
  return {};
}

function eventsFrom(result) {
  const structured = result?.structuredContent?.events || result?.structuredContent?.items;
  if (Array.isArray(structured)) return structured.map(normalizeEvent);
  const text = (result?.content || []).find((part) => part?.type === "text")?.text;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.events || parsed.items || [];
    return Array.isArray(list) ? list.map(normalizeEvent) : [];
  } catch {
    return [];
  }
}

function singleEvent(result) {
  const structured = result?.structuredContent;
  if (structured && (structured.start || structured.startTime || structured.id || structured.summary)) {
    return normalizeEvent(structured);
  }
  return eventsFrom(result)[0] || null;
}

function normalizeEvent(event) {
  const organizer = event?.organizer && typeof event.organizer === "object" ? event.organizer : null;
  return {
    id: event?.id || "",
    summary: event?.summary || event?.title || "",
    start: timeOf(event?.start) || timeOf(event?.startTime),
    end: timeOf(event?.end) || timeOf(event?.endTime),
    timeZone: event?.timeZone || event?.start?.timeZone || "",
    description: typeof event?.description === "string" ? event.description : "",
    attendees: normalizeAttendees(event?.attendees),
    readOnly: event?.readOnly === true || notEditable(event, organizer),
    organizerEmail: typeof organizer?.email === "string" ? organizer.email : "",
    organizerName: typeof organizer?.displayName === "string" ? organizer.displayName : (typeof organizer?.name === "string" ? organizer.name : ""),
  };
}

/** Event.start / end are DateOrDateTime: `{ dateTime }`, or `{ date }` for all-day. */
function timeOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.dateTime || value.date || "";
  return "";
}

/**
 * Event has no read-only flag. It is not ours to edit when the organizer is
 * someone else (`organizer.self === false`, or our own attendee row is not
 * the organizer) and guests may not modify it.
 */
function notEditable(event, organizer) {
  if (event?.guestPermissions?.guestsCanModify === true) return false;
  if (organizer?.self === true) return false;
  if (organizer?.self === false) return true;
  const mine = Array.isArray(event?.attendees) ? event.attendees.find((guest) => guest?.self === true) : null;
  return Boolean(mine && mine.organizer !== true);
}

function normalizeAttendees(list) {
  if (!Array.isArray(list)) return [];
  const guests = [];
  for (const item of list) {
    if (typeof item === "string") {
      const email = item.trim();
      if (email) guests.push({ email });
      continue;
    }
    const email = String(item?.email || "").trim();
    if (!email) continue;
    const guest = { email };
    const name = item?.displayName || item?.name;
    if (name) guest.name = String(name);
    if (item?.responseStatus) guest.responseStatus = String(item.responseStatus);
    if (item?.organizer === true) guest.organizer = true;
    guests.push(guest);
  }
  return guests;
}

/** Google's own link to the event, when the tool returned one. */
function eventLinkFrom(result) {
  const pick = (row) => {
    const link = String(row?.htmlLink || row?.url || row?.link || "").trim();
    return /^https:\/\/(?:www\.)?(?:google\.com\/calendar|calendar\.google\.com)\//i.test(link) ? link : "";
  };
  const structured = result?.structuredContent;
  const direct = pick(structured) || pick(structured?.event);
  if (direct) return direct;
  const text = (result?.content || []).find((part) => part?.type === "text")?.text || "";
  try {
    const parsed = JSON.parse(text);
    return pick(parsed) || pick(parsed?.event) || "";
  } catch {
    const found = text.match(/https:\/\/(?:www\.)?(?:google\.com\/calendar|calendar\.google\.com)\/[^\s"')<>]+/i);
    return found ? found[0] : "";
  }
}

function eventIdFrom(result) {
  const structured = result?.structuredContent;
  if (typeof structured?.id === "string") return structured.id;
  const event = eventsFrom(result)[0];
  if (event?.id) return event.id;
  const text = (result?.content || []).find((part) => part?.type === "text")?.text || "";
  try {
    const parsed = JSON.parse(text);
    return parsed.id || parsed.eventId || "";
  } catch {
    return "";
  }
}
