import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { importedFile, proofFromRecord } from "../src/files/console-files.js";
import { createFileLinks, LINK_TTL_MS } from "../src/files/links.js";
import { createMemoryConsole } from "../src/files/memory-console.js";
import { fileMetadata } from "../src/files/meta.js";
import { createFileRuntime } from "../src/files/runtime.js";
import { createSessionFiles, workspaceChannelId } from "../src/files/session.js";
import { createFileStore } from "../src/files/store.js";
import { createApp } from "../src/server.js";
import { renderConsolePage as renderConsole } from "../src/console-page.js";

const TENANT = "00000000-0000-4000-a000-00000000acme";
const OTHER = "00000000-0000-4000-a000-0000000000b2";

function liveApp({ users, rows = [], background = true } = {}) {
  let now = new Date("2026-11-05T06:00:00.000Z");
  const clock = () => now;
  const store = createFileStore({ clock });
  const memory = createMemoryConsole();
  const storage = { ...memory, calls: memory.calls, listShared: async () => rows };
  let session = null;
  const runtime = createFileRuntime({
    env: {},
    store,
    storage,
    clock,
    background,
    linkSecret: "test-links",
    seal: null,
    viewer: (req) => session.viewer(req),
  });
  session = createSessionFiles({
    env: { SEDERUNT_CONSOLE_PASSPHRASE: "x" },
    store,
    storage,
    identity: {},
    guard: (req) => {
      const who = users[String(req.headers["x-test-user"] || "")];
      return { required: true, session: who ? { kind: "oauth", ...who.session } : null };
    },
    spaceView: async (_identity, s) => Object.values(users).find((who) => who.session.userId === s.userId).space,
  });
  const app = createApp({ env: {}, files: runtime });
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => ({
    port: app.address().port,
    runtime,
    store,
    storage,
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
      headers: { ...(user ? { "x-test-user": user } : {}), ...(payload ? { "content-length": payload.length } : {}), ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const type = String(res.headers["content-type"] || "");
        resolve({ status: res.statusCode, raw, headers: res.headers, body: type.includes("json") ? JSON.parse(raw.toString("utf8")) : raw });
      });
    });
    req.on("error", reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

const USERS = {
  mina: { session: { userId: "u-mina", name: "Mina Tran" }, space: { activeId: TENANT, activeName: "Acme", activeRole: "owner" } },
  rowan: { session: { userId: "u-rowan", name: "Rowan Hale" }, space: { activeId: TENANT, activeName: "Acme", activeRole: "member" } },
  zed: { session: { userId: "u-zed", name: "Zed" }, space: { activeId: OTHER, activeName: "Other", activeRole: "owner" } },
};

test("signed links open once per person and file, and stop after 15 minutes", () => {
  let now = 1_000_000;
  const links = createFileLinks({ secret: "s", clock: () => now });
  const issued = links.issue("f1", "u1");
  assert.equal(new Date(issued.expiresAt).getTime() - now, LINK_TTL_MS);
  assert.deepEqual(links.open(issued.token, "f1"), { fileId: "f1", userId: "u1" });
  assert.equal(links.open(issued.token, "f2"), null);
  const [body, mac] = issued.token.split(".");
  const forged = Buffer.from(JSON.stringify({ f: "f1", u: "u2", exp: now + LINK_TTL_MS })).toString("base64url");
  assert.equal(links.open(`${forged}.${mac}`, "f1"), null);
  assert.equal(links.open(`${body}.x${mac.slice(1)}`, "f1"), null);
  assert.equal(createFileLinks({ secret: "other", clock: () => now }).open(issued.token, "f1"), null);
  now += LINK_TTL_MS;
  assert.equal(links.open(issued.token, "f1"), null);
});

test("a workspace member uploads in the background, then lists, downloads by link and deletes", async () => {
  const users = structuredClone(USERS);
  const server = await liveApp({ users });
  try {
    const empty = await call(server.port, "GET", "/api/files", { user: "mina" });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.files.length, 0);
    assert.deepEqual(empty.body.channels, [{ id: workspaceChannelId(TENANT), name: "Acme" }]);
    const none = await call(server.port, "GET", "/api/files");
    assert.equal(none.body.viewer, null);

    const uploaded = await call(server.port, "POST", "/api/files", {
      user: "mina",
      body: Buffer.from("floor plan"),
      headers: { "content-type": "text/plain", "x-file-name": encodeURIComponent("floor plan é.txt") },
    });
    assert.equal(uploaded.status, 202);
    assert.equal(uploaded.body.status, "uploading");
    await server.runtime.kick();
    const owner = await call(server.port, "GET", "/api/files", { user: "mina" });
    assert.equal(owner.body.uploading.length, 0);
    const listed = await call(server.port, "GET", "/api/files", { user: "rowan" });
    const file = listed.body.files.find((item) => item.id === uploaded.body.id);
    assert.equal(file.name, "floor plan é.txt");
    assert.equal(file.ownerName, "Mina Tran");
    assert.equal(file.canDelete, false);
    assert.equal(file.canRequest, true);
    const put = server.storage.calls.find((item) => item.op === "put");
    assert.equal(put.metadata.tenant_id, TENANT);
    assert.equal(put.metadata.owner_name, "Mina Tran");

    const outsider = await call(server.port, "GET", "/api/files", { user: "zed" });
    assert.equal(outsider.body.files.length, 0);
    const outsiderLink = await call(server.port, "POST", `/api/files/${file.id}/link`, { user: "zed" });
    assert.equal(outsiderLink.status, 404);

    const link = await call(server.port, "POST", `/api/files/${file.id}/link`, { user: "rowan" });
    assert.equal(link.status, 200);
    assert.match(link.body.url, /^\/api\/files\/[^/]+\/download\?token=/);
    const anonymous = await call(server.port, "GET", link.body.url);
    assert.equal(anonymous.status, 401);
    const other = await call(server.port, "GET", link.body.url, { user: "mina" });
    assert.equal(other.status, 404);
    const opened = await call(server.port, "GET", link.body.url, { user: "rowan" });
    assert.equal(opened.status, 200);
    assert.equal(opened.raw.toString("utf8"), "floor plan");
    assert.match(String(opened.headers["content-disposition"]), /filename\*=UTF-8''floor%20plan%20%C3%A9\.txt/);
    users.rowan.space.activeId = OTHER;
    const revoked = await call(server.port, "GET", link.body.url, { user: "rowan" });
    assert.equal(revoked.status, 404, "a signed link cannot reuse membership from the previous workspace");
    users.rowan.space.activeId = TENANT;
    const bad = await call(server.port, "GET", `/api/files/${file.id}/download?token=nope`);
    assert.equal(bad.status, 410);

    const deleted = await call(server.port, "POST", `/api/files/${file.id}/delete`, { user: "mina" });
    assert.equal(deleted.status, 200);
    await server.runtime.kick();
    assert.equal(server.store.getFile(file.id).status, "deleted");
    assert.equal(server.storage.calls.some((item) => item.op === "remove"), true);
    const after = await call(server.port, "GET", link.body.url, { user: "rowan" });
    assert.equal(after.status, 404, "a link stops working once the file is deleted");
  } finally {
    await server.close();
  }
});

test("a failed upload shows to its owner only, who can remove it", async () => {
  const server = await liveApp({ users: USERS });
  try {
    await call(server.port, "GET", "/api/files", { user: "mina" });
    server.runtime.storage = null;
    const uploaded = await call(server.port, "POST", "/api/files", {
      user: "mina",
      body: Buffer.from("x"),
      headers: { "content-type": "text/plain", "x-file-name": "a.txt" },
    });
    server.store.markFailed(uploaded.body.id, new Error("boom"));
    const owner = await call(server.port, "GET", "/api/files", { user: "mina" });
    assert.equal(owner.body.uploading[0].failed, true);
    const other = await call(server.port, "GET", "/api/files", { user: "rowan" });
    assert.equal(other.body.uploading.length, 0);
    assert.equal(other.body.files.length, 0);
    const refused = await call(server.port, "POST", `/api/files/${uploaded.body.id}/discard`, { user: "rowan" });
    assert.equal(refused.status, 404);
    const removed = await call(server.port, "POST", `/api/files/${uploaded.body.id}/discard`, { user: "mina" });
    assert.equal(removed.status, 200);
    const later = await call(server.port, "GET", "/api/files", { user: "mina" });
    assert.equal(later.body.uploading.length, 0);
  } finally {
    await server.close();
  }
});

test("after a restart the list comes back from Console metadata, with the Walrus details", async () => {
  const id = "11111111-2222-4333-a444-555555555555";
  const channelId = workspaceChannelId(TENANT);
  const meta = fileMetadata({ id, tenantId: TENANT, channelId, ownerUserId: "u-mina", ownerName: "Mina Tran", mimeType: "text/plain", sizeBytes: 10 });
  const record = {
    id: "console-1",
    bucket_id: "folder-1",
    name: `${id}-plan.txt`,
    status: "active",
    blob_id: "blob-abc",
    pooled_blob_object_id: "0xobj",
    created_at: "2026-11-05T05:00:00.000Z",
    metadata: meta,
  };
  const row = importedFile(record, { folderId: "folder-1", spaceId: "space-1" });
  assert.equal(row.name, "plan.txt");
  assert.equal(row.ownerName, "Mina Tran");
  assert.equal(importedFile({ ...record, metadata: {} }, { folderId: "f" }), null);
  assert.equal(importedFile({ ...record, status: "deleted" }, { folderId: "f" }), null);
  assert.deepEqual(proofFromRecord(record), { blobId: "blob-abc", objectId: "0xobj" });

  const server = await liveApp({ users: USERS, rows: [row] });
  try {
    const listed = await call(server.port, "GET", "/api/files", { user: "rowan" });
    const file = listed.body.files.find((item) => item.id === id);
    assert.equal(file.name, "plan.txt");
    assert.equal(file.proof.blobId, "blob-abc");
    assert.equal(file.proof.objectId, "0xobj");
    const outsider = await call(server.port, "GET", "/api/files", { user: "zed" });
    assert.equal(outsider.body.files.length, 0);
  } finally {
    await server.close();
  }
});

test("the Files page has an upload button, a delete confirm and the Walrus badge copy", () => {
  const html = renderConsole({});
  assert.match(html, /id="files-upload"[^>]*>Upload file</);
  assert.match(html, /id="file-delete-dialog"/);
  assert.match(html, /This cannot be undone\./);
  assert.match(html, /id="file-proof-dialog"/);
  assert.match(html, /Verified on Walrus/);
  assert.match(html, /Show technical details/);
  assert.match(html, /Uploading…/);
  assert.match(html, /Couldn't upload/);
});

test("foreground delete finishes inside the request (Vercel shape)", async () => {
  const server = await liveApp({ users: USERS, background: false });
  try {
    const uploaded = await call(server.port, "POST", "/api/files", {
      user: "mina",
      body: Buffer.from("scratch"),
      headers: { "content-type": "text/plain", "x-file-name": encodeURIComponent("scratch.txt") },
    });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.status, "active");
    const deleted = await call(server.port, "POST", `/api/files/${uploaded.body.id}/delete`, { user: "mina" });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.status, "deleted");
    assert.equal(server.store.getFile(uploaded.body.id).status, "deleted");
    assert.equal(server.storage.calls.some((item) => item.op === "remove"), true);
    const listed = await call(server.port, "GET", "/api/files", { user: "mina" });
    assert.equal(listed.body.files.some((item) => item.id === uploaded.body.id), false);
  } finally {
    await server.close();
  }
});
