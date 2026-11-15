import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createSession } from "../src/session.js";
import { asksForWrite, cancelsAnswer, isTitleQuestion, linesForSpeech, TITLE_QUESTION, titleFromAnswer } from "../src/meeting/agent.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { createApp } from "../src/server.js";

// Live failure on Nov 11 2026 (bot c2795c83): greeting -> Adam asked for a title anyway;
// "create a task on Linear" -> title question; the title answer came 67 s later,
// was an imperative ("Fix the onboarding email before launch."), and no turn ran.

const EAR = "ab".repeat(24);
const KEY = "sk-or-v1-title-test-key";
const TENANT = "44444444-4444-4444-8444-444444444444";
const TITLE = "Fix the onboarding email before launch";

function chatStream(text) {
  const frames = [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, "data: [DONE]\n\n"];
  return { async *[Symbol.asyncIterator]() { for (const frame of frames) yield Buffer.from(frame); } };
}

function toolCallStream(name, args) {
  const payload = `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name, arguments: JSON.stringify(args) } }] } }],
  })}\n\ndata: [DONE]\n\n`;
  return { async *[Symbol.asyncIterator]() { yield Buffer.from(payload); } };
}

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

function boot(fetchImpl, extra) {
  return createApp({
    session: extra.session,
    meetingVoice: extra.meetingVoice,
    agentSeats: extra.seats,
    env: { OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: "google/gemma-4-31b-it:free", ...extra.env },
    deps: { memory: null, ...(extra.deps || {}) },
    sessions: extra.sessions,
    fetch: fetchImpl,
  });
}

async function listen(app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  return app.address().port;
}

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method: "POST",
      path: "/api/meeting/agent/turn",
      headers: { "content-type": "application/json", "x-meeting-ear": EAR, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sentences(raw) {
  return raw.split("\n\n").filter((block) => block.startsWith("event: sentence"))
    .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}").text);
}

function turn(text, turnId, people = ["7"]) {
  return JSON.stringify({ text, speaker: "Anh Nguyen", participantId: "7", turn_id: turnId, people });
}

function heardLine(store, botId) {
  const raw = store.get(`sederunt:voice:heard-line:${botId}`);
  return raw ? JSON.parse(raw) : null;
}

/** Expire the 20 s conversation floor, as the 67 s gap in the live call did. */
function expireFloor(store, session) {
  for (const key of [...store.keys()]) if (/floor/i.test(key)) store.delete(key);
  delete session.meetingFloor;
}

function rig({ seats, deps = {}, chatsFor }) {
  const store = new Map();
  const chats = [];
  const redis = redisFake(store);
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) return redis(init);
    if (target.includes("openrouter.ai")) {
      const payload = JSON.parse(init.body);
      chats.push(payload);
      return { ok: true, status: 200, body: chatsFor(payload) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const session = createSession();
  const meetingVoice = {};
  const shared = {
    session,
    meetingVoice,
    seats,
    sessions: new Map([[TENANT, session]]),
    env: { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "redis-token" },
    deps,
  };
  return { store, chats, session, meetingVoice, fetchImpl, shared };
}

function liveModel(payload) {
  const messages = payload.messages || [];
  const tool = [...messages].reverse().find((message) => message.role === "tool");
  if (tool) {
    if (String(tool.content).includes("needs_title")) return chatStream(TITLE_QUESTION);
    return chatStream("Done.");
  }
  const user = String([...messages].reverse().find((message) => message.role === "user")?.content || "");
  const last = user.split("\n").pop();
  // The live greeting reply asked for a title before anything was requested.
  if (/can you hear me/i.test(last)) return chatStream("I can hear you. What should the issue say?");
  if (/create a task on linear/i.test(last)) return toolCallStream("act", { title: "a task" });
  return chatStream("Okay.");
}

test("greeting, vague Linear ask, late imperative title: Adam files once and confirms", async () => {
  const issues = [];
  const linear = {
    async createIssue(input) {
      issues.push(input);
      return { identifier: "ROW-42", id: "ROW-42" };
    },
  };
  const seat = { ear: EAR, botId: "bot-live", tenantId: TENANT, roomId: "bot-live", botName: "Adam" };
  const live = rig({ seats: [seat], deps: { linear }, chatsFor: liveModel });
  const first = boot(live.fetchImpl, live.shared);
  const second = boot(live.fetchImpl, live.shared);
  noteAgentMember({ meetingVoice: live.meetingVoice }, "bot-live", { participantId: "7", name: "Anh Nguyen", memberId: "7" });
  const firstPort = await listen(first);
  const secondPort = await listen(second);
  try {
    const hello = await post(firstPort, turn("Hey Adam, can you hear me?", "t-hello"));
    assert.equal(hello.status, 200);
    assert.deepEqual(sentences(hello.raw), ["I can hear you."]);
    assert.equal(heardLine(live.store, "bot-live").awaiting, null);

    const ask = await post(secondPort, turn("Adam, create a task on Linear.", "t-ask"));
    assert.deepEqual(sentences(ask.raw), [TITLE_QUESTION]);
    const waiting = heardLine(live.store, "bot-live").awaiting;
    assert.equal(waiting.kind, "title");
    assert.equal(waiting.until > Date.now() + 60_000, true);
    assert.equal(issues.length, 0);

    expireFloor(live.store, live.session);
    const chatsBefore = live.chats.length;
    const answered = await post(firstPort, turn(`${TITLE}.`, "t-title"));
    assert.equal(answered.status, 200);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].title, TITLE);
    assert.deepEqual(sentences(answered.raw), [`I filed ROW-42, '${TITLE}'.`]);
    assert.equal(live.chats.length, chatsBefore, "the answered title does not go back to the model");
    assert.equal(heardLine(live.store, "bot-live").awaiting, null);

    // The host repeated the title 48 s later in the live call. It must not file again.
    expireFloor(live.store, live.session);
    for (const key of [...live.store.keys()]) if (key.includes(":said:")) live.store.delete(key);
    await post(secondPort, turn(`${TITLE}.`, "t-title-again"));
    assert.equal(issues.length, 1);
  } finally {
    await close(first);
    await close(second);
  }
});

test("a fresh bot does not inherit a pending title question", async () => {
  const issues = [];
  const linear = { async createIssue(input) { issues.push(input); return { identifier: "ROW-1", id: "ROW-1" }; } };
  const seats = [
    { ear: EAR, botId: "bot-new", tenantId: TENANT, roomId: "bot-new", botName: "Adam" },
  ];
  const live = rig({ seats, deps: { linear }, chatsFor: () => chatStream("Okay.") });
  // An earlier meeting's bot left a title question open.
  live.store.set("sederunt:voice:heard-line:bot-old", JSON.stringify({
    text: "Adam, create a task on Linear.", speaker: "Anh Nguyen", turn: "old", roomId: "bot-old",
    assistant: TITLE_QUESTION, hold: null, awaiting: { kind: "title", speaker: "Anh Nguyen", until: Date.now() + 60_000 },
  }));
  const app = boot(live.fetchImpl, live.shared);
  noteAgentMember({ meetingVoice: live.meetingVoice }, "bot-new", { participantId: "7", name: "Anh Nguyen", memberId: "7" });
  const port = await listen(app);
  try {
    const heard = await post(port, turn(`${TITLE}.`, "t-fresh", ["7", "8"]));
    assert.equal(heard.status, 200);
    assert.deepEqual(sentences(heard.raw), []);
    assert.equal(issues.length, 0);
    assert.equal(live.chats.length, 0);
    assert.equal(heardLine(live.store, "bot-new"), null);
  } finally {
    await close(app);
  }
});

test("an expired or other-speaker title question is not an answer", async () => {
  const issues = [];
  const linear = { async createIssue(input) { issues.push(input); return { identifier: "ROW-1", id: "ROW-1" }; } };
  const seats = [{ ear: EAR, botId: "bot-x", tenantId: TENANT, roomId: "bot-x", botName: "Adam" }];
  const live = rig({ seats, deps: { linear }, chatsFor: () => chatStream("Okay.") });
  const app = boot(live.fetchImpl, live.shared);
  noteAgentMember({ meetingVoice: live.meetingVoice }, "bot-x", { participantId: "7", name: "Anh Nguyen", memberId: "7" });
  const port = await listen(app);
  const pending = (speaker, until) => live.store.set("sederunt:voice:heard-line:bot-x", JSON.stringify({
    text: "Adam, create a task on Linear.", speaker, turn: `t-${until}`, roomId: "bot-x",
    assistant: TITLE_QUESTION, hold: null, awaiting: { kind: "title", speaker, until },
  }));
  try {
    pending("Anh Nguyen", Date.now() - 1);
    await post(port, turn(`${TITLE}.`, "t-expired", ["7", "8"]));
    pending("Sam Lee", Date.now() + 60_000);
    await post(port, turn("Ship the pricing page.", "t-other", ["7", "8"]));
    assert.equal(issues.length, 0);
    assert.equal(live.chats.length, 0);
  } finally {
    await close(app);
  }
});

test("title helpers: a title question only follows a write ask", () => {
  assert.equal(isTitleQuestion(TITLE_QUESTION), true);
  assert.equal(isTitleQuestion("I can hear you."), false);
  assert.equal(asksForWrite("Hey Adam, can you hear me?"), false);
  assert.equal(asksForWrite("Adam, create a task on Linear."), true);
  assert.deepEqual(linesForSpeech("I can hear you. What should the issue say?", [], { done: true, titleAsk: false }), ["I can hear you."]);
  assert.deepEqual(linesForSpeech("What should the issue say?", [], { done: true, titleAsk: true }), [TITLE_QUESTION]);
  assert.deepEqual(linesForSpeech("", [{ reason: "needs_title" }], { done: true, titleAsk: false }), [TITLE_QUESTION]);
  assert.equal(titleFromAnswer(`${TITLE}.`), TITLE);
  assert.equal(titleFromAnswer("Adam, it should say fix the onboarding email."), "Fix the onboarding email");
  assert.equal(titleFromAnswer("Hey Adam, call it ship the pricing page!"), "Ship the pricing page");
  assert.equal(titleFromAnswer("thanks"), "");
  assert.equal(titleFromAnswer("a task"), "");
  assert.equal(titleFromAnswer("No, cancel that."), "");
  assert.equal(titleFromAnswer("Adam, never mind the issue"), "");
  assert.equal(titleFromAnswer("What did we decide about launch?"), "");
});

function openPage(sessionBody, replies) {
  const page = renderCameraPage();
  const start = page.indexOf("<script>");
  const end = page.indexOf("</script>");
  const posts = [];
  let now = 1_000_000;
  const intervals = [];
  let socket = null;
  const guest = { dataset: { state: "listening" }, textContent: "" };
  const windowBox = {};
  class Socket { constructor() { socket = this; } }
  const sse = (text) => {
    const bytes = new TextEncoder().encode(`event: sentence\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {}\n\n`);
    let sent = false;
    return { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; } }; } };
  };
  vm.runInNewContext(page.slice(start + "<script>".length, end), {
    URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder,
    Date: { now: () => now },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: { getElementById: (id) => (id === "voice" ? {} : guest) },
    location: { search: `?ear=${EAR}&name=Adam` },
    navigator: {},
    window: windowBox,
    fetch: (url, init) => {
      const target = String(url);
      posts.push({ url: target, body: init && init.body ? String(init.body) : "" });
      if (target === "/api/meeting/agent/turn") {
        const reply = replies.shift();
        return Promise.resolve({ ok: true, body: reply ? sse(reply) : null });
      }
      if (target === "/api/meeting/agent/speak") return Promise.resolve(null);
      return Promise.resolve({ ok: true, json: async () => sessionBody, body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return {
    turns: () => posts.filter((row) => row.url === "/api/meeting/agent/turn").map((row) => JSON.parse(row.body)),
    async say(text, id = 7, name = "Anh Nguyen") {
      socket.onmessage({ data: JSON.stringify({
        event: "transcript.data",
        data: { data: { words: text.split(" ").map((word) => ({ text: word })), participant: { id, name } } },
      }) });
      now += 1300;
      intervals.forEach((fn) => fn());
      await settle();
    },
    advance(ms) { now += ms; },
    openFloor(name) { windowBox.__sederunt.noteAnswer(name, now, true); },
    async boot() { intervals.forEach((fn) => fn()); await settle(); },
  };
}

test("the meeting page sends the title answer that comes after Adam's question", async () => {
  const page = openPage({ botName: "Adam", participantId: "99", direct: true }, [
    "I can hear you.",
    TITLE_QUESTION,
    `I filed the Linear issue '${TITLE}'.`,
  ]);
  await page.boot();
  await page.say("hey adam can you hear me");
  await page.say("create a task on linear");
  assert.equal(page.turns().length, 2);
  page.advance(67_000);
  await page.say("fix the onboarding email before launch");
  assert.equal(page.turns().length, 3);
  assert.equal(page.turns()[2].text, "fix the onboarding email before launch");
});

test("the meeting page keeps a 20 s floor when Adam did not ask anything", async () => {
  const page = openPage({ botName: "Adam", participantId: "99", direct: true }, ["I can hear you."]);
  await page.boot();
  await page.say("hey adam can you hear me");
  assert.equal(page.turns().length, 1);
  page.advance(67_000);
  await page.say("fix the onboarding email before launch");
  assert.equal(page.turns().length, 1);
});

test("a line the page did not send can still be sent when it is said again", async () => {
  const page = openPage({ botName: "Adam", participantId: "99", direct: false }, []);
  await page.boot();
  await page.say("fix the onboarding email before launch");
  assert.equal(page.turns().length, 0);
  await page.say("Adam fix the onboarding email before launch");
  assert.equal(page.turns().length, 1);
  const again = openPage({ botName: "Adam", participantId: "99", direct: false }, []);
  await again.boot();
  await again.say("fix the onboarding email before launch");
  assert.equal(again.turns().length, 0);
  // Adam's floor opens for this speaker (as after his question); the same words again are sent.
  again.openFloor("Anh Nguyen");
  await again.say("fix the onboarding email before launch");
  assert.equal(again.turns().length, 1, "an earlier unsent copy of the line does not block the answer");
});

test("title answers: questions, greetings, thanks, and narration are never a title", () => {
  for (const line of [
    "What time is it", "how long will this take", "Can you hear me", "Is this thing on",
    "Thank you so much", "Hello Adam how are you", "Sorry I did not catch that",
    "Let me share my screen first", "Let's move on to the budget", "I think we should wait",
    "I filed the Linear issue", "Sure. What should the issue say", "One second please",
  ]) assert.equal(titleFromAnswer(line), "", line);
  assert.equal(titleFromAnswer("Okay, fix the onboarding email"), "Fix the onboarding email");
  assert.equal(titleFromAnswer("Yes, ship the pricing page"), "Ship the pricing page");
  assert.equal(titleFromAnswer("Can't log in on Safari"), "Can't log in on Safari");
  assert.equal(cancelsAnswer("Adam, never mind"), true);
  assert.equal(cancelsAnswer("No, cancel that."), true);
  assert.equal(cancelsAnswer(TITLE), false);
});

function pendingRig(botId, speaker = "Anh Nguyen") {
  const issues = [];
  const linear = { async createIssue(input) { issues.push(input); return { identifier: "ROW-9", id: "ROW-9" }; } };
  const seats = [{ ear: EAR, botId, tenantId: TENANT, roomId: botId, botName: "Adam" }];
  const live = rig({ seats, deps: { linear }, chatsFor: () => chatStream("Okay.") });
  live.store.set(`sederunt:voice:heard-line:${botId}`, JSON.stringify({
    text: "Adam, create a task on Linear.", speaker, turn: "t-q", roomId: botId,
    assistant: TITLE_QUESTION, hold: null, awaiting: { kind: "title", speaker, until: Date.now() + 60_000 },
  }));
  const app = boot(live.fetchImpl, live.shared);
  noteAgentMember({ meetingVoice: live.meetingVoice }, botId, { participantId: "7", name: "Anh Nguyen", memberId: "7" });
  return { issues, live, app };
}

test("never mind closes the pending title question; later chatter is not filed", async () => {
  const { issues, live, app } = pendingRig("bot-nm");
  const port = await listen(app);
  try {
    await post(port, turn("Never mind.", "t-nm", ["7", "8"]));
    assert.equal(heardLine(live.store, "bot-nm").awaiting, null);
    await post(port, turn("Ship the pricing page by Friday.", "t-after", ["7", "8"]));
    assert.equal(issues.length, 0);
  } finally {
    await close(app);
  }
});

test("no, cancel that answers the title question without filing", async () => {
  const { issues, live, app } = pendingRig("bot-cancel");
  const port = await listen(app);
  try {
    const res = await post(port, turn("No, cancel that.", "t-cancel", ["7", "8"]));
    assert.deepEqual(sentences(res.raw), ["Okay, I won't file it."]);
    assert.equal(issues.length, 0);
    assert.equal(live.chats.length, 0);
    assert.equal(heardLine(live.store, "bot-cancel").awaiting, null);
  } finally {
    await close(app);
  }
});

test("a question while the title is pending goes to the model and files nothing", async () => {
  const { issues, live, app } = pendingRig("bot-q");
  const port = await listen(app);
  try {
    await post(port, turn("What time is it", "t-q2", ["7", "8"]));
    assert.equal(issues.length, 0);
    assert.equal(live.chats.length, 1);
  } finally {
    await close(app);
  }
});

test("a title question with no named asker does not file an unnamed speaker's line", async () => {
  const { issues, app } = pendingRig("bot-anon", "");
  const port = await listen(app);
  try {
    await post(port, turn(`${TITLE}.`, "t-anon", ["7", "8"]));
    assert.equal(issues.length, 0);
  } finally {
    await close(app);
  }
});
