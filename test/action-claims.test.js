import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { actionClaimKey, createActionClaims, createLocalActionClaims, createMemoryActionClaims } from "../src/domain/action-claims.js";

const scope = { tenantId: "11111111-1111-4111-8111-111111111111", roomId: "private-room", sourceId: "private-source", action: "create issue" };

test("action claims bind room, source and action and cannot be taken twice", async () => {
  const store = createMemoryActionClaims();
  assert.match(actionClaimKey(scope), /^[0-9a-f]{64}$/);
  assert.notEqual(actionClaimKey(scope), actionClaimKey({ ...scope, roomId: "other" }));
  assert.notEqual(actionClaimKey(scope), actionClaimKey({ ...scope, sourceId: "other" }));
  assert.notEqual(actionClaimKey(scope), actionClaimKey({ ...scope, action: "other" }));
  assert.deepEqual(await Promise.all([store.claim(scope), store.claim(scope)]), [true, false]);
  assert.equal(await store.claim({ ...scope, tenantId: "22222222-2222-4222-8222-222222222222" }), true);
  for (const field of ["tenantId", "roomId", "sourceId", "action"]) assert.throws(() => actionClaimKey({ ...scope, [field]: "" }));
});

test("hosted claims fail closed and send only hashed source information", async () => {
  assert.equal(createActionClaims({}), null);
  let body;
  const store = createActionClaims({ SUPABASE_URL: "https://example.test", SUPABASE_SECRET_KEY: "fixture" }, { fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body); return new Response("true", { status: 200 });
  } });
  assert.equal(await store.claim(scope), true);
  assert.equal(body.p_tenant, scope.tenantId);
  assert.equal(body.p_key, actionClaimKey(scope));
  assert.doesNotMatch(JSON.stringify(body), /private-room|private-source|create issue/);
  const bad = createActionClaims({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, { fetchImpl: async () => new Response("null", { status: 200 }) });
  await assert.rejects(() => bad.claim(scope), /invalid response/);
  const down = createActionClaims({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, { fetchImpl: async () => new Response("", { status: 503 }) });
  await assert.rejects(() => down.claim(scope), /unavailable/);
});


test("local claims survive separate processes and reopening", async (t) => {
  const root = resolve(".local/tmp");
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "action-claims-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "claims.sqlite");
  const first = await createLocalActionClaims(file);
  const second = await createLocalActionClaims(file);
  assert.deepEqual(await Promise.all([first.claim(scope), second.claim(scope)]), [true, false]);
  first.close(); second.close();
  const reopened = await createLocalActionClaims(file);
  assert.equal(await reopened.claim(scope), false);
  reopened.close();
});
