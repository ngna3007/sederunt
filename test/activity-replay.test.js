import assert from "node:assert/strict";
import test from "node:test";
import { replayPlan, replaySupported, runReplay } from "../src/activity-replay.js";
import { formatActivitySentence, groupActivity } from "../src/activity-feed.js";
import { rebuildCompanyIndex } from "../src/typed-path.js";
import { createSession } from "../src/session.js";

const observed = { start: "2026-11-03T15:00:00.000Z", end: "2026-11-03T16:00:00.000Z" };

function event(system, verb, changes, id = "T-1") {
  return {
    verb,
    target: { system, id, title: "Order booth banner" },
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
    "Sederunt moved Design crit 2:00 PM → 3:00 PM on Google Calendar via MCP",
  );
  assert.equal(
    formatActivitySentence("from 2026-11-03T16:00:00.000Z to 2026-11-03T18:30:00.000Z", "Asia/Ho_Chi_Minh"),
    "Nov 3, 11:00 PM → Nov 4, 1:30 AM",
  );
  const groups = groupActivity([
    { id: "a", requestId: "r", kind: "action", ts: "2026-11-03T08:00:00.000Z" },
    { id: "s", requestId: "r", kind: "resolve", ts: "2026-11-03T09:00:00.000Z" },
    { id: "u", requestId: "r", kind: "supersede" },
  ]);
  assert.deepEqual(groups[0].rows.map((row) => row.id), ["a"]);
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
