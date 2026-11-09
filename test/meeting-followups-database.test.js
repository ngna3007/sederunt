import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const container = process.env.FOLLOWUP_TEST_POSTGRES_CONTAINER;
test("real PostgreSQL atomically claims versions, persists receipts and isolates tenants", { skip: !container }, async () => {
  const database = `followup_test_${randomBytes(6).toString("hex")}`;
  const psql = (db, sql) => new Promise((resolve, reject) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq"], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
    child.stdin.end(sql);
  });
  const own = "11111111-1111-4111-a111-111111111111";
  const other = "22222222-2222-4222-a222-222222222222";
  await psql("postgres", `create database ${database}`);
  try {
    await psql(database, `do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$; create table public.tenants(id uuid primary key); insert into public.tenants values('${own}'),('${other}');`);
    await psql(database, await readFile(new URL("../supabase/migrations/20261109130000_meeting_followups.sql", import.meta.url), "utf8"));
    const put = (tenant) => `select (public.meeting_followup_put('${tenant}','action-1','room-1','action','pending','{"argumentVersion":1}')).revision`;
    assert.equal(await psql(database, put(own)), "1");
    assert.equal(await psql(database, put(own)), "1", "idempotent insert preserves existing state");
    assert.equal(await psql(database, put(other)), "1");
    const claim = `select (public.meeting_followup_change('${own}','action-1',1,'running','{"claimId":"claimed","argumentVersion":1}')).revision`;
    const claims = await Promise.all([psql(database, claim), psql(database, claim)]);
    assert.equal(claims.filter(value => value === "2").length, 1, "two independent PostgreSQL sessions cannot claim the same revision");
    assert.equal(await psql(database, `select (public.meeting_followup_change('${own}','action-1',1,'skipped','{}')).revision`), "", "a stale Skip cannot reopen the running claim");
    assert.equal(await psql(database, `select (public.meeting_followup_change('${own}','action-1',2,'done','{"receipt":{"connectorId":"form-1"}}')).revision`), "3");
    assert.equal(await psql(database, `select data->'receipt'->>'connectorId' from public.meeting_followups where tenant_id='${own}'`), "form-1", "fresh connection reads durable receipt");
    assert.equal(await psql(database, `select status from public.meeting_followups where tenant_id='${other}'`), "pending");
    await assert.rejects(psql(database, `set role authenticated; select * from public.meeting_followups`), /permission denied/);
    await assert.rejects(psql(database, `set role authenticated; ${put(own)}`), /permission denied/);
    await assert.rejects(psql(database, `set role anon; select public.meeting_followup_change('${own}','action-1',3,'pending','{}')`), /permission denied/);
    assert.equal(await psql(database, `set role service_role; select (public.meeting_followup_put('${own}','delivery-1','room-1','delivery','pending','{}')).revision`), "1");
    await assert.rejects(psql(database, `select public.meeting_followup_put('${own}','action-1','another-room','action','pending','{}')`), /identity conflict/);
    await psql(database, `delete from public.tenants where id='${own}'`);
    assert.equal(await psql(database, `select count(*) from public.meeting_followups where tenant_id='${own}'`), "0", "tenant reset removes follow-up credentials and claims");
  } finally { await psql("postgres", `drop database ${database} with (force)`); }
});
