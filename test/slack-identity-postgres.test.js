import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { workspaceChannelId } from "../src/files/session.js";

// Opt-in, loopback only. A DISPOSABLE database with every migration in
// supabase/migrations applied over a minimal Supabase bootstrap (roles anon,
// authenticated, service_role BYPASSRLS; auth.users with email and
// email_confirmed_at; auth.uid() from request.jwt.claim.sub; pgcrypto in
// schema extensions). Never point this at a real project.
// SLACK_IDENTITY_PG_URL=postgres://localtester:local-only@127.0.0.1:55481/sid_test
const dbUrl = process.env.SLACK_IDENTITY_PG_URL;
const run = promisify(execFile);

test("real Postgres: Slack identity link and channel bind are tenant-scoped, idempotent and service-only; Files upload then accepts the binding", { skip: !dbUrl || !/@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl || "") }, async () => {
  const sql = async (query) => (await run("psql", [dbUrl, "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query])).stdout.trim();
  const asService = async (query) => (await sql(`set role service_role; ${query}`)).replace(/^SET\n?/, "");
  const A = "a1a1a1a1-0000-4000-8000-00000000000a";
  const B = "b1b1b1b1-0000-4000-8000-00000000000b";
  const ANH = "d1d1d1d1-0000-4000-8000-00000000000d";
  const BEN = "e1e1e1e1-0000-4000-8000-00000000000e";
  const PENDING = "f1f1f1f1-0000-4000-8000-00000000000f";
  await sql(`
    delete from public.identities where provider = 'slack';
    delete from public.channel_bindings where provider = 'slack';
    delete from public.slack_installations where tenant_id in ('${A}', '${B}');
    delete from public.tenants where id in ('${A}', '${B}');
    delete from auth.users where id in ('${ANH}', '${BEN}', '${PENDING}');
    insert into auth.users (id, email, email_confirmed_at) values
      ('${ANH}', 'anh@northline.test', now()), ('${BEN}', 'ben@northline.test', now()), ('${PENDING}', 'pending@northline.test', null);
    insert into public.tenants (id, kind, name) values ('${A}', 'company', 'Northline'), ('${B}', 'company', 'Other');
    insert into public.memberships (tenant_id, user_id, role) values ('${A}', '${ANH}', 'owner'), ('${B}', '${BEN}', 'owner'), ('${A}', '${PENDING}', 'member');
    insert into public.slack_installations (tenant_id, team_id, ciphertext, nonce) values ('${A}', 'TNORTH', '\\x00', '\\x00'), ('${B}', 'TOTHER', '\\x00', '\\x00');
  `);
  const link = (tenant, team, user, email) => asService(`select coalesce(public.slack_identity_link('${tenant}', '${team}', '${user}', '${email}', 'Name')::text, '')`);
  assert.equal(await link(A, "TNORTH", "UANH", "ANH@Northline.test"), ANH);
  const first = await sql(`select linked_at from public.identities where external_user_id = 'UANH'`);
  assert.equal(await link(A, "TNORTH", "UANH", "anh@northline.test"), ANH);
  assert.equal(await sql(`select count(*) from public.identities where external_user_id = 'UANH'`), "1");
  assert.equal(await sql(`select linked_at from public.identities where external_user_id = 'UANH'`), first, "re-link keeps linked_at");
  assert.equal(await link(A, "TNORTH", "UBEN", "ben@northline.test"), "", "member of another tenant only");
  assert.equal(await link(A, "TOTHER", "UANH2", "anh@northline.test"), "", "team owned by another tenant");
  assert.equal(await link(A, "TNORTH", "UPEN", "pending@northline.test"), "", "unconfirmed account");
  assert.equal(await link(A, "TNORTH", "UANH", ""), "", "no email");
  assert.equal(await sql(`select count(*) from public.identities where external_user_id = 'UANH'`), "0", "stale link removed");
  assert.equal(await link(A, "TNORTH", "UANH", "anh@northline.test"), ANH);
  // A Slack user first kept as a guest, later linked, then no longer matching:
  // the guest stays and the stale user link is cleared (never kept).
  const guest = await sql(`insert into public.guests (tenant_id, display_name) values ('${A}', 'Guest') returning id`);
  await sql(`delete from public.identities where external_user_id = 'UGST'; insert into public.identities (provider, external_workspace_id, external_user_id, guest_id) values ('slack', 'TNORTH', 'UGST', '${guest.split("\n")[0]}')`);
  assert.equal(await link(A, "TNORTH", "UGST", "anh@northline.test"), ANH);
  assert.equal(await link(A, "TNORTH", "UGST", "someone@else.test"), "");
  assert.equal(await sql(`select coalesce(user_id::text, 'none') || ':' || (guest_id is not null) from public.identities where external_user_id = 'UGST'`), "none:true");
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(() => sql(`set role ${role}; select public.slack_identity_link('${A}', 'TNORTH', 'UANH', 'anh@northline.test', null)`), /permission denied/);
    await assert.rejects(() => sql(`set role ${role}; select public.slack_channel_bind('${A}', 'TNORTH', 'C0CELAUNCH1', '${workspaceChannelId(A)}')`), /permission denied/);
  }

  const bind = (tenant, team, channel) => asService(`select coalesce(public.slack_channel_bind('${tenant}', '${team}', '${channel}', '${workspaceChannelId(tenant)}')::text, '')`);
  assert.equal(await bind(A, "TNORTH", "C0CELAUNCH1"), workspaceChannelId(A));
  assert.equal(await bind(A, "TNORTH", "C0CELAUNCH1"), workspaceChannelId(A), "idempotent");
  assert.equal(await sql(`select count(*) from public.channel_bindings where external_channel_id = 'C0CELAUNCH1'`), "1");
  assert.equal(await sql(`select visibility || ':' || tenant_id from public.channels where id = '${workspaceChannelId(A)}'`), `tenant:${A}`);
  assert.equal(await bind(B, "TNORTH", "C0CELAUNCH1"), "", "tenant B cannot bind tenant A's team");
  assert.equal(await bind(A, "TNORTH", "D0CEDMXXXX1"), "", "a DM is never bound");
  await sql(`update public.channel_bindings set status = 'paused' where external_channel_id = 'C0CELAUNCH1'`);
  assert.equal(await bind(A, "TNORTH", "C0CELAUNCH1"), "", "a paused binding is respected");
  await sql(`update public.channel_bindings set status = 'active' where external_channel_id = 'C0CELAUNCH1'`);

  // The Files upload RPC now finds the binding and the linked member can stage bytes.
  const body = Buffer.from("launch brief bytes");
  const sha = (await import("node:crypto")).createHash("sha256").update(body).digest("hex");
  const file = JSON.stringify({ id: "c0c0c0c0-0000-4000-8000-0000000000c0", tenantId: A, channelId: workspaceChannelId(A), ownerUserId: ANH,
    name: "launch-brief.txt", mimeType: "text/plain", sizeBytes: body.length, sha256: sha, externalWorkspaceId: "TNORTH",
    externalChannelId: "C0CELAUNCH1", externalMessageId: "300.1", slackFileId: "FBRIEF" });
  await sql(`delete from public.files where id = 'c0c0c0c0-0000-4000-8000-0000000000c0'`);
  const staged = await asService(`select status || ':' || slack_file_id from public.files_runtime_upload('${ANH}', '${file}'::jsonb, '${body.toString("base64")}')`);
  assert.equal(staged, "uploading:FBRIEF");
  assert.equal(await sql(`select count(*) from public.file_jobs j join public.files f on f.id = j.file_id where f.slack_file_id = 'FBRIEF' and j.kind = 'upload'`), "1");
});
