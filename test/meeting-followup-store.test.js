import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryFollowupStore, createSupabaseFollowupStore } from "../src/meeting/followup-store.js";

const record = { id: "a", tenantId: "tenant", meetingId: "meeting", kind: "action", status: "pending", data: {} };
test("memory store CAS refuses stale updates and returns independent copies", async () => {
  const store = createMemoryFollowupStore();
  const original = await store.put(record);
  original.data.changed = true;
  assert.deepEqual((await store.get("tenant", "a")).data, {});
  assert.equal(await store.get("other", "a"), null);
  assert.equal((await store.change(original, { status: "running" })).revision, 2);
  assert.equal(await store.change(original, { status: "done" }), null);
  assert.equal((await store.list("tenant", { kind: "action", statuses: ["running"], limit: 1 })).length, 1);
  assert.deepEqual(await store.list("other"), []);
  await assert.rejects(store.put({ ...record, kind: "unknown" }), /Invalid/);
  await assert.rejects(store.put({ ...record, data: { text: "x".repeat(524288) } }), /large/);
});

test("Supabase adapter sends scoped RPCs, handles CAS null and hides database failures", async () => {
  assert.equal(createSupabaseFollowupStore({}), null);
  const calls = [];
  const row = { id: "a", tenant_id: "tenant", meeting_id: "meeting", kind: "action", status: "pending", data: {}, revision: "1", updated_at: "now" };
  let response = row;
  let ok = true;
  const store = createSupabaseFollowupStore({ SUPABASE_URL: "https://db.example/", SUPABASE_SECRET_KEY: "secret" }, { fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok, json: async () => response }; } });
  assert.equal((await store.put(record)).revision, 1);
  assert.ok(calls[0].url.endsWith("rpc/meeting_followup_put"));
  assert.equal(JSON.parse(calls[0].options.body).p_tenant, "tenant");
  response = [row];
  assert.equal((await store.get("tenant", "a")).id, "a");
  assert.equal((await store.list("tenant", { kind: "action", statuses: ["pending"], limit: 1000 })).length, 1);
  assert.ok(calls.at(-1).url.includes("limit=100"));
  response = [];
  assert.equal(await store.get("tenant", "absent"), null);
  response = { id: null };
  assert.equal(await store.change({ ...record, revision: 1 }, { status: "done" }), null);
  response = null;
  assert.equal(await store.change({ ...record, revision: 1 }), null);
  ok = false;
  await assert.rejects(store.get("tenant", "a"), { message: "Follow-up persistence is unavailable." });
});
