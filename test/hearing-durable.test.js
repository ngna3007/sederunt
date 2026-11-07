import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createBotPreferenceStore } from "../src/bot/preferences-supabase.js";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { createApp } from "../src/server.js";

const SECRET = "hearing-durable-session-secret";
const SERVICE_KEY = "sb_secret_hearing_durable_test";
const NORTHLINE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function appEnv() {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    SEDERUNT_MEMBER: "mina",
  };
}

function identityFor() {
  const byToken = {
    "access-owner": [
      { id: PERSONAL, name: "Personal", kind: "personal", role: "owner" },
      { id: NORTHLINE, name: "Northline", kind: "company", role: "owner" },
    ],
    "access-personal": [
      { id: PERSONAL, name: "Personal", kind: "personal", role: "owner" },
    ],
    "access-member": [
      { id: NORTHLINE, name: "Northline", kind: "company", role: "member" },
    ],
  };
  return {
    async myTenants(token) {
      return (byToken[token] || []).map((row) => ({ ...row }));
    },
    async getUser() {
      return { user_metadata: {} };
    },
    async profile() {
      return null;
    },
    async updateUser() {},
  };
}

function cookie({ userId, tenantId, accessToken }) {
  const token = sealSession({
    kind: "oauth",
    memberId: userId,
    userId,
    name: userId,
    email: `${userId}@example.test`,
    exp: Date.now() + 3_600_000,
    accessToken,
    refreshToken: `refresh-${userId}`,
    accessExp: Date.now() + 3_600_000,
    tenantId,
    onboarded: true,
    provider: "google",
  }, SECRET);
  return `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`;
}

const ownerCookie = cookie({ userId: "user-owner", tenantId: NORTHLINE, accessToken: "access-owner" });
const personalCookie = cookie({ userId: "user-personal", tenantId: PERSONAL, accessToken: "access-personal" });
const memberCookie = cookie({ userId: "user-member", tenantId: NORTHLINE, accessToken: "access-member" });

function storeEnv() {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: SERVICE_KEY,
  };
}

function jsonResponse(status, body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return raw; },
  };
}

/**
 * In-memory PostgREST for public.bot_preferences. Two stores share one table.
 */
function createFakeRest() {
  const rows = [];
  const calls = [];
  let seq = 1;
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(String(url?.url || url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ href: endpoint.href, method, headers: { ...(init.headers || {}) } });
    if (!endpoint.pathname.endsWith("/rest/v1/bot_preferences")) {
      return jsonResponse(404, { message: "missing" });
    }
    const tenant = eq(endpoint, "tenant_id");
    const pref = eq(endpoint, "pref_key");
    const userFilter = endpoint.searchParams.get("user_id") || "";
    const matches = (row) => {
      if (tenant && row.tenant_id !== tenant) return false;
      if (pref && row.pref_key !== pref) return false;
      if (userFilter === "is.null") return row.user_id == null;
      if (userFilter.startsWith("eq.")) return row.user_id === userFilter.slice(3);
      return true;
    };
    if (method === "GET") return jsonResponse(200, rows.filter(matches).map(publicRow));
    if (method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      const hit = rows.filter(matches);
      for (const row of hit) {
        if (body.pref_value !== undefined) row.pref_value = body.pref_value;
      }
      return jsonResponse(200, hit.map(publicRow));
    }
    if (method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      const duplicate = rows.some((row) => row.tenant_id === body.tenant_id
        && row.pref_key === body.pref_key
        && (row.user_id || null) === (body.user_id || null));
      if (duplicate) return jsonResponse(409, { message: "duplicate", pref_key: body.pref_key });
      const created = {
        id: `row-${seq}`,
        tenant_id: body.tenant_id,
        user_id: body.user_id ?? null,
        pref_key: body.pref_key,
        pref_value: body.pref_value,
      };
      seq += 1;
      rows.push(created);
      return jsonResponse(201, [publicRow(created)]);
    }
    if (method === "DELETE") {
      const hit = rows.filter(matches);
      for (const row of hit) rows.splice(rows.indexOf(row), 1);
      return jsonResponse(200, hit.map(publicRow));
    }
    return jsonResponse(405, { message: "no" });
  };
  return { fetchImpl, rows, calls };
}

function eq(endpoint, name) {
  const raw = endpoint.searchParams.get(name) || "";
  return raw.startsWith("eq.") ? raw.slice(3) : "";
}

function publicRow(row) {
  return {
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    pref_key: row.pref_key,
    pref_value: row.pref_value,
  };
}

function freshStore(fetchImpl) {
  return createBotPreferenceStore(storeEnv(), { fetch: fetchImpl });
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { json, cookie: cookieHeader } = {}) {
  const payload = json ? JSON.stringify(json) : null;
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try { body = JSON.parse(raw); } catch { /* html */ }
        resolve({ status: res.statusCode, raw, json: body, location: res.headers.location || "" });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function hearingName(html) {
  const tag = html.match(/<input id="hearing-name"[^>]*>/);
  assert.ok(tag, "hearing name input missing");
  const value = tag[0].match(/\bvalue="([^"]*)"/);
  assert.ok(value, tag[0]);
  return value[1];
}

function hearingTriggers(html) {
  const tag = html.match(/<textarea id="hearing-triggers"[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(tag, "hearing triggers missing");
  return tag[1];
}

async function withApp(store, fn) {
  const app = createApp({
    companyLoaded: true,
    env: appEnv(),
    identity: identityFor(),
    botPreferences: store,
  });
  const port = await listen(app);
  try {
    await fn(port);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
}

test("a saved meeting guest survives a new isolate and stays on its tenant", async () => {
  const fake = createFakeRest();
  const first = freshStore(fake.fetchImpl);
  await withApp(first, async (port) => {
    const setup = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(setup.status, 200, setup.location || setup.raw.slice(0, 180));
    assert.equal(hearingName(setup.raw), "Adam");
    assert.equal(hearingTriggers(setup.raw), "");
    const open = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(open.status, 200);
    assert.equal(open.json.hearing.name, "Adam");
    assert.deepEqual(open.json.hearing.triggers, []);

    const saved = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Adam", triggers: "Hey Adam" },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.hearing.name, "Adam");
    assert.deepEqual(saved.json.hearing.triggers, ["Hey Adam"]);
  });
  assert.ok(fake.rows.some((row) => row.tenant_id === NORTHLINE && row.pref_key === "meeting_guest" && row.pref_value.includes("Hey Adam")));

  const second = freshStore(fake.fetchImpl);
  assert.notEqual(second, first);
  await withApp(second, async (port) => {
    const setup = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(setup.status, 200);
    assert.equal(hearingName(setup.raw), "Adam");
    assert.equal(hearingTriggers(setup.raw), "Hey Adam");
    const payload = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(payload.json.hearing.name, "Adam");
    assert.deepEqual(payload.json.hearing.triggers, ["Hey Adam"]);

    const personalPage = await call(port, "GET", "/console/setup", { cookie: personalCookie });
    assert.equal(personalPage.status, 200);
    assert.equal(hearingName(personalPage.raw), "Adam");
    assert.equal(hearingTriggers(personalPage.raw), "");
    const personalPayload = await call(port, "GET", "/api/console", { cookie: personalCookie });
    assert.equal(personalPayload.json.hearing.name, "Adam");
    assert.deepEqual(personalPayload.json.hearing.triggers, []);

    const nina = await call(port, "POST", "/api/hearing", {
      cookie: personalCookie,
      json: { name: "Nina", triggers: "Hey Nina" },
    });
    assert.equal(nina.status, 200);
    assert.equal(nina.json.hearing.name, "Nina");
    assert.deepEqual(nina.json.hearing.triggers, ["Hey Nina"]);
    const north = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(north.json.hearing.name, "Adam");
    assert.deepEqual(north.json.hearing.triggers, ["Hey Adam"]);
    const personalSaved = await call(port, "GET", "/console/setup", { cookie: personalCookie });
    assert.equal(hearingName(personalSaved.raw), "Nina");
    assert.equal(hearingTriggers(personalSaved.raw), "Hey Nina");
  });

  const third = freshStore(fake.fetchImpl);
  await withApp(third, async (port) => {
    const northPage = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(northPage.raw), "Adam");
    assert.equal(hearingTriggers(northPage.raw), "Hey Adam");
    const north = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(north.json.hearing.name, "Adam");
    assert.deepEqual(north.json.hearing.triggers, ["Hey Adam"]);
    const personalPage = await call(port, "GET", "/console/setup", { cookie: personalCookie });
    assert.equal(hearingName(personalPage.raw), "Nina");
    assert.equal(hearingTriggers(personalPage.raw), "Hey Nina");
    const personal = await call(port, "GET", "/api/console", { cookie: personalCookie });
    assert.equal(personal.json.hearing.name, "Nina");
    assert.deepEqual(personal.json.hearing.triggers, ["Hey Nina"]);

    const before = fake.calls.length;
    const denied = await call(port, "POST", "/api/hearing", {
      cookie: memberCookie,
      json: { name: "Quinn", triggers: "Hey Quinn" },
    });
    assert.equal(denied.status, 403);
    assert.equal(fake.calls.length, before);
    const still = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(still.json.hearing.name, "Adam");
    assert.deepEqual(still.json.hearing.triggers, ["Hey Adam"]);
    const listed = await third.list({ tenantId: NORTHLINE });
    assert.equal(listed.some((row) => String(row.value).includes("Quinn")), false);
  });
});

test("bot settings survive a new isolate and rename the unsaved meeting guest", async () => {
  const fake = createFakeRest();
  const first = freshStore(fake.fetchImpl);
  await withApp(first, async (port) => {
    const saved = await call(port, "POST", "/api/bot", {
      cookie: ownerCookie,
      json: { name: "Mai", phrases: ["Hey Mai", "Mai"] },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.name, "Mai");
  });
  assert.ok(fake.rows.some((row) => row.tenant_id === NORTHLINE && row.pref_key === "bot_name" && row.pref_value === "Mai"));

  const second = freshStore(fake.fetchImpl);
  await withApp(second, async (port) => {
    const bot = await call(port, "GET", "/api/bot", { cookie: ownerCookie });
    assert.equal(bot.status, 200);
    assert.equal(bot.json.name, "Mai");
    const setup = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(setup.raw), "Mai");
    assert.equal(hearingTriggers(setup.raw), "");
    const payload = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(payload.json.hearing.name, "Mai");
    assert.deepEqual(payload.json.hearing.triggers, []);
    const personal = await call(port, "GET", "/api/console", { cookie: personalCookie });
    assert.equal(personal.json.hearing.name, "Adam");
  });
});
