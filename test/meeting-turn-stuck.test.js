import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createSession } from "../src/session.js";
import { TITLE_QUESTION } from "../src/meeting/agent.js";
import { pageBeat } from "../src/meeting/agent-http.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { createApp } from "../src/server.js";

// Live retest Nov 11 2026, Recall bot e75fb7eb: Recall transcribed the title answer
// (participant 100, final), the page sent it at 06:34:19, and the turn ran into the
// 60 s Vercel limit inside the voice Linear filing (two awaited Walrus writes before
// the Linear call). No turn log, no reply, and the page stayed deaf behind turnOpen.

const EAR = "ab".repeat(24);
const KEY = "sk-or-v1-stuck-test-key";
const TENANT = "55555555-5555-4555-8555-555555555555";
const TITLE = "Fix the onboarding email before launch";
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/recall-e75fb-socket.json", import.meta.url), "utf8"));

function pageRig(sessionBody, replies) {
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
  const hang = () => ({ getReader() { return { read: () => new Promise(() => {}) }; } });
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
      posts.push({ url: target, body: init && init.body ? String(init.body) : "", at: now });
      if (target === "/api/meeting/agent/turn") {
        const reply = replies.shift();
        if (reply === "hang") return Promise.resolve({ ok: true, body: hang() });
        return Promise.resolve({ ok: true, body: reply ? sse(reply) : null });
      }
      if (target === "/api/meeting/agent/speak") return Promise.resolve(null);
      return Promise.resolve({ ok: true, json: async () => sessionBody, body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return {
    posts,
    window: windowBox,
    turns: () => posts.filter((row) => row.url === "/api/meeting/agent/turn").map((row) => JSON.parse(row.body)),
    beats: () => posts.filter((row) => row.url === "/api/meeting/agent/log" && row.body.includes("\"beat\"")).map((row) => JSON.parse(row.body).beat),
    async replay(events, tailMs = 2000) {
      intervals.forEach((fn) => fn());
      await settle();
      const base = now;
      const last = events.length ? events[events.length - 1].at : 0;
      let index = 0;
      for (let t = 0; t <= last + tailMs; t += 200) {
        now = base + t;
        while (index < events.length && events[index].at <= t) {
          socket.onmessage({ data: JSON.stringify(events[index].message) });
          index += 1;
        }
        intervals.forEach((fn) => fn());
        await settle();
      }
    },
  };
}

test("the real e75fb socket sequence: the page sends the title answer", async () => {
  const page = pageRig({ botName: "Adam", participantId: "", direct: true }, ["Yes, I can hear you.", TITLE_QUESTION, "hang"]);
  await page.replay(FIXTURE.events);
  const sent = page.turns().map((row) => row.text);
  assert.deepEqual(sent, ["hey adam can you hear me", "create a task on linear", "fix the onboarding email before launch"]);
  assert.equal(String(page.turns()[2].participantId), "100");
});

test("a turn that never ends does not leave the page deaf", async () => {
  const page = pageRig({ botName: "Adam", participantId: "", direct: true }, ["Yes, I can hear you.", TITLE_QUESTION, "hang", TITLE_QUESTION]);
  await page.replay(FIXTURE.events, 34_000);
  const stats = page.window.__sederunt.stats();
  assert.equal(stats.stuck, 1);
  assert.equal(stats.asked, 3);
  assert.equal(stats.done, 2);
  // Adam's own voice (participant 2147483647, no name) is an echo, not a person or a turn.
  assert.equal(stats.echo >= 2, true);
  const extra = FIXTURE.events.filter((row) => row.message.transcript.participant.id === 100).slice(-7)
    .map((row) => ({ at: row.at - FIXTURE.events[0].at, message: JSON.parse(JSON.stringify(row.message).replaceAll("fix", "ship")) }));
  await page.replay(extra.map((row, index) => ({ at: index * 100, message: row.message })));
  assert.equal(page.turns().length, 4, "the next line after the stuck turn is still sent");
});

test("the page heartbeat carries counts and flags, never words", async () => {
  const page = pageRig({ botName: "Adam", participantId: "", direct: true }, ["Yes, I can hear you.", TITLE_QUESTION, "hang"]);
  await page.replay(FIXTURE.events, 6000);
  const beats = page.beats();
  assert.equal(beats.length >= 1, true);
  const last = beats[beats.length - 1];
  assert.equal(last.asked, 3);
  assert.equal(last.turnOpen, true);
  assert.equal(last.turnMs > 0, true);
  const raw = JSON.stringify(beats);
  for (const word of ["onboarding", "linear", "hear", "issue", "Anh"]) assert.equal(raw.toLowerCase().includes(word.toLowerCase()), false, word);
  const clean = pageBeat({ ...last, text: "fix the onboarding email", state: "<script>" });
  assert.equal("text" in clean, false);
  assert.equal(clean.state, "");
  assert.equal(clean.asked, 3);
});

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

function sentences(raw) {
  return raw.split("\n\n").filter((block) => block.startsWith("event: sentence"))
    .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}").text);
}

test("a title answer files and speaks while slow memory writes are still running", async () => {
  const store = new Map();
  const redis = redisFake(store);
  const releases = [];
  const docs = [];
  // Walrus Memory writes took 20-30 s each in production. These never finish until released.
  const memory = {
    remember(row) {
      return new Promise((resolve) => releases.push(() => { docs.push(structuredClone(row)); resolve({ blobId: `blob-${docs.length}` }); }));
    },
    async index() { return docs.map((row) => structuredClone(row)); },
  };
  const issues = [];
  const linear = { async createIssue(input) { issues.push(input); return { identifier: "ROW-77", id: "ROW-77" }; } };
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) return redis(init);
    return { ok: true, status: 200, body: { async *[Symbol.asyncIterator]() { yield Buffer.from("data: [DONE]\n\n"); } } };
  };
  const session = createSession();
  const meetingVoice = {};
  const app = createApp({
    session,
    meetingVoice,
    agentSeats: [{ ear: EAR, botId: "bot-slow", tenantId: TENANT, roomId: "bot-slow", botName: "Adam" }],
    env: { OPENROUTER_API_KEY: KEY, UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "redis-token" },
    deps: { memory, linear },
    sessions: new Map([[TENANT, session]]),
    fetch: fetchImpl,
  });
  noteAgentMember({ meetingVoice }, "bot-slow", { participantId: "100", name: "Anh Nguyen", memberId: "100" });
  store.set("sederunt:voice:heard-line:bot-slow", JSON.stringify({
    text: "Adam, create a task on Linear.", speaker: "Anh Nguyen", turn: "t-q", roomId: "bot-slow",
    assistant: TITLE_QUESTION, hold: null, awaiting: { kind: "title", speaker: "Anh Nguyen", until: Date.now() + 60_000 },
  }));
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const started = Date.now();
    const reply = await Promise.race([
      post(port, JSON.stringify({ text: `${TITLE}.`, speaker: "Anh Nguyen", participantId: "100", turn_id: "t-title", people: ["100"] })),
      new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000)),
    ]);
    assert.notEqual(reply, "TIMEOUT", "the turn waited on memory writes");
    assert.equal(Date.now() - started < 3000, true);
    assert.deepEqual(sentences(reply), [`I filed the Linear issue '${TITLE}'.`]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].title, TITLE);
    assert.equal(releases.length >= 2, true, "memory writes were started, not dropped");
    assert.equal(docs.length, 0);
    while (releases.length) releases.shift()();
    await new Promise((resolve) => setImmediate(resolve));
    const background = [...(app.workspace?.agentRuntime?.background || [])];
    await Promise.allSettled(background);
    const records = docs.filter((row) => row.kind === "action" && row.actionItem?.actionRecord);
    const revisions = records.map((row) => row.actionItem.actionRecord);
    assert.equal(revisions.some((row) => row.state === "closed" && row.connectorId === "ROW-77"), true);
    assert.equal(new Set(records.map((row) => row.idempotencyKey)).size, records.length, "no two writes share a key");
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
});

test("a slow turn past the server's 25 s cap ends on its own before the page cuts it", async () => {
  const page = pageRig({ botName: "Adam", participantId: "", direct: true }, ["hang"]);
  await page.replay(FIXTURE.events, 34_000);
  const first = page.posts.find((row) => row.url === "/api/meeting/agent/turn");
  const cancel = page.posts.find((row) => row.url === "/api/meeting/agent/cancel");
  assert.ok(first && cancel);
  // The server ends a slow turn at 25 s with its own done event; the page waits longer than that.
  assert.equal(cancel.at - first.at >= 32_000, true, String(cancel.at - first.at));
  assert.equal(page.window.__sederunt.stats().stuck, 1);
});
