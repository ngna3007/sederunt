import assert from "node:assert/strict";
import test from "node:test";
import { linearAccountFrom } from "../src/linear/account.js";
import { createLinearInstallationStore, createMemoryLinearInstallationStore } from "../src/linear/installations.js";
import {
  LINEAR_CLIENT_PATH,
  LINEAR_INSTALL_PATH,
  LINEAR_RESOURCE,
  handleLinearOAuth,
  linearAuthorizeUrl,
  linearClientMetadata,
  tenantLinearClient,
} from "../src/linear/oauth.js";
import { renderConsolePage } from "../src/console-page.js";

const TENANT = "2ecffdbc-314e-4a72-ae26-b73a7b535738";
const OTHER = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = "ab".repeat(32);

function env(extra = {}) {
  return {
    SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
    SEDERUNT_SESSION_SECRET: "test-secret",
    SEDERUNT_AUTH_FAKE: "1",
    NODE_ENV: "test",
    LINEAR_TEAM: "ROW",
    MCP_SECRETS_KEY_V1: KEY,
    ...extra,
  };
}

function recorder() {
  const out = { status: 0, headers: {}, body: "" };
  return {
    out,
    res: {
      writeHead(status, headers) { out.status = status; out.headers = headers || {}; },
      end(body) { out.body = String(body || ""); },
    },
  };
}

function cookiePair(setCookie) {
  return String(setCookie || "").split(";")[0];
}

function mcpFetch(grants) {
  return async (url, init) => {
    const href = String(url);
    if (href === "https://mcp.linear.app/token") {
      const params = new URLSearchParams(init.body);
      assert.equal(params.get("resource"), LINEAR_RESOURCE);
      assert.equal(params.get("client_id"), "https://sederunt.example/console/linear/client.json");
      if (params.get("grant_type") === "authorization_code") assert.ok(params.get("code_verifier"));
      return Response.json({
        access_token: "access-demo",
        refresh_token: "refresh-demo",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "read write",
      });
    }
    const body = JSON.parse(init.body);
    assert.equal(init.headers.authorization, "Bearer access-demo");
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "mcp-session-id": "session-1" } });
    }
    if (body.method === "notifications/initialized") return new Response("", { status: 202 });
    const name = body.params?.name;
    const account = grants[name];
    if (!account) throw new Error(`unexpected ${name || body.method}`);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { structuredContent: account } });
  };
}

const northline = {
  get_workspace: { id: "6350fa526bbf404f988d99658e080148", name: "Northline", url: "https://linear.app/northline" },
  list_teams: { teams: [{ key: "ENG", name: "Eng" }, { key: "ROW", name: "Row" }] },
};

function ctx(store, fetchImpl, role = "owner") {
  return {
    env: env(),
    installations: store,
    fetchImpl,
    now: Date.now(),
    activeTenant: async () => ({ userId: USER, tenantId: TENANT, role }),
    roleIn: async () => role,
  };
}

async function startInstall(store, { change = false, role = "owner" } = {}) {
  const rec = recorder();
  const handled = await handleLinearOAuth(
    { method: "GET", headers: {} },
    rec.res,
    new URL(`https://sederunt.example${LINEAR_INSTALL_PATH}?next=/console/setup${change ? "&change=1" : ""}`),
    ctx(store, mcpFetch(northline), role),
  );
  assert.equal(handled, true);
  return rec.out;
}

test("Linear account uses the workspace url and keeps a team the grant can see", () => {
  const account = linearAccountFrom(
    { id: "6350fa526bbf404f988d99658e080148", name: "Northline", url: "https://linear.app/northline" },
    { teams: [{ key: "ENG" }, { key: "ROW" }] },
    "ROW",
  );
  assert.deepEqual(account, {
    workspaceId: "6350fa526bbf404f988d99658e080148",
    workspaceKey: "northline",
    workspaceName: "Northline",
    teamKey: "ROW",
  });
  const other = linearAccountFrom(
    { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Other", url: "https://linear.app/other-co" },
    { teams: [{ key: "ENG" }] },
    "ROW",
  );
  assert.equal(other.teamKey, "ENG");
  assert.equal(other.workspaceKey, "other-co");
});

test("client metadata is a public PKCE client and the authorize url asks Linear to show consent", () => {
  const metadata = linearClientMetadata(env());
  assert.equal(metadata.client_id, `https://sederunt.example${LINEAR_CLIENT_PATH}`);
  assert.equal(metadata.token_endpoint_auth_method, "none");
  assert.deepEqual(metadata.redirect_uris, ["https://sederunt.example/console/linear/callback"]);
  const url = linearAuthorizeUrl({
    clientId: metadata.client_id,
    redirectUri: metadata.redirect_uris[0],
    state: "state-1",
    challenge: "challenge-1",
  });
  assert.equal(url.origin + url.pathname, "https://mcp.linear.app/authorize");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("resource"), LINEAR_RESOURCE);
  assert.equal(url.searchParams.get("scope"), "read write");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_verifier"), null);
});

test("install sends the owner to Linear consent and the callback stores the workspace without the token", async () => {
  const store = createMemoryLinearInstallationStore(env());
  const started = await startInstall(store, { change: true });
  const location = new URL(started.headers.location);
  assert.equal(started.status, 303);
  assert.equal(location.searchParams.get("prompt"), "consent");
  assert.equal(location.searchParams.get("resource"), LINEAR_RESOURCE);
  assert.equal(location.searchParams.get("code_verifier"), null);
  assert.ok(location.searchParams.get("code_challenge"));
  const state = location.searchParams.get("state");
  const done = recorder();
  await handleLinearOAuth(
    { method: "GET", headers: { cookie: cookiePair(started.headers["set-cookie"]) } },
    done.res,
    new URL(`https://sederunt.example/console/linear/callback?code=demo-code&state=${state}`),
    ctx(store, mcpFetch(northline)),
  );
  assert.equal(done.out.headers.location, "/console/setup?linear=connected");
  assert.equal(done.out.body.includes("access-demo"), false);
  assert.equal(String(done.out.headers.location).includes("access-demo"), false);
  const pub = await store.get(TENANT);
  assert.equal(pub.workspaceName, "Northline");
  assert.equal(pub.workspaceKey, "northline");
  assert.equal(pub.teamKey, "ROW");
  assert.equal(JSON.stringify(pub).includes("access-demo"), false);
  assert.equal(JSON.stringify(pub).includes("refresh-demo"), false);
  const opened = await store.open(TENANT);
  assert.equal(opened.accessToken, "access-demo");
  assert.equal(opened.refreshToken, "refresh-demo");
});

test("a different Linear workspace needs the explicit change and a second tenant cannot take it", async () => {
  const store = createMemoryLinearInstallationStore(env());
  await store.save({
    tenantId: TENANT,
    workspaceId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    workspaceKey: "old-co",
    workspaceName: "Old",
    teamKey: "OLD",
    scopes: ["read", "write"],
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: Date.now() + 60_000,
    installedBy: USER,
    expectedGeneration: null,
  });
  const quiet = await startInstall(store);
  const quietState = new URL(quiet.headers.location).searchParams.get("state");
  const kept = recorder();
  await handleLinearOAuth(
    { method: "GET", headers: { cookie: cookiePair(quiet.headers["set-cookie"]) } },
    kept.res,
    new URL(`https://sederunt.example/console/linear/callback?code=demo-code&state=${quietState}`),
    ctx(store, mcpFetch(northline)),
  );
  assert.equal(kept.out.headers.location, "/console/setup?linear=different");
  assert.equal((await store.get(TENANT)).workspaceKey, "old-co");
  assert.equal((await store.open(TENANT)).accessToken, "old-access");

  const changing = await startInstall(store, { change: true });
  const nextState = new URL(changing.headers.location).searchParams.get("state");
  const replaced = recorder();
  await handleLinearOAuth(
    { method: "GET", headers: { cookie: cookiePair(changing.headers["set-cookie"]) } },
    replaced.res,
    new URL(`https://sederunt.example/console/linear/callback?code=demo-code&state=${nextState}`),
    ctx(store, mcpFetch(northline)),
  );
  assert.equal(replaced.out.headers.location, "/console/setup?linear=connected");
  assert.equal((await store.get(TENANT)).workspaceName, "Northline");

  await assert.rejects(() => store.save({
    tenantId: OTHER,
    workspaceId: "6350fa526bbf404f988d99658e080148",
    workspaceKey: "northline",
    workspaceName: "Northline",
    teamKey: "ROW",
    scopes: ["read", "write"],
    accessToken: "other-access",
    refreshToken: "other-refresh",
    expiresAt: Date.now() + 60_000,
    expectedGeneration: null,
  }), (error) => error.reason === "conflict");
});

test("a member is sent back and a mismatched state stores nothing", async () => {
  const store = createMemoryLinearInstallationStore(env());
  const blocked = await startInstall(store, { role: "member" });
  assert.equal(blocked.headers.location, "/console/setup?linear=forbidden");
  assert.equal(await store.get(TENANT), null);

  const started = await startInstall(store);
  const done = recorder();
  await handleLinearOAuth(
    { method: "GET", headers: { cookie: cookiePair(started.headers["set-cookie"]) } },
    done.res,
    new URL("https://sederunt.example/console/linear/callback?code=demo-code&state=nope"),
    ctx(store, mcpFetch(northline)),
  );
  assert.equal(done.out.headers.location, "/console/setup?linear=expired");
  assert.equal(await store.get(TENANT), null);
});

test("production refuses Linear consent when encrypted storage is not configured", async () => {
  const production = env({ NODE_ENV: "production", VERCEL_ENV: "production", SEDERUNT_AUTH_FAKE: "0" });
  const store = createLinearInstallationStore(production, { memory: true });
  assert.equal(store.durable, false);
  const rec = recorder();
  await handleLinearOAuth(
    { method: "GET", headers: {} },
    rec.res,
    new URL(`https://sederunt.example${LINEAR_INSTALL_PATH}`),
    { ...ctx(store, mcpFetch(northline)), env: production },
  );
  assert.equal(rec.out.status, 503);
  assert.equal(rec.out.body.includes("access-demo"), false);
});

test("a store outage keeps the process Linear token", async () => {
  const workspace = {
    env: env(),
    fetchImpl: async () => { throw new Error("should not call Linear"); },
    linearInstallations: { async open() { throw Object.assign(new Error("down"), { reason: "network" }); } },
    deps: { linear: { async readOpenTripTickets() { return { team: "ROW", trip: [], open: [] }; } } },
  };
  const client = tenantLinearClient(workspace, TENANT);
  assert.deepEqual(await client.readOpenTripTickets(), { team: "ROW", trip: [], open: [] });
});

test("a saved grant is what later Linear calls use", async () => {
  const store = createMemoryLinearInstallationStore(env());
  await store.save({
    tenantId: TENANT,
    workspaceId: "6350fa526bbf404f988d99658e080148",
    workspaceKey: "northline",
    workspaceName: "Northline",
    teamKey: "ROW",
    scopes: ["read", "write"],
    accessToken: "access-demo",
    refreshToken: "refresh-demo",
    expiresAt: Date.now() + 3_600_000,
    installedBy: USER,
    expectedGeneration: null,
  });
  let seen = "";
  const workspace = {
    env: env(),
    fetchImpl: async (_url, init) => {
      seen = init.headers.authorization;
      throw new Error("stop");
    },
    linearInstallations: store,
    linearProfiles: new Map(),
    deps: { linear: { async readOpenTripTickets() { throw new Error("process token used"); } } },
  };
  const client = tenantLinearClient(workspace, TENANT);
  await assert.rejects(() => client.readOpenTripTickets(), /stop/);
  assert.equal(seen, "Bearer access-demo");
  assert.equal(workspace.linearProfiles.get(TENANT).workspaceKey, "northline");
});

test("Manage stays on the page and the workspace change is a button", () => {
  const html = renderConsolePage({ linearConnected: true, linearInstall: true, linearWorkspace: "Northline" });
  assert.match(html, /id="lin-manage"[^>]*data-manage="linear"/);
  assert.doesNotMatch(html, /id="lin-manage"[^>]*data-connect/);
  assert.match(html, /Use a different Linear workspace/);
  assert.match(html, /location\.href = "\/console\/linear\/install" \+ "\?change=1&next="/);
  assert.match(html, /Linear workspace: Northline\./);
  assert.doesNotMatch(html, /prompt=consent/);
  const script = html.slice(html.indexOf("<script type=\"module\">"));
  const change = script.indexOf('which === "linear" && true');
  const docs = script.indexOf("https://linear.app/docs/mcp");
  assert.ok(change > 0 && docs > change);
});
