import assert from "node:assert/strict";
import test from "node:test";
import { bindKey, createTenantBind, requiresDurableBind } from "../src/tenant-bind.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Fake Upstash REST that speaks the real /pipeline SET NX + /get protocol. */
function fakeRestServer() {
  const store = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, method: init.method || "GET", body: init.body || "" });
    if (href.includes("/pipeline") || href.includes("/multi-exec")) {
      const commands = JSON.parse(String(init.body || "[]"));
      const rows = commands.map((command) => {
        const [op, key, value, nx, exFlag, exVal] = command;
        if (op === "SET" && nx === "NX") {
          if (store.has(key)) return { result: null };
          store.set(key, { value, exp: Number(exVal) || 0 });
          return { result: "OK" };
        }
        if (op === "EXPIRE") {
          const row = store.get(key);
          if (!row) return { result: 0 };
          row.exp = Number(value) || 0;
          return { result: 1 };
        }
        return { error: "unknown" };
      });
      return {
        ok: true,
        status: 200,
        async json() { return rows; },
      };
    }
    if (href.includes("/get/")) {
      const key = decodeURIComponent(href.split("/get/")[1] || "");
      const row = store.get(key);
      return {
        ok: true,
        status: 200,
        async json() { return { result: row ? row.value : null }; },
      };
    }
    return { ok: false, status: 500, async json() { return {}; } };
  };
  return { store, calls, fetchImpl };
}

test("requiresDurableBind is true only when Redis/REST is configured", () => {
  assert.equal(requiresDurableBind({}), false);
  assert.equal(requiresDurableBind({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }), true);
  assert.equal(requiresDurableBind({ REDIS_URL: "redis://localhost:6379" }), true);
});

test("REST SET NX first-writer-wins; conflict does not overwrite; same owner refreshes", async () => {
  const remote = fakeRestServer();
  const env = {
    UPSTASH_REDIS_REST_URL: "https://example-upstash.local",
    UPSTASH_REDIS_REST_TOKEN: "token-test",
  };
  const a = createTenantBind(env, { fetchImpl: remote.fetchImpl, memory: new Map() });
  const b = createTenantBind(env, { fetchImpl: remote.fetchImpl, memory: new Map() });

  const first = await a.bind("slack", "T1:C1", TENANT_A, { requireRemote: true });
  assert.equal(first.ok, true);
  assert.equal(first.durable, true);
  assert.equal(first.created, true);

  const conflict = await b.bind("slack", "T1:C1", TENANT_B, { requireRemote: true });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.owner, TENANT_A);

  // Cross-client resolve sees the remote winner — not a shared Map.
  assert.equal(await b.resolve("slack", "T1:C1"), TENANT_A);

  const refresh = await a.bind("slack", "T1:C1", TENANT_A, { requireRemote: true });
  assert.equal(refresh.ok, true);
  assert.equal(refresh.created, false);
  assert.equal(await b.resolve("slack", "T1:C1"), TENANT_A);
  assert.equal(remote.store.get(bindKey("slack", "T1:C1"))?.value, TENANT_A);
});

test("remote write failure is not reported as durable success", async () => {
  const env = {
    UPSTASH_REDIS_REST_URL: "https://example-upstash.local",
    UPSTASH_REDIS_REST_TOKEN: "token-test",
  };
  const fetchImpl = async () => ({ ok: false, status: 503, async json() { return {}; } });
  const bind = createTenantBind(env, { fetchImpl, memory: new Map() });
  const result = await bind.bind("bot", "bot-1", TENANT_A, { requireRemote: true });
  assert.equal(result.ok, false);
  assert.equal(result.durable, false);
  assert.equal(result.reason === "remote-read" || result.reason === "remote-write", true);
  assert.equal(await bind.resolve("bot", "bot-1"), "");
});

test("injected remote NX conflict across two clients without shared Map", async () => {
  const store = new Map();
  const remote = {
    async get(key) { return store.get(key) || ""; },
    async setNx(key, value) {
      if (store.has(key)) return "conflict";
      store.set(key, value);
      return "ok";
    },
    async expire(key) { return store.has(key); },
  };
  const a = createTenantBind({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }, {
    memory: new Map(),
    remote,
  });
  const b = createTenantBind({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }, {
    memory: new Map(),
    remote,
  });
  assert.equal((await a.bind("bot", "bot-x", TENANT_A)).ok, true);
  assert.equal((await b.bind("bot", "bot-x", TENANT_B)).conflict, true);
  assert.equal(await b.resolve("bot", "bot-x"), TENANT_A);
});
