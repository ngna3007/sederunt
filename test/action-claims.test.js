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


test("a tool claim hashes tenant, room, tool and canonical args once", async () => {
  const tenant = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const tool = { tenantId: tenant, roomId: "bot-1", toolName: "notes__create_note", args: { title: " Launch ", note: "Thursday" } };
  const same = { tenantId: tenant.toUpperCase(), roomId: " bot-1 ", toolName: " notes__create_note ", args: { note: "Thursday", title: "Launch" } };
  assert.equal(actionClaimKey(tool), actionClaimKey(same));
  assert.notEqual(actionClaimKey(tool), actionClaimKey({ ...tool, tenantId: other }));
  assert.notEqual(actionClaimKey(tool), actionClaimKey({ ...tool, roomId: "bot-2" }));
  assert.notEqual(actionClaimKey(tool), actionClaimKey({ ...tool, toolName: "notes__update_note" }));
  assert.notEqual(actionClaimKey(tool), actionClaimKey({ ...tool, args: { title: "Friday" } }));
  assert.notEqual(actionClaimKey(tool), actionClaimKey(scope));
  const store = createMemoryActionClaims();
  assert.equal(await store.claim(tool), true);
  assert.equal(await store.claim(same), false);
  assert.equal(await store.claim({ ...tool, tenantId: other }), true);
  const legacy = createMemoryActionClaims();
  assert.equal(await legacy.claim(scope), true);
  const both = { ...scope, toolName: "act", args: { text: "file the launch" } };
  assert.equal(await legacy.claim(both), false);
});

test("hosted claims read a legacy digest before inserting a tool digest", async () => {
  const both = { ...scope, toolName: "act", args: { text: "file the launch" } };
  const blocked = [];
  const taken = createActionClaims({ SUPABASE_URL: "https://example.test", SUPABASE_SECRET_KEY: "fixture" }, { fetchImpl: async (url, init) => {
    blocked.push({ method: init.method, url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (init.method === "GET") return new Response(JSON.stringify([{ claim_key: "present" }]), { status: 200 });
    return new Response("true", { status: 200 });
  } });
  assert.equal(await taken.claim(both), false);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].method, "GET");
  assert.match(blocked[0].url, new RegExp(actionClaimKey(scope)));
  assert.doesNotMatch(blocked[0].url, /private-room|private-source|create issue|file the launch/);
  const calls = [];
  const open = createActionClaims({ SUPABASE_URL: "https://example.test", SUPABASE_SECRET_KEY: "fixture" }, { fetchImpl: async (url, init) => {
    calls.push({ method: init.method, url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (init.method === "GET") return new Response("[]", { status: 200 });
    return new Response("true", { status: 200 });
  } });
  assert.equal(await open.claim(both), true);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].body.p_key, actionClaimKey(both));
  assert.notEqual(calls[1].body.p_key, actionClaimKey(scope));
  assert.doesNotMatch(JSON.stringify(calls[1].body), /private-room|private-source|create issue|file the launch/);
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
