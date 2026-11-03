import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendarAdapter, dayBounds, moveStart } from "../src/calendar/mcp.js";

test("a day read lists that day's summaries and an update uses the given event id", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method === "tools/list" ? "list" : body.params.name);
    if (body.method === "tools/list") {
      return json({ result: { tools: [{ name: "list_events" }, { name: "create_event" }, { name: "update_event" }, { name: "get_event" }] } });
    }
    if (body.params.name === "get_event") {
      assert.equal(body.params.arguments.eventId, "launch-1");
      return json({ result: { structuredContent: {
        id: "launch-1",
        summary: "Launch review",
        start: { dateTime: "2026-11-03T07:00:00.000Z" },
        end: { dateTime: "2026-11-03T07:45:00.000Z" },
      } } });
    }
    if (body.params.name === "list_events") {
      return json({ result: { structuredContent: { events: [{ id: "toy-1", summary: "Sederunt review (throwaway)" }] } } });
    }
    assert.equal(body.params.arguments.eventId, "launch-1");
    assert.equal(body.params.arguments.startTime, "2026-11-03T09:00:00.000Z");
    assert.equal(body.params.arguments.endTime, "2026-11-03T09:45:00.000Z");
    assert.equal(body.params.arguments.timeZone, "Asia/Ho_Chi_Minh");
    assert.equal(body.params.arguments.fullText, undefined);
    return json({ result: { structuredContent: { id: "launch-1" } } });
  };
  const env = { CALENDAR_MCP_TOKEN: "token" };
  const calendar = createCalendarAdapter(env, { fetch: fetchImpl });
  const tools = await calendar.listTools();
  assert.equal(tools.find((tool) => tool.write)?.name, "update_event");
  const day = await calendar.readDay("Thursday");
  assert.deepEqual(day.events, ["Sederunt review (throwaway)"]);
  const read = await calendar.readEvent({ id: "launch-1", title: "Launch review" });
  assert.equal(read.start, "2026-11-03T07:00:00.000Z");
  assert.equal(read.end, "2026-11-03T07:45:00.000Z");
  assert.equal(read.timeZone, "Asia/Ho_Chi_Minh");
  const moved = await calendar.call("update_event", {
    id: "launch-1",
    start: "2026-11-03T09:00:00.000Z",
    end: "2026-11-03T09:45:00.000Z",
  });
  assert.equal(moved.id, "launch-1");
  const refused = await calendar.call("update_event", { name: "review", day: "Friday" });
  assert.equal(refused.id, "");
  assert.deepEqual(calls, ["list", "list_events", "get_event", "update_event"]);
});

test("Thursday in this week is the coming Thursday in Asia/Ho_Chi_Minh", () => {
  const bounds = dayBounds("Thursday", new Date("2026-10-27T02:00:00.000Z"));
  assert.equal(bounds.start, "2026-10-29T00:00:00+07:00");
  const moved = moveStart({
    start: "2026-10-29T03:00:00.000Z",
    end: "2026-10-29T03:30:00.000Z",
  }, "Friday");
  assert.equal(moved.start, "2026-10-30T03:00:00.000Z");
  assert.equal(moved.end, "2026-10-30T03:30:00.000Z");
});

test("an expired calendar token is refreshed before the day is read", async () => {
  const env = {
    CALENDAR_MCP_TOKEN: "stale",
    CALENDAR_OAUTH_EXPIRES_AT: "1",
    CALENDAR_OAUTH_CLIENT_ID: "client",
    CALENDAR_OAUTH_CLIENT_SECRET: "secret",
    CALENDAR_OAUTH_REFRESH_TOKEN: "refresh",
  };
  let saved = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "fresh", expires_in: 3600 }) };
    }
    assert.equal(init.headers.authorization, "Bearer fresh");
    return json({ result: { structuredContent: { events: [{ id: "1", summary: "Review" }] } } });
  };
  const day = await createCalendarAdapter(env, { fetch: fetchImpl, save() { saved += 1; } }).readDay("Friday");
  assert.equal(day.unavailable, false);
  assert.deepEqual(day.events, ["Review"]);
  assert.equal(env.CALENDAR_MCP_TOKEN, "fresh");
  assert.equal(saved, 1);
});

test("a rejected calendar refresh reports the day unavailable and does not throw", async () => {
  const env = {
    CALENDAR_MCP_TOKEN: "stale",
    CALENDAR_OAUTH_EXPIRES_AT: "1",
    CALENDAR_OAUTH_CLIENT_ID: "client",
    CALENDAR_OAUTH_CLIENT_SECRET: "secret",
    CALENDAR_OAUTH_REFRESH_TOKEN: "refresh",
  };
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => "{}" });
  const day = await createCalendarAdapter(env, { fetch: fetchImpl }).readDay("Friday");
  assert.equal(day.unavailable, true);
  assert.deepEqual(day.events, []);
});

function json(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}
