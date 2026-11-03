import assert from "node:assert/strict";
import test from "node:test";
import { replayPlan, runReplay } from "../src/activity-replay.js";
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
