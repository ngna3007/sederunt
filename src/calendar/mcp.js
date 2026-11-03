const CALENDAR_URL = "https://calendarmcp.googleapis.com/mcp/v1";

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
  const fetchImpl = options.fetch || fetch;
  const save = options.save;
  return {
    endpoint: CALENDAR_URL,
    async readDay(day) {
      const names = await listDay(fetchImpl, env, save, day);
      return names;
    },
    async listTools() {
      const token = await currentToken(env, fetchImpl, save);
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
      const token = await currentToken(env, fetchImpl, save);
      const zone = zoneOf(env);
      if (!token || !id) return null;
      try {
        const result = await toolsCall(fetchImpl, token, "get_event", { eventId: id, timeZone: zone });
        const event = singleEvent(result);
        if (event?.start) return { id: event.id || id, start: event.start, end: event.end, timeZone: event.timeZone || zone };
      } catch { /* list_events is the fallback when get_event is absent */ }
      try {
        const listed = await toolsCall(fetchImpl, token, "list_events", {
          fullText: title || id,
          timeZone: zone,
          pageSize: 20,
        });
        const event = eventsFrom(listed).find((item) => item.id === id);
        if (!event?.start) return null;
        return { id: event.id, start: event.start, end: event.end, timeZone: zone };
      } catch {
        return null;
      }
    },
    async call(name, params) {
      const token = await currentToken(env, fetchImpl, save);
      if (!token || !name) return { id: "" };
      if (name === "update_event") return updateEvent(fetchImpl, token, params, zoneOf(env));
      const result = await toolsCall(fetchImpl, token, name, params || {});
      return { id: eventIdFrom(result) };
    },
  };
}

function zoneOf(env) {
  const configured = typeof env.CALENDAR_TIME_ZONE === "string" ? env.CALENDAR_TIME_ZONE.trim() : "";
  return configured || CALENDAR_TIME_ZONE;
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

async function listDay(fetchImpl, env, save, day) {
  const window = dayBounds(day);
  const args = {
    startTime: window.start,
    endTime: window.end,
    timeZone: zoneOf(env),
    pageSize: 20,
  };
  try {
    const token = await currentToken(env, fetchImpl, save);
    if (!token) return { day, events: [], unavailable: true };
    const result = await toolsCall(fetchImpl, token, "list_events", args);
    return { day, events: titlesFrom(result), unavailable: false };
  } catch (error) {
    const status = error instanceof Error ? Number(error.status) : 0;
    if (status !== 401 && status !== 403) return { day, events: [], unavailable: true };
    const refreshed = await refreshAccessToken(env, fetchImpl, save);
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

async function currentToken(env, fetchImpl, save) {
  if (env.CALENDAR_MCP_TOKEN && !accessExpired(env)) return env.CALENDAR_MCP_TOKEN;
  if (!env.CALENDAR_OAUTH_REFRESH_TOKEN) return env.CALENDAR_MCP_TOKEN || "";
  return refreshAccessToken(env, fetchImpl, save);
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
  return {
    id: event?.id || "",
    summary: event?.summary || "",
    start: event?.start?.dateTime || event?.startTime || event?.start || "",
    end: event?.end?.dateTime || event?.endTime || event?.end || "",
    timeZone: event?.timeZone || event?.start?.timeZone || "",
  };
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
