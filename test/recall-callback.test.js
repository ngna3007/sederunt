import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createMeetingAdapter, verifyRecallRequest } from "../src/meeting/recall.js";

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
    assert.match(meeting.raw, /Quiet until addressed/);
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

test("join sends one bot to the public camera page and a failed join omits the key", async () => {
  const key = "recall-key-toolsecret";
  const env = { RECALL_API_KEY: key, SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example" };
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
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://ap-northeast-1.recall.ai/api/v1/bot/");
  assert.equal(sent[0].init.headers.authorization, `Token ${key}`);
  const body = JSON.parse(sent[0].init.body);
  assert.equal(body.meeting_url, "https://meet.google.com/abc-defg-hij");
  assert.equal(body.bot_name, "Sederunt");
  assert.equal(body.output_media.camera.config.url, "https://sederunt.example/meeting");

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

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}
