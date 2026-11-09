import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { actionClaimKey } from "../src/domain/action-claims.js";

test("concurrent instances claim a source action once and never release it", { skip: !process.env.ACTION_CLAIMS_TEST_POSTGRES_CONTAINER }, async () => {
  const container = process.env.ACTION_CLAIMS_TEST_POSTGRES_CONTAINER;
  const database = `action_claim_${randomBytes(6).toString("hex")}`;
  const sql = (db, query) => new Promise((resolve, reject) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq"], (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
    child.stdin.end(query);
  });
  await sql("postgres", `create database ${database}`);
  try {
    await sql(database, "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$; create table public.tenants(id uuid primary key); insert into public.tenants values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');");
    await sql(database, await readFile(new URL("../supabase/migrations/20261109150000_action_claims.sql", import.meta.url), "utf8"));
    const key = actionClaimKey({ tenantId: "11111111-1111-4111-8111-111111111111", roomId: "meeting", sourceId: "message", action: "write" });
    const query = `set role service_role; select public.claim_action_execution('11111111-1111-4111-8111-111111111111','${key}')`;
    const values = await Promise.all([sql(database, query), sql(database, query)]);
    assert.deepEqual(values.sort(), ["f", "t"]);
    assert.equal(await sql(database, query), "f");
    assert.equal(await sql(database, `set role service_role; select public.claim_action_execution('22222222-2222-4222-8222-222222222222','${key}')`), "t");
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(sql(database, `set role ${role}; select public.claim_action_execution('11111111-1111-4111-8111-111111111111','${key}')`), /permission denied/);
      await assert.rejects(sql(database, `set role ${role}; select * from public.action_execution_claims`), /permission denied/);
    }
    await assert.rejects(sql(database, "set role service_role; select public.claim_action_execution('11111111-1111-4111-8111-111111111111','plaintext')"));
  } finally { await sql("postgres", `drop database ${database} with (force)`); }
});
