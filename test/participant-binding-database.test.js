import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";

test("participant bindings use verified current tenant membership and meeting-scoped IDs across all migrations", { skip: !process.env.PARTICIPANT_TEST_POSTGRES_CONTAINER }, async () => {
  const container = process.env.PARTICIPANT_TEST_POSTGRES_CONTAINER;
  const database = `participants_${randomBytes(6).toString("hex")}`;
  const sql = (db, query) => new Promise((resolve, reject) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq"], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
    child.stdin.end(query);
  });
  await sql("postgres", `create database ${database}`);
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
    const files = (await readdir(root)).filter((file) => file.endsWith(".sql")).sort();
    await sql(database, bootstrap + (await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8")))).join("\n"));
    const tenant = "11111111-1111-4111-8111-111111111111";
    const otherTenant = "22222222-2222-4222-8222-222222222222";
    const mina = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const unverified = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await sql(database, `insert into auth.users(id,email,email_confirmed_at) values ('${mina}','mina@example.test',now()),('${other}','other@example.test',now()),('${unverified}','pending@example.test',null);
      insert into public.tenants(id,kind,name) values('${tenant}','company','Fixture'),('${otherTenant}','company','Other');
      insert into public.memberships(tenant_id,user_id,role) values ('${tenant}','${mina}','member'),('${tenant}','${other}','owner'),('${tenant}','${unverified}','member');`);
    const record = (room, email, company = tenant) => `set role service_role; select public.record_verified_participant('${company}','${room}','100','${email}');`;
    await sql(database, record("meeting-a", " Mina@Example.Test "));
    await sql(database, record("meeting-a", "mina@example.test"));
    await sql(database, record("meeting-b", "other@example.test"));
    await sql(database, record("meeting-c", "pending@example.test"));
    await sql(database, record("meeting-a", "mina@example.test", otherTenant));
    const bindings = async (user, company = tenant) => JSON.parse(await sql(database, `set role service_role; select coalesce(json_agg(b),'[]') from public.verified_participants_for_user('${company}','${user}') b`));
    assert.deepEqual(await bindings(mina), [{ roomId: "meeting-a", memberId: "100" }]);
    assert.deepEqual(await bindings(other), [{ roomId: "meeting-b", memberId: "100" }]);
    assert.deepEqual(await bindings(unverified), []);
    assert.deepEqual(await bindings(mina, otherTenant), []);
    await assert.rejects(sql(database, record("meeting-a", "other@example.test")), /participant identity changed/);
    assert.deepEqual(await bindings(mina), [{ roomId: "meeting-a", memberId: "100" }]);
    await sql(database, `delete from public.memberships where tenant_id='${tenant}' and user_id='${mina}'`);
    assert.deepEqual(await bindings(mina), []);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(sql(database, `set role ${role}; select * from public.verified_room_participants`), /permission denied/);
      await assert.rejects(sql(database, `set role ${role}; select * from public.verified_participants_for_user('${tenant}','${other}')`), /permission denied/);
      await assert.rejects(sql(database, `set role ${role}; select public.record_verified_participant('${tenant}','forged','100','other@example.test')`), /permission denied/);
    }
  } finally { await sql("postgres", `drop database ${database} with (force)`); }
});
