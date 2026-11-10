import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createSession } from "../src/session.js";
import { endOfTurn, spokenLines, wordsFromTranscript, withoutBotSpeech } from "../src/meeting/agent.js";
import { endAgentSeat, noteAgentSpeaker } from "../src/meeting/voice-bus.js";
import { openRouterSpeechStream } from "../src/openrouter.js";
import { createApp } from "../src/server.js";

const EAR = "ab".repeat(24);
const KEY = "sk-or-v1-agent-test-key";
const SEAT = { ear: EAR, botId: "bot-1", tenantId: "", roomId: "bot-1", botName: "Adam" };

function chatStream(text, { hang = false, signal } = {}) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  return {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
      if (!hang) {
        yield Buffer.from("data: [DONE]\n\n");
        return;
      }
      await new Promise((resolve, reject) => {
        const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (signal?.aborted) {
          fail();
          return;
        }
        signal?.addEventListener("abort", fail);
      });
    },
  };
}

function mp3Body(bytes) {
  let sent = false;
  return {
    getReader() {
      return {
        async read() {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: Uint8Array.from(bytes) };
        },
      };
    },
  };
}

function boot(fetchImpl, extra = {}) {
  const session = extra.session || createSession();
  const meetingVoice = extra.meetingVoice || {};
  const app = createApp({
    session,
    meetingVoice,
    agentSeats: extra.seats || [SEAT],
    env: {
      OPENROUTER_API_KEY: KEY,
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
      ...(extra.env || {}),
    },
    deps: { memory: null },
    fetch: fetchImpl,
  });
  return { app, session, meetingVoice };
}

async function listen(app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  return app.address().port;
}

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}

function call(port, method, path, { headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: { ...headers, ...(body ? { "content-length": Buffer.byteLength(body) } : {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: String(res.headers["content-type"] || ""),
        cache: String(res.headers["cache-control"] || ""),
        raw: Buffer.concat(chunks).toString("utf8"),
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function openPost(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method: "POST",
      path,
      headers: { ...headers, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk.toString("utf8"); });
      resolve({
        status: res.statusCode,
        type: String(res.headers["content-type"] || ""),
        cache: String(res.headers["cache-control"] || ""),
        until(needle) {
          return new Promise((done) => {
            const check = () => {
              if (raw.includes(needle)) done(raw);
            };
            check();
            res.on("data", check);
            res.on("end", () => done(raw));
          });
        },
        finished: new Promise((done) => res.on("end", () => done(raw))),
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sseEvents(raw) {
  return raw.split("\n\n").map((block) => block.trim()).filter(Boolean).map((block) => {
    const name = (block.match(/^event: (.+)$/m) || [])[1] || "";
    const data = (block.match(/^data: (.+)$/m) || [])[1] || "";
    return { name, data: data ? JSON.parse(data) : null };
  });
}

function turnBody(text, speaker, extra = {}) {
  return JSON.stringify({
    text,
    speaker,
    tenantId: "other-tenant",
    roomId: "other-room",
    botId: "other-bot",
    memberId: "other-member",
    ...extra,
  });
}

test("endpointing waits out an unfinished tail and transcript words keep both shapes", () => {
  assert.equal(endOfTurn("Keep the launch.", 1199), false);
  assert.equal(endOfTurn("Keep the launch.", 1200), true);
  assert.equal(endOfTurn("Keep the about", 1200), false);
  assert.equal(endOfTurn("Keep the about", 2500), true);
  assert.equal(spokenLines("One moment. We will keep Thursday. We will finish the booth. We will send the note.").join("|"), "We will keep Thursday.|We will finish the booth.");
  assert.equal(spokenLines("Chúng tôi giữ thứ năm. We will keep Thursday.").join("|"), "We will keep Thursday.");
  const webhook = wordsFromTranscript({
    data: { data: { words: [{ text: "Thursday", start_timestamp: { relative: 1.5 }, end_timestamp: { relative: 2 } }], participant: { id: 4, name: "Priya" } } },
  });
  const socket = wordsFromTranscript({ transcript: { words: [{ text: "booth", start: 3 }] }, participant: { id: 9, name: "Adam" } });
  assert.equal(webhook[0].start, 1.5);
  assert.equal(webhook[0].speaker, "Priya");
  assert.equal(withoutBotSpeech([...webhook, ...socket], { name: "Adam", participantId: "9" }).map((word) => word.text).join(" "), "Thursday");
});

test("the meeting page is the agent and a bad ear cannot open a turn", async () => {
  const seen = [];
  const { app } = boot(async (url) => {
    seen.push(String(url));
    return { ok: false, status: 500 };
  });
  const port = await listen(app);
  try {
    const page = await call(port, "GET", "/meeting?name=Adam");
    assert.equal(page.status, 200);
    assert.equal(page.cache, "no-store");
    assert.match(page.raw, /wss:\/\/meeting-data\.bot\.recall\.ai\/api\/v1\/transcript/);
    assert.match(page.raw, /getUserMedia/);
    assert.match(page.raw, /data\.data\.words/);
    assert.match(page.raw, /transcript\.words/);
    assert.match(page.raw, /\/api\/meeting\/agent\/turn/);
    assert.doesNotMatch(page.raw, /\/meeting\/voice/);
    assert.equal(page.raw.includes(KEY), false);
    assert.equal(page.raw.includes("sk-"), false);
    const missing = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json" },
      body: turnBody("Adam, keep Thursday.", "Priya"),
    });
    assert.equal(missing.status, 401);
    const malformed = await call(port, "POST", "/api/meeting/agent/session", {
      headers: { "x-meeting-ear": "nope" },
    });
    assert.equal(malformed.status, 401);
    const unknown = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": "cd".repeat(24) },
      body: turnBody("Adam, keep Thursday.", "Priya"),
    });
    assert.equal(unknown.status, 403);
    assert.equal(seen.length, 0);
  } finally {
    await close(app);
  }
});

test("an addressed turn streams two English sentences and ignores ids in the body", async () => {
  const chats = [];
  const session = createSession();
  const { app } = boot(async (url, init) => {
    const payload = JSON.parse(init.body);
    chats.push({ url: String(url), model: payload.model, system: payload.messages[0].content });
    return {
      ok: true,
      status: 200,
      body: chatStream("One moment. We will keep Thursday. We will finish the booth. We will send the note."),
    };
  }, { session });
  const port = await listen(app);
  try {
    const quiet = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("We should ship the booth on Thursday.", "Priya"),
    });
    assert.equal(quiet.status, 200);
    assert.equal(sseEvents(quiet.raw).some((event) => event.name === "sentence"), false);
    assert.equal(chats.length, 0);
    const self = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep Thursday.", "Adam"),
    });
    assert.equal(sseEvents(self.raw).some((event) => event.name === "sentence"), false);
    assert.equal(chats.length, 0);
    const spoken = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep the launch on Thursday.", "Priya", { turn_id: "turn-a" }),
    });
    assert.equal(spoken.cache, "no-store");
    assert.equal(spoken.raw.includes(KEY), false);
    const events = sseEvents(spoken.raw);
    const sentences = events.filter((event) => event.name === "sentence").map((event) => event.data.text);
    assert.deepEqual(sentences, ["We will keep Thursday.", "We will finish the booth."]);
    assert.equal(spoken.raw.includes("One moment"), false);
    assert.equal(spoken.raw.includes("send the note"), false);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(chats[0].model, "google/gemini-2.5-flash-lite");
    assert.equal(chats[0].system.includes("light filler"), false);
    assert.equal(chats[0].system.includes("Speak English only"), true);
    assert.equal(session.meetingFloor.roomId, "bot-1");
    assert.equal(session.meetingFloor.roomId === "other-room", false);
    const again = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep the launch on Thursday.", "Priya", { turn_id: "turn-a" }),
    });
    assert.equal(sseEvents(again.raw).some((event) => event.data?.duplicate === true), true);
    assert.equal(chats.length, 1);
    const follow = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("And finish the booth.", "Priya"),
    });
    assert.equal(sseEvents(follow.raw).filter((event) => event.name === "sentence").length, 2);
    const other = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("And the budget.", "Sam"),
    });
    assert.equal(sseEvents(other.raw).some((event) => event.name === "sentence"), false);
  } finally {
    await close(app);
  }
});

test("cancelling a turn stops the model before the next sentence", async () => {
  let signal;
  const { app } = boot(async (_url, init) => {
    signal = init.signal;
    return { ok: true, status: 200, body: chatStream("We will keep Thursday. ", { hang: true, signal: init.signal }) };
  });
  const port = await listen(app);
  try {
    const opened = await openPost(port, "/api/meeting/agent/turn", {
      "content-type": "application/json",
      "x-meeting-ear": EAR,
    }, turnBody("Adam, keep Thursday.", "Priya", { turn_id: "turn-cancel" }));
    await opened.until("We will keep Thursday");
    const cancelled = await call(port, "POST", "/api/meeting/agent/cancel", {
      headers: { "x-meeting-ear": EAR },
    });
    assert.equal(cancelled.status, 204);
    const raw = await opened.finished;
    assert.equal(raw.includes("We will keep Thursday"), true);
    assert.equal(raw.includes("And Friday"), false);
    assert.equal(signal.aborted, true);
    assert.equal(raw.includes(KEY), false);
  } finally {
    await close(app);
  }
});

test("speech bytes are piped for a stored sentence and a mismatched line is refused", async () => {
  const speech = [];
  const session = createSession();
  const { app } = boot(async (url, init) => {
    const target = String(url);
    if (target.includes("/audio/speech")) {
      const payload = JSON.parse(init.body);
      speech.push(payload);
      return { ok: true, status: 200, body: mp3Body([0xff, 0xfb, 0x11]) };
    }
    return { ok: true, status: 200, body: chatStream("We will keep Thursday.") };
  }, { session });
  const port = await listen(app);
  try {
    const spoken = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep Thursday.", "Priya"),
    });
    const sentence = sseEvents(spoken.raw).find((event) => event.name === "sentence");
    assert.equal(sentence.data.text, "We will keep Thursday.");
    const mismatch = await call(port, "POST", "/api/meeting/agent/speak", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: JSON.stringify({ text: "This was not spoken." }),
    });
    assert.equal(mismatch.status, 409);
    assert.equal(speech.length, 0);
    const audio = await call(port, "POST", "/api/meeting/agent/speak", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: JSON.stringify({ text: sentence.data.text }),
    });
    assert.equal(audio.status, 200);
    assert.equal(audio.type, "audio/mpeg");
    assert.equal(audio.cache, "no-store");
    assert.deepEqual([...audio.body], [0xff, 0xfb, 0x11]);
    assert.equal(audio.raw.includes(KEY), false);
    assert.equal(speech[0].model, "mistralai/voxtral-mini-tts-2603");
    assert.equal(speech[0].input, "We will keep Thursday.");
    const logged = await call(port, "POST", "/api/meeting/agent/log", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: JSON.stringify({ sentences: [sentence.data.text], roomId: "other-room" }),
    });
    assert.equal(logged.status, 204);
    assert.equal(session.meetingMemory["bot-1"].exchanges.at(-1).assistant, "We will keep Thursday.");
    assert.equal(session.meetingMemory["bot-1"].exchanges.at(-1).user, "Adam, keep Thursday.");
    assert.equal(session.meetingMemory["other-room"], undefined);
  } finally {
    await close(app);
  }
});

test("an ended bot and the bot's stored participant are forbidden", async () => {
  const chats = [];
  const meetingVoice = {};
  const { app } = boot(async () => {
    chats.push("chat");
    return { ok: true, status: 200, body: chatStream("We will keep Thursday.") };
  }, { meetingVoice });
  noteAgentSpeaker({ meetingVoice }, "bot-1", "42");
  const port = await listen(app);
  try {
    const spoofed = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep Thursday.", "Priya", { participantId: "42" }),
    });
    assert.equal(sseEvents(spoofed.raw).some((event) => event.name === "sentence"), false);
    assert.equal(chats.length, 0);
    assert.equal(endAgentSeat({ meetingVoice }, "bot-1"), true);
    const ended = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep Thursday.", "Priya"),
    });
    assert.equal(ended.status, 403);
  } finally {
    await close(app);
  }
});

test("a pinned voice falls back when the first speech byte is late", async () => {
  const models = [];
  const result = await openRouterSpeechStream({
    env: {
      OPENROUTER_API_KEY: KEY,
      OPENROUTER_TTS_MODEL: "deepgram/aura-2",
      OPENROUTER_TTS_VOICE: "aura-2-thalia-en",
    },
    text: "We will keep Thursday.",
    firstByteMs: 30,
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      models.push(payload.model);
      if (payload.model === "deepgram/aura-2") {
        return {
          ok: true,
          status: 200,
          body: {
            getReader() {
              return {
                async read() {
                  await new Promise((resolve) => setTimeout(resolve, 80));
                  return { done: false, value: Uint8Array.of(1) };
                },
              };
            },
          },
        };
      }
      return { ok: true, status: 200, body: mp3Body([0xff, 0xfb]) };
    },
  });
  assert.deepEqual(models, ["deepgram/aura-2", "mistralai/voxtral-mini-tts-2603"]);
  assert.equal(result.used, true);
  assert.equal(result.model, "mistralai/voxtral-mini-tts-2603");
  const bytes = [];
  for await (const chunk of result.chunks()) bytes.push(...chunk);
  assert.deepEqual(bytes, [0xff, 0xfb]);
});

test("the agent stays quiet when the meeting flag is off", async () => {
  const chats = [];
  const { app } = boot(async () => {
    chats.push("chat");
    return { ok: true, status: 200, body: chatStream("We will keep Thursday.") };
  }, { env: { SEDERUNT_MEETING_REALTIME: "0" } });
  const port = await listen(app);
  try {
    const spoken = await call(port, "POST", "/api/meeting/agent/turn", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: turnBody("Adam, keep Thursday.", "Priya"),
    });
    assert.equal(sseEvents(spoken.raw).some((event) => event.name === "sentence"), false);
    assert.equal(chats.length, 0);
  } finally {
    await close(app);
  }
});
