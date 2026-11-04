import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCleaner } from "../src/files/memory.js";
import { createFileService } from "../src/files/service.js";
import { backoffDelayMs, createFileStore } from "../src/files/store.js";
import { createMemoryWalrus } from "../src/files/walrus.js";
import { runFileWorker } from "../src/files/worker.js";

const TENANT = "00000000-0000-4000-a000-00000000acme";
const CHANNEL = "00000000-0000-4000-a000-00000000c001";
const ALICE = "00000000-0000-4000-a000-00000000a11c";

function runtime(extra = {}) {
  let now = new Date("2026-11-04T12:00:00.000Z");
  const store = createFileStore({ clock: () => now });
  const storage = extra.storage || createMemoryWalrus();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL] });
  const memory = extra.memory || createMemoryCleaner({ account: { configured: false }, client: null });
  const service = createFileService({ store, storage, memory, serverSecret: "test-secret" });
  return {
    env: {},
    store,
    storage,
    memory,
    service,
    setNow(date) { now = date; },
    now() { return now; },
  };
}

test("backoff starts at one minute, doubles, and stops at six hours", () => {
  assert.equal(backoffDelayMs(1), 60 * 1000);
  assert.equal(backoffDelayMs(2), 2 * 60 * 1000);
  assert.equal(backoffDelayMs(10), 6 * 60 * 60 * 1000);
});

test("a delete retries until the twelfth failure, then the job is dead", async () => {
  const box = runtime({
    storage: {
      async writeBlob() { return { blobId: "b", objectId: "0x1", endEpoch: 4 }; },
      async deleteBlob() { throw new Error("rpc down"); },
      async currentEpoch() { return 1; },
    },
  });
  const saved = await box.service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "a.txt", bytes: Buffer.from("a"),
  });
  box.service.deleteFile(ALICE, saved.id);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await runFileWorker(box, { renew: false });
    box.setNow(new Date(box.now().getTime() + 6 * 60 * 60 * 1000 + 1000));
  }
  const job = box.store.jobsFor(saved.id).find((item) => item.kind === "delete_blob");
  assert.equal(job.status, "dead");
  assert.equal(job.attempts, 12);
  assert.equal(box.store.getFile(saved.id).status, "pending_delete");
});

test("memory cleanup records a skipped namespace when no account is configured", async () => {
  const box = runtime();
  const saved = await box.service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "a.txt", bytes: Buffer.from("a"),
  });
  box.service.deleteFile(ALICE, saved.id);
  await runFileWorker(box, { renew: false });
  const memoryJob = box.store.jobsFor(saved.id).find((item) => item.kind === "delete_memory");
  const blobJob = box.store.jobsFor(saved.id).find((item) => item.kind === "delete_blob");
  assert.equal(memoryJob.status, "skipped");
  assert.match(memoryJob.lastError, /not forgotten/);
  assert.equal(blobJob.status, "done");
  assert.equal(box.store.getFile(saved.id).status, "deleted");
  const links = box.store.linksFor(saved.id);
  assert.equal(links.length, 1);
  assert.equal(links[0].status, "skipped");
  assert.match(links[0].namespace, /^sederunt-file-/);
});

test("a configured memory client forgets the namespace and marks the link deleted", async () => {
  const calls = [];
  const memory = createMemoryCleaner({
    account: { configured: true },
    client: {
      async forgetNamespace(input) { calls.push(input.namespace); return { deleted: 1 }; },
      async securityDelete(input) { calls.push(input.blobIds.join(",")); return { deleted: 1 }; },
    },
  });
  const box = runtime({ memory });
  const saved = await box.service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "a.txt", bytes: Buffer.from("a"),
  });
  box.store.addLink({ fileId: saved.id, memoryBlobId: "mem-1", memoryObjectId: "0xmem", namespace: `sederunt-file-${saved.id}` });
  box.service.deleteFile(ALICE, saved.id);
  await runFileWorker(box, { renew: false });
  assert.deepEqual(calls, [`sederunt-file-${saved.id}`, "mem-1"]);
  assert.equal(box.store.linksFor(saved.id)[0].status, "deleted");
  const memoryJob = box.store.jobsFor(saved.id).find((item) => item.kind === "delete_memory");
  assert.equal(memoryJob.status, "done");
});

test("an upload that is still missing its bytes after an hour is failed, and a near expiry is renewed", async () => {
  const box = runtime();
  const row = box.store.insertUploading({
    tenantId: TENANT,
    channelId: CHANNEL,
    ownerUserId: ALICE,
    name: "stuck.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    sha256: Buffer.alloc(32),
  });
  box.store.patchFile(row.id, { createdAt: new Date("2026-11-04T10:00:00.000Z") });
  const active = await box.service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "live.txt", bytes: Buffer.from("live"),
  });
  box.store.setEndEpoch(active.id, box.storage.currentEpochValue);
  await runFileWorker(box, { renew: true });
  assert.equal(box.store.getFile(row.id).status, "failed");
  assert.ok(box.store.getFile(active.id).endEpoch > box.storage.currentEpochValue);
});
