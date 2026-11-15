import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createSupabaseFileStore } from "../src/files/supabase-store.js";

const env = { SUPABASE_URL: "https://database.example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key" };
const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const CHANNEL = "33333333-3333-4333-8333-333333333333";
const FILE = "44444444-4444-4444-8444-444444444444";

function viewState() {
  return {
    profile: "Mina",
    memberships: [{ tenantId: TENANT, role: "owner" }],
    channels: [{ id: CHANNEL, tenantId: TENANT, visibility: "tenant" }],
    channelMembers: [],
    files: [
      { id: FILE, channelId: CHANNEL, status: "active", ownerUserId: USER, created_at: "2026-11-01T00:00:00.000Z" },
      { id: randomUUID(), channelId: CHANNEL, status: "uploading", ownerUserId: USER },
      { id: randomUUID(), channelId: CHANNEL, status: "pending_delete", ownerUserId: USER },
    ],
    requests: [{
      id: randomUUID(),
      status: "open",
      tenantId: TENANT,
      createdAt: "2026-10-01T00:00:00.000Z",
    }],
  };
}

function json(data, status = 200) {
  if (status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function fakeRest() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    const path = href.split("/rest/v1/")[1] || "";
    const table = path.split("?")[0];
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ href, path, table, method: init.method || "GET", body });
    if (table.startsWith("rpc/files_runtime_view")) return json(viewState());
    if (table.startsWith("rpc/files_runtime_claim")) return json([{ id: "job-1", claim_token: "tok" }]);
    if (table.startsWith("rpc/slack_channel_bind")) return json(CHANNEL);
    if (table.startsWith("rpc/")) return json({ id: FILE, ok: true });
    if (init.method === "POST" && path.includes("on_conflict")) return json([{ id: CHANNEL, tenant_id: TENANT }], 201);
    if (init.method === "PATCH") return json(null, 204);
    if (table === "channels") {
      if (path.includes(CHANNEL)) return json([{ id: CHANNEL, tenant_id: TENANT, visibility: "tenant" }]);
      return json([{ id: CHANNEL, tenant_id: TENANT, visibility: "tenant" }]);
    }
    if (table === "file_upload_staging") return json([{ bytes: "\\x00ff" }]);
    if (table === "file_jobs" && path.includes("status=eq.dead")) return json([{ file_id: FILE }]);
    if (table === "console_tenant_folders") return json([{ tenant_id: TENANT, console_space_id: "space-1", console_folder_id: "folder-1" }]);
    if (table === "identities") return json([{ user_id: USER, linked_at: "2026-11-01T00:00:00.000Z" }]);
    if (table === "channel_bindings") return json([{ channel_id: CHANNEL }]);
    if (table === "files" || table === "file_memory_links" || table === "file_jobs" || table === "console_folders" || table === "console_folder_credentials") {
      return json([{ id: FILE }]);
    }
    return json([]);
  };
  return { calls, fetchImpl };
}

test("the durable file store snapshots membership and lists visible files", async () => {
  const remote = fakeRest();
  const store = createSupabaseFileStore({ env, fetch: remote.fetchImpl, clock: () => new Date("2026-11-11T00:00:00.000Z") });
  assert.equal(store.durable, true);
  const snap = await store.snapshot(USER);
  assert.equal(snap.viewerName(), "Mina");
  assert.equal(snap.isAdmin(USER, TENANT), true);
  assert.equal(snap.isWorkspaceAdmin(), true);
  assert.equal(snap.canSeeChannel(USER, CHANNEL), true);
  assert.equal(snap.getFile(FILE)?.id, FILE);
  assert.equal(snap.listVisible().some((row) => row.id === FILE), true);
  assert.equal(snap.listOwnInFlight().length, 1);
  assert.equal(snap.channel(CHANNEL)?.id, CHANNEL);

  assert.equal(await store.canSeeChannel(USER, CHANNEL), true);
  assert.equal(await store.viewerName(USER), "Mina");
  assert.equal(await store.isAdmin(USER, TENANT), true);
  assert.equal(await store.isWorkspaceAdmin(USER), true);
  assert.equal((await store.listVisible(USER)).some((row) => row.id === FILE), true);
  assert.equal((await store.listOwnInFlight(USER)).length, 1);
  assert.equal((await store.getVisible(USER, FILE))?.id, FILE);
  assert.equal((await store.listUnanswered(USER)).length, 1);
  assert.equal((await store.listRequests(USER)).length, 1);

  const existing = await store.addChannel({ id: CHANNEL, tenantId: TENANT });
  assert.equal(existing.id, CHANNEL);
  const member = await store.addMember({ userId: USER, tenantId: TENANT, name: "Mina" });
  assert.equal(member.userId, USER);
  store.removeMember();

  await store.stageUpload({ ownerUserId: USER, sha256: Buffer.alloc(32, 1) }, Buffer.from("hi"));
  assert.ok(Buffer.isBuffer(await store.peekUpload(FILE)));
  await store.deleteFile(USER, FILE, "done");
  await store.requestDelete(USER, FILE, "please");
  await store.answerDelete(USER, FILE, true);
  await store.dismissDelete(USER, FILE);
  await store.discardFailed(USER, FILE);
  await store.addLink({ fileId: FILE, memoryBlobId: "blob" });
  await store.linksFor(FILE);
  await store.failStuckUploads();
  assert.equal((await store.claimJob())?.id, "job-1");
  await store.finishJob("job-1", "tok");
  await store.skipJob("job-1", "skip", "tok");
  await store.failJob("job-1", "secret=do-not-keep", 1000, "tok");
  await store.renewJob({ id: "job-1", claimToken: "tok" });
  await store.workerMutation({ id: "job-1", claimToken: "tok" }, "seal", {});
  await store.jobsFor(FILE);
  await store.allJobs();
  await store.findConsoleFolder("space", "Inbox");
  await store.saveConsoleFolder({ spaceId: "space", name: "Inbox" });
  await store.saveConsoleCredential({ folderId: "folder-1", id: randomUUID() });
  await store.findConsoleCredential(randomUUID());
  await store.saveConsoleTenant({ tenantId: TENANT, spaceId: "space-1", folderId: "folder-1" });
  const mapped = await store.findConsoleTenant(TENANT);
  assert.equal(mapped.spaceId, "space-1");
  assert.equal(mapped.folderId, "folder-1");
  await store.findConsoleTenantByFolder("folder-1");
  await store.markExternalMessageDeleted("123", { externalWorkspaceId: "T1", externalChannelId: "C1" });
  assert.equal(await store.channelByExternal("slack", "C1"), null);
  await store.channelByExternal("slack", "C1", { externalWorkspaceId: "T1" });
  await store.bindSlackChannel({ tenantId: TENANT, teamId: "T1", externalChannelId: "C1", channelId: CHANNEL });
  await store.userByExternal("slack", "U1", { externalWorkspaceId: "T1", tenantId: TENANT });
  await store.userByExternal("slack", "U1", {});
  await assert.rejects(() => store.ensureGuest(), (e) => e.code === "binding_required");
});
