import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createMeetingAdapter, recallTranscriptDelivery, verifyRecallRequest } from "../src/meeting/recall.js";

const secret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

test("a signed callback is accepted and a bad signature leaves the typed path working", async () => {
  const previous = process.env.RECALL_WEBHOOK_SECRET;
  process.env.RECALL_WEBHOOK_SECRET = secret;
  const app = createApp({
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const payload = JSON.stringify({ event: "bot.done" });
    const id = "msg_test";
    const timestamp = "1731705121";
    const signature = sign(secret, id, timestamp, payload);
    const accepted = await post(port, "/api/recall", payload, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    });
    assert.equal(accepted.status, 204);
    const rejected = await post(port, "/api/recall", payload, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": "v1,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.raw.includes(secret), false);
    const meeting = await get(port, "/meeting");
    assert.equal(meeting.status, 200);
    assert.match(meeting.raw, /Sederunt/);
    assert.doesNotMatch(meeting.raw, /Quiet until addressed/);
    assert.doesNotMatch(meeting.raw, /Say this name/);
    const typed = await post(port, "/api/typed", JSON.stringify({
      text: "what was decided",
      memberId: "rowan",
      room: { id: "room-1", kind: "meeting", source: "recall", botPresent: true, memberIds: ["rowan"] },
    }), { "content-type": "application/json" });
    assert.equal(typed.status, 200);
    assert.match(typed.raw, /no notes yet|recorded/);
  } finally {
    if (previous === undefined) delete process.env.RECALL_WEBHOOK_SECRET;
    else process.env.RECALL_WEBHOOK_SECRET = previous;
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a configured member receives no attendance grant from another Recall speaker", async () => {
  const saved = [];
  const app = createApp({
    companyLoaded: true,
    env: { RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "U_MINA", SEDERUNT_SESSION_SECRET: "recall-local-fixture" },
    deps: {
      memory: { async remember(row) { saved.push(row); return { blobId: null }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const payload = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-live" },
        transcript: { id: "tr-live" },
        data: {
          participant: { id: 100, name: "Mina" },
          words: [{ text: "Hey" }, { text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }],
        },
      },
    });
    const id = "msg-live";
    const timestamp = "1731705121";
    const accepted = await post(port, "/api/recall", payload, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${sign(secret, id, timestamp, payload)}`,
    });
    assert.equal(accepted.status, 204);
    const recorded = saved.filter((row) => row.decision);
    assert.equal(recorded.length, 1);
    assert.deepEqual(recorded[0].decision.inviteMemberIds, ["100"]);
    const mine = await get(port, "/api/console?member=U_MINA");
    const other = await get(port, "/api/console?member=U_OTHER");
    assert.equal(mine.raw.includes("booth opens at nine"), false);
    assert.equal(other.raw.includes("booth opens at nine"), false);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a transcript lands on the opened meeting room without a typed name", async () => {
  const app = createApp({
    companyLoaded: true,
    linearReady: true,
    env: {
      RECALL_API_KEY: "recall-key",
      RECALL_WEBHOOK_SECRET: secret,
      SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
      SLACK_SIGNING_SECRET: "slack-signing",
      SLACK_BOT_TOKEN: "slack-bot",
      SEDERUNT_MEMBER: "100",
      CONSOLE_API_KEY: "console-key",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-service",
      CONSOLE_FOLDER_ID: "folder",
      COMPANY_MEMWAL_KEY: "company-key",
      COMPANY_MEMWAL_ACCOUNT_ID: "company-account",
    },
    deps: {
      meeting: { async join() { return { id: "bot-live" }; } },
      memory: {
        async remember() { return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const deliver = (words, deliveryId) => {
    const payload = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-live" },
        transcript: { id: deliveryId },
        data: { participant: { id: 100, name: "Anh" }, words: words.map((text) => ({ text })) },
      },
    });
    return post(port, "/api/recall", payload, {
      "webhook-id": deliveryId,
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, deliveryId, "1731705121", payload)}`,
    });
  };
  try {
    const joined = await post(port, "/api/join", JSON.stringify({
      url: "https://meet.google.com/abc-defg-hij",
    }), { "content-type": "application/json" });
    assert.deepEqual(JSON.parse(joined.raw), { join: "sent" });
    const quiet = await deliver(
      ["the", "weather", "is", "fine", "today", "k", "said", "her", "and", "the", "booth", "opens", "at", "nine"],
      "tr-quiet",
    );
    assert.equal(quiet.status, 204);
    const hidden = await get(port, "/api/console");
    assert.equal(hidden.raw.includes("booth opens"), false);
    assert.equal(hidden.raw.includes("weather"), false);
    const heard = await deliver(
      ["Hey", "Maple", "the", "booth", "opens", "at", "nine."],
      "tr-heard",
    );
    assert.equal(heard.status, 204);
    const board = JSON.parse((await get(port, "/api/console")).raw);
    assert.equal(board.rooms.length, 1);
    assert.equal(board.rooms[0].id, "bot-live");
    assert.equal(board.rooms[0].platform, "Google Meet");
    assert.match(board.decisions[0].text, /booth opens at nine/);
    assert.equal(board.decisions[0].roomId, "bot-live");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("join opens the meeting page as the camera and a failed join omits the key", async () => {
  const key = "recall-key-toolsecret";
  const env = { RECALL_API_KEY: key, RECALL_WEBHOOK_SECRET: secret, SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example" };
  const meeting = { url: "https://meet.google.com/abc-defg-hij" };
  let calls = 0;
  const guard = {
    async fetch() {
      calls += 1;
      throw new Error("network");
    },
  };
  await assert.rejects(() => createMeetingAdapter({}, guard).join(meeting), /not configured/);
  await assert.rejects(() => createMeetingAdapter({ RECALL_API_KEY: key }, guard).join(meeting), /not configured/);
  await assert.rejects(() => createMeetingAdapter({ RECALL_API_KEY: key, SEDERUNT_PUBLIC_ORIGIN: env.SEDERUNT_PUBLIC_ORIGIN }, guard).join(meeting), /not configured/);
  await assert.rejects(
    () => createMeetingAdapter({ ...env, SEDERUNT_PUBLIC_ORIGIN: "http://127.0.0.1:8787" }, guard).join(meeting),
    /not configured/,
  );
  assert.equal(calls, 0);

  const sent = [];
  const created = await createMeetingAdapter(env, {
    async fetch(url, init) {
      sent.push({ url, init });
      return { ok: true, async text() { return JSON.stringify({ id: "bot-1" }); } };
    },
  }).join(meeting);
  assert.equal(created.id, "bot-1");
  assert.match(created.ear, /^[a-f0-9]{48}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://ap-northeast-1.recall.ai/api/v1/bot/");
  assert.equal(sent[0].init.headers.authorization, `Token ${key}`);
  const body = JSON.parse(sent[0].init.body);
  assert.equal(body.meeting_url, "https://meet.google.com/abc-defg-hij");
  assert.equal(body.bot_name, "Adam");
  assert.equal(body.automatic_audio_output, undefined);
  assert.equal(JSON.stringify(body).includes(key), false);
  assert.equal(body.output_media.camera.kind, "webpage");
  const camera = new URL(body.output_media.camera.config.url);
  assert.equal(camera.origin, "https://sederunt.example");
  assert.equal(camera.pathname, "/meeting");
  assert.equal(camera.searchParams.get("name"), "Maple");
  assert.equal(camera.searchParams.get("ear"), created.ear);
  assert.deepEqual(body.variant, {
    zoom: "web_4_core",
    google_meet: "web_4_core",
    microsoft_teams: "web_4_core",
  });
  sent.length = 0;
  await createMeetingAdapter(env, {
    async fetch(url, init) {
      sent.push({ url, init });
      return { ok: true, async text() { return JSON.stringify({ id: "bot-2" }); } };
    },
  }).join({ ...meeting, name: "Maple", botName: "Mai" });
  const renamed = JSON.parse(sent[0].init.body);
  assert.equal(renamed.bot_name, "Mai");
  assert.equal(renamed.automatic_audio_output, undefined);
  const renamedPage = new URL(renamed.output_media.camera.config.url);
  assert.equal(renamedPage.searchParams.get("name"), "Maple");
  assert.match(renamedPage.searchParams.get("ear"), /^[a-f0-9]{48}$/);
  assert.notEqual(renamedPage.searchParams.get("ear"), created.ear);
  assert.deepEqual(body.recording_config, {
    video_mixed_mp4: {},
    include_bot_in_recording: { audio: true },
    transcript: {
      provider: { recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" } },
      diarization: { use_separate_streams_when_available: true },
    },
    realtime_endpoints: [{
      type: "webhook",
      url: "https://sederunt.example/api/recall",
      events: ["transcript.data", "transcript.partial_data"],
    }],
  });

  await assert.rejects(
    () => createMeetingAdapter(env, {
      async fetch() {
        calls += 1;
        return { ok: false, async text() { return key; } };
      },
    }).join(meeting),
    (error) => {
      assert.equal(error.message, "Meeting join failed");
      assert.equal(error.message.includes(key), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("streaming chunks that share a transcript.id still keep separately", () => {
  const same = "tr-shared";
  const first = recallTranscriptDelivery({
    event: "transcript.data",
    data: {
      bot: { id: "bot-live" },
      transcript: { id: same },
      data: {
        participant: { id: 100, name: "Anh" },
        words: [{ text: "Adam" }, { text: "remember" }, { text: "this:" }, { text: "District" }, { text: "7" }],
      },
    },
  });
  const second = recallTranscriptDelivery({
    event: "transcript.data",
    data: {
      bot: { id: "bot-live" },
      transcript: { id: same },
      data: {
        participant: { id: 100, name: "Anh" },
        words: [{ text: "Adam" }, { text: "remember" }, { text: "this:" }, { text: "cedar-92" }],
      },
    },
  });
  assert.ok(first?.deliveryId);
  assert.ok(second?.deliveryId);
  assert.notEqual(first.deliveryId, second.deliveryId);
  assert.equal(first.addressed, true);
  assert.equal(second.addressed, true);
  const replay = recallTranscriptDelivery({
    event: "transcript.data",
    data: {
      bot: { id: "bot-live" },
      transcript: { id: same },
      data: {
        participant: { id: 100, name: "Anh" },
        words: [{ text: "Adam" }, { text: "remember" }, { text: "this:" }, { text: "District" }, { text: "7" }],
      },
    },
  });
  assert.equal(replay.deliveryId, first.deliveryId);
});

test("two spoken keeps that share a transcript.id both land", async () => {
  const app = createApp({
    companyLoaded: true,
    env: { RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "100" },
    deps: {
      memory: { async remember() { return { blobId: null }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const deliver = (words) => {
    const payload = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-chunks" },
        transcript: { id: "tr-shared" },
        data: { participant: { id: 100, name: "Anh" }, words: words.map((text) => ({ text })) },
      },
    });
    return post(port, "/api/recall", payload, {
      "webhook-id": `msg-${words.join("-")}`,
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, `msg-${words.join("-")}`, "1731705121", payload)}`,
    });
  };
  try {
    assert.equal((await deliver(["Hey", "Maple", "the", "office", "is", "District", "7."])).status, 204);
    assert.equal((await deliver(["Hey", "Maple", "the", "unlock", "is", "cedar-92."])).status, 204);
    const board = JSON.parse((await get(port, "/api/console?member=100")).raw);
    const texts = (board.decisions ?? []).map((row) => row.text).join("\n");
    assert.match(texts, /District 7/);
    assert.match(texts, /cedar-92/);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a transcript with no speaker cannot borrow the configured member identity", async () => {
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    env: { RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "U_MINA" },
    deps: {
      memory: {
        async remember(input) { remembered.push(input); return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const payload = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-tab" },
        transcript: { id: "tr-tab" },
        data: {
          words: [{ text: "Hey" }, { text: "Maple" }, { text: "move-in" }, { text: "is" }, { text: "December" }, { text: "2nd." }],
        },
      },
    });
    const accepted = await post(port, "/api/recall", payload, {
      "webhook-id": "msg-tab",
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, "msg-tab", "1731705121", payload)}`,
    });
    assert.equal(accepted.status, 204);
    assert.equal(remembered.length, 1);
    assert.equal(remembered[0].kind, "room");
    assert.equal(remembered[0].room.call, "in_call_recording");
    assert.equal(JSON.stringify(remembered).includes("U_MINA"), false);
    assert.equal(JSON.stringify(remembered).includes("December"), false);
    const mine = await get(port, "/api/console?member=U_MINA");
    const other = await get(port, "/api/console?member=U_OTHER");
    assert.equal(mine.raw.includes("move-in is December 2nd"), false);
    assert.equal(other.raw.includes("December 2nd"), false);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a host ending the call stores call_ended", async () => {
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    env: { RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "U_MINA" },
    deps: {
      memory: {
        async remember(input) { remembered.push(input); return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const payload = JSON.stringify({
      event: "bot.call_ended",
      data: {
        data: { code: "call_ended", sub_code: null, updated_at: "2026-11-09T17:33:30.000Z" },
        bot: { id: "ba18bf31-3ac6-42a8-8973-ad64cdc99fe8", metadata: {} },
      },
    });
    const accepted = await post(port, "/api/recall", payload, {
      "webhook-id": "msg-ended",
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, "msg-ended", "1731705121", payload)}`,
    });
    assert.equal(accepted.status, 204);
    const room = remembered.find((row) => row.kind === "room");
    assert.equal(room.room.id, "ba18bf31-3ac6-42a8-8973-ad64cdc99fe8");
    assert.equal(room.room.call, "call_ended");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("verification rejects a secret that does not sign the raw body", () => {
  const payload = "{\"event\":\"bot.done\"}";
  const headers = {
    "webhook-id": "msg_test",
    "webhook-timestamp": "1731705121",
    "webhook-signature": `v1,${sign(secret, "msg_test", "1731705121", payload)}`,
  };
  assert.equal(verifyRecallRequest({ secret, headers, payload }), true);
  assert.equal(verifyRecallRequest({ secret, headers, payload: payload + " " }), false);
  assert.equal(verifyRecallRequest({ secret: "", headers, payload }), false);
});

test("Meet stays unavailable and names the missing verification secret", async () => {
  const app = createApp({
    env: { RECALL_API_KEY: "recall-key", SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example" },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const port = app.address().port;
    const consolePage = await get(port, "/console");
    assert.match(consolePage.raw, /Set RECALL_WEBHOOK_SECRET to the Recall workspace verification secret/);
    const joined = await post(port, "/api/join", JSON.stringify({ url: "https://meet.google.com/abc-defg-hij" }), {
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(joined.raw), { join: "not-configured" });
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

function sign(value, id, timestamp, payload) {
  const key = Buffer.from(value.slice("whsec_".length), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

function post(port, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: { ...headers, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function get(port, path, cookie = "") {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET", headers: cookie ? { cookie } : {} }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}


test("verified Google attendance binds a Recall speaker only in its meeting, even when numeric IDs repeat", async () => {
  const tenantId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const sessionSecret = "recall-oauth-fixture-secret";
  const cookies = (userId, email) => `${CONSOLE_COOKIE}=${encodeURIComponent(sealSession({
    kind: "oauth", provider: "google", userId, memberId: userId, email,
    accessToken: `access-${userId}`, refreshToken: `refresh-${userId}`,
    accessExp: Date.now() + 3600000, exp: Date.now() + 3600000,
    tenantId, onboarded: true,
  }, sessionSecret))}`;
  const writes = [];
  const app = createApp({ companyLoaded: true,
    env: { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: sessionSecret, RECALL_WEBHOOK_SECRET: secret, SEDERUNT_MEMBER: "U_SHARED" },
    tenantBind: { async resolve() { return tenantId; } },
    identity: { async myTenants() { return [{ id: tenantId, kind: "company", name: "Fixture", role: "owner" }]; }, async getUser() { return { app_metadata: { provider: "google" } }; }, async profile() { return null; } },
    deps: { memory: { allowUnscoped: false, async remember(row) { writes.push(row); return { blobId: null }; }, async index() { return []; }, async recall() { return []; } }, tatum: { async getObject() { throw new Error("unavailable"); } } },
  });
  app.listen(0, "127.0.0.1"); await once(app, "listening");
  const port = app.address().port;
  const deliver = async (botId, email, verified, text, id) => {
    const payload = JSON.stringify({ event: "transcript.data", data: { bot: { id: botId }, transcript: { id }, data: { participant: { id: 100, name: "Same display name", email, email_verified: verified }, words: text.split(" ").map((text) => ({ text })) } } });
    return post(port, "/api/recall", payload, { "webhook-id": id, "webhook-timestamp": "1731705121", "webhook-signature": `v1,${sign(secret, id, "1731705121", payload)}` });
  };
  try {
    assert.equal((await deliver("meeting-a", "mina@example.test", true, "Hey Maple the office is Lisbon.", "verified-a")).status, 204);
    assert.equal((await deliver("meeting-b", "other@example.test", true, "Hey Maple the office is Hanoi.", "verified-b")).status, 204);
    assert.equal((await deliver("meeting-c", "mina@example.test", false, "Hey Maple the office is London.", "unverified-c")).status, 204);
    assert.equal(writes.filter((row) => row.decision).length, 3);
    const mina = await get(port, "/api/console?member=100", cookies("google-mina", "mina@example.test"));
    assert.equal(mina.status, 200);
    assert.match(mina.raw, /Lisbon/);
    assert.equal(mina.raw.includes("Hanoi"), false);
    assert.equal(mina.raw.includes("London"), false);
    const other = await get(port, "/api/console", cookies("google-other", "other@example.test"));
    assert.match(other.raw, /Hanoi/);
    assert.equal(other.raw.includes("Lisbon"), false);
    const owner = await get(port, "/api/console?member=100", cookies("nonattendee-owner", "owner@example.test"));
    assert.equal(owner.raw.includes("Lisbon"), false);
    assert.equal(owner.raw.includes("Hanoi"), false);
  } finally { await new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve())); }
});

test("a presence line is spoken while the company index is still reading", async () => {
  let releaseIndex = () => {};
  const indexGate = new Promise((resolve) => { releaseIndex = resolve; });
  let played;
  const playedGate = new Promise((resolve) => { played = resolve; });
  let sawChat = false;
  const app = createApp({
    companyLoaded: true,
    env: {
      RECALL_WEBHOOK_SECRET: secret,
      RECALL_API_KEY: "recall-test-key",
      OPENROUTER_API_KEY: "sk-test-voice",
      OPENROUTER_VOICE_MODEL: "voice-model",
      SEDERUNT_MEMBER: "100",
    },
    deps: {
      memory: {
        async remember() { return { blobId: null }; },
        async index() { await indexGate; return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    fetch: async (url) => {
      const href = String(url);
      if (href.includes("/chat/completions")) {
        sawChat = true;
        return { ok: true, async json() { return { choices: [{ message: { content: "too late" } }] }; }, async text() { return ""; } };
      }
      if (href.includes("/audio/speech")) {
        return { ok: true, async arrayBuffer() { return Uint8Array.from([0xff, 0xfb, 0x10, 0x00]); }, async text() { return ""; } };
      }
      if (href.includes("/output_audio/")) {
        played();
        return { ok: true, async text() { return ""; }, async json() { return {}; } };
      }
      return { ok: false, async text() { return ""; }, async json() { return {}; } };
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const payload = JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "22222222-2222-4222-8222-222222222222" },
      transcript: { id: "tr-fast" },
      data: {
        participant: { id: 100, name: "Anh Nguyễn" },
        words: ["hey", "adam", "can", "you", "hear", "me"].map((text, index) => ({ text, start_timestamp: { relative: index } })),
      },
    },
  });
  try {
    const pending = post(port, "/api/recall", payload, {
      "webhook-id": "msg-fast",
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, "msg-fast", "1731705121", payload)}`,
    });
    const hit = await Promise.race([
      playedGate.then(() => "played"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 1000)),
    ]);
    assert.equal(hit, "played");
    assert.equal(sawChat, false);
    releaseIndex();
    assert.equal((await pending).status, 204);
  } finally {
    releaseIndex();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a partial transcript answers a check and is not kept", async () => {
  const remembered = [];
  let plays = 0;
  const app = createApp({
    companyLoaded: true,
    env: {
      RECALL_WEBHOOK_SECRET: secret,
      RECALL_API_KEY: "recall-test-key",
      OPENROUTER_API_KEY: "sk-test-voice",
      SEDERUNT_MEMBER: "100",
    },
    deps: {
      memory: {
        async remember(row) { remembered.push(row); return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    fetch: async (url) => {
      const href = String(url);
      if (href.includes("/audio/speech")) {
        return { ok: true, async arrayBuffer() { return Uint8Array.from([0xff, 0xfb, 0x10, 0x00]); }, async text() { return ""; } };
      }
      if (href.includes("/output_audio/")) {
        plays += 1;
        return { ok: true, async text() { return ""; }, async json() { return {}; } };
      }
      if (href.includes("/chat/completions")) {
        return { ok: true, async json() { return { choices: [{ message: { content: "The launch is Thursday." } }] }; }, async text() { return ""; } };
      }
      return { ok: false, async text() { return ""; }, async json() { return {}; } };
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const deliver = (event, words, id) => {
    const payload = JSON.stringify({
      event,
      data: {
        bot: { id: "33333333-3333-4333-8333-333333333333" },
        transcript: { id: "tr-partial" },
        data: {
          participant: { id: 100, name: "Anh Nguyễn" },
          words: words.map((text, index) => ({ text, start_timestamp: { relative: index === 0 ? 1.2 : index } })),
        },
      },
    });
    return post(port, "/api/recall", payload, {
      "webhook-id": id,
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, id, "1731705121", payload)}`,
    });
  };
  try {
    assert.equal((await deliver("transcript.partial_data", ["hey", "adam", "can", "you", "hear", "me"], "msg-partial")).status, 204);
    assert.equal(plays, 1);
    assert.equal(remembered.some((row) => JSON.stringify(row).includes("hear me")), false);
    assert.equal((await deliver("transcript.data", ["hey", "adam", "can", "you", "hear", "me"], "msg-final-check")).status, 204);
    assert.equal(plays, 1);
    assert.equal((await deliver("transcript.data", ["what", "time", "is", "the", "launch"], "msg-follow")).status, 204);
    assert.equal(plays, 2);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("hey adam can you hear me is spoken before the keep finishes", async () => {
  let rememberFinished = false;
  let releaseRemember = () => {};
  const gate = new Promise((resolve) => { releaseRemember = resolve; });
  let keepFinishedAtPlay = true;
  let played;
  const playedGate = new Promise((resolve) => { played = resolve; });
  const app = createApp({
    companyLoaded: true,
    env: {
      RECALL_WEBHOOK_SECRET: secret,
      RECALL_API_KEY: "recall-test-key",
      OPENROUTER_API_KEY: "sk-test-voice",
      OPENROUTER_VOICE_MODEL: "voice-model",
      SEDERUNT_MEMBER: "100",
    },
    deps: {
      memory: {
        async remember() {
          await gate;
          rememberFinished = true;
          return { blobId: null };
        },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    fetch: async (url) => {
      const href = String(url);
      if (href.includes("/output_audio/")) {
        keepFinishedAtPlay = rememberFinished;
        played();
        return { ok: true, async text() { return ""; }, async json() { return {}; } };
      }
      if (href.includes("/audio/speech")) {
        return { ok: true, async arrayBuffer() { return Uint8Array.from([0xff, 0xfb, 0x10, 0x00]); }, async text() { return ""; } };
      }
      if (href.includes("/chat/completions")) {
        return { ok: true, async json() { return { choices: [{ message: { content: "Yes, I can hear you." } }] }; }, async text() { return ""; } };
      }
      return { ok: false, async text() { return ""; }, async json() { return {}; } };
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const payload = JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "11111111-1111-4111-8111-111111111111" },
      transcript: { id: "tr-hear" },
      data: {
        participant: { id: 100, name: "Anh Nguyễn" },
        words: ["hey", "adam", "can", "you", "hear", "me"].map((text) => ({ text })),
      },
    },
  });
  try {
    const pending = post(port, "/api/recall", payload, {
      "webhook-id": "msg-hear",
      "webhook-timestamp": "1731705121",
      "webhook-signature": `v1,${sign(secret, "msg-hear", "1731705121", payload)}`,
    });
    const hit = await Promise.race([
      playedGate.then(() => "played"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000)),
    ]);
    assert.equal(hit, "played");
    assert.equal(keepFinishedAtPlay, false);
    releaseRemember();
    assert.equal((await pending).status, 204);
  } finally {
    releaseRemember();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});
