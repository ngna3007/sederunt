import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/server.js";
import { guardConsole, openSession, readCookie, sealSession } from "../src/console-auth.js";
import { renderSignInPage } from "../src/console-sign-in.js";
import { sealPending } from "../src/identity/pending.js";
import { refreshOAuthSession } from "../src/identity/session.js";
import { providerFromUser, resolveSignInProviders } from "../src/identity/shared.js";

const SECRET = "google-only-auth-fixture";
const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };

async function listen(t, app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => app.close());
  return `http://127.0.0.1:${app.address().port}`;
}

function requestWithSession(fields) {
  return { headers: { cookie: `other=retained; sederunt_session=${sealSession(fields, SECRET)}` } };
}

const googleSession = () => ({ kind: "oauth", memberId: "person", userId: "person", provider: "google", accessToken: "fixture-access", refreshToken: "fixture-refresh", accessExp: Date.now() + 3600000 });

test("member sign-in offers Google without passphrase or GitHub even when configured", async () => {
  const calls = [];
  const providers = await resolveSignInProviders({ async providerEnabled(provider) { calls.push(provider); return true; } });
  assert.deepEqual(providers, { google: true, github: false });
  assert.deepEqual(calls, ["google"]);
  const html = renderSignInPage({ configured: true, oauth: true, providers: { google: true, github: true } });
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /Continue with GitHub|Use a passphrase|id="sign-pass"/);
  assert.deepEqual(await resolveSignInProviders({ async providerEnabled() { throw Error("settings unavailable"); } }), { google: false, github: false });
});

test("verified user provider provenance never comes from email or a linked identity", () => {
  assert.equal(providerFromUser({ app_metadata: { provider: "google" } }), "google");
  for (const user of [null, {}, { email: "person@gmail.com" }, { identities: [{ provider: "google" }] }, { app_metadata: { provider: "github" }, identities: [{ provider: "google" }] }]) {
    assert.equal(providerFromUser(user), "");
  }
});

test("direct GitHub authorization routes are rejected and Google starts without feature scopes", async (t) => {
  const base = await listen(t, createApp({ env, files: false, deps: { memory: null } }));
  for (const path of ["/console/auth/github", "/console/auth/fake/github"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("location"), null);
  }
  const google = await fetch(base + "/console/auth/google", { redirect: "manual" });
  assert.equal(google.status, 302);
  const destination = new URL(google.headers.get("location"), base);
  assert.equal(destination.pathname, "/console/auth/fake/google");
  assert.equal(destination.searchParams.has("scope"), false);
});

test("a legacy GitHub pending callback cannot exchange a code", async (t) => {
  let exchanged = 0;
  const identity = { async exchangeCode() { exchanged++; throw Error("must not exchange"); }, async providerEnabled() { return true; } };
  const base = await listen(t, createApp({ env, identity, files: false, deps: { memory: null } }));
  const pending = sealPending({ provider: "github", next: "/console", verifier: "fixture", challenge: "fixture" }, SECRET);
  const response = await fetch(base + "/console/auth/callback?code=fixture", { headers: { cookie: `sederunt_oauth=${pending}` }, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(exchanged, 0);
  assert.match(response.headers.get("set-cookie"), /sederunt_oauth=;/);
});

test("legacy unknown, GitHub and passphrase sessions are cleared before using unexpired tokens", async () => {
  let refreshed = 0;
  const identity = { async refresh() { refreshed++; } };
  for (const fields of [{ ...googleSession(), provider: "" }, { ...googleSession(), provider: "github" }, { memberId: "person" }]) {
    const req = requestWithSession(fields);
    const cookie = await refreshOAuthSession(req, identity, env);
    assert.match(cookie, /sederunt_session=;/);
    assert.equal(guardConsole(req, env).session, null);
    assert.equal(readCookie(req.headers.cookie, "other"), "retained");
  }
  assert.equal(refreshed, 0);
  const valid = requestWithSession(googleSession());
  assert.equal(await refreshOAuthSession(valid, identity, env), "");
  assert.equal(guardConsole(valid, env).session.userId, "person");
});

test("refresh accepts the same verified Google person and rejects provider or user substitution", async () => {
  for (const user of [{ id: "person", app_metadata: { provider: "google" } }, { id: "person", app_metadata: { provider: "github" } }, { id: "person", email: "person@gmail.com" }, { id: "other", app_metadata: { provider: "google" } }]) {
    const req = requestWithSession({ ...googleSession(), accessExp: 0 });
    const identity = {
      async refresh() { return { accessToken: "refreshed-fixture", refreshToken: "refresh-fixture", expiresAt: Date.now() + 3600000 }; },
      async getUser() { return user; },
      async profile() { return {}; },
    };
    const cookie = await refreshOAuthSession(req, identity, env);
    assert.ok(cookie);
    const session = guardConsole(req, env).session;
    if (user.id === "person" && user.app_metadata?.provider === "google") {
      assert.equal(session.provider, "google");
      assert.equal(session.accessToken, "refreshed-fixture");
    } else assert.equal(session, null);
  }
});


test("Google callback rejects verified non-Google user records before issuing a session", async (t) => {
  const identity = {
    async providerEnabled() { return true; },
    async exchangeCode() { return { accessToken: "fixture-access" }; },
    async getUser() { return { id: "person", app_metadata: { provider: "github" }, identities: [{ provider: "google" }] }; },
  };
  const base = await listen(t, createApp({ env, identity, files: false, deps: { memory: null } }));
  const pending = sealPending({ provider: "google", next: "/console", verifier: "fixture", challenge: "fixture" }, SECRET);
  const response = await fetch(base + "/console/auth/callback?code=fixture", { headers: { cookie: `sederunt_oauth=${pending}` }, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get("set-cookie") || "", /sederunt_session=/);
  assert.match(await response.text(), /Sign-in didn't complete/);
});

test("fake Google consent completes with a verified Google session", async (t) => {
  const base = await listen(t, createApp({ env, files: false, deps: { memory: null } }));
  const start = await fetch(base + "/console/auth/google", { redirect: "manual" });
  const pendingCookie = start.headers.getSetCookie()[0].split(";")[0];
  const consent = await fetch(new URL(start.headers.get("location"), base), { headers: { cookie: pendingCookie }, redirect: "manual" });
  assert.equal(consent.status, 302);
  const callback = await fetch(new URL(consent.headers.get("location"), base), { headers: { cookie: pendingCookie }, redirect: "manual" });
  assert.equal(callback.status, 302);
  const sessionCookie = callback.headers.getSetCookie().find(cookie => cookie.startsWith("sederunt_session="));
  const session = openSession(readCookie(sessionCookie, "sederunt_session"), SECRET);
  assert.equal(session.ok, true);
  assert.equal(session.provider, "google");
  assert.ok(session.userId);
});
