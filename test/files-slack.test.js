import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createRelayerMemoryClient } from "../src/files/memory.js";
import { createFileRuntime } from "../src/files/runtime.js";
import { createFileStore } from "../src/files/store.js";
import { createMemoryConsole } from "../src/files/memory-console.js";
import { createApp, defaultDeps } from "../src/server.js";

const secret = "slack-files-secret";
const TENANT = "00000000-0000-4000-a000-00000000acme";
const CHANNEL = "00000000-0000-4000-a000-00000000c001";

function signed(event) {
  const payload = JSON.stringify({ type: "event_callback", event });
  const timestamp = "1700000000";
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return { payload, headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature } };
}

function post(port, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: "/api/slack",
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("a bound Slack file is stored, and deleting the message hides it", async () => {
  const store = createFileStore();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "invited" });
  store.bindExternal({ provider: "slack", externalChannelId: "CFILES", channelId: CHANNEL });
  const files = createFileRuntime({
    env: {},
    store,
    storage: createMemoryConsole(),
    serverSecret: "test-secret",
    seal: null,
  });
  const env = { SLACK_SIGNING_SECRET: secret };
  const app = createApp({
    env,
    files,
    deps: {
      ...defaultDeps({ env }),
      slack: {
        async members() { return ["U1"]; },
        async downloadFile() { return { name: "plan.txt", bytes: "PLAN" }; },
      },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const shared = signed({
      type: "message",
      subtype: "file_share",
      user: "U1",
      channel: "CFILES",
      ts: "1700000001.0001",
      text: "the plan",
      files: [{ name: "plan.txt", url_private_download: "https://files.slack.example/plan.txt" }],
    });
    const stored = await post(app.address().port, shared.payload, shared.headers);
    assert.equal(stored.status, 200);
    const saved = store.allJobs().map((job) => store.getFile(job.fileId)).find((file) => file?.name === "plan.txt");
    assert.ok(saved);
    assert.equal(saved.status, "active");
    const removed = signed({
      type: "message",
      subtype: "message_deleted",
      channel: "CFILES",
      deleted_ts: "1700000001.0001",
      ts: "1700000002.0001",
    });
    const hidden = await post(app.address().port, removed.payload, removed.headers);
    assert.equal(hidden.status, 200);
    assert.equal(store.getFile(saved.id).status, "pending_delete");
    assert.equal(store.getFile(saved.id).deleteReason, "message_deleted");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("an unbound Slack channel does not invent a file", async () => {
  const store = createFileStore();
  const files = createFileRuntime({ env: {}, store, storage: createMemoryConsole() });
  const env = { SLACK_SIGNING_SECRET: secret };
  const app = createApp({
    env,
    files,
    deps: {
      ...defaultDeps({ env }),
      slack: {
        async members() { return ["U1"]; },
        async downloadFile() { return { name: "plan.txt", bytes: "PLAN" }; },
      },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const shared = signed({
      type: "message",
      user: "U1",
      channel: "CNEW",
      ts: "1700000003.0001",
      text: "loose file",
      files: [{ name: "plan.txt", url_private_download: "https://files.slack.example/plan.txt" }],
    });
    const stored = await post(app.address().port, shared.payload, shared.headers);
    assert.equal(stored.status, 200);
    assert.equal(store.allJobs().length, 0);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("the memory relayer signs forget and walks Security Delete", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, hasSignature: Boolean(init.headers?.["x-signature"]) });
    const json = (body, status = 200) => ({ ok: status < 300, status, async json() { return body; } });
    if (String(url).endsWith("/api/forget")) return json({ deleted: 1 });
    if (String(url).endsWith("/api/security-delete/challenge")) return json({ nonce: "n1", message: "sign-me" });
    if (String(url).endsWith("/api/security-delete/verify")) return json({ token: "tok" });
    if (String(url).endsWith("/api/security-deletions")) return json({ batchId: "batch-1", txBytes: "abc" });
    if (String(url).endsWith("/submit")) return json({ ok: true });
    return json({ status: "done", terminal: true });
  };
  const client = createRelayerMemoryClient({ fetchImpl });
  const account = {
    key: "ab".repeat(32),
    accountId: "acc-1",
    ownerKey: "present",
    serverUrl: "https://relayer.test",
    sign: async () => "owner-sig",
  };
  const forgotten = await client.forgetNamespace({ namespace: "sederunt-file-1", account });
  assert.equal(forgotten.deleted, 1);
  assert.equal(calls[0].hasSignature, true);
  const deleted = await client.securityDelete({ blobIds: ["mem-1"], account });
  assert.equal(deleted.batchId, "batch-1");
  assert.equal(calls.some((call) => call.url.endsWith("/api/security-deletions/batch-1/submit")), true);
});
