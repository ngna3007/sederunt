import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { renderCameraPage } from "../src/meeting/camera.js";
import { calendarDayLink, keptAfterCue } from "../src/meeting/agent-http.js";
import { endOfTurn } from "../src/meeting/agent.js";
import { recallParticipantChange } from "../src/meeting/recall.js";
import { noteAgentMember, noteMeetingHost, noteMeetingPerson } from "../src/meeting/seat.js";
import { lineWaitsForMore } from "../src/meeting/speech-gate.js";
import { isBareKeepCue } from "../src/meeting/voice-write.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

// Demo dry run, Nov 11 2026 09:14-09:15 UTC, Meet fvc-tptp-dee, Recall bot b38fa40d,
// prod 75a69f8 (dpl_GDrPcotKVYB775Ntt8hnDuuBzCBh).
const RUN = JSON.parse(readFileSync(new URL("./fixtures/meeting-dry-run-b38fa40d.json", import.meta.url), "utf8"));
const EAR = "5c".repeat(24);
const TENANT = "33333333-3333-4333-8333-333333333333";
const BOT = RUN.botId;
const HOST = RUN.lines[0];
const NOW = new Date("2026-11-11T09:14:40.000Z");

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
    env: { OPENROUTER_API_KEY: "sk-or-v1-dry-run", ...env },
    deps: { memory: memory || { async remember() { return { blobId: "saved" }; }, async index() { return []; }, async recall() { return []; } }, app: { timeZone: "Asia/Ho_Chi_Minh" }, ...deps },
    sessions: new Map([[TENANT, session]]),
    fetch: async (url, init) => model(url, init),
  });
  noteAgentMember({ meetingVoice }, BOT, { participantId: HOST.participantId, name: HOST.speaker, memberId: HOST.participantId });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  return { app, session, meetingVoice, port: app.address().port, close: () => new Promise((resolve) => app.close(resolve)) };
}

test("dry run: the realtime halves wait for the rest of the line; whole lines do not", () => {
  const [[cue, fact], [ask, title]] = RUN.splitFinals;
  assert.equal(lineWaitsForMore(cue), true);
  assert.equal(lineWaitsForMore(ask), true);
  assert.equal(lineWaitsForMore("Adam, create a linear issue"), true);
  assert.equal(endOfTurn(cue, 1200), false, "'Heads up.' is not committed at the short hold");
  assert.equal(endOfTurn(ask, 1200), false, "a request that names the tool waits for the title");
  assert.equal(endOfTurn(ask, 2500), true);
  for (const line of [fact, title, "Hey Adam, can you hear me?", "Thanks, Adam.", "Adam, schedule a launch sync tomorrow at 10am.",
    "Heads up, the design review moved to Thursday.", "Adam, create a linear issue, fix the onboarding email before launch.", "I opened the ticket."]) {
    assert.equal(lineWaitsForMore(line), false, line);
  }
  // Recall's recording shows the pauses that split the live finals.
  const heads = RUN.lines[2].words;
  assert.ok(heads[2][1] - heads[1][2] >= 0.5, "pause after 'heads up'");
  const linear = RUN.lines[4].words;
  assert.ok(linear[5][1] - linear[4][2] >= 0.8, "pause after 'issue'");
});

test("dry run: the page merges 'Heads up.' with the fact into one line", async () => {
  const page = renderCameraPage();
  const script = page.slice(page.indexOf("<script>") + "<script>".length, page.indexOf("</script>"));
  const turns = [];
  const intervals = [];
  let socket = null;
  let now = 1_000_000;
  const guest = { dataset: { state: "listening" }, textContent: "" };
  class Socket { constructor() { socket = this; } }
  const done = new TextEncoder().encode("event: done\ndata: {}\n\n");
  const win = {};
  vm.runInNewContext(script, {
    URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder, String,
    Date: { now: () => now },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: { getElementById: (id) => (id === "voice" ? {} : guest) },
    location: { search: `?ear=${EAR}&name=Adam` },
    navigator: {},
    window: win,
    fetch: (url, init) => {
      if (String(url) === "/api/meeting/agent/turn") {
        turns.push(JSON.parse(init.body).text);
        let sent = false;
        return Promise.resolve({ ok: true, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: done }; } }; } } });
      }
      return Promise.resolve({ ok: true, json: async () => ({ botName: "Adam", participantId: "", direct: true }), body: null });
    },
  });
  const settle = async () => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const say = (text) => socket.onmessage({ data: JSON.stringify({ event: "transcript.data", data: { data: { words: text.split(" ").map((word) => ({ text: word })), participant: { id: 100, name: HOST.speaker } } } }) });
  const tick = async (ms) => { for (let step = 0; step < ms / 100; step += 1) { now += 100; intervals.forEach((fn) => fn()); await settle(); } };
  intervals.forEach((fn) => fn());
  await settle();
  // Adam had just answered "can you hear me?", so the speaker held the floor.
  win.__sederunt.noteAnswer(HOST.speaker, now, false);
  say("Heads up.");
  await tick(1800); // the next final arrived ~1.5-2 s later on Nov 11; the old hold committed at 1.2 s
  say("The design review moved to Thursday.");
  await tick(2000);
  assert.deepEqual(turns, ["Heads up. The design review moved to Thursday."]);
});

test("dry run: a follow-up question is dropped when the asker keeps talking, and spoken otherwise", async () => {
  const page = renderCameraPage();
  const script = page.slice(page.indexOf("<script>") + "<script>".length, page.indexOf("</script>"));
  const run = async (continueWithin) => {
    const spoken = [];
    const turns = [];
    const intervals = [];
    const timers = [];
    let socket = null;
    let now = 2_000_000;
    const guest = { dataset: { state: "listening" }, textContent: "" };
    class Socket { constructor() { socket = this; } }
    const ask = new TextEncoder().encode(`event: sentence\ndata: ${JSON.stringify({ text: "What should the issue say?", hash: "h1", ask: "title" })}\n\nevent: done\ndata: {}\n\n`);
    const done = new TextEncoder().encode("event: done\ndata: {}\n\n");
    vm.runInNewContext(script, {
      URLSearchParams, WebSocket: Socket, AbortController, Promise, JSON, Math, RegExp, URL, Uint8Array, TextDecoder, String,
      Date: { now: () => now },
      setInterval: (fn) => { intervals.push(fn); return intervals.length; },
      setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
      clearTimeout: () => {},
      document: { getElementById: (id) => (id === "voice" ? { play() { return Promise.resolve(); } } : guest) },
      location: { search: `?ear=${EAR}&name=Adam` },
      navigator: {},
      window: {},
      fetch: (url, init) => {
        if (String(url) === "/api/meeting/agent/turn") {
          turns.push(JSON.parse(init.body).text);
          const body = turns.length === 1 ? ask : done;
          let sent = false;
          return Promise.resolve({ ok: true, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: body }; } }; } } });
        }
        if (String(url) === "/api/meeting/agent/speak") {
          spoken.push(JSON.parse(init.body).text);
          return Promise.resolve(null);
        }
        return Promise.resolve({ ok: true, json: async () => ({ botName: "Adam", participantId: "", direct: true }), body: null });
      },
    });
    const settle = async () => { for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
    const say = (text) => socket.onmessage({ data: JSON.stringify({ event: "transcript.data", data: { data: { words: text.split(" ").map((word) => ({ text: word })), participant: { id: 100, name: HOST.speaker } } } }) });
    const tick = async (ms) => {
      for (let step = 0; step < ms / 100; step += 1) {
        now += 100;
        intervals.forEach((fn) => fn());
        for (const timer of timers.splice(0)) {
          if (timer.at <= now) timer.fn();
          else timers.push(timer);
        }
        await settle();
      }
    };
    intervals.forEach((fn) => fn());
    await settle();
    say("Adam, create a linear issue.");
    await tick(2600);
    assert.equal(turns.length, 1);
    if (continueWithin != null) {
      await tick(continueWithin);
      say("Fix the onboarding email before launch.");
    }
    await tick(4000);
    return { spoken, turns };
  };
  const continued = await run(600);
  assert.deepEqual(continued.spoken, [], "the question is not asked over the title");
  assert.deepEqual(continued.turns, ["Adam, create a linear issue.", "Fix the onboarding email before launch."]);
  const silent = await run(null);
  assert.deepEqual([...new Set(silent.spoken)], ["What should the issue say?"], "with no continuation the question is asked");
});

test("dry run: a bare 'Heads up.' gets no reply and the fact after it is kept quiet", async () => {
  const calls = [];
  const ctx = await boot({ model: async (url) => { calls.push(String(url)); return { ok: true, status: 200, body: chatStream("I hear you.") }; } });
  try {
    const cue = await turn(ctx.port, "Heads up.", { turn_id: "cue-1" });
    assert.deepEqual(sentences(cue.raw), []);
    const fact = await turn(ctx.port, "The design review moved to Thursday.", { turn_id: "cue-2" });
    assert.deepEqual(sentences(fact.raw), []);
    assert.equal(calls.length, 0, "no model call for either half");
    const asked = await turn(ctx.port, "Hey Adam, can you hear me?", { turn_id: "cue-3" });
    assert.deepEqual(sentences(asked.raw).map((row) => row.text), ["I hear you."], "a question afterwards is still answered");
  } finally {
    await ctx.close();
  }
  assert.equal(isBareKeepCue("Heads up."), true);
  assert.equal(isBareKeepCue("Adam, heads up,"), true);
  assert.equal(isBareKeepCue("Heads up, the review moved"), false);
  assert.equal(keptAfterCue("The design review moved to Thursday."), true);
  assert.equal(keptAfterCue("can you move it to Friday?"), false);
  assert.equal(keptAfterCue("create a linear issue for it"), false);
});

const secret = `whsec_${Buffer.from("dry-run-secret").toString("base64")}`;
function sign(id, timestamp, payload) {
  return createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

test("dry run: the Recall webhook stores the heads-up fact that arrived as two finals", async () => {
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    env: { RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "100" },
    deps: {
      memory: { async remember(row) { remembered.push(row); return { blobId: null }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const deliver = (text, id) => {
    const payload = JSON.stringify({ event: "transcript.data", data: { bot: { id: BOT }, transcript: { id: `tr-${id}` }, data: { participant: { id: 100, name: HOST.speaker, is_host: true }, words: text.split(" ").map((word) => ({ text: word })) } } });
    return post(port, "/api/recall", payload, { "webhook-id": id, "webhook-timestamp": "1731705121", "webhook-signature": `v1,${sign(id, "1731705121", payload)}` });
  };
  try {
    const [[cue, fact]] = RUN.splitFinals;
    assert.equal((await deliver(cue, "msg-cue")).status, 204);
    assert.equal((await deliver(fact, "msg-fact")).status, 204);
    const board = JSON.parse((await new Promise((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path: "/api/console?member=100", method: "GET" }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      req.on("error", reject);
      req.end();
    })));
    const texts = (board.decisions || []).map((row) => row.text);
    assert.equal(texts.some((text) => /design review moved to Thursday/i.test(text)), true, JSON.stringify(texts));
    assert.equal(texts.some((text) => /^heads up\.?$/i.test(text)), false);
  } finally {
    await new Promise((resolve) => app.close(resolve));
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

function scheduleModel() {
  return async (url, init) => {
    const payload = JSON.parse(init.body);
    if ((payload.messages || []).some((message) => message.role === "tool")) return { ok: true, status: 200, body: chatStream("Done.") };
    return { ok: true, status: 200, body: toolCallStream("act", { title: "Launch sync" }) };
  };
}

test("dry run: an unbound host uses the Calendar of the console user who added Adam", async () => {
  const calendar = calendarStub();
  const asked = [];
  const chat = [];
  const ctx = await boot({
    model: scheduleModel(),
    seat: { userId: "inviter-1" },
    deps: {
      calendar: null,
      calendarForPerson: async (personId) => { asked.push(personId); return calendar; },
      meeting: { async sendChatMessage(input) { chat.push(input); return { ok: true }; } },
    },
  });
  noteMeetingHost({ meetingVoice: ctx.meetingVoice }, BOT, HOST.participantId);
  try {
    const raw = (await turn(ctx.port, "Adam, schedule a launch sync tomorrow at 10am.", { turn_id: "cal-host" })).raw;
    assert.match(raw, /I scheduled Launch sync/);
    assert.deepEqual(asked, ["inviter-1"]);
    assert.equal(calendar.created.length, 1);
    const params = calendar.created[0].params;
    assert.equal(params.calendarId, "primary");
    assert.equal(params.summary, "Launch sync");
    assert.match(params.startTime, /T10:00:00\+07:00$/);
    for (const key of ["title", "start", "end"]) assert.equal(key in params, false, `no ${key} for the strict create_event schema`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(chat.length, 1);
    assert.match(chat[0].message, /https:\/\/calendar\.google\.com\/calendar\/event\?eid=/);
  } finally {
    await ctx.close();
  }
});

test("dry run: solo by Recall's roster also uses the inviter; a guest in a group call stays not connected", async () => {
  const solo = calendarStub();
  const asked = [];
  let ctx = await boot({ model: scheduleModel(), seat: { userId: "inviter-1" }, deps: { calendarForPerson: async (personId) => { asked.push(personId); return solo; } } });
  noteMeetingPerson({ meetingVoice: ctx.meetingVoice }, BOT, { participantId: HOST.participantId, name: HOST.speaker });
  try {
    assert.match((await turn(ctx.port, "Adam, schedule a launch sync tomorrow at 10am.", { turn_id: "cal-solo" })).raw, /I scheduled Launch sync/);
    assert.deepEqual(asked, ["inviter-1"]);
  } finally {
    await ctx.close();
  }
  const group = calendarStub();
  asked.length = 0;
  ctx = await boot({ model: scheduleModel(), seat: { userId: "inviter-1" }, deps: { calendarForPerson: async (personId) => { asked.push(personId); return group; } } });
  noteMeetingPerson({ meetingVoice: ctx.meetingVoice }, BOT, { participantId: HOST.participantId, name: HOST.speaker });
  noteMeetingPerson({ meetingVoice: ctx.meetingVoice }, BOT, { participantId: "101", name: "Bao Tran" });
  try {
    const raw = (await turn(ctx.port, "Adam, schedule a launch sync tomorrow at 10am.", { turn_id: "cal-group", people: [HOST.participantId, "101"] })).raw;
    assert.match(raw, /Google Calendar is not connected/);
    assert.deepEqual(asked, [], "a non-host in a group call never reaches the inviter's grant");
    assert.equal(group.created.length, 0);
  } finally {
    await ctx.close();
  }
  // No inviter on the seat (an API-key join): honest not connected.
  const none = calendarStub();
  ctx = await boot({ model: scheduleModel(), deps: { calendarForPerson: async () => none } });
  noteMeetingHost({ meetingVoice: ctx.meetingVoice }, BOT, HOST.participantId);
  try {
    assert.match((await turn(ctx.port, "Adam, schedule a launch sync tomorrow at 10am.", { turn_id: "cal-none" })).raw, /Google Calendar is not connected/);
    assert.equal(none.created.length, 0);
  } finally {
    await ctx.close();
  }
});

test("dry run: a person's Calendar adapter writes with that person's token and returns Google's link", async () => {
  const seen = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ auth: init.headers.authorization, method: body.method, name: body.params?.name, args: body.params?.arguments });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: { id: "evt-1", summary: "Launch sync", htmlLink: "https://www.google.com/calendar/event?eid=ZXZ0LTE" } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const adapter = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "process-wide-token", CALENDAR_OAUTH_EXPIRES_AT: String(Date.now() + 3_600_000) }, {
    fetch: fetchImpl,
    accessToken: async () => "person-token",
  });
  const created = await adapter.call("create_event", { calendarId: "primary", summary: "Launch sync", startTime: "2026-11-12T10:00:00+07:00", endTime: "2026-11-12T10:30:00+07:00" });
  assert.equal(created.id, "evt-1");
  assert.equal(created.url, "https://www.google.com/calendar/event?eid=ZXZ0LTE");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].auth, "Bearer person-token", "never the process-wide token");
  assert.equal(seen[0].args.calendarId, "primary");
  assert.equal(calendarDayLink("2026-11-12T10:00:00+07:00"), "https://calendar.google.com/calendar/r/day/2026/11/12");
});

test("dry run: Recall's participant events carry the host flag", () => {
  const change = recallParticipantChange({ event: "participant_events.join", data: { bot: { id: BOT }, data: { participant: { id: 100, name: HOST.speaker, is_host: true } } } });
  assert.equal(change.host, true);
  const guest = recallParticipantChange({ event: "participant_events.join", data: { bot: { id: BOT }, data: { participant: { id: 101, name: "Bao Tran", is_host: false } } } });
  assert.equal("host" in guest, false);
});

test("dry run: the split Linear request asks with a held question and files once from the rest of the line", async () => {
  const issues = [];
  let rounds = 0;
  const ctx = await boot({
    model: async (_url, init) => {
      rounds += 1;
      const payload = JSON.parse(init.body);
      if ((payload.messages || []).some((message) => message.role === "tool")) return { ok: true, status: 200, body: chatStream("Okay.") };
      return { ok: true, status: 200, body: toolCallStream("act", {}) };
    },
    deps: { linear: { connected: true, async createIssue(input) { issues.push(input); return { identifier: "ROW-73", id: "ROW-73", url: "https://linear.app/rowan3007/issue/ROW-73" }; } } },
  });
  try {
    const [, [ask, title]] = RUN.splitFinals;
    const first = sentences((await turn(ctx.port, ask, { turn_id: "lin-1" })).raw);
    assert.deepEqual(first.map((row) => row.text), ["What should the issue say?"]);
    assert.equal(first[0].ask, "title", "the page may hold this question while the asker finishes");
    const second = sentences((await turn(ctx.port, title, { turn_id: "lin-2" })).raw);
    assert.match(second.map((row) => row.text).join(" "), /I filed ROW-73, 'Fix the onboarding email before launch'/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(issues.length, 1, "filed once");
    const again = sentences((await turn(ctx.port, title, { turn_id: "lin-3" })).raw);
    assert.equal(again.some((row) => /I filed/.test(row.text)), false);
    assert.equal(issues.length, 1, "a repeat of the title does not file twice");
  } finally {
    await ctx.close();
  }
});
