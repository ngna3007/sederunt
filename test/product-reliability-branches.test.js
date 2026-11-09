import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMemoryFollowupStore } from "../src/meeting/followup-store.js";
import { createSession } from "../src/session.js";
import { createApp } from "../src/server.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const recallSecret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

test("a typed follow-up is refused on the signed Slack action", async () => {
  const app = createApp({ env: { SEDERUNT_SESSION_SECRET: "session-secret-for-branch-test" } });
  await listen(app);
  try {
    for (const text of ["hello", "hello again", "hello once more"]) {
      const plain = await post(app.address().port, "/api/typed", JSON.stringify({ text }), { "content-type": "application/json" });
      assert.equal(plain.raw.includes("signed Slack action"), false);
    }
    const refused = await post(app.address().port, "/api/typed", JSON.stringify({ text: "approve", followup: { id: "x", tool: "create_issue" } }), { "content-type": "application/json" });
    assert.equal(refused.status, 403);
    assert.match(refused.raw, /signed Slack action/);
  } finally {
    await close(app);
  }
});

test("Slack deletion reports the retry only when the delete could not be saved", async () => {
  const session = createSession();
  session.decisions.push({
    id: "slack-decision", text: "keep the floor plan", roomId: "C1", sourceDeliveryId: "123.456", deleted: false, inviteMemberIds: ["U_MINA"], memberId: "U_MINA",
  });
  const app = createApp({
    session, companyLoaded: false,
    env: {
      SLACK_SIGNING_SECRET: "slack-signing-secret",
      CONSOLE_API_KEY: "console-key",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-private",
      SEDERUNT_SESSION_SECRET: "session-secret-for-branch-test",
    },
    deps: { memory: null, slack: { fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }) } },
  });
  await listen(app);
  try {
    const kept = JSON.stringify({
      type: "event_callback", team_id: "T1",
      event: { type: "message", channel: "D1", channel_type: "im", user: "U_MINA", text: "hello from the floor", ts: "9.1" },
    });
    const keptSent = await post(app.address().port, "/api/slack", kept, slackHeaders(kept));
    assert.notEqual(keptSent.status, 503);
    assert.equal(keptSent.raw.includes("Deletion could not be saved"), false);
    const named = JSON.stringify({
      type: "event_callback", team_id: "T1",
      event: { type: "message", subtype: "message_deleted", channel: "C1", deleted_ts: "123.456" },
    });
    const namedSent = await post(app.address().port, "/api/slack", named, slackHeaders(named));
    assert.equal(namedSent.status, 503);
    const missing = JSON.stringify({
      type: "event_callback",
      event: { type: "message", subtype: "message_deleted", channel: "C1", deleted_ts: "123.456" },
    });
    const sent = await post(app.address().port, "/api/slack", missing, slackHeaders(missing));
    assert.equal(sent.status, 503);
    assert.equal(sent.raw, JSON.stringify({ error: "Deletion could not be saved. Retry this event." }));
    assert.equal(session.decisions[0].deleted, false);
  } finally {
    await close(app);
  }
});

test("room media stays unavailable when the room cannot be prepared", async () => {
  const session = createSession();
  session.decisions.push({
    id: "secret-decision", text: "hidden booth phrase", roomId: "room-1", deleted: false, inviteMemberIds: ["100"], memberId: "100",
  });
  let reads = 0;
  const app = createApp({
    session, companyLoaded: true,
    env: { SEDERUNT_MEMBER: "100" },
    botPreferences: {
      async list() {
        reads += 1;
        if (reads > 1) throw new Error("hearing down");
        return [];
      },
    },
    deps: {
      memory: { async remember() { return { blobId: "blob" }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(app);
  try {
    const body = await get(app.address().port, "/console/rooms/room-1/media");
    assert.equal(reads > 1, true);
    assert.equal(body.status, 503);
    assert.equal(body.raw, "Request failed.");
    assert.equal(body.raw.includes("hidden booth phrase"), false);
    assert.equal(body.raw.includes("hearing down"), false);
  } finally {
    await close(app);
  }
});

test("meeting finalization reads the opened room and does not mark two attendees private", async () => {
  const store = createMemoryFollowupStore();
  let indexReads = 0;
  const app = createApp({
    companyLoaded: true,
    followupStore: store,
    env: {
      RECALL_WEBHOOK_SECRET: recallSecret,
      SLACK_SIGNING_SECRET: "slack-signing-secret",
      SLACK_CLIENT_ID: "slack-client",
      SLACK_CLIENT_SECRET: "slack-client-secret",
      SEDERUNT_RECOVERY_SECRET: "recovery-secret-value",
    },
    deps: {
      memory: {
        async remember() { return { blobId: "blob-1" }; },
        async index() {
          indexReads += 1;
          return [{ tenantId: tenant, room: { id: "bot-live", kind: "meeting", platform: "Google Meet" } }];
        },
        async recall() { return []; },
      },
      slack: { fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }) },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    tenantBind: {
      async resolve(kind, id) {
        if (kind === "bot" && id === "bot-live") return tenant;
        if (kind === "bot" && id === "bot-empty") return "22222222-2222-4222-8222-222222222222";
        return "";
      },
      async releaseTenants() {},
    },
    slackInstallations: {
      async tokenFor() { return { token: "xoxb-test", teamId: "T1", generation: 1, botUserId: "B1", channelId: "" }; },
      async byTeam() { return null; },
    },
    slackMatches: { async get({ email }) { return { slackUserId: email === "mina@example.com" ? "U_MINA" : "U_ARI" }; } },
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom() {
        return [
          { memberId: "100", email: "mina@example.com", roomId: "bot-live" },
          { memberId: "200", email: "ari@example.com", roomId: "bot-live" },
        ];
      },
    },
    adminStore: { async tenantRetired() { return false; } },
  });
  await listen(app);
  try {
    const empty = await recall(app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-empty" } } }));
    assert.equal(empty.status, 204);
    const ended = await recall(app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(ended.status, 204);
    const outcome = (await store.list(tenant, { kind: "outcome" })).find((row) => row.data?.input);
    assert.ok(outcome);
    assert.equal(indexReads >= 2, true);
    assert.equal(outcome.data.input.botName, "Adam");
    assert.equal(outcome.data.input.meeting.privateOneToOne, false);
    assert.equal(outcome.data.input.memberIds.length, 2);
  } finally {
    await close(app);
  }
});

test("a direct boot opens the local server when production mode is off", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    PORT: "0",
  };
  if (process.env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, ["src/server.js"], { cwd: root, env });
  let heard = false;
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.includes("Sederunt typed path")) heard = true;
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 8000);
  await new Promise((resolve) => {
    const finish = () => resolve();
    child.once("exit", finish);
    const watch = setInterval(() => {
      if (!heard) return;
      clearInterval(watch);
      child.kill("SIGTERM");
    }, 50);
    child.once("exit", () => clearInterval(watch));
  });
  clearTimeout(timer);
  assert.equal(heard, true);
});

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening");
}

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } }, (res) => {
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

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}

function slackHeaders(raw) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", "slack-signing-secret").update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  return { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature, "content-type": "application/json" };
}

function recall(port, payload) {
  const id = `msg_${payload.length}`;
  const timestamp = "1731705121";
  const key = Buffer.from(recallSecret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return post(port, "/api/recall", payload, {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  });
}
