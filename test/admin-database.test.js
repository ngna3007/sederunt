import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createAskStore } from "../src/ask/store.js";
import { createTenantBind } from "../src/tenant-bind.js";

test("admin migration preserves Google identity, checks current membership and isolates shared workspaces", { skip: !process.env.ADMIN_TEST_POSTGRES_CONTAINER }, async () => {
  const container = process.env.ADMIN_TEST_POSTGRES_CONTAINER;
  const database = `admin_test_${randomBytes(6).toString("hex")}`;
  const psql = (db, sql) => new Promise((resolve, reject) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-q"], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout));
    child.stdin.end(sql);
  });
  await psql("postgres", `create database ${database}`);
  try {
    const bootstrap = `
      do $$ begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      end $$;
      create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
    `;
    const root = new URL("../supabase/migrations/", import.meta.url);
    const names = (await readdir(root)).filter((name) => name.endsWith(".sql")).sort();
    const migrations = await Promise.all(names.map((name) => readFile(new URL(name, root), "utf8")));
    await psql(database, bootstrap + migrations.join("\n"));
    const assertions = await readFile(new URL("./fixtures/admin-reset.sql", import.meta.url), "utf8");
    await psql(database, assertions);
  } finally { await psql("postgres", `drop database ${database} with (force)`); }
});

test("Redis reset keeps late refunds and late answer writes out of the restarted account", { skip: !process.env.ADMIN_TEST_REDIS_URL }, async () => {
  const prefix = `sederunt:admin-test:${randomBytes(6).toString("hex")}`;
  const store = createAskStore({ REDIS_URL: process.env.ADMIN_TEST_REDIS_URL, ASK_REDIS_PREFIX: prefix });
  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.ADMIN_TEST_REDIS_URL });
  await client.connect();
  try {
    const old = await store.claim("demo", 5);
    const id = await store.create("demo", "old question");
    const otherId = await store.create("other", "other question");
    for (let i = 0; i < 25; i++) await store.create("demo", `older answer ${i}`);
    await store.append(id, "old answer");
    await store.resetQuota("demo");
    await store.claim("demo", 5);
    await store.refund("demo", old.quotaKey);
    assert.equal((await store.quota("demo", 5)).used, 1);
    await store.resetHistory("demo");
    await Promise.all([store.append(id, "late answer"), store.replace(id, "late replacement"), store.finish(id, { status: "done" })]);
    assert.equal(await store.meta(id), null);
    assert.deepEqual(await store.chunks(id), []);
    assert.deepEqual(await store.list("demo"), []);
    assert.equal((await store.meta(otherId)).question, "other question");
  } finally {
    const keys = await client.keys(`${prefix}:*`);
    if (keys.length) await client.del(keys);
    await client.quit();
    await store.close();
  }
});

test("retired Slack and meeting bindings can be reclaimed without removing another workspace's bindings", { skip: !process.env.ADMIN_TEST_REDIS_URL }, async () => {
  const tenant = `admin-fixture-${randomBytes(6).toString("hex")}`;
  const env = { REDIS_URL: process.env.ADMIN_TEST_REDIS_URL };
  const bind = createTenantBind(env);
  const observer = createTenantBind(env);
  try {
    assert.equal((await bind.bind("slack", `${tenant}:team`, tenant)).ok, true);
    assert.equal((await bind.bind("bot", `${tenant}:bot`, tenant)).ok, true);
    assert.equal((await bind.bind("slack", `${tenant}:other`, `${tenant}-other`)).ok, true);
    assert.equal(await observer.resolve("slack", `${tenant}:team`), tenant);
    assert.equal(await bind.releaseTenants([tenant]), 2);
    assert.equal(await observer.resolve("slack", `${tenant}:team`), "");
    assert.equal(await bind.resolve("slack", `${tenant}:other`), `${tenant}-other`);
    assert.equal((await observer.bind("slack", `${tenant}:team`, `${tenant}-fresh`)).ok, true);
  } finally { await bind.releaseTenants([tenant, `${tenant}-fresh`, `${tenant}-other`]); }
});
