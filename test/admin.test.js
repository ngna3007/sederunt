import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createApp } from "../src/server.js";
import { createAskStore } from "../src/ask/store.js";
import { adminConfigured, adminCookie, adminSameOrigin, adminSession, hashAdminPassword, newAdminSession, openAdminToken, sealAdminToken, verifyAdminPassword } from "../src/admin-auth.js";
import { handleUtterance } from "../src/typed-path.js";
import { createSessionFiles } from "../src/files/session.js";
import { createFileStore } from "../src/files/store.js";
import { createAdminStore } from "../src/admin-store.js";

const userId = "11111111-1111-4111-a111-111111111111";
const env = {
  SEDERUNT_ADMIN_USERNAME: "fixture-admin",
  SEDERUNT_ADMIN_PASSWORD_HASH: await hashAdminPassword("fixture-password"),
  SEDERUNT_ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
};

test("admin sessions reject wrong passwords, forged cookies, expired tokens and console cookies", async () => {
  assert.equal(adminConfigured({}), false);
  assert.equal(await verifyAdminPassword("fixture-admin", "fixture-password", env), true);
  assert.equal(await verifyAdminPassword("other", "fixture-password", env), false);
  assert.equal(await verifyAdminPassword("fixture-admin", "wrong", env), false);
  assert.equal(await verifyAdminPassword("fixture-admin", "a".repeat(257), env), false);
  assert.equal(await verifyAdminPassword("fixture-admin", "fixture-password", {}), false);
  const session = newAdminSession(env);
  const token = sealAdminToken(session, env);
  assert.deepEqual(openAdminToken(token, env), session);
  assert.equal(openAdminToken(`${token}x`, env), null);
  assert.equal(openAdminToken(`${token}.extra`, env), null);
  assert.equal(openAdminToken(`${token.split(".")[0]}.${"é".repeat(43)}`, env), null);
  assert.equal(openAdminToken("bad", env), null);
  assert.equal(openAdminToken(token, env, session.exp + 1), null);
  assert.equal(openAdminToken(token, {}), null);
  assert.equal(openAdminToken(sealAdminToken({ exp: "tomorrow" }, env), env), null);
  assert.equal(adminSession({ headers: { cookie: `sederunt_console=${token}` } }, env), null);
  assert.equal(adminSession({ headers: { cookie: `sederunt_admin=${sealAdminToken({ ...session, kind: "oauth" }, env)}` } }, env), null);
  assert.equal(adminSession({ headers: { cookie: `sederunt_admin=${token}` } }, env).username, "fixture-admin");
  assert.match(adminCookie(token, { headers: { "x-forwarded-proto": "https" } }), /HttpOnly; SameSite=Strict.*Secure/);
  assert.match(adminCookie("", { headers: {} }, true), /Max-Age=0/);
  assert.equal(adminSameOrigin({ headers: { host: "localhost:8787", origin: "http://localhost:8787" } }), true);
  for (const headers of [{ host: "app.test" }, { host: "app.test", origin: "https://evil.test" }, { host: "app.test", origin: "https://app.test" }, { host: "app.test", origin: "http://app.test", "sec-fetch-site": "cross-site" }]) assert.equal(adminSameOrigin({ headers }), false);
});

test("admin writes enter handleUtterance and require an explicit allow", async () => {
  let calls = 0;
  const deps = { admin: { commit: async () => { calls++; return "done"; } } };
  assert.equal((await handleUtterance({ door: "admin", action: "restart-demo" }, deps)).allow, "ask");
  assert.equal((await handleUtterance({ door: "admin", action: "unknown", allow: true }, deps)).allow, "ask");
  assert.equal(calls, 0);
  assert.equal((await handleUtterance({ door: "admin", action: "restart-demo", allow: true }, deps)).result, "done");
  assert.equal(calls, 1);
});

test("quota reset keeps another user unchanged and a late refund cannot spend the new allowance", async () => {
  const store = createAskStore({});
  const old = await store.claim(userId, 5);
  await store.claim("other", 5);
  const id = await store.create(userId, "old question");
  await store.append(id, "old answer");
  await store.resetQuota(userId);
  await store.claim(userId, 5);
  await store.refund(userId, old.quotaKey);
  assert.equal((await store.quota(userId, 5)).used, 1);
  assert.equal((await store.quota("other", 5)).used, 1);
  await store.resetHistory(userId);
  await store.append(id, "late answer");
  await store.finish(id, { status: "done" });
  assert.deepEqual(await store.list(userId), []);
  assert.deepEqual(await store.chunks(id), []);
  assert.equal(await store.meta(id), null);
});

test("admin backend keeps service credentials server-side, accepts empty RPC responses and fails closed on lookup errors", async () => {
  const calls = [];
  const responses = [];
  const store = createAdminStore({ SUPABASE_URL: "https://db.example.test/", SUPABASE_SECRET_KEY: "server-fixture" }, { fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return responses.shift();
  } });
  assert.equal(createAdminStore({}), null);
  responses.push(new Response("[]"));
  assert.deepEqual(await store.accounts("demo", 25), []);
  assert.equal(calls[0].init.headers.authorization, "Bearer server-fixture");
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_query: "demo", p_offset: 25 });
  responses.push(new Response(null, { status: 204 }));
  assert.equal(await store.issuePreview("nonce"), null);
  responses.push(new Response("{}", { status: 409 }));
  await assert.rejects(store.restart(userId, {}, "operator"), { status: 409 });
  responses.push(new Response("sensitive upstream details", { status: 403 }));
  await assert.rejects(store.plan(userId), (error) => error.status === 503 && !error.message.includes("sensitive"));
  responses.push(new Response("[]"));
  assert.equal(await store.tenantRetired(userId), true);
  assert.match(calls.at(-1).url, /\/rest\/v1\/tenants\?select=id&id=eq\./);
  responses.push(new Response(JSON.stringify([{ id: userId }])));
  assert.equal(await store.tenantRetired(userId), false);
  responses.push(new Response("{}"));
  await assert.rejects(store.tenantRetired(userId));
  responses.push(new Response("", { status: 503 }));
  await assert.rejects(store.tenantRetired(userId));
});

test("an account reset is immediately respected by file membership checks", async () => {
  let activeId = "old-space";
  const store = createFileStore();
  const files = createSessionFiles({ env: {}, identity: {}, store,
    guard: () => ({ required: true, session: { kind: "oauth", provider: "google", userId } }),
    spaceView: async () => ({ activeId, activeName: activeId, activeRole: "owner" }),
  });
  assert.equal((await files.viewer({})).tenantId, "old-space");
  activeId = "fresh-space";
  assert.equal((await files.viewer({})).tenantId, "fresh-space");
});

test("admin HTTP flow checks auth, origin, CSRF, typed confirmation, changed plans and replay", async (t) => {
  let plan = { id: userId, email: "demo@example.test", workspaces: [{ id: "private", name: "Demo", kind: "team", role: "owner", members: 1, otherOwners: 0 }] };
  let resets = 0;
  let audits = 0;
  let allowLogin = true;
  const previews = new Set();
  const ask = createAskStore({});
  await ask.claim(userId, 5);
  const store = {
    accounts: async () => [{ id: userId, email: plan.email, workspaces: 1 }], plan: async () => structuredClone(plan),
    restart: async () => { resets++; return { deletedTenants: [] }; }, audit: async () => { audits++; },
    loginAttempt: async () => allowLogin, issuePreview: async (nonce) => previews.add(nonce),
    consumePreview: async (nonce) => previews.delete(nonce),
  };
  const app = createApp({ env, adminStore: store, askStore: ask, files: false, deps: {} });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => { app.closeAllConnections(); app.close(); });
  const origin = `http://127.0.0.1:${app.address().port}`;
  let cookie = "";
  async function call(path, body, headers = {}) {
    return fetch(`${origin}${path}`, { redirect: "manual", method: body ? "POST" : "GET", headers: { cookie, ...(body ? { origin, "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  assert.equal((await call("/admin")).status, 302);
  assert.equal((await call("/admin/api/accounts")).status, 401);
  assert.equal((await call("/admin/login", { username: "fixture-admin", password: "x".repeat(33000) })).status, 413);
  const invalid = await fetch(`${origin}/admin/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "null" });
  assert.equal(invalid.status, 400);
  assert.equal((await call("/admin/login", { username: "fixture-admin", password: "fixture-password" }, { origin: "http://evil.test" })).status, 403);
  assert.equal((await call("/admin/login", { username: "fixture-admin", password: "wrong" })).status, 401);
  const login = await call("/admin/login", { username: "fixture-admin", password: "fixture-password" });
  assert.equal(login.status, 302);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const session = adminSession({ headers: { cookie } }, env);
  assert.equal((await call("/admin")).status, 200);
  assert.equal((await call("/admin/api/accounts")).status, 200);
  assert.equal((await call(`/admin/api/accounts/${userId}`)).status, 200);
  assert.equal((await call("/admin/api/preview", { userId, action: "reset-quota" })).status, 403);
  const preview = async (action = "reset-quota") => call("/admin/api/preview", { userId, action, csrf: session.csrf });
  const confirm = async (value, confirmation = plan.email) => call("/admin/api/confirm", { token: value.token, confirmation, csrf: session.csrf });
  let value = await (await preview()).json();
  assert.equal((await confirm(value, "wrong@example.test")).status, 409);
  assert.equal((await ask.quota(userId, 5)).used, 1);
  assert.equal((await confirm(value)).status, 200);
  assert.equal((await ask.quota(userId, 5)).used, 0);
  assert.equal(audits, 1);
  assert.equal((await confirm(value)).status, 409);
  value = await (await preview("restart-demo")).json();
  plan.workspaces[0].members = 2;
  assert.equal((await confirm(value)).status, 409);
  assert.equal(resets, 0);
  assert.equal((await preview("restart-demo")).status, 409);
  plan.workspaces[0].members = 1;
  const askId = await ask.create(userId, "running");
  assert.equal((await preview()).status, 409);
  await ask.finish(askId, { status: "done" });
  value = await (await preview("restart-demo")).json();
  assert.equal((await confirm(value)).status, 200);
  assert.equal(resets, 1);
  assert.deepEqual(await ask.list(userId), []);
  assert.equal((await call("/admin/logout", { csrf: session.csrf })).status, 302);
  allowLogin = false;
  assert.equal((await call("/admin/login", { username: "fixture-admin", password: "fixture-password" })).status, 429);
});
