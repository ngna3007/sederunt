import assert from "node:assert/strict";
import test from "node:test";
import { bindKey, createTenantBind } from "../src/tenant-bind.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("bindKey names bot and slack keys and ignores other kinds", () => {
  assert.equal(bindKey("bot", "bot-1"), "sederunt:tenant-bind:bot:bot-1");
  assert.equal(bindKey("slack", "T1:C1"), "sederunt:tenant-bind:slack:T1:C1");
  assert.equal(bindKey("other", "x"), "");
  assert.equal(bindKey("bot", ""), "");
});

test("memory bind is first-writer-wins and release is owner-guarded", async () => {
  const bind = createTenantBind({}, { memory: new Map() });
  assert.equal(bind.requiresDurable, false);
  const missing = await bind.bind("bot", "", TENANT_A);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing");
  const created = await bind.bind("bot", "bot-1", TENANT_A);
  assert.equal(created.ok, true);
  assert.equal(created.created, true);
  assert.equal(created.durable, false);
  assert.equal(await bind.resolve("bot", "bot-1"), TENANT_A);
  const again = await bind.bind("bot", "bot-1", TENANT_A);
  assert.equal(again.ok, true);
  assert.equal(again.created, false);
  const clash = await bind.bind("bot", "bot-1", TENANT_B);
  assert.equal(clash.ok, false);
  assert.equal(clash.conflict, true);
  assert.equal(clash.owner, TENANT_A);
  const stolen = await bind.release("bot", "bot-1", TENANT_B);
  assert.equal(stolen.ok, false);
  assert.equal(stolen.reason, "not-owner");
  const empty = await bind.release("bot", "", TENANT_A);
  assert.equal(empty.ok, false);
  const dropped = await bind.release("bot", "bot-1", TENANT_A);
  assert.equal(dropped.ok, true);
  assert.equal(await bind.resolve("bot", "bot-1"), "");
  const slack = await bind.bind("slack", "T1:C9", TENANT_A);
  assert.equal(slack.ok, true);
  assert.equal(await bind.releaseTenants([]), 0);
  assert.equal(await bind.releaseTenants([TENANT_A]), 1);
  assert.equal(await bind.resolve("slack", "T1:C9"), "");
});

test("an injected remote without compare-and-delete refuses a release", async () => {
  const remote = {
    async get() { return TENANT_A; },
    async setNx() { return "ok"; },
    async expire() { return true; },
  };
  const bind = createTenantBind({}, { memory: new Map(), remote });
  const bound = await bind.bind("bot", "bot-2", TENANT_A);
  assert.equal(bound.ok, true);
  const released = await bind.release("bot", "bot-2", TENANT_A);
  assert.equal(released.ok, false);
  assert.equal(released.reason, "not-owner");
});

test("REST get failures and missing rest config fail closed", async () => {
  const bind = createTenantBind({
    UPSTASH_REDIS_REST_URL: "https://example-upstash.local",
    UPSTASH_REDIS_REST_TOKEN: "token",
  }, {
    memory: new Map(),
    fetchImpl: async () => ({ ok: false, status: 503, async json() { return {}; } }),
  });
  const read = await bind.bind("bot", "bot-3", TENANT_A, { requireRemote: true });
  assert.equal(read.ok, false);
  assert.equal(read.reason, "remote-read");

});

test("SET NX conflict that still belongs to this tenant is a refresh", async () => {
  let created = false;
  const remote = {
    async get() { return created ? TENANT_A : ""; },
    async setNx() { created = true; return "conflict"; },
    async expire() { return true; },
  };
  const bind = createTenantBind({}, { memory: new Map(), remote });
  const result = await bind.bind("bot", "bot-race", TENANT_A);
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.durable, true);
});

test("a closed Redis endpoint fails closed without hanging", async () => {
  const bind = createTenantBind({ REDIS_URL: "redis://127.0.0.1:1" }, { memory: new Map() });
  const result = await bind.bind("bot", "bot-down", TENANT_A, { requireRemote: true });
  assert.equal(result.ok, false);
  assert.equal((await bind.release("bot", "bot-down", TENANT_A)).ok, false);
  assert.equal(await bind.releaseTenants([TENANT_A]).catch(() => 0), 0);
});

test("REST releaseTenants scans keys and drops matching owners", async () => {
  const keys = new Map([["sederunt:tenant-bind:slack:T1:C1", TENANT_A], ["sederunt:tenant-bind:bot:other", TENANT_B]]);
  const bind = createTenantBind({
    UPSTASH_REDIS_REST_URL: "https://example-upstash.local",
    UPSTASH_REDIS_REST_TOKEN: "token",
  }, {
    memory: new Map([["sederunt:tenant-bind:slack:T1:C1", TENANT_A]]),
    fetchImpl: async (url, init = {}) => {
      const href = String(url);
      const command = JSON.parse(String(init.body || "[]"))[0] || [];
      if (command[0] === "SCAN") {
        return { ok: true, async json() { return [{ result: ["0", [...keys.keys()]] }]; } };
      }
      if (command[0] === "GET") {
        return { ok: true, async json() { return [{ result: keys.get(command[1]) || null }]; } };
      }
      if (command[0] === "EVAL") {
        const key = command[3];
        const owner = command[4];
        if (keys.get(key) === owner) {
          keys.delete(key);
          return { ok: true, async json() { return [{ result: 1 }]; } };
        }
        return { ok: true, async json() { return [{ result: 0 }]; } };
      }
      return { ok: false, status: 500, async json() { return []; } };
    },
  });
  assert.equal(await bind.releaseTenants([TENANT_A]), 1);
  assert.equal(keys.has("sederunt:tenant-bind:slack:T1:C1"), false);
  assert.equal(keys.has("sederunt:tenant-bind:bot:other"), true);
});
