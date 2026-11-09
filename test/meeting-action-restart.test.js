import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/session.js";
import { handleUtterance, rebuildCompanyIndex } from "../src/typed-path.js";

const room = { id: "meeting-1", kind: "meeting", source: "recall", botPresent: true, memberIds: ["alice"] };
const say = (session, text, deliveryId) => ({ session, text, deliveryId, memberId: "alice", room, participants: ["alice"] });

test("paused actions and connector receipts survive replay in either index order", async () => {
  const docs = [];
  const memory = { async remember(row) { docs.push(structuredClone(row)); return { blobId: "saved" }; }, async index() { return docs.toReversed(); } };
  const linear = { async createIssue() { return { id: "ROW-3" }; } };
  const session = createSession();
  await handleUtterance(say(session, "set linear to ask", "preference"), { memory });
  const paused = await handleUtterance(say(session, "File the venue ticket hall-three", "request-1"), { memory, linear });
  assert.equal(session.actions[0].state, "paused");
  const restarted = createSession();
  await rebuildCompanyIndex(restarted, { memory });
  assert.equal(restarted.actions[0].state, "paused");
  assert.equal(restarted.actions[0].id, paused.actionId);
  const repeated = await handleUtterance(say(restarted, "File the venue ticket hall-three", "request-1"), { memory, linear });
  assert.equal(repeated.outcome, "duplicate-delivery");
  assert.equal(restarted.actions.length, 1);
  const result = await handleUtterance(say(restarted, `confirm ${paused.actionId}`, "confirm-1"), { memory, linear });
  assert.equal(result.issueId, "ROW-3");
  const again = createSession();
  await rebuildCompanyIndex(again, { memory });
  assert.equal(again.actions[0].state, "closed");
  assert.equal(again.actions[0].connectorId, "ROW-3");
  const replay = await handleUtterance(say(again, `confirm ${paused.actionId}`, "confirm-2"), { memory, linear });
  assert.equal(replay.issueId, null);
});

test("a restart after connector submission without a receipt cannot retry the action", async () => {
  const docs = [];
  const memory = { async remember(row) { docs.push(structuredClone(row)); return { blobId: "saved" }; }, async index() { return docs; } };
  let calls = 0;
  const linear = { async createIssue() { calls++; throw new Error("response lost"); } };
  const session = createSession();
  const result = await handleUtterance(say(session, "File the venue ticket hall-three", "request-1"), { memory, linear });
  assert.equal(session.actions[0].state, "outcome_unknown");
  const restarted = createSession();
  await rebuildCompanyIndex(restarted, { memory });
  assert.equal(restarted.actions[0].state, "outcome_unknown");
  await handleUtterance(say(restarted, `confirm ${result.actionId}`, "confirm-1"), { memory, linear });
  assert.equal(calls, 1);
});

test("a source tombstone prevents restoring a paused action after restart", async () => {
  const { deletionTargets, withDeletionOverlay } = await import("../src/memory/deletions.js");
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const docs = [];
  const raw = { async remember(row) { docs.push(structuredClone(row)); return { blobId: "saved" }; }, async index() { return docs; } };
  const session = createSession();
  await handleUtterance(say(session, "set linear to ask", "preference"), { memory: raw });
  await handleUtterance(say(session, "File the venue ticket hall-three", "request-1"), { memory: raw });
  const intents = deletionTargets({ tenantId, roomId: room.id, sourceIds: ["request-1"] });
  const filtered = withDeletionOverlay(raw, { async list() { return intents; } }, tenantId);
  const restarted = createSession();
  await rebuildCompanyIndex(restarted, { memory: filtered });
  assert.equal(restarted.actions.length, 0);
  assert.ok(!JSON.stringify(restarted).includes("hall-three"));
});

test("two instances claiming the same meeting request send one connector write", async () => {
  const { createMemoryActionClaims } = await import("../src/domain/action-claims.js");
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const claims = createMemoryActionClaims();
  let calls = 0;
  const deps = { tenantId, actionClaims: claims, requireActionClaims: true, linear: { async createIssue() { calls++; return { id: "ROW-3" }; } } };
  const [one, two] = await Promise.all([
    handleUtterance(say(createSession(), "File the venue ticket hall-three", "request-1"), deps),
    handleUtterance(say(createSession(), "File the venue ticket hall-three", "request-1"), deps),
  ]);
  assert.equal(calls, 1);
  assert.equal([one, two].filter((row) => row.issueId === "ROW-3").length, 1);
});

test("required claims fail closed without contacting the connector", async () => {
  let calls = 0;
  const session = createSession();
  const reply = await handleUtterance(say(session, "File the venue ticket hall-three", "request-1"), {
    requireActionClaims: true, linear: { async createIssue() { calls++; } },
  });
  assert.equal(calls, 0);
  assert.match(reply.body, /could not be claimed/);
});
