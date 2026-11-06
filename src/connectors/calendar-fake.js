import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const readNotes = { readOnlyHint: true, destructiveHint: false };
const writeNotes = { readOnlyHint: false, destructiveHint: false };
const deleteNotes = { readOnlyHint: false, destructiveHint: true };

const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const iso = z.string().refine((value) => ISO_TIME.test(value), { message: "Expected an ISO time." });

const person = z.union([
  z.string(),
  z.looseObject({ email: z.string().optional() }),
]);

const eventSchema = z.object({
  id: z.string(),
  summary: z.string(),
  start: z.object({ dateTime: z.string() }),
  end: z.object({ dateTime: z.string() }),
});

const listOutput = z.object({
  events: z.array(eventSchema),
});

const LIST_EVENT_FIELDS = [
  "calendarId", "startTime", "endTime", "pageSize", "pageToken", "query", "eventType",
  "fullText", "timeZone", "orderBy", "eventTypeFilter",
];
const GET_EVENT_FIELDS = ["calendarId", "eventId"];
const LIST_CALENDAR_FIELDS = ["pageSize", "pageToken"];
const SEARCH_FIELDS = ["query", "startTime", "endTime", "pageSize", "pageToken", "calendarId", "timeZone"];
const SUGGEST_FIELDS = [
  "attendees", "calendarIds", "attendeeEmails", "startTime", "endTime",
  "durationMinutes", "timeZone", "preferences",
];
const CREATE_FIELDS = [
  "calendarId", "summary", "startTime", "endTime", "description", "attendees",
  "location", "timeZone", "attendeeEmails",
];
const UPDATE_FIELDS = [
  "calendarId", "eventId", "summary", "startTime", "endTime", "description",
  "location", "attendees", "timeZone", "addedAttendees", "removedAttendeeEmails",
  "notificationLevel", "allDay",
];
const DELETE_FIELDS = ["calendarId", "eventId"];
const RESPOND_FIELDS = ["calendarId", "eventId", "response", "responseStatus", "notificationLevel"];

/**
 * In-memory Calendar MCP for demos and tests. No network.
 * Tool names and inputs follow the Google Calendar MCP shapes.
 * list_events and create_event rely on name rules. get_event, update_event,
 * and delete_event carry annotations.
 *
 * @param {{ events: Array<{ id: string, summary: string, start: { dateTime: string }, end: { dateTime: string }, description?: string, location?: string, attendees?: unknown, response?: string, eventType?: string }>, seq: number }} state
 */
export function createCalendarMcpServer(state) {
  const server = new McpServer({ name: "sederunt-calendar", version: "0.0.0" });

  server.registerTool("list_events", {
    description: "List events on the calendar.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      startTime: iso.optional(),
      endTime: iso.optional(),
      pageSize: z.number().int().optional(),
      pageToken: z.string().optional(),
      query: z.string().optional(),
      eventType: z.union([z.string(), z.array(z.string())]).optional(),
      fullText: z.string().optional(),
      timeZone: z.string().optional(),
      orderBy: z.string().optional(),
      eventTypeFilter: z.union([z.string(), z.array(z.string())]).optional(),
    }),
    outputSchema: listOutput,
  }, async (args) => {
    const unknown = rejectUnknown(args, LIST_EVENT_FIELDS);
    if (unknown) return unknown;
    return toolResult("list_events", async () => ({ events: selectEvents(state.events, args).map(copyEvent) }));
  });

  server.registerTool("get_event", {
    description: "Read one event.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      eventId: z.string(),
    }),
    outputSchema: eventSchema,
    annotations: readNotes,
  }, async (args) => {
    const unknown = rejectUnknown(args, GET_EVENT_FIELDS);
    if (unknown) return unknown;
    return toolResult("get_event", async () => {
      const event = state.events.find((item) => item.id === String(args?.eventId || ""));
      if (!event) fail("not-found", "That meeting was not found.");
      return copyEvent(event);
    });
  });

  server.registerTool("list_calendars", {
    description: "List calendars.",
    inputSchema: z.looseObject({
      pageSize: z.number().int().optional(),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      calendars: z.array(z.object({ id: z.string(), summary: z.string() })),
    }),
  }, async (args) => {
    const unknown = rejectUnknown(args, LIST_CALENDAR_FIELDS);
    if (unknown) return unknown;
    return toolResult("list_calendars", async () => ({
      calendars: [{ id: "primary", summary: "Primary" }],
    }));
  });

  server.registerTool("search_events", {
    description: "Search events.",
    inputSchema: z.looseObject({
      query: z.string().optional(),
      startTime: iso.optional(),
      endTime: iso.optional(),
      pageSize: z.number().int().optional(),
      pageToken: z.string().optional(),
      calendarId: z.string().optional(),
      timeZone: z.string().optional(),
    }),
    outputSchema: listOutput,
  }, async (args) => {
    const unknown = rejectUnknown(args, SEARCH_FIELDS);
    if (unknown) return unknown;
    return toolResult("search_events", async () => ({ events: selectEvents(state.events, args).map(copyEvent) }));
  });

  server.registerTool("suggest_time", {
    description: "Suggest a meeting time.",
    inputSchema: z.looseObject({
      attendees: z.array(person).optional(),
      calendarIds: z.array(z.string()).optional(),
      attendeeEmails: z.array(z.string()).optional(),
      startTime: iso.optional(),
      endTime: iso.optional(),
      durationMinutes: z.number().optional(),
      timeZone: z.string().optional(),
      preferences: z.string().optional(),
    }),
    outputSchema: z.object({
      suggestions: z.array(z.object({
        start: z.string(),
        end: z.string(),
        durationMinutes: z.number(),
      })),
    }),
  }, async (args) => {
    const unknown = rejectUnknown(args, SUGGEST_FIELDS);
    if (unknown) return unknown;
    return toolResult("suggest_time", async () => suggest(args));
  });

  server.registerTool("create_event", {
    description: "Create an event.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      summary: z.string(),
      startTime: iso.optional(),
      endTime: iso.optional(),
      description: z.string().optional(),
      attendees: z.array(person).optional(),
      location: z.string().optional(),
      timeZone: z.string().optional(),
      attendeeEmails: z.array(z.string()).optional(),
    }),
    outputSchema: eventSchema,
  }, async (args) => {
    const unknown = rejectUnknown(args, CREATE_FIELDS);
    if (unknown) return unknown;
    return toolResult("create_event", async () => {
      const summary = String(args?.summary || "").trim();
      if (!summary) fail("invalid-argument", "Enter a title.");
      state.seq += 1;
      const event = {
        id: `fake-event-${state.seq}`,
        summary,
        start: { dateTime: String(args?.startTime || "2026-11-04T09:00:00+07:00") },
        end: { dateTime: String(args?.endTime || "2026-11-04T09:45:00+07:00") },
        description: typeof args?.description === "string" ? args.description : "",
        location: typeof args?.location === "string" ? args.location : "",
        attendees: Array.isArray(args?.attendees) ? args.attendees : [],
      };
      state.events.push(event);
      return copyEvent(event);
    });
  });

  server.registerTool("update_event", {
    description: "Update an event.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      eventId: z.string(),
      summary: z.string().optional(),
      startTime: iso.optional(),
      endTime: iso.optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      attendees: z.array(person).optional(),
      timeZone: z.string().optional(),
      addedAttendees: z.array(person).optional(),
      removedAttendeeEmails: z.array(z.string()).optional(),
      notificationLevel: z.string().optional(),
      allDay: z.boolean().optional(),
    }),
    outputSchema: eventSchema,
    annotations: writeNotes,
  }, async (args) => {
    const unknown = rejectUnknown(args, UPDATE_FIELDS);
    if (unknown) return unknown;
    return toolResult("update_event", async () => {
      const event = state.events.find((item) => item.id === String(args?.eventId || ""));
      if (!event) fail("not-found", "That meeting was not found.");
      if (typeof args?.summary === "string" && args.summary.trim()) event.summary = args.summary.trim();
      if (typeof args?.startTime === "string" && args.startTime) event.start = { dateTime: args.startTime };
      if (typeof args?.endTime === "string" && args.endTime) event.end = { dateTime: args.endTime };
      if (typeof args?.description === "string") event.description = args.description;
      if (typeof args?.location === "string") event.location = args.location;
      if (Array.isArray(args?.attendees)) event.attendees = args.attendees;
      return copyEvent(event);
    });
  });

  server.registerTool("delete_event", {
    description: "Delete an event.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      eventId: z.string(),
    }),
    outputSchema: z.object({ id: z.string(), deleted: z.boolean() }),
    annotations: deleteNotes,
  }, async (args) => {
    const unknown = rejectUnknown(args, DELETE_FIELDS);
    if (unknown) return unknown;
    return toolResult("delete_event", async () => {
      const id = String(args?.eventId || "");
      const index = state.events.findIndex((item) => item.id === id);
      if (index < 0) fail("not-found", "That meeting was not found.");
      state.events.splice(index, 1);
      return { id, deleted: true };
    });
  });

  server.registerTool("respond_to_event", {
    description: "Respond to an event.",
    inputSchema: z.looseObject({
      calendarId: z.string().optional(),
      eventId: z.string(),
      response: z.string().optional(),
      responseStatus: z.string().optional(),
      notificationLevel: z.string().optional(),
    }),
    outputSchema: z.object({ id: z.string(), response: z.string() }),
  }, async (args) => {
    const unknown = rejectUnknown(args, RESPOND_FIELDS);
    if (unknown) return unknown;
    return toolResult("respond_to_event", async () => {
      const event = state.events.find((item) => item.id === String(args?.eventId || ""));
      if (!event) fail("not-found", "That meeting was not found.");
      const response = String(args?.response || args?.responseStatus || "").trim();
      if (!response) fail("invalid-argument", "Enter a response.");
      event.response = response;
      return { id: event.id, response };
    });
  });

  return server;
}

/**
 * One fake calendar for this process. Events stay in memory for the app.
 */
export function createFakeCalendarMcp() {
  const state = {
    seq: 1,
    events: [
      {
        id: "launch-review",
        summary: "Launch review",
        start: { dateTime: "2026-11-04T09:00:00+07:00" },
        end: { dateTime: "2026-11-04T09:45:00+07:00" },
        eventType: "default",
      },
    ],
  };
  return {
    server() {
      return createCalendarMcpServer(state);
    },
  };
}

function copyEvent(event) {
  return {
    id: event.id,
    summary: event.summary,
    start: { dateTime: event.start.dateTime },
    end: { dateTime: event.end.dateTime },
  };
}

function rejectUnknown(args, fields) {
  const known = new Set(fields);
  const extra = Object.keys(args && typeof args === "object" ? args : {}).filter((key) => !known.has(key));
  if (!extra.length) return null;
  const text = extra.map((name) => `Unknown name "${String(name).replace(/"/g, "")}", Cannot find field.`).join(" ");
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: { code: "invalid-argument", message: text },
  };
}

function instant(value) {
  if (typeof value !== "string" || !value) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const ms = Date.parse(zoned);
  return Number.isFinite(ms) ? ms : null;
}

function matchesQuery(event, args) {
  const query = String(args?.query || args?.fullText || "").trim().toLowerCase();
  if (!query) return true;
  return String(event.summary || "").toLowerCase().includes(query);
}

function matchesType(event, args) {
  const raw = args?.eventType ?? args?.eventTypeFilter;
  if (raw == null || raw === "") return true;
  const wanted = (Array.isArray(raw) ? raw : [raw]).map((item) => String(item));
  if (!wanted.length) return true;
  return wanted.includes(event.eventType || "default");
}

function inWindow(event, args) {
  const start = instant(event.start?.dateTime);
  const end = instant(event.end?.dateTime);
  const from = instant(args?.startTime);
  const to = instant(args?.endTime);
  if (from != null && end != null && end < from) return false;
  if (to != null && start != null && start > to) return false;
  return true;
}

function selectEvents(events, args) {
  const matched = events.filter((event) => matchesQuery(event, args) && matchesType(event, args) && inWindow(event, args));
  if (args?.orderBy === "startTime") {
    matched.sort((left, right) => (instant(left.start?.dateTime) || 0) - (instant(right.start?.dateTime) || 0));
  }
  const size = Number.isInteger(args?.pageSize) && args.pageSize > 0 ? args.pageSize : matched.length;
  const offset = Number.parseInt(String(args?.pageToken || "0"), 10);
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  return matched.slice(start, start + size);
}

function suggest(args) {
  const minutes = Number.isFinite(args?.durationMinutes) ? args.durationMinutes : 45;
  const startMs = instant(args?.startTime) ?? Date.parse("2026-11-04T02:00:00Z");
  const endMs = instant(args?.endTime) ?? (startMs + minutes * 60 * 1000);
  return {
    suggestions: [{
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      durationMinutes: minutes,
    }],
  };
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

/**
 * @param {string} name
 * @param {() => Promise<Record<string, unknown>>} run
 */
async function toolResult(name, run) {
  try {
    const result = await run();
    return {
      content: [{ type: "text", text: summaryFor(name, result) }],
      structuredContent: result,
    };
  } catch (error) {
    const text = String(error?.message || "Calendar could not be reached.");
    const index = text.indexOf(":");
    const code = index > 0 && index < 40 ? text.slice(0, index).trim() : "invalid-argument";
    const message = index > 0 && index < 40 ? text.slice(index + 1).trim() : text;
    return {
      isError: true,
      content: [{ type: "text", text }],
      structuredContent: { code, message },
    };
  }
}

function summaryFor(name, result) {
  if ((name === "list_events" || name === "search_events") && Array.isArray(result?.events)) {
    const count = result.events.length;
    const noun = count === 1 ? "1 event." : `${count} events.`;
    const title = result.events[0]?.summary;
    return title ? `${noun} ${title}.` : noun;
  }
  if (name === "get_event" && result?.summary) return `${result.summary} (${result.id}).`;
  if (name === "create_event" && result?.id) return `Created "${result.summary}" (${result.id}).`;
  if (name === "update_event" && result?.id) return `Updated ${result.id}.`;
  if (name === "delete_event" && result?.id) return `Deleted ${result.id}.`;
  if (name === "list_calendars" && Array.isArray(result?.calendars)) return `${result.calendars.length} calendars.`;
  if (name === "suggest_time" && Array.isArray(result?.suggestions)) return `${result.suggestions.length} suggestions.`;
  if (name === "respond_to_event" && result?.id) return `Responded ${result.response} on ${result.id}.`;
  return JSON.stringify(result ?? null);
}
