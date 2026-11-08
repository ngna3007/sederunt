import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createSupabaseFileStore } from "../src/files/supabase-store.js";
import { createFileRuntime } from "../src/files/runtime.js";
import { createMemoryConsole } from "../src/files/memory-console.js";
import { runFileWorker } from "../src/files/worker.js";

const integration = process.env.FILES_TEST_INTEGRATION === "1";
const exec = (args, stdin) => new Promise((resolve, reject) => {
  const child = execFile("docker", args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()));
  child.stdin.end(stdin);
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("durable Files share state, recover claims and enforce current membership over PostgREST", { skip: !integration, timeout: 120000 }, async (t) => {
  const name = `sederunt-files-${randomBytes(5).toString("hex")}`;
  const database = `${name}-db`, api = `${name}-api`;
  const password = randomBytes(18).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const token = (role) => {
    const parts = [ { alg: "HS256", typ: "JWT" }, { role, exp: Math.floor(Date.now() / 1000) + 3600 } ].map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"));
    return `${parts.join(".")}.${createHmac("sha256", secret).update(parts.join(".")).digest("base64url")}`;
  };
  const psql = (sql) => exec(["exec", "-i", database, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], sql);
  await exec(["network", "create", name]);
  try {
    await exec(["run", "-d", "--name", database, "--network", name, "-e", `POSTGRES_PASSWORD=${password}`, "postgres:16-alpine"]);
    for (let i = 0; ; i++) {
      try { await psql("select 1"); break; } catch (error) { if (i >= 40) throw error; await wait(200); }
    }
    const root = new URL("../supabase/migrations/", import.meta.url);
    const migrations = await Promise.all((await readdir(root)).filter((n) => n.endsWith(".sql")).sort().map((n) => readFile(new URL(n, root), "utf8")));
    await psql(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz);
      ${migrations.join("\n")}
      grant usage on schema public to anon,authenticated,service_role;
    `);
    await exec(["run", "-d", "--name", api, "--network", name, "-p", "127.0.0.1::3000", "-e", `PGRST_DB_URI=postgres://postgres:${password}@${database}:5432/postgres`, "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", "-e", `PGRST_JWT_SECRET=${secret}`, "postgrest/postgrest:v12.2.12"]);
    const port = (await exec(["port", api, "3000/tcp"])).split(":").at(-1);
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(base)).ok) break; throw new Error("PostgREST not ready"); } catch (error) { if (i >= 40) throw error; await wait(200); }
    }
    const user = randomUUID(), other = randomUUID(), tenant = randomUUID(), channel = randomUUID();
    await psql(`insert into auth.users(id,email) values('${user}','owner@example.test'),('${other}','member@example.test');
      insert into public.tenants(id,kind,name,created_by) values('${tenant}','team','Files fixture','${user}');
      insert into public.memberships(tenant_id,user_id,role) values('${tenant}','${other}','member');
      insert into public.channels(id,tenant_id,name,visibility) values('${channel}','${tenant}','Documents','tenant');`);
    const env = { SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: token("service_role") };
    // Direct PostgREST has no Supabase gateway prefix; all responses remain real.
    const tracedFetch = async (...args) => { args[0] = args[0].replace("/rest/v1/", "/"); const response = await fetch(...args); return response; };
    const first = createSupabaseFileStore({ env, fetch: tracedFetch }), second = createSupabaseFileStore({ env, fetch: tracedFetch });
    const storage = createMemoryConsole();
    const runtime = (store) => createFileRuntime({ env, store, storage, memory: { forgetFile: async () => ({ skipped: true, reason: "Fixture memory disabled" }) } });
    const a = runtime(first), b = runtime(second);
    await t.test("folder credentials and session setup persist without granting membership", async () => {
      const created = await first.addChannel({ id: randomUUID(), tenantId: tenant, name: "Private", visibility: "invited" });
      assert.equal((await second.addChannel(created)).id, created.id);
      const member = await first.addMember({ userId: other, tenantId: tenant, name: "Member", role: "owner" });
      assert.equal(member.memberships[0].role, "member");
      await assert.rejects(() => first.addMember({ userId: other, tenantId: randomUUID() }), (e) => e.status === 403);
      const credential = await first.saveConsoleCredential({ folderId: "isolated", ciphertext: Buffer.from("sealed-key"), nonce: Buffer.alloc(12, 1), keyVersion: 1 });
      assert.deepEqual((await second.findConsoleCredential(credential.id)).ciphertext, Buffer.from("sealed-key"));
      assert.equal((await first.saveConsoleCredential({ folderId: "isolated", ciphertext: Buffer.from("rotated"), nonce: Buffer.alloc(12, 2), keyVersion: 2 })).id, credential.id);
      await first.saveConsoleTenant({ tenantId: tenant, spaceId: "space", folderId: "isolated", credentialId: credential.id });
      assert.equal((await second.findConsoleTenant(tenant)).spaceId, "space");
      assert.equal((await second.findConsoleTenantByFolder("isolated")).credentialId, credential.id);
      assert.equal(await second.findConsoleTenantByFolder("missing"), null);
      await first.saveConsoleFolder({ spaceId: "space", name: "Shared", folderId: "shared" });
      assert.equal((await second.findConsoleFolder("space", "Shared")).folderId, "shared");
      assert.equal(await second.isAdmin(user, tenant), true);
      assert.equal(await second.isAdmin(other, tenant), false);
      assert.equal(await second.canSeeChannel(other, created.id), false);
    });
    let file;
    await t.test("acknowledged bytes and metadata survive a fresh runtime", async () => {
      file = await a.service.upload({ actorUserId: user, channelId: channel, name: "notes.txt", bytes: Buffer.from("Durable fixture") });
      assert.equal(file.status, "uploading");
      assert.ok(Buffer.isBuffer(file.sha256));
      assert.equal((await second.listOwnInFlight(user))[0].id, file.id);
      assert.equal((await second.peekUpload(file.id)).toString(), "Durable fixture");
      assert.equal((await b.service.list(user)).uploading[0].id, file.id);
      await runFileWorker(b);
      assert.equal((await a.service.list(other)).files[0].id, file.id);
      assert.equal((await second.listVisible(other))[0].id, file.id);
      assert.equal((await first.peekUpload(file.id)), null);
      assert.equal((await a.service.download(other, file.id)).bytes.toString(), "Durable fixture");
    });
    await t.test("only one worker claims a job and expired tokens cannot mutate or settle it", async () => {
      const next = await a.service.upload({ actorUserId: user, channelId: channel, name: "race.txt", bytes: Buffer.from("race") });
      const claims = await Promise.all([first.claimJob(), second.claimJob()]);
      assert.equal(claims.filter(Boolean).length, 1);
      const old = claims.find(Boolean);
      assert.equal(old.fileId, next.id);
      await psql(`update public.file_jobs set lease_until=now()-interval '1 second' where id=${old.id}`);
      const current = await second.claimJob();
      assert.equal(current.id, old.id);
      assert.notEqual(current.claimToken, old.claimToken);
      assert.equal(await first.finishJob(old.id, old.claimToken), null);
      await assert.rejects(() => first.workerMutation(old, "active", { spaceId: "x", folderId: "x", fileId: "x" }), (e) => e.code === "lease_lost");
      assert.equal((await second.finishJob(current.id, current.claimToken)).status, "done");
    });
    await t.test("deletion during upload retains the remote receipt and blocks activation", async () => {
      const draft = await a.service.upload({ actorUserId: user, channelId: channel, name: "cancel.txt", bytes: Buffer.from("cancel") });
      const claim = await first.claimJob();
      assert.equal(claim.fileId, draft.id);
      assert.equal(await first.renewJob(claim), true);
      await psql(`update public.messages set deleted_at=now() where id='${draft.messageId}'`);
      const accepted = { spaceId: "space-demo", folderId: "folder-demo", fileId: "cancel-receipt" };
      await first.workerMutation(claim, "accepted", accepted);
      assert.equal((await second.getFile(draft.id)).consoleFileId, "cancel-receipt");
      assert.equal((await first.workerMutation(claim, "active", accepted)).status, "pending_delete");
      const memoryClaim = await second.claimJob();
      assert.equal(memoryClaim.kind, "delete_memory");
      assert.equal(await second.claimJob(), null);
      await second.finishJob(memoryClaim.id, memoryClaim.claimToken);
      await first.finishJob(claim.id, claim.claimToken);
      await runFileWorker(b);
      assert.equal((await first.getFile(draft.id)).status, "deleted");
      assert.ok(storage.calls.some((c) => c.op === "remove" && c.fileId === "cancel-receipt"));
    });
    await t.test("delete requests and owner approval persist across independent runtimes", async () => {
      const draft = await a.service.upload({ actorUserId: user, channelId: channel, name: "request.txt", bytes: Buffer.from("request") });
      await runFileWorker(a);
      const asked = await second.requestDelete(other, draft.id, "Please remove");
      assert.equal((await a.service.list(user)).requests.find((r) => r.id === asked.id).canAnswer, true);
      await assert.rejects(() => second.requestDelete(other, draft.id, "Again"), (e) => e.status === 409);
      const answered = await first.answerDelete(user, asked.id, true);
      assert.equal(answered.request.status, "approved");
      assert.equal(answered.file.status, "pending_delete");
      await runFileWorker(b);
      assert.equal((await second.getFile(draft.id)).status, "deleted");
    });
    await t.test("a deletion is immediately shared and stale import cannot resurrect it", async () => {
      const active = await first.getFile(file.id);
      assert.equal((await first.deleteFile(user, file.id)).status, "pending_delete");
      assert.equal((await b.service.list(other)).files.some((f) => f.id === file.id), false);
      await assert.rejects(() => b.service.download(other, file.id), (e) => e.status === 404);
      await second.importActive(active);
      assert.equal((await first.getFile(file.id)).status, "pending_delete");
      await runFileWorker(b);
      assert.equal((await first.getFile(file.id)).status, "deleted");
      await second.importActive(active);
      assert.equal((await first.getFile(file.id)).status, "deleted");
    });
    await t.test("leaving a tenant revokes downloads and owner actions on every instance", async () => {
      const fresh = await a.service.upload({ actorUserId: user, channelId: channel, name: "leave.txt", bytes: Buffer.from("leave") });
      await runFileWorker(a);
      await psql(`delete from public.memberships where tenant_id='${tenant}' and user_id='${other}'`);
      await assert.rejects(() => b.service.download(other, fresh.id), (e) => e.status === 404);
      await psql(`delete from public.memberships where tenant_id='${tenant}' and user_id='${user}'`);
      await assert.rejects(() => first.deleteFile(user, fresh.id), (e) => e.status === 404);
      assert.equal((await b.service.list(user)).files.length, 0);
    });
    await t.test("client roles cannot claim work or read staged bytes", async () => {
      const headers = { Authorization: `Bearer ${token("authenticated")}`, "Content-Type": "application/json" };
      assert.equal((await fetch(`${base}/rpc/files_runtime_claim`, { method: "POST", headers, body: "{}" })).ok, false);
      assert.equal((await fetch(`${base}/file_upload_staging`, { headers })).ok, false);
    });
  } finally {
    await exec(["rm", "-f", api]).catch(() => {});
    await exec(["rm", "-f", database]).catch(() => {});
    await exec(["network", "rm", name]);
  }
});
