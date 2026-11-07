import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { createTenantBind } from "../src/tenant-bind.js";
import { createMemoryInstallationStore, createSupabaseInstallationStore } from "../src/slack/installations.js";
import { SLACK_REQUIRED_SCOPES, SLACK_STATE_COOKIE } from "../src/slack/oauth.js";
import { slackConnection, tenantSlackClient } from "../src/slack/tenant-slack.js";
import { createApp } from "../src/server.js";

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
    kind: "oauth", memberId: userId, userId, name: "Ada", email: "ada@example.test",
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
    log.push({ href, auth });
    let body = { ok: true };
    if (href.includes("oauth.v2.access")) body = oauthBody();
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
  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-p", scope: "chat:write", team: { id: "TALPHA", name: "Alpha" } }));
  const partial = await install(port);
  const p = await call(port, "GET", `/console/slack/callback?code=c&state=${partial.state}`, null, { cookie: partial.cookie });
  assert.equal(p.location, "/console/setup?slack=partial");
  assert.equal(await installations.get(A), null);

  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-team-alpha", scope: ALL_SCOPES, bot_user_id: "UBOTA", team: { id: "TALPHA", name: "Alpha" }, incoming_webhook: { channel_id: "CALPHA", channel: "#general", url: "https://hooks.slack.com/x" } }));
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
  setOAuth(() => ({ ok: true, token_type: "bot", access_token: "xoxb-team-gamma", scope: ALL_SCOPES, team: { id: "TGAMMA", name: "Gamma" } }));
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
  await installations.save({ tenantId: B, teamId: "TBETA", teamName: "Beta", token: "xoxb-beta", botUserId: "UBOTB" });
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
  const bye = JSON.stringify({ type: "event_callback", team_id: "TBETA", event: { type: "app_uninstalled" } });
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
      const body = JSON.parse(init.body);
      if (rows.some((row) => row.team_id === body.team_id && row.tenant_id !== body.tenant_id)) return new Response("{}", { status: 409 });
      const i = rows.findIndex((row) => row.tenant_id === body.tenant_id);
      if (i >= 0) rows[i] = body; else rows.push(body);
      return new Response(JSON.stringify([body]), { status: 201 });
    }
    return new Response("[]", { status: 200 });
  };
  const store = createSupabaseInstallationStore({ url: "https://db.example", key: "service", env: { MCP_SECRETS_KEY_V1: SECRETS_KEY }, fetchImpl });
  await store.save({ tenantId: A, teamId: "TALPHA", teamName: "Alpha", token: "xoxb-alpha" });
  assert.match(rows[0].ciphertext, /^\\x[0-9a-f]+$/);
  assert.equal(JSON.stringify(rows).includes("xoxb-alpha"), false);
  assert.ok(requests.some((r) => r.method === "POST" && r.search.includes("on_conflict=tenant_id") && r.prefer.includes("resolution=merge-duplicates")));
  assert.equal((await store.get(A)).teamId, "TALPHA");
  assert.equal((await store.tokenFor(A)).token, "xoxb-alpha");
  assert.equal((await store.byTeam("TALPHA")).tenantId, A);
  await assert.rejects(() => store.save({ tenantId: B, teamId: "TALPHA", token: "xoxb-b" }), (e) => e.reason === "conflict");
});
