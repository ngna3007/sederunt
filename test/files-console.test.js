import assert from "node:assert/strict";
import test from "node:test";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  folderPolicy,
  metadataReady,
  pollFile,
  postCiphertext,
  retryAfterMs,
  signConsoleReserve,
} from "../src/console/upload.js";
import { createConsoleFiles } from "../src/files/console-files.js";
import { FileError } from "../src/files/errors.js";
import { createMemoryCleaner } from "../src/files/memory.js";
import { assertFileMetadata, fileTags, fitTag } from "../src/files/meta.js";
import { createFileService } from "../src/files/service.js";
import { createFileStore } from "../src/files/store.js";
import { runFileWorker } from "../src/files/worker.js";

const API = "https://api.console.walrus.xyz";
const TENANT = "00000000-0000-4000-a000-00000000acme";
const CHANNEL = "00000000-0000-4000-a000-00000000c001";
const ALICE = "00000000-0000-4000-a000-00000000a11c";

function json(body, status = 200, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function bytesResponse(bytes) {
  const copy = Uint8Array.from(bytes);
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({}),
    arrayBuffer: async () => copy.buffer,
  };
}

/**
 * In-process Console. Every call stays in this process.
 * @param {Record<string, any>} [options]
 */
function createFakeConsole(options = {}) {
  const calls = [];
  const waits = [];
  const buckets = (options.existing || []).map((bucket) => ({ ...bucket }));
  const files = new Map();
  let fileSeq = 0;
  let deleteCount = 0;
  let statusFailures = options.statusFailures || 0;
  let rateLeft = options.rateHits || 0;
  const statusReads = new Map();

  async function fetchImpl(url, init) {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    const call = {
      href,
      method,
      authorization: init?.headers?.authorization ?? null,
      redirect: init?.redirect ?? null,
      initPassed: init !== undefined,
    };
    calls.push(call);
    if (rateLeft > 0 && href.includes("/api/v1/")) {
      rateLeft -= 1;
      return json({}, 429, { "retry-after": options.retryAfter ?? "2" });
    }
    const parsed = new URL(href);
    const path = parsed.pathname;

    if (!path.startsWith("/api/")) {
      const id = href.split("/").pop();
      const file = files.get(id);
      return bytesResponse(file?.cipher || options.cipher || Buffer.from("cipher"));
    }

    const spaces = path === "/api/v1/spaces";
    if (spaces && method === "GET") {
      return json({ data: options.spaces || [{ id: "space-personal", type: "personal" }, { id: "space-team", type: "team" }] });
    }

    const reserve = path.match(/^\/api\/v1\/spaces\/([^/]+)\/buckets$/);
    if (reserve && method === "POST") {
      const body = JSON.parse(String(init.body));
      call.body = body;
      if (options.reserve === "limit") return json({ code: "plan_limit_exceeded" }, 422);
      const spaceId = decodeURIComponent(reserve[1]);
      if (options.reserve === "conflict" || buckets.some((bucket) => bucket.spaceId === spaceId && bucket.name === body.name)) {
        return json({ error: "conflict" }, 409);
      }
      const id = options.createdFolderId || "folder-new";
      buckets.push({ id, name: body.name, spaceId, scope: body.scope, seal_policy_id: null });
      return json({
        bucket_id: id,
        bytes: Buffer.from("sponsored-tx").toString("base64"),
        digest: "digest",
        state: "pending_policy",
      }, 201);
    }
    if (reserve && method === "GET") {
      const q = (parsed.searchParams.get("q") || "").toLowerCase();
      const list = buckets.filter((bucket) => !q || String(bucket.name).toLowerCase().includes(q));
      return json({
        buckets: list.map((bucket) => ({ id: bucket.id, name: bucket.name, seal_policy_id: bucket.seal_policy_id || null })),
      });
    }

    const finalize = path.match(/^\/api\/v1\/buckets\/([^/]+)\/finalize$/);
    if (finalize && method === "POST") {
      const id = decodeURIComponent(finalize[1]);
      const body = JSON.parse(String(init.body));
      call.signature = body.signature;
      const bucket = buckets.find((item) => item.id === id);
      if (bucket) bucket.seal_policy_id = "0xpolicy";
      return json({ bucket_id: id, seal_policy_id: "0xpolicy", state: "active" });
    }

    const bucketOnly = path.match(/^\/api\/v1\/buckets\/([^/]+)$/);
    if (bucketOnly && method === "GET") {
      const id = decodeURIComponent(bucketOnly[1]);
      const bucket = buckets.find((item) => item.id === id);
      return json({ data: { id, seal_policy_id: bucket?.seal_policy_id || options.policyId || "0xpolicy" } });
    }

    const upload = path.match(/^\/api\/v1\/buckets\/([^/]+)\/files$/);
    if (upload && method === "POST") {
      const folderId = decodeURIComponent(upload[1]);
      const fields = {};
      for (const [key, value] of init.body.entries()) fields[key] = value;
      call.fieldNames = Object.keys(fields);
      call.metadata = typeof fields.metadata === "string" ? fields.metadata : null;
      const id = `file-${++fileSeq}`;
      const cipher = fields.file ? Buffer.from(await fields.file.arrayBuffer()) : Buffer.alloc(0);
      files.set(id, { folderId, name: String(fields.name || ""), status: "uploading", tags: [], cipher });
      return json({ data: { id } }, 202);
    }

    const status = path.match(/^\/api\/v1\/buckets\/([^/]+)\/files\/([^/]+)\/status$/);
    if (status && method === "GET") {
      if (statusFailures > 0) {
        statusFailures -= 1;
        return json({}, 500);
      }
      if (options.status404) return json({}, 404);
      const id = decodeURIComponent(status[2]);
      const seen = statusReads.get(id) || 0;
      statusReads.set(id, seen + 1);
      const plan = options.statusPlan || ["queued", "completed"];
      const state = plan[Math.min(seen, plan.length - 1)];
      const file = files.get(id);
      if (file && state === "completed") file.status = "active";
      return json({ data: { state } });
    }

    const download = path.match(/^\/api\/v1\/buckets\/([^/]+)\/files\/([^/]+)\/download$/);
    if (download && method === "GET") {
      const id = decodeURIComponent(download[2]);
      const location = options.location || `https://files.example/${id}`;
      return json({}, 307, { location });
    }

    const fileRoute = path.match(/^\/api\/v1\/buckets\/([^/]+)\/files\/([^/]+)$/);
    if (fileRoute && method === "DELETE") {
      deleteCount += 1;
      const id = decodeURIComponent(fileRoute[2]);
      if (options.deleteStatus === 404) {
        files.delete(id);
        return json({}, 404);
      }
      const file = files.get(id);
      if (file) file.status = options.linger && deleteCount === 1 ? "deleting" : "deleted";
      return json({}, 204);
    }
    if (fileRoute && method === "GET") {
      const id = decodeURIComponent(fileRoute[2]);
      const file = files.get(id);
      if (!file) {
        if (options.metadataStatus) return json({ data: { id, status: options.metadataStatus } });
        return json({}, 404);
      }
      const statusName = options.metadataStatus || file.status;
      return json({ data: { id, status: statusName, state: statusName, tags: file.tags } });
    }

    const patch = path.match(/^\/api\/v1\/files\/([^/]+)$/);
    if (patch && method === "PATCH") {
      const id = decodeURIComponent(patch[1]);
      const body = JSON.parse(String(init.body));
      call.tags = body.tags;
      const file = files.get(id);
      if (file) file.tags = body.tags;
      return json({ data: { id, tags: body.tags } });
    }

    throw new Error(`unexpected ${method} ${href}`);
  }

  return {
    fetchImpl,
    calls,
    waits,
    buckets,
    files,
    wait: async (ms) => { waits.push(ms); },
  };
}

function filesEnv(extra = {}) {
  return {
    CONSOLE_API_KEY: "hbr_test_key",
    CONSOLE_SERVICE_PRIVATE_KEY: "unused-service-key",
    CONSOLE_SPACE_ID: "space-1",
    ...extra,
  };
}

function storageFor(fake, env, store, extra = {}) {
  return createConsoleFiles({
    env,
    store,
    fetch: fake.fetchImpl,
    wait: fake.wait,
    encrypt: async (plain) => plain,
    decrypt: async (cipher) => cipher,
    sign: extra.sign || (async () => "sig-test"),
    ...extra,
  });
}

test("metadata treats an active file as stored and a failed file as failed", () => {
  assert.equal(metadataReady({ status: "active" }), "completed");
  assert.equal(metadataReady({ state: "completed" }), "completed");
  assert.equal(metadataReady({ status: "deleted" }), "deleted");
  assert.equal(metadataReady({ status: "active", state: "failed" }), "failed");
  assert.equal(metadataReady({ status: "deleting" }), "");
  assert.equal(metadataReady(null), "");
});

test("tags stay within 30 characters and the same id always maps to the same tag", () => {
  const tags = fileTags({ tenantId: TENANT, channelId: CHANNEL });
  assert.equal(tags.length, 2);
  assert.equal(tags[0].length, 30);
  assert.equal(tags[1].length, 30);
  assert.equal(tags[0], fitTag("tenant", TENANT));
  assert.equal(tags[1], fitTag("channel", CHANNEL));
  assert.equal(tags[0], fileTags({ tenantId: TENANT, channelId: CHANNEL })[0]);
  assert.equal(tags[0].includes("-"), false);
  assert.equal(tags[0], `tenant:${TENANT.replace(/-/g, "").slice(0, 23)}`);
  assert.equal(tags[1], `channel:${CHANNEL.replace(/-/g, "").slice(0, 22)}`);
  assert.throws(() => assertFileMetadata({ blob: "x".repeat(9000) }), (error) => error instanceof FileError && error.status === 400);
});

test("Retry-After is honoured and a single wait is capped at 60 seconds", () => {
  const now = Date.parse("2026-11-04T12:00:00.000Z");
  assert.equal(retryAfterMs("2", now), 2000);
  assert.equal(retryAfterMs("120", now), 60_000);
  assert.equal(retryAfterMs("", now), 1000);
  assert.equal(retryAfterMs(new Date(now + 5000).toUTCString(), now), 5000);
  assert.equal(retryAfterMs(new Date(now + 120_000).toUTCString(), now), 60_000);
});

test("a 429 waits for Retry-After and then stops after the bounded retries", async () => {
  const once = createFakeConsole({ rateHits: 1, retryAfter: "2" });
  const policy = await folderPolicy(once.fetchImpl, "hbr_test_key", "folder-1", once.wait);
  assert.equal(policy, "0xpolicy");
  assert.deepEqual(once.waits, [2000]);
  assert.equal(once.calls.filter((call) => call.href.endsWith("/buckets/folder-1")).length, 2);

  const stuck = createFakeConsole({ rateHits: 10, retryAfter: "1" });
  await assert.rejects(() => folderPolicy(stuck.fetchImpl, "hbr_test_key", "folder-1", stuck.wait), /not readable/);
  assert.equal(stuck.calls.length, 4);
  assert.deepEqual(stuck.waits, [1000, 1000, 1000]);
});

test("metadata over 8 KiB is refused before any request", async () => {
  let called = false;
  const huge = { note: "x".repeat(9000) };
  await assert.rejects(
    () => postCiphertext(async () => { called = true; return json({}); }, "hbr_test_key", "folder-1", {
      name: "big.txt",
      ciphertext: new Uint8Array([1]),
      metadata: huge,
    }),
    (error) => error.code === "metadata_too_large",
  );
  assert.equal(called, false);
});

test("the service key signs a folder reserve", async () => {
  const keypair = new Ed25519Keypair();
  const secret = keypair.getSecretKey();
  const bytes = Buffer.from("sponsored-tx");
  const signature = await signConsoleReserve(secret, bytes.toString("base64"));
  const again = await signConsoleReserve(secret, bytes.toString("base64"));
  assert.equal(typeof signature, "string");
  assert.equal(signature.length > 20, true);
  assert.equal(signature.includes("suiprivkey"), false);
  assert.equal(again, signature);
});

test("a shared folder is reserved, signed, and finalized once", async () => {
  const fake = createFakeConsole();
  const store = createFileStore();
  const env = filesEnv();
  const storage = storageFor(fake, env, store);
  const first = await storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL });
  const second = await storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL });
  assert.equal(first.created, true);
  assert.equal(first.spaceId, "space-1");
  assert.equal(first.folderId, "folder-new");
  assert.equal(first.sealPolicyId, "0xpolicy");
  assert.deepEqual(second, { ...first, created: false });
  const posts = fake.calls.filter((call) => call.method === "POST" && call.href.endsWith("/buckets"));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { name: "sederunt-files", scope: "private" });
  const finalize = fake.calls.find((call) => call.href.endsWith("/finalize"));
  assert.equal(finalize.signature, "sig-test");
  assert.equal(store.findConsoleFolder("space-1", "sederunt-files").folderId, "folder-new");
  assert.equal(fake.calls.some((call) => call.href === `${API}/api/v1/spaces`), false);
});

test("a folder name conflict reuses the folder that already has a policy", async () => {
  const fake = createFakeConsole({
    reserve: "conflict",
    existing: [{ id: "folder-kept", name: "sederunt-files", spaceId: "space-1", seal_policy_id: "0xkept" }],
  });
  const storage = storageFor(fake, filesEnv(), createFileStore(), {
    sign: async () => { throw new Error("should not sign"); },
  });
  const folder = await storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL });
  assert.equal(folder.folderId, "folder-kept");
  assert.equal(folder.sealPolicyId, "0xkept");
  assert.equal(folder.created, false);
  assert.equal(fake.calls.some((call) => call.href.endsWith("/finalize")), false);
  assert.equal(fake.calls.some((call) => call.href.includes("q=sederunt-files")), true);
});

test("a taken folder name without a policy is refused", async () => {
  const fake = createFakeConsole({
    reserve: "conflict",
    existing: [{ id: "folder-kept", name: "sederunt-files", spaceId: "space-1", seal_policy_id: "" }],
  });
  const storage = storageFor(fake, filesEnv(), createFileStore());
  await assert.rejects(
    () => storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL }),
    /taken and not readable/,
  );
});

test("a configured folder id is used as-is and no folder is created", async () => {
  const fake = createFakeConsole();
  let signed = false;
  const store = createFileStore();
  const storage = storageFor(fake, filesEnv({ CONSOLE_FOLDER_ID: "folder-pinned" }), store, {
    sign: async () => { signed = true; return "nope"; },
  });
  const folder = await storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL });
  assert.deepEqual(
    { spaceId: folder.spaceId, folderId: folder.folderId, sealPolicyId: folder.sealPolicyId, created: folder.created },
    { spaceId: "space-1", folderId: "folder-pinned", sealPolicyId: "0xpolicy", created: false },
  );
  assert.equal(signed, false);
  assert.equal(store.findConsoleFolder("space-1", "sederunt-files"), null);
  assert.equal(fake.calls.some((call) => call.method === "POST"), false);
});

test("the key's personal space is used when no space id is configured", async () => {
  const fake = createFakeConsole();
  const env = filesEnv();
  delete env.CONSOLE_SPACE_ID;
  const storage = storageFor(fake, env, createFileStore());
  const folder = await storage.resolveFolder({ tenantId: TENANT, channelId: CHANNEL });
  assert.equal(folder.spaceId, "space-personal");
  const reserve = fake.calls.find((call) => call.method === "POST" && call.href.includes("/buckets"));
  assert.match(reserve.href, /\/spaces\/space-personal\/buckets$/);
});

test("an upload posts ciphertext without contentSize, patches tags, and polls until completed", async () => {
  const fake = createFakeConsole({ statusPlan: ["queued", "active", "completed"] });
  const store = createFileStore();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  const storage = storageFor(fake, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), store);
  const service = createFileService({ store, storage, memory: createMemoryCleaner({ account: { configured: false } }) });
  const saved = await service.upload({
    actorUserId: ALICE,
    channelId: CHANNEL,
    name: "notes.txt",
    bytes: Buffer.from("hello console"),
    slackFileId: "F123",
  });
  assert.equal(saved.status, "active");
  assert.equal(saved.consoleSpaceId, "space-1");
  assert.equal(saved.consoleFolderId, "folder-1");
  assert.equal(saved.consoleFileId, "file-1");
  const post = fake.calls.find((call) => call.method === "POST" && call.href.endsWith("/files"));
  assert.equal(post.fieldNames.includes("contentSize"), false);
  assert.equal(post.fieldNames.includes("metadata"), true);
  const metadata = JSON.parse(post.metadata);
  assert.equal(metadata.sederunt_file_id, saved.id);
  assert.equal(metadata.tenant_id, TENANT);
  assert.equal(metadata.channel_id, CHANNEL);
  assert.equal(metadata.owner_person_id, ALICE);
  assert.equal(metadata.slack_file_id, "F123");
  const patch = fake.calls.find((call) => call.method === "PATCH");
  assert.equal(patch.href, `${API}/api/v1/files/file-1`);
  assert.deepEqual(patch.tags, fileTags({ tenantId: TENANT, channelId: CHANNEL }));
  assert.equal(patch.tags.every((tag) => tag.length <= 30), true);
  const states = fake.calls.filter((call) => call.href.endsWith("/status"));
  assert.equal(states.length, 3);
  assert.equal(post.authorization, "Bearer hbr_test_key");

  const plain = await storage.download({ folderId: "folder-1", fileId: "file-1", policyId: "0xpolicy" });
  assert.equal(Buffer.from(plain).toString(), "hello console");
  const download = fake.calls.find((call) => call.href.endsWith("/download"));
  assert.equal(download.redirect, "manual");
  assert.equal(download.authorization, "Bearer hbr_test_key");
  const follow = fake.calls.find((call) => call.href === "https://files.example/file-1");
  assert.equal(follow.initPassed, false);
  assert.equal(follow.authorization, null);
});

test("a missing upload status falls back to file metadata", async () => {
  const fake = createFakeConsole({ status404: true, metadataStatus: "active" });
  const state = await pollFile(fake.fetchImpl, "hbr_test_key", "folder-1", "file-9", fake.wait);
  assert.equal(state, "completed");
  assert.equal(fake.calls.filter((call) => call.href.endsWith("/status")).length, 1);
  assert.equal(fake.waits.length, 0);
  const meta = fake.calls.find((call) => call.href.endsWith("/files/file-9") && call.method === "GET");
  assert.ok(meta);
});

test("a relative download redirect is followed without the api key", async () => {
  const fake = createFakeConsole({ location: "/cipher-object", cipher: Buffer.from("blob") });
  const storage = storageFor(fake, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), null);
  fake.files.set("file-1", { cipher: Buffer.from("blob"), status: "active" });
  const plain = await storage.download({ folderId: "folder-1", fileId: "file-1", policyId: "0xpolicy" });
  assert.equal(Buffer.from(plain).toString(), "blob");
  const follow = fake.calls.find((call) => call.href === `${API}/cipher-object`);
  assert.equal(follow.initPassed, false);
  assert.equal(follow.authorization, null);
});

test("delete accepts 204 once the file is deleted, and 404 is success", async () => {
  const live = createFakeConsole({ linger: true });
  const storage = storageFor(live, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), null);
  await storage.put({
    name: "notes.txt",
    plain: Buffer.from("hello"),
    metadata: { sederunt_file_id: "1" },
    tags: ["tenant:abc"],
    folder: { spaceId: "space-1", folderId: "folder-1", sealPolicyId: "0xpolicy" },
  });
  const pending = await storage.remove({ folderId: "folder-1", fileId: "file-1" });
  assert.deepEqual(pending, { deleted: false, status: "deleting" });
  const done = await storage.remove({ folderId: "folder-1", fileId: "file-1" });
  assert.deepEqual(done, { deleted: true });
  assert.equal(live.calls.filter((call) => call.method === "DELETE").every((call) => call.href.endsWith("/files/file-1")), true);

  const missing = createFakeConsole({ deleteStatus: 404 });
  const other = storageFor(missing, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), null);
  const gone = await other.remove({ folderId: "folder-1", fileId: "already-gone" });
  assert.deepEqual(gone, { deleted: true });
  assert.equal(missing.calls.some((call) => call.method === "DELETE" && call.href.endsWith("/files/already-gone")), true);
  assert.equal(missing.calls.some((call) => call.method === "GET" && call.href.endsWith("/files/already-gone")), true);
});

test("a delete stays pending until Console reports the file gone", async () => {
  const fake = createFakeConsole({ linger: true });
  let now = new Date("2026-11-04T12:00:00.000Z");
  const store = createFileStore({ clock: () => now });
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  const storage = storageFor(fake, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), store);
  const memory = createMemoryCleaner({ account: { configured: false }, client: null });
  const service = createFileService({ store, storage, memory });
  const box = { store, storage, memory, service };
  const saved = await service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "a.txt", bytes: Buffer.from("a"),
  });
  service.deleteFile(ALICE, saved.id);
  await runFileWorker(box);
  const first = store.jobsFor(saved.id).find((job) => job.kind === "delete_blob");
  assert.equal(first.status, "failed");
  assert.match(first.lastError, /still in progress/);
  assert.equal(store.getFile(saved.id).status, "pending_delete");
  now = new Date(now.getTime() + 60_000);
  await runFileWorker(box);
  const second = store.jobsFor(saved.id).find((job) => job.kind === "delete_blob");
  assert.equal(second.status, "done");
  assert.equal(store.getFile(saved.id).status, "deleted");
});

test("an accepted upload is finished on retry instead of posted again", async () => {
  const fake = createFakeConsole({ statusFailures: 1, statusPlan: ["completed"] });
  const store = createFileStore();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  const storage = storageFor(fake, filesEnv({ CONSOLE_FOLDER_ID: "folder-1" }), store);
  const memory = createMemoryCleaner({ account: { configured: false } });
  const service = createFileService({ store, storage, memory });
  const id = "00000000-0000-4000-a000-00000000f111";
  await assert.rejects(
    () => service.upload({ id, actorUserId: ALICE, channelId: CHANNEL, name: "a.txt", bytes: Buffer.from("abc") }),
    (error) => error instanceof FileError && error.status === 502,
  );
  assert.equal(store.getFile(id).status, "uploading");
  assert.equal(store.getFile(id).consoleFileId, "file-1");
  await runFileWorker({ store, storage, memory });
  assert.equal(store.getFile(id).status, "active");
  const posts = fake.calls.filter((call) => call.method === "POST" && call.href.endsWith("/files"));
  assert.equal(posts.length, 1);
});
