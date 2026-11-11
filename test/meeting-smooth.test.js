import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createSession } from "../src/session.js";
import { closingReply, filedVoiceLine, imperativeTitle, titleFromAnswer } from "../src/meeting/agent.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { createApp } from "../src/server.js";
import { handleUtterance, memoryKey } from "../src/typed-path.js";

// Live retest 5, Nov 11 2026, Recall bot ae224b81 (Meet mwj-huhh-wjn), dpl_9qPxiz3i565LqfFr3Zm7HVtaTwQU.

/** Walrus Memory refuses a used idempotency key with other content (409). */
function walrus() {
  const byKey = new Map();
  const errors = [];
  const docs = [];
  return {
    errors,
    docs,
    async remember(row) {
      const body = JSON.stringify({ ...row, idempotencyKey: undefined });
      if (byKey.has(row.idempotencyKey) && byKey.get(row.idempotencyKey) !== body) {
        const error = new Error("Walrus Memory server error (409): {\"error\":\"idempotency_key was already used for a request with different content\"}");
        errors.push(row.kind);
        throw error;
      }
      byKey.set(row.idempotencyKey, body);
      docs.push(row);
      return { blobId: `blob-${docs.length}` };
    },
    async index() { return []; },
  };
}

function voiceFiling(session, title, deliveryId, spokenTitle = "") {
  return {
    text: `file the ${title}`,
    voiceFile: true,
    spokenTitle,
    door: "mcp",
    clientName: "meeting",
    memberId: "100",
    deliveryId,
    room: { id: "bot-ae224", botPresent: true, source: "recall", kind: "meeting", memberIds: ["100"] },
    participants: ["100"],
    session,
  };
}

test("activity rows from two function instances do not share a memory key (Walrus 409 at 07:47:06 UTC)", async () => {
  const memory = walrus();
  const logs = [];
  const deps = (n) => ({ memory, tenantId: "t-1", log: (row) => logs.push(row), linear: { async createIssue() { return { identifier: `ROW-${n}`, id: `ROW-${n}` }; } } });
  // Each instance has its own session, so its activity counter starts at the same number.
  const first = await handleUtterance(voiceFiling(createSession(), "Fix the onboarding email", "voice-file-1"), deps(71));
  const second = await handleUtterance(voiceFiling(createSession(), "Ship the pricing page", "voice-file-2"), deps(72));
  assert.equal(first.issueId, "ROW-71");
  assert.equal(second.issueId, "ROW-72");
  assert.deepEqual(memory.errors, [], "no write was refused");
  assert.equal(logs.some((row) => row.kind === "memory-remember-error"), false);
  const activity = memory.docs.filter((row) => row.kind === "activity");
  assert.equal(activity.length >= 2, true);
  assert.equal(new Set(activity.map((row) => row.activity.id)).size, activity.length, "activity ids are unique");
});

test("an exact retry keeps its key; other content under the same key gets another", () => {
  const doc = { kind: "activity", text: "activity a", idempotencyKey: "activity-1", activity: { id: "activity-1", verb: "create" } };
  assert.equal(memoryKey(doc), memoryKey(structuredClone(doc)));
  assert.notEqual(memoryKey(doc), memoryKey({ ...doc, activity: { id: "activity-1", verb: "assign" } }));
  const action = { kind: "action", text: "action a 1", idempotencyKey: "a:action:1", actionItem: { actionRecord: { id: "a", state: "sending" } } };
  assert.equal(memoryKey(action), memoryKey(structuredClone(action)));
  assert.notEqual(memoryKey(action), memoryKey({ ...action, actionItem: { actionRecord: { id: "a", state: "closed" } } }));
  // A decision keeps its plain key, so a second copy with other content is still refused.
  assert.equal(memoryKey({ kind: "decision", text: "d", idempotencyKey: "delivery-9", decision: { id: "d1" } }), "delivery-9");
  assert.equal(memoryKey(doc).length <= 255, true);
});

test("a spoken title is put back into the imperative, and only a leading slip", () => {
  assert.equal(titleFromAnswer("fixed the onboarding email before launch"), "Fix the onboarding email before launch");
  assert.equal(titleFromAnswer("Okay, so um, fixed the onboarding email before launch."), "Fix the onboarding email before launch");
  assert.equal(titleFromAnswer("updated the pricing page copy!"), "Update the pricing page copy");
  assert.equal(titleFromAnswer("removed the old banner from the home page"), "Remove the old banner from the home page");
  assert.equal(imperativeTitle("created the launch checklist"), "Create the launch checklist");
  assert.equal(imperativeTitle("email the team that we fixed it"), "Email the team that we fixed it");
  assert.equal(imperativeTitle("fixed"), "Fixed");
  assert.equal(imperativeTitle("finished the deck"), "Finished the deck", "not on the list");
});

test("the issue keeps the words as heard in its description", async () => {
  const created = [];
  const deps = { memory: walrus(), tenantId: "t-1", linear: { async createIssue(input) { created.push(input); return { identifier: "ROW-73", id: "ROW-73" }; } } };
  const title = titleFromAnswer("fixed the onboarding email before launch.");
  const result = await handleUtterance(voiceFiling(createSession(), title, "voice-file-3", "fixed the onboarding email before launch."), deps);
  assert.equal(result.issueId, "ROW-73");
  assert.equal(created[0].title, "Fix the onboarding email before launch");
  assert.match(created[0].description, /Heard: "fixed the onboarding email before launch\."/);
});

test("the confirmation names the Linear issue when Linear returns its id", () => {
  assert.equal(filedVoiceLine("Fix the onboarding email before launch", "ROW-71"), "I filed ROW-71, 'Fix the onboarding email before launch'.");
  assert.equal(filedVoiceLine("Fix the onboarding email before launch", ""), "I filed the Linear issue 'Fix the onboarding email before launch'.");
  assert.equal(filedVoiceLine("Fix it", "not an id"), "I filed the Linear issue 'Fix it'.");
});

test("thanks and goodbye to Adam have a short reply; other lines do not", () => {
  assert.equal(closingReply("Thanks, Adam."), "You're welcome.");
  assert.equal(closingReply("thanks adam"), "You're welcome.");
  assert.equal(closingReply("okay, thank you so much"), "You're welcome.");
  assert.equal(closingReply("bye Adam"), "Bye for now.");
  assert.equal(closingReply("thanks adam, can you also file the pricing bug"), "");
  assert.equal(closingReply("thanks for the update on billing"), "");
});

const EAR = "9a".repeat(24);
const TENANT = "77777777-7777-4777-8777-777777777777";
const BOT = "ae224b81-f5db-4049-bf97-9e4152f70f02";

function redisFake(store) {
  return (init) => {
    const command = JSON.parse(init.body);
    const list = Array.isArray(command[0]) ? command : [command];
    const results = [];
    for (const item of list) {
      const [op, key, ...rest] = item;
      let result = "OK";
      if (op === "SET") {
        if (rest.includes("NX") && store.has(key)) result = null;
        else store.set(key, String(rest[0] ?? "1"));
      } else if (op === "GET") result = store.has(key) ? store.get(key) : null;
      else if (op === "DEL") result = store.delete(key) ? 1 : 0;
      results.push(result);
    }
    const payload = Array.isArray(command[0]) ? results.map((result) => ({ result })) : { result: results[0] };
    return { ok: true, json: async () => payload };
  };
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", port, method: "POST", path: "/api/meeting/agent/turn",
      headers: { "content-type": "application/json", "x-meeting-ear": EAR, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const sentences = (raw) => raw.split("\n\n").filter((block) => block.startsWith("event: sentence"))
  .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}").text);

async function thanksTurn(people) {
  const store = new Map();
  const redis = redisFake(store);
  const chats = [];
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith("https://redis.test")) return redis(init);
    chats.push(url);
    return { ok: true, status: 200, body: { async *[Symbol.asyncIterator]() { yield Buffer.from("data: [DONE]\n\n"); } } };
  };
  const session = createSession();
  const meetingVoice = {};
  const app = createApp({
    session,
    meetingVoice,
    agentSeats: [{ ear: EAR, botId: BOT, tenantId: TENANT, roomId: BOT, botName: "Adam" }],
    env: { OPENROUTER_API_KEY: "sk-or-v1-smooth", UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "redis-token" },
    deps: { memory: walrus() },
    sessions: new Map([[TENANT, session]]),
    fetch: fetchImpl,
  });
  for (const [id, name] of people) noteAgentMember({ meetingVoice }, BOT, { participantId: id, name, memberId: id });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const raw = await post(app.address().port, JSON.stringify({ text: "Thanks, Adam.", speaker: "Anh Nguyen", participantId: "100", turn_id: "t-thanks", people: people.map(([id]) => id) }));
    return { raw, chats };
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
}

test("solo call: 'Thanks, Adam.' gets 'You're welcome.' without a model call", async () => {
  const { raw, chats } = await thanksTurn([["100", "Anh Nguyen"]]);
  assert.deepEqual(sentences(raw), ["You're welcome."], raw);
  assert.equal(chats.length, 0);
});

test("group call: 'Thanks, Adam.' gets no reply", async () => {
  const { raw } = await thanksTurn([["100", "Anh Nguyen"], ["101", "Bao Tran"]]);
  assert.deepEqual(sentences(raw), []);
});

test("the page goes back to listening as soon as a turn ends with nothing to say", async () => {
  const page = renderCameraPage();
  const script = page.slice(page.indexOf("<script>") + "<script>".length, page.indexOf("</script>"));
  const posts = [];
  const intervals = [];
  let socket = null;
  let now = 1_000_000;
  const guest = { dataset: { state: "listening" }, textContent: "" };
  class Socket { constructor() { socket = this; } }
  const empty = new TextEncoder().encode("event: done\ndata: {}\n\n");
  vm.runInNewContext(script, {
    URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder,
    Date: { now: () => now },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: { getElementById: (id) => (id === "voice" ? {} : guest) },
    location: { search: `?ear=${EAR}&name=Adam` },
    navigator: {},
    window: {},
    fetch: (url, init) => {
      posts.push({ url: String(url), body: init && init.body ? String(init.body) : "" });
      if (String(url) === "/api/meeting/agent/turn") {
        let sent = false;
        return Promise.resolve({ ok: true, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: empty }; } }; } } });
      }
      return Promise.resolve({ ok: true, json: async () => ({ botName: "Adam", participantId: "", direct: true }), body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  intervals.forEach((fn) => fn());
  await settle();
  socket.onmessage({ data: JSON.stringify({ event: "transcript.data", data: { data: { words: "thanks adam".split(" ").map((text) => ({ text })), participant: { id: 100, name: "Anh Nguyen" } } } }) });
  for (let step = 0; step < 12; step += 1) {
    now += 200;
    intervals.forEach((fn) => fn());
    await settle();
  }
  assert.equal(posts.filter((row) => row.url === "/api/meeting/agent/turn").length, 1);
  assert.equal(guest.dataset.state, "listening");
  assert.equal(posts.some((row) => row.url === "/api/meeting/agent/cancel"), false);
});
