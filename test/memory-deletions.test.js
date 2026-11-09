import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLocalDeletionStore, deletionTargets, deletionMatches, filterDeletedDecisions, withDeletionOverlay, createDeletionStore } from "../src/memory/deletions.js";
import { drainDeletions } from "../src/memory/deletion-worker.js";
const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenant = "22222222-2222-4222-8222-222222222222";
const scope = { tenantId, roomId: "private-room-name", sourceIds: ["private-source-name"] };
async function fixture(t) {
  const root = resolve(".local/tmp"); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(resolve(root, "deletion-test-"));
  const file = resolve(dir, "state.sqlite"); const stores = [];
  const open = async () => { const store = await createLocalDeletionStore(file); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) store.close(); await rm(dir, { recursive: true, force: true }); });
  return { store: await open(), open, file };
}
function decision(id, extra = {}) { return { id, roomId: scope.roomId, sourceDeliveryId: scope.sourceIds[0], text: "private sentence", ...extra }; }

test("deletion scope validates identifiers and hashes each namespace without plaintext", () => {
  const [intent] = deletionTargets(scope);
  assert.equal(JSON.stringify(intent).includes("private"), false);
  assert.equal(deletionTargets({ ...scope, sourceIds: ["same", "same"] }).length, 1);
  assert.equal(deletionMatches(intent, scope), true);
  for (const changed of [{ tenantId: otherTenant }, { roomId: "other" }, { sourceIds: [] }, { sourceIds: ["other"] }]) assert.equal(deletionMatches(intent, { ...scope, ...changed }), false);
  const [byDecision] = deletionTargets({ ...scope, sourceIds: [], decisionIds: ["d"] });
  assert.equal(deletionMatches(byDecision, { ...scope, decisionIds: ["d"] }), true);
  assert.equal(deletionMatches(byDecision, { ...scope, sourceIds: ["d"] }), false);
  for (const changed of [{ tenantId: "bad" }, { roomId: "" }, { sourceIds: null }, { decisionIds: null }, { sourceIds: [] }, { sourceIds: [null] }, { sourceIds: [" "] }, { sourceIds: ["x".repeat(2049)] }, { sourceIds: Array(101).fill("a") }]) assert.throws(() => deletionTargets({ ...scope, ...changed }));
});

test("persisted source intent hides every matching record and late replay across readers and restarts", async (t) => {
  const { store, open, file } = await fixture(t);
  const first = await store.request(scope);
  assert.deepEqual(await store.request(scope), first);
  const observer = await open();
  const rows = [decision("a"), decision("b"), decision("else", { roomId: "other" }), decision("gone", { deleted: true }), decision("null", { sourceDeliveryId: undefined })];
  assert.deepEqual((await filterDeletedDecisions(observer, tenantId, rows)).map((r) => r.id), ["else", "null"]);
  assert.equal((await filterDeletedDecisions(observer, otherTenant, rows)).length, 4);
  const memory = { index: async () => rows.map((r) => ({ decision: r })), recall: async () => [{ preference: {} }, { decision: decision("late") }] };
  const overlay = withDeletionOverlay(memory, observer, tenantId);
  assert.equal((await overlay.index()).length, 2);
  assert.deepEqual(await overlay.recall(), [{ preference: {} }]);
  const claimed = await observer.claim({ limit: 1 });
  assert.equal(await observer.complete(claimed[0]), true);
  assert.equal((await filterDeletedDecisions(store, tenantId, [decision("late-after-done")])).length, 0);
  assert.equal((await store.request(scope))[0].state, "done");
  const bytes = await readFile(file); assert.equal(bytes.includes(Buffer.from("private")), false);
  await assert.rejects(store.list("invalid"));
  await assert.rejects(store.claim({ limit: 0 })); await assert.rejects(store.claim({ leaseSeconds: 301 }));
});

test("provider failure keeps deletion active and retry writes all matching records with lease fencing", async (t) => {
  const { store } = await fixture(t);
  await store.request(scope);
  const records = [decision("a"), decision("b"), decision("unrelated", { roomId: "else" })];
  const result = await drainDeletions({ store, resolveDecisions: async () => records, writeTombstone: async () => null });
  assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1, lostLease: 0 });
  assert.equal((await filterDeletedDecisions(store, tenantId, records)).length, 1);
  assert.equal((await store.claim()).length, 0);
  const [intent] = await store.list(tenantId);
  assert.equal(await store.complete(intent), false);
  assert.equal(await store.fail({ id: "missing" }), false);
  const secondScope = { ...scope, sourceIds: [], decisionIds: ["a", "b"] };
  await store.request(secondScope);
  const writes = [];
  const retry = await drainDeletions({ store, resolveDecisions: async () => records, writeTombstone: async ({ decision: row }) => { writes.push(row.id); return { blobId: null }; } });
  assert.equal(retry.completed, 2); assert.deepEqual(writes.sort(), ["a", "b"]);
  const noRows = await drainDeletions({ store, resolveDecisions: async () => [], writeTombstone: async () => assert.fail() });
  assert.equal(noRows.claimed, 0);
});

test("worker rejects unresolved provider results and reports lost leases without logging provider content", async () => {
  const [intent] = deletionTargets(scope);
  let fail = true;
  const store = { claim: async () => [intent], complete: async () => false, fail: async () => fail };
  assert.equal((await drainDeletions({ store, resolveDecisions: async () => null })).failed, 1);
  fail = false;
  assert.equal((await drainDeletions({ store, resolveDecisions: async () => { throw new Error("private text"); } })).lostLease, 1);
  assert.equal((await drainDeletions({ store, resolveDecisions: async () => [] })).lostLease, 1);
});

test("database adapter fails closed and sends only hashed deletion keys", async () => {
  assert.equal(createDeletionStore({}), null);
  const calls = [];
  const store = createDeletionStore({ SUPABASE_URL: "https://fixture.invalid/", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, { fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const target = deletionTargets(scope)[0];
    return { ok: true, json: async () => url.endsWith("finish") ? true : [{ id: "id", tenant_id: tenantId, room_key: target.roomKey, target_kind: target.targetKind, target_key: target.targetKey, state: "pending", attempts: 0 }] };
  } });
  const [intent] = await store.request(scope); await store.list(tenantId); await store.claim(); await store.claim({ limit: 1, leaseSeconds: 2 });
  assert.equal(await store.complete(intent), true); assert.equal(await store.fail(intent), true);
  assert.equal(JSON.stringify(calls).includes("private"), false);
  await assert.rejects(store.list("bad"));
  const failed = createDeletionStore({ SUPABASE_URL: "https://fixture.invalid", SUPABASE_SECRET_KEY: "fixture" }, { fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(failed.list(tenantId), /unavailable/);
  await assert.rejects(withDeletionOverlay({ recall: async () => [{ decision: decision("a") }] }, failed, tenantId).recall(), /unavailable/);
});


test("local competing instances fence expired leases and roll back partial requests", async (t) => {
  const { store, open, file } = await fixture(t);
  const observer = await open();
  await store.request(scope);
  const [old] = await store.claim();
  assert.deepEqual(await observer.claim(), []);
  const db = new DatabaseSync(file);
  t.after(() => db.close());
  db.exec("UPDATE deletions SET row=json_set(row,'$.leaseUntil',0)");
  assert.equal(await store.complete(old), false);
  const [fresh] = await observer.claim();
  assert.notEqual(fresh.leaseToken, old.leaseToken);
  assert.equal(await store.complete(old), false);
  assert.equal(await observer.complete(fresh), true);
  const target = deletionTargets({ ...scope, decisionIds: ["reject"], sourceIds: [] })[0].targetKey;
  db.exec(`CREATE TRIGGER reject_target BEFORE INSERT ON deletions WHEN json_extract(new.row,'$.targetKey')='${target}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END`);
  await assert.rejects(store.request({ ...scope, sourceIds: [], decisionIds: ["partial", "reject"] }), /fixture failure/);
  assert.equal((await store.list(tenantId)).length, 1);
  db.exec("DROP TRIGGER reject_target");
});

test("source cleanup processes every matching decision rather than only its first record", async (t) => {
  const { store } = await fixture(t);
  await store.request(scope);
  const writes = [];
  const result = await drainDeletions({ store, resolveDecisions: async () => [decision("a"), decision("b"), decision("c")], writeTombstone: async ({ decision }) => { writes.push(decision.id); return {}; } });
  assert.equal(result.completed, 1);
  assert.deepEqual(writes, ["a", "b", "c"]);
});
