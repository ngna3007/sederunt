import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { inlineIssueTitle } from "../src/meeting/agent.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { parseScheduleUtterance, scheduledVoiceLine, tidyEventTitle } from "../src/meeting/schedule.js";
import { noteAgentMember, noteMeetingHost } from "../src/meeting/seat.js";
import { applyScheduleDefaults } from "../src/meeting/voice-write.js";
import { drainMemoryRetries, isRateLimited, retryAfterMs, withRateLimitRetry } from "../src/memory/retry.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { handleUtterance } from "../src/typed-path.js";

// Demo dry run 2, Nov 11 2026 09:40-09:42 UTC, Meet zaa-fohn-yvh, Recall bot 0fde3ab3,
// prod b05e57d (dpl_7mDxtwXUkBMGG42MKEh8CScNVvbT). The fixture is Recall's own
// transcript of the call, with the realtime finals the page committed.
const RUN = JSON.parse(readFileSync(new URL("./fixtures/meeting-dry-run-0fde3ab3.json", import.meta.url), "utf8"));
const EAR = "6d".repeat(24);
const TENANT = "44444444-4444-4444-8444-444444444444";
const BOT = RUN.botId;
const HOST = RUN.host;
const HOST_WORDS = RUN.segments.filter((row) => row.participantId === HOST.participantId).flatMap((row) => row.words);
const LINEAR_FINALS = RUN.realtimeFinals.slice(1, 3);
const CALENDAR_LINE = RUN.realtimeFinals[3].text;
const NOW = new Date("2026-11-11T09:41:37.000Z");

function chatStream(text) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return { async *[Symbol.asyncIterator]() { yield Buffer.from(payload); } };
}

function toolCallStream(name, args) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name, arguments: JSON.stringify(args) } }] } }] })}\n\ndata: [DONE]\n\n`;
  return { async *[Symbol.asyncIterator]() { yield Buffer.from(payload); } };
}

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json", ...headers, "content-length": Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const turn = (port, text, extra = {}) => post(port, "/api/meeting/agent/turn", JSON.stringify({
  text, speaker: HOST.speaker, participantId: HOST.participantId, people: [HOST.participantId], ...extra,
}), { "x-meeting-ear": EAR });

const sentences = (raw) => raw.split("\n\n").filter((block) => block.startsWith("event: sentence"))
  .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}"));

async function boot({ model, deps = {}, seat = {}, env = {}, memory } = {}) {
  const session = createSession();
  const meetingVoice = {};
  const app = createApp({
    session,
    meetingVoice,
    companyLoaded: true,
    agentSeats: [{ ear: EAR, botId: BOT, tenantId: TENANT, roomId: BOT, botName: "Adam", ...seat }],
    env: { OPENROUTER_API_KEY: "sk-or-v1-dry-run-2", ...env },
    deps: { memory: memory || { async remember() { return { blobId: "saved" }; }, async index() { return []; }, async recall() { return []; } }, app: { timeZone: "Asia/Ho_Chi_Minh" }, ...deps },
    sessions: new Map([[TENANT, session]]),
    fetch: async (url, init) => model(url, init),
  });
  noteAgentMember({ meetingVoice }, BOT, { participantId: HOST.participantId, name: HOST.speaker, memberId: HOST.participantId });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  return { app, session, meetingVoice, port: app.address().port, close: () => new Promise((resolve) => app.close(resolve)) };
}

/** The meeting page in a vm with a fake clock; turn replies come from `reply(n)`. */
function pageRig(reply, options = {}) {
  const page = renderCameraPage();
  const script = page.slice(page.indexOf("<script>") + "<script>".length, page.indexOf("</script>"));
  const posts = [];
  const intervals = [];
  const timers = [];
  let socket = null;
  let now = 3_000_000;
  const guest = { dataset: { state: "listening" }, textContent: "" };
  class Socket { constructor() { socket = this; } }
  const win = {};
  vm.runInNewContext(script, {
    URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder, String,
    Date: { now: () => now },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
    clearTimeout: () => {},
    document: { getElementById: (id) => (id === "voice" ? { play() { return Promise.resolve(); } } : guest) },
    location: { search: `?ear=${EAR}&name=Adam` },
    navigator: {},
    window: win,
    fetch: (url, init) => {
      const target = String(url);
      const row = { url: target, body: init && init.body ? JSON.parse(String(init.body)) : null, at: now, signal: init && init.signal };
      posts.push(row);
      if (target === "/api/meeting/agent/turn") return Promise.resolve(reply(posts.filter((item) => item.url === target).length, row));
      if (target === "/api/meeting/agent/speak") return Promise.resolve(null);
      if (target === "/api/meeting/agent/cancel" && options.cancelStatus) return Promise.resolve({ ok: options.cancelStatus < 300, status: options.cancelStatus });
      return Promise.resolve({ ok: true, json: async () => ({ botName: "Adam", participantId: "", direct: true }), body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return {
    posts,
    win,
    turns: () => posts.filter((row) => row.url === "/api/meeting/agent/turn").map((row) => row.body.text),
    spoken: () => posts.filter((row) => row.url === "/api/meeting/agent/speak").map((row) => row.body.text),
    // Recall's realtime shape (bot e75fb7eb socket capture): transcript.words with is_final.
    send(words, final) {
      socket.onmessage({ data: JSON.stringify({ bot_id: BOT, transcript: {
        speaker: HOST.speaker, speaker_id: Number(HOST.participantId), participant: { id: Number(HOST.participantId), name: HOST.speaker, is_host: true },
        words: words.map((text) => ({ text })), is_final: final,
      } }) });
    },
    async start() { intervals.forEach((fn) => fn()); await settle(); win.__sederunt.noteAnswer(HOST.speaker, now, false); },
    async until(ms) {
      while (now < ms) {
        now += 100;
        intervals.forEach((fn) => fn());
        for (const timer of timers.splice(0)) {
          if (timer.at <= now) timer.fn();
          else timers.push(timer);
        }
        await settle();
      }
    },
    at: (seconds) => 3_000_000 + Math.round(seconds * 1000),
    now: () => now,
  };
}

const hang = () => ({ ok: true, body: { getReader() { return { read: () => new Promise(() => {}) }; } } });
const streamOf = (text) => {
  const bytes = new TextEncoder().encode(`${text ? `event: sentence\ndata: ${JSON.stringify({ text, hash: "h" })}\n\n` : ""}event: done\ndata: {}\n\n`);
  let sent = false;
  return { ok: true, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; } }; } } };
};

/** Replays the Linear line from Recall's word times: partials ~0.4 s behind speech, finals split at "issue,". */
async function replayLinearLine(page, { partials }) {
  const [first, rest] = LINEAR_FINALS;
  const lag = 0.4;
  const words = HOST_WORDS.filter((word) => word.start >= first.from - 0.01 && word.end <= rest.to + 0.01);
  const events = [];
  const split = words.findIndex((word) => word.start >= rest.from - 0.01);
  if (partials) {
    for (let index = 0; index < words.length; index += 1) {
      const from = index < split ? 0 : split;
      events.push({ at: words[index].end + lag, words: words.slice(from, index + 1).map((word) => word.text), final: false });
    }
  }
  events.push({ at: first.to + 0.6, words: first.text.split(" "), final: true });
  events.push({ at: rest.to + 0.6, words: rest.text.split(" "), final: true });
  events.sort((a, b) => a.at - b.at);
  for (const event of events) {
    await page.until(page.at(event.at));
    page.send(event.words, event.final);
  }
  await page.until(page.at(rest.to + 6));
}

test("dry run 2: Recall heard 'launch sync', so the calendar title came from our own parsing", () => {
  const calendar = RUN.segments.find((row) => row.words.some((word) => word.text === "schedule"));
  assert.equal(calendar.words.map((word) => word.text).join(" "), "adam schedule a launch sync tomorrow at 10 am");
  assert.equal(RUN.log.adamSaid[2].includes("for tomorrow at 10 am"), true);
});

test("dry run 2: speech partials hold the Linear line open, so its two finals are one turn", async () => {
  const page = pageRig(() => streamOf(""));
  await page.start();
  await replayLinearLine(page, { partials: true });
  assert.deepEqual(page.turns(), ["Adam, create a linear issue, fix the onboarding email before launch."]);
});

test("dry run 2: without partials, the rest of the line supersedes the silent turn and is asked once, merged", async () => {
  const page = pageRig((count) => (count === 1 ? hang() : streamOf("")));
  await page.start();
  await replayLinearLine(page, { partials: false });
  const turns = page.posts.filter((row) => row.url === "/api/meeting/agent/turn");
  assert.deepEqual(page.turns(), ["Adam, create a linear issue,", "Adam, create a linear issue, fix the onboarding email before launch."]);
  const cancel = page.posts.find((row) => row.url === "/api/meeting/agent/cancel");
  assert.ok(cancel, "the superseded turn is cancelled on the server");
  assert.equal(cancel.body.turn_id, turns[0].body.turn_id, "the cancel names that turn, so it cannot stop the next one");
  assert.equal(turns[0].signal.aborted, true);
  assert.equal(page.win.__sederunt.stats().superseded >= 1, true);
});

test("dry run 2: a superseded turn never speaks, and a turn that already spoke is not superseded", async () => {
  // First turn answers late, after the rest of the line took it back.
  let release;
  const late = new Promise((resolve) => { release = resolve; });
  const bytes = new TextEncoder().encode(`event: sentence\ndata: ${JSON.stringify({ text: "Yes.", hash: "h" })}\n\nevent: done\ndata: {}\n\n`);
  const page = pageRig((count) => (count === 1
    ? { ok: true, body: { getReader() { let sent = false; return { async read() { await late; if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; } }; } } }
    : streamOf("")));
  await page.start();
  await replayLinearLine(page, { partials: false });
  release();
  await page.until(page.now() + 2000);
  assert.deepEqual(page.spoken(), [], "'Yes.' from the superseded turn is not played");

  const spokeFirst = pageRig((count) => (count === 1 ? streamOf("Okay.") : streamOf("")));
  await spokeFirst.start();
  await replayLinearLine(spokeFirst, { partials: false });
  assert.equal(spokeFirst.posts.some((row) => row.url === "/api/meeting/agent/cancel"), false);
});

test("dry run 2: the inline title is read after 'issue,', 'issue:', 'called' and 'saying'", () => {
  assert.equal(inlineIssueTitle(`${LINEAR_FINALS[0].text} ${LINEAR_FINALS[1].text}`), "Fix the onboarding email before launch");
  assert.equal(inlineIssueTitle("Adam, file an issue: update the pricing page"), "Update the pricing page");
  assert.equal(inlineIssueTitle("Adam, open a ticket called refresh the docs"), "Refresh the docs");
  assert.equal(inlineIssueTitle("Adam, log a task saying call the venue"), "Call the venue");
  assert.equal(inlineIssueTitle("Adam, create a linear issue,"), "");
  assert.equal(inlineIssueTitle("Adam, create a linear issue."), "");
  assert.equal(inlineIssueTitle("Adam, create an issue, can you?"), "");
});

test("dry run 2: the merged Linear line files at once with its inline title, no model round, no question", async () => {
  const issues = [];
  const calls = [];
  const ctx = await boot({
    model: async (url) => { calls.push(String(url)); return { ok: true, status: 200, body: chatStream("Yes. What would you like the issue to say?") }; },
    deps: { linear: { connected: true, async createIssue(input) { issues.push(input); return { identifier: "ROW-80", id: "ROW-80", url: "https://linear.app/rowan3007/issue/ROW-80" }; } } },
  });
  try {
    const said = sentences((await turn(ctx.port, `${LINEAR_FINALS[0].text} ${LINEAR_FINALS[1].text}`, { turn_id: "lin-merged" })).raw).map((row) => row.text);
    assert.match(said.join(" "), /I filed ROW-80, 'Fix the onboarding email before launch'/);
    assert.equal(said.some((line) => /\?$/.test(line)), false, "no question");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(issues.length, 1);
    assert.equal(issues[0].title, "Fix the onboarding email before launch");
    assert.equal(calls.length, 0, "no model round");
  } finally {
    await ctx.close();
  }
});

test("dry run 2: the model's own free-form question is answered with a title, not a 'value'", async () => {
  const issues = [];
  const ctx = await boot({
    model: async () => ({ ok: true, status: 200, body: chatStream("Sure. What would you like it to say?") }),
    deps: { linear: { connected: true, async createIssue(input) { issues.push(input); return { identifier: "ROW-81", id: "ROW-81", url: "https://linear.app/rowan3007/issue/ROW-81" }; } } },
  });
  try {
    const first = sentences((await turn(ctx.port, "Adam, create a linear issue.", { turn_id: "lin-ask" })).raw);
    assert.equal(first.some((row) => row.ask), true, first.map((row) => `${row.text}:${row.ask}`).join(" | "));
    const second = sentences((await turn(ctx.port, LINEAR_FINALS[1].text, { turn_id: "lin-answer" })).raw).map((row) => row.text);
    assert.match(second.join(" "), /I filed ROW-81, 'Fix the onboarding email before launch'/);
    assert.equal(issues.length, 1);
  } finally {
    await ctx.close();
  }
});

function calendarStub() {
  const created = [];
  return {
    created,
    async listTools() { return [{ name: "create_event", write: false }]; },
    async call(name, params) {
      created.push({ name, params });
      return { id: "evt-launch-sync", url: "https://calendar.google.com/calendar/event?eid=ZXZ0LWxhdW5jaC1zeW5j" };
    },
  };
}

test("dry run 2: a schedule request after 'What should the issue say?' is a new request, not the issue title", async () => {
  const calendar = calendarStub();
  const issues = [];
  const ctx = await boot({
    model: async (_url, init) => {
      const payload = JSON.parse(init.body);
      if ((payload.messages || []).some((message) => message.role === "tool")) return { ok: true, status: 200, body: chatStream("Done.") };
      const said = JSON.stringify(payload.messages || []);
      if (/schedule a launch sync/i.test(said)) return { ok: true, status: 200, body: toolCallStream("act", { title: "Schedule a launch sync tomorrow at 10 am" }) };
      return { ok: true, status: 200, body: toolCallStream("act", {}) };
    },
    seat: { userId: "inviter-1" },
    deps: {
      calendarForPerson: async () => calendar,
      linear: { connected: true, async createIssue(input) { issues.push(input); return { identifier: "ROW-82", id: "ROW-82" }; } },
      meeting: { async sendChatMessage() { return { ok: true }; } },
    },
  });
  noteMeetingHost({ meetingVoice: ctx.meetingVoice }, BOT, HOST.participantId);
  try {
    const asked = sentences((await turn(ctx.port, "Adam, create a linear issue.", { turn_id: "q-1" })).raw).map((row) => row.text);
    assert.deepEqual(asked, ["What should the issue say?"]);
    const said = sentences((await turn(ctx.port, CALENDAR_LINE, { turn_id: "q-2" })).raw).map((row) => row.text).join(" ");
    assert.equal(issues.length, 0, "the schedule line was not filed as an issue title");
    assert.equal(calendar.created.length, 1);
    assert.equal(calendar.created[0].params.summary, "Launch sync");
    assert.match(said, /I scheduled Launch sync for /);
    assert.equal((said.match(/10(?::00)? ?AM/gi) || []).length, 1, `the time is said once: ${said}`);
  } finally {
    await ctx.close();
  }
});

test("dry run 2: a title that is the spoken request is cut to the event name, and the time is said once", () => {
  const parsed = parseScheduleUtterance(CALENDAR_LINE, { now: NOW, timeZone: "Asia/Ho_Chi_Minh" });
  assert.equal(parsed.title, "Launch sync");
  for (const given of ["Schedule a launch sync tomorrow at 10 am", "a schedule a launch sync tomorrow at 10 am", "Launch sync tomorrow at 10am"]) {
    const { args } = applyScheduleDefaults({ title: given }, CALENDAR_LINE, { now: NOW, timeZone: "Asia/Ho_Chi_Minh" });
    assert.equal(args.title, "Launch sync", given);
    assert.equal(args.summary, "Launch sync", given);
    assert.equal(args.startTime, "2026-11-12T10:00:00+07:00");
  }
  for (const clean of ["Launch sync", "Sync at the office", "Weekly design review"]) assert.equal(tidyEventTitle(clean), clean);
  const line = scheduledVoiceLine({ title: "Schedule a launch sync tomorrow at 10 am", start: "2026-11-12T10:00:00+07:00", timeZone: "Asia/Ho_Chi_Minh", now: NOW });
  assert.equal(line, "I scheduled Launch sync for tomorrow at 10 AM.");
});

// ---- Walrus 429 ----

const RATE_LIMITED = 'Walrus Memory server error (429): {"error":"Rate limit exceeded","layer":"delegate_key","limit":"180 weighted-requests/min","retry_after_seconds":60}';

function fakeRedis() {
  const store = new Map();
  const run = ([op, key, ...rest]) => {
    if (op === "SET") {
      if (rest.includes("NX") && store.has(key)) return null;
      store.set(key, String(rest[0] ?? "1"));
      return "OK";
    }
    if (op === "DEL") return store.delete(key) ? 1 : 0;
    if (op === "LPUSH") { const list = store.get(key) || []; list.unshift(...rest); store.set(key, list); return list.length; }
    if (op === "RPUSH") { const list = store.get(key) || []; list.push(...rest); store.set(key, list); return list.length; }
    if (op === "RPOP") { const list = store.get(key) || []; return list.length ? list.pop() : null; }
    if (op === "GET") return store.has(key) ? store.get(key) : null;
    if (op === "EXPIRE") return store.has(key) ? 1 : 0;
    if (op === "LINDEX") { const list = store.get(key) || []; const at = Number(rest[0]); return list[at < 0 ? list.length + at : at] ?? null; }
    if (op === "LSET") { const list = store.get(key) || []; const at = Number(rest[0]); list[at < 0 ? list.length + at : at] = rest[1]; return "OK"; }
    if (op === "LREM") {
      const list = store.get(key) || [];
      const count = Number(rest[0]);
      const at = count < 0 ? list.lastIndexOf(rest[1]) : list.indexOf(rest[1]);
      if (at < 0) return 0;
      list.splice(at, 1);
      return 1;
    }
    return null;
  };
  return { store, command: async (command) => ({ ok: true, result: { result: run(command) } }) };
}

test("dry run 2: the 429 the heads-up fact hit is recognised with its retry_after", () => {
  assert.equal(isRateLimited(new Error(RATE_LIMITED)), true);
  assert.equal(retryAfterMs(new Error(RATE_LIMITED)), 60_000);
  assert.equal(isRateLimited(new Error("Walrus Memory server error (409): idempotency")), false);
});

test("dry run 2: a 429 backs off and retries, and a fact still refused is queued, then written by the drain", async () => {
  const redis = fakeRedis();
  let refusals = 2;
  const written = [];
  const flaky = { async remember(input) { if (refusals > 0) { refusals -= 1; throw new Error(RATE_LIMITED); } written.push(input); return { blobId: `b-${written.length}` }; } };
  const waits = [];
  const memory = withRateLimitRetry(flaky, { redis: redis.command, waits: [10, 20, 30], wait: async (ms) => { waits.push(ms); }, log: () => {} });
  const saved = await memory.remember({ kind: "decision", text: "The design review moved to Thursday." });
  assert.equal(saved.blobId, "b-1", "the third try went through");
  assert.equal(waits.length, 2);

  // Refused past the budget: the fact is queued, never lost.
  const refusing = { async remember() { throw new Error(RATE_LIMITED); } };
  const queued = withRateLimitRetry(refusing, { tenantId: "t-1", redis: redis.command, waits: [10], wait: async () => {}, log: () => {} });
  assert.deepEqual(await queued.remember({ kind: "decision", text: "The design review moved to Thursday.", idempotencyKey: "k-1" }), { blobId: null, queued: true });
  assert.equal(redis.store.get("sederunt:memory-retry").length, 1);
  // A room snapshot is not queued.
  await assert.rejects(() => queued.remember({ kind: "room", text: "r meeting" }), /429/);

  const later = [];
  const result = await drainMemoryRetries({ redis: redis.command, memoryFor: (tenantId) => ({ async remember(input) { later.push({ tenantId, input }); return { blobId: "late" }; } }), log: () => {} });
  assert.equal(result.drained, 1);
  assert.equal(later[0].tenantId, "t-1");
  assert.equal(later[0].input.idempotencyKey, "k-1");
  assert.equal(redis.store.get("sederunt:memory-retry").length, 0);
});

test("dry run 2: a drain that is rate limited again keeps the fact queued and stops", async () => {
  const redis = fakeRedis();
  await redis.command(["LPUSH", "sederunt:memory-retry", JSON.stringify({ tenantId: "t", input: { kind: "decision", text: "a" }, attempts: 0 })]);
  await redis.command(["LPUSH", "sederunt:memory-retry", JSON.stringify({ tenantId: "t", input: { kind: "decision", text: "b" }, attempts: 0 })]);
  let tries = 0;
  const result = await drainMemoryRetries({ redis: redis.command, memoryFor: () => ({ async remember() { tries += 1; throw new Error(RATE_LIMITED); } }), log: () => {} });
  assert.equal(result.drained, 0);
  assert.equal(tries, 1, "stops at the first refusal");
  assert.equal(redis.store.get("sederunt:memory-retry").length, 2);
  assert.equal(redis.store.has("sederunt:memory-retry:lock"), false, "the lock is released");
});

test("dry run 2: the heads-up decision is recorded when Walrus refuses it with 429", async () => {
  const redis = fakeRedis();
  const memory = withRateLimitRetry({ async remember() { throw new Error(RATE_LIMITED); } }, { redis: redis.command, waits: [5], wait: async () => {}, log: () => {} });
  const session = createSession();
  const room = { id: BOT, botPresent: true, kind: "meeting", memberIds: [HOST.participantId] };
  const result = await handleUtterance({ session, memberId: HOST.participantId, text: RUN.realtimeFinals[0].text, door: "meeting", room, participants: [HOST.participantId], deliveryId: "dry2-heads-up" }, { memory });
  assert.notEqual(result.outcome, "memory-remember-failed", JSON.stringify(result).slice(0, 300));
  assert.equal(session.decisions.some((row) => /design review moved to Thursday/i.test(row.text)), true);
  const queued = (redis.store.get("sederunt:memory-retry") || []).map((row) => JSON.parse(row));
  assert.equal(queued.some((row) => row.input.kind === "decision" && /Thursday/.test(row.input.text)), true);
});

// ---- Console polls ----

test("dry run 2: the console asks a finished room for media once per page load, live rooms first, two at a time", async () => {
  const { renderConsolePage } = await import("../src/console-page.js");
  const page = renderConsolePage();
  const grab = (name) => {
    const start = page.indexOf(`function ${name}(`);
    let depth = 0;
    for (let index = page.indexOf("{", start); index < page.length; index += 1) {
      if (page[index] === "{") depth += 1;
      if (page[index] === "}") { depth -= 1; if (depth === 0) return page.slice(start, index + 1); }
    }
    return "";
  };
  const asked = [];
  let now = 10_000_000;
  const context = {
    progressAt: {},
    state: { rooms: [
      { id: "b38fa40d-954a-4d13-979a-6e5da9943686", call: "done" },
      { id: "ba18bf31-3ac6-42a8-8973-ad64cdc99fe8", call: "done" },
      { id: "b16247e4-f5ef-47a0-bf20-0172f6cc3215", call: "fatal" },
      { id: "0fde3ab3-b2c6-460d-8bb0-34b8d85e97e7", call: "in_call_recording", startedAt: new Date(now).toISOString() },
    ] },
    decisionsFor: () => [],
    roomOf: () => null,
    consoleQuery: () => "",
    fileRoom: "",
    Date: { now: () => now, parse: Date.parse },
    setTimeout: () => 0,
    fetch: (url) => { asked.push(String(url).split("/")[3]); return new Promise(() => {}); },
  };
  vm.runInNewContext(`${grab("meetingNeedsProgress")}\n${grab("refreshMeetingProgress")}\nthis.tick = refreshMeetingProgress;`, context);
  context.tick();
  assert.deepEqual(asked, ["0fde3ab3-b2c6-460d-8bb0-34b8d85e97e7", "b38fa40d-954a-4d13-979a-6e5da9943686"], "live first, two per tick");
  context.tick();
  context.tick();
  assert.equal(asked.length, 4, "each finished room once");
  now += 10 * 60_000;
  context.tick();
  assert.deepEqual(asked.slice(4), ["0fde3ab3-b2c6-460d-8bb0-34b8d85e97e7"], "after ten minutes only the live room is asked again");
});


// ---- Review of PR 26 (Nov 11 2026) ----

test("review: a turn the server says already started a tool is not taken back, so the line is not filed twice", async () => {
  const page = pageRig((count) => (count === 1 ? hang() : streamOf("")), { cancelStatus: 409 });
  await page.start();
  await replayLinearLine(page, { partials: false });
  const turns = page.posts.filter((row) => row.url === "/api/meeting/agent/turn");
  assert.equal(page.posts.some((row) => row.url === "/api/meeting/agent/cancel"), true, "the page asked");
  assert.equal(turns[0].signal.aborted, false, "the writing turn keeps its stream");
  assert.equal(page.turns().some((text) => /create a linear issue, fix the onboarding/i.test(text)), false, "the merged line is not asked again");
});

test("review: the turn lane — the first of write and cancel wins, shared by instances", async () => {
  const { markTurnLane } = await import("../src/meeting/seat.js");
  // In process.
  const ws = {};
  assert.equal(await markTurnLane(ws, BOT, "t1", "write", {}), "write");
  assert.equal(await markTurnLane(ws, BOT, "t1", "cancel", {}), "write");
  assert.equal(await markTurnLane(ws, BOT, "t2", "cancel", {}), "cancel");
  assert.equal(await markTurnLane(ws, BOT, "t2", "write", {}), "cancel");
  // Across instances (Redis): another process sees the first mark.
  const store = new Map();
  const fetchImpl = async (_url, init) => {
    const [op, key, value, ...rest] = JSON.parse(init.body);
    let result = null;
    if (op === "SET") { if (rest.includes("NX") && store.has(key)) result = null; else { store.set(key, value); result = "OK"; } }
    if (op === "GET") result = store.get(key) ?? null;
    return { ok: true, json: async () => ({ result }) };
  };
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "t" };
  assert.equal(await markTurnLane({}, BOT, "t3", "write", env, fetchImpl), "write");
  assert.equal(await markTurnLane({}, BOT, "t3", "cancel", env, fetchImpl), "write");
  assert.equal(await markTurnLane({}, BOT, "t4", "cancel", env, fetchImpl), "cancel");
  assert.equal(await markTurnLane({}, BOT, "t4", "write", env, fetchImpl), "cancel");
});

test("review: cancel answers 409 for a writing turn, and a taken-back turn files nothing", async () => {
  const { markTurnLane } = await import("../src/meeting/seat.js");
  const filed = [];
  const ctx = await boot({
    model: async () => ({ ok: true, status: 200, body: toolCallStream("act", { title: "Fix the onboarding email" }) }),
    deps: { linear: { async createIssue(input) { filed.push(input); return { id: "ROW-1", identifier: "ROW-1", url: "https://linear.app/x/issue/ROW-1" }; } } },
  });
  try {
    await markTurnLane({ meetingVoice: ctx.meetingVoice }, BOT, "writing-1", "write", {});
    const kept = await post(ctx.port, "/api/meeting/agent/cancel", JSON.stringify({ turn_id: "writing-1" }), { "x-meeting-ear": EAR });
    assert.equal(kept.status, 409);
    const taken = await post(ctx.port, "/api/meeting/agent/cancel", JSON.stringify({ turn_id: "taken-1" }), { "x-meeting-ear": EAR });
    assert.equal(taken.status, 204);
    // The same turn id arriving after it was taken back reaches the tool but writes nothing.
    const raw = (await turn(ctx.port, "Adam, file a linear issue about the onboarding email", { turn_id: "taken-1" })).raw;
    assert.doesNotMatch(raw, /I filed/);
    assert.equal(filed.length, 0);
    // Control: a turn that was not taken back files once.
    const control = (await turn(ctx.port, "Adam, please file a linear issue about the scanner jam", { turn_id: "kept-2" })).raw;
    assert.match(control, /I filed/);
    assert.equal(filed.length, 1);
  } finally {
    await ctx.close();
  }
});

test("review: inline titles only for a request to Adam, not narration or a destination", () => {
  for (const [line, title] of [
    ["Adam, create a Linear issue, fix the onboarding email before launch", "Fix the onboarding email before launch"],
    ["create a linear issue to track the login bug", "Track the login bug"],
    ["Adam, can you create a ticket called fix login", "Fix login"],
    ["so Adam could you open a ticket saying update the deck", "Update the deck"],
    ["create a linear issue for the onboarding email", "The onboarding email"],
  ]) assert.equal(inlineIssueTitle(line), title, line);
  for (const line of ["I will create a task for Bao later", "we should create an issue to track churn", "Adam, add a task to the list to remind Bao",
    "create an issue for the team", "Adam, create an issue to Linear", "Adam create a ticket for it", "did you create an issue for the scanner",
    "can you create a ticket for the bug?", "create a ticket to"]) {
    assert.equal(inlineIssueTitle(line), "", line);
  }
});

test("review: the retry queue reads before it removes, keys queued facts, expires, and keeps its own lock", async () => {
  const redis = fakeRedis();
  const commands = [];
  const command = async (cmd) => { commands.push(cmd[0]); return redis.command(cmd); };
  const refusing = withRateLimitRetry({ async remember() { throw new Error(RATE_LIMITED); } }, { tenantId: "t-9", redis: command, waits: [1], wait: async () => {}, log: () => {} });
  await refusing.remember({ kind: "decision", text: "The booth opens at nine." });
  await refusing.remember({ kind: "decision", text: "The booth opens at nine." });
  const rows = redis.store.get("sederunt:memory-retry").map((raw) => JSON.parse(raw));
  assert.match(rows[0].input.idempotencyKey, /^retry:[0-9a-f]{32}$/);
  assert.equal(rows[0].input.idempotencyKey, rows[1].input.idempotencyKey, "the same fact gets the same key, so it is written once");
  assert.equal(commands.includes("EXPIRE"), true);
  // A drain that dies mid-write leaves the row queued.
  await assert.rejects(drainMemoryRetries({ redis: command, memoryFor: () => ({ async remember() { throw Object.assign(new Error("boom"), { fatal: true }); } }), log: () => { throw new Error("crash"); } }));
  assert.equal(redis.store.get("sederunt:memory-retry").length >= 1, true);
  // Another drain's lock is never deleted by this one.
  redis.store.set("sederunt:memory-retry:lock", "someone-else");
  const locked = await drainMemoryRetries({ redis: command, memoryFor: () => null, log: () => {} });
  assert.equal(locked.locked, true);
  assert.equal(redis.store.get("sederunt:memory-retry:lock"), "someone-else");
  redis.store.delete("sederunt:memory-retry:lock");
  const written = [];
  const result = await drainMemoryRetries({ redis: command, memoryFor: (tenantId) => ({ async remember(input) { written.push({ tenantId, key: input.idempotencyKey }); return { blobId: "b" }; } }), log: () => {} });
  assert.equal(result.drained, 2);
  assert.equal(written.every((row) => row.tenantId === "t-9"), true);
  assert.equal(redis.store.get("sederunt:memory-retry").length, 0);
  assert.equal(redis.store.has("sederunt:memory-retry:lock"), false);
});
