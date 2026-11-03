import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { STATUS_WORDS } from "../src/domain/status.js";
import { act, handleMcpRequest, mcpTools, recall } from "../src/mcp.js";
import { createSession } from "../src/session.js";
import { handleUtterance, rebuildCompanyIndex, saveHearing } from "../src/typed-path.js";

globalThis.fetch = async () => {
  throw new Error("gate tests must not call the network");
};

function countingLinear(createResult = { identifier: "ROW-44", id: "ROW-44" }) {
  const calls = [];
  let next = createResult;
  return {
    calls,
    setResult(value) {
      next = value;
    },
    async readOpenTripTickets() {
      calls.push("read");
      return {
        team: "ROW",
        trip: [{ identifier: "ROW-8", title: "Typed Linear read", status: "Backlog" }],
        open: [{ identifier: "ROW-10", title: "Status, allow, and clash as pure functions", status: "Backlog" }],
      };
    },
    async createIssue() {
      calls.push("create");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

function countingCalendar() {
  const order = [];
  return {
    order,
    async readDay(day) {
      order.push(["read", day]);
      return { day, events: ["review"] };
    },
    async listTools() {
      order.push("list");
      return [
        { name: "list_events", write: false },
        { name: "move_event", write: true },
      ];
    },
    async call(name, params) {
      order.push(["call", name, params]);
      return { id: "evt-9" };
    },
  };
}

function countingMemory() {
  const calls = [];
  return {
    calls,
    async remember(input) {
      calls.push(input);
      return { blobId: null };
    },
  };
}

function room(overrides = {}) {
  return {
    id: "room-1",
    kind: "meeting",
    source: "recall",
    botPresent: true,
    memberIds: ["rowan", "alex"],
    ...overrides,
  };
}

function utterance(session, text, extra = {}) {
  return { text, session, memberId: "rowan", room: room(), ...extra };
}

function assertWord(result) {
  assert.ok(STATUS_WORDS.includes(result.status), result.status);
}

test("a Linear read ignores a do preference and does not create", async () => {
  const linear = countingLinear();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const result = await handleUtterance(
    { text: "What tickets are open for the trip?", session },
    { linear },
  );
  assert.deepEqual(linear.calls, ["read"]);
  assert.equal(session.actions.length, 0);
  assert.match(result.body, /ROW-8/);
  assert.match(result.body, /team ROW/);
  assert.match(result.body, /created nothing/);
  assert.match(result.body, /preference do/);
  assert.equal(result.issueId, null);
  assert.equal(result.link, null);
  assert.equal(session.items.at(-1).kind, "answer");
  assertWord(result);
});

test("a write with no stored preference waits and does not call the connector", async () => {
  const linear = countingLinear();
  const memory = countingMemory();
  const session = createSession();
  const result = await handleUtterance(
    utterance(session, "File the venue ticket seaside-hall", { deliveryId: "ask-1" }),
    { linear, memory },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(result.status, "recorded");
  assert.equal(result.issueId, null);
  assert.equal(result.link, null);
  assert.equal(result.preference, "ask");
  assert.match(result.body, /seaside-hall/);
  assert.match(result.body, /recorded/);
  assert.match(result.body, /preference ask/);
  assert.match(result.body, /Waiting for confirmation of action-/);
  assert.doesNotMatch(result.body, /filed/);
  assert.doesNotMatch(result.body, /ROW-/);
  assert.equal(session.actions.length, 1);
  assert.equal(session.actions[0].state, "waiting");
  assert.equal(session.actions[0].connectorId, null);
  assert.ok(memory.calls.every((call) => !call.connectorId && call.account !== undefined));
  assert.ok(memory.calls.every((call) => !String(call.text).includes("0x")));
  assertWord(result);
});

test("ask confirms one action, and yes does not file a second write", async () => {
  const linear = countingLinear();
  const session = createSession();
  const proposed = await handleUtterance(
    utterance(session, "File the venue ticket hall-one", { deliveryId: "ask-hall" }),
    { linear },
  );
  assert.equal(proposed.status, "recorded");
  assert.deepEqual(linear.calls, []);
  const repeatedAsk = await handleUtterance(
    utterance(session, "File the venue ticket hall-one", { deliveryId: "ask-hall" }),
    { linear },
  );
  assert.match(repeatedAsk.body, /duplicate-delivery/);
  assert.equal(session.actions.length, 1);
  assert.deepEqual(linear.calls, []);

  const ignored = await handleUtterance(utterance(session, "yes"), { linear });
  assert.deepEqual(linear.calls, []);
  assert.doesNotMatch(ignored.body, /filed/);

  const wrong = await handleUtterance(
    utterance(session, "confirm action-999", { deliveryId: "confirm-wrong" }),
    { linear },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(wrong.issueId, null);

  const filed = await handleUtterance(
    utterance(session, `confirm ${proposed.actionId}`, { deliveryId: "confirm-1" }),
    { linear },
  );
  assert.equal(filed.status, "filed");
  assert.equal(filed.issueId, "ROW-44");
  assert.equal(filed.link, "ROW-44");
  assert.match(filed.body, /filed/);
  assert.match(filed.body, /ROW-44/);
  assert.match(filed.body, /hall-one/);
  assert.deepEqual(linear.calls, ["create"]);
  assert.equal(session.actions.filter((action) => action.connectorId).length, 1);

  const repeat = await handleUtterance(
    utterance(session, `confirm ${proposed.actionId}`, { deliveryId: "confirm-1" }),
    { linear },
  );
  assert.equal(linear.calls.length, 1);
  assert.match(repeat.body, /duplicate-delivery/);

  const second = await handleUtterance(
    utterance(session, "File the venue ticket hall-two", { deliveryId: "ask-hall-2" }),
    { linear },
  );
  assert.equal(second.status, "recorded");
  assert.equal(second.issueId, null);
  assert.equal(second.link, null);
  assert.deepEqual(linear.calls, ["create"]);
  assertWord(filed);
});

test("do performs one request, and a repeat of that delivery does not call again", async () => {
  const linear = countingLinear();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const deliveryId = `delivery-${"x".repeat(280)}`;
  const filed = await handleUtterance(
    utterance(session, "File the venue ticket hall-one", { deliveryId }),
    { linear },
  );
  assert.equal(filed.status, "filed");
  assert.equal(filed.link, "ROW-44");
  assert.match(filed.body, /preference do/);
  assert.equal(session.actions.length, 1);
  assert.deepEqual(linear.calls, ["create"]);

  const repeat = await handleUtterance(
    utterance(session, "File the venue ticket hall-one", { deliveryId }),
    { linear },
  );
  assert.equal(linear.calls.length, 1);
  assert.match(repeat.body, /duplicate-delivery/);

  await handleUtterance(utterance(session, "set linear to ask"), {});
  const stopped = await handleUtterance(
    utterance(session, "File the venue ticket hall-two", { deliveryId: "after-ask" }),
    { linear },
  );
  assert.equal(stopped.status, "recorded");
  assert.equal(stopped.link, null);
  assert.match(stopped.body, /preference ask/);
  assert.deepEqual(linear.calls, ["create"]);
  assertWord(filed);
});

test("a room preference overrides the account preference", async () => {
  const linear = countingLinear();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  await handleUtterance(utterance(session, "set linear to ask in room room-1"), {});
  const blocked = await handleUtterance(
    utterance(session, "File the venue ticket hall-room", { deliveryId: "room-ask" }),
    { linear },
  );
  assert.equal(blocked.preference, "ask");
  assert.deepEqual(linear.calls, []);

  await handleUtterance(utterance(session, "set linear to do in room room-1"), {});
  const allowed = await handleUtterance(
    utterance(session, "File the venue ticket hall-room", { deliveryId: "room-do" }),
    { linear },
  );
  assert.equal(allowed.status, "filed");
  assert.deepEqual(linear.calls, ["create"]);
});

test("a write from outside the room does not call, even when the preference is do", async () => {
  const linear = countingLinear();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const outsider = await handleUtterance(
    { text: "File the venue ticket hall-out", session, memberId: "sam", room: room(), deliveryId: "out-1" },
    { linear },
  );
  const missing = await handleUtterance(
    { text: "File the venue ticket hall-none", session, room: room(), deliveryId: "none-1" },
    { linear },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(outsider.link, null);
  assert.equal(missing.link, null);
  assert.doesNotMatch(outsider.body, /filed/);
  assert.doesNotMatch(missing.body, /filed/);
});

test("a missing fact does not call the connector", async () => {
  const linear = countingLinear();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const result = await handleUtterance(
    utterance(session, "File the venue ticket", { deliveryId: "missing-venue" }),
    { linear },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(result.status, "recorded");
  assert.equal(result.link, null);
  assert.match(result.body, /missing fact: venue/);
  assert.equal(session.actions.at(-1).missingFact, "venue");
  assert.notEqual(session.actions.at(-1).state, "closed");
  assertWord(result);
});

test("a refused create stays recorded and says the edit did not happen", async () => {
  const linear = countingLinear(new Error("Linear refused lin_api_shouldnotleak"));
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const result = await handleUtterance(
    utterance(session, "File the venue ticket hall-three", { deliveryId: "refused-1" }),
    { linear },
  );
  assert.equal(result.status, "recorded");
  assert.equal(result.issueId, null);
  assert.equal(result.link, null);
  assert.match(result.body, /The edit did not happen/);
  assert.doesNotMatch(result.body, /filed/);
  assert.doesNotMatch(result.body, /lin_api_/);
  assert.equal(session.actions.at(-1).state, "available");
  assert.equal(linear.calls.length, 1);
  const repeat = await handleUtterance(
    utterance(session, "File the venue ticket hall-three", { deliveryId: "refused-1" }),
    { linear },
  );
  assert.equal(linear.calls.length, 1);
  assert.match(repeat.body, /duplicate-delivery/);
  assertWord(result);
});

test("an empty connector id stays recorded and a new confirmation can send it once", async () => {
  const linear = countingLinear({ identifier: "", id: "" });
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  const failed = await handleUtterance(
    utterance(session, "File the venue ticket hall-four", { deliveryId: "empty-1" }),
    { linear },
  );
  assert.equal(failed.status, "recorded");
  assert.match(failed.body, /The edit did not happen/);
  assert.equal(failed.link, null);
  assert.equal(linear.calls.length, 1);
  assert.equal(session.actions.at(-1).state, "available");
  assert.equal(session.actions.at(-1).connectorId, null);

  const same = await handleUtterance(
    utterance(session, "File the venue ticket hall-four", { deliveryId: "empty-1" }),
    { linear },
  );
  assert.equal(linear.calls.length, 1);
  assert.match(same.body, /duplicate-delivery/);

  linear.setResult({ identifier: "ROW-44", id: "ROW-44" });
  const retried = await handleUtterance(
    utterance(session, `confirm ${failed.actionId}`, { deliveryId: "empty-confirm" }),
    { linear },
  );
  assert.equal(linear.calls.length, 2);
  assert.equal(retried.status, "filed");
  assert.equal(retried.link, "ROW-44");
  const retriedAgain = await handleUtterance(
    utterance(session, `confirm ${failed.actionId}`, { deliveryId: "empty-confirm" }),
    { linear },
  );
  assert.equal(linear.calls.length, 2);
  assert.match(retriedAgain.body, /duplicate-delivery/);
});

test("dismissing a waiting action does not call the connector", async () => {
  const linear = countingLinear();
  const session = createSession();
  const proposed = await handleUtterance(
    utterance(session, "File the venue ticket hall-dismiss", { deliveryId: "dismiss-ask" }),
    { linear },
  );
  await handleUtterance(utterance(session, `dismiss ${proposed.actionId}`, { deliveryId: "dismiss-1" }), { linear });
  const confirmed = await handleUtterance(
    utterance(session, `confirm ${proposed.actionId}`, { deliveryId: "dismiss-confirm" }),
    { linear },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(confirmed.link, null);
  assert.equal(session.actions[0].state, "dismissed");
});

test("a company decision keeps the room invite, and a private note stays personal", async () => {
  const memory = countingMemory();
  const session = createSession();
  const members = ["rowan", "alex"];
  const stored = await handleUtterance(
    utterance(session, "The offsite is in Lisbon", {
      decision: { area: "offsite" },
      room: room({ memberIds: members }),
    }),
    { memory },
  );
  members.push("sam");
  assert.equal(stored.status, "current");
  assert.match(stored.body, /Lisbon/);
  assert.match(stored.body, /current/);
  assert.equal(memory.calls.at(-1).account, "company");
  assert.deepEqual(session.decisions[0].inviteMemberIds, ["rowan", "alex"]);
  assert.equal(session.decisions[0].account, "company");

  const personal = await handleUtterance(
    utterance(session, "private: I keep the spare phrase at home"),
    { memory },
  );
  assert.equal(memory.calls.at(-1).account, "personal");
  assert.deepEqual(session.decisions[1].inviteMemberIds, ["rowan"]);
  assert.match(personal.body, /spare phrase/);

  const alex = await recall({ session, memberId: "alex", room: room() }, {});
  assert.match(alex.body, /Lisbon/);
  assert.doesNotMatch(alex.body, /spare phrase/);
  const rowan = await recall({ session, memberId: "rowan", room: room() }, {});
  assert.match(rowan.body, /spare phrase/);
  const sam = await recall({ session, memberId: "sam", room: room() }, {});
  assert.doesNotMatch(sam.body, /Lisbon/);
  assert.doesNotMatch(sam.body, /spare phrase/);
  assertWord(stored);
});

test("a caller with no member id receives no decision text", async () => {
  const session = createSession();
  await handleUtterance(utterance(session, "The offsite is in Lisbon"), {});
  const missing = await recall({ session, room: room(), text: "what was decided" }, {});
  assert.doesNotMatch(missing.body, /Lisbon/);
  assert.match(missing.body, /missing-member/);
  assert.equal(missing.link, null);
});

test("an empty room does not invent a sentence", async () => {
  const memory = countingMemory();
  const session = createSession();
  const result = await handleUtterance(
    {
      text: "The offsite is in Lisbon",
      session,
      memberId: "rowan",
      room: room({ botPresent: false }),
    },
    { memory },
  );
  assert.equal(session.decisions.length, 0);
  assert.equal(memory.calls.length, 0);
  assert.doesNotMatch(result.body, /Lisbon/);
  assert.match(result.body, /No decision is stored/);
});

test("a late checkpoint is not stored on the decision", async () => {
  const session = createSession();
  await handleUtterance(
    utterance(session, "The offsite is in Lisbon", { checkpoint: 120, knowableAtCheckpoint: 100 }),
    {},
  );
  assert.equal(session.decisions[0].checkpoint, null);
  await handleUtterance(
    utterance(session, "Bring the printed map", { checkpoint: 80, knowableAtCheckpoint: 100 }),
    {},
  );
  assert.equal(session.decisions[1].checkpoint, 80);
});

test("a memory failure does not invent a stored sentence", async () => {
  const session = createSession();
  const result = await handleUtterance(utterance(session, "The offsite is in Lisbon"), {
    memory: {
      async remember() {
        throw new Error("relayer down 0xcc67abcdef1234567890");
      },
    },
  });
  assert.equal(session.decisions.length, 0);
  assert.doesNotMatch(result.body, /Lisbon/);
  assert.doesNotMatch(JSON.stringify(result), /0xcc67/);
  assert.doesNotMatch(session.log.join("\n"), /0xcc67/);
});

test("both contradictions stay clashing and a replacement stays visible", async () => {
  const session = createSession();
  const first = await handleUtterance(
    utterance(session, "The offsite is in Lisbon", { decision: { area: "offsite" } }),
    {},
  );
  const second = await handleUtterance(
    utterance(session, "The offsite is in Porto", {
      decision: { area: "offsite", contradicts: [first.decisionId] },
    }),
    {},
  );
  assert.equal(session.decisions.length, 2);
  assert.equal(second.status, "clashing");
  assert.match(second.body, /Lisbon/);
  assert.match(second.body, /Porto/);
  assert.match(second.body, /clashing/);
  assert.doesNotMatch(second.body, /\bcurrent\b/);

  const replaced = createSession();
  const old = await handleUtterance(
    utterance(replaced, "The offsite is in Lisbon", { decision: { area: "offsite" } }),
    {},
  );
  const next = await handleUtterance(
    utterance(replaced, "The offsite is in Madrid", {
      decision: { area: "offsite", replaces: old.decisionId },
    }),
    {},
  );
  assert.equal(replaced.decisions.length, 2);
  assert.equal(replaced.decisions.find((decision) => decision.id === old.decisionId).replacedBy, next.decisionId);
  assert.match(next.body, /Lisbon/);
  assert.match(next.body, /replaced/);
  assert.match(next.body, /Madrid/);
  assert.match(next.body, /\bcurrent\b/);
  assertWord(second);
  assertWord(next);
});

test("a deleted decision stays deleted when an older copy is read later", async () => {
  const original = {
    decision: {
      id: "decision-1",
      roomId: "C1",
      text: "The floor plan is floor-plan.txt",
      inviteMemberIds: ["U_MINA"],
      kind: "decision",
      account: "company",
      contradicts: [],
      fileNames: [{ name: "floor-plan.txt", consoleFileId: "file-1", folderId: "folder" }],
      deleted: false,
    },
  };
  const tombstone = { decision: { ...original.decision, deleted: true, fileNames: [] } };
  const memory = {
    async index() { return [tombstone, original]; },
    async recall() { return [tombstone, original]; },
  };
  const session = createSession();
  await rebuildCompanyIndex(session, { memory });
  assert.equal(session.decisions.length, 1);
  assert.equal(session.decisions[0].deleted, true);
});

test("a saved trigger keeps the words that follow it", async () => {
  const session = createSession();
  const remembered = [];
  await saveHearing(session, { memory: { async remember(input) { remembered.push(input); return { blobId: null }; } } }, {
    name: "Piper",
    triggers: ["keep this", "Piper"],
  });
  assert.equal(session.hearing.name, "Piper");
  assert.deepEqual(session.hearing.triggers, ["keep this"]);
  assert.equal(remembered[0].hearing.name, "Piper");
  const kept = await handleUtterance({
    door: "meeting",
    text: "Please keep this the booth opens at nine",
    session,
    memberId: "rowan",
    room: room({ memberIds: ["rowan"] }),
    participants: ["rowan"],
  }, { memory: countingMemory() });
  assert.equal(kept.entered, true);
  assert.match(kept.body, /the booth opens at nine/);
  const missed = await handleUtterance({
    door: "meeting",
    text: "the weather is fine today",
    session,
    memberId: "rowan",
    room: room(),
    participants: ["rowan"],
  }, { memory: countingMemory() });
  assert.equal(missed.entered, false);
});

test("a deleted floor-plan sentence can be posted again with its file", async () => {
  const session = createSession();
  const channel = { id: "C1", kind: "channel", source: "slack", botPresent: true, memberIds: ["rowan"] };
  const first = await handleUtterance({
    text: "The floor plan is floor-plan.txt",
    session,
    memberId: "rowan",
    door: "channel",
    room: channel,
    participants: ["rowan"],
  }, { memory: countingMemory() });
  assert.match(first.body, /floor plan/);
  session.decisions[0].deleted = true;
  let uploads = 0;
  const second = await handleUtterance({
    text: "The floor plan is floor-plan.txt",
    session,
    memberId: "rowan",
    door: "channel",
    room: channel,
    participants: ["rowan"],
    file: { name: "floor-plan.txt", bytes: "PLAN" },
  }, {
    memory: countingMemory(),
    console: {
      async upload(input) {
        uploads += 1;
        assert.equal(input.bytes, "PLAN");
        return { id: "file-2", folderId: "folder" };
      },
    },
  });
  assert.equal(uploads, 1);
  const kept = session.decisions.filter((item) => !item.deleted);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].fileNames[0].name, "floor-plan.txt");
  assert.match(second.body, /floor plan/);
});

test("recall returns the sentence and not the file bytes", async () => {
  let reads = 0;
  let uploads = 0;
  const consoleAdapter = {
    async upload(input) {
      uploads += 1;
      assert.equal(input.name, "brief.pdf");
      assert.equal(input.bytes, "PDFBYTES");
      return { id: "file-1", folderId: "private" };
    },
    async read() {
      reads += 1;
      return "PDFBYTES";
    },
  };
  const session = createSession();
  const stored = await handleUtterance(
    utterance(session, "The brief is brief.pdf", { file: { name: "brief.pdf", bytes: "PDFBYTES" } }),
    { console: consoleAdapter, memory: countingMemory() },
  );
  assert.match(stored.body, /brief\.pdf/);
  assert.doesNotMatch(stored.body, /PDFBYTES/);
  assert.equal(uploads, 1);
  assert.equal(reads, 0);
  const again = await recall(
    { session, memberId: "rowan", room: room(), text: "what was decided" },
    { console: consoleAdapter },
  );
  assert.equal(uploads, 1);
  assert.equal(reads, 0);
  assert.match(again.body, /brief\.pdf/);
  assert.match(again.body, /The brief is brief\.pdf/);
  assert.doesNotMatch(again.body, /PDFBYTES/);
  assert.equal(session.decisions[0].fileNames[0].name, "brief.pdf");
});

test("a Tatum disagreement follows the object and a failed read is unknown", async () => {
  const session = createSession();
  const memory = {
    async remember() {
      return { blobId: "blob-9", accountId: "0xcc67abcdef1234567890" };
    },
  };
  await handleUtterance(utterance(session, "The offsite is in Lisbon"), { memory });
  const linear = countingLinear();
  const tatum = {
    calls: [],
    async getObject(blobId) {
      this.calls.push(blobId);
      return { text: "The offsite is in Porto", checkpoint: 88 };
    },
  };
  const disagreed = await recall(
    { session, memberId: "rowan", room: room(), text: "what was decided" },
    { tatum, linear },
  );
  assert.deepEqual(tatum.calls, ["blob-9"]);
  assert.deepEqual(linear.calls, []);
  assert.match(disagreed.body, /Porto/);
  assert.match(disagreed.body, /checkpoint 88/);
  assert.equal(disagreed.checkpoint, 88);
  assert.doesNotMatch(disagreed.body, /Lisbon/);
  assert.doesNotMatch(JSON.stringify(disagreed), /0xcc67/);

  const failedSession = createSession();
  await handleUtterance(utterance(failedSession, "The offsite is in Lisbon"), { memory });
  const failed = await recall(
    { session: failedSession, memberId: "rowan", room: room() },
    {
      tatum: {
        async getObject() {
          throw new Error("tatum down lin_api_shouldstayhidden");
        },
      },
      linear,
    },
  );
  assert.equal(failed.status, "unknown");
  assert.match(failed.body, /unknown/);
  assert.doesNotMatch(failed.body, /Lisbon/);
  assert.doesNotMatch(failed.body, /lin_api_/);
  assert.deepEqual(linear.calls, []);
  assertWord(failed);
});

test("a calendar read ignores do, and a calendar edit follows the preference", async () => {
  const session = createSession();
  const calendar = countingCalendar();
  await handleUtterance(utterance(session, "set calendar to do"), {});
  const read = await handleUtterance(utterance(session, "what is on Thursday"), { calendar });
  assert.deepEqual(calendar.order, [["read", "Thursday"]]);
  assert.match(read.body, /Thursday/);
  assert.match(read.body, /preference do/);
  assert.equal(session.actions.length, 0);
  assert.equal(read.link, null);

  const missing = await handleUtterance(
    utterance(session, "Move the review", { deliveryId: "cal-miss" }),
    { calendar },
  );
  assert.equal(session.actions.at(-1).missingFact, "day");
  assert.equal(session.actions.at(-1).params.day, null);
  assert.deepEqual(calendar.order, [["read", "Thursday"]]);
  assert.match(missing.body, /missing fact: day/);

  const edited = await handleUtterance(
    utterance(session, "Move the review to Friday", { deliveryId: "cal-do" }),
    { calendar },
  );
  assert.equal(edited.status, "updated");
  assert.equal(edited.issueId, "evt-9");
  assert.equal(edited.link, "evt-9");
  assert.match(edited.body, /updated/);
  assert.match(edited.body, /evt-9/);
  assert.match(edited.body, /preference do/);
  assert.equal(calendar.order.at(-2), "list");
  assert.deepEqual(calendar.order.at(-1), ["call", "move_event", { name: "review", day: "Friday" }]);

  const asking = createSession();
  const quiet = countingCalendar();
  const waiting = await handleUtterance(
    utterance(asking, "Move the review to Friday", { deliveryId: "cal-ask" }),
    { calendar: quiet },
  );
  assert.deepEqual(quiet.order, []);
  assert.equal(waiting.status, "recorded");
  assert.equal(waiting.link, null);
  assert.match(waiting.body, /preference ask/);
  assertWord(edited);
  assertWord(read);
});

test("MCP recall applies no write preference, and act under ask does not call", async () => {
  assert.deepEqual(mcpTools, ["recall", "act"]);
  const linear = countingLinear();
  const calendar = countingCalendar();
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), {});
  await handleUtterance(utterance(session, "The offsite is in Lisbon"), {});
  const looked = await recall(
    { session, memberId: "rowan", room: room(), text: "File the venue ticket hall-mcp" },
    { linear, calendar },
  );
  assert.match(looked.body, /Lisbon/);
  assert.deepEqual(linear.calls, []);
  assert.deepEqual(calendar.order, []);

  const outsider = await recall({ session, memberId: "sam", room: room() }, { linear, calendar });
  assert.doesNotMatch(outsider.body, /Lisbon/);
  assert.deepEqual(linear.calls, []);

  const asked = createSession();
  const acted = await act(
    {
      text: "File the venue ticket hall-mcp",
      session: asked,
      memberId: "rowan",
      room: room(),
      deliveryId: "mcp-act",
    },
    { linear, calendar },
  );
  assert.deepEqual(linear.calls, []);
  assert.deepEqual(calendar.order, []);
  assert.equal(acted.preference, "ask");
  assert.equal(acted.link, null);
  assert.doesNotMatch(acted.body, /filed/);

  const throughDoor = await handleMcpRequest(
    {
      name: "act",
      arguments: {
        text: "File the venue ticket hall-door",
        session: asked,
        memberId: "rowan",
        room: room(),
        deliveryId: "mcp-door",
      },
    },
    { linear, calendar },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(throughDoor.link, null);
  assert.doesNotMatch(JSON.stringify(throughDoor), /0x[0-9a-fA-F]{6,}/);
});

test("a restarted meeting still waits for one confirm", async () => {
  const docs = [
    { room: { id: "bot-live", kind: "meeting", platform: "Google Meet" } },
    {
      decision: {
        id: "decision-1",
        roomId: "bot-live",
        text: "the booth opens at nine",
        speakerMemberId: "U_MINA",
        inviteMemberIds: ["U_MINA"],
        kind: "decision",
        account: "company",
        contradicts: [],
        fileNames: [],
      },
    },
    {
      decision: {
        id: "decision-2",
        roomId: "C1",
        text: "The floor plan is floor-plan.txt",
        speakerMemberId: "U_MINA",
        inviteMemberIds: ["U_MINA"],
        kind: "decision",
        account: "company",
        contradicts: [],
        fileNames: [],
      },
    },
  ];
  const memory = { async index() { return docs; }, async recall() { return docs; } };
  const session = createSession();
  await rebuildCompanyIndex(session, { memory });
  const waiting = session.actions.filter((action) => action.state === "waiting");
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].statement, "the booth opens at nine");
  assert.equal(waiting[0].decisionId, "decision-1");
});

test("Maple keeps the words that follow the name, and a misheard Sederunt does not", async () => {
  const memory = countingMemory();
  const session = createSession();
  const missed = await handleUtterance(
    {
      door: "meeting",
      text: "federrant hey sedarant the booth opens at nine",
      session,
      memberId: "rowan",
      room: room(),
      participants: ["rowan"],
    },
    { memory },
  );
  assert.equal(missed.entered, false);
  assert.equal(session.decisions.length, 0);

  const heard = await handleUtterance(
    {
      door: "meeting",
      text: "Hey Maple the booth opens at nine",
      session,
      memberId: "rowan",
      room: room({ memberIds: ["rowan"] }),
      participants: ["rowan"],
    },
    { memory },
  );
  assert.equal(heard.entered, true);
  assert.match(heard.body, /the booth opens at nine/);
  assert.equal(JSON.stringify(session.decisions).includes("Maple"), false);
});

test("an unaddressed meeting line stays outside, and an addressed line stores the participants", async () => {
  const memory = countingMemory();
  const linear = countingLinear();
  const session = createSession();
  const quiet = await handleUtterance(
    {
      door: "meeting",
      text: "The offsite is in Lisbon",
      session,
      memberId: "rowan",
      room: room(),
      participants: ["rowan", "alex"],
    },
    { memory, linear },
  );
  assert.equal(quiet.entered, false);
  assert.equal(quiet.body, "");
  assert.equal(session.decisions.length, 0);
  assert.equal(memory.calls.length, 0);
  assert.deepEqual(linear.calls, []);

  const heard = await handleUtterance(
    {
      door: "meeting",
      text: "Hey @Maple the offsite is in Lisbon",
      session,
      memberId: "rowan",
      room: room({ memberIds: ["sam"] }),
      participants: ["rowan", "alex"],
    },
    { memory },
  );
  assert.equal(heard.entered, true);
  assert.match(heard.body, /Lisbon/);
  assert.deepEqual(session.decisions[0].inviteMemberIds, ["rowan", "alex"]);
  const sam = await recall({ session, memberId: "sam", room: room() }, { linear });
  assert.doesNotMatch(sam.body, /Lisbon/);
  const rowan = await recall({ session, memberId: "rowan", room: room() }, { linear });
  assert.match(rowan.body, /Lisbon/);
  assert.deepEqual(linear.calls, []);
});

test("a channel member can recall the decision, and someone outside it cannot", async () => {
  const channel = room({ id: "channel-1", kind: "channel", source: "slack" });
  const session = createSession();
  const stored = await handleUtterance(
    { door: "channel", text: "Ship the booth on Friday", session, memberId: "rowan", room: channel },
    {},
  );
  assert.match(stored.body, /booth/);
  const alex = await recall({ session, memberId: "alex", room: channel }, {});
  assert.match(alex.body, /booth/);
  const sam = await recall({ session, memberId: "sam", room: channel }, {});
  assert.doesNotMatch(sam.body, /booth/);
  assert.match(sam.body, /not-invited/);
});

test("a Slack huddle stores no decision", async () => {
  const session = createSession();
  const result = await handleUtterance(
    {
      door: "meeting",
      text: "Hey @Maple the offsite is in Lisbon",
      session,
      memberId: "rowan",
      room: room({ source: "slack-huddle" }),
    },
    {},
  );
  assert.equal(session.decisions.length, 0);
  assert.doesNotMatch(result.body, /Lisbon/);
  assert.match(result.body, /Slack huddle is not a meeting/);
});

test("the typed path still answers when the meeting adapter fails", async () => {
  let joins = 0;
  const linear = countingLinear();
  const session = createSession();
  const result = await handleUtterance(
    { text: "What tickets are open for the trip?", session, join: { url: "https://example.test/meet" } },
    {
      linear,
      meeting: {
        async join() {
          joins += 1;
          throw new Error("recall down");
        },
      },
    },
  );
  assert.equal(joins, 1);
  assert.match(result.body, /ROW-8/);
  assert.deepEqual(linear.calls, ["read"]);
});

test("answers and the decision log omit keys, tokens, and account ids", async () => {
  const accountId = "0xcc67abcdef1234567890";
  const token = "lin_api_supersecretvalue";
  const key = "sk-supersecretvalue";
  const session = createSession();
  const result = await handleUtterance(
    utterance(session, `The offsite note is ${accountId} ${token} ${key}`, { accountId }),
    { memory: countingMemory() },
  );
  const revealed = `${JSON.stringify(result)}\n${session.log.join("\n")}\n${JSON.stringify(session.decisions)}`;
  assert.doesNotMatch(revealed, /0xcc67/);
  assert.doesNotMatch(revealed, /lin_api_/);
  assert.doesNotMatch(revealed, /sk-supersecret/);
  assert.match(result.body, /offsite note/);
  const looked = await recall({ session, memberId: "rowan", room: room() }, {});
  const lookedText = `${JSON.stringify(looked)}\n${session.log.join("\n")}`;
  assert.doesNotMatch(lookedText, /0xcc67/);
  assert.doesNotMatch(lookedText, /lin_api_/);
  assert.doesNotMatch(lookedText, /sk-supersecret/);
});

test("the gate names no fallback endpoint", async () => {
  const files = ["../src/typed-path.js", "../src/mcp.js", "../src/domain/allow.js", "../src/parse.js"];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /fullnode/i);
  assert.doesNotMatch(joined, /tatum\.io/i);
  assert.doesNotMatch(joined, /relayer\.memory/i);
  assert.doesNotMatch(joined, /mcp\.linear\.app/i);
  assert.doesNotMatch(joined, /recall\.ai/i);
  assert.doesNotMatch(joined, /api\.wal\.app/i);
});
