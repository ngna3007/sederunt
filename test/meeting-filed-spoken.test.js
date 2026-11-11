import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createSession } from "../src/session.js";
import { TITLE_QUESTION } from "../src/meeting/agent.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { createApp } from "../src/server.js";

// Live retest 4, Nov 11 2026, Recall bot be88aa49 (Meet qwf-demp-jwm), dpl_4knbrTYetcyCDs8S9GNCaaTdvYV9.
// The title answer filed (07:24:18 UTC typed-path status "filed", turn outcomes ["filed"]) and the
// page counted the sentence (heartbeat sentences 2 -> 3), but no audio started: no playback log,
// Recall heard nothing from Adam until the call ended at 07:24:57. /speak only plays a line of the
// current turn, and it compared the line's turn with the heard line cached in that function
// instance. An instance that had served the earlier question turn still held that turn, so the
// filed line was refused (409) and the page dropped it without a retry.

const EAR = "ef".repeat(24);
const KEY = "sk-or-v1-filed-spoken-key";
const TENANT = "66666666-6666-4666-8666-666666666666";
const BOT = "be88aa49-d913-46d4-b05b-281dcd69ab2e";
const TITLE = "Fix the onboarding email before launch";
const FILED = `I filed the Linear issue '${TITLE}'.`;

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

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", port, method: "POST", path,
      headers: { "content-type": "application/json", "x-meeting-ear": EAR, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", raw: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sentences(raw) {
  return String(raw).split("\n\n").filter((block) => block.startsWith("event: sentence"))
    .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}").text);
}

/** Two function instances of one deployment: separate memory, one Redis. */
async function twoInstances() {
  const store = new Map();
  const redis = redisFake(store);
  const memory = { remember() { return new Promise(() => {}); }, async index() { return []; } };
  const issues = [];
  const linear = { async createIssue(input) { issues.push(input); return { identifier: "ROW-21", id: "ROW-21" }; } };
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) return redis(init);
    if (target.endsWith("/audio/speech")) {
      let sent = false;
      return { ok: true, status: 200, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: new Uint8Array([0xff, 0xfb, 0x90, 0x00]) }; }, cancel() {} }; } } };
    }
    const body = JSON.parse(init.body);
    // The model's answer to the first request is Adam's title question.
    const text = body.messages?.some((row) => /create a task/i.test(String(row.content))) ? TITLE_QUESTION : "Yes, I can hear you.";
    return { ok: true, status: 200, body: { async *[Symbol.asyncIterator]() {
      yield Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      yield Buffer.from("data: [DONE]\n\n");
    } } };
  };
  const meetingVoice = {};
  const make = () => {
    const session = createSession();
    return createApp({
      session,
      meetingVoice,
      agentSeats: [{ ear: EAR, botId: BOT, tenantId: TENANT, roomId: BOT, botName: "Adam" }],
      env: { OPENROUTER_API_KEY: KEY, UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "redis-token" },
      deps: { memory, linear },
      sessions: new Map([[TENANT, session]]),
      fetch: fetchImpl,
    });
  };
  const apps = [make(), make()];
  noteAgentMember({ meetingVoice }, BOT, { participantId: "100", name: "Anh Nguyen", memberId: "100" });
  for (const app of apps) {
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
  }
  return {
    issues,
    store,
    ports: apps.map((app) => app.address().port),
    close: () => Promise.all(apps.map((app) => new Promise((resolve) => app.close(resolve)))),
  };
}

const turn = (text, id) => JSON.stringify({ text, speaker: "Anh Nguyen", participantId: "100", turn_id: id, people: ["100"] });

test("the filed line from the title answer is spoken even when /speak lands on another instance", async () => {
  const rig = await twoInstances();
  const [a, b] = rig.ports;
  try {
    // Turn 2 (the question) ran on instance B, and B played it.
    const asked = await post(b, "/api/meeting/agent/turn", turn("Hey Adam, create a task on Linear.", "1794381842000"));
    assert.deepEqual(sentences(asked.raw), [TITLE_QUESTION]);
    const question = await post(b, "/api/meeting/agent/speak", JSON.stringify({ text: TITLE_QUESTION }));
    assert.equal(question.status, 200);
    // Turn 3 (the title) ran on instance A and filed.
    const filed = await post(a, "/api/meeting/agent/turn", turn(`${TITLE}.`, "1794381855705"));
    assert.deepEqual(sentences(filed.raw), [FILED], "the SSE stream carries the spoken confirmation");
    assert.match(String(filed.raw), /event: sentence[\s\S]*event: done/, "the sentence comes before done");
    assert.equal(rig.issues.length, 1);
    // The page's /speak for that line was routed to instance B.
    const spoken = await post(b, "/api/meeting/agent/speak", JSON.stringify({ text: FILED }));
    assert.equal(spoken.status, 200, "the filed line was refused by an instance holding the earlier turn");
    assert.equal(spoken.type, "audio/mpeg");
    assert.equal(spoken.raw.length > 0, true);
    // A line from the earlier turn is still refused.
    const stale = await post(b, "/api/meeting/agent/speak", JSON.stringify({ text: TITLE_QUESTION }));
    assert.equal(stale.status, 409);
  } finally {
    await rig.close();
  }
});

function pageRig(turnBodies, speakStatuses) {
  const page = renderCameraPage();
  const start = page.indexOf("<script>");
  const end = page.indexOf("</script>");
  const posts = [];
  let now = 1_000_000;
  const intervals = [];
  const timers = [];
  let socket = null;
  const guest = { dataset: { state: "listening" }, textContent: "" };
  const windowBox = {};
  const played = [];
  class Socket { constructor() { socket = this; } }
  const stream = (raw) => {
    const bytes = new TextEncoder().encode(raw);
    let sent = false;
    return { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; } }; } };
  };
  class AudioContext {
    get destination() { return {}; }
    decodeAudioData() { return Promise.resolve({}); }
    createBufferSource() {
      const source = { connect() {}, start() { played.push(source.text); setImmediate(() => source.onended && source.onended()); }, stop() {} };
      source.text = lastSpoken;
      return source;
    }
  }
  let lastSpoken = "";
  vm.runInNewContext(page.slice(start + "<script>".length, end), {
    URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder,
    Date: { now: () => now },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + (Number(ms) || 0) }); return timers.length; },
    clearTimeout: () => {},
    document: { getElementById: (id) => (id === "voice" ? {} : guest) },
    location: { search: `?ear=${EAR}&name=Adam` },
    navigator: {},
    window: { ...windowBox, AudioContext },
    fetch: (url, init) => {
      const target = String(url);
      const body = init && init.body ? String(init.body) : "";
      posts.push({ url: target, body, at: now });
      if (target === "/api/meeting/agent/turn") {
        const raw = turnBodies.shift();
        return Promise.resolve({ ok: true, body: raw ? stream(raw) : null });
      }
      if (target === "/api/meeting/agent/speak") {
        const status = speakStatuses.length ? speakStatuses.shift() : 200;
        lastSpoken = JSON.parse(body).text;
        if (status !== 200) return Promise.resolve({ ok: false, status, body: null });
        return Promise.resolve({ ok: true, status: 200, body: null, arrayBuffer: async () => new Uint8Array([0xff, 0xfb]).buffer });
      }
      return Promise.resolve({ ok: true, json: async () => ({ botName: "Adam", participantId: "", direct: true }), body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return {
    posts,
    played,
    speaks: () => posts.filter((row) => row.url === "/api/meeting/agent/speak").map((row) => JSON.parse(row.body).text),
    async say(text) {
      intervals.forEach((fn) => fn());
      socket.onmessage({ data: JSON.stringify({ event: "transcript.data", data: { data: { words: text.split(" ").map((word) => ({ text: word })), participant: { id: 100, name: "Anh Nguyen" } } } }) });
      for (let step = 0; step < 40; step += 1) {
        now += 200;
        for (const timer of timers.splice(0).filter((row) => row)) {
          if (timer.at <= now) timer.fn(); else timers.push(timer);
        }
        intervals.forEach((fn) => fn());
        await settle();
      }
    },
  };
}

test("the page plays the filed line, and tries a refused line once more", async () => {
  const filedStream = `event: tool_started\ndata: {"name":"act"}\n\nevent: sentence\ndata: ${JSON.stringify({ text: FILED, hash: "h" })}\n\nevent: done\ndata: {}\n\n`;
  const page = pageRig([filedStream], [409, 200]);
  await page.say("Adam fix the onboarding email before launch");
  assert.deepEqual(page.speaks(), [FILED, FILED]);
  assert.deepEqual(page.played, [FILED], "the page played the filed confirmation");
});
