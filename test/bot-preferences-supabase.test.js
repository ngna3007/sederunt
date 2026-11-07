import assert from "node:assert/strict";
import test from "node:test";
import { saveBotIdentity } from "../src/bot/identity.js";
import { assignEffectiveHearing, effectiveHearing, fitMeetingGuest, saveMeetingGuest } from "../src/bot/meeting-guest.js";
import { createMemoryPreferenceStore } from "../src/bot/preferences.js";
import { createBotPreferenceStore } from "../src/bot/preferences-supabase.js";

const SERVICE_KEY = "sb_secret_bot_preferences_test";
const ROLE_KEY = "sb_service_role_bot_preferences_test";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NORTHLINE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PREF_KEY = "secret_pref_key";
const STORE_ERROR = "The preference store could not be reached.";

function supabaseEnv(extra = {}) {
  return {
    SUPABASE_URL: "https://project.supabase.co/",
    SUPABASE_SECRET_KEY: SERVICE_KEY,
    ...extra,
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

function scriptedFetch(steps) {
  const calls = [];
  let index = 0;
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(String(url?.url || url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({
      href: endpoint.href,
      method,
      headers: { ...(init.headers || {}) },
      body: init.body,
      search: endpoint.searchParams,
    });
    const step = steps[index] || { status: 500, body: { message: SERVICE_KEY, pref_key: PREF_KEY } };
    index += 1;
    if (step.throw) throw new Error(step.throw);
    return jsonResponse(step.status, step.body);
  };
  return { fetchImpl, calls };
}

function row(fields) {
  return {
    tenant_id: fields.tenantId,
    user_id: fields.userId ?? null,
    pref_key: fields.key,
    pref_value: fields.value,
  };
}

function assertNoSecret(error) {
  const text = `${error?.message || ""}\n${String(error)}`;
  assert.equal(error.message, STORE_ERROR);
  assert.equal(text.includes(SERVICE_KEY), false);
  assert.equal(text.includes(ROLE_KEY), false);
  assert.equal(text.includes(PREF_KEY), false);
  assert.equal(text.includes("project.supabase.co"), false);
  assert.equal(text.includes("db down"), false);
}

test("supabase preference store lists, inserts, updates, retries a conflict, and removes", async () => {
  const listed = scriptedFetch([
    { status: 200, body: [row({ tenantId: TENANT, key: "note", value: "terse" }), row({ tenantId: TENANT, userId: USER, key: "note", value: "mine" })] },
  ]);
  const reading = createBotPreferenceStore(supabaseEnv(), { fetch: listed.fetchImpl });
  const rows = await reading.list({ tenantId: TENANT });
  assert.deepEqual(rows, [
    { tenantId: TENANT, userId: null, key: "note", value: "terse" },
    { tenantId: TENANT, userId: USER, key: "note", value: "mine" },
  ]);
  const get = listed.calls[0];
  assert.equal(get.method, "GET");
  assert.equal(new URL(get.href).pathname, "/rest/v1/bot_preferences");
  assert.equal(get.search.get("select"), "tenant_id,user_id,pref_key,pref_value");
  assert.equal(get.search.get("tenant_id"), `eq.${TENANT}`);
  assert.equal(get.href.includes(SERVICE_KEY), false);
  assert.equal(get.headers.apikey, SERVICE_KEY);
  assert.equal(get.headers.authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(get.headers.accept, "application/json");
  assert.equal(get.headers["accept-profile"], "public");
  assert.equal(get.headers["content-profile"], "public");
  assert.equal(get.headers.prefer, undefined);
  assert.equal(get.headers["content-type"], undefined);

  const inserted = scriptedFetch([
    { status: 200, body: [] },
    { status: 201, body: [row({ tenantId: TENANT, key: "meeting_guest", value: "{\"name\":\"Adam\"}" })] },
  ]);
  const creating = createBotPreferenceStore(supabaseEnv(), { fetch: inserted.fetchImpl });
  const created = await creating.upsert({ tenantId: TENANT, key: "meeting_guest", value: "{\"name\":\"Adam\"}" });
  assert.deepEqual(created, { tenantId: TENANT, userId: null, key: "meeting_guest", value: "{\"name\":\"Adam\"}" });
  assert.deepEqual(inserted.calls.map((call) => call.method), ["PATCH", "POST"]);
  const patch = inserted.calls[0];
  assert.equal(patch.search.get("tenant_id"), `eq.${TENANT}`);
  assert.equal(patch.search.get("pref_key"), "eq.meeting_guest");
  assert.equal(patch.search.get("user_id"), "is.null");
  assert.equal(patch.search.get("select"), "tenant_id,user_id,pref_key,pref_value");
  assert.equal(patch.headers.prefer, "return=representation");
  assert.equal(patch.headers["content-type"], "application/json");
  assert.equal(patch.headers.apikey, SERVICE_KEY);
  assert.equal(patch.headers.authorization, `Bearer ${SERVICE_KEY}`);
  assert.deepEqual(Object.keys(JSON.parse(patch.body)), ["pref_value"]);
  assert.deepEqual(JSON.parse(patch.body), { pref_value: "{\"name\":\"Adam\"}" });
  assert.ok(JSON.parse(patch.body).pref_value.length <= 500);
  const post = inserted.calls[1];
  assert.equal(new URL(post.href).pathname, "/rest/v1/bot_preferences");
  assert.equal(post.search.get("select"), "tenant_id,user_id,pref_key,pref_value");
  assert.equal(post.headers.prefer, "return=representation");
  assert.equal(post.headers.apikey, SERVICE_KEY);
  assert.equal(post.headers.authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(post.href.includes(SERVICE_KEY), false);
  assert.deepEqual(Object.keys(JSON.parse(post.body)).sort(), ["pref_key", "pref_value", "tenant_id", "user_id"]);
  assert.deepEqual(JSON.parse(post.body), {
    tenant_id: TENANT,
    user_id: null,
    pref_key: "meeting_guest",
    pref_value: "{\"name\":\"Adam\"}",
  });
  assert.ok(JSON.parse(post.body).pref_value.length <= 500);

  const updated = scriptedFetch([
    { status: 200, body: [row({ tenantId: TENANT, userId: USER, key: "note", value: "next" })] },
  ]);
  const writing = createBotPreferenceStore(supabaseEnv(), { fetch: updated.fetchImpl });
  const changed = await writing.upsert({ tenantId: TENANT, userId: USER, key: "note", value: "next" });
  assert.deepEqual(changed, { tenantId: TENANT, userId: USER, key: "note", value: "next" });
  assert.equal(updated.calls.length, 1);
  assert.equal(updated.calls[0].search.get("user_id"), `eq.${USER}`);

  const conflicted = scriptedFetch([
    { status: 200, body: [] },
    { status: 409, body: { message: `duplicate ${SERVICE_KEY}`, pref_key: PREF_KEY } },
    { status: 200, body: [row({ tenantId: TENANT, key: PREF_KEY, value: "kept" })] },
  ]);
  const racing = createBotPreferenceStore(supabaseEnv(), { fetch: conflicted.fetchImpl });
  const raced = await racing.upsert({ tenantId: TENANT, key: PREF_KEY, value: "kept" });
  assert.deepEqual(raced, { tenantId: TENANT, userId: null, key: PREF_KEY, value: "kept" });
  assert.deepEqual(conflicted.calls.map((call) => call.method), ["PATCH", "POST", "PATCH"]);

  const removed = scriptedFetch([
    { status: 200, body: [row({ tenantId: TENANT, key: "note", value: "terse" })] },
  ]);
  const deleting = createBotPreferenceStore(supabaseEnv(), { fetch: removed.fetchImpl });
  assert.equal(await deleting.remove({ tenantId: TENANT, key: "note" }), true);
  assert.equal(removed.calls[0].method, "DELETE");
  assert.equal(removed.calls[0].search.get("pref_key"), "eq.note");
  assert.equal(removed.calls[0].search.get("user_id"), "is.null");
  const empty = scriptedFetch([{ status: 200, body: [] }]);
  const clearing = createBotPreferenceStore(supabaseEnv(), { fetch: empty.fetchImpl });
  assert.equal(await clearing.remove({ tenantId: TENANT, key: "note" }), false);
});

test("a non-uuid tenant stays in memory and is never sent", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error(`network ${SERVICE_KEY} ${PREF_KEY}`);
  };
  const first = createBotPreferenceStore(supabaseEnv(), { fetch: fetchImpl });
  const saved = await first.upsert({ tenantId: "local", key: "meeting_guest", value: "{\"name\":\"Adam\"}" });
  assert.equal(saved.tenantId, "local");
  assert.deepEqual(await first.list({ tenantId: "local" }), [saved]);
  assert.equal(await first.remove({ tenantId: "local", key: "missing" }), false);
  assert.equal(await first.remove({ tenantId: "local", key: "meeting_guest" }), true);
  assert.equal(called, false);
  const second = createBotPreferenceStore(supabaseEnv(), { fetch: fetchImpl });
  assert.deepEqual(await second.list({ tenantId: "local" }), []);
});

test("missing config, auth fake, and options.memory do not call Supabase", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("network");
  };
  const cases = [
    supabaseEnv({ SEDERUNT_AUTH_FAKE: "1" }),
    { SUPABASE_URL: "https://project.supabase.co" },
    { SUPABASE_SECRET_KEY: SERVICE_KEY },
    {},
  ];
  for (const env of cases) {
    const store = createBotPreferenceStore(env, { fetch: fetchImpl });
    await store.upsert({ tenantId: TENANT, key: "note", value: "terse" });
    assert.deepEqual((await store.list({ tenantId: TENANT })).map((item) => item.value), ["terse"]);
  }
  const forced = createBotPreferenceStore(supabaseEnv(), { fetch: fetchImpl, memory: true });
  await forced.upsert({ tenantId: TENANT, key: "note", value: "local" });
  assert.equal((await forced.list({ tenantId: TENANT }))[0].value, "local");
  assert.equal(called, false);
});

test("the service role key is accepted as the Supabase key", async () => {
  const scripted = scriptedFetch([{ status: 200, body: [] }]);
  const store = createBotPreferenceStore({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: ROLE_KEY,
  }, { fetch: scripted.fetchImpl });
  assert.deepEqual(await store.list({ tenantId: OTHER }), []);
  assert.equal(scripted.calls[0].headers.apikey, ROLE_KEY);
  assert.equal(scripted.calls[0].headers.authorization, `Bearer ${ROLE_KEY}`);
  assert.equal(scripted.calls[0].href.includes(ROLE_KEY), false);
});

test("preference store failures omit the key, the preference, and the response", async () => {
  const logs = [];
  const originals = ["log", "info", "warn", "error", "debug"].map((name) => [name, console[name]]);
  for (const [name] of originals) {
    console[name] = (...args) => {
      logs.push(args.map((part) => String(part)).join(" "));
    };
  }
  try {
    const thrown = createBotPreferenceStore(supabaseEnv(), {
      fetch: async () => {
        throw new Error(`db down ${SERVICE_KEY} ${PREF_KEY}`);
      },
    });
    await assert.rejects(() => thrown.list({ tenantId: TENANT }), (error) => {
      assertNoSecret(error);
      return true;
    });

    const broken = createBotPreferenceStore(supabaseEnv(), {
      fetch: async () => jsonResponse(500, { message: `db down ${SERVICE_KEY}`, pref_key: PREF_KEY }),
    });
    await assert.rejects(
      () => broken.upsert({ tenantId: TENANT, key: PREF_KEY, value: "secret_pref_value" }),
      (error) => {
        assertNoSecret(error);
        assert.equal(String(error).includes("secret_pref_value"), false);
        return true;
      },
    );

    const conflict = scriptedFetch([
      { status: 200, body: [] },
      { status: 409, body: { message: SERVICE_KEY, pref_key: PREF_KEY } },
      { status: 409, body: { message: SERVICE_KEY, pref_key: PREF_KEY } },
    ]);
    const racing = createBotPreferenceStore(supabaseEnv(), { fetch: conflict.fetchImpl });
    await assert.rejects(() => racing.upsert({ tenantId: TENANT, key: PREF_KEY, value: "x" }), (error) => {
      assertNoSecret(error);
      return true;
    });
  } finally {
    for (const [name, fn] of originals) console[name] = fn;
  }
  assert.equal(logs.some((line) => line.includes(SERVICE_KEY) || line.includes(PREF_KEY) || line.includes("secret_pref_value")), false);
});

test("invalid rows are rejected before a request and a REST error is not kept in memory", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(500, { message: `db down ${SERVICE_KEY}`, pref_key: PREF_KEY, pref_value: "x".repeat(501) });
  };
  const store = createBotPreferenceStore(supabaseEnv(), { fetch: fetchImpl });
  const rejected = [
    { tenantId: TENANT, key: "Note", value: "x" },
    { tenantId: TENANT, key: "", value: "x" },
    { tenantId: TENANT, key: "n".repeat(81), value: "x" },
    { tenantId: TENANT, key: "note", value: "" },
    { tenantId: TENANT, key: "note", value: "x".repeat(501) },
    { tenantId: TENANT, userId: "not-a-uuid", key: "note", value: "x" },
    { tenantId: "", key: "note", value: "x" },
    { tenantId: "local", key: "Note", value: "x" },
  ];
  for (const input of rejected) {
    await assert.rejects(() => store.upsert(input), (error) => {
      assertNoSecret(error);
      assert.equal(String(error).includes("x".repeat(40)), false);
      return true;
    });
  }
  assert.equal(calls, 0);
  await assert.rejects(() => store.upsert({ tenantId: TENANT, key: "note", value: "terse" }), (error) => {
    assertNoSecret(error);
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(() => store.list({ tenantId: TENANT }), (error) => {
    assertNoSecret(error);
    return true;
  });
  assert.equal(calls, 2);
});

test("a 500 character value is sent and a conflict updates the same row", async () => {
  const value = "m".repeat(500);
  const scripted = scriptedFetch([
    { status: 200, body: [] },
    { status: 201, body: [row({ tenantId: TENANT, key: "note", value })] },
  ]);
  const store = createBotPreferenceStore(supabaseEnv(), { fetch: scripted.fetchImpl });
  const saved = await store.upsert({ tenantId: TENANT, key: "note", value });
  assert.equal(saved.value.length, 500);
  assert.equal(JSON.parse(scripted.calls[1].body).pref_value.length, 500);
  assert.deepEqual(Object.keys(JSON.parse(scripted.calls[0].body)), ["pref_value"]);
  assert.deepEqual(Object.keys(JSON.parse(scripted.calls[1].body)).sort(), ["pref_key", "pref_value", "tenant_id", "user_id"]);
});

test("concurrent saves for one tenant and key leave a single row", async () => {
  const rows = [];
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(String(url?.url || url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ method, href: endpoint.href, headers: { ...(init.headers || {}) }, body: init.body });
    assert.equal(endpoint.pathname, "/rest/v1/bot_preferences");
    assert.equal(Boolean(init.headers?.apikey), true);
    assert.equal(Boolean(init.headers?.authorization), true);
    assert.equal(endpoint.href.includes(SERVICE_KEY), false);
    const tenant = (endpoint.searchParams.get("tenant_id") || "").replace(/^eq\./, "");
    const pref = (endpoint.searchParams.get("pref_key") || "").replace(/^eq\./, "");
    const userFilter = endpoint.searchParams.get("user_id") || "";
    const matches = (item) => {
      if (tenant && item.tenant_id !== tenant) return false;
      if (pref && item.pref_key !== pref) return false;
      if (userFilter === "is.null") return item.user_id == null;
      if (userFilter.startsWith("eq.")) return item.user_id === userFilter.slice(3);
      return true;
    };
    const publish = (item) => ({
      tenant_id: item.tenant_id,
      user_id: item.user_id,
      pref_key: item.pref_key,
      pref_value: item.pref_value,
    });
    if (method === "PATCH") {
      assert.equal(endpoint.searchParams.get("tenant_id"), `eq.${TENANT}`);
      assert.equal(endpoint.searchParams.get("pref_key"), "eq.meeting_guest");
      assert.equal(endpoint.searchParams.get("user_id"), "is.null");
      assert.equal(endpoint.searchParams.get("select"), "tenant_id,user_id,pref_key,pref_value");
      const body = JSON.parse(String(init.body || "{}"));
      assert.deepEqual(Object.keys(body), ["pref_value"]);
      assert.ok(body.pref_value.length <= 500);
      const hit = rows.filter(matches);
      for (const item of hit) item.pref_value = body.pref_value;
      return jsonResponse(200, hit.map(publish));
    }
    if (method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      assert.deepEqual(Object.keys(body).sort(), ["pref_key", "pref_value", "tenant_id", "user_id"]);
      assert.ok(body.pref_value.length <= 500);
      const duplicate = rows.some((item) => item.tenant_id === body.tenant_id
        && item.pref_key === body.pref_key
        && (item.user_id || null) === (body.user_id || null));
      if (duplicate) return jsonResponse(409, { message: "duplicate", pref_key: body.pref_key });
      const created = {
        tenant_id: body.tenant_id,
        user_id: body.user_id ?? null,
        pref_key: body.pref_key,
        pref_value: body.pref_value,
      };
      rows.push(created);
      return jsonResponse(201, [publish(created)]);
    }
    return jsonResponse(200, rows.filter(matches).map(publish));
  };
  const store = createBotPreferenceStore(supabaseEnv(), { fetch: fetchImpl });
  const first = JSON.stringify({ name: "Ada", triggers: ["blue heron"] });
  const second = JSON.stringify({ name: "Bea", triggers: ["red cedar"] });
  const saved = await Promise.all([
    store.upsert({ tenantId: TENANT, key: "meeting_guest", value: first }),
    store.upsert({ tenantId: TENANT, key: "meeting_guest", value: second }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, TENANT);
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].pref_key, "meeting_guest");
  assert.ok(rows[0].pref_value === first || rows[0].pref_value === second);
  assert.ok(rows[0].pref_value.length <= 500);
  assert.equal(saved.length, 2);
  assert.ok(calls.some((call) => call.method === "POST"));
  assert.ok(calls.some((call) => call.method === "PATCH"));
  const listed = await store.list({ tenantId: TENANT });
  assert.equal(listed.filter((item) => item.key === "meeting_guest").length, 1);
});

test("a durable store ignores a legacy semantic hearing", async () => {
  const scripted = scriptedFetch([
    { status: 200, body: [] },
    { status: 200, body: [] },
  ]);
  const store = createBotPreferenceStore(supabaseEnv(), { fetch: scripted.fetchImpl });
  assert.equal(store.durable, true);
  const legacy = {
    hearing: { name: "Piper", triggers: ["old"], savedAt: "2020-01-01T00:00:00.000Z", tenantId: NORTHLINE },
  };
  const workspace = { botPreferences: store };
  assert.deepEqual(await effectiveHearing(workspace, NORTHLINE, legacy), { name: "Adam", triggers: [] });
  const session = { hearing: { ...legacy.hearing } };
  await assignEffectiveHearing(workspace, session, NORTHLINE);
  assert.equal(session.hearing.name, "Adam");
  assert.deepEqual(session.hearing.triggers, []);
  assert.equal(session.hearing.tenantId, NORTHLINE);
  assert.equal(session.hearing.savedAt, undefined);
  assert.equal(scripted.calls.length, 2);
});

test("a meeting guest value is trimmed to 500 characters and stays per tenant", async () => {
  const triggers = Array.from({ length: 12 }, (_, index) => `line ${index} ${"x".repeat(60)}`);
  const fitted = fitMeetingGuest({ name: "Adam", triggers });
  const packed = JSON.stringify(fitted);
  assert.equal(fitted.name, "Adam");
  assert.ok(packed.length <= 500);
  assert.ok(fitted.triggers.length < triggers.length);
  assert.ok(fitted.triggers.length > 0);

  const store = createMemoryPreferenceStore();
  const workspace = { botPreferences: store };
  assert.deepEqual(await effectiveHearing(workspace, NORTHLINE, {}), { name: "Adam", triggers: [] });
  await saveBotIdentity(store, { tenantId: NORTHLINE, name: "Mai", phrases: ["Hey Mai", "Mai"] });
  assert.equal((await effectiveHearing(workspace, NORTHLINE, {})).name, "Mai");
  await saveMeetingGuest(store, NORTHLINE, { name: "Adam", triggers: ["Hey Adam"] });
  const legacy = {
    hearing: { name: "Piper", triggers: ["old"], savedAt: "2020-01-01T00:00:00.000Z", tenantId: NORTHLINE },
  };
  assert.deepEqual(await effectiveHearing(workspace, NORTHLINE, legacy), { name: "Adam", triggers: ["Hey Adam"] });
  await saveMeetingGuest(store, PERSONAL, { name: "Nina", triggers: ["Hey Nina"] });
  assert.deepEqual(await effectiveHearing(workspace, PERSONAL, {}), { name: "Nina", triggers: ["Hey Nina"] });
  assert.deepEqual(await effectiveHearing(workspace, NORTHLINE, {}), { name: "Adam", triggers: ["Hey Adam"] });

  const fresh = { botPreferences: createMemoryPreferenceStore() };
  assert.equal((await effectiveHearing(fresh, PERSONAL, legacy)).name, "Adam");
  assert.equal((await effectiveHearing(fresh, NORTHLINE, legacy)).name, "Piper");
});
