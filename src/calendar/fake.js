import { toUtcIso } from "../instant.js";
import { CalendarError, eventUpdateArgs, validateEventUpdate } from "./validate.js";

const DEFAULT_ZONE = "Asia/Ho_Chi_Minh";

/**
 * In-memory calendar for demos and tests. No network.
 * On when SEDERUNT_CALENDAR_FAKE=1, or when SEDERUNT_AUTH_FAKE=1
 * unless SEDERUNT_CALENDAR_FAKE=0.
 * SEDERUNT_CALENDAR_FAKE_CONNECTED=0 keeps the store but presents
 * the calendar as not connected.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function calendarFakeEnabled(env = {}) {
  const flag = String(env.SEDERUNT_CALENDAR_FAKE ?? "").trim();
  if (flag === "0") return false;
  if (flag === "1") return true;
  return String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1";
}

/**
 * Whether the console should treat Calendar as connected.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function calendarPresentedConnected(env = {}) {
  if (calendarFakeEnabled(env)) {
    return String(env.SEDERUNT_CALENDAR_FAKE_CONNECTED ?? "").trim() !== "0";
  }
  return Boolean(env.CALENDAR_MCP_TOKEN || env.CALENDAR_OAUTH_REFRESH_TOKEN);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ timeZone?: string, now?: Date }} [options]
 */
export function createFakeCalendarAdapter(env = {}, options = {}) {
  const zone = options.timeZone || zoneName(env);
  const now = options.now instanceof Date ? options.now : new Date();
  const events = seedEvents(now, zone);
  /** @type {Array<{ name: string, arguments: object }>} */
  const calls = [];

  function requireConnected() {
    if (!calendarPresentedConnected(env)) {
      throw new CalendarError("not-connected", "Calendar is not connected.");
    }
  }

  function find(id) {
    return events.find((event) => event.id === id) || null;
  }

  return {
    endpoint: "fake://calendar",
    calls,
    async readDay(day) {
      if (!calendarPresentedConnected(env)) return { day, events: [], unavailable: true };
      const name = String(day || "").toLowerCase();
      const titles = events
        .filter((event) => weekdayOf(event.start, zone).toLowerCase() === name)
        .map((event) => event.title)
        .filter(Boolean);
      return { day, events: titles, unavailable: false };
    },
    async listTools() {
      if (!calendarPresentedConnected(env)) return [];
      return [
        { name: "list_events", write: false },
        { name: "get_event", write: false },
        { name: "list_calendars", write: false },
        { name: "search_events", write: false },
        { name: "suggest_time", write: false },
        { name: "create_event", write: false },
        { name: "update_event", write: true },
        { name: "respond_to_event", write: false },
        { name: "delete_event", write: false },
      ];
    },
    async readEvent({ id } = {}) {
      requireConnected();
      const event = find(String(id || "").trim());
      if (!event?.start) return null;
      return { id: event.id, start: event.start, end: event.end, timeZone: zone };
    },
    async call(name, params) {
      requireConnected();
      if (name === "create_event") {
        const summary = String(params?.summary || params?.title || "").trim() || "Meeting";
        const start = String(params?.startTime || params?.start || "").trim();
        let end = String(params?.endTime || params?.end || "").trim();
        if (!start) return { id: "" };
        if (!end) {
          const ms = Date.parse(start);
          if (!Number.isFinite(ms)) return { id: "" };
          end = new Date(ms + 30 * 60_000).toISOString();
        }
        const id = `fake-created-${events.length + 1}`;
        events.push({
          id,
          title: summary,
          start: toUtcIso(start),
          end: toUtcIso(end),
          description: String(params?.description || ""),
          readOnly: false,
          attendees: [],
        });
        calls.push({ name, arguments: { summary, startTime: start, endTime: end, timeZone: params?.timeZone || zone } });
        return { id, title: summary, summary };
      }
      if (name !== "update_event") return { id: "" };
      const id = String(params?.id || params?.eventId || "").trim();
      const start = String(params?.start || params?.startTime || "").trim();
      const end = String(params?.end || params?.endTime || "").trim();
      if (!id || !start || !end) return { id: "" };
      const event = find(id);
      if (!event) return { id: "" };
      if (event.readOnly) throw new CalendarError("read-only", "This meeting is read-only.");
      event.start = toUtcIso(start);
      event.end = toUtcIso(end);
      calls.push({ name, arguments: { eventId: id, startTime: start, endTime: end, timeZone: params?.timeZone || zone } });
      return { id };
    },
    async listUpcoming() {
      const today = dayStamp(now, zone, 0);
      const after = dayStamp(now, zone, 2);
      return events
        .filter((event) => {
          const day = dayKey(event.start, zone);
          return day >= today && day < after;
        })
        .map(brief);
    },
    async readEventDetails(id) {
      requireConnected();
      const event = find(String(id || "").trim());
      if (!event) throw new CalendarError("not-found", "That meeting was not found.");
      return publicEvent(event);
    },
    async updateEventDetails({ id, description, attendees, sendUpdates } = {}) {
      requireConnected();
      const event = find(String(id || "").trim());
      if (!event) throw new CalendarError("not-found", "That meeting was not found.");
      if (event.readOnly) throw new CalendarError("read-only", "This meeting is read-only.");
      const next = validateEventUpdate({ description, attendees, sendUpdates, current: event });
      const payload = eventUpdateArgs(event, next);
      if (payload) calls.push({ name: "update_event", arguments: payload });
      event.description = next.description;
      event.attendees = next.attendees;
      event.lastSendUpdates = next.sendUpdates;
      return { ...publicEvent(event), changed: Boolean(payload) };
    },
  };
}

function brief(event) {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    readOnly: event.readOnly === true,
  };
}

function publicEvent(event) {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    description: event.description || "",
    attendees: (event.attendees || []).map((guest) => {
      const row = { email: guest.email };
      if (guest.name) row.name = guest.name;
      if (guest.responseStatus) row.responseStatus = guest.responseStatus;
      if (guest.organizer) row.organizer = true;
      return row;
    }),
    readOnly: event.readOnly === true,
  };
}

function seedEvents(now, zone) {
  const today = dayStamp(now, zone, 0);
  const tomorrow = dayStamp(now, zone, 1);
  const offset = zoneOffset(zone, now);
  const at = (day, hm) => toUtcIso(`${day}T${hm}:00${offset}`);
  const ada = { email: "ada@example.com", name: "Ada Lovelace", responseStatus: "accepted", organizer: true };
  return [
    {
      id: "launch-review",
      title: "Launch review",
      start: at(today, "09:00"),
      end: at(today, "09:45"),
      description: "Walk the launch checklist and the open questions before we ship.",
      readOnly: false,
      attendees: [
        { ...ada },
        { email: "grace@example.com", name: "Grace Hopper", responseStatus: "accepted" },
        { email: "mina@example.com", name: "Mina Chen", responseStatus: "tentative" },
      ],
    },
    {
      id: "design-crit",
      title: "Design crit",
      start: at(today, "14:00"),
      end: at(today, "15:00"),
      description: "Review the console edits for meeting details and guests.",
      readOnly: false,
      attendees: [
        { ...ada },
        { email: "sam@example.com", name: "Sam Rivera", responseStatus: "accepted" },
        { email: "leah@example.com", name: "Leah Ortiz", responseStatus: "needsAction" },
        { email: "quang@example.com", name: "Quang Tran", responseStatus: "accepted" },
      ],
    },
    {
      id: "customer-sync",
      title: "Customer sync",
      start: at(tomorrow, "10:00"),
      end: at(tomorrow, "10:30"),
      description: "Ho Chi Minh pilot: onboarding timeline and the first room.",
      readOnly: false,
      attendees: [
        { ...ada },
        { email: "jordan@example.com", name: "Jordan Blake", responseStatus: "accepted" },
      ],
    },
    {
      id: "board-readout",
      title: "Board readout",
      start: at(tomorrow, "16:00"),
      end: at(tomorrow, "17:00"),
      description: "Quarterly board readout. The notes are locked.",
      readOnly: true,
      attendees: [
        { ...ada },
        { email: "grace@example.com", name: "Grace Hopper", responseStatus: "accepted" },
        { email: "nora@example.com", name: "Nora Patel", responseStatus: "accepted" },
        { email: "theo@example.com", name: "Theo Nguyen", responseStatus: "declined" },
        { email: "priya@example.com", name: "Priya Shah", responseStatus: "tentative" },
      ],
    },
  ];
}

function zoneName(env) {
  const configured = typeof env?.CALENDAR_TIME_ZONE === "string" ? env.CALENDAR_TIME_ZONE.trim() : "";
  return configured || DEFAULT_ZONE;
}

function dayStamp(now, timeZone, addDays) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const shifted = new Date(Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day) + addDays));
  return shifted.toISOString().slice(0, 10);
}

function dayKey(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dayStamp(date, timeZone, 0);
}

function weekdayOf(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
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
