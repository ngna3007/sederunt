import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createPersonGoogleStore, FORMS_SCOPES } from "../src/connectors/google-person.js";
import { FORMS_PARTIAL_MESSAGE } from "../src/connectors/forms-preset.js";
import { openSecret } from "../src/connectors/secrets.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 9).toString("base64");
const SECRET = "forms-grants-session-secret";
const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PERSON = "person-ada";
const REFRESH = "fr.google.refresh-plain";
const ACCESS = "ya29.access-plain";
const SERVICE_KEY = "sb_secret_test_only";

function envWith(extra = {}) {
  return {
    MCP_SECRETS_KEY_V1: KEY,
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    ...extra,
  };
}

function jsonResponse(status, body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null; } },
    async text() { return raw; },
    async json() { return typeof body === "string" ? JSON.parse(body || "null") : body; },
  };
}

function createGrantRows() {
  const map = new Map();
  const key = (tenantId, personId, provider = "google") => `${tenantId}\0${personId}\0${provider}`;
  return {
    map,
    async get(tenantId, personId, provider = "google") {
      const row = map.get(key(tenantId, personId, provider));
      if (!row) return null;
      return {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion,
        scopes: [...row.scopes],
      };
    },
    async put(row) {
      map.set(key(row.tenantId, row.personId, row.provider || "google"), {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion,
        scopes: [...(row.scopes || [])],
      });
    },
    async delete(tenantId, personId, provider = "google") {
      map.delete(key(tenantId, personId, provider));
    },
  };
}

function sealedPlain(row) {
  return JSON.parse(openSecret({ ciphertext: row.ciphertext, nonce: row.nonce, keyVersion: row.keyVersion }, envWith()));
}

function leaksToken(buffer, token) {
  return Buffer.from(buffer).includes(Buffer.from(token));
}

test("sealed grants keep no plaintext token and survive a new store", async () => {
  const rows = createGrantRows();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), body: String(init?.body || "") });
    const params = new URLSearchParams(String(init?.body || ""));
    assert.equal(params.get("refresh_token"), REFRESH);
    assert.equal(params.get("scope"), FORMS_SCOPES.join(" "));
    return jsonResponse(200, {
      access_token: "ya29.refreshed",
      refresh_token: "fr.google.rotated",
      expires_in: 3600,
    });
  };
  const env = envWith();
  const store = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  const saved = await store.save(PERSON, {
    refreshToken: REFRESH,
    accessToken: ACCESS,
    expiresAt: Date.now() + 3600_000,
    scopes: [...FORMS_SCOPES],
  }, { tenantId: TENANT });
  assert.equal(saved, true);
  assert.equal(await store.save(PERSON, { refreshToken: REFRESH, scopes: [...FORMS_SCOPES] }), false);
  assert.equal(await store.granted(PERSON, { tenantId: OTHER }), false);

  const row = await rows.get(TENANT, PERSON, "google");
  assert.ok(row);
  assert.equal(leaksToken(row.ciphertext, REFRESH), false);
  assert.equal(leaksToken(row.ciphertext, ACCESS), false);
  assert.equal(leaksToken(row.nonce, REFRESH), false);
  const plain = sealedPlain(row);
  assert.equal(plain.refreshToken, REFRESH);
  assert.equal(plain.accessToken, undefined);
  assert.deepEqual(plain.scopes, [...FORMS_SCOPES]);
  assert.equal(await store.accessToken(PERSON, { tenantId: TENANT }), ACCESS);
  assert.equal(seen.length, 0);

  const restarted = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  assert.equal(await restarted.granted(PERSON, { tenantId: TENANT }), true);
  assert.equal(await restarted.accessToken(PERSON, { tenantId: TENANT }), "ya29.refreshed");
  const rotated = sealedPlain(await rows.get(TENANT, PERSON, "google"));
  assert.equal(rotated.refreshToken, "fr.google.rotated");
  assert.equal(rotated.accessToken, undefined);
  assert.equal(leaksToken((await rows.get(TENANT, PERSON, "google")).ciphertext, "ya29.refreshed"), false);
  assert.equal(leaksToken((await rows.get(TENANT, PERSON, "google")).ciphertext, REFRESH), false);
  assert.equal(leaksToken((await rows.get(TENANT, PERSON, "google")).ciphertext, ACCESS), false);
});

test("a partial grant stays needs-access and a bad refresh keeps the row", async () => {
  const rows = createGrantRows();
  let mode = "down";
  const fetchImpl = async () => {
    if (mode === "invalid") return jsonResponse(400, { error: "invalid_grant", error_description: REFRESH });
    return jsonResponse(500, { error: "backend down", hint: SERVICE_KEY });
  };
  const env = envWith();
  const store = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  await store.save(PERSON, {
    refreshToken: REFRESH,
    scopes: [FORMS_SCOPES[0]],
  }, { tenantId: TENANT });
  const partial = await store.describe(PERSON, { tenantId: TENANT });
  assert.equal(partial.granted, false);
  assert.equal(partial.partial, true);
  const blocked = await store.openAccess(PERSON, { tenantId: TENANT });
  assert.equal(blocked.needsAccess, true);
  assert.equal(blocked.accessToken, "");
  assert.equal(await rows.get(TENANT, PERSON, "google") != null, true);

  await store.save(PERSON, {
    refreshToken: REFRESH,
    accessToken: ACCESS,
    expiresAt: 1,
    scopes: [...FORMS_SCOPES],
  }, { tenantId: TENANT });
  const down = await store.openAccess(PERSON, { tenantId: TENANT });
  assert.equal(down.needsAccess, false);
  assert.equal(down.accessToken, "");
  assert.equal(await store.granted(PERSON, { tenantId: TENANT }), true);

  mode = "invalid";
  const revoked = await store.openAccess(PERSON, { tenantId: TENANT, force: true });
  assert.equal(revoked.needsAccess, true);
  assert.equal(revoked.accessToken, "");
  assert.equal(await rows.get(TENANT, PERSON, "google"), null);
  const restarted = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  assert.equal(await restarted.granted(PERSON, { tenantId: TENANT }), false);
  assert.equal((await restarted.openAccess(PERSON, { tenantId: TENANT })).needsAccess, true);
});

test("supabase grant requests upsert, select, and delete without logging the key", async () => {
  const table = new Map();
  const calls = [];
  const logs = [];
  const originals = ["log", "info", "warn", "error", "debug"].map((name) => [name, console[name]]);
  for (const [name] of originals) {
    console[name] = (...args) => {
      logs.push(args.map((part) => String(part)).join(" "));
    };
  }
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(String(url?.url || url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ href: endpoint.href, method, headers: { ...(init.headers || {}) }, body: init.body });
    if (endpoint.hostname !== "project.supabase.co") return jsonResponse(404, { message: SERVICE_KEY });
    if (!endpoint.pathname.endsWith("/rest/v1/person_google_grants")) return jsonResponse(404, { message: "missing" });
    if (method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      table.set(`${body.tenant_id}|${body.person_id}|${body.provider}`, body);
      return jsonResponse(201, "");
    }
    const tenantId = String(endpoint.searchParams.get("tenant_id") || "").replace(/^eq\./, "");
    const personId = String(endpoint.searchParams.get("person_id") || "").replace(/^eq\./, "");
    const provider = String(endpoint.searchParams.get("provider") || "").replace(/^eq\./, "");
    const id = `${tenantId}|${personId}|${provider}`;
    if (method === "GET") {
      const row = table.get(id);
      return jsonResponse(200, row ? [{
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        key_version: row.key_version,
        scopes: row.scopes,
      }] : []);
    }
    if (method === "DELETE") {
      table.delete(id);
      return jsonResponse(204, "");
    }
    return jsonResponse(405, { message: SERVICE_KEY });
  };
  const env = envWith({
    SEDERUNT_AUTH_FAKE: "1",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: SERVICE_KEY,
  });
  try {
    const store = createPersonGoogleStore({ env, fetchImpl });
    assert.equal(await store.save(PERSON, {
      refreshToken: REFRESH,
      accessToken: ACCESS,
      expiresAt: Date.now() + 3600_000,
      scopes: [...FORMS_SCOPES],
    }, { tenantId: TENANT }), true);
    const post = calls.find((call) => call.method === "POST");
    assert.ok(post);
    const posted = new URL(post.href);
    assert.equal(posted.pathname, "/rest/v1/person_google_grants");
    assert.equal(posted.searchParams.get("on_conflict"), "tenant_id,person_id,provider");
    assert.equal(post.href.includes(SERVICE_KEY), false);
    assert.equal(post.headers.apikey, SERVICE_KEY);
    assert.equal(post.headers.authorization, `Bearer ${SERVICE_KEY}`);
    assert.equal(post.headers.accept, "application/json");
    assert.equal(post.headers["accept-profile"], "public");
    assert.equal(post.headers["content-profile"], "public");
    assert.equal(post.headers.prefer, "resolution=merge-duplicates,return=minimal");
    const body = JSON.parse(post.body);
    assert.equal(body.tenant_id, TENANT);
    assert.equal(body.person_id, PERSON);
    assert.equal(body.provider, "google");
    assert.equal(body.key_version, 1);
    assert.deepEqual(body.scopes, [...FORMS_SCOPES]);
    assert.match(body.ciphertext, /^\\x[0-9a-f]+$/);
    assert.match(body.nonce, /^\\x[0-9a-f]+$/);
    const cipher = Buffer.from(body.ciphertext.slice(2), "hex");
    assert.equal(leaksToken(cipher, REFRESH), false);
    assert.equal(leaksToken(cipher, ACCESS), false);
    assert.equal(JSON.stringify(body).includes(REFRESH), false);
    assert.equal(JSON.stringify(body).includes(ACCESS), false);

    const restarted = createPersonGoogleStore({ env, fetchImpl });
    assert.equal(await restarted.granted(PERSON, { tenantId: TENANT }), true);
    const select = calls.find((call) => call.method === "GET");
    assert.ok(select);
    const selected = new URL(select.href);
    assert.equal(selected.searchParams.get("select"), "ciphertext,nonce,key_version,scopes");
    assert.equal(selected.searchParams.get("tenant_id"), `eq.${TENANT}`);
    assert.equal(selected.searchParams.get("person_id"), `eq.${PERSON}`);
    assert.equal(selected.searchParams.get("provider"), "eq.google");
    assert.equal(select.href.includes(SERVICE_KEY), false);

    const tokenFetch = async (url, init) => {
      const href = String(url?.url || url);
      if (href.startsWith("https://project.supabase.co")) return fetchImpl(url, init);
      if (href === "https://oauth2.googleapis.com/token") return jsonResponse(400, { error: "invalid_grant" });
      throw new Error("unexpected token host");
    };
    const refreshing = createPersonGoogleStore({ env, fetchImpl: tokenFetch });
    const revoked = await refreshing.openAccess(PERSON, { tenantId: TENANT });
    assert.equal(revoked.needsAccess, true);
    const deleted = calls.find((call) => call.method === "DELETE");
    assert.ok(deleted);
    assert.equal(new URL(deleted.href).searchParams.get("tenant_id"), `eq.${TENANT}`);
    assert.equal(await restarted.granted(PERSON, { tenantId: TENANT }), false);

    calls.length = 0;
    const broken = async () => jsonResponse(500, { message: `db down ${SERVICE_KEY}`, refresh: REFRESH });
    const failing = createPersonGoogleStore({ env, fetchImpl: broken });
    await assert.rejects(
      () => failing.save(PERSON, { refreshToken: REFRESH, scopes: [...FORMS_SCOPES] }, { tenantId: TENANT }),
      (error) => {
        assert.equal(error.message, "The grant store could not be reached.");
        assert.equal(String(error).includes(SERVICE_KEY), false);
        assert.equal(String(error).includes(REFRESH), false);
        assert.equal(String(error).includes("db down"), false);
        return true;
      },
    );
    assert.equal(await failing.save("ada", { refreshToken: REFRESH, scopes: [...FORMS_SCOPES] }, { tenantId: "local" }), false);
  } finally {
    for (const [name, fn] of originals) console[name] = fn;
  }
  assert.equal(logs.some((line) => line.includes(SERVICE_KEY) || line.includes(REFRESH) || line.includes(ACCESS)), false);
});

test("in-memory grants are used when Supabase is not configured", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("network");
  };
  const env = envWith({ SEDERUNT_AUTH_FAKE: "1" });
  const store = createPersonGoogleStore({ env, fetchImpl });
  assert.equal(await store.save(PERSON, {
    refreshToken: REFRESH,
    scopes: [...FORMS_SCOPES],
  }, { tenantId: "local" }), true);
  assert.equal(called, false);
  assert.equal(await store.granted(PERSON, { tenantId: "local" }), true);
  const other = createPersonGoogleStore({ env, fetchImpl });
  assert.equal(await other.granted(PERSON, { tenantId: "local" }), false);
});

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        accept: headers.accept || "application/json",
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        raw: Buffer.concat(chunks).toString("utf8"),
        headers: res.headers,
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json(response) {
  return JSON.parse(response.raw);
}

function storeCookies(jar, headers) {
  const raw = headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    const pair = String(line).split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (!value) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function followAuth(port, startPath) {
  const jar = new Map();
  let path = startPath;
  for (let hop = 0; hop < 8; hop += 1) {
    const response = await call(port, "GET", path, null, {
      accept: "text/html",
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    });
    storeCookies(jar, response.headers);
    if (response.status !== 302 && response.status !== 303) return { response, jar, path };
    const location = response.headers.location || "";
    assert.equal(location.startsWith("http"), false, location);
    path = location;
  }
  throw new Error("too many auth redirects");
}

function appEnv(extra = {}) {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_FORMS_FAKE: "0",
    SEDERUNT_MCP_FAKE: "0",
    SEDERUNT_PUBLIC_ORIGIN: "http://127.0.0.1:9",
    SEDERUNT_MEMBER: "mina",
    SEDERUNT_SESSION_SECRET: SECRET,
    MCP_SECRETS_KEY_V1: KEY,
    ...extra,
  };
}

test("forms consent stores the grant and a partial scope stays needs_access", async (t) => {
  const rows = createGrantRows();
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    throw new Error("unexpected fetch");
  };
  const env = appEnv();
  const grants = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    fetch: fetchImpl,
    googleGrants: grants,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const signedOut = await followAuth(port, "/console/auth/google?next=/console/connectors");
  const before = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(signedOut.jar) }));
  assert.equal(before.presets["google-forms"].state, "needs_access");
  assert.equal(before.presets["google-forms"].message, undefined);
  assert.equal(rows.map.size, 0);

  const granted = await followAuth(port, "/console/auth/google?intent=forms&next=/console/connectors");
  assert.equal(granted.path, "/console/connectors");
  const sessionCookie = [...granted.jar.entries()].find(([name]) => name === "sederunt_session");
  const sessionPayload = JSON.parse(Buffer.from(decodeURIComponent(sessionCookie[1]).split(".")[0], "base64url").toString("utf8"));
  assert.equal(JSON.stringify(sessionPayload).includes("fr.google"), false);
  assert.equal(JSON.stringify(sessionPayload).includes("fa.google"), false);
  assert.equal(rows.map.size, 1);
  const row = [...rows.map.values()][0];
  assert.equal(leaksToken(row.ciphertext, "fr.google"), false);
  assert.equal(leaksToken(row.ciphertext, "fa.google"), false);
  const plain = JSON.parse(openSecret({ ciphertext: row.ciphertext, nonce: row.nonce }, env));
  assert.match(plain.refreshToken, /^fr\.google\./);
  assert.equal(plain.accessToken, undefined);
  assert.deepEqual(plain.scopes, [...FORMS_SCOPES]);

  const [tenantId, personId] = [...rows.map.keys()][0].split("\0");
  const restarted = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  assert.equal(await restarted.granted(personId, { tenantId }), true);

  const ready = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(granted.jar) }));
  assert.equal(ready.presets["google-forms"].state, "add");
  const added = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}, { cookie: cookieHeader(granted.jar) }));
  assert.equal(added.ok, true);
  assert.equal(added.connector.url, "builtin:google-forms");
  assert.equal(JSON.stringify(added).includes("fr.google"), false);
  assert.equal(seen.some((url) => /127\.0\.0\.1|localhost|\[::1\]|\/mcp\/forms/.test(url)), false);

  const partialRows = createGrantRows();
  const partialEnv = appEnv({ SEDERUNT_AUTH_FAKE_SCOPE: "openid" });
  const partialGrants = createPersonGoogleStore({ env: partialEnv, fetchImpl, grantRows: partialRows });
  const partialApp = createApp({
    session: createSession(),
    companyLoaded: true,
    env: partialEnv,
    fetch: fetchImpl,
    googleGrants: partialGrants,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
  const partialPort = await listen(partialApp);
  t.after(() => partialApp.close());
  const declined = await followAuth(partialPort, "/console/auth/google?intent=forms&next=/console/connectors");
  assert.equal(declined.path, "/console/connectors");
  const declinedPage = json(await call(partialPort, "GET", "/console/connectors", null, { cookie: cookieHeader(declined.jar) }));
  assert.equal(declinedPage.presets["google-forms"].state, "needs_access");
  assert.equal(declinedPage.presets["google-forms"].message, FORMS_PARTIAL_MESSAGE);
  const refused = json(await call(partialPort, "POST", "/console/connectors/presets/google-forms", {}, { cookie: cookieHeader(declined.jar) }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "needs_access");
  assert.equal(refused.detail, FORMS_PARTIAL_MESSAGE);
  assert.equal(declinedPage.connectors.length, 0);
  assert.equal(partialRows.map.size, 1);
  const partialPlain = JSON.parse(openSecret({
    ciphertext: [...partialRows.map.values()][0].ciphertext,
    nonce: [...partialRows.map.values()][0].nonce,
  }, partialEnv));
  assert.deepEqual(partialPlain.scopes, ["openid"]);
});

test("invalid_grant clears the forms grant and the tool reports needs_access", async (t) => {
  const rows = createGrantRows();
  const seen = [];
  const fetchImpl = async (url, init) => {
    const href = String(url?.url || url);
    seen.push(href);
    if (href.startsWith("https://forms.googleapis.com/")) {
      return jsonResponse(401, { error: { message: "expired" } });
    }
    if (href === "https://oauth2.googleapis.com/token") {
      const params = new URLSearchParams(String(init?.body || ""));
      assert.match(params.get("refresh_token") || "", /^fr\.google\./);
      return jsonResponse(400, { error: "invalid_grant" });
    }
    throw new Error(`unexpected ${href}`);
  };
  const env = appEnv({
    SEDERUNT_FORMS_FAKE: "0",
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  });
  const grants = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    fetch: fetchImpl,
    googleGrants: grants,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const granted = await followAuth(port, "/console/auth/google?intent=forms&next=/console/connectors");
  const added = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}, { cookie: cookieHeader(granted.jar) }));
  assert.equal(added.ok, true);
  const [tenantId, personId] = [...rows.map.keys()][0].split("\0");
  const called = json(await call(port, "POST", "/mcp", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "google-forms__get_form", arguments: { formId: "Form_1" } },
  }, { cookie: cookieHeader(granted.jar) }));
  assert.equal(called.result.isError, true);
  assert.equal(called.result.structuredContent.code, "needs_access");
  assert.match(called.result.structuredContent.message, /sign in again/);
  assert.match(called.result.content[0].text, /sign in again/);
  assert.equal(JSON.stringify(called).includes("fr.google"), false);
  assert.equal(JSON.stringify(called).includes("ya29."), false);
  assert.equal(rows.map.size, 0);
  assert.equal(seen.some((url) => /127\.0\.0\.1|localhost|\/mcp\/forms/.test(url)), false);
  assert.equal(seen.some((url) => url.startsWith("https://forms.googleapis.com/")), true);
  assert.equal(seen.some((url) => url === "https://oauth2.googleapis.com/token"), true);
  const restarted = createPersonGoogleStore({ env, fetchImpl, grantRows: rows });
  assert.equal(await restarted.granted(personId, { tenantId }), false);
  assert.equal((await restarted.openAccess(personId, { tenantId })).needsAccess, true);
});
