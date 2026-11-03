import assert from "node:assert/strict";
import test from "node:test";
import {
  activityEvent,
  activityIcon,
  activityRefusal,
  appendRetry,
  groupActivity,
  logAction,
  logFailure,
  logRequest,
  logUndo,
  renderActivity,
  selectActivity,
} from "../src/activity.js";
import { createSession } from "../src/session.js";
import { companyBoard } from "../src/typed-path.js";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");

function ago(ms) {
  return new Date(NOW - ms).toISOString();
}

test("one renderer produces the activity sentences", () => {
  const assignAsk = {
    kind: "request",
    verb: "assign",
    ts: ago(2 * 60 * 1000),
    actor: { type: "person", name: "Daniel", via: "Google Meet" },
    target: { system: "linear", type: "issue", id: "ABC-123", title: "Fix booth signage" },
    changes: [{ field: "assignee", to: "Rowan" }],
    origin: { roomId: "booth", roomName: "Booth planning", at: 22 },
  };
  const assignDid = {
    kind: "action",
    verb: "assign",
    ts: ago(2 * 60 * 1000),
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    target: { system: "linear", type: "issue", id: "ABC-123", title: "Fix booth signage" },
    changes: [{ field: "assignee", to: "Rowan" }],
    tool: { name: "act", server: "sederunt-mcp" },
  };
  const moveAsk = {
    kind: "request",
    verb: "move",
    ts: ago(60 * 60 * 1000),
    actor: { type: "person", name: "Mina", via: "Slack" },
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", to: "3 PM tomorrow" }],
    origin: { roomId: "C0", roomName: "#sederunt-demo" },
  };
  const moveDid = {
    kind: "action",
    verb: "move",
    ts: ago(60 * 60 * 1000),
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "3:00 PM" }],
    tool: { name: "act", server: "sederunt-mcp" },
  };
  const moveFailed = {
    kind: "failure",
    verb: "move",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    target: { system: "calendar", type: "event", title: "Design crit" },
    error: "the calendar is read-only",
    outcome: "failed",
  };
  const undone = {
    kind: "undo",
    verb: "move",
    ts: new Date(NOW).toISOString(),
    actor: { type: "person", name: "Rowan", via: "Console" },
    target: { system: "calendar", type: "event", title: "Design crit" },
  };
  const posted = {
    kind: "action",
    verb: "post",
    actor: { type: "sederunt", name: "Sederunt", via: "Slack" },
    target: { system: "slack", type: "message", title: "a summary" },
    origin: { roomName: "#sederunt-demo" },
  };
  assert.equal(renderActivity(assignAsk, NOW), "Daniel asked to assign ABC-123 Fix booth signage to Rowan");
  assert.equal(renderActivity(assignDid, NOW), "Sederunt assigned ABC-123 to Rowan via MCP");
  assert.equal(renderActivity(moveAsk, NOW), "Mina asked to move Design crit to 3 PM tomorrow");
  assert.equal(renderActivity(moveDid, NOW), "Sederunt moved Design crit from 2:00 PM to 3:00 PM on Google Calendar via MCP");
  assert.equal(renderActivity(moveFailed, NOW), "Sederunt couldn't move Design crit: the calendar is read-only");
  assert.equal(renderActivity(undone, NOW), "Rowan undid moving Design crit");
  assert.equal(renderActivity(posted, NOW), "Sederunt posted a summary in #sederunt-demo via Slack");
});

test("a calendar reschedule and an MCP action use the same renderer", () => {
  const rescheduled = {
    kind: "action",
    verb: "reschedule",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: sederunt" },
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "3:00 PM" }],
    tool: { name: "act", server: "sederunt-mcp" },
  };
  assert.equal(
    renderActivity(rescheduled, NOW),
    "Sederunt rescheduled Design crit from 2:00 PM to 3:00 PM on Google Calendar via MCP",
  );
  assert.deepEqual(activityIcon(rescheduled), { icon: "status", system: "calendar" });
  assert.deepEqual(activityIcon({ kind: "failure", verb: "move", target: { system: "calendar" } }), { icon: "error", system: "calendar" });
});

test("a request and its action share a group", () => {
  const session = createSession();
  const request = logRequest(session, {
    id: "activity-1",
    requestId: "req-1",
    actor: { type: "person", name: "Daniel", via: "Google Meet" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ABC-123", title: "Fix booth signage" },
    changes: [{ field: "assignee", to: "Rowan" }],
    origin: { roomId: "booth", roomName: "Booth planning", at: 22 },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "activity-2",
    requestId: "req-1",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ABC-123", title: "Fix booth signage" },
    changes: [{ field: "assignee", to: "Rowan" }],
    tool: { name: "act", server: "sederunt-mcp" },
    undo: { available: true, until: new Date(NOW + 86400000).toISOString() },
  });
  const groups = groupActivity(session.activity);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows[0].id, request.id);
  assert.equal(groups[0].rows[1].kind, "action");
  assert.equal(groups[0].rows[0].requestId, groups[0].rows[1].requestId);
});

test("a secret or a raw id is refused and is not stored", () => {
  const session = createSession();
  assert.equal(activityRefusal({ actor: { name: "Mina" }, error: "lin_api_abcdef" }), "secret");
  assert.equal(activityRefusal({ actor: { name: "U_MINA" } }), "raw-id");
  assert.throws(() => logFailure(session, {
    id: "activity-x",
    requestId: "req-x",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ABC-123" },
    error: "Bearer sk-secret-token",
  }), /activity refused/);
  assert.throws(() => activityEvent({
    actor: { name: "0xabc123def456" },
    verb: "join",
    target: { system: "recall", type: "bot" },
  }), /activity refused/);
  assert.equal(session.activity.length, 0);
  const kept = logUndo(session, {
    id: "activity-3",
    requestId: "req-1",
    actor: { type: "person", name: "Rowan", via: "Console" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
  });
  assert.equal(JSON.stringify(kept).includes("lin_api_"), false);
  assert.equal(JSON.stringify(session.activity).includes("0x"), false);
});

test("groups are newest first and a request stays with its result across rooms", () => {
  const older = Date.parse("2026-11-03T08:00:00.000Z");
  const newer = Date.parse("2026-11-03T09:00:00.000Z");
  const events = [
    { id: "old-req", requestId: "old", kind: "request", ts: new Date(older).toISOString(), verb: "move", actor: { name: "Mina" }, target: { title: "Design crit", system: "calendar" }, changes: [{ field: "start", to: "3 PM tomorrow" }], origin: { roomId: "slack", roomName: "#sederunt-demo" } },
    { id: "new-act", requestId: "new", kind: "action", ts: new Date(newer).toISOString(), verb: "assign", actor: { name: "Sederunt", type: "sederunt" }, target: { id: "ABC-123", system: "linear" }, origin: { roomId: "booth", roomName: "Booth planning" } },
    { id: "old-act", requestId: "old", kind: "action", ts: new Date(older + 1000).toISOString(), verb: "move", actor: { name: "Sederunt", type: "sederunt", via: "MCP: cursor" }, target: { title: "Design crit", system: "calendar" }, changes: [{ field: "start", from: "2:00 PM", to: "3:00 PM" }], origin: { roomId: "design", roomName: "Design crit" } },
  ];
  const groups = groupActivity(events);
  assert.equal(groups[0].requestId, "new");
  assert.equal(groups[1].requestId, "old");
  assert.deepEqual(groups[1].rows.map((row) => row.id), ["old-req", "old-act"]);
  const inDesign = selectActivity(events, { roomId: "design" });
  assert.equal(inDesign.length, 1);
  assert.equal(inDesign[0].rows.length, 2);
  assert.equal(selectActivity(events, { query: "zzzz" }).length, 0);
  assert.equal(selectActivity(events, { roomId: "booth" })[0].requestId, "new");
});

test("a label request names the label from the changes slot", () => {
  const sentence = renderActivity({
    kind: "request",
    verb: "label",
    actor: { name: "Aiko" },
    target: { system: "linear", type: "issue", id: "ROW-14", title: "Empty state copy" },
    changes: [{ field: "label", to: "Copy" }],
  });
  assert.equal(sentence, "Aiko asked to add label Copy to ROW-14 Empty state copy");
  assert.match(renderActivity({
    kind: "request",
    verb: "create",
    actor: { name: "Mina" },
    target: { title: "File the venue ticket", system: "linear", type: "issue" },
  }), /asked to create a ticket "File the venue ticket"/);
});

test("retry and undo append events", () => {
  const session = createSession();
  logFailure(session, {
    id: "fail-1",
    requestId: "req-move",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "3:00 PM" }],
    error: "the calendar is read-only",
    origin: { roomId: "design", roomName: "Design crit" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const retried = appendRetry(session, "fail-1");
  assert.equal(retried.kind, "action");
  assert.equal(retried.requestId, "req-move");
  assert.equal(session.activity.filter((row) => row.requestId === "req-move").length, 2);
  const undone = logUndo(session, {
    id: "undo-1",
    requestId: "req-move",
    undoOf: retried.id,
    actor: { type: "person", name: "Rowan", via: "Console" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
  });
  assert.equal(undone.kind, "undo");
  assert.equal(retried.outcome, "undone");
  assert.equal(session.activity.at(-1).id, "undo-1");
});

test("a request from another room stays with the action the member can see", () => {
  const session = createSession();
  session.decisions.push({
    id: "decision-1",
    account: "company",
    kind: "decision",
    text: "Design crit stays at three.",
    speakerMemberId: "Mina",
    inviteMemberIds: ["Mina"],
    roomId: "design",
    contradicts: [],
    fileNames: [],
  });
  logRequest(session, {
    id: "req",
    requestId: "pair",
    actor: { type: "person", name: "Mina", via: "Slack" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", to: "3 PM tomorrow" }],
    origin: { roomId: "slack", roomName: "#sederunt-demo" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  logAction(session, {
    id: "act",
    requestId: "pair",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "3:00 PM" }],
    origin: { roomId: "design", roomName: "Design crit" },
    tool: { name: "act", server: "sederunt-mcp" },
  });
  const board = companyBoard(session, "Mina");
  assert.equal(board.activity.filter((row) => row.requestId === "pair").length, 2);
});
