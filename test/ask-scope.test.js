import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { askContext, askContextKey, askScopeMatches, scopeAskStore } from "../src/ask/context.js";
import { createAskStore } from "../src/ask/store.js";

const companyA = { user: "person", tenantId: "company-a", workspace: "company" };
const companyB = { ...companyA, tenantId: "company-b" };
const personal = { ...companyA, workspace: "personal" };
const otherPerson = { ...companyA, user: "other-person" };

async function proveScope(t, raw) {
  const a = scopeAskStore(raw, companyA);
  const b = scopeAskStore(raw, companyB);
  const own = scopeAskStore(raw, personal);
  const other = scopeAskStore(raw, otherPerson);
  const legacy = await raw.create("person", "An old question without provenance");
  const first = await a.create("person", "When is launch?");
  const second = await b.create("person", "When is launch?");
  const note = await own.create("person", "My private launch plan");
  const foreign = await other.create("other-person", "Another person's plan");
  for (const [id, answer] of [[legacy, "Old unscoped answer"], [first, "Monday"], [second, "Friday"], [note, "Secret"], [foreign, "Tuesday"]]) {
    await raw.append(id, answer);
    await raw.finish(id, { source: "retrieval", status: "done" });
  }
  assert.deepEqual(await a.list("person"), [first]);
  assert.deepEqual(await b.list("person"), [second]);
  assert.deepEqual(await own.list("person"), [note]);
  assert.deepEqual(await other.list("other-person"), [foreign]);
  const meta = await a.meta(first);
  assert.equal(meta.tenantId, companyA.tenantId);
  assert.equal(meta.workspace, "company");
  for (const id of [legacy, second, note, foreign, "missing"]) {
    assert.equal(await a.meta(id), null);
    assert.deepEqual(await a.chunks(id), []);
    await a.append(id, "must not append");
    await a.replace(id, "must not replace");
    await a.finish(id, { status: "error" });
  }
  assert.deepEqual(await raw.chunks(note), ["Secret"]);
  assert.equal((await raw.meta(second)).status, "done");
  const reads = await a.reads([first, second, note, legacy, foreign]);
  assert.deepEqual(reads[0].chunks, ["Monday"]);
  for (const row of reads.slice(1)) assert.deepEqual(row, { meta: null, chunks: [] });
  assert.deepEqual(await a.reads([]), []);
  await a.append(first, " noon");
  assert.deepEqual(await a.chunks(first, 1), [" noon"]);
  await a.replace(first, "Monday noon");
  assert.deepEqual(await a.chunks(first), ["Monday noon"]);
  await a.finish(first, { source: "retrieval", result: { body: "Monday noon" } });
  assert.equal((await a.meta(first)).result.body, "Monday noon");

  const claimed = await a.claim("person", 5);
  assert.equal(claimed.remaining, 4);
  assert.equal((await b.quota("person", 5)).remaining, 4, "quota stays per person across workspaces");
  assert.equal((await own.overview("person", 5)).quota.remaining, 4);
  assert.deepEqual((await a.overview("person", 5)).ids, [first]);
  await Promise.all(Array.from({ length: 8 }, () => a.refund("person", claimed.quotaKey)));
  assert.equal((await b.quota("person", 5)).remaining, 5);
  const duplicate = await a.claim("person", 5);
  await a.claim("person", 5);
  await raw.refund("other-person", duplicate.quotaKey);
  await raw.refund("person", { ...duplicate.quotaKey, key: "another-quota-key" });
  assert.equal((await a.quota("person", 5)).used, 2, "a claim receipt cannot refund another user or quota key");
  await Promise.all(Array.from({ length: 8 }, () => a.refund("person", duplicate.quotaKey)));
  assert.equal((await a.quota("person", 5)).used, 1, "concurrent duplicate refunds return only their own claim");
  await raw.resetQuota("person");
  const old = await a.claim("person", 5);
  await raw.resetQuota("person");
  await b.claim("person", 5);
  await Promise.all(Array.from({ length: 8 }, () => a.refund("person", old.quotaKey)));
  assert.equal((await b.quota("person", 5)).used, 1, "a late refund cannot change the reset generation");

  for (let i = 0; i < 25; i++) await a.create("person", `Question ${i}`);
  assert.equal((await a.list("person")).length, 20);
  assert.deepEqual(await b.list("person"), [second], "activity in another context cannot evict this context's turns");
  assert.deepEqual((await b.overview("person", 5)).ids, [second]);
  await raw.resetHistory("person");
  await raw.append(first, "late answer");
  await raw.finish(first, { status: "done" });
  assert.equal(await a.meta(first), null);
  assert.deepEqual(await a.list("person"), []);
  assert.deepEqual(await b.list("person"), []);
  assert.deepEqual(await own.list("person"), []);
  assert.deepEqual(await other.list("other-person"), [foreign]);
  await assert.rejects(a.create("other-person", "forged"), /current session/);
  await assert.rejects(a.quota("other-person", 5), /current session/);
  await assert.rejects(a.claim("other-person", 5), /current session/);
  await assert.rejects(a.refund("other-person"), /current session/);
  await assert.rejects(a.list("other-person"), /current session/);
  await assert.rejects(a.overview("other-person", 5), /current session/);
  await assert.rejects(raw.create("person", "bad", {}), /requires a tenant/);
  const burst = await Promise.all(Array.from({ length: 12 }, () => raw.claim("burst-user", 3)));
  const accepted = burst.filter(claim => claim.ok);
  assert.equal(accepted.length, 3);
  assert.equal((await raw.quota("burst-user", 3)).used, 3);
  await Promise.all(Array.from({ length: 8 }, () => raw.refund("burst-user", accepted[0].quotaKey)));
  assert.equal((await raw.quota("burst-user", 3)).used, 2);
}

test("Ask context rejects missing provenance and does not trust legacy records", () => {
  for (const context of [null, {}, { tenantId: "a" }, { tenantId: " ", workspace: "company" }, { tenantId: "a", workspace: "unknown" }]) {
    assert.throws(() => askContext(context), /requires a tenant/);
    assert.equal(askScopeMatches({ user: "person", tenantId: "a", workspace: "company" }, context), false);
  }
  assert.throws(() => scopeAskStore({}, { tenantId: "a", workspace: "company" }), /authenticated user/);
  assert.throws(() => scopeAskStore({}, { user: " ", tenantId: "a", workspace: "company" }), /authenticated user/);
  assert.equal(askScopeMatches(null, companyA), false);
  assert.equal(askScopeMatches({ user: "person" }, companyA), false);
  assert.equal(askScopeMatches({ ...companyA }, companyA), true);
  assert.notEqual(askContextKey("person:a", { tenantId: "b", workspace: "company" }), askContextKey("person", { tenantId: "a:b", workspace: "company" }));
});

test("Ask memory context separates tenant, personal, legacy and another user's turns", async (t) => {
  const store = createAskStore({});
  await proveScope(t, store);
  await scopeAskStore(store, companyA).close();
});

for (const backend of ["redis", "rest"]) {
  test(`Ask ${backend} context and reset guarantees hold over real Redis`, { skip: !process.env.ASK_TEST_REDIS_URL && "set ASK_TEST_REDIS_URL to disposable Redis" }, async (t) => {
    const { createClient } = await import("redis");
    const client = createClient({ url: process.env.ASK_TEST_REDIS_URL });
    client.on("error", () => {});
    await client.connect();
    t.after(async () => { if (client.isOpen) await client.quit(); });
    const prefix = `ask-scope-test:${backend}:${Date.now()}:${Math.random()}`;
    let store;
    if (backend === "redis") store = createAskStore({ ASK_REDIS_PREFIX: prefix }, { client });
    else {
      const server = createServer(async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const commands = JSON.parse(Buffer.concat(chunks).toString());
          assert.equal(req.headers.authorization, "Bearer fixture-token");
          assert.ok(req.url === "/pipeline" || req.url === "/multi-exec");
          const multi = client.multi();
          for (const command of commands) multi.addCommand(command.map(String));
          const values = await multi.exec();
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(values.map(result => ({ result }))));
        } catch { res.writeHead(500); res.end(); }
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(() => new Promise(resolve => server.close(resolve)));
      store = createAskStore({ ASK_REDIS_PREFIX: prefix, UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${server.address().port}`, UPSTASH_REDIS_REST_TOKEN: "fixture-token" });
    }
    t.after(async () => {
      if (!client.isOpen) return;
      const keys = await client.keys(`${prefix}:*`);
      if (keys.length) await client.del(keys);
    });
    await proveScope(t, store);
    let version = "before";
    const secured = scopeAskStore(store, companyA, { deletionVersion: async () => version });
    const old = await secured.create("person", "Private answer");
    await secured.append(old, "secret");
    assert.equal((await secured.meta(old)).deletionVersion, "before");
    assert.deepEqual(await secured.chunks(old), ["secret"]);
    version = "after";
    assert.equal(await secured.meta(old), null);
    assert.deepEqual(await secured.chunks(old), []);
    assert.equal((await secured.reads([old]))[0].meta, null);
    const fresh = await secured.create("person", "Safe answer");
    assert.equal((await secured.meta(fresh)).deletionVersion, "after");
  });
}

test("a deletion hides previous answers, active stream chunks and unversioned history", async () => {
  const raw = createAskStore({});
  let version = "empty";
  const principal = { user: "alice", tenantId: "company-a", workspace: "company" };
  const scoped = scopeAskStore(raw, principal, { deletionVersion: async () => version });
  const legacy = await raw.create("alice", "old question", { tenantId: "company-a", workspace: "company" });
  const before = await scoped.create("alice", "what changed?");
  await scoped.append(before, "private old answer");
  assert.equal((await scoped.meta(before)).deletionVersion, "empty");
  assert.deepEqual(await scoped.chunks(before), ["private old answer"]);
  assert.equal(await scoped.meta(legacy), null);
  version = "after-delete";
  assert.equal(await scoped.meta(before), null);
  assert.deepEqual(await scoped.chunks(before), []);
  assert.deepEqual(await scoped.list("alice"), []);
  assert.equal((await scoped.reads([before]))[0].meta, null);
  await scoped.append(before, "late internal work");
  await scoped.finish(before, { status: "error" });
  assert.equal((await raw.meta(before)).status, "error");
  const after = await scoped.create("alice", "new question");
  await scoped.append(after, "safe new answer");
  assert.deepEqual(await scoped.chunks(after), ["safe new answer"]);
  const down = scopeAskStore(raw, principal, { deletionVersion: async () => { throw new Error("database unavailable"); } });
  await assert.rejects(() => down.meta(after), /unavailable/);
  await assert.rejects(() => down.chunks(after), /unavailable/);
  await assert.rejects(() => down.create("alice", "new"), /unavailable/);
});

test("a deletion during chunk retrieval suppresses that batch", async () => {
  const raw = createAskStore({});
  let version = "before";
  const scoped = scopeAskStore(raw, { user: "alice", tenantId: "company-a", workspace: "company" }, { deletionVersion: async () => version });
  const id = await scoped.create("alice", "question");
  await scoped.append(id, "private");
  const chunks = raw.chunks;
  raw.chunks = async (...args) => { const rows = await chunks(...args); version = "after"; return rows; };
  assert.deepEqual(await scoped.chunks(id), []);
});
