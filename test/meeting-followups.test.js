import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryFollowupStore } from "../src/meeting/followup-store.js";
import { createMeetingFollowups, proposalsFromEvidence } from "../src/meeting/followups.js";

const tenantId = "11111111-1111-4111-a111-111111111111";
function evidence() {
  return { tenantId, meetingId: "meeting-1", teamId: "T1", memberIds: ["mina"], sources: [{ id: "source-1", text: "Create the project form", memberId: "mina", slackUserId: "U1", action: { kind: "create_form", tool: "create_form", args: { title: "Project" }, where: "Google Forms" } }], proposals: [{ sourceId: "source-1", requesterSlackId: "ATTACKER", args: { title: "Injected" } }], meeting: { people: [{ memberId: "mina", slackUserId: "U1", attended: true }] }, minutes: { decisions: [{ text: "Project approved" }] } };
}
async function setup({ execute = async () => ({ ok: true, connectorId: "form-1" }), authorize = async () => true, post } = {}) {
  const store = createMemoryFollowupStore();
  const messages = [];
  const slack = { teamId: "T1", async openConversation() { return { channel: { id: "D1" } }; }, async updateMessage(message) { messages.push(message); return { ts: message.ts }; }, async postMessage(message) { messages.push(message); return post ? post(message) : { ts: String(messages.length) }; } };
  const coordinator = createMeetingFollowups({ store, authorizeDelivery: async () => true, slackFor: async () => slack, handleUtterance: execute, authorize, validateEdit: async (_item, edit) => edit });
  await coordinator.enqueue(evidence());
  await coordinator.drain();
  await coordinator.drain();
  const action = (await store.list(tenantId, { kind: "action" }))[0];
  const payload = { tenantId, teamId: "T1", actorSlackId: "U1", channelId: "D1", threadTs: action.data.threadTs, value: `${action.id}:1`, verb: "approve" };
  return { store, coordinator, action, payload, messages };
}

test("model output cannot invent requester authority or executable arguments", () => {
  const [action] = proposalsFromEvidence(evidence());
  assert.equal(action.data.requesterSlackId, "U1");
  assert.deepEqual(action.data.args, { title: "Project" });
  assert.equal(proposalsFromEvidence({ ...evidence(), proposals: [{ sourceId: "invented" }] }).length, 0);
  const completed = evidence(); completed.sources[0].action.connectorId = "existing";
  assert.equal(proposalsFromEvidence(completed).length, 0);
  assert.throws(() => proposalsFromEvidence({ ...evidence(), memberIds: [] }), /Verified/);
});

test("two concurrent approvals claim one domain write and persist its connector receipt", async () => {
  let calls = 0;
  const { coordinator, payload, store, action } = await setup({ execute: async input => { calls++; assert.equal(input.intent, "followup-approve"); assert.equal(input.memberId, "mina"); return { ok: true, connectorId: "form-1" }; } });
  const results = await Promise.all([coordinator.interact(payload), coordinator.interact(payload)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(calls, 1);
  assert.deepEqual((await store.get(tenantId, action.id)).data.receipt, { connectorId: "form-1", link: "" });
  assert.equal((await coordinator.interact({ ...payload, verb: "skip" })).error, "closed");
});

test("tenant, team, actor, persisted DM and invitation checks fail before execution", async () => {
  let calls = 0;
  const { coordinator, payload } = await setup({ execute: async () => { calls++; } });
  for (const patch of [{ tenantId: "other" }, { teamId: "other" }, { actorSlackId: "other" }, { channelId: "other" }, { threadTs: "other" }, { value: payload.value.replace(/:1$/, ":2") }]) assert.equal((await coordinator.interact({ ...payload, ...patch })).ok, false);
  assert.equal(calls, 0);
  const denied = await setup({ authorize: async () => false });
  assert.equal((await denied.coordinator.interact(denied.payload)).error, "not_invited");
});

test("Edit saves a new argument version and stale approval cannot execute it", async () => {
  const { coordinator, payload, store, action } = await setup();
  const editing = await coordinator.interact({ ...payload, verb: "edit" });
  assert.equal(editing.modal.private_metadata, payload.value);
  assert.equal((await coordinator.interact(payload)).error, "invalid");
  const changed = await coordinator.interact({ ...payload, verb: "save", edit: { ok: true, summary: "Create revised form", args: { title: "Revised" } } });
  assert.equal(changed.ok, true);
  assert.equal((await store.get(tenantId, action.id)).data.argumentVersion, 2);
  assert.equal((await coordinator.interact(payload)).error, "forbidden_or_stale");
  assert.equal((await coordinator.interact({ ...payload, value: payload.value.replace(/:1$/, ":2"), verb: "skip" })).ok, true);
});

test("submission uncertainty survives a new coordinator and does not permit blind retry", async () => {
  let calls = 0;
  const { coordinator, payload, store, action } = await setup({ execute: async () => { calls++; throw new Error("response lost"); } });
  const result = await coordinator.interact(payload);
  assert.equal(result.status, "outcome_unknown");
  const restarted = createMeetingFollowups({ store, authorize: async () => true, handleUtterance: async () => { calls++; } });
  assert.equal((await restarted.interact(payload)).error, "closed");
  assert.equal((await store.get(tenantId, action.id)).status, "outcome_unknown");
  assert.equal(calls, 1);
});

test("repeated meeting completion cannot duplicate already delivered checklist or minutes", async () => {
  const { coordinator, messages } = await setup();
  await coordinator.enqueue(evidence());
  await coordinator.drain(); await coordinator.drain();
  assert.equal(messages.length, 2);
});

test("uncertain Slack sends are retained without automatic reposting", async () => {
  const { coordinator, store, messages } = await setup({ post: async () => { throw Error("network after send"); } });
  await coordinator.drain();
  assert.equal(messages.length, 2);
  assert.equal((await store.list(tenantId, { kind: "delivery", statuses: ["outcome_unknown"] })).length, 2);
});

test("domain permits are immutable and consumed once before connector execution", async () => {
  let coordinator;
  const state = await setup({ execute: async input => {
    assert.equal(await coordinator.authorizeExecution({ ...input, followup: { ...input.followup, args: { title: "forged" } } }), false);
    assert.equal(await coordinator.authorizeExecution(input), true);
    assert.equal(await coordinator.authorizeExecution(input), false);
    return { ok: true, connectorId: "form-1" };
  } });
  coordinator = state.coordinator;
  assert.equal((await coordinator.interact(state.payload)).status, "done");
  assert.equal((await state.store.get(tenantId, state.action.id)).status, "done");
});

test("saved outcomes rebuild closed checklists and same-thread results after restart", async () => {
  const { coordinator, payload, messages } = await setup();
  await coordinator.interact(payload);
  await coordinator.drain();
  assert.equal(messages.filter(message => message.thread_ts === payload.threadTs).length, 1);
  const updated = messages.find(message => message.ts === payload.threadTs);
  assert.ok(updated.blocks.every(block => block.type !== "actions"));
  const count = messages.length;
  await coordinator.drain();
  assert.equal(messages.length, count);
});

test("late minutes amend the original Slack message instead of posting another", async () => {
  const { coordinator, messages } = await setup();
  const next = evidence(); next.minutes = { tldr: "Revised minutes" };
  await coordinator.enqueue(next);
  await coordinator.drain(); await coordinator.drain();
  const amended = messages.filter(message => message.text.includes("Revised minutes"));
  assert.equal(amended.length, 1);
  assert.equal(amended[0].ts, "2");
  assert.equal(messages.filter(message => !message.ts).length, 2);
});

test("unsupported model-selected tools never become executable proposals", () => {
  const input = evidence(); input.sources[0].action.tool = "delete_all";
  assert.deepEqual(proposalsFromEvidence(input), []);
});

test("expired action claims cannot execute again while materialization leases can recover", async () => {
  let now = Date.now();
  const { store, action } = await setup();
  const current = await store.get(tenantId, action.id);
  await store.change(current, { status: "running", data: { ...current.data, claimUntil: now - 1 } });
  const coordinator = createMeetingFollowups({ store, clock: () => now });
  await coordinator.drain();
  assert.equal((await store.get(tenantId, action.id)).status, "outcome_unknown");
  const pending = await coordinator.enqueue({ ...evidence(), minutes: { tldr: "New" } });
  await store.change(pending, { status: "running", data: { ...pending.data, claimUntil: now - 1 } });
  await coordinator.drain();
  assert.equal((await store.get(tenantId, pending.id)).status, "failed");
});

test("delivery rechecks current access and defaults to withholding messages", async () => {
  const store = createMemoryFollowupStore();
  let messages = 0;
  const coordinator = createMeetingFollowups({ store, slackFor: async () => ({ teamId: "T1", postMessage() { messages++; } }) });
  await coordinator.enqueue(evidence()); await coordinator.drain(); await coordinator.drain();
  assert.equal(messages, 0);
  assert.equal((await store.list(tenantId, { kind: "delivery", statuses: ["not_reached"] })).length, 2);
});

test("pre-submission failures can be deliberately approved again but receiptless success cannot", async () => {
  let calls = 0;
  const retry = await setup({ execute: async () => ++calls === 1 ? { ok: false, submitted: false, next: "Reconnect" } : { ok: true, connectorId: "receipt" } });
  assert.equal((await retry.coordinator.interact(retry.payload)).status, "failed");
  assert.equal((await retry.coordinator.interact(retry.payload)).status, "done");
  const uncertain = await setup({ execute: async () => ({ ok: true }) });
  assert.equal((await uncertain.coordinator.interact(uncertain.payload)).status, "outcome_unknown");
  assert.equal((await uncertain.coordinator.interact(uncertain.payload)).error, "closed");
});

test("invalid edits and unsupported interactions never alter executable arguments", async () => {
  const { coordinator, payload, store, action } = await setup();
  assert.equal((await coordinator.interact({ ...payload, value: "junk" })).error, "invalid");
  assert.equal((await coordinator.interact({ ...payload, verb: "save", edit: {} })).error, "invalid_edit");
  assert.equal((await coordinator.interact({ ...payload, verb: "delete" })).error, "invalid");
  await coordinator.interact({ ...payload, verb: "edit" });
  assert.equal((await coordinator.interact({ ...payload, verb: "save", edit: { ok: false } })).error, "invalid_edit");
  assert.deepEqual((await store.get(tenantId, action.id)).data.args, { title: "Project" });
});

test("unmatched requesters and recipients outside source invitations receive no private content", async () => {
  const input = evidence(); input.sources[0].slackUserId = ""; input.sources[0].inviteMemberIds = [];
  input.meeting.bindingChannelId = "C1"; input.channelAuthorized = false;
  const store = createMemoryFollowupStore(); let sends = 0;
  const coordinator = createMeetingFollowups({ store, authorizeDelivery: async () => true, slackFor: async () => ({ postMessage() { sends++; } }) });
  await coordinator.enqueue(input); await coordinator.drain(); await coordinator.drain();
  assert.equal(sends, 0);
  assert.equal((await store.list(tenantId, { kind: "action" }))[0].status, "not_reached");
});

test("a forged claim or expired domain capability cannot authorize a write", async () => {
  let coordinator;
  const state = await setup({ execute: async input => {
    assert.equal(await coordinator.authorizeExecution({}), false);
    assert.equal(await coordinator.authorizeExecution({ ...input, followup: { ...input.followup, claimId: "other" } }), false);
    assert.equal(await coordinator.authorizeExecution({ ...input, memberId: "other" }), false);
    assert.equal(await coordinator.authorizeExecution(input), true);
    return { ok: true, connectorId: "form-1" };
  } });
  coordinator = state.coordinator;
  assert.equal((await coordinator.interact(state.payload)).ok, true);
});
