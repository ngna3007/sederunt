import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { openSession, sealSession, sessionSecret } from "../src/console-auth.js";
import { createIdentity, IdentityError } from "../src/identity/client.js";
import { codeChallengeFor, createCodeVerifier } from "../src/identity/pkce.js";
import { createSupabaseIdentity } from "../src/identity/supabase.js";
import { createApp } from "../src/server.js";

const SECRET = "session-secret";
const PASS = "fixture-passphrase";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { body, headers, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(body ? { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) } : {}),
        ...(cookie ? { cookie } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location || "",
        cookie: res.headers["set-cookie"],
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieList(setCookie) {
  if (setCookie == null) return [];
  return Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)];
}

function absorb(jar, setCookie) {
  for (const item of cookieList(setCookie)) {
    const pair = item.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!value) delete jar[name];
    else jar[name] = value;
  }
  return jar;
}

function header(jar) {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
}

function cookieValue(setCookie, name) {
  const found = cookieList(setCookie).find((item) => item.startsWith(`${name}=`));
  if (!found) return "";
  return found.split(";")[0].slice(name.length + 1);
}

async function withServer(env, fn, identity) {
  const app = createApp({ companyLoaded: true, env, identity });
  const port = await listen(app);
  try {
    await fn(port);
  } finally {
    app.close();
  }
}

test("supabase sign-in stays on localhost", async (t) => {
  const outbound = [];
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    fetchCalls += 1;
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || input);
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      host = "";
    }
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      outbound.push(raw);
      throw new Error(`blocked outbound fetch to ${host || raw}`);
    }
    return realFetch(input, init);
  };

  try {
    await t.test("pkce challenge is the sha256 of the verifier", () => {
      const verifier = createCodeVerifier();
      assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
      const challenge = codeChallengeFor(verifier);
      assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
      assert.notEqual(challenge, verifier);
    });

    await t.test("session secret prefers the dedicated key, then the passphrase, then a process key", () => {
      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => warnings.push(args.join(" "));
      try {
        assert.equal(sessionSecret({ SEDERUNT_SESSION_SECRET: " box ", SEDERUNT_CONSOLE_SECRET: "desk" }), "box");
        assert.equal(sessionSecret({ SEDERUNT_CONSOLE_SECRET: " desk " }), "desk");
        const first = sessionSecret({});
        const second = sessionSecret({});
        assert.equal(first, second);
        assert.match(first, /^[A-Za-z0-9_-]{20,}$/);
      } finally {
        console.warn = original;
      }
      assert.match(warnings.join("\n"), /SEDERUNT_SESSION_SECRET/);
    });

    await t.test("an oauth session seal rejects a tampered body and a bad key", () => {
      const token = sealSession({
        kind: "oauth", provider: "google",
        memberId: "user-1",
        userId: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        exp: Date.now() + 60_000,
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessExp: Date.now() + 30_000,
      }, SECRET);
      const opened = openSession(token, SECRET);
      assert.equal(opened.ok, true);
      assert.equal(opened.kind, "oauth");
      assert.equal(opened.name, "Ada Lovelace");
      assert.equal(opened.accessToken, "access-token");
      assert.equal(opened.refreshToken, "refresh-token");
      assert.equal(openSession(token, "other").reason, "invalid");
      const flipped = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
      assert.equal(openSession(flipped, SECRET).reason, "invalid");
      const dot = token.lastIndexOf(".");
      const body = JSON.parse(Buffer.from(token.slice(0, dot), "base64url").toString("utf8"));
      body.name = "Eve";
      const swapped = `${Buffer.from(JSON.stringify(body)).toString("base64url")}.${token.slice(dot + 1)}`;
      assert.equal(openSession(swapped, SECRET).reason, "invalid");
    });

    await t.test("the supabase client talks to auth and rest with the publishable key", async () => {
      const { fetch, calls } = scriptedFetch((call) => {
        const url = new URL(call.url);
        if (url.pathname === "/auth/v1/settings") {
          return { status: 200, body: { external: { google: true, github: false } } };
        }
        if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
          assert.deepEqual(call.body, { auth_code: "code-1", code_verifier: "verifier-1" });
          assert.equal(call.headers.apikey, "sb_publishable_test");
          assert.equal(call.headers.authorization, "Bearer sb_publishable_test");
          assert.equal(call.redirect, "manual");
          return { status: 200, body: { access_token: "access", refresh_token: "refresh", expires_in: 10, user: { id: "do-not-trust" } } };
        }
        if (url.pathname === "/auth/v1/user") {
          assert.equal(call.headers.authorization, "Bearer access");
          assert.equal(call.headers.apikey, "sb_publishable_test");
          return { status: 200, body: { id: "user-1", email: "ada@example.com", app_metadata: { provider: "google" }, user_metadata: { full_name: "Ada Lovelace" } } };
        }
        if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
          assert.deepEqual(call.body, { refresh_token: "refresh" });
          return { status: 200, body: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 20 } };
        }
        if (url.pathname === "/rest/v1/my_tenants") {
          assert.equal(url.searchParams.get("select"), "id,kind,name,role,created_at");
          return { status: 200, body: [{ id: "t1", kind: "personal", name: "Personal", role: "owner", created_at: "2026-11-04T00:00:00.000Z" }] };
        }
        if (url.pathname === "/rest/v1/profiles") {
          return { status: 200, body: [{ id: "user-1", display_name: "Ada Lovelace", avatar_url: null, email: "ada@example.com", personal_tenant_id: "t1" }] };
        }
        if (url.pathname === "/rest/v1/rpc/create_tenant") {
          assert.deepEqual(call.body, { p_kind: "team", p_name: "Acme" });
          return { status: 200, body: "tenant-1" };
        }
        if (url.pathname === "/rest/v1/rpc/create_invite") {
          assert.equal(call.body.p_email, "grace@example.com");
          return { status: 200, body: "invite-token" };
        }
        if (url.pathname === "/rest/v1/rpc/accept_invite") {
          assert.equal(call.body.p_token, "invite-token");
          return { status: 200, body: "tenant-1" };
        }
        return { status: 500, body: { message: "unexpected" } };
      });
      const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
      const identity = createSupabaseIdentity(env, { fetch });
      assert.equal(await identity.providerEnabled("google"), true);
      assert.equal(await identity.providerEnabled("github"), false);
      assert.equal(calls.filter((item) => item.url.includes("/settings")).length, 1);
      const authorize = new URL(identity.authorizeUrl({
        provider: "google",
        redirectTo: "http://127.0.0.1:9/console/auth/callback",
        codeChallenge: "challenge",
      }));
      assert.equal(`${authorize.origin}${authorize.pathname}`, "https://project.supabase.co/auth/v1/authorize");
      assert.equal(authorize.searchParams.get("provider"), "google");
      assert.equal(authorize.searchParams.get("redirect_to"), "http://127.0.0.1:9/console/auth/callback");
      assert.equal(authorize.searchParams.get("code_challenge"), "challenge");
      assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
      assert.equal(authorize.searchParams.get("apikey"), "sb_publishable_test");
      const tokens = await identity.exchangeCode({ code: "code-1", codeVerifier: "verifier-1" });
      assert.equal(tokens.accessToken, "access");
      assert.equal(tokens.refreshToken, "refresh");
      assert.equal(tokens.expiresIn, 10);
      const user = await identity.getUser(tokens.accessToken);
      assert.equal(user.id, "user-1");
      assert.equal((await identity.profile(tokens.accessToken)).display_name, "Ada Lovelace");
      assert.equal((await identity.myTenants(tokens.accessToken))[0].name, "Personal");
      assert.equal(await identity.createTenant(tokens.accessToken, "team", "Acme"), "tenant-1");
      assert.equal(await identity.createInvite(tokens.accessToken, "tenant-1", "grace@example.com", "member"), "invite-token");
      assert.equal(await identity.acceptInvite(tokens.accessToken, "invite-token"), "tenant-1");
      const refreshed = await identity.refresh("refresh");
      assert.equal(refreshed.accessToken, "access-2");
      assert.equal(calls.every((item) => new URL(item.url).hostname === "project.supabase.co"), true);
    });

    await t.test("a rejected token exchange and an unverified user do not become a session", async () => {
      const denied = createSupabaseIdentity({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }, {
        fetch: async () => ({
          ok: false,
          status: 400,
          async text() { return JSON.stringify({ error_description: "bad code" }); },
        }),
      });
      await assert.rejects(
        () => denied.exchangeCode({ code: "x", codeVerifier: "y" }),
        (error) => error instanceof IdentityError && error.code === "upstream",
      );
      const empty = createSupabaseIdentity({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }, {
        fetch: async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ id: "" }); } }),
      });
      await assert.rejects(() => empty.getUser("access"), (error) => error instanceof IdentityError && error.code === "unverified");
      const down = createSupabaseIdentity({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }, { fetch: async () => { throw new Error("no route"); } });
      await assert.rejects(() => down.providerEnabled("google"), (error) => error instanceof IdentityError && /could not be reached/.test(error.message));
    });

    await t.test("fake mode wins over a supabase URL and does not call fetch", async () => {
      let called = false;
      const identity = createIdentity({
        SEDERUNT_AUTH_FAKE: "1",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }, { fetch: async () => { called = true; throw new Error("fetch"); } });
      assert.equal(await identity.providerEnabled("google"), true);
      assert.equal(await identity.providerEnabled("github"), false);
      assert.equal(typeof identity.issueConsentCode, "function");
      assert.equal(called, false);
    });

    await t.test("github is hidden on the sign-in page when the provider is off", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_MEMBER: "Mina" };
      await withServer(env, async (port) => {
        const page = await call(port, "GET", "/console/sign-in");
        assert.equal(page.status, 200);
        assert.match(page.raw, /Continue with Google/);
        assert.match(page.raw, /id="auth-google" href="\/console\/auth\/google\?next=/);
        assert.doesNotMatch(page.raw, /Continue with GitHub/);
        assert.doesNotMatch(page.raw, /id="auth-github"/);
        assert.doesNotMatch(page.raw, /id="sign-pass"/);
        assert.doesNotMatch(page.raw, /Sign-in is not set up on this server/);
        const github = await call(port, "GET", "/console/auth/github?next=/console/history");
        assert.equal(github.status, 404);
        assert.equal(github.location, "");
        assert.doesNotMatch(github.raw, /Continue with GitHub/);
        const home = await call(port, "GET", "/console");
        assert.equal(home.status, 302);
        assert.match(home.location, /^\/console\/sign-in\?next=/);
        const slack = await call(port, "POST", "/api/slack", { body: "{}" });
        assert.equal(slack.status, 200);
        assert.equal(slack.location, "");
      });
    });

    await t.test("github stays hidden even when the fake provider is on", async () => {
      const env = {
        SEDERUNT_AUTH_FAKE: "1",
        SEDERUNT_AUTH_FAKE_GITHUB: "1",
        SEDERUNT_SESSION_SECRET: SECRET,
        SEDERUNT_MEMBER: "Mina",
      };
      await withServer(env, async (port) => {
        const page = await call(port, "GET", "/console/sign-in");
        assert.equal(page.status, 200);
        assert.match(page.raw, /Continue with Google/);
        assert.doesNotMatch(page.raw, /Continue with GitHub/);
        assert.doesNotMatch(page.raw, /id="auth-github"/);
      });
    });

    await t.test("callback errors render a notice and do not echo markup", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port) => {
        const cancelled = await call(port, "GET", "/console/auth/callback?error=access_denied&error_description=The+user+cancelled");
        assert.equal(cancelled.status, 200);
        assert.match(cancelled.raw, /Sign-in was cancelled/);
        assert.doesNotMatch(cancelled.raw, /sederunt_session=/);
        const messy = await call(port, "GET", `/console/auth/callback?error=server_error&error_description=${encodeURIComponent("<script>alert(1)</script>")}`);
        assert.equal(messy.status, 200);
        assert.match(messy.raw, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.doesNotMatch(messy.raw, /<script>alert/);
      });
    });

    await t.test("the server verifies the access token before it seals a session", async () => {
      const seen = [];
      const calls = [];
      let acceptUser = false;
      const identity = {
        async providerEnabled(provider) {
          calls.push(`enabled:${provider}`);
          if (provider === "github") return false;
          return true;
        },
        authorizeUrl(input) {
          seen.push(input);
          return "http://127.0.0.1/auth/v1/authorize?provider=google";
        },
        async exchangeCode() {
          calls.push("exchange");
          return { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() + 60_000, user: { id: "evil" } };
        },
        async getUser() {
          calls.push("user");
          if (!acceptUser) return null;
          return { id: "user-1", email: "ada@example.com", app_metadata: { provider: "google" }, user_metadata: { full_name: "From Token" } };
        },
        async profile() {
          calls.push("profile");
          return { display_name: "From Profile" };
        },
      };
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port) => {
        const start = await call(port, "GET", "/console/auth/google?next=/console/history");
        assert.equal(start.status, 302);
        assert.equal(start.location, "http://127.0.0.1/auth/v1/authorize?provider=google");
        assert.match(String(start.cookie), /sederunt_oauth=/);
        assert.match(String(start.cookie), /HttpOnly/);
        assert.match(String(start.cookie), /SameSite=Lax/);
        assert.equal(seen[0].provider, "google");
        assert.match(seen[0].redirectTo, /\/console\/auth\/callback$/);
        assert.equal(seen[0].codeChallenge, codeChallengeFor(verifierFrom(start.cookie)));
        const jar = absorb({}, start.cookie);
        const rejected = await call(port, "GET", "/console/auth/callback?code=abc", { cookie: header(jar) });
        assert.equal(rejected.status, 200);
        assert.match(rejected.raw, /Sign-in didn't complete/);
        assert.equal(cookieValue(rejected.cookie, "sederunt_session"), "");
        assert.deepEqual(calls.filter((item) => item === "exchange" || item === "user"), ["exchange", "user"]);
        acceptUser = true;
        const again = await call(port, "GET", "/console/auth/google?next=/console/history");
        const jar2 = absorb({}, again.cookie);
        const done = await call(port, "GET", "/console/auth/callback?code=abc", { cookie: header(jar2) });
        assert.equal(done.status, 302);
        assert.equal(done.location, "/console/history");
        const sealed = decodeURIComponent(cookieValue(done.cookie, "sederunt_session"));
        const opened = openSession(sealed, SECRET);
        assert.equal(opened.ok, true);
        assert.equal(opened.memberId, "user-1");
        assert.equal(opened.name, "From Profile");
        assert.notEqual(opened.memberId, "evil");
        const off = await call(port, "GET", "/console/auth/github");
        assert.equal(off.status, 404);
        assert.equal(off.location, "");
        assert.doesNotMatch(off.raw, /Continue with GitHub/);
        identity.providerEnabled = async () => { throw new Error("settings down"); };
        const checked = await call(port, "GET", "/console/auth/google");
        assert.equal(checked.status, 200);
        assert.match(checked.raw, /Sign-in couldn't be checked/);
      }, identity);
    });

    await t.test("fake mode signs Ada in, refreshes, and keeps tenancy on this process", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_MEMBER: "Mina" };
      const identity = createIdentity(env);
      const before = fetchCalls;
      await withServer(env, async (port) => {
        const jar = {};
        const done = await followProvider(port, jar, "google", "/console/history");
        assert.equal(done.location, "/console/history");
        assert.match(cookieList(done.cookie).join("\n"), /sederunt_session=/);
        assert.match(cookieList(done.cookie).join("\n"), /HttpOnly/);
        assert.match(cookieList(done.cookie).join("\n"), /SameSite=Lax/);
        const welcome = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(welcome.status, 302);
        assert.equal(welcome.location, "/console/welcome");
        const home = await call(port, "GET", "/console/history", { cookie: header(jar) });
        assert.equal(home.status, 200);
        assert.match(home.raw, /id="account-name">Ada Lovelace</);
        assert.match(home.raw, /Sign out/);
        const opened = openSession(decodeURIComponent(jar.sederunt_session), SECRET);
        assert.equal(opened.ok, true);
        assert.equal(opened.email, "ada@example.com");
        const tenants = await identity.myTenants(opened.accessToken);
        assert.equal(tenants.filter((row) => row.kind === "personal").length, 1);
        assert.equal(tenants[0].name, "Personal");
        assert.equal(tenants[0].role, "owner");
        const profile = await identity.profile(opened.accessToken);
        assert.equal(profile.display_name, "Ada Lovelace");
        assert.equal(profile.personal_tenant_id, tenants[0].id);
        await followProvider(port, {}, "google", "/console");
        const again = await identity.myTenants(opened.accessToken);
        assert.equal(again.filter((row) => row.kind === "personal").length, 1);
        const team = await identity.createTenant(opened.accessToken, "team", "Analytical Engines");
        await assert.rejects(() => identity.createInvite(opened.accessToken, tenants[0].id, "grace@example.com", "member"));
        const token = await identity.createInvite(opened.accessToken, team, "grace@example.com", "admin");
        await assert.rejects(() => identity.acceptInvite(opened.accessToken, token), (error) => error instanceof IdentityError && error.code === "forbidden");
        const github = await call(port, "GET", "/console/auth/github");
        assert.equal(github.status, 404);
        const stale = sealSession({ ...opened, accessExp: Date.now() - 1000 }, SECRET);
        const refreshed = await call(port, "GET", "/console", { cookie: `sederunt_session=${encodeURIComponent(stale)}` });
        assert.equal(refreshed.status, 200);
        const renewed = openSession(decodeURIComponent(cookieValue(refreshed.cookie, "sederunt_session")), SECRET);
        assert.equal(renewed.ok, true);
        assert.notEqual(renewed.accessToken, opened.accessToken);
        assert.doesNotMatch(refreshed.raw, new RegExp(renewed.accessToken));
        await assert.rejects(() => identity.refresh(opened.refreshToken));
        assert.equal((await identity.myTenants(renewed.accessToken))[0].kind, "personal");
        const evil = `${stale.slice(0, -1)}${stale.endsWith("a") ? "b" : "a"}`;
        const bounced = await call(port, "GET", "/console", { cookie: `sederunt_session=${encodeURIComponent(evil)}` });
        assert.equal(bounced.status, 302);
        assert.match(bounced.location, /reason=invalid/);
        const out = await call(port, "POST", "/console/sign-out", { cookie: header(jar) });
        assert.equal(out.status, 302);
        assert.equal(out.location, "/console/sign-in");
        absorb(jar, out.cookie);
        assert.equal(jar.sederunt_session, undefined);
      }, identity);
      assert.equal(fetchCalls, before);
    });

    await t.test("a dead refresh sends the reader back to sign-in", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      const identity = createIdentity(env);
      await withServer(env, async (port) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const opened = openSession(decodeURIComponent(jar.sederunt_session), SECRET);
        await identity.refresh(opened.refreshToken);
        const stale = sealSession({ ...opened, accessExp: Date.now() - 1000 }, SECRET);
        const bounced = await call(port, "GET", "/console", { cookie: `sederunt_session=${encodeURIComponent(stale)}` });
        assert.equal(bounced.status, 302);
        assert.match(bounced.location, /reason=expired/);
      }, identity);
    });

    await t.test("OAuth configuration rejects passphrase sign-in", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_CONSOLE_SECRET: PASS };
      await withServer(env, async (port) => {
        const page = await call(port, "GET", "/console/sign-in");
        assert.match(page.raw, /Continue with Google/);
        assert.doesNotMatch(page.raw, /id="sign-pass"/);
        const signed = await call(port, "POST", "/console/sign-in", { body: "name=Mina&passphrase=fixture-passphrase" });
        assert.equal(signed.status, 403);
        assert.equal(cookieValue(signed.cookie, "sederunt_session"), "");
      });
    });

    await t.test("oauth routes stay closed when only a passphrase is configured", async () => {
      await withServer({ SEDERUNT_CONSOLE_SECRET: PASS, SEDERUNT_MEMBER: "Mina" }, async (port) => {
        const page = await call(port, "GET", "/console/sign-in");
        assert.equal(page.status, 200);
        assert.match(page.raw, /Ask your workspace admin for the console passphrase/);
        assert.doesNotMatch(page.raw, /Continue with Google/);
        const auth = await call(port, "GET", "/console/auth/google");
        assert.equal(auth.status, 404);
      });
    });

    assert.equal(outbound.length, 0);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

function scriptedFetch(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const target = typeof url === "string" ? url : url.href;
    const call = {
      url: target,
      method: init.method || "GET",
      headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : null,
      redirect: init.redirect,
    };
    calls.push(call);
    const result = handler(call);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      async text() { return result.body == null ? "" : JSON.stringify(result.body); },
    };
  };
  return { fetch, calls };
}

function verifierFrom(setCookie) {
  const token = decodeURIComponent(cookieValue(setCookie, "sederunt_oauth"));
  const dot = token.lastIndexOf(".");
  const payload = JSON.parse(Buffer.from(token.slice(0, dot), "base64url").toString("utf8"));
  return payload.verifier;
}

async function followProvider(port, jar, provider, next) {
  const start = await call(port, "GET", `/console/auth/${provider}?next=${encodeURIComponent(next)}`, { cookie: header(jar) });
  assert.equal(start.status, 302, start.raw);
  assert.match(start.location, new RegExp(`^/console/auth/fake/${provider}$`));
  absorb(jar, start.cookie);
  const consent = await call(port, "GET", start.location, { cookie: header(jar) });
  assert.equal(consent.status, 302, consent.raw);
  assert.match(consent.location, /^\/console\/auth\/callback\?code=/);
  absorb(jar, consent.cookie);
  const done = await call(port, "GET", consent.location, { cookie: header(jar) });
  assert.equal(done.status, 302, done.raw);
  absorb(jar, done.cookie);
  return done;
}
