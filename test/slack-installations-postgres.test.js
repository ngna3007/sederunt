import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { createTenantBind } from "../src/tenant-bind.js";
import { slackConnection, slackEventTenant, installationFetch } from "../src/slack/tenant-slack.js";
import { createSupabaseInstallationStore } from "../src/slack/installations.js";

// Opt-in, loopback ONLY. Bootstrap the proposed migration in a disposable
// slack_mt_test database, then run a real PostgREST server against it.
// SLACK_LOCAL_POSTGREST_URL=http://127.0.0.1:55440
// SLACK_LOCAL_PG_URL=postgres://localtester:local-only@127.0.0.1:55439/slack_mt_test
// PostgREST JWT secret: local-slack-test-only-signing-secret-32-bytes
const restUrl = process.env.SLACK_LOCAL_POSTGREST_URL;
const dbUrl = process.env.SLACK_LOCAL_PG_URL;
const run = promisify(execFile);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("real local Postgres + PostgREST: atomic install/replacement, encrypted persistence, replay and revocation CAS, privilege isolation", { skip: !restUrl || !dbUrl }, async (t) => {
  const rest = new URL(restUrl);
  const db = new URL(dbUrl);
  assert.equal(rest.hostname, "127.0.0.1");
  assert.equal(rest.protocol, "http:");
  assert.equal(db.hostname, "127.0.0.1");
  assert.equal(db.pathname, "/slack_mt_test");
  const jwt = (role) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    return `${unsigned}.${createHmac("sha256", "local-slack-test-only-signing-secret-32-bytes").update(unsigned).digest("base64url")}`;
  };
  const sql = async (query) => (await run("psql", [dbUrl, "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query])).stdout.trim();
  assert.equal(await sql("select current_database()"), "slack_mt_test");
  await sql("truncate public.slack_installations, public.slack_oauth_consumed, public.slack_connection_state");
  await sql("insert into public.tenants select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,30) i on conflict do nothing");
  const env = { MCP_SECRETS_KEY_V1: Buffer.alloc(32, 17).toString("base64") };
  const options = { url: restUrl, key: jwt("service_role"), env,
    // Supabase prefixes PostgREST with /rest/v1. Standalone PostgREST does not.
    fetchImpl: (url, init) => { const target = new URL(url); target.pathname = target.pathname.replace(/^\/rest\/v1/, ""); return fetch(target, init); } };
  const store = createSupabaseInstallationStore(options);
  const save = (tenant, team, extra = {}) => store.save({ tenantId: id(tenant), teamId: team, token: `xoxb-local-${tenant}`, appId: "APP", botUserId: "UBOT", ...extra });

  await t.test("concurrent absent same-tenant installs have one winner", async () => {
    const results = await Promise.allSettled([save(1, "TONE"), save(1, "TTWO")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await sql(`select count(*) from slack_installations where tenant_id='${id(1)}'`), "1");
  });
  await t.test("same-team claims by different tenants have one winner", async () => {
    const results = await Promise.allSettled([save(2, "TSHARED"), save(3, "TSHARED")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.reason, "conflict");
  });
  await t.test("competing explicit replacements use expected generation, including stale same-team reconsent", async () => {
    const current = await store.get(id(1));
    const results = await Promise.allSettled([save(1, "TNEWONE", { replace: true, expectedGeneration: current.generation }), save(1, "TNEWTWO", { replace: true, expectedGeneration: current.generation })]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.reason, "stale");
    const next = await store.get(id(1));
    await assert.rejects(() => save(1, next.teamId, { expectedGeneration: current.generation }), (e) => e.reason === "stale");
    await assert.rejects(() => save(1, "TUNAPPROVED", { expectedGeneration: next.generation }), (e) => e.reason === "different-team");
  });
  await t.test("new store instance restores saved installations A -> B -> A; ciphertext remains server-only", async () => {
    const alpha = await save(4, "TALPHA", { channelId: "CA" });
    const beta = await save(5, "TBETA", { channelId: "CB" });
    for (const [tenant, team, generation] of [[4, "TALPHA", alpha.generation], [5, "TBETA", beta.generation], [4, "TALPHA", alpha.generation]]) {
      const restored = createSupabaseInstallationStore(options);
      assert.equal((await restored.get(id(tenant))).teamId, team);
      assert.equal((await restored.tokenFor(id(tenant))).generation, generation);
      assert.equal((await restored.tokenFor(id(tenant))).token, `xoxb-local-${tenant}`);
      assert.equal(JSON.stringify(await restored.get(id(tenant))).includes("xoxb"), false);
    }
    assert.equal(await sql("select count(*) from slack_installations where encode(ciphertext, 'escape') like '%xoxb-local%'"), "0");
  });
  await t.test("distributed nonce consumption allows exactly one callback across store instances", async () => {
    const other = createSupabaseInstallationStore(options);
    const consumed = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? store : other).consumeState("random-local-single-use-nonce", Date.now() + 60000)));
    assert.equal(consumed.filter(Boolean).length, 1);
    assert.equal(await other.consumeState("expired-local-nonce", Date.now() - 1000), false);
  });
  await t.test("stale revoke app/bot/generation/time checks and delete/recreate ABA", async () => {
    const current = await store.get(id(4));
    const event = { teamId: "TALPHA", appId: "APP", botUserId: "UBOT", generation: current.generation, eventTime: Date.now() + 5000 };
    assert.equal(await store.revoke({ ...event, appId: "AOTHER" }), 0);
    assert.equal(await store.revoke({ ...event, botUserId: "UOTHER" }), 0);
    assert.equal(await store.revoke({ ...event, eventTime: Date.parse(current.updatedAt) - 1000 }), 0);
    const replaced = await save(4, "TALPHA", { expectedGeneration: current.generation });
    assert.equal(await store.revoke(event), 0);
    assert.equal((await store.get(id(4))).generation, replaced.generation);
    assert.equal(await store.revoke({ ...event, generation: replaced.generation }), 1);
    const recreated = await save(4, "TALPHA");
    assert.notEqual(recreated.generation, replaced.generation);
    await assert.rejects(() => save(4, "TTAKEOVER", { replace: true, expectedGeneration: replaced.generation }), (e) => e.reason === "stale");
  });
  const legacyWorkspace = async (tenant, team, installations = store) => {
    const tenantBind = createTenantBind({}, { memory: new Map() });
    await tenantBind.bind("slack", team, id(tenant));
    return { env: { SLACK_CLIENT_ID: "local", SLACK_CLIENT_SECRET: "local", SLACK_BOT_TOKEN: "xoxb-local-legacy" },
      tenantBind, slackInstallations: installations, deps: { slack: { async authTest() { return { ok: true, teamId: team }; } } } };
  };
  await t.test("live pre-OAuth legacy enrollment is durable; OAuth supersession survives revoke, failed reconnect, reinstall and explicit disconnect", async () => {
    const workspace = await legacyWorkspace(6, "TOLDLEGACY");
    const legacy = await slackConnection(workspace, id(6));
    assert.equal(legacy.source, "legacy");
    const oldRequest = installationFetch(workspace, id(6), legacy, async () => { throw Error("must not fetch"); });
    assert.equal(await sql(`select mode from slack_connection_state where tenant_id='${id(6)}'`), "legacy");
    const oauth = await save(6, "TNEWOAUTH");
    await assert.rejects(() => oldRequest("https://slack.com/api/chat.postMessage"), (e) => e.reason === "stale");
    assert.equal(await store.revoke({ teamId: "TNEWOAUTH", appId: "APP", botUserId: "UBOT", generation: oauth.generation, eventTime: Date.now() + 5000 }), 1);
    workspace.slackInstallations = createSupabaseInstallationStore(options); // restart, no in-memory suppression
    assert.equal((await slackConnection(workspace, id(6))).linked, false);
    assert.equal((await slackEventTenant(workspace, { teamId: "TOLDLEGACY", legacyTenantId: id(6) })).tenantId, "");
    await save(7, "TOCCUPIED");
    await assert.rejects(() => save(6, "TOCCUPIED"));
    assert.equal((await slackConnection(workspace, id(6))).linked, false);
    await save(6, "TREINSTALL");
    assert.equal((await slackConnection(workspace, id(6))).teamId, "TREINSTALL");
    assert.equal(await store.remove(id(6)), true);
    assert.equal(await store.legacyEligible({ tenantId: id(6), teamId: "TOLDLEGACY", enroll: true }), false);
    assert.equal((await slackConnection(workspace, id(6))).linked, false);
  });
  await t.test("failed first OAuth transaction does not damage valid legacy eligibility or leave an installation", async () => {
    const workspace = await legacyWorkspace(8, "TVALIDLEGACY");
    assert.equal((await slackConnection(workspace, id(8))).source, "legacy");
    await sql("alter table public.slack_connection_state add constraint local_reject_oauth check (mode <> 'oauth') not valid");
    try {
      await assert.rejects(() => save(8, "TROLLBACK"));
      assert.equal(await store.tokenFor(id(8)), null);
      assert.equal((await slackConnection(workspace, id(8))).source, "legacy");
    } finally { await sql("alter table public.slack_connection_state drop constraint local_reject_oauth"); }
    assert.equal(await store.remove(id(8)), true);
    assert.equal((await slackConnection(workspace, id(8))).linked, false);
  });
  await t.test("orphan Redis claims and deleted live legacy/OAuth tenants are denied by healthy real storage", async () => {
    const orphan = await legacyWorkspace(29, "TORPHAN");
    await sql(`delete from public.tenants where id='${id(29)}'`);
    assert.equal((await slackConnection(orphan, id(29))).linked, false);
    assert.equal((await slackEventTenant(orphan, { teamId: "TORPHAN", legacyTenantId: id(29) })).tenantId, "");
    const legacy = await legacyWorkspace(10, "TDELETEDLEGACY");
    assert.equal((await slackConnection(legacy, id(10))).source, "legacy");
    const oauth = await legacyWorkspace(11, "TDELETEDOLD");
    await save(11, "TDELETEDOAUTH");
    await sql(`delete from public.tenants where id in ('${id(10)}','${id(11)}')`);
    for (const [workspace, tenant, team] of [[legacy,10,"TDELETEDLEGACY"],[oauth,11,"TDELETEDOLD"]]) {
      assert.equal((await slackConnection(workspace, id(tenant))).linked, false);
      assert.equal((await slackEventTenant(workspace, { teamId: team, legacyTenantId: id(tenant) })).tenantId, "");
    }
    assert.equal(await store.byTeam("TDELETEDOAUTH"), null);
    assert.equal((await slackEventTenant(oauth, { teamId: "TDELETEDOAUTH", legacyTenantId: id(11) })).tenantId, "");
  });
  await t.test("eligibility RPC persistence denial fails closed with live Redis claims and healthy installation reads", async () => {
    const workspace = await legacyWorkspace(9, "TOUTAGELEGACY");
    assert.equal((await slackConnection(workspace, id(9))).source, "legacy");
    await sql("revoke execute on function public.slack_legacy_eligible(uuid,text,boolean) from service_role");
    try {
      assert.equal(await store.tokenFor(id(9)), null);
      await assert.rejects(() => slackConnection(workspace, id(9)));
      await assert.rejects(() => slackEventTenant(workspace, { teamId: "TOUTAGELEGACY", legacyTenantId: id(9) }));
    } finally { await sql("grant execute on function public.slack_legacy_eligible(uuid,text,boolean) to service_role"); }
  });
  await t.test("concurrent legacy/OAuth team claims serialize to one owner; same-tenant OAuth permanently supersedes legacy", async () => {
    for (let n=12; n<24; n+=2) {
      const team = `TRACED${n}`;
      const results = await Promise.allSettled([
        store.legacyEligible({ tenantId: id(n), teamId: team, enroll: true }), save(n+1, team),
      ]);
      const legacyWon = results[0].status === "fulfilled" && results[0].value === true;
      const oauthWon = results[1].status === "fulfilled";
      assert.equal(Number(legacyWon) + Number(oauthWon), 1);
      assert.equal(await store.legacyEligible({ tenantId: id(n), teamId: team }), legacyWon);
      assert.equal(Boolean(await store.byTeam(team)), oauthWon);
    }
    await Promise.all([store.legacyEligible({ tenantId: id(26), teamId: "TSAMEOLD", enroll: true }), save(26,"TSAMENEW")]);
    assert.equal(await store.legacyEligible({ tenantId: id(26), teamId: "TSAMEOLD", enroll: true }), false);
    assert.equal((await store.get(id(26))).teamId, "TSAMENEW");
  });
  await t.test("anon/authenticated cannot read tokens, write installations or invoke privileged functions", async () => {
    for (const role of ["anon", "authenticated"]) {
      const headers = { authorization: `Bearer ${jwt(role)}`, "content-type": "application/json" };
      const get = await fetch(`${restUrl}/slack_installations?select=*`, { headers });
      assert.ok([401,403].includes(get.status));
      const rpc = await fetch(`${restUrl}/rpc/slack_oauth_consume`, { method: "POST", headers, body: JSON.stringify({ p_nonce_hash: "a".repeat(64), p_expires_at: new Date(Date.now()+60000).toISOString() }) });
      assert.ok([401,403].includes(rpc.status));
      const state = await fetch(`${restUrl}/slack_connection_state?select=*`, { headers });
      assert.ok([401,403].includes(state.status));
      for (const [fn, body] of [
        ["slack_legacy_eligible", {p_tenant_id:id(6),p_team_id:"TOLDLEGACY",p_enroll:true}],
        ["slack_installation_disconnect", {p_tenant_id:id(6),p_expected_generation:null}],
      ]) {
        const result = await fetch(`${restUrl}/rpc/${fn}`, {method:"POST",headers,body:JSON.stringify(body)});
        assert.ok([401,403].includes(result.status));
      }
      const post = await fetch(`${restUrl}/slack_installations`, { method: "POST", headers, body: "{}" });
      assert.ok([401,403].includes(post.status));
    }
  });
});
