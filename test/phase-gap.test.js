import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";
import { clashStatuses } from "../src/domain/clash.js";
import { renderProof } from "../src/domain/proof.js";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { CONSOLE_TAB, createConsoleAdapter } from "../src/console/upload.js";
import { renderLanding } from "../src/landing.js";
import { createMeetingAdapter } from "../src/meeting/recall.js";
import { handleMcpRequest } from "../src/mcp.js";
import { ledgerDirectory, ledgerMemory } from "../src/memory/ledger.js";
import { mockAccount } from "../src/memory/mock-account.js";
import { createSession } from "../src/session.js";
import { createTatumReader } from "../src/tatum/get-object.js";
import { handleUtterance } from "../src/typed-path.js";

globalThis.fetch = async () => {
  throw new Error("phase gap tests must not call the network");
};

function room(overrides = {}) {
  return {
    id: "room-1",
    kind: "meeting",
    source: "meet",
    botPresent: true,
    memberIds: ["rowan", "alex", "mina"],
    ...overrides,
  };
}

function utterance(session, text, extra = {}) {
  return {
    text,
    session,
    memberId: "rowan",
    room: room(),
    deliveryId: extra.deliveryId || text,
    ...extra,
  };
}

test("a note, a recall, and a refused action log the event fields and omit secrets", async () => {
  const previous = process.env.LINEAR_MCP_TOKEN;
  process.env.LINEAR_MCP_TOKEN = "lin_api_fromenvsecret";
  const lines = [];
  const session = createSession();
  const secret = "0xcc67abcdef1234567890";
  try {
    await handleUtterance(utterance(session, `The offsite note is ${secret}`, { deliveryId: "note-1" }), {
      log(event) { lines.push(event); },
    });
    await handleUtterance(utterance(session, "what was decided", { deliveryId: "recall-1" }), {
      log(event) { lines.push(event); },
    });
    await handleUtterance(utterance(session, "File the venue ticket", { deliveryId: "refused-1" }), {
      log(event) { lines.push(event); },
      linear: { async createIssue() { throw new Error("should not run"); } },
    });
    assert.equal(lines.length >= 3, true);
    for (const event of lines) {
      assert.equal(typeof event.time, "string");
      assert.equal(typeof event.requestId, "string");
      assert.equal(typeof event.route, "string");
      assert.equal(typeof event.kind, "string");
      assert.equal(typeof event.status, "string");
      assert.equal("preference" in event, true);
      assert.equal(typeof event.tool, "string");
      assert.equal(typeof event.outcome, "string");
      assert.equal(event.keyPresent, true);
    }
    const dumped = JSON.stringify(lines);
    assert.equal(dumped.includes("lin_api_fromenvsecret"), false);
    assert.equal(dumped.includes(secret), false);
    assert.equal(dumped.includes("offsite"), false);
  } finally {
    if (previous === undefined) delete process.env.LINEAR_MCP_TOKEN;
    else process.env.LINEAR_MCP_TOKEN = previous;
  }
});

test("an empty room says there are no notes yet and does not recall", async () => {
  let recalls = 0;
  const session = createSession();
  const result = await handleUtterance({
    text: "what was decided",
    session,
    memberId: "rowan",
    room: room(),
    intent: "recall",
    deliveryId: "empty-room",
  }, {
    memory: {
      async index() { return []; },
      async recall() { recalls += 1; return []; },
    },
  });
  assert.match(result.body, /there are no notes yet/);
  assert.equal(recalls, 0);
  assert.equal(session.decisions.length, 0);
});

test("an assignment with no owner creates no issue under do or ask", async () => {
  const linear = { calls: [], async createIssue() { this.calls.push("create"); return { id: "ROW-1" }; } };
  const session = createSession();
  await handleUtterance(utterance(session, "set linear to do"), { linear });
  const missing = await handleUtterance(utterance(session, "assign the booth", { deliveryId: "own-do" }), { linear });
  assert.match(missing.body, /Who owns it\?/);
  assert.equal(linear.calls.length, 0);
  await handleUtterance(utterance(session, "set linear to ask"), { linear });
  const asked = await handleUtterance(utterance(session, "assign the booth", { deliveryId: "own-ask" }), { linear });
  assert.match(asked.body, /Who owns it\?/);
  assert.equal(linear.calls.length, 0);
});

test("a forced calendar failure stays recorded and a later success stores the event id", async () => {
  let fail = true;
  const calendar = {
    calls: [],
    async readDay(day) { return { day, events: [] }; },
    async listTools() { return [{ name: "move_event", write: true }]; },
    async call() {
      this.calls.push("call");
      if (fail) throw new Error("calendar down");
      return { eventId: "evt-friday" };
    },
  };
  const session = createSession();
  await handleUtterance(utterance(session, "set calendar to do"), { calendar });
  const failed = await handleUtterance(
    utterance(session, "Move the review to Friday", { deliveryId: "cal-fail" }),
    { calendar },
  );
  assert.equal(failed.status, "recorded");
  assert.match(failed.body, /The edit did not happen/);
  assert.equal(failed.issueId, null);
  assert.equal(session.actions.at(-1).state, "available");
  fail = false;
  const moved = await handleUtterance(
    utterance(session, "Move the review to Friday", { deliveryId: "cal-ok" }),
    { calendar },
  );
  assert.equal(moved.status, "updated");
  assert.equal(moved.issueId, "evt-friday");
  assert.equal(calendar.calls.length, 2);
});

test("recall and act omit secrets that are present in the environment", async () => {
  const previous = {
    LINEAR_MCP_TOKEN: process.env.LINEAR_MCP_TOKEN,
    RECALL_API_KEY: process.env.RECALL_API_KEY,
    CONSOLE_API_KEY: process.env.CONSOLE_API_KEY,
    CONSOLE_SERVICE_PRIVATE_KEY: process.env.CONSOLE_SERVICE_PRIVATE_KEY,
    TATUM_API_KEY: process.env.TATUM_API_KEY,
    CALENDAR_MCP_TOKEN: process.env.CALENDAR_MCP_TOKEN,
  };
  process.env.LINEAR_MCP_TOKEN = "lin_api_toolsecret";
  process.env.RECALL_API_KEY = "recall-key-toolsecret";
  process.env.CONSOLE_API_KEY = "console-api-toolsecret";
  process.env.CONSOLE_SERVICE_PRIVATE_KEY = "suiprivkey1toolsecretvalue";
  process.env.TATUM_API_KEY = "tatum-key-toolsecret";
  process.env.CALENDAR_MCP_TOKEN = "calendar-token-toolsecret";
  const session = createSession();
  try {
    await handleUtterance(utterance(session, "The kiln color is settled"), {});
    const recalled = await handleMcpRequest({
      name: "recall",
      arguments: { text: "what was decided", session, memberId: "rowan", room: room() },
    }, {});
    const acted = await handleMcpRequest({
      name: "act",
      arguments: {
        text: "File the venue ticket hall-secret",
        session,
        memberId: "rowan",
        room: room(),
        deliveryId: "act-secret",
      },
    }, { linear: { calls: [], async createIssue() { this.calls.push("create"); return { id: "ROW-1" }; } } });
    const dumped = `${JSON.stringify(recalled)}\n${JSON.stringify(acted)}`;
    assert.match(dumped, /kiln/);
    for (const value of Object.values({
      a: "lin_api_toolsecret",
      b: "recall-key-toolsecret",
      c: "console-api-toolsecret",
      d: "suiprivkey1toolsecretvalue",
      e: "tatum-key-toolsecret",
      f: "calendar-token-toolsecret",
    })) {
      assert.equal(dumped.includes(value), false);
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("the proof markup and the landing omit an account id and a key", () => {
  const accountId = "0xabc123def4567890";
  const key = "suiprivkey1proofsecretvalue";
  const html = renderProof({
    checkpoint: 12,
    preference: "ask",
    status: "current",
    accountId,
    delegateKey: key,
    ownerKey: key,
  });
  assert.match(html, /checkpoint 12/);
  assert.match(html, /preference ask/);
  assert.equal(html.includes(accountId), false);
  assert.equal(html.includes("suiprivkey1"), false);
  const landing = renderLanding();
  assert.equal(landing.includes(accountId), false);
  assert.equal(landing.includes(key), false);
});

test("a read-only console key is rejected before any upload", async () => {
  const apiKey = "console-api-pagetest";
  const serviceKey = "suiprivkey1pagetestvalue";
  const adapter = createConsoleAdapter({ scope: "read_only", apiKey, serviceKey });
  await assert.rejects(() => adapter.upload({ name: "notes.pdf", bytes: "bytes" }), /read-only/);
  assert.deepEqual(adapter.calls, []);
  const landing = renderLanding();
  const log = JSON.stringify([{ tool: "console", outcome: "refused", keyPresent: true }]);
  assert.equal(`${landing}\n${log}`.includes(apiKey), false);
  assert.equal(`${landing}\n${log}`.includes(serviceKey), false);
  assert.match(CONSOLE_TAB, /Walrus Memory/);
  assert.match(CONSOLE_TAB, /metadata/);
});

test("the six adapters own their calls and do not open the network when unconfigured", async () => {
  const env = {};
  await assert.rejects(() => createTatumReader(env).getObject("blob-1"), /Tatum key not set/);
  assert.deepEqual(await createCalendarAdapter(env).listTools(), []);
  await assert.rejects(() => createConsoleAdapter({ apiKey: "", scope: "" }).upload({ name: "a.txt" }), /not configured/);
  await assert.rejects(() => createMeetingAdapter(env).join(), /not configured/);
  const session = createSession();
  const linear = { calls: [], async createIssue() { this.calls.push("create"); return { id: "ROW-1" }; } };
  await handleUtterance(utterance(session, "File the venue ticket hall-wait", { deliveryId: "wait-1" }), { linear });
  assert.deepEqual(linear.calls, ["create"]);
});

test("a long transcript stores one sentence and facts, and one idempotency key yields one blob id", async () => {
  const sentence = "The booth ships on Friday.";
  const tail = "The dock opens at dawn. ".repeat(30);
  const memory = { calls: [], async remember(input) { this.calls.push(input); return { blobId: null }; } };
  const session = createSession();
  await handleUtterance({
    text: `${sentence} ${tail}`,
    session,
    memberId: "rowan",
    room: room(),
    deliveryId: "long-1",
    audio: "AUDIOBYTES-long",
  }, { memory });
  assert.equal(session.decisions[0].text, sentence);
  assert.equal(session.decisions[0].facts.length > 0, true);
  assert.equal(session.decisions[0].facts.length <= 20, true);
  const stored = JSON.stringify(memory.calls);
  assert.equal(stored.includes("AUDIOBYTES"), false);
  assert.equal(stored.includes(tail), false);

  const account = mockAccount({ accountId: "company-account-1", delegates: ["company-key"] });
  const first = await account.remember({ text: sentence, idempotencyKey: "same-key", delegateKey: "company-key" });
  const second = await account.remember({ text: sentence, idempotencyKey: "same-key", delegateKey: "company-key" });
  assert.equal(first.blobId, second.blobId);
  assert.equal(typeof first.blobId, "string");
  assert.equal(first.blobId.length > 0, true);
  const hits = await account.recall(sentence, "company-key");
  assert.equal(hits.length, 1);
});

test("a company note and a private note use different accounts, and the company key is refused", async () => {
  const company = mockAccount({ accountId: "company-account-2", delegates: ["company-key"] });
  const personal = mockAccount({ accountId: "personal-account-2", delegates: ["personal-key"] });
  const companyNote = await company.remember({
    text: "The company keeps the north wall",
    idempotencyKey: "company-note",
    delegateKey: "company-key",
  });
  const personalNote = await personal.remember({
    text: "The private note stays with Mina",
    idempotencyKey: "personal-note",
    delegateKey: "personal-key",
  });
  assert.notEqual(companyNote.accountId, personalNote.accountId);
  await assert.rejects(
    () => personal.remember({ text: "nope", idempotencyKey: "refused", delegateKey: "company-key" }),
    /refused/,
  );
  const personalHits = await personal.recall("private", "personal-key");
  assert.equal(JSON.stringify(personalHits).includes("north wall"), false);
});

test("a stored decision round-trips the document fields and clash", async () => {
  const accountId = "company-ledger-fields";
  const delegateKey = "delegate-ledger-fields";
  const memory = ledgerMemory({ accountId, delegateKey });
  const session = createSession();
  try {
    await handleUtterance(utterance(session, "The offsite is in Lisbon", {
      deliveryId: "field-a",
      checkpoint: 40,
      knowableAtCheckpoint: 40,
    }), { memory });
    const first = session.decisions[0];
    await handleUtterance(utterance(session, "The offsite is in Porto", {
      deliveryId: "field-b",
      checkpoint: 41,
      knowableAtCheckpoint: 41,
      decision: { contradicts: [first.id] },
    }), { memory });
    const fresh = createSession();
    const heard = await handleUtterance({
      text: "what was decided",
      session: fresh,
      memberId: "rowan",
      room: room(),
      intent: "recall",
      deliveryId: "field-recall",
    }, { memory });
    assert.match(heard.body, /Lisbon/);
    assert.match(heard.body, /Porto/);
    const rebuilt = clashStatuses(fresh.decisions);
    assert.equal(rebuilt.every((row) => row.status === "clashing"), true);
    for (const decision of fresh.decisions) {
      assert.equal(decision.roomId, "room-1");
      assert.equal(decision.inviteMemberIds.includes("rowan"), true);
      assert.equal(decision.speakerMemberId, "rowan");
      assert.equal(decision.kind, "decision");
      assert.equal(Number.isInteger(decision.checkpoint), true);
      assert.equal(decision.blobId, null);
      assert.equal(decision.objectId, null);
      assert.equal(Object.hasOwn(decision, "connectorId"), true);
    }
  } finally {
    await rm(ledgerDirectory(accountId), { recursive: true, force: true });
  }
});

test("a channel the bot did not join stores nothing, and one it joined stores one decision", async () => {
  const memory = { calls: [], async remember(input) { this.calls.push(input); return { blobId: null }; } };
  const closed = createSession();
  const skipped = await handleUtterance({
    door: "channel",
    text: "The channel keeps the red copy",
    session: closed,
    memberId: "rowan",
    room: room({ id: "channel-closed", kind: "channel", source: "slack", botPresent: false, memberIds: ["rowan"] }),
    deliveryId: "channel-closed",
  }, { memory });
  assert.equal(closed.decisions.length, 0);
  assert.equal(memory.calls.length, 0);
  assert.doesNotMatch(skipped.body, /red copy/);

  const open = createSession();
  const stored = await handleUtterance({
    door: "channel",
    text: "The channel keeps the red copy",
    session: open,
    memberId: "rowan",
    room: room({ id: "channel-open", kind: "channel", source: "slack", botPresent: true, memberIds: ["rowan", "alex"] }),
    deliveryId: "channel-open",
  }, { memory });
  assert.equal(open.decisions.length, 1);
  assert.match(stored.body, /red copy/);
  assert.equal(memory.calls.length, 1);
});

test("the same spoken request waits on ask and completes once on do", async () => {
  const linear = { calls: [], async createIssue() { this.calls.push("create"); return { identifier: "ROW-88", id: "ROW-88" }; } };
  const session = createSession();
  const people = ["rowan", "alex", "mina"];
  const meet = room({ id: "room-spoken", memberIds: ["sam"] });
  await handleUtterance({
    door: "meeting",
    text: "Hey @Maple set linear to ask",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "spoken-ask-pref",
  }, { linear });
  const waiting = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple File the venue ticket spoken-hall",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "spoken-ask",
  }, { linear });
  assert.match(waiting.body, /preference ask/);
  assert.equal(waiting.link, null);
  assert.deepEqual(linear.calls, []);
  await handleUtterance({
    door: "meeting",
    text: "Hey @Maple set linear to do",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "spoken-do-pref",
  }, { linear });
  const filed = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple File the venue ticket spoken-hall",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "spoken-do",
  }, { linear });
  assert.equal(filed.status, "filed");
  assert.equal(filed.issueId, "ROW-88");
  assert.deepEqual(linear.calls, ["create"]);
});

test("the bot's own line does not become a second decision", async () => {
  const session = createSession();
  const meet = room({ memberIds: ["rowan", "sederunt"] });
  await handleUtterance(utterance(session, "The booth ships on Friday", { room: meet, deliveryId: "bot-store" }), {});
  const answer = await handleUtterance(utterance(session, "what was decided", { room: meet, deliveryId: "bot-ask" }), {});
  assert.match(answer.body, /booth/);
  const echo = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple The booth ships on Friday",
    session,
    memberId: "sederunt",
    room: meet,
    participants: ["rowan", "sederunt"],
    addressed: true,
    deliveryId: "bot-echo",
  }, {});
  assert.equal(session.decisions.length, 1);
  assert.doesNotMatch(echo.body, /current/);
});

test("a second delegate still reads a note after the meeting key is removed", async () => {
  const accountId = "company-ledger-removed";
  const meetingKey = "delegate-meeting";
  const readerKey = "delegate-reader";
  const memory = ledgerMemory({ accountId, delegateKey: meetingKey });
  const session = createSession();
  const linear = { calls: [], async createIssue() { this.calls.push("create"); return { identifier: "ROW-90", id: "ROW-90" }; } };
  try {
    await handleUtterance(utterance(session, "set linear to do"), { memory, linear });
    await handleUtterance(utterance(session, "The spare key stays readable", { deliveryId: "removed-store" }), { memory, linear });
    await handleUtterance(utterance(session, "File the venue ticket spare-hall", { deliveryId: "removed-file" }), { memory, linear });
    await memory.addDelegate(readerKey);
    const reader = ledgerMemory({ accountId, delegateKey: readerKey });
    const fresh = createSession();
    const heard = await handleUtterance({
      text: "what was decided",
      session: fresh,
      memberId: "rowan",
      room: room(),
      intent: "recall",
      deliveryId: "removed-recall",
    }, { memory: reader });
    assert.match(heard.body, /spare key/);
    assert.match(heard.body, /ROW-90/);
    await memory.removeDelegate(meetingKey);
    await assert.rejects(
      () => memory.remember({ text: "later", idempotencyKey: "later", account: "company", kind: "note" }),
      /Delegate/,
    );
    const again = createSession();
    const still = await handleUtterance({
      text: "what was decided",
      session: again,
      memberId: "rowan",
      room: room(),
      intent: "recall",
      deliveryId: "removed-still",
    }, { memory: reader });
    assert.match(still.body, /spare key/);
  } finally {
    await rm(ledgerDirectory(accountId), { recursive: true, force: true });
  }
});
