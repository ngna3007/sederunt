import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { deletionTargets } from "../src/memory/deletions.js";

test("durable deletion claims exclude competing workers, fence expired owners and retain tombstones after restart", { skip: !process.env.DELETION_TEST_POSTGRES_CONTAINER }, async () => {
  const container = process.env.DELETION_TEST_POSTGRES_CONTAINER;
  const database = `deletion_${randomBytes(6).toString("hex")}`;
  const sql = (db, query) => new Promise((resolve, reject) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq"], (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
    child.stdin.end(query);
  });
  await sql("postgres", `create database ${database}`);
  try {
    await sql(database, "do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;");
    await sql(database, await readFile(new URL("../supabase/migrations/20261109110000_memory_deletions.sql", import.meta.url), "utf8"));
    const scope = { tenantId: "11111111-1111-4111-8111-111111111111", roomId: "private-room", sourceIds: ["private-source"] };
    const targets = JSON.stringify(deletionTargets(scope));
    const request = `select row_to_json(d) from public.memory_deletion_request('${targets}'::jsonb) d;`;
    const original = JSON.parse(await sql(database, `set role service_role; ${request}`));
    const [claimA, claimB] = await Promise.all([
      sql(database, "begin; set role service_role; select row_to_json(d) from public.memory_deletion_claim(1,60) d; select pg_sleep(0.2); commit;"),
      sql(database, "begin; set role service_role; select row_to_json(d) from public.memory_deletion_claim(1,60) d; select pg_sleep(0.2); commit;"),
    ]);
    const claims = [claimA, claimB].filter(Boolean).map(JSON.parse);
    assert.equal(claims.length, 1);
    const old = claims[0];
    assert.equal((await sql(database, "select count(*) from public.memory_deletion_claim(1,60)")), "0");
    await sql(database, "update public.memory_deletions set lease_until=now()-interval '1 second'");
    assert.equal(await sql(database, `select public.memory_deletion_finish('${old.id}','${old.lease_token}',true)`), "f");
    const fresh = JSON.parse(await sql(database, "select row_to_json(d) from public.memory_deletion_claim(1,60) d"));
    assert.notEqual(fresh.lease_token, old.lease_token);
    assert.equal(fresh.attempts, 2);
    assert.equal(await sql(database, `select public.memory_deletion_finish('${old.id}','${old.lease_token}',false)`), "f");
    assert.equal(await sql(database, `select public.memory_deletion_finish('${fresh.id}','${fresh.lease_token}',false)`), "t");
    assert.equal(await sql(database, "select count(*) from public.memory_deletion_claim(1,60)"), "0");
    await sql(database, "update public.memory_deletions set next_attempt_at=now()-interval '1 second'");
    const retry = JSON.parse(await sql(database, "select row_to_json(d) from public.memory_deletion_claim(1,60) d"));
    assert.equal(await sql(database, `select public.memory_deletion_finish('${retry.id}','${retry.lease_token}',true)`), "t");
    const replay = JSON.parse(await sql(database, request));
    assert.equal(replay.id, original.id); assert.equal(replay.state, "done");
    const restarted = JSON.parse(await sql(database, `set role service_role; select row_to_json(d) from public.memory_deletion_list('${scope.tenantId}') d`));
    assert.equal(restarted.state, "done");
    assert.equal(JSON.stringify(restarted).includes("private"), false);
    assert.equal(await sql(database, "select count(*) from public.memory_deletion_list('22222222-2222-4222-8222-222222222222')"), "0");
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(sql(database, `set role ${role}; select * from public.memory_deletion_list('${scope.tenantId}')`), /permission denied/);
      await assert.rejects(sql(database, `set role ${role}; select * from public.memory_deletions`), /permission denied/);
    }
    for (const query of ["select public.memory_deletion_claim(0,60)", "select public.memory_deletion_claim(1,301)", "select public.memory_deletion_request('[]')", "select public.memory_deletion_request('null')", `select public.memory_deletion_finish('${retry.id}','${retry.lease_token}',null)`]) await assert.rejects(sql(database, query));
  } finally { await sql("postgres", `drop database ${database} with (force)`); }
});
