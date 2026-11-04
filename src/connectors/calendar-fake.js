import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const readNotes = { readOnlyHint: true, destructiveHint: false };
const writeNotes = { readOnlyHint: false, destructiveHint: false };
const deleteNotes = { readOnlyHint: false, destructiveHint: true };

const eventSchema = z.object({
  id: z.string(),
  summary: z.string(),
  start: z.object({ dateTime: z.string() }),
  end: z.object({ dateTime: z.string() }),
});

const listOutput = z.object({
  events: z.array(eventSchema),
});

/**
 * In-memory Calendar MCP for demos and tests. No network.
 * list_events and create_event rely on name rules. get_event, update_event,
 * and delete_event carry annotations.
 *
 * @param {{ events: Array<{ id: string, summary: string, start: { dateTime: string }, end: { dateTime: string } }>, seq: number }} state
 */
export function createCalendarMcpServer(state) {
  const server = new McpServer({ name: "sederunt-calendar", version: "0.0.0" });

  server.registerTool("list_events", {
    description: "List events on the calendar.",
    inputSchema: z.object({
      timeMin: z.string().optional(),
      timeMax: z.string().optional(),
      pageSize: z.number().optional(),
    }),
    outputSchema: listOutput,
  }, async () => toolResult("list_events", async () => ({ events: state.events.map(copyEvent) })));

  server.registerTool("get_event", {
    description: "Read one event.",
    inputSchema: z.object({ eventId: z.string() }),
    outputSchema: eventSchema,
    annotations: readNotes,
  }, async (args) => toolResult("get_event", async () => {
    const event = state.events.find((item) => item.id === String(args?.eventId || ""));
    if (!event) fail("not-found", "That meeting was not found.");
    return copyEvent(event);
  }));

  server.registerTool("create_event", {
    description: "Create an event.",
    inputSchema: z.object({
      summary: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }),
    outputSchema: eventSchema,
  }, async (args) => toolResult("create_event", async () => {
    const summary = String(args?.summary || "").trim();
    if (!summary) fail("invalid-argument", "Enter a title.");
    state.seq += 1;
    const event = {
      id: `fake-event-${state.seq}`,
      summary,
      start: { dateTime: String(args?.startTime || "2026-11-04T09:00:00+07:00") },
      end: { dateTime: String(args?.endTime || "2026-11-04T09:45:00+07:00") },
    };
    state.events.push(event);
    return copyEvent(event);
  }));

  server.registerTool("update_event", {
    description: "Update an event.",
    inputSchema: z.object({
      eventId: z.string(),
      summary: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }),
    outputSchema: eventSchema,
    annotations: writeNotes,
  }, async (args) => toolResult("update_event", async () => {
    const event = state.events.find((item) => item.id === String(args?.eventId || ""));
    if (!event) fail("not-found", "That meeting was not found.");
    if (typeof args?.summary === "string" && args.summary.trim()) event.summary = args.summary.trim();
    if (typeof args?.startTime === "string" && args.startTime) event.start = { dateTime: args.startTime };
    if (typeof args?.endTime === "string" && args.endTime) event.end = { dateTime: args.endTime };
    return copyEvent(event);
  }));

  server.registerTool("delete_event", {
    description: "Delete an event.",
    inputSchema: z.object({ eventId: z.string() }),
    outputSchema: z.object({ id: z.string(), deleted: z.boolean() }),
    annotations: deleteNotes,
  }, async (args) => toolResult("delete_event", async () => {
    const id = String(args?.eventId || "");
    const index = state.events.findIndex((item) => item.id === id);
    if (index < 0) fail("not-found", "That meeting was not found.");
    state.events.splice(index, 1);
    return { id, deleted: true };
  }));

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
  if (name === "list_events" && Array.isArray(result?.events)) {
    const count = result.events.length;
    const noun = count === 1 ? "1 event." : `${count} events.`;
    const title = result.events[0]?.summary;
    return title ? `${noun} ${title}.` : noun;
  }
  if (name === "get_event" && result?.summary) return `${result.summary} (${result.id}).`;
  if (name === "create_event" && result?.id) return `Created "${result.summary}" (${result.id}).`;
  if (name === "update_event" && result?.id) return `Updated ${result.id}.`;
  if (name === "delete_event" && result?.id) return `Deleted ${result.id}.`;
  return JSON.stringify(result ?? null);
}
