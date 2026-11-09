import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createBotPreferenceStore } from "../src/bot/preferences-supabase.js";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { createApp } from "../src/server.js";

const SECRET = "hearing-durable-session-secret";
const RECALL_SECRET = `whsec_${Buffer.from("hearing-recall-fixture").toString("base64")}`;
const SERVICE_KEY = "sb_secret_hearing_durable_test";
const NORTHLINE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function appEnv() {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    SEDERUNT_MEMBER: "mina",
    RECALL_WEBHOOK_SECRET: RECALL_SECRET,
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
    "access-admin": [
      { id: NORTHLINE, name: "Northline", kind: "company", role: "admin" },
    ],
    "access-outsider": [],
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
const adminCookie = cookie({ userId: "user-admin", tenantId: NORTHLINE, accessToken: "access-admin" });
const outsiderCookie = cookie({ userId: "user-outsider", tenantId: NORTHLINE, accessToken: "access-outsider" });

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
  let failWrites = 0;
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(String(url?.url || url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ href: endpoint.href, method, headers: { ...(init.headers || {}) }, body: init.body });
    if (!endpoint.pathname.endsWith("/rest/v1/bot_preferences")) {
      return jsonResponse(404, { message: "missing" });
    }
    if ((method === "POST" || method === "PATCH") && failWrites > 0) {
      failWrites -= 1;
      return jsonResponse(500, { message: "injected" });
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
  return {
    fetchImpl,
    rows,
    calls,
    failNext(count) { failWrites = count; },
  };
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

function call(port, method, path, { json, cookie: cookieHeader, headers = {} } = {}) {
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
        ...headers,
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

function trackingMemory() {
  const remembered = [];
  return {
    remembered,
    allowUnscoped: false,
    async remember(input) {
      remembered.push(input);
      return { blobId: `blob-${remembered.length}` };
    },
    async index() { return []; },
    async recall() { return []; },
  };
}

function meetingLine(text, deliveryId) {
  return { door: "meeting", text, memberId: "mina", room: { id: "room-1", kind: "meeting", source: "recall", botPresent: true, memberIds: ["mina"] }, participants: ["mina"], deliveryId };
}

async function deliverRecall(port, text, deliveryId) {
  const json = { event: "transcript.data", data: { bot: { id: deliveryId }, transcript: { id: deliveryId }, data: { participant: { id: "mina", email: "mina@example.test", email_verified: true }, words: text.split(" ").map((text) => ({ text })) } } };
  const payload = JSON.stringify(json);
  const timestamp = "1731705121";
  const signature = createHmac("sha256", Buffer.from(RECALL_SECRET.slice(6), "base64")).update(`${deliveryId}.${timestamp}.${payload}`).digest("base64");
  const result = await call(port, "POST", "/api/recall", { json, headers: { "webhook-id": deliveryId, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` } });
  assert.equal(result.status, 204);
  return result;
}

async function withApp(store, fn, extras = {}) {
  const app = createApp({
    companyLoaded: true,
    env: appEnv(),
    identity: extras.identity || identityFor(),
    botPreferences: store,
    tenantBind: { async resolve(kind, id) { return id.startsWith("personal-") ? PERSONAL : NORTHLINE; } },
    ...(extras.deps ? { deps: extras.deps } : {}),
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
    assert.equal(hearingTriggers(setup.raw), "Adam");
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
    assert.equal(hearingTriggers(personalPage.raw), "Adam");
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
    assert.equal(hearingTriggers(setup.raw), "Mai");
    const payload = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(payload.json.hearing.name, "Mai");
    assert.deepEqual(payload.json.hearing.triggers, []);
    const personal = await call(port, "GET", "/api/console", { cookie: personalCookie });
    assert.equal(personal.json.hearing.name, "Adam");
  });
});

function unchanged(fake, memory, before) {
  assert.equal(JSON.stringify(fake.rows), before.rows);
  assert.equal(fake.calls.length, before.calls);
  assert.equal(memory.remembered.length, before.remembered);
}

test("hearing and bot saves share one gate and do not write on 401 or 403", async () => {
  const fake = createFakeRest();
  const memory = trackingMemory();
  const store = freshStore(fake.fetchImpl);
  await withApp(store, async (port) => {
    const before = {
      rows: JSON.stringify(fake.rows),
      calls: fake.calls.length,
      remembered: memory.remembered.length,
    };
    const quiet = [
      ["POST", "/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, null],
      ["POST", "/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, null],
      ["POST", "/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, memberCookie],
      ["POST", "/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, memberCookie],
      ["POST", "/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, outsiderCookie],
      ["POST", "/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, outsiderCookie],
    ];
    const expected = [401, 401, 403, 403, 403, 403];
    for (let index = 0; index < quiet.length; index += 1) {
      const [method, path, json, cookieHeader] = quiet[index];
      const response = await call(port, method, path, { json, cookie: cookieHeader || undefined });
      assert.equal(response.status, expected[index], `${method} ${path} ${cookieHeader || "anon"}`);
      assert.equal(response.json.ok, false);
      assert.equal(response.json.hearing, undefined);
      unchanged(fake, memory, before);
    }

    const adminHearing = await call(port, "POST", "/api/hearing", {
      cookie: adminCookie,
      json: { name: "Nia", triggers: "Hey Nia" },
    });
    assert.equal(adminHearing.status, 200, adminHearing.raw?.slice?.(0, 180) || adminHearing.status);
    assert.equal(adminHearing.json.hearing.name, "Nia");
    const adminBot = await call(port, "POST", "/api/bot", {
      cookie: adminCookie,
      json: { name: "Nia", phrases: ["Hey Nia", "Nia"] },
    });
    assert.equal(adminBot.status, 200, adminBot.raw);
    assert.equal(adminBot.json.name, "Nia");
    const ownerHearing = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Quinn", triggers: "red cedar" },
    });
    assert.equal(ownerHearing.status, 200);
    assert.equal(ownerHearing.json.hearing.name, "Quinn");
    assert.ok(memory.remembered.some((item) => item.kind === "hearing"));

    const held = {
      rows: JSON.stringify(fake.rows),
      calls: fake.calls.length,
      remembered: memory.remembered.length,
    };
    const memberHearing = await call(port, "POST", "/api/hearing", {
      cookie: memberCookie,
      json: { name: "Zoe", triggers: "Hey Zoe" },
    });
    const memberBot = await call(port, "POST", "/api/bot", {
      cookie: memberCookie,
      json: { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] },
    });
    assert.equal(memberHearing.status, 403);
    assert.equal(memberBot.status, 403);
    unchanged(fake, memory, held);
    const still = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(still.json.hearing.name, "Quinn");
    assert.deepEqual(still.json.hearing.triggers, ["red cedar"]);
  }, {
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
});

test("personal and company guests stay apart on a fresh app, including addressing", async () => {
  const fake = createFakeRest();
  const first = freshStore(fake.fetchImpl);
  await withApp(first, async (port) => {
    const personal = await call(port, "POST", "/api/hearing", {
      cookie: personalCookie,
      json: { name: "Nina", triggers: "blue heron" },
    });
    assert.equal(personal.status, 200, personal.raw?.slice?.(0, 200));
    const company = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Quinn", triggers: "red cedar" },
    });
    assert.equal(company.status, 200, company.raw?.slice?.(0, 200));
  });

  const second = freshStore(fake.fetchImpl);
  const memory = trackingMemory();
  assert.notEqual(second, first);
  await withApp(second, async (port) => {
    const personalPage = await call(port, "GET", "/console/setup", { cookie: personalCookie });
    assert.equal(hearingName(personalPage.raw), "Nina");
    assert.equal(hearingTriggers(personalPage.raw), "blue heron");
    const companyPage = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(companyPage.raw), "Quinn");
    assert.equal(hearingTriggers(companyPage.raw), "red cedar");
    const personalApi = await call(port, "GET", "/api/console", { cookie: personalCookie });
    assert.equal(personalApi.json.hearing.name, "Nina");
    assert.deepEqual(personalApi.json.hearing.triggers, ["blue heron"]);
    const companyApi = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(companyApi.json.hearing.name, "Quinn");
    assert.deepEqual(companyApi.json.hearing.triggers, ["red cedar"]);

    await deliverRecall(port, "blue heron the personal offsite is in Lisbon", "personal-hit");
    await deliverRecall(port, "red cedar the personal wrong guest should stay quiet", "personal-miss");
    await deliverRecall(port, "red cedar the company offsite is in Lisbon", "company-hit");
    await deliverRecall(port, "blue heron the company wrong guest should stay quiet", "company-miss");
    const decisions = memory.remembered.filter((row) => row.decision);
    assert.equal(decisions.length, 2);
    assert.ok(decisions.some((row) => row.decision.text.includes("personal offsite")));
    assert.ok(decisions.some((row) => row.decision.text.includes("company offsite")));
    assert.equal(decisions.some((row) => row.decision.text.includes("wrong guest")), false);

  }, { deps: { memory, tatum: { async getObject() { throw new Error("unavailable"); } } } });
});

test("a failed hearing write leaves the previous guest and does not remember", async () => {
  const fake = createFakeRest();
  const memory = trackingMemory();
  const deps = {
    memory,
    tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
  };
  const first = freshStore(fake.fetchImpl);
  await withApp(first, async (port) => {
    const saved = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Quinn", triggers: "red cedar" },
    });
    assert.equal(saved.status, 200, saved.raw?.slice?.(0, 200));
    const before = {
      rows: JSON.stringify(fake.rows),
      remembered: memory.remembered.length,
    };
    assert.ok(before.remembered >= 1);
    fake.failNext(1);
    const failed = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Nina", triggers: "blue heron" },
    });
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.json, { ok: false });
    assert.equal(JSON.stringify(fake.rows), before.rows);
    assert.equal(memory.remembered.length, before.remembered);
    const same = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(same.json.hearing.name, "Quinn");
    assert.deepEqual(same.json.hearing.triggers, ["red cedar"]);
    const beforeDecisions = memory.remembered.filter((row) => row.decision).length;
    await deliverRecall(port, "red cedar the offsite is in Lisbon", "still-quinn");
    await deliverRecall(port, "blue heron the wrong guest should stay quiet", "not-nina");
    const decisions = memory.remembered.filter((row) => row.decision);
    assert.equal(decisions.length, beforeDecisions + 1);
    assert.ok(decisions.some((row) => row.decision.text.includes("offsite is in Lisbon")));
    assert.equal(decisions.some((row) => row.decision.text.includes("wrong guest")), false);
    const page = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    const failAt = page.raw.indexOf("The guest was not saved.");
    const toastAt = page.raw.indexOf("Saved. The meeting guest is ");
    assert.ok(failAt > 0 && toastAt > failAt);
    assert.match(page.raw, /result\.ok === false/);
    assert.equal(hearingName(page.raw), "Quinn");
  }, { deps });

  const second = freshStore(fake.fetchImpl);
  await withApp(second, async (port) => {
    const still = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(still.json.hearing.name, "Quinn");
    assert.deepEqual(still.json.hearing.triggers, ["red cedar"]);
    const page = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(page.raw), "Quinn");
    assert.equal(hearingTriggers(page.raw), "red cedar");
  });

  const third = freshStore(fake.fetchImpl);
  await withApp(third, async (port) => {
    const retry = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Nina", triggers: "blue heron" },
    });
    assert.equal(retry.status, 200, retry.raw?.slice?.(0, 200));
    assert.equal(retry.json.hearing.name, "Nina");
  });
  const fourth = freshStore(fake.fetchImpl);
  await withApp(fourth, async (port) => {
    const kept = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(kept.json.hearing.name, "Nina");
    assert.deepEqual(kept.json.hearing.triggers, ["blue heron"]);
    const page = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(page.raw), "Nina");
    assert.equal(hearingTriggers(page.raw), "blue heron");
  });
});

test("oauth hearing does not fall back to local or a company guest when spaces fail", async () => {
  const fake = createFakeRest();
  const store = freshStore(fake.fetchImpl);
  await store.upsert({
    tenantId: "local",
    key: "meeting_guest",
    value: JSON.stringify({ name: "Piper", triggers: ["local only"] }),
  });
  await store.upsert({
    tenantId: NORTHLINE,
    key: "meeting_guest",
    value: JSON.stringify({ name: "Quinn", triggers: ["red cedar"] }),
  });
  const memory = trackingMemory();
  await withApp(store, async (port) => {
    const before = fake.calls.length;
    const denied = await call(port, "POST", "/api/hearing", {
      cookie: ownerCookie,
      json: { name: "Zoe", triggers: "Hey Zoe" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.ok, false);
    assert.equal(fake.calls.length, before);
    assert.equal(memory.remembered.length, 0);
    const page = await call(port, "GET", "/console/setup", { cookie: ownerCookie });
    assert.equal(hearingName(page.raw), "Adam");
    assert.equal(hearingTriggers(page.raw), "Adam");
    assert.equal(page.raw.includes("Piper"), false);
    assert.equal(page.raw.includes("Quinn"), false);
    const payload = await call(port, "GET", "/api/console", { cookie: ownerCookie });
    assert.equal(payload.json.hearing.name, "Adam");
    assert.deepEqual(payload.json.hearing.triggers, []);
    const missed = await call(port, "POST", "/api/typed", {
      cookie: ownerCookie,
      json: meetingLine("red cedar the offsite is in Lisbon", "no-company-guest"),
    });
    assert.equal(missed.status, 403);
    assert.equal(memory.remembered.length, 0);
  }, {
    identity: {
      async myTenants() { throw new Error("spaces down"); },
      async getUser() { return { user_metadata: {} }; },
      async profile() { return null; },
      async updateUser() {},
    },
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
});
