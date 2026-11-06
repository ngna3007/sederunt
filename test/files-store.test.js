import assert from "node:assert/strict";
import test from "node:test";
import { createFileService } from "../src/files/service.js";
import { createFileStore } from "../src/files/store.js";
import { createMemoryConsole } from "../src/files/memory-console.js";

const TENANT = "00000000-0000-4000-a000-00000000acme";
const OTHER = "00000000-0000-4000-a000-00000000beef";
const CHANNEL = "00000000-0000-4000-a000-00000000c001";
const INVITED = "00000000-0000-4000-a000-00000000c002";
const ALICE = "00000000-0000-4000-a000-00000000a11c";
const BOB = "00000000-0000-4000-a000-000000000b0b";
const ADMIN = "00000000-0000-4000-a000-00000000ad11";

function world() {
  let now = new Date("2026-11-04T12:00:00.000Z");
  const store = createFileStore({ clock: () => now });
  const storage = createMemoryConsole();
  store.addChannel({ id: CHANNEL, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addChannel({ id: INVITED, tenantId: TENANT, name: "Launch", visibility: "invited" });
  store.addChannel({ id: "secret", tenantId: OTHER, name: "Secret", visibility: "tenant" });
  store.addMember({ userId: ALICE, name: "Alice", tenantId: TENANT, role: "member", channelIds: [CHANNEL, INVITED] });
  store.addMember({ userId: BOB, name: "Bob", tenantId: TENANT, role: "member", channelIds: [CHANNEL, INVITED] });
  store.addMember({ userId: ADMIN, name: "Admin", tenantId: TENANT, role: "admin", channelIds: [CHANNEL] });
  store.addMember({ userId: "outsider", name: "Out", tenantId: OTHER, role: "member", channelIds: ["secret"] });
  const service = createFileService({ store, storage, serverSecret: "test-secret" });
  return {
    store,
    storage,
    service,
    setNow(date) { now = date; },
  };
}

test("a member uploads and downloads, and someone outside the channel gets 404", async () => {
  const { service } = world();
  const saved = await service.upload({
    actorUserId: ALICE,
    channelId: CHANNEL,
    name: "notes.txt",
    mimeType: "text/plain",
    bytes: Buffer.from("hello walrus"),
  });
  assert.equal(saved.status, "active");
  assert.ok(saved.consoleFileId);
  assert.equal(saved.consoleFolderId, "folder-demo");
  const downloaded = await service.download(BOB, saved.id);
  assert.equal(Buffer.from(downloaded.bytes).toString(), "hello walrus");
  await assert.rejects(() => service.download("outsider", saved.id), (error) => error.status === 404);
  await assert.rejects(() => service.upload({
    actorUserId: "outsider",
    channelId: CHANNEL,
    name: "nope.txt",
    bytes: Buffer.from("x"),
  }), (error) => error.status === 404);
});

test("the owner deletes, an admin moderates, and a member cannot", async () => {
  const { service, store } = world();
  const owned = await service.upload({
    actorUserId: ALICE, channelId: INVITED, name: "plan.pdf", bytes: Buffer.from("plan"),
  });
  const shared = await service.upload({
    actorUserId: BOB, channelId: CHANNEL, name: "bob.txt", bytes: Buffer.from("bob"),
  });
  assert.throws(() => service.deleteFile(BOB, owned.id), (error) => error.status === 403);
  const memberView = service.list(BOB).files.find((file) => file.id === owned.id);
  assert.equal(memberView.canRequest, true);
  assert.equal(memberView.canDelete, false);
  const adminView = service.list(ADMIN).files.find((file) => file.id === shared.id);
  assert.equal(adminView.canDelete, true);
  assert.equal(adminView.canRequest, false);
  const byOwner = service.deleteFile(ALICE, owned.id);
  assert.equal(byOwner.status, "pending_delete");
  assert.equal(byOwner.deleteReason, "owner");
  assert.equal(store.listVisible(BOB).some((file) => file.id === owned.id), false);
  assert.equal(store.listVisible(ALICE).some((file) => file.id === owned.id && file.status === "pending_delete"), true);
  const byAdmin = service.deleteFile(ADMIN, shared.id);
  assert.equal(byAdmin.deleteReason, "moderation");
  const kinds = store.jobsFor(shared.id).map((job) => job.kind).sort();
  assert.deepEqual(kinds.filter((kind) => kind !== "upload"), ["delete_blob", "delete_memory"]);
});

test("a member can ask, the owner can approve, and a 72 hour request is visible to an admin", async () => {
  const { service, store, setNow } = world();
  const file = await service.upload({
    actorUserId: ALICE, channelId: INVITED, name: "q4.pdf", bytes: Buffer.from("q4"),
  });
  const recent = service.requestDelete(BOB, file.id, "wrong quarter");
  assert.equal(recent.status, "open");
  assert.throws(() => service.requestDelete(BOB, file.id, "again"), (error) => error.status === 409);
  const oldFile = await service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "old.pdf", bytes: Buffer.from("old"),
  });
  const old = service.requestDelete(BOB, oldFile.id, "please");
  store.patchRequest(old.id, { createdAt: new Date("2026-11-01T00:00:00.000Z") });
  setNow(new Date("2026-11-04T12:00:00.000Z"));
  const unanswered = service.list(ADMIN).unanswered.map((request) => request.id);
  assert.equal(unanswered.includes(old.id), true);
  assert.equal(unanswered.includes(recent.id), false);
  assert.equal(service.list(BOB).unanswered.length, 0);
  const answered = service.answerDelete(ALICE, recent.id, true);
  assert.equal(answered.request.status, "approved");
  assert.equal(answered.file.status, "pending_delete");
  assert.equal(answered.file.deleteReason, "request_approved");
  assert.equal(store.listVisible(BOB).some((item) => item.id === file.id), false);
  service.dismissDelete(ADMIN, old.id);
  assert.equal(service.list(ADMIN).unanswered.some((request) => request.id === old.id), false);
});

test("leaving an invited channel hides the file, and a guest owner becomes the user on merge", async () => {
  const { service, store } = world();
  const file = await service.upload({
    actorUserId: ALICE, channelId: INVITED, name: "invite.txt", bytes: Buffer.from("inv"),
  });
  assert.equal(store.listVisible(BOB).some((item) => item.id === file.id), true);
  store.leaveChannel(BOB, INVITED);
  assert.equal(store.getVisible(BOB, file.id), null);
  const guest = store.ensureGuest({ tenantId: TENANT, externalUserId: "U1", name: "Guest" });
  const guestFile = await service.upload({
    trusted: true,
    ownerGuestId: guest.id,
    channelId: CHANNEL,
    name: "from-slack.txt",
    bytes: Buffer.from("slack"),
  });
  assert.equal(guestFile.ownerGuestId, guest.id);
  store.mergeGuest(guest.id, BOB);
  assert.equal(store.getFile(guestFile.id).ownerUserId, BOB);
  assert.equal(store.getFile(guestFile.id).ownerGuestId, null);
});

test("ten open requests in a day are the limit", async () => {
  const { service } = world();
  for (let i = 0; i < 10; i += 1) {
    const file = await service.upload({
      actorUserId: ALICE, channelId: CHANNEL, name: `f${i}.txt`, bytes: Buffer.from(String(i)),
    });
    service.requestDelete(BOB, file.id, "please");
  }
  const extra = await service.upload({
    actorUserId: ALICE, channelId: CHANNEL, name: "extra.txt", bytes: Buffer.from("x"),
  });
  assert.throws(() => service.requestDelete(BOB, extra.id, "more"), (error) => error.status === 429);
});
