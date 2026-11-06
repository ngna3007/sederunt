import assert from "node:assert/strict";
import test from "node:test";
import { GOOGLE_CALENDAR_MCP_URL } from "../src/connectors/builtin-calendar.js";
import { createFakeCalendarMcp } from "../src/connectors/calendar-fake.js";
import { callTool, listTools } from "../src/connectors/client.js";
import { actionClassForTool } from "../src/connectors/tools.js";

const env = { SEDERUNT_CALENDAR_FAKE: "1" };

function target() {
  return {
    url: GOOGLE_CALENDAR_MCP_URL,
    preset: "google-calendar",
    calendarMcp: createFakeCalendarMcp(),
  };
}

function keysOf(tool) {
  return Object.keys(tool?.inputSchema?.properties || {});
}

test("fake calendar tools use the Google Calendar MCP names and inputs", async () => {
  const calls = [];
  const tools = await listTools({
    ...target(),
    env,
    fetch: async (url) => {
      calls.push(String(url));
      throw new Error("outside");
    },
  });
  assert.equal(calls.length, 0);
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  for (const name of [
    "list_events", "get_event", "list_calendars", "search_events", "suggest_time",
    "create_event", "update_event", "delete_event", "respond_to_event",
  ]) {
    assert.ok(byName[name], name);
  }
  for (const key of ["calendarId", "startTime", "endTime", "pageSize", "pageToken", "query", "eventType"]) {
    assert.ok(keysOf(byName.list_events).includes(key), key);
  }
  assert.ok(keysOf(byName.get_event).includes("calendarId"));
  assert.ok(keysOf(byName.get_event).includes("eventId"));
  assert.ok(keysOf(byName.search_events).includes("query"));
  assert.ok(keysOf(byName.search_events).includes("startTime"));
  assert.ok(keysOf(byName.search_events).includes("endTime"));
  for (const key of ["attendees", "calendarIds", "startTime", "endTime", "durationMinutes"]) {
    assert.ok(keysOf(byName.suggest_time).includes(key), key);
  }
  for (const key of ["calendarId", "summary", "startTime", "endTime", "description", "attendees", "location"]) {
    assert.ok(keysOf(byName.create_event).includes(key), key);
  }
  assert.ok(keysOf(byName.update_event).includes("calendarId"));
  assert.ok(keysOf(byName.update_event).includes("eventId"));
  assert.ok(keysOf(byName.update_event).includes("summary"));
  assert.ok(keysOf(byName.delete_event).includes("calendarId"));
  assert.ok(keysOf(byName.delete_event).includes("eventId"));
  for (const key of ["calendarId", "eventId", "response"]) {
    assert.ok(keysOf(byName.respond_to_event).includes(key), key);
  }
  assert.equal(actionClassForTool("list_calendars", {}), "read");
  assert.equal(actionClassForTool("search_events", {}), "read");
  assert.equal(actionClassForTool("suggest_time", {}), "read");
  assert.equal(actionClassForTool("respond_to_event", {}), "write");
  assert.equal(actionClassForTool("delete_event", {}), "delete");
  assert.equal(byName.list_events.annotations?.readOnlyHint, undefined);
  assert.equal(byName.suggest_time.annotations?.readOnlyHint, undefined);
  assert.equal(byName.delete_event.annotations?.destructiveHint, true);
});

test("zoneless ISO times work and unknown arguments match Google's error", async () => {
  const calls = [];
  const mcp = target();
  const options = {
    env,
    fetch: async (url) => {
      calls.push(String(url));
      throw new Error("outside");
    },
  };
  const listed = await callTool(mcp, "list_events", {
    calendarId: "primary",
    startTime: "2026-11-04T00:00:00",
    endTime: "2026-11-04T12:00:00",
    pageSize: 5,
    query: "Launch",
    eventType: "default",
  }, options);
  assert.equal(listed.ok, true, listed.text || listed.message);
  assert.equal(listed.structuredContent.events[0].id, "launch-review");
  assert.equal(listed.structuredContent.events[0].summary, "Launch review");

  const unknown = await callTool(mcp, "list_events", { timeMin: "2026-11-04T00:00:00Z" }, options);
  assert.equal(unknown.isError, true);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.text, 'Unknown name "timeMin", Cannot find field.');
  assert.equal(unknown.message, 'Unknown name "timeMin", Cannot find field.');

  const found = await callTool(mcp, "get_event", { calendarId: "primary", eventId: "launch-review" }, options);
  assert.equal(found.ok, true, found.message);
  assert.equal(found.structuredContent.summary, "Launch review");

  const calendars = await callTool(mcp, "list_calendars", {}, options);
  assert.equal(calendars.ok, true, calendars.message);
  assert.equal(calendars.structuredContent.calendars[0].id, "primary");

  const searched = await callTool(mcp, "search_events", {
    query: "Launch",
    startTime: "2026-11-04T00:00:00",
    endTime: "2026-11-04T12:00:00",
  }, options);
  assert.equal(searched.structuredContent.events[0].id, "launch-review");

  const suggested = await callTool(mcp, "suggest_time", {
    attendees: ["ada@example.com"],
    calendarIds: ["primary"],
    startTime: "2026-11-04T09:00:00",
    endTime: "2026-11-04T12:00:00",
    durationMinutes: 30,
  }, options);
  assert.equal(suggested.ok, true, suggested.message);
  assert.equal(suggested.structuredContent.suggestions[0].durationMinutes, 30);

  const created = await callTool(mcp, "create_event", {
    calendarId: "primary",
    summary: "Design crit",
    startTime: "2026-11-04T10:00:00",
    endTime: "2026-11-04T10:30:00",
    description: "Notes",
    attendees: ["ada@example.com"],
    location: "Room 2",
  }, options);
  assert.equal(created.ok, true, created.message);
  assert.equal(created.structuredContent.summary, "Design crit");
  assert.match(created.structuredContent.id, /^fake-event-/);
  assert.equal(created.structuredContent.start.dateTime, "2026-11-04T10:00:00");

  const updated = await callTool(mcp, "update_event", {
    calendarId: "primary",
    eventId: created.structuredContent.id,
    summary: "Design crit moved",
  }, options);
  assert.equal(updated.structuredContent.summary, "Design crit moved");

  const responded = await callTool(mcp, "respond_to_event", {
    calendarId: "primary",
    eventId: "launch-review",
    response: "accepted",
  }, options);
  assert.equal(responded.ok, true, responded.message);
  assert.equal(responded.structuredContent.response, "accepted");

  const removed = await callTool(mcp, "delete_event", { calendarId: "primary", eventId: "launch-review" }, options);
  assert.equal(removed.ok, true, removed.message);
  assert.equal(removed.structuredContent.deleted, true);
  assert.equal(removed.structuredContent.id, "launch-review");
  assert.equal(calls.length, 0);
});
