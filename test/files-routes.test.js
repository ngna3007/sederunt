import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createFileRuntime } from "../src/files/runtime.js";
import { createFileStore } from "../src/files/store.js";
import { createMemoryWalrus } from "../src/files/walrus.js";
import { createApp } from "../src/server.js";

const TENANT = "00000000-0000-4000-a000-00000000acme";
const CHANNEL = "00000000-0000-4000-a000-00000000c001";
const ALICE = "00000000-0000-4000-a000-00000000a11c";
const BOB = "00000000-0000-4000-a000-000000000b0b";
const ADMIN = "00000000-0000-4000-a000-00000000ad11";

function listen() {
  let now = new Date("2026-11-04T12:00:00.000Z");
  const store = createFileStore({ clock: () => now });
  const storage = createMemoryWalrus();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  store.addMember({ userId: BOB, name: "Bob", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  store.addMember({ userId: ADMIN, name: "Ada", tenantId: TENANT, role: "admin", channelIds: [CHANNEL] });
  const files = createFileRuntime({
    env: {},
    store,
    storage,
    serverSecret: "test-secret",
    trustUserHeader: true,
    seal: null,
  });
  const app = createApp({ env: {}, files });
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => ({
    port: app.address().port,
    store,
    setNow(date) { now = date; },
    close: () => new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve()))),
  }));
}

function call(port, method, path, { user, body, headers = {} } = {}) {
  const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(user ? { "x-file-user": user } : {}),
        ...(payload ? { "content-length": payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const type = String(res.headers["content-type"] || "");
        resolve({
          status: res.statusCode,
          raw,
          headers: res.headers,
          body: type.includes("json") ? JSON.parse(raw.toString("utf8")) : raw,
        });
      });
    });
    req.on("error", reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

test("upload, download, a non-member 404, and the delete request path", async () => {
  const server = await listen();
  try {
    const anon = await call(server.port, "GET", "/api/files");
    assert.equal(anon.status, 200);
    assert.deepEqual(anon.body.files, []);
    const uploaded = await call(server.port, "POST", "/api/files", {
      user: ALICE,
      body: Buffer.from("hello route"),
      headers: {
        "content-type": "text/plain",
        "x-channel-id": CHANNEL,
        "x-file-name": "hello.txt",
      },
    });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.status, "active");
    const outsider = await call(server.port, "GET", `/api/files/${uploaded.body.id}`, { user: "00000000-0000-4000-a000-000000000099" });
    assert.equal(outsider.status, 404);
    const downloaded = await call(server.port, "GET", `/api/files/${uploaded.body.id}`, { user: BOB });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.raw.toString(), "hello route");
    assert.match(String(downloaded.headers["content-disposition"]), /hello\.txt/);
    const denied = await call(server.port, "POST", `/api/files/${uploaded.body.id}/delete`, { user: BOB });
    assert.equal(denied.status, 403);
    const asked = await call(server.port, "POST", `/api/files/${uploaded.body.id}/request-delete`, {
      user: BOB,
      body: { reason: "Please remove it" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(asked.status, 201);
    const approved = await call(server.port, "POST", `/api/files/requests/${asked.body.id}/answer`, {
      user: ALICE,
      body: { approve: true },
      headers: { "content-type": "application/json" },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.file.status, "pending_delete");
    const hidden = await call(server.port, "GET", `/api/files/${uploaded.body.id}`, { user: BOB });
    assert.equal(hidden.status, 404);
    const listed = await call(server.port, "GET", "/api/files", { user: ALICE });
    assert.equal(listed.body.files.some((file) => file.deleting), true);
  } finally {
    await server.close();
  }
});

test("an admin sees a request that has waited 72 hours and can dismiss it", async () => {
  const server = await listen();
  try {
    const uploaded = await call(server.port, "POST", "/api/files", {
      user: ALICE,
      body: Buffer.from("old"),
      headers: { "content-type": "text/plain", "x-channel-id": CHANNEL, "x-file-name": "old.txt" },
    });
    const asked = await call(server.port, "POST", `/api/files/${uploaded.body.id}/request-delete`, {
      user: BOB,
      body: { reason: "stale" },
      headers: { "content-type": "application/json" },
    });
    server.store.patchRequest(asked.body.id, { createdAt: new Date("2026-11-01T00:00:00.000Z") });
    const before = await call(server.port, "GET", "/api/files/unanswered", { user: ADMIN });
    assert.equal(before.body.unanswered.length, 1);
    const member = await call(server.port, "GET", "/api/files/unanswered", { user: BOB });
    assert.equal(member.body.unanswered.length, 0);
    const dismissed = await call(server.port, "POST", `/api/files/requests/${asked.body.id}/dismiss`, { user: ADMIN });
    assert.equal(dismissed.status, 200);
    assert.equal(dismissed.body.status, "dismissed");
    const after = await call(server.port, "GET", "/api/files/unanswered", { user: ADMIN });
    assert.equal(after.body.unanswered.length, 0);
  } finally {
    await server.close();
  }
});

test("a multipart upload stores the file part", async () => {
  const server = await listen();
  try {
    const boundary = "----sederunt";
    const body = Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="channelId"\r\n\r\n${CHANNEL}\r\n` +
      `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="pic.txt"\r\ncontent-type: text/plain\r\n\r\nplain bytes\r\n` +
      `--${boundary}--\r\n`,
    );
    const uploaded = await call(server.port, "POST", "/api/files", {
      user: ALICE,
      body,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.name, "pic.txt");
    const downloaded = await call(server.port, "GET", `/api/files/${uploaded.body.id}`, { user: ALICE });
    assert.equal(downloaded.raw.toString(), "plain bytes");
  } finally {
    await server.close();
  }
});

