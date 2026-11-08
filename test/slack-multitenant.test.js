import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { createTenantBind } from "../src/tenant-bind.js";
import { createInstallationStore, createMemoryInstallationStore, createSupabaseInstallationStore } from "../src/slack/installations.js";
import { SLACK_REQUIRED_SCOPES, SLACK_STATE_COOKIE } from "../src/slack/oauth.js";
import { slackConnection, slackEventTenant, tenantSlackClient } from "../src/slack/tenant-slack.js";
import { postSlackReply } from "../src/slack/reply.js";
import { handleSlackOAuth, SLACK_BOT_SCOPES } from "../src/slack/oauth.js";
import { createApp, storedFileBytes } from "../src/server.js";

const SECRET = "slack-mt-session-secret";
const SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
const SLACK_SECRET = "slack-mt-signing";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ALL_SCOPES = [...SLACK_REQUIRED_SCOPES, "chat:write.customize", "incoming-webhook"].join(",");

function env(extra = {}) {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    COMPANY_MEMWAL_KEY: "k",
    COMPANY_MEMWAL_ACCOUNT_ID: "acct",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: SECRETS_KEY,
    SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
    SLACK_CLIENT_ID: "111.222",
    SLACK_CLIENT_SECRET: "client-secret",
    SLACK_SIGNING_SECRET: SLACK_SECRET,
    // Deployment bot token present: a fresh tenant must still be Not connected.
    SLACK_BOT_TOKEN: "xoxb-deployment-global",
    ...extra,
  };
}

function cookieFor({ userId = "user-a", tenantId = A } = {}) {
  const token = sealSession({
    kind: "oauth", provider: "google", memberId: userId, userId, name: "Ada", email: "ada@example.test",
    exp: Date.now() + 3_600_000, accessToken: `access-${userId}`, refreshToken: "r",
    accessExp: Date.now() + 3_600_000, tenantId, onboarded: true, provider: "google",
  }, SECRET);
  return `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`;
}

function identityFor(byUser) {
  return {
    async myTenants(accessToken) {
      const user = String(accessToken).replace(/^access-/, "");
      return (byUser[user] || []).map((row) => ({ id: row.id, name: row.name || "Workspace", kind: "company", role: row.role || "owner" }));
    },
    async getUser() { return { user_metadata: {} }; },
    async updateUser() {},
    async profile() { return null; },
  };
}

function memory() {
  const remembered = [];
  return { remembered, allowUnscoped: false, async remember(input) { remembered.push(input); return { blobId: `b${remembered.length}` }; }, async index() { return []; }, async recall() { return []; } };
}

function slackFetch(log, oauthBody) {
  return async (url, init = {}) => {
    const href = String(url);
    const auth = init.headers?.authorization || "";
    log.push({ href, auth, body: init.body });
    if (href.startsWith("https://files.slack.com/private/")) return new Response("tenant file bytes");
    if (href.startsWith("https://files.slack.com/upload/")) return new Response("OK");
    let body = { ok: true };
    if (href.includes("oauth.v2.access")) body = oauthBody();
    else if (href.includes("files.info")) body = { ok: true, file: { name: "memo.txt", url_private_download: "https://files.slack.com/private/memo" } };
    else if (href.includes("files.getUploadURLExternal")) body = { ok: true, upload_url: "https://files.slack.com/upload/local", file_id: "FUP" };
    else if (href.includes("conversations.members")) body = { ok: true, members: ["U1"] };
    else if (href.includes("chat.postMessage")) body = { ok: true, channel: "C1", ts: "1.2" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, body, headers = {}) {
  const payload = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers: { ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(raw); } catch { /* html */ }
        resolve({ status: res.statusCode, raw, json, headers: res.headers, location: res.headers.location || "" });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signSlack(payload) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${createHmac("sha256", SLACK_SECRET).update(`v0:${timestamp}:${payload}`).digest("hex")}` };
}

async function setup(t, { members = { "user-a": [{ id: A }, { id: B }, { id: C }] }, oauth } = {}) {
  const log = [];
  let next = oauth || (() => ({ ok: true, token_type: "bot", access_token: "xoxb-team-alpha", scope: ALL_SCOPES, bot_user_id: "UBOTA", app_id: "APP", team: { id: "TALPHA", name: "Alpha" }, incoming_webhook: { channel_id: "CALPHA", channel: "#general", url: "https://hooks.slack.com/discard" } }));
  const installations = createMemoryInstallationStore({ MCP_SECRETS_KEY_V1: SECRETS_KEY });
  const fetchImpl = slackFetch(log, () => next());
  const mem = memory();
  const app = createApp({
    companyLoaded: true,
    env: env(),
    identity: identityFor(members),
    tenantBind: createTenantBind({}, { memory: new Map() }),
    slackInstallations: installations,
    slackOAuthFetch: fetchImpl,
    deps: { memory: mem, tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } }, slack: { fetch: fetchImpl } },
  });
  const port = await listen(app);
  t.after(() => app.close());
  return { port, log, installations, mem, setOAuth: (fn) => { next = fn; } };
}

async function install(port, { userId = "user-a", tenantId = A, change = false } = {}) {
  const cookie = cookieFor({ userId, tenantId });
  const start = await call(port, "GET", `/console/slack/install?next=/console/setup${change ? "&change=1" : ""}`, null, { cookie });
  assert.equal(start.status, 303);
  const authorize = new URL(start.location);
  const state = authorize.searchParams.get("state");
  const stateCookie = String(start.headers["set-cookie"]).split(";")[0];
  return { start, authorize, state, cookie: `${cookie}; ${stateCookie}` };
}

test("install start: owner -> Slack authorize with scopes/state/redirect; member forbidden; signed-out to sign-in", async (t) => {
  const { port } = await setup(t, { members: { "user-a": [{ id: A }], "user-m": [{ id: A, role: "member" }] } });
  const { authorize, state, start } = await install(port);
  assert.equal(authorize.origin + authorize.pathname, "https://slack.com/oauth/v2/authorize");
  assert.equal(authorize.searchParams.get("client_id"), "111.222");
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://sederunt.example/console/slack/callback");
  for (const scope of SLACK_REQUIRED_SCOPES) assert.ok(authorize.searchParams.get("scope").split(",").includes(scope));
  assert.ok(state && state.length >= 24);
  assert.match(String(start.headers["set-cookie"]), new RegExp(`^${SLACK_STATE_COOKIE}=.*HttpOnly.*Path=/console/slack`));
  const member = await call(port, "GET", "/console/slack/install?next=/console/setup", null, { cookie: cookieFor({ userId: "user-m" }) });
  assert.equal(member.location, "/console/setup?slack=forbidden");
  const anon = await call(port, "GET", "/console/slack/install?next=/console/setup");
  assert.match(anon.location, /^\/console\/sign-in\?next=/);
});

test("callback: success saves sealed token for the starting tenant only; replay/forged/declined/partial save nothing", async (t) => {
  const { port, installations, log, setOAuth } = await setup(t);
  const forged = await install(port);
  const bad = await call(port, "GET", `/console/slack/callback?code=x&state=${forged.state}x`, null, { cookie: forged.cookie });
  assert.equal(bad.location, "/console/setup?slack=expired");
  const declined = await install(port);
  const no = await call(port, "GET", `/console/slack/callback?error=access_denied&state=${declined.state}`, null, { cookie: declined.cookie });
  assert.equal(no.location, "/console/setup?slack=declined");
  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-p", app_id: "APP", bot_user_id: "UBOTA", scope: "chat:write", team: { id: "TALPHA", name: "Alpha" } }));
  const partial = await install(port);
  const p = await call(port, "GET", `/console/slack/callback?code=c&state=${partial.state}`, null, { cookie: partial.cookie });
  assert.equal(p.location, "/console/setup?slack=partial");
  assert.equal(await installations.get(A), null);

  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-team-alpha", app_id: "APP", scope: ALL_SCOPES, bot_user_id: "UBOTA", team: { id: "TALPHA", name: "Alpha" }, incoming_webhook: { channel_id: "CALPHA", channel: "#general", url: "https://hooks.slack.com/x" } }));
  const ok = await install(port);
  const done = await call(port, "GET", `/console/slack/callback?code=good&state=${ok.state}`, null, { cookie: ok.cookie });
  assert.equal(done.location, "/console/setup?slack=connected");
  const row = await installations.get(A);
  assert.equal(row.teamId, "TALPHA");
  assert.equal(row.channelId, "CALPHA");
  assert.equal(JSON.stringify(row).includes("xoxb"), false, "public row never carries the token");
  const exchange = log.find((entry) => entry.href.includes("oauth.v2.access"));
  assert.ok(exchange);
  const replay = await call(port, "GET", `/console/slack/callback?code=good&state=${ok.state}`, null, { cookie: ok.cookie });
  assert.equal(replay.location, "/console/setup?slack=expired");
});

test("callback: different signed-in person or lost admin role cannot complete", async (t) => {
  const members = { "user-a": [{ id: A }], "user-b": [{ id: A }] };
  const { port, installations } = await setup(t, { members });
  const started = await install(port);
  const stateCookie = started.cookie.split("; ").pop();
  const other = await call(port, "GET", `/console/slack/callback?code=c&state=${started.state}`, null, { cookie: `${cookieFor({ userId: "user-b" })}; ${stateCookie}` });
  assert.equal(other.location, "/console/setup?slack=expired");
  const again = await install(port);
  members["user-a"] = [{ id: A, role: "member" }];
  const demoted = await call(port, "GET", `/console/slack/callback?code=c&state=${again.state}`, null, { cookie: again.cookie });
  assert.equal(demoted.location, "/console/setup?slack=forbidden");
  assert.equal(await installations.get(A), null);
});

test("a Slack team installed for tenant A cannot be taken by tenant B; change of workspace is explicit", async (t) => {
  const { port, installations, setOAuth } = await setup(t);
  const a = await install(port, { tenantId: A });
  await call(port, "GET", `/console/slack/callback?code=1&state=${a.state}`, null, { cookie: a.cookie });
  const b = await install(port, { tenantId: B });
  const takeover = await call(port, "GET", `/console/slack/callback?code=2&state=${b.state}`, null, { cookie: b.cookie });
  assert.equal(takeover.location, "/console/setup?slack=conflict");
  assert.equal(await installations.get(B), null);
  assert.equal((await installations.get(A)).teamId, "TALPHA");
  // Same tenant, different team: refused unless the owner chose "change".
  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-team-gamma", app_id: "APP", bot_user_id: "UBOTA", scope: ALL_SCOPES, team: { id: "TGAMMA", name: "Gamma" } }));
  const silent = await install(port, { tenantId: A });
  const refused = await call(port, "GET", `/console/slack/callback?code=3&state=${silent.state}`, null, { cookie: silent.cookie });
  assert.equal(refused.location, "/console/setup?slack=different-team");
  const change = await install(port, { tenantId: A, change: true });
  const changed = await call(port, "GET", `/console/slack/callback?code=4&state=${change.state}`, null, { cookie: change.cookie });
  assert.equal(changed.location, "/console/setup?slack=connected");
  assert.equal((await installations.get(A)).teamId, "TGAMMA");
});

test("switching A -> B -> A shows each tenant's own Slack workspace; fresh tenant C is Not connected despite env token", async (t) => {
  const { port, installations } = await setup(t);
  await installations.save({ tenantId: A, teamId: "TALPHA", teamName: "Alpha Co", token: "xoxb-alpha" });
  await installations.save({ tenantId: B, teamId: "TBETA", teamName: "Beta Co", token: "xoxb-beta" });
  const page = async (tenantId) => (await call(port, "GET", "/console/setup", null, { cookie: cookieFor({ tenantId }) })).raw;
  for (const [tenantId, name] of [[A, "Alpha Co"], [B, "Beta Co"], [A, "Alpha Co"]]) {
    const html = await page(tenantId);
    assert.match(html, /id="slack-conn" class="conn-state">Connected</);
    assert.ok(html.includes(`Slack workspace: ${name}`), `tenant ${tenantId} shows ${name}`);
    assert.equal(html.includes(name === "Alpha Co" ? "Beta Co" : "Alpha Co"), false);
  }
  const fresh = await page(C);
  assert.match(fresh, /id="slack-conn" class="conn-state off">Not connected</);
});

test("events route by team installation with that tenant's token; unknown team ingests nothing; uninstall disconnects", async (t) => {
  const { port, installations, log, mem } = await setup(t);
  await installations.save({ tenantId: A, teamId: "TALPHA", teamName: "Alpha", token: "xoxb-alpha", botUserId: "UBOTA" });
  await installations.save({ tenantId: B, teamId: "TBETA", teamName: "Beta", token: "xoxb-beta", appId: "APP", botUserId: "UBOTB" });
  const send = (team, id) => {
    const payload = JSON.stringify({ type: "event_callback", team_id: team, event: { type: "message", user: "U1", channel: "C1", text: `note ${id}`, client_msg_id: id, ts: "1.1" } });
    return call(port, "POST", "/api/slack", payload, signSlack(payload));
  };
  log.length = 0;
  await send("TALPHA", "a1");
  const alphaAuth = new Set(log.map((entry) => entry.auth).filter(Boolean));
  assert.ok(alphaAuth.has("Bearer xoxb-alpha"));
  assert.equal([...alphaAuth].some((value) => value !== "Bearer xoxb-alpha"), false, "only tenant A token for team A");
  log.length = 0;
  await send("TBETA", "b1");
  const betaAuth = new Set(log.map((entry) => entry.auth).filter(Boolean));
  assert.ok(betaAuth.has("Bearer xoxb-beta"));
  assert.equal([...betaAuth].some((value) => value !== "Bearer xoxb-beta"), false);
  log.length = 0;
  const before = mem.remembered.length;
  const stranger = await send("TSTRANGER", "s1");
  assert.equal(stranger.json?.slack, "not-linked");
  assert.equal(log.length, 0);
  assert.equal(mem.remembered.length, before);
  const bye = JSON.stringify({ type: "event_callback", team_id: "TBETA", api_app_id: "APP", event_time: Math.ceil(Date.now() / 1000) + 1, event: { type: "app_uninstalled" } });
  assert.equal((await call(port, "POST", "/api/slack", bye, signSlack(bye))).json?.slack, "uninstalled");
  assert.equal(await installations.get(B), null);
  assert.equal((await send("TBETA", "b2")).json?.slack, "not-linked");
  assert.equal((await installations.get(A)).teamId, "TALPHA");
});

test("tenant Slack client posts with the tenant's token and install channel; no install -> unsupported, never the deployment bot", async () => {
  const log = [];
  const installations = createMemoryInstallationStore({});
  await installations.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-alpha", channelId: "CALPHA" });
  const workspace = { env: env(), slackInstallations: installations, tenantBind: createTenantBind({}, { memory: new Map() }), deps: { slack: { fetch: slackFetch(log, () => ({})) } } };
  const clientA = tenantSlackClient(workspace, A, slackFetch(log, () => ({})));
  assert.equal(await clientA.defaultChannel(), "CALPHA");
  await clientA.postMessage({ channel: "CALPHA", text: "hi" });
  assert.equal(log[0].auth, "Bearer xoxb-alpha");
  const clientC = tenantSlackClient(workspace, C, slackFetch(log, () => ({})));
  await assert.rejects(() => clientC.postMessage({ channel: "C1", text: "x" }), (error) => error.reason === "unsupported");
  assert.equal(log.some((entry) => entry.auth.includes("deployment-global")), false);
  assert.equal((await slackConnection(workspace, C)).linked, false);
});

test("Supabase installation store: sealed bytea, unique-team conflict surfaces, token only via tokenFor", async () => {
  const rows = [];
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    requests.push({ method: init.method, search: u.search, prefer: init.headers?.prefer || "" });
    const eq = (name) => (u.searchParams.get(name) || "").replace(/^eq\./, "");
    if (init.method === "GET") {
      const hit = rows.filter((row) => (!eq("tenant_id") || row.tenant_id === eq("tenant_id")) && (!eq("team_id") || row.team_id === eq("team_id")));
      return new Response(JSON.stringify(hit), { status: 200 });
    }
    if (init.method === "POST") {
      const args = JSON.parse(init.body);
      assert.equal(u.pathname, "/rest/v1/rpc/slack_installation_save");
      const body = Object.fromEntries(Object.entries(args).filter(([k]) => !["p_replace", "p_expected_generation"].includes(k)).map(([k,v]) => [k.slice(2),v]));
      body.generation = randomUUID();
      if (rows.some((row) => row.team_id === body.team_id && row.tenant_id !== body.tenant_id)) return new Response("{}", { status: 409 });
      const i = rows.findIndex((row) => row.tenant_id === body.tenant_id);
      if (i >= 0) rows[i] = body; else rows.push(body);
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  const store = createSupabaseInstallationStore({ url: "https://db.example", key: "service", env: { MCP_SECRETS_KEY_V1: SECRETS_KEY }, fetchImpl });
  await store.save({ tenantId: A, teamId: "TALPHA", teamName: "Alpha", token: "xoxb-alpha" });
  assert.match(rows[0].ciphertext, /^\\x[0-9a-f]+$/);
  assert.equal(JSON.stringify(rows).includes("xoxb-alpha"), false);
  assert.ok(requests.some((r) => r.method === "POST" && !r.search.includes("on_conflict")));
  assert.equal((await store.get(A)).teamId, "TALPHA");
  assert.equal((await store.tokenFor(A)).token, "xoxb-alpha");
  assert.equal((await store.byTeam("TALPHA")).tenantId, A);
  await assert.rejects(() => store.save({ tenantId: B, teamId: "TALPHA", token: "xoxb-b" }), (e) => e.reason === "conflict");
});

test("installation outage cannot fall through to an existing verified legacy claim (tenant and event paths)", async () => {
  const bind = createTenantBind({}, { memory: new Map() });
  await bind.bind("slack", "TLEGACY", A);
  const failure = async () => { throw new Error("unavailable"); };
  const workspace = { env: env(), tenantBind: bind, deps: { slack: { async authTest() { return { ok: true, teamId: "TLEGACY" }; } } },
    slackInstallations: { tokenFor: failure, byTeam: failure } };
  await assert.rejects(() => slackConnection(workspace, A));
  await assert.rejects(() => slackEventTenant(workspace, { teamId: "TLEGACY", legacyTenantId: A }));
  workspace.slackInstallations.tokenFor = async () => null;
  await assert.rejects(() => slackConnection(workspace, A), "byTeam failure also blocks legacy authorization");
});

test("stored-file fallback actually resolves files.info and downloads with only the tenant token", async () => {
  const store = createMemoryInstallationStore({});
  await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-alpha" });
  await store.save({ tenantId: B, teamId: "TBETA", token: "xoxb-beta" });
  const log = [];
  const fetchImpl = async (url, init) => {
    log.push({ url: String(url), auth: init?.headers?.authorization });
    if (String(url).includes("files.info")) return Response.json({ ok: true, file: { name: "memo.txt", url_private_download: "https://files.slack.com/private/memo" } });
    return new Response("private bytes");
  };
  const workspace = { env: env(), slackInstallations: store, deps: { slack: { fetch: fetchImpl } } };
  const session = { decisions: [{ fileNames: [{ name: "memo.txt", slackFileId: "FA" }] }] };
  for (const [tenant, token] of [[A, "alpha"], [B, "beta"], [A, "alpha"]]) {
    log.length = 0;
    const deps = { slack: tenantSlackClient(workspace, tenant, fetchImpl), console: { async download() { throw new Error("not available"); } } };
    assert.equal(await storedFileBytes(session, "memo.txt", deps, env()), "private bytes");
    assert.equal(log.length, 2);
    assert.ok(log.every((call) => call.auth === `Bearer xoxb-${token}`));
  }
  log.length = 0;
  assert.equal(await storedFileBytes(session, "memo.txt", { slack: tenantSlackClient(workspace, C, fetchImpl) }, env()), null);
  assert.equal(log.length, 0);
});

test("retained tenant clients refresh tokens after replacement and never use removed tokens", async () => {
  const store = createMemoryInstallationStore({});
  const first = await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-first" });
  const log = [];
  const workspace = { env: env(), slackInstallations: store, deps: { slack: { fetch: slackFetch(log, () => ({})) } } };
  const client = tenantSlackClient(workspace, A);
  await client.postMessage({ channel: "CA", text: "first" });
  await store.save({ tenantId: A, teamId: "TBETA", token: "xoxb-next", replace: true, expectedGeneration: first.generation });
  log.length = 0;
  await client.postMessage({ channel: "CB", text: "next" });
  assert.ok(log.every((entry) => entry.auth === "Bearer xoxb-next"));
  await store.remove(A);
  log.length = 0;
  await assert.rejects(() => client.postMessage({ channel: "CA", text: "removed" }));
  assert.equal(log.length, 0);
});

test("competing same-tenant callbacks and stale explicit replacements cannot both save; generation prevents delete/recreate ABA", async () => {
  const store = createMemoryInstallationStore({});
  const attempts = await Promise.allSettled(["TALPHA", "TBETA"].map((teamId) => store.save({ tenantId: A, teamId, token: "xoxb-test" })));
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  const original = await store.get(A);
  const replacements = await Promise.allSettled(["TGAMMA", "TDELTA"].map((teamId) => store.save({ tenantId: A, teamId, token: "xoxb-test", replace: true, expectedGeneration: original.generation })));
  assert.equal(replacements.filter((r) => r.status === "fulfilled").length, 1);
  const current = await store.get(A);
  await store.remove(A);
  const recreated = await store.save({ tenantId: A, teamId: "TRECREATED", token: "xoxb-test" });
  assert.notEqual(current.generation, recreated.generation);
  await assert.rejects(() => store.save({ tenantId: A, teamId: "TSTALE", token: "xoxb-test", replace: true, expectedGeneration: current.generation }), (e) => e.reason === "stale");
});

test("OAuth snapshots current generation: two concurrent callbacks from the same starting connection have one winner", async (t) => {
  const { port, installations } = await setup(t);
  const first = await install(port);
  const second = await install(port);
  const done = await Promise.all([first, second].map((flow) => call(port, "GET", `/console/slack/callback?code=x&state=${flow.state}`, null, { cookie: flow.cookie })));
  assert.deepEqual(done.map((r) => r.location).sort(), ["/console/setup?slack=connected", "/console/setup?slack=stale"]);
  assert.ok((await installations.get(A)).generation);
});

test("OAuth state is single-use across independent handler instances sharing a store", async (t) => {
  const { port, installations, log } = await setup(t);
  const flow = await install(port);
  // No process-global replay map: a second context consumes the same durable state.
  assert.equal(await installations.consumeState(flow.state, Date.now() + 60000), true);
  const result = await call(port, "GET", `/console/slack/callback?code=x&state=${flow.state}`, null, { cookie: flow.cookie });
  assert.equal(result.location, "/console/setup?slack=expired");
  assert.equal(log.some((r) => r.href.includes("oauth.v2.access")), false);
});

test("user-only/wrong-bot/wrong-app/stale/missing-time lifecycle events leave the installation intact; persistence failure retries", async (t) => {
  const { port, installations } = await setup(t);
  await installations.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-alpha", appId: "APP", botUserId: "UBOTA" });
  const send = (data) => { const raw = JSON.stringify({ type: "event_callback", team_id: "TALPHA", api_app_id: "APP", event_time: Math.ceil(Date.now() / 1000) + 1, ...data }); return call(port, "POST", "/api/slack", raw, signSlack(raw)); };
  for (const data of [
    { event: { type: "tokens_revoked", tokens: { oauth: ["UBOTA"] } } },
    { event: { type: "tokens_revoked", tokens: { bot: ["UOTHER"] } } },
    { api_app_id: "AOTHER", event: { type: "app_uninstalled" } },
    { event_time: Math.floor(Date.now() / 1000) - 60, event: { type: "app_uninstalled" } },
    { event_time: undefined, event: { type: "app_uninstalled" } },
  ]) {
    assert.equal((await send(data)).status, 200);
    assert.ok(await installations.get(A));
  }
  const revoke = installations.revoke;
  installations.revoke = async () => { throw new Error("offline"); };
  const valid = { event: { type: "tokens_revoked", tokens: { bot: ["UBOTA"] } } };
  assert.equal((await send(valid)).status, 503);
  assert.ok(await installations.get(A));
  installations.revoke = revoke;
  assert.equal((await send(valid)).status, 200);
  assert.equal(await installations.get(A), null);
});

test("lifecycle deletion uses expected generation so an install saved during event handling survives", async () => {
  const store = createMemoryInstallationStore({});
  const old = await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-old", appId: "APP", botUserId: "UBOTA" });
  const current = await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-current", appId: "APP", botUserId: "UBOTA", expectedGeneration: old.generation });
  assert.equal(await store.revoke({ teamId: "TALPHA", appId: "APP", generation: old.generation, eventTime: Date.now() + 10000, botUserId: "UBOTA" }), 0);
  assert.equal((await store.get(A)).generation, current.generation);
});

test("all file reply scopes are requested and missing files:write grants cannot connect", async (t) => {
  assert.ok(SLACK_BOT_SCOPES.includes("files:write"));
  const { port, installations } = await setup(t, { oauth: () => ({ ok: true, token_type: "bot", access_token: "xoxb-test", app_id: "APP", bot_user_id: "UBOTA", team: { id: "TALPHA" }, scope: SLACK_BOT_SCOPES.filter((s) => s !== "files:write").join(",") }) });
  const flow = await install(port);
  const result = await call(port, "GET", `/console/slack/callback?code=x&state=${flow.state}`, null, { cookie: flow.cookie });
  assert.equal(result.location, "/console/setup?slack=partial");
  assert.equal(await installations.get(A), null);
  const reply = await postSlackReply({ token: "xoxb-local-test", channel: "CA", text: "memo", file: { name: "memo.txt", bytes: "memo" }, fetchImpl: async () => Response.json({ ok: false, error: "missing_scope" }) });
  assert.deepEqual(reply, { posted: false, file: "", reason: "missing_scope" });
});

test("production refuses ephemeral/plaintext persistence before OAuth consent", async () => {
  for (const extra of [{}, { MCP_SECRETS_KEY_V1: "invalid" }, { SEDERUNT_AUTH_FAKE: "1" }]) {
    const production = env({ NODE_ENV: "production", SEDERUNT_AUTH_FAKE: "0", ...extra });
    const store = createInstallationStore(production, { memory: true });
    assert.equal(store.durable, false);
    await assert.rejects(() => store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-local-test" }));
    let status;
    await handleSlackOAuth({ method: "GET", headers: {} }, { writeHead(s) { status = s; }, end() {} }, new URL("https://sederunt.example/console/slack/install"), { env: production, installations: store });
    assert.equal(status, 503);
  }
});

test("channel readiness needs actual membership and a non-archived accessible selected channel", async () => {
  const store = createMemoryInstallationStore({});
  await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-alpha", channelId: "CA" });
  let channel = { id: "CA", is_member: true, is_archived: false };
  let ok = true;
  const client = tenantSlackClient({ env: env(), slackInstallations: store }, A, async (_url, init) => {
    assert.equal(init.headers.authorization, "Bearer xoxb-alpha");
    return Response.json({ ok, channel });
  });
  assert.equal(await client.channelReady("CA"), true);
  for (const change of [{ is_member: false }, { is_archived: true }, { id: "CB" }]) {
    channel = { id: "CA", is_member: true, is_archived: false, ...change };
    assert.equal(await client.channelReady("CA"), false);
  }
  ok = false;
  assert.equal(await client.channelReady("CA"), false);
});

test("real workspace switcher reseals session A -> B -> A; reload keeps saved Slack without OAuth", async (t) => {
  const { port, installations, log } = await setup(t);
  await installations.save({ tenantId: A, teamId: "TALPHA", teamName: "Alpha Co", token: "xoxb-alpha" });
  await installations.save({ tenantId: B, teamId: "TBETA", teamName: "Beta Co", token: "xoxb-beta" });
  let cookie = cookieFor({ tenantId: A });
  for (const [tenant, name, other] of [[B, "Beta Co", "Alpha Co"], [A, "Alpha Co", "Beta Co"]]) {
    const switched = await call(port, "POST", "/console/space", { tenant }, { cookie, origin: "https://sederunt.example" });
    assert.equal(switched.status, 302);
    assert.equal(switched.location, "/console");
    cookie = String(switched.headers["set-cookie"]).split(";")[0];
    for (let reload = 0; reload < 2; reload += 1) {
      const page = await call(port, "GET", "/console/setup", null, { cookie });
      assert.equal(page.status, 200);
      assert.ok(page.raw.includes(`Slack workspace: ${name}`));
      assert.equal(page.raw.includes(`Slack workspace: ${other}`), false);
    }
  }
  assert.equal(log.some((r) => r.href.includes("oauth.v2.access")), false);
  const outsider = await call(port, "POST", "/console/space", { tenant: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, { cookie, origin: "https://sederunt.example" });
  assert.equal(outsider.status, 404);
});

test("a replacement between files.info and private download aborts before sending the stale token again", async () => {
  const store = createMemoryInstallationStore({});
  const first = await store.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-old" });
  const calls = [];
  const client = tenantSlackClient({ env: env(), slackInstallations: store }, A, async (url) => {
    calls.push(String(url));
    await store.save({ tenantId: A, teamId: "TBETA", token: "xoxb-new", replace: true, expectedGeneration: first.generation });
    return Response.json({ ok: true, file: { name: "memo.txt", url_private_download: "https://files.slack.com/private/memo" } });
  });
  assert.equal(await client.downloadFile({ id: "FA", name: "memo.txt" }), null);
  assert.equal(calls.length, 1);
});

test("OAuth storage outages before consent or nonce consumption remain fail-closed and retryable", async (t) => {
  const { port, installations, log } = await setup(t);
  const flow = await install(port);
  const consume = installations.consumeState;
  installations.consumeState = async () => { throw new Error("offline"); };
  const failed = await call(port, "GET", `/console/slack/callback?code=x&state=${flow.state}`, null, { cookie: flow.cookie });
  assert.equal(failed.status, 503);
  assert.equal(log.some((r) => r.href.includes("oauth.v2.access")), false);
  installations.consumeState = consume;
  const retried = await call(port, "GET", `/console/slack/callback?code=x&state=${flow.state}`, null, { cookie: flow.cookie });
  assert.equal(retried.location, "/console/setup?slack=connected");
  installations.get = async () => { throw new Error("offline"); };
  const start = await call(port, "GET", "/console/slack/install", null, { cookie: cookieFor() });
  assert.equal(start.status, 503);
});

test("actual Slack HTTP keep -> stored-file DM resend uses only the routed tenant token, including file download and upload", async (t) => {
  const { port, installations, log } = await setup(t);
  await installations.save({ tenantId: A, teamId: "TALPHA", token: "xoxb-alpha", appId: "APP", botUserId: "UBOTA" });
  await installations.save({ tenantId: B, teamId: "TBETA", token: "xoxb-beta", appId: "APP", botUserId: "UBOTB" });
  const send = (team, event) => {
    const raw = JSON.stringify({ type: "event_callback", team_id: team, api_app_id: "APP", event: { type: "message", user: "U1", ts: String(Date.now() / 1000), ...event } });
    return call(port, "POST", "/api/slack", raw, signSlack(raw));
  };
  const kept = await send("TALPHA", { channel: "C1", subtype: "file_share", text: "Please keep memo.txt", client_msg_id: "file-a", files: [{ id: "FA", name: "memo.txt", url_private_download: "https://files.slack.com/private/memo" }] });
  assert.equal(kept.status, 200, kept.raw);
  log.length = 0;
  const reply = await send("TALPHA", { channel: "D1", channel_type: "im", text: "resend memo.txt", client_msg_id: "resend-a" });
  assert.equal(reply.status, 200, reply.raw);
  assert.equal(reply.json?.posted, true, reply.raw);
  for (const method of ["files.info", "/private/memo", "files.getUploadURLExternal", "files.completeUploadExternal"]) {
    assert.ok(log.some((entry) => entry.href.includes(method)), `actual route exercised ${method}`);
  }
  assert.ok(log.filter((r) => r.auth).every((r) => r.auth === "Bearer xoxb-alpha"));
  assert.equal(log.find((r) => r.href.includes("/upload/local")).auth, "", "signed Slack upload URL gets bytes, not bearer credentials");
  log.length = 0;
  const isolated = await send("TBETA", { channel: "D1", channel_type: "im", text: "resend memo.txt", client_msg_id: "resend-b" });
  assert.equal(isolated.status, 200);
  assert.equal(log.some((r) => /files.info|files.getUploadURLExternal|\/private\/memo/.test(r.href)), false, "tenant B has no access to tenant A's stored file");
  assert.ok(log.filter((r) => r.auth).every((r) => r.auth === "Bearer xoxb-beta"));
});

async function legacyFixture(installations, tenant = A, team = "TLEGACY") {
  const tenantBind = createTenantBind({}, { memory: new Map() });
  await tenantBind.bind("slack", team, tenant);
  const log = [];
  return { env: env(), slackInstallations: installations, tenantBind,
    deps: { slack: { fetch: slackFetch(log, () => ({})), async authTest() { return { ok: true, teamId: team }; } } }, log };
}

test("durable supersession: OAuth -> revoke -> failed reconnect -> reinstall -> remove never revives an older different legacy team", async () => {
  const installations = createMemoryInstallationStore({});
  const workspace = await legacyFixture(installations);
  assert.equal(await installations.enrollLegacy({ tenantId: A, teamId: "TLEGACY" }), true);
  assert.equal((await slackConnection(workspace, A)).source, "legacy");
  const oldClient = tenantSlackClient(workspace, A);
  const old = await slackConnection(workspace, A);
  const guardedOldRequest = (await import("../src/slack/tenant-slack.js")).installationFetch(workspace, A, old, async () => { throw new Error("must not request"); });
  const installed = await installations.save({ tenantId: A, teamId: "TNEW", token: "xoxb-new", appId: "APP", botUserId: "UBOTA" });
  await assert.rejects(() => guardedOldRequest("https://slack.com/api/chat.postMessage"), (e) => e.reason === "stale");
  await installations.revoke({ teamId: "TNEW", appId: "APP", generation: installed.generation, botUserId: "UBOTA", eventTime: Date.now() + 5000 });
  assert.equal((await slackConnection(workspace, A)).linked, false);
  assert.equal((await slackEventTenant(workspace, { teamId: "TLEGACY", legacyTenantId: A })).tenantId, "");
  await assert.rejects(() => oldClient.postMessage({ channel: "CA", text: "disconnected" }));
  await installations.save({ tenantId: B, teamId: "TOCCUPIED", token: "xoxb-b" });
  await assert.rejects(() => installations.save({ tenantId: A, teamId: "TOCCUPIED", token: "xoxb-conflict" }));
  assert.equal((await slackConnection(workspace, A)).linked, false);
  await installations.save({ tenantId: A, teamId: "TREINSTALL", token: "xoxb-reinstall" });
  assert.equal((await slackConnection(workspace, A)).teamId, "TREINSTALL");
  await installations.remove(A);
  assert.equal((await slackConnection(workspace, A)).linked, false);
  assert.equal(await installations.enrollLegacy({ tenantId: A, teamId: "TLEGACY" }), false);
  assert.equal(workspace.log.length, 0);
});

test("orphan/deleted tenant legacy claims cannot enroll or route; live legacy is explicitly disconnectable", async () => {
  const tenants = new Set([A, B]);
  const installations = createMemoryInstallationStore({}, { tenants });
  const orphan = await legacyFixture(installations, C);
  assert.equal((await slackConnection(orphan, C)).linked, false);
  assert.equal((await slackEventTenant(orphan, { teamId: "TLEGACY", legacyTenantId: C })).tenantId, "");
  const live = await legacyFixture(installations);
  assert.equal(await installations.enrollLegacy({ tenantId: A, teamId: "TLEGACY" }), true);
  assert.equal((await slackConnection(live, A)).source, "legacy");
  tenants.delete(A);
  assert.equal((await slackConnection(live, A)).linked, false);
  assert.equal((await slackEventTenant(live, { teamId: "TLEGACY", legacyTenantId: A })).tenantId, "");
  const other = await legacyFixture(installations, B, "TBLEGACY");
  assert.equal(await installations.enrollLegacy({ tenantId: B, teamId: "TBLEGACY" }), true);
  assert.equal((await slackConnection(other, B)).source, "legacy");
  await installations.remove(B);
  assert.equal((await slackConnection(other, B)).linked, false);
});

test("legacy eligibility-store failure cannot authorize a healthy cached Redis claim", async () => {
  const installations = createMemoryInstallationStore({});
  const workspace = await legacyFixture(installations);
  assert.equal(await installations.enrollLegacy({ tenantId: A, teamId: "TLEGACY" }), true);
  assert.equal((await slackConnection(workspace, A)).source, "legacy");
  installations.legacyEligible = async () => { throw new Error("store offline"); };
  await assert.rejects(() => slackConnection(workspace, A));
  await assert.rejects(() => slackEventTenant(workspace, { teamId: "TLEGACY", legacyTenantId: A }));
});

test("legacy/OAuth competing team ownership has one winner and failed first OAuth preserves a valid legacy grant", async () => {
  const store = createMemoryInstallationStore({});
  const results = await Promise.allSettled([
    store.enrollLegacy({ tenantId: A, teamId: "TRACED" }),
    store.save({ tenantId: B, teamId: "TRACED", token: "xoxb-b" }),
  ]);
  assert.equal(Number(results[0].status === "fulfilled" && results[0].value === true) + Number(results[1].status === "fulfilled"), 1);
  await store.save({ tenantId: B, teamId: "TOCCUPIED", token: "xoxb-b" });
  await assert.rejects(() => store.save({ tenantId: A, teamId: "TOCCUPIED", token: "xoxb-failed" }));
  assert.equal(await store.legacyEligible({ tenantId: A, teamId: "TRACED" }), true);
});

test("a channel-only orphan claim cannot enroll a live tenant without authoritative legacy team ownership", async () => {
  const installations = createMemoryInstallationStore({});
  const workspace = await legacyFixture(installations);
  workspace.deps.app = { slackChannel: "CA" };
  workspace.tenantBind = { async resolve(_kind, key) { return key === "TLEGACY:CA" ? A : ""; } };
  assert.equal((await slackConnection(workspace, A)).linked, false);
  assert.equal(await installations.legacyEligible({ tenantId: A, teamId: "TLEGACY" }), false);
});

test("ordinary lookups/events do not enroll matching live legacy claims, including a forged enrollment query option", async () => {
  const installations = createMemoryInstallationStore({});
  const workspace = await legacyFixture(installations);
  for (let i = 0; i < 3; i++) {
    assert.equal((await slackConnection(workspace, A)).linked, false);
    assert.equal((await slackEventTenant(workspace, { teamId: "TLEGACY", legacyTenantId: A })).tenantId, "");
  }
  assert.equal(await installations.legacyEligible({ tenantId: A, teamId: "TLEGACY", enroll: true }), false);
  assert.equal(await installations.enrollLegacy({ tenantId: A, teamId: "TLEGACY" }), true, "explicit local backfill fixture");
  assert.equal((await slackConnection(workspace, A)).source, "legacy");
  assert.equal((await slackEventTenant(workspace, { teamId: "TLEGACY", legacyTenantId: A })).tenantId, A);
  assert.equal(workspace.log.length, 0);
});
