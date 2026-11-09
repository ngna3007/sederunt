import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSupabaseFileStore } from "../src/files/supabase-store.js";
import { createSessionFiles } from "../src/files/session.js";

const env = { SUPABASE_URL: "https://database.example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key" };

test("durable Files map database failures to safe recoverable messages", async () => {
  assert.throws(() => createSupabaseFileStore(), /not configured/);
  for (const [code, status, expected] of [
    ["P0002", 404, "not_found"], ["42501", 403, "not_allowed"], ["23505", 409, "duplicate"],
    ["23514", 400, "invalid"], ["PT409", 409, "lease_lost"], ["unknown", 503, "files_unavailable"],
  ]) {
    const store = createSupabaseFileStore({ env, fetch: async () => new Response(JSON.stringify({ code, message: "secret=do-not-display" }), { status: 500 }) });
    await assert.rejects(() => store.claimJob(), (e) => e.status === status && e.code === expected && !e.message.includes("secret"));
  }
  for (const fetchImpl of [async () => { throw new Error("secret=do-not-display"); }, async () => new Response("bad-json", { status: 500 })]) {
    const store = createSupabaseFileStore({ env, fetch: fetchImpl });
    await assert.rejects(() => store.claimJob(), (e) => e.status === 503 && !e.message.includes("secret"));
  }
});

test("invalid file ids and unsafe unverified imports make no database request", async () => {
  const store = createSupabaseFileStore({ env, fetch: async () => { assert.fail("Unexpected database request"); } });
  await assert.rejects(() => store.channel("unsafe&id=neq.real"), (e) => e.status === 404);
  assert.equal(await store.importActive({ id: randomUUID() }), null);
  assert.equal(await store.channelByExternal("slack", "C1"), null);
  assert.equal(await store.userByExternal("slack", "U1"), null);
  await assert.rejects(() => store.ensureGuest(), (e) => e.code === "binding_required");
});

test("Console reconciliation refreshes after a minute and does not hide failures as an empty success", async () => {
  let time = 1000, calls = 0, fail = false;
  const imported = [];
  const session = createSessionFiles({ env: {}, store: { importActive: (row) => imported.push(row.id) }, clock: () => time,
    storage: { async listShared() { calls++; if (fail) throw new Error("Console unavailable"); return [{ id: String(calls) }]; } },
  });
  assert.equal(await session.restore(), 1);
  assert.equal(await session.restore(), 1);
  assert.equal(calls, 1);
  time += 60001;
  assert.equal(await session.restore(), 1);
  assert.deepEqual(imported, ["1", "2"]);
  time += 60001;
  fail = true;
  await assert.rejects(() => session.restore(), /Console unavailable/);
  fail = false;
  assert.equal(await session.restore(), 1);
  assert.equal(calls, 4);
});

test("a console checksum is stored as its original 64 hex characters", async () => {
  const hex = "ab".repeat(32);
  const calls = [];
  const store = createSupabaseFileStore({ env, fetch: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response("null");
  } });
  assert.equal(await store.importActive({ id: randomUUID(), sha256: hex.toUpperCase() }), null);
  assert.equal(calls[0].p_file.sha256, hex);
  assert.equal(calls[0].p_file.sha256.length, 64);
  assert.equal(await store.importActive({ id: randomUUID(), sha256: Buffer.from(hex, "hex") }), null);
  assert.equal(calls[1].p_file.sha256, hex);
  const quiet = createSupabaseFileStore({ env, fetch: async () => { throw new Error("unexpected database request"); } });
  assert.equal(await quiet.importActive({ id: randomUUID(), sha256: "not-a-checksum" }), null);
  assert.equal(await quiet.importActive({ id: randomUUID(), sha256: Buffer.alloc(16) }), null);
});

test("durable Files accepts the existing server-only Supabase key name", async () => {
  const store = createSupabaseFileStore({ env: { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SECRET_KEY: "fixture-alias" }, fetch: async (_, options) => {
    assert.equal(options.headers.apikey, "fixture-alias");
    return new Response("[]");
  } });
  assert.equal(await store.claimJob(), null);
});
