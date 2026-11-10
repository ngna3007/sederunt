import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createMeetingAdapter } from "../src/meeting/recall.js";
import { measureSpeechProbe, transcriptEventShape } from "../src/meeting/spike.js";
import { createApp } from "../src/server.js";

const NONCE = "0123456789abcdef";
const EAR = "ab".repeat(24);
const KEY = "sk-or-v1-spike-test-key";

function call(port, method, path, { headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function audioBody(chunks) {
  return {
    getReader() {
      let index = 0;
      return {
        async read() {
          if (index >= chunks.length) return { done: true };
          return { done: false, value: chunks[index++] };
        },
      };
    },
  };
}

test("a transcript spike keeps the shape and drops the words", () => {
  const partial = transcriptEventShape({
    event: "transcript.partial_data",
    data: {
      data: {
        words: [{ text: "secret phrase", start_timestamp: { relative: 1.2 }, end_timestamp: { relative: 1.8 } }],
        participant: { id: 7, name: "Anh", email: "a@b.co", is_host: false, platform: "desktop" },
      },
    },
  });
  assert.equal(partial.partial, true);
  assert.equal(partial.event, "transcript.partial_data");
  assert.equal(partial.wordCount, 1);
  assert.equal(partial.textPresent, true);
  assert.equal(partial.participantIdType, "number");
  assert.equal(partial.namePresent, true);
  assert.equal(partial.emailPresent, true);
  assert.equal(partial.platform, "desktop");
  assert.equal(partial.startRelative, 1.2);
  assert.equal(partial.endRelative, 1.8);
  const hidden = JSON.stringify(partial);
  assert.equal(hidden.includes("secret"), false);
  assert.equal(hidden.includes("Anh"), false);
  assert.equal(hidden.includes("a@b.co"), false);

  const page = transcriptEventShape({
    transcript: {
      words: [{ text: "hello there" }],
      participant: { id: 3, name: "Ada" },
    },
  });
  assert.equal(page.event, "in-page");
  assert.equal(page.partial, false);
  assert.equal(page.wordCount, 1);
  assert.equal(page.participantIdType, "number");
  assert.equal(JSON.stringify(page).includes("hello"), false);
  assert.equal(JSON.stringify(page).includes("Ada"), false);
});

test("a speech probe counts the first byte and leaves the key out", async () => {
  const seen = [];
  const report = await measureSpeechProbe({
    key: KEY,
    fetchImpl: async (url, init) => {
      seen.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
      return { ok: true, status: 200, body: audioBody([Uint8Array.of(1, 2), Uint8Array.of(3)]) };
    },
  });
  assert.equal(report.sentenceWords, 13);
  assert.equal(report.samples.length, 3);
  assert.equal(seen.length, 6);
  assert.equal(seen[0].url, "https://openrouter.ai/api/v1/audio/speech");
  assert.equal(seen[0].auth, `Bearer ${KEY}`);
  assert.equal(seen[0].body.voice, "en_paul_neutral");
  assert.equal(seen[2].body.model, "elevenlabs/eleven-flash-v2.5");
  assert.equal(seen[2].body.voice, "sarah");
  assert.equal(seen[4].body.model, "deepgram/aura-2");
  assert.equal(report.samples[0].tries[0].chunks, 2);
  assert.equal(report.samples[0].tries[0].bytes, 3);
  assert.equal(report.samples[0].tries[0].firstChunk, 2);
  assert.equal(typeof report.samples[0].tries[0].ttfbMs, "number");
  assert.equal(JSON.stringify(report).includes(KEY), false);
});

test("the spike stays off until the preview flag is set", async () => {
  const app = createApp({ deps: { memory: null } });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const page = await call(port, "GET", "/meeting?spike=1");
    assert.equal(page.status, 200);
    assert.equal(page.raw.includes("meeting-data.bot.recall.ai"), false);
    assert.equal(page.raw.includes("getUserMedia"), false);
    const probe = await call(port, "POST", "/api/meeting/spike/tts", {
      headers: { "x-sederunt-spike": NONCE },
    });
    assert.equal(probe.status, 404);
  } finally {
    app.close();
  }
});

test("a spiked page logs the transcript shape and the speech probe stays on the server", async () => {
  const calls = [];
  const app = createApp({
    env: {
      SEDERUNT_MEETING_SPIKE: "1",
      SEDERUNT_SPIKE_NONCE: NONCE,
      OPENROUTER_API_KEY: KEY,
    },
    deps: { memory: null },
    fetch: async (url, init) => {
      calls.push(String(url));
      if (String(url).includes("/audio/speech")) {
        return { ok: true, status: 200, body: audioBody([Uint8Array.of(9)]) };
      }
      return { ok: true, status: 200, json: async () => ({ result: "OK" }) };
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const plain = await call(port, "GET", "/meeting?name=Adam");
    assert.equal(plain.raw.includes("meeting-data.bot.recall.ai"), false);
    const spiked = await call(port, "GET", `/meeting?name=Adam&spike=1&ear=${EAR}`);
    assert.equal(spiked.raw.includes("wss://meeting-data.bot.recall.ai/api/v1/transcript"), true);
    assert.equal(spiked.raw.includes(KEY), false);
    assert.equal(spiked.raw.includes("connect-src 'self'"), true);

    const posted = await call(port, "POST", "/api/meeting/spike/transcript", {
      headers: { "content-type": "application/json", "x-meeting-ear": EAR },
      body: JSON.stringify({
        event: "transcript.data",
        data: { data: { words: [{ text: "secret phrase" }], participant: { id: 4, name: "Anh" } } },
      }),
    });
    assert.equal(posted.status, 204);
    const missing = await call(port, "POST", "/api/meeting/spike/transcript", {
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missing.status, 401);
    const locked = await call(port, "GET", "/api/meeting/spike/transcript", {
      headers: { "x-meeting-ear": EAR },
    });
    assert.equal(locked.status, 404);
    const log = await call(port, "GET", "/api/meeting/spike/transcript", {
      headers: { "x-meeting-ear": EAR, "x-sederunt-spike": NONCE },
    });
    assert.equal(log.status, 200);
    assert.equal(log.raw.includes("secret"), false);
    assert.equal(log.raw.includes("Anh"), false);
    const events = JSON.parse(log.raw).events;
    assert.equal(events[0].event, "transcript.data");
    assert.equal(events[0].wordCount, 1);
    assert.equal(events[0].participantIdType, "number");

    const denied = await call(port, "POST", "/api/meeting/spike/tts");
    assert.equal(denied.status, 404);
    const probe = await call(port, "POST", "/api/meeting/spike/tts", {
      headers: { "x-sederunt-spike": NONCE },
    });
    assert.equal(probe.status, 200);
    assert.equal(probe.raw.includes(KEY), false);
    const body = JSON.parse(probe.raw);
    assert.equal(body.samples.length, 3);
    assert.equal(body.samples[1].voice, "sarah");
    assert.equal(calls.some((url) => url.includes("/audio/speech")), true);
  } finally {
    app.close();
  }
});

test("a spiked join loads this deployment and a normal join does not", async () => {
  const env = {
    RECALL_API_KEY: "recall-key",
    RECALL_WEBHOOK_SECRET: "whsec_abc",
    SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
    SEDERUNT_MEETING_SPIKE: "1",
    SEDERUNT_SPIKE_NONCE: NONCE,
    VERCEL_URL: "sederunt-preview.vercel.app",
  };
  const sent = [];
  const created = await createMeetingAdapter(env, {
    async fetch(url, init) {
      sent.push(JSON.parse(init.body));
      return { ok: true, async text() { return JSON.stringify({ id: "bot-spike" }); } };
    },
  }).join({ url: "https://meet.google.com/abc-defg-hij" });
  const camera = new URL(sent[0].output_media.camera.config.url);
  assert.equal(camera.origin, "https://sederunt-preview.vercel.app");
  assert.equal(camera.searchParams.get("spike"), "1");
  assert.equal(camera.searchParams.get("ear"), created.ear);
  assert.equal(sent[0].recording_config.realtime_endpoints[0].url, "https://sederunt-preview.vercel.app/api/recall");
  assert.equal(JSON.stringify(sent[0]).includes(NONCE), false);

  sent.length = 0;
  await createMeetingAdapter({ ...env, SEDERUNT_MEETING_SPIKE: undefined }, {
    async fetch(url, init) {
      sent.push(JSON.parse(init.body));
      return { ok: true, async text() { return JSON.stringify({ id: "bot-plain" }); } };
    },
  }).join({ url: "https://meet.google.com/abc-defg-hij" });
  const plain = new URL(sent[0].output_media.camera.config.url);
  assert.equal(plain.origin, "https://sederunt.example");
  assert.equal(plain.searchParams.get("spike"), null);
});
