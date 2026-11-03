import assert from "node:assert/strict";
import test from "node:test";
import { activityEvent } from "../src/activity.js";
import { replayPlan, replaySupported, runReplay, toUtcIso } from "../src/activity-replay.js";
import { formatActivitySentence, groupActivity } from "../src/activity-feed.js";
import { companyBoard, handleUtterance, replayFailure, undoRecorded } from "../src/typed-path.js";
import { rebuildCompanyIndex } from "../src/typed-path.js";
import { createSession } from "../src/session.js";

const observed = { start: "2026-11-03T15:00:00.000Z", end: "2026-11-03T16:00:00.000Z", timeZone: "Asia/Ho_Chi_Minh" };

function event(system, verb, changes, id = "T-1") {
  return {
    verb,
    target: { system, id, title: "Order booth banner", channel: system === "slack" ? "C0123DEMO1" : "" },
    changes,
    origin: { roomName: "#sederunt-demo" },
  };
}

test("each replay row calls its own method and an unknown pair never creates an issue", async () => {
  const calls = [];
  const linear = {
    async updateIssue(args) { calls.push(["updateIssue", args]); return { id: args.id }; },
    async addLabel(args) { calls.push(["addLabel", args]); return { id: args.id }; },
    async removeLabel(args) { calls.push(["removeLabel", args]); return { id: args.id }; },
    async assignIssue(args) { calls.push(["assignIssue", args]); return { id: args.id }; },
    async unassignIssue(args) { calls.push(["unassignIssue", args]); return { id: args.id }; },
    async createIssue(args) { calls.push(["createIssue", args]); return { id: "NO" }; },
  };
  const calendar = {
    async call(name, args) { calls.push([name, args]); return { id: "evt" }; },
  };
  const slack = {
    async postMessage(args) { calls.push(["postMessage", args]); return { id: "msg" }; },
  };
  const rows = [
    ["linear", "move", [{ field: "status", from: "Backlog", to: "Todo" }], "undo", "updateIssue", { state: "Backlog" }],
    ["linear", "label", [{ field: "label", to: "design" }], "undo", "removeLabel", { label: "design" }],
    ["linear", "assign", [{ field: "assignee", from: "Mina", to: "Rowan" }], "undo", "assignIssue", { assignee: "Mina" }],
    ["linear", "assign", [{ field: "assignee", from: "", to: "Rowan" }], "undo", "unassignIssue", {}],
    ["calendar", "reschedule", [{ field: "start", from: "2026-11-03T14:00:00.000Z", to: "4:00 PM" }], "undo", "update_event", {}],
    ["slack", "post", [], "replay", "postMessage", {}],
  ];
  for (const [system, verb, changes, direction, method] of rows) {
    calls.length = 0;
    const plan = replayPlan(event(system, verb, changes), direction, observed);
    assert.equal(plan.ok, true, `${system} ${verb} ${direction}`);
    assert.equal(plan.method, method);
    await runReplay({ linear, calendar, slack }, plan);
    assert.equal(calls.some((call) => call[0] === "createIssue"), false, `${system} ${verb}`);
    assert.equal(calls[0][0], method);
  }
  const slackUndo = replayPlan(event("slack", "post", []), "undo", observed);
  assert.equal(slackUndo.reason, "unsupported");
  const unknown = replayPlan(event("linear", "comment", []), "undo", observed);
  assert.equal(unknown.reason, "unsupported");
  assert.equal(calls.some((call) => call[0] === "createIssue"), false);
});

test("a clock uses Asia/Ho_Chi_Minh and keeps the event's duration", () => {
  const replay = replayPlan({
    verb: "reschedule",
    target: { system: "calendar", id: "evt-1", title: "Launch review" },
    changes: [{ field: "start", from: "2:00 PM", to: "4 PM" }],
  }, "replay", {
    start: "2026-11-03T07:00:00.000Z",
    end: "2026-11-03T07:45:00.000Z",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.args.start, "2026-11-03T09:00:00.000Z");
  assert.equal(replay.args.end, "2026-11-03T09:45:00.000Z");
  assert.equal(replay.args.timeZone, "Asia/Ho_Chi_Minh");
  const undo = replayPlan({
    verb: "move",
    target: { system: "calendar", id: "evt-1", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "4 PM" }],
  }, "undo", {
    start: "2026-11-03T09:00:00.000Z",
    end: "2026-11-03T10:00:00.000Z",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  assert.equal(undo.args.start, "2026-11-03T07:00:00.000Z");
  assert.equal(undo.args.end, "2026-11-03T08:00:00.000Z");
});

test("a linear create replays with its idempotency key and a slack post has no undo", () => {
  const plan = replayPlan({
    id: "fail-1",
    requestId: "req-1",
    verb: "create",
    target: { system: "linear", title: "Order booth banner" },
  }, "replay");
  assert.equal(plan.method, "createIssue");
  assert.equal(plan.args.idempotencyKey, "req-1");
  assert.equal(plan.args.title, "Order booth banner");
  assert.equal(replayPlan({
    requestId: "req-1",
    verb: "create",
    target: { system: "linear", title: "Order booth banner" },
  }, "undo").reason, "unsupported");
  assert.equal(replaySupported({ verb: "post", target: { system: "slack" } }, "undo"), false);
  assert.equal(replaySupported({ verb: "create", target: { system: "linear" } }, "replay"), true);
});

test("viewer times drop the raw instant and markers are not feed rows", () => {
  assert.equal(
    formatActivitySentence(
      "Sederunt moved Design crit from 2026-11-03T07:00:00.000Z to 2026-11-03T08:00:00.000Z on Google Calendar via MCP",
      "Asia/Ho_Chi_Minh",
    ),
    "Sederunt moved Design crit from 2:00 PM to 3:00 PM on Google Calendar via MCP",
  );
  assert.equal(
    formatActivitySentence("from 2026-11-03T16:00:00.000Z to 2026-11-03T18:30:00.000Z", "Asia/Ho_Chi_Minh"),
    "from Nov 3, 11:00 PM to Nov 4, 1:30 AM",
  );
  const groups = groupActivity([
    { id: "a", requestId: "r", kind: "action", ts: "2026-11-03T08:00:00.000Z" },
    { id: "s", requestId: "r", kind: "resolve", ts: "2026-11-03T09:00:00.000Z" },
    { id: "u", requestId: "r", kind: "supersede" },
  ]);
  assert.deepEqual(groups[0].rows.map((row) => row.id), ["a"]);
});

test("an offset instant is stored as UTC and rendered in the calendar zone", () => {
  assert.equal(toUtcIso("2026-11-03T14:00:00+07:00"), "2026-11-03T07:00:00.000Z");
  const stored = activityEvent({
    verb: "move",
    actor: { name: "Sederunt", type: "sederunt" },
    target: { system: "calendar", title: "Design crit" },
    changes: [{ field: "start", from: "2026-11-03T14:00:00+07:00", to: "4:00 PM" }],
  });
  assert.equal(stored.changes[0].from, "2026-11-03T07:00:00.000Z");
  assert.equal(stored.changes[0].to, "4:00 PM");
  const shown = formatActivitySentence(
    "Sederunt moved Design crit from 2026-11-03T14:00:00+07:00 to 2026-11-03T09:00:00.000Z on Google Calendar",
    "Asia/Ho_Chi_Minh",
    "UTC",
  );
  assert.match(shown, /from 2:00 PM to 4:00 PM/);
  assert.doesNotMatch(shown, /\+07:00/);
  assert.match(shown, /GMT\+7|ICT/);
});

test("Asia/Saigon matches Asia/Ho_Chi_Minh so a +07 viewer sees no zone label", () => {
  const shown = formatActivitySentence(
    "Sederunt moved Design crit from 2026-11-03T07:00:00.000Z to 2026-11-03T09:00:00.000Z on Google Calendar",
    "Asia/Ho_Chi_Minh",
    "Asia/Saigon",
  );
  assert.match(shown, /from 2:00 PM to 4:00 PM/);
  assert.doesNotMatch(shown, /GMT\+7|ICT|UTC/);
});

test("a retried create keeps the issue id and a stale retry is refused", async () => {
  const previous = process.env.SEDERUNT_PUBLIC_ORIGIN;
  process.env.SEDERUNT_PUBLIC_ORIGIN = "https://ignored.example";
  const session = createSession();
  const { logFailure, logAction } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-create",
    requestId: "req-create",
    actor: { type: "person", name: "Mina" },
    verb: "create",
    target: { system: "linear", type: "issue", title: "Reserve booth power" },
    origin: { roomId: "booth", roomName: "Booth planning", at: 22 },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const created = await replayFailure(session, {
    app: { origin: "https://sederunt.example", timeZone: "Asia/Ho_Chi_Minh", linearTeam: "ENG", linearWorkspace: "" },
    linear: {
      async createIssue(input) {
        assert.match(input.description, /From Booth planning/);
        assert.match(input.description, /Mina/);
        assert.match(input.description, /https:\/\/sederunt\.example\/console\/rooms\/booth#t=22/);
        return { id: "ROW-146", identifier: "ROW-146", url: "https://linear.app/issue/ROW-146" };
      },
    },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-create");
  assert.equal(created.ok, true);
  const filed = session.activity.find((row) => row.kind === "action" && row.verb === "create");
  assert.equal(filed.target.id, "ROW-146");
  assert.equal(filed.target.url, "https://linear.app/issue/ROW-146");
  const calls = [];
  logFailure(session, {
    id: "fail-old",
    requestId: "req-old",
    ts: "2026-11-03T08:00:00.000Z",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "move",
    target: { system: "calendar", type: "event", id: "evt-1", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "4:00 PM" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act-new",
    requestId: "req-new",
    ts: "2026-11-03T11:00:00.000Z",
    actor: { type: "person", name: "Mina" },
    verb: "move",
    target: { system: "calendar", type: "event", id: "evt-1", title: "Design crit" },
    changes: [{ field: "start", from: "4:00 PM", to: "2:00 PM" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const stale = await replayFailure(session, {
    calendar: { async call(...args) { calls.push(args); return { id: "evt-1" }; }, async readEvent() { return null; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-old");
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale");
  assert.equal(calls.length, 0);
  assert.equal(session.activity.find((row) => row.id === "act-new").undo.available, true);
  if (previous === undefined) delete process.env.SEDERUNT_PUBLIC_ORIGIN;
  else process.env.SEDERUNT_PUBLIC_ORIGIN = previous;
});

test("a slack retry records the timestamp and a second click does not post again", async () => {
  const session = createSession();
  const { logFailure } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-slack",
    requestId: "req-slack",
    actor: { type: "person", name: "Mina" },
    verb: "post",
    target: { system: "slack", type: "message", title: "Booth notes", channel: "C0123" },
    changes: [{ field: "body", to: "The booth opens at nine." }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const posts = [];
  const deps = {
    slack: {
      async postMessage(input) {
        posts.push(input);
        return { ok: true, channel: "C0123", ts: "1710000000.000100" };
      },
    },
    memory: { async remember() { return { blobId: null }; } },
  };
  const first = await replayFailure(session, deps, "fail-slack");
  assert.equal(first.ok, true);
  const filed = session.activity.find((row) => row.kind === "action" && row.verb === "post");
  assert.equal(filed.target.id, "1710000000.000100");
  assert.equal(filed.target.url, "https://slack.com/archives/C0123/p1710000000000100");
  assert.equal(session.activity.find((row) => row.id === "fail-slack").resolved, true);
  const second = await replayFailure(session, deps, "fail-slack");
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].channel, "C0123");
});

test("a slack refusal is recorded so the row changes", async () => {
  const session = createSession();
  const { logFailure } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-slack",
    requestId: "req-slack",
    actor: { type: "person", name: "Mina" },
    verb: "post",
    target: { system: "slack", type: "message", title: "Booth notes", channel: "C0123" },
    changes: [{ field: "body", to: "The booth opens at nine." }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const result = await replayFailure(session, {
    slack: { async postMessage() { return { ok: false, error: "channel_not_found" }; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-slack");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "failed");
  const logged = session.activity.find((row) => row.id === result.id);
  assert.equal(logged.kind, "failure");
  assert.match(logged.error, /channel_not_found/);
});

test("a newer comment or status move does not stale a failed assign", async () => {
  const session = createSession();
  const { logFailure, logAction } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-assign",
    requestId: "req-assign",
    ts: "2026-11-03T08:00:00.000Z",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power" },
    changes: [{ field: "assignee", from: "", to: "Mina" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act-comment",
    requestId: "req-comment",
    ts: "2026-11-03T09:00:00.000Z",
    actor: { type: "person", name: "Mina" },
    verb: "comment",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power" },
    changes: [{ field: "body", to: "Still open." }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act-status",
    requestId: "req-status",
    ts: "2026-11-03T10:00:00.000Z",
    actor: { type: "person", name: "Mina" },
    verb: "move",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power" },
    changes: [{ field: "state", from: "Todo", to: "Done" }],
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const calls = [];
  const open = await replayFailure(session, {
    linear: { async assignIssue(input) { calls.push(input); return { id: "ROW-127", identifier: "ROW-127" }; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-assign");
  assert.equal(open.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(session.activity.find((row) => row.id === "act-status").undo.available, true);
  logFailure(session, {
    id: "fail-assign-2",
    requestId: "req-assign-2",
    ts: "2026-11-03T11:00:00.000Z",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power" },
    changes: [{ field: "assignee", from: "", to: "Theo" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act-assign-new",
    requestId: "req-assign-new",
    ts: "2026-11-03T12:00:00.000Z",
    actor: { type: "person", name: "Mina" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power" },
    changes: [{ field: "assignee", from: "Mina", to: "Rowan" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const stale = await replayFailure(session, {
    linear: { async assignIssue() { throw new Error("should not assign"); } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-assign-2");
  assert.equal(stale.reason, "stale");
  assert.equal(session.activity.find((row) => row.id === "act-assign-new").undo.available, true);
});

test("a restart keeps a retried failure and an undone action", async () => {
  const docs = [
    { activity: { id: "fail-1", requestId: "r", kind: "failure", verb: "move", target: { system: "calendar", id: "", title: "Design crit" }, origin: { roomId: "design" }, outcome: "failed", error: "read-only", changes: [], actor: { name: "Sederunt", type: "sederunt" }, tool: { name: "act", server: "sederunt-mcp" } } },
    { activity: { id: "resolve-1", requestId: "r", kind: "resolve", refersTo: "fail-1", verb: "move", target: { system: "calendar", id: "", title: "Design crit" }, origin: { roomId: "design" }, outcome: "ok", changes: [], actor: { name: "Sederunt", type: "sederunt" }, tool: { name: "act", server: "sederunt-mcp" } } },
    { activity: { id: "act-1", requestId: "r2", kind: "action", verb: "assign", target: { system: "linear", id: "ABC-1", title: "Banner" }, origin: { roomId: "booth" }, outcome: "ok", undo: { available: true, until: "2099-01-01T00:00:00.000Z" }, changes: [], actor: { name: "Sederunt", type: "sederunt" }, tool: { name: "act", server: "sederunt-mcp" } } },
    { activity: { id: "undo-1", requestId: "r2", kind: "undo", undoOf: "act-1", verb: "assign", target: { system: "linear", id: "ABC-1", title: "Banner" }, origin: { roomId: "booth" }, outcome: "undone", changes: [], actor: { name: "Rowan", type: "person" }, tool: { name: "act", server: "sederunt-mcp" } } },
  ];
  const session = createSession();
  await rebuildCompanyIndex(session, { memory: { async index() { return docs; }, async recall() { return docs; } } });
  assert.equal(session.activity.find((row) => row.id === "fail-1").resolved, true);
  assert.equal(session.activity.find((row) => row.id === "act-1").outcome, "undone");
  assert.equal(session.activity.find((row) => row.id === "act-1").undo.available, false);
});

test("a zone label is added only after a rendered time", () => {
  const error = formatActivitySentence(
    "Sederunt couldn't move Launch review: Google Calendar timed out",
    "Asia/Ho_Chi_Minh",
    "UTC",
    "2026-11-03T09:00:00.000Z",
  );
  assert.equal(error, "Sederunt couldn't move Launch review: Google Calendar timed out");
  const undone = formatActivitySentence(
    "Mina undid rescheduling Launch review on Google Calendar via MCP",
    "Asia/Ho_Chi_Minh",
    "UTC",
  );
  assert.doesNotMatch(undone, /GMT\+7|ICT/);
  const timed = formatActivitySentence(
    "Sederunt moved Launch review from 2:00 PM to 4:00 PM on Google Calendar via MCP",
    "Asia/Ho_Chi_Minh",
    "UTC",
    "2026-11-03T09:00:00.000Z",
  );
  assert.match(timed, /4:00 PM GMT\+7|4:00 PM ICT/);
  assert.doesNotMatch(timed, /MCP GMT\+7|MCP ICT/);
});

test("a create replaces the previous target url instead of keeping it", async () => {
  const session = createSession();
  const { logFailure } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-create",
    requestId: "req-create",
    actor: { type: "person", name: "Mina" },
    verb: "create",
    target: { system: "linear", type: "issue", title: "Reserve booth power", url: "https://linear.app/old/issue/ROW-1" },
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  await replayFailure(session, {
    app: { linearWorkspace: "" },
    linear: { async createIssue() { return { id: "ROW-200", identifier: "ROW-200" }; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-create");
  const filed = session.activity.find((row) => row.kind === "action" && row.verb === "create");
  assert.equal(filed.target.id, "ROW-200");
  assert.equal(filed.target.url, "");
});

test("undo inverts every field or refuses when one cannot", async () => {
  const calls = [];
  const linear = {
    async updateIssue(args) { calls.push(["updateIssue", args]); return { id: "ROW-1" }; },
    async assignIssue(args) { calls.push(["assignIssue", args]); return { id: "ROW-1" }; },
  };
  const memory = { async remember() { return { blobId: null }; } };
  const session = createSession();
  const { logAction } = await import("../src/activity.js");
  logAction(session, {
    id: "act-multi",
    verb: "move",
    actor: { type: "sederunt", name: "Sederunt" },
    target: { system: "linear", type: "issue", id: "ROW-1", title: "Demo laptop images" },
    changes: [
      { field: "status", from: "Backlog", to: "Todo" },
      { field: "assignee", from: "Priya", to: "Tomas" },
    ],
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const undone = await undoRecorded(session, { linear, memory }, "act-multi", "Mina");
  assert.equal(undone.ok, true);
  assert.deepEqual(calls, [
    ["updateIssue", { id: "ROW-1", state: "Backlog" }],
    ["assignIssue", { id: "ROW-1", assignee: "Priya" }],
  ]);
  calls.length = 0;
  logAction(session, {
    id: "act-bad",
    verb: "move",
    actor: { type: "sederunt", name: "Sederunt" },
    target: { system: "linear", type: "issue", id: "ROW-1", title: "Demo laptop images" },
    changes: [
      { field: "status", from: "Backlog", to: "Todo" },
      { field: "priority", from: "Low", to: "High" },
    ],
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const refused = await undoRecorded(session, { linear, memory }, "act-bad", "Mina");
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "unsupported");
  assert.equal(calls.length, 0);
});

test("an assign retry keeps the same issue url", async () => {
  const session = createSession();
  const { logFailure } = await import("../src/activity.js");
  const url = "https://linear.app/acme/issue/ROW-127";
  logFailure(session, {
    id: "fail-assign",
    requestId: "req-assign",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-127", title: "Booth power", url },
    changes: [{ field: "assignee", from: "", to: "Mina" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  await replayFailure(session, {
    linear: { async assignIssue() { return { id: "ROW-127", identifier: "ROW-127" }; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-assign");
  const filed = session.activity.find((row) => row.kind === "action" && row.verb === "assign");
  assert.equal(filed.target.url, url);
});

test("a legacy retry without retryOf is already retried", async () => {
  const session = createSession();
  const { logFailure, logAction } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-legacy",
    requestId: "req-legacy",
    ts: "2026-11-03T08:00:00.000Z",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-140", title: "Labels" },
    changes: [{ field: "assignee", to: "Mina" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act-legacy",
    requestId: "req-legacy",
    ts: "2026-11-03T09:00:00.000Z",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ROW-140", title: "Labels" },
    changes: [{ field: "assignee", to: "Mina" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const calls = [];
  const again = await replayFailure(session, {
    linear: { async assignIssue() { calls.push("assign"); return { id: "ROW-140" }; } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-legacy");
  assert.equal(again.reason, "already");
  assert.equal(calls.length, 0);
});

test("a slack failure with no channel hides retry, and a #name post stores the id", async () => {
  const session = createSession();
  const { logFailure } = await import("../src/activity.js");
  logFailure(session, {
    id: "fail-bare",
    requestId: "req-bare",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "post",
    target: { system: "slack", type: "message", title: "Booth notes" },
    changes: [{ field: "body", to: "Hello" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  session.rooms.push({ id: "booth", name: "Booth planning", platform: "Google Meet" });
  session.decisions.push({
    id: "d-booth",
    account: "company",
    kind: "decision",
    text: "Kept.",
    roomId: "booth",
    inviteMemberIds: ["mina"],
    speakerMemberId: "mina",
    spokenAt: "2026-11-03T08:00:00.000Z",
  });
  const board = companyBoard(session, "mina", {});
  assert.equal(board.activity.find((row) => row.id === "fail-bare").retryable, false);
  const refused = await replayFailure(session, {
    slack: { async postMessage() { throw new Error("posted"); } },
    memory: { async remember() { return { blobId: null }; } },
  }, "fail-bare");
  assert.equal(refused.reason, "unsupported");

  const posting = createSession();
  posting.actions.push({
    id: "action-9",
    state: "paused",
    tool: "slack",
    preference: "do",
    statement: "Booth notes",
    params: { channel: "#design", text: "Booth notes" },
    roomId: "booth",
    memberId: "mina",
    edit: "post",
    roomName: "#design",
  });
  const posts = [];
  await handleUtterance({
    text: "confirm action-9",
    memberId: "mina",
    session: posting,
    door: "typed",
  }, {
    slack: {
      async resolveChannel(name) {
        assert.equal(name, "#design");
        return "C0DESIGN";
      },
      async postMessage(input) {
        posts.push(input);
        return { ok: true, channel: "C0DESIGN", ts: "1710000000.000100", permalink: "https://acme.slack.com/archives/C0DESIGN/p1710000000000100" };
      },
    },
    memory: { async remember() { return { blobId: null }; } },
    app: {},
  });
  assert.equal(posts[0].channel, "C0DESIGN");
  const filed = posting.activity.find((row) => row.kind === "action" && row.verb === "post");
  assert.equal(filed.target.channel, "C0DESIGN");
  assert.equal(filed.target.url, "https://acme.slack.com/archives/C0DESIGN/p1710000000000100");
});
