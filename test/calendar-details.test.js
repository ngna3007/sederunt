import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { CalendarError, validateEventUpdate } from "../src/calendar/validate.js";

const NOW = new Date("2026-11-04T02:00:00.000Z");

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
}

function eventBody(extra = {}) {
  return {
    id: "launch-review",
    summary: "Launch review",
    description: "Walk the checklist.",
    start: { dateTime: "2026-11-04T02:00:00.000Z" },
    end: { dateTime: "2026-11-04T02:45:00.000Z" },
    attendees: [
      { email: "ada@example.com", displayName: "Ada Lovelace", responseStatus: "accepted", organizer: true },
      { email: "mina@example.com", displayName: "Mina Chen", responseStatus: "tentative" },
    ],
    ...extra,
  };
}

test("guest updates trim, check, and dedupe emails and keep the organizer", () => {
  const current = {
    attendees: [
      { email: "Ada@Example.com", name: "Ada Lovelace", organizer: true },
      { email: "mina@example.com", name: "Mina Chen" },
    ],
  };
  const next = validateEventUpdate({
    description: "  Notes  ",
    attendees: ["  Ada@Example.com ", "mina@example.com", "MINA@example.com", { email: " grace@example.com " }],
    sendUpdates: "all",
    current,
  });
  assert.equal(next.description, "  Notes  ");
  assert.deepEqual(next.attendees.map((guest) => guest.email), ["Ada@Example.com", "mina@example.com", "grace@example.com"]);
  assert.equal(next.attendees[0].organizer, true);
  assert.equal(next.attendees[0].name, "Ada Lovelace");
  assert.equal(next.sendUpdates, "all");

  assert.throws(
    () => validateEventUpdate({ description: "", attendees: ["not-an-email"], sendUpdates: "none", current }),
    (error) => error instanceof CalendarError && error.code === "invalid-email",
  );
  assert.throws(
    () => validateEventUpdate({ description: "", attendees: ["mina@example.com"], sendUpdates: "all", current }),
    (error) => error instanceof CalendarError && error.code === "organizer" && /organizer/i.test(error.message),
  );
  assert.throws(
    () => validateEventUpdate({ description: "x".repeat(8001), attendees: ["Ada@Example.com"], sendUpdates: "none", current }),
    (error) => error instanceof CalendarError && error.code === "invalid-description",
  );
  const many = ["Ada@Example.com", ...Array.from({ length: 100 }, (_, index) => `g${index}@example.com`)];
  assert.throws(
    () => validateEventUpdate({ description: "", attendees: many, sendUpdates: "all", current }),
    (error) => error instanceof CalendarError && error.code === "too-many",
  );
});

test("update_event sends the Calendar MCP shape: only changes, attendee diff, notificationLevel", async () => {
  const sent = [];
  const reads = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.params?.name === "get_event") {
      reads.push(body.params.arguments);
      return json({ result: { structuredContent: eventBody() } });
    }
    assert.equal(body.params.name, "update_event");
    sent.push(body.params.arguments);
    return json({ result: { structuredContent: { id: "launch-review" } } });
  };
  const calendar = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, { fetch: fetchImpl });
  const saved = await calendar.updateEventDetails({
    id: "launch-review",
    description: "Ship after the checklist.",
    attendees: ["ada@example.com", "Mina@Example.com", { email: "quang@example.com", name: "Quang Tran" }],
    sendUpdates: "none",
  });
  // get_event takes only eventId (and calendarId).
  assert.deepEqual(reads[0], { eventId: "launch-review" });
  assert.deepEqual(sent, [{
    eventId: "launch-review",
    description: "Ship after the checklist.",
    addedAttendees: [{ email: "quang@example.com", displayName: "Quang Tran" }],
    notificationLevel: "NONE",
  }]);
  assert.equal(saved.description, "Ship after the checklist.");
  assert.equal(saved.changed, true);
  assert.equal(saved.attendees.find((guest) => guest.email === "ada@example.com").organizer, true);

  sent.length = 0;
  await calendar.updateEventDetails({
    id: "launch-review",
    description: "Walk the checklist.",
    attendees: ["ada@example.com"],
    sendUpdates: "all",
  });
  assert.deepEqual(sent, [{
    eventId: "launch-review",
    removedAttendeeEmails: ["mina@example.com"],
    notificationLevel: "ALL",
  }]);

  sent.length = 0;
  const unchanged = await calendar.updateEventDetails({
    id: "launch-review",
    description: "Walk the checklist.",
    attendees: ["ADA@example.com", "mina@EXAMPLE.com"],
    sendUpdates: "all",
  });
  assert.deepEqual(sent, [], "nothing changed, so no write and no guest email");
  assert.equal(unchanged.description, "Walk the checklist.");
  assert.equal(unchanged.changed, false, "an unchanged save reports no change");
});

test("get_event parsing: all-day dates, an organizer outside attendees, and events we cannot edit", async () => {
  let reply = eventBody();
  const calendar = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, {
    fetch: async () => json({ result: { structuredContent: reply } }),
  });
  reply = eventBody({
    start: { date: "2026-11-04T00:00:00Z" },
    end: { date: "2026-11-05T00:00:00Z" },
    organizer: { email: "lead@example.com", displayName: "Lead", self: true },
    attendees: [{ email: "mina@example.com", displayName: "Mina Chen", optionalAttendee: true }],
  });
  const allDay = await calendar.readEventDetails("launch-review");
  assert.equal(allDay.start, "2026-11-04T00:00:00.000Z");
  assert.equal(allDay.end, "2026-11-05T00:00:00.000Z");
  assert.deepEqual(allDay.attendees.map((guest) => [guest.email, guest.name, guest.organizer === true]), [
    ["lead@example.com", "Lead", true],
    ["mina@example.com", "Mina Chen", false],
  ]);
  assert.equal(allDay.readOnly, false);

  reply = eventBody({ organizer: { email: "boss@example.com", self: false } });
  assert.equal((await calendar.readEventDetails("launch-review")).readOnly, true);
  reply = eventBody({ organizer: { email: "boss@example.com", self: false }, guestPermissions: { guestsCanModify: true } });
  assert.equal((await calendar.readEventDetails("launch-review")).readOnly, false);
  reply = eventBody({ attendees: [
    { email: "ada@example.com", organizer: true },
    { email: "me@example.com", self: true },
  ] });
  assert.equal((await calendar.readEventDetails("launch-review")).readOnly, true);
});

test("get_event falls back to list_events and a missing token is not-connected", async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.params.name === "get_event") return json({ error: { code: 404, message: "missing" } }, 404);
    assert.equal(body.params.name, "list_events");
    return json({ result: { structuredContent: { events: [eventBody({ id: "launch-review" })] } } });
  };
  const calendar = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, { fetch: fetchImpl });
  const event = await calendar.readEventDetails("launch-review");
  assert.equal(event.title, "Launch review");
  assert.equal(event.description, "Walk the checklist.");
  assert.equal(event.attendees[0].email, "ada@example.com");
  assert.equal(event.attendees[0].organizer, true);
  assert.equal(event.attendees[1].responseStatus, "tentative");

  const offline = createCalendarAdapter({}, { fetch: async () => { throw new Error("network"); } });
  await assert.rejects(() => offline.readEventDetails("launch-review"), (error) => error.code === "not-connected");
  await assert.rejects(
    () => calendar.readEventDetails("missing-event"),
    (error) => error.code === "not-found",
  );
});

test("a refused calendar write is forbidden and a dropped connection is network", async () => {
  const forbidden = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, {
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.params.name === "get_event") return json({ result: { structuredContent: eventBody() } });
      return json({ error: { message: "no" } }, 403);
    },
  });
  await assert.rejects(
    () => forbidden.updateEventDetails({
      id: "launch-review",
      description: "x",
      attendees: ["ada@example.com"],
      sendUpdates: "all",
    }),
    (error) => error.code === "forbidden",
  );
  const down = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, {
    fetch: async () => { throw new Error("socket"); },
  });
  await assert.rejects(() => down.readEventDetails("launch-review"), (error) => error.code === "network");
});

test("fake calendar serves today's meetings and rejects a read-only write without the network", async () => {
  let fetched = 0;
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_CALENDAR_FAKE: "1" };
  const calendar = createCalendarAdapter(env, {
    now: NOW,
    fetch: async () => {
      fetched += 1;
      throw new Error("network");
    },
  });
  const listed = await calendar.listUpcoming();
  assert.ok(listed.length >= 3);
  assert.ok(listed.some((event) => event.id === "launch-review" && event.title === "Launch review"));
  assert.ok(listed.some((event) => event.id === "board-readout" && event.readOnly === true));
  const launch = await calendar.readEventDetails("launch-review");
  assert.ok(launch.attendees.length >= 2 && launch.attendees.length <= 5);
  assert.equal(launch.attendees.some((guest) => guest.organizer), true);
  assert.match(launch.description, /checklist/i);
  const saved = await calendar.updateEventDetails({
    id: "launch-review",
    description: "Updated in the demo.",
    attendees: launch.attendees.map((guest) => guest.email).concat(["New@Example.com", "new@example.com"]),
    sendUpdates: "none",
  });
  assert.equal(saved.description, "Updated in the demo.");
  assert.equal(saved.attendees.filter((guest) => guest.email.toLowerCase() === "new@example.com").length, 1);
  assert.deepEqual(calendar.calls.at(-1), {
    name: "update_event",
    arguments: {
      eventId: "launch-review",
      description: "Updated in the demo.",
      addedAttendees: [{ email: "New@Example.com" }],
      notificationLevel: "NONE",
    },
  });
  await assert.rejects(
    () => calendar.updateEventDetails({
      id: "board-readout",
      description: "nope",
      attendees: ["ada@example.com"],
      sendUpdates: "all",
    }),
    (error) => error.code === "read-only",
  );
  const moved = await calendar.call("update_event", {
    id: "design-crit",
    start: "2026-11-05T07:00:00.000Z",
    end: "2026-11-05T08:00:00.000Z",
  });
  assert.equal(moved.id, "design-crit");
  const again = await calendar.readEvent({ id: "design-crit" });
  assert.equal(again.start, "2026-11-05T07:00:00.000Z");
  assert.equal(fetched, 0);

  const quiet = createCalendarAdapter({ SEDERUNT_AUTH_FAKE: "1", SEDERUNT_CALENDAR_FAKE: "0" }, { fetch: async () => json({ result: {} }) });
  assert.equal(quiet.endpoint.startsWith("https://"), true);

  const disconnected = createCalendarAdapter({ SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_CALENDAR_FAKE_CONNECTED: "0" }, { now: NOW });
  await assert.rejects(() => disconnected.readEventDetails("launch-review"), (error) => error.code === "not-connected");
  const still = await disconnected.listUpcoming();
  assert.ok(still.some((event) => event.id === "customer-sync"));
});
