import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createSession } from "../src/session.js";
import { createTenantBind } from "../src/tenant-bind.js";
import { createMemoryInstallationStore } from "../src/slack/installations.js";
import {
  createMemorySlackIdentityStore, createSlackIdentityStore, createSlackMemberResolver,
  slackChannelBindable, slackReadPrincipal, slackUserEmail,
} from "../src/slack/identity-link.js";
import { createFileRuntime } from "../src/files/runtime.js";
import { createFileStore } from "../src/files/store.js";
import { createMemoryConsole } from "../src/files/memory-console.js";
import { workspaceChannelId } from "../src/files/session.js";
import { createApp, storedFileBytes } from "../src/server.js";

// Demo steps 4-6 (Nov 11 audit): a Slack DM from the meeting's own host stayed
// silent because the Slack id never matched the Meet room's Sederunt member,
// and channel files never reached Walrus because no binding or identity existed.

const SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
const SLACK_SECRET = "slack-identity-signing";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ANH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ROOM = "meet-room-launch";

const people = {
  UANH: { email: "Anh@Northline.test", confirmed: true },
  UBEN: { email: "ben@northline.test", confirmed: true },
  UOUT: { email: "stranger@else.test", confirmed: true },
  UUNC: { email: "anh@northline.test", confirmed: false },
  // Slack Connect: another organization's user carrying the host's email.
  UEXT: { email: "anh@northline.test", confirmed: true, team: "TCONNECT" },
};

function env(extra = {}) {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: "slack-identity-session",
    COMPANY_MEMWAL_KEY: "k",
    COMPANY_MEMWAL_ACCOUNT_ID: "acct",
    MCP_SECRETS_KEY_V1: SECRETS_KEY,
    SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
    SLACK_CLIENT_ID: "111.222",
    SLACK_CLIENT_SECRET: "client-secret",
    SLACK_SIGNING_SECRET: SLACK_SECRET,
    ...extra,
  };
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function slackApi(log, { channelPrivate = false, members = ["UANH", "UBEN"] } = {}) {
  return async (url, init = {}) => {
    const href = String(url);
    log.push({ href, auth: init.headers?.authorization || "", body: init.body });
    if (href.startsWith("https://files.slack.com/private/")) return new Response("launch brief bytes");
    if (href.startsWith("https://files.slack.com/upload/")) return new Response("OK");
    if (href.includes("users.info")) {
      const id = new URL(href).searchParams.get("user");
      const person = people[id];
      if (!person) return json({ ok: false, error: "user_not_found" });
      return json({ ok: true, user: { id, team_id: person.team || "TNORTH", is_bot: false, is_email_confirmed: person.confirmed, profile: { email: person.email, real_name: id } } });
    }
    if (href.includes("conversations.info")) {
      const id = new URL(href).searchParams.get("channel");
      return json({ ok: true, channel: { id, name: "launch", is_private: channelPrivate, is_member: true } });
    }
    if (href.includes("conversations.members")) return json({ ok: true, members });
    if (href.includes("conversations.history") || href.includes("conversations.replies")) return json({ ok: true, messages: [] });
    if (href.includes("files.info")) return json({ ok: true, file: { id: "FBRIEF", name: "launch-brief.txt", url_private_download: "https://files.slack.com/private/brief" } });
    if (href.includes("files.getUploadURLExternal")) return json({ ok: true, upload_url: "https://files.slack.com/upload/local", file_id: "FUP" });
    if (href.includes("files.completeUploadExternal")) return json({ ok: true, files: [{ id: "FUP" }] });
    if (href.includes("chat.postMessage")) return json({ ok: true, channel: "D1", ts: "9.9" });
    return json({ ok: true });
  };
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, body) {
  const payload = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${createHmac("sha256", SLACK_SECRET).update(`v0:${timestamp}:${payload}`).digest("hex")}`,
  };
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: "/api/slack", method: "POST", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* text */ }
        resolve({ status: res.statusCode, raw, json: parsed });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function posted(log) {
  return log.filter((entry) => entry.href.includes("chat.postMessage")).map((entry) => JSON.parse(entry.body));
}

function meetingSession() {
  const session = createSession();
  // PR 28: the Meet room stores who sent the bot; Recall names only participant "100".
  session.rooms.push({ id: ROOM, kind: "meeting", botPresent: true, memberIds: [ANH], platform: "google_meet" });
  session.decisions.push({
    id: "d-1", text: "Launch moves to Friday the 20th", roomId: ROOM, inviteMemberIds: ["100"],
    account: "company", kind: "decision", speakerMemberId: "100", spokenAt: "2026-11-11T10:00:00.000Z", fileNames: [],
  });
  return session;
}

async function setup(t, { session = meetingSession(), files = null, channelPrivate = false, members } = {}) {
  const log = [];
  const events = [];
  const installations = createMemoryInstallationStore({ MCP_SECRETS_KEY_V1: SECRETS_KEY });
  await installations.save({ tenantId: A, teamId: "TNORTH", teamName: "Northline", token: "xoxb-north", botUserId: "UBOTA", appId: "APP" });
  await installations.save({ tenantId: B, teamId: "TOTHER", teamName: "Other", token: "xoxb-other", botUserId: "UBOTB", appId: "APP" });
  const identities = createMemorySlackIdentityStore({
    teams: { TNORTH: A, TOTHER: B },
    members: [
      { tenantId: A, userId: ANH, email: "anh@northline.test" },
      // Ben is a verified member of another tenant only.
      { tenantId: B, userId: BEN, email: "ben@northline.test" },
    ],
  });
  const fetchImpl = slackApi(log, { channelPrivate, members });
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    env: env(),
    tenantBind: createTenantBind({}, { memory: new Map() }),
    slackInstallations: installations,
    slackIdentities: identities,
    sessions: new Map([[A, session]]),
    ...(files ? { files } : { files: false }),
    deps: {
      memory: { remembered, allowUnscoped: false, async remember(input) { remembered.push(input); return { blobId: null }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return null; } },
      slack: { fetch: fetchImpl },
      log: (event) => events.push(event),
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  return { port, log, events, identities, session };
}

function dm(user, text, ts) {
  return { type: "event_callback", team_id: "TNORTH", api_app_id: "APP", authorizations: [{ user_id: "UBOTA", is_bot: true }],
    event: { type: "message", channel_type: "im", channel: "D0CEANHDM01", user, text, ts, client_msg_id: `m-${ts}` } };
}

test("users.info: only a confirmed full-member email is offered for linking", async () => {
  const log = [];
  const fetchImpl = slackApi(log);
  assert.deepEqual(await slackUserEmail({ token: "x", slackUserId: "UANH", fetchImpl }), { email: "anh@northline.test", displayName: "UANH", reason: "" });
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UUNC", fetchImpl })).reason, "unconfirmed");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UNOPE", fetchImpl })).reason, "lookup-failed");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "not-a-user", fetchImpl })).reason, "no-user");
  const as = (user) => async () => json({ ok: true, user: { id: "UXX1", profile: { email: "a@b.test" }, ...user } });
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", fetchImpl: as({ is_bot: true }) })).reason, "bot");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", fetchImpl: as({ is_restricted: true }) })).reason, "guest");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", fetchImpl: as({ deleted: true }) })).reason, "deleted");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", fetchImpl: as({ profile: {} }) })).reason, "no-email");
  // Slack omits is_email_confirmed for many workspaces: absence is not "unconfirmed".
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", fetchImpl: as({}) })).email, "a@b.test");
  // Another organization's email (Slack Connect) proves nothing about this tenant.
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", teamId: "TNORTH", fetchImpl: as({ team_id: "TCONNECT" }) })).reason, "external");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", teamId: "TNORTH", fetchImpl: as({ team_id: "TNORTH", is_stranger: true }) })).reason, "external");
  assert.equal((await slackUserEmail({ token: "x", slackUserId: "UXX1", teamId: "TNORTH", fetchImpl: as({ team_id: "TNORTH" }) })).email, "a@b.test");
});

test("link: same-tenant verified email links once; other tenant, unconfirmed, ambiguous or foreign team never link", async () => {
  const store = createMemorySlackIdentityStore({
    teams: { TNORTH: A, TOTHER: B },
    members: [
      { tenantId: A, userId: ANH, email: "anh@northline.test" },
      { tenantId: B, userId: BEN, email: "ben@northline.test" },
      { tenantId: A, userId: "cccccccc-0000-4000-8000-000000000001", email: "dup@northline.test" },
      { tenantId: A, userId: "cccccccc-0000-4000-8000-000000000002", email: "dup@northline.test" },
      { tenantId: A, userId: "cccccccc-0000-4000-8000-000000000003", email: "pending@northline.test", confirmed: false },
    ],
  });
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", email: "ANH@northline.test" }), ANH);
  const first = store.identities.get("slack|TNORTH|UANH");
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", email: "anh@northline.test" }), ANH);
  assert.equal(store.identities.size, 1, "idempotent: one row");
  assert.equal(store.identities.get("slack|TNORTH|UANH").linkedAt, first.linkedAt, "re-link keeps linked_at");
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UBEN", email: "ben@northline.test" }), "", "member of B only");
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UDUP", email: "dup@northline.test" }), "", "ambiguous");
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UPEN", email: "pending@northline.test" }), "", "unconfirmed account");
  assert.equal(await store.link({ tenantId: A, teamId: "TOTHER", slackUserId: "UANH", email: "anh@northline.test" }), "", "team owned by B");
  // The Slack user's email no longer matches: the old link is removed, not reused.
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", email: "" }), "");
  assert.equal(store.identities.has("slack|TNORTH|UANH"), false);
});

test("resolver: caches per tenant+team+user, does not cache a Slack outage, and never links an unconfirmed email", async () => {
  const log = [];
  let clock = 0;
  const store = createMemorySlackIdentityStore({ teams: { TNORTH: A }, members: [{ tenantId: A, userId: ANH, email: "anh@northline.test" }] });
  const resolver = createSlackMemberResolver({ store, now: () => clock });
  const fetchImpl = slackApi(log);
  const link = await resolver.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "xoxb-north", fetchImpl });
  assert.deepEqual(link, { memberId: ANH, slackUserId: "UANH", teamId: "TNORTH", tenantId: A });
  assert.deepEqual(slackReadPrincipal(link), { memberId: ANH, identities: [{ memberId: "UANH", provider: "slack" }] });
  await resolver.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "xoxb-north", fetchImpl });
  assert.equal(log.filter((e) => e.href.includes("users.info")).length, 1, "second ask is cached");
  assert.equal(await resolver.resolve({ tenantId: B, teamId: "TNORTH", slackUserId: "UANH", token: "xoxb-north", fetchImpl }), null, "other tenant is a separate key and is refused");
  assert.equal(await resolver.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UUNC", token: "xoxb-north", fetchImpl }), null);
  assert.equal(store.identities.has("slack|TNORTH|UUNC"), false);
  const down = createSlackMemberResolver({ store, now: () => clock });
  let calls = 0;
  const flaky = async (...args) => { calls += 1; return calls === 1 ? json({ ok: false, error: "ratelimited" }) : fetchImpl(...args); };
  assert.equal(await down.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "t", fetchImpl: flaky }), null);
  assert.equal((await down.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "t", fetchImpl: flaky }))?.memberId, ANH);
  const lookups = () => log.filter((e) => e.href.includes("users.info") && e.href.includes("UANH")).length;
  const before = lookups();
  await resolver.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "xoxb-north", fetchImpl });
  assert.equal(lookups(), before, "still cached");
  clock += 6 * 60 * 1000;
  await resolver.resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "xoxb-north", fetchImpl });
  assert.equal(lookups(), before + 1, "expired entry is re-checked");
  assert.equal(await createSlackMemberResolver({ store: null }).resolve({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", token: "t" }), null);
});

test("Supabase identity store calls the service-only link function and is off without a durable database", async () => {
  assert.equal(createSlackIdentityStore({}), null);
  assert.equal(createSlackIdentityStore({ SUPABASE_URL: "https://db.test", SUPABASE_SECRET_KEY: "k", SEDERUNT_AUTH_FAKE: "1" }), null);
  const calls = [];
  const store = createSlackIdentityStore({ SUPABASE_URL: "https://db.test/", SUPABASE_SECRET_KEY: "service" }, {
    fetchImpl: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return json(ANH); },
  });
  assert.equal(await store.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", email: "anh@northline.test", displayName: "Anh" }), ANH);
  assert.equal(calls[0].url, "https://db.test/rest/v1/rpc/slack_identity_link");
  assert.deepEqual(calls[0].body, { p_tenant: A, p_team: "TNORTH", p_slack_user: "UANH", p_email: "anh@northline.test", p_display: "Anh" });
  const failing = createSlackIdentityStore({ SUPABASE_URL: "https://db.test", SUPABASE_SECRET_KEY: "s" }, { fetchImpl: async () => new Response("{}", { status: 500 }) });
  await assert.rejects(() => failing.link({ tenantId: A, teamId: "TNORTH", slackUserId: "UANH", email: "x@y.test" }));
});

test("channel bind policy: only a public live channel the bot is in", async () => {
  const at = (channel) => async () => json({ ok: true, channel: { id: "C123", ...channel } });
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: at({}) })).ok, true);
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: at({ is_private: true }) })).reason, "private");
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: at({ is_archived: true }) })).reason, "archived");
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: at({ is_im: true }) })).reason, "direct");
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: at({ is_member: false }) })).reason, "bot-not-member");
  assert.equal((await slackChannelBindable({ token: "t", channel: "D123", fetchImpl: at({}) })).reason, "not-a-channel");
  assert.equal((await slackChannelBindable({ token: "t", channel: "C123", fetchImpl: async () => json({ ok: false }) })).reason, "lookup-failed");
});

test("DM from the meeting host's Slack account (same verified email) recalls the Meet-room memory", async (t) => {
  const { port, log, identities } = await setup(t);
  const result = await call(port, dm("UANH", "What happened in the Google Meet we just had?", "100.1"));
  assert.equal(result.status, 200);
  const replies = posted(log);
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /Friday/);
  assert.equal(replies[0].channel, "D0CEANHDM01");
  const row = identities.identities.get("slack|TNORTH|UANH");
  assert.equal(row.userId, ANH);
  assert.ok(row.linkedAt);
  // users.info used the tenant's own bot token.
  assert.ok(log.filter((e) => e.href.includes("users.info")).every((e) => e.auth === "Bearer xoxb-north"));
});

test("DM from a non-matching, other-tenant or unconfirmed Slack user is not linked and gets a reply that leaks nothing", async (t) => {
  const { port, log, identities } = await setup(t);
  for (const [user, ts] of [["UOUT", "200.1"], ["UBEN", "200.2"], ["UUNC", "200.3"], ["UEXT", "200.4"]]) {
    log.length = 0;
    const result = await call(port, dm(user, "What happened in the Google Meet we just had?", ts));
    assert.equal(result.status, 200);
    const replies = posted(log);
    assert.equal(replies.length, 1, `${user} is answered, not silent`);
    assert.equal(replies[0].text, "Sorry, I can't share that with you.");
    assert.doesNotMatch(JSON.stringify(replies), /Friday|Launch|meet-room/i);
  }
  assert.equal(identities.identities.size, 0);
});

test("bot joining a public channel binds it to the tenant Files space once; private channels and other joins do not", async (t) => {
  const store = createFileStore();
  const files = createFileRuntime({ store, storage: createMemoryConsole() });
  const { port } = await setup(t, { files });
  const joined = (user, channel) => ({ type: "event_callback", team_id: "TNORTH", api_app_id: "APP", authorizations: [{ user_id: "UBOTA", is_bot: true }],
    event: { type: "member_joined_channel", user, channel, channel_type: "C", team: "TNORTH" } });
  assert.equal((await call(port, joined("UANH", "C0CEHUMAN01"))).json.slack, "ignored");
  assert.equal(store.channelByExternal("slack", "C0CEHUMAN01"), null);
  assert.equal((await call(port, joined("UBOTA", "C0CELAUNCH1"))).json.slack, "bound");
  assert.equal((await call(port, joined("UBOTA", "C0CELAUNCH1"))).json.slack, "bound", "idempotent");
  const channel = store.channelByExternal("slack", "C0CELAUNCH1");
  assert.equal(channel.id, workspaceChannelId(A));
  assert.equal(channel.tenantId, A);
  // A channel already bound to another tenant is never moved.
  assert.equal(store.bindSlackChannel({ tenantId: B, teamId: "TOTHER", externalChannelId: "C0CELAUNCH1", channelId: workspaceChannelId(B) }), null);
  assert.equal(store.channelByExternal("slack", "C0CELAUNCH1").tenantId, A);
});

test("private channel join is not bound (its files must not become workspace-wide)", async (t) => {
  const store = createFileStore();
  const files = createFileRuntime({ store, storage: createMemoryConsole() });
  const { port } = await setup(t, { files, channelPrivate: true });
  const result = await call(port, { type: "event_callback", team_id: "TNORTH", api_app_id: "APP", authorizations: [{ user_id: "UBOTA", is_bot: true }],
    event: { type: "member_joined_channel", user: "UBOTA", channel: "C0CESECRET1", channel_type: "G" } });
  assert.equal(result.json.slack, "ignored");
  assert.equal(store.channelByExternal("slack", "C0CESECRET1"), null);
});

test("first file kept in an unbound channel binds lazily, ingests to Walrus as the linked member, and the DM resend reads Walrus first", async (t) => {
  const store = createFileStore();
  // The member's verified tenant membership (the database view in production).
  store.addMember({ userId: ANH, tenantId: A, role: "owner" });
  const storage = createMemoryConsole();
  const files = createFileRuntime({ store, storage });
  const { port, log, events } = await setup(t, { files, session: createSession() });
  const keep = { type: "event_callback", team_id: "TNORTH", api_app_id: "APP", authorizations: [{ user_id: "UBOTA", is_bot: true }],
    event: { type: "message", subtype: "file_share", channel: "C0CELAUNCH1", channel_type: "channel", user: "UANH", ts: "300.1",
      text: "Launch brief for the team", files: [{ id: "FBRIEF", name: "launch-brief.txt", url_private_download: "https://files.slack.com/private/brief" }] } };
  const kept = await call(port, keep);
  assert.equal(kept.status, 200);
  assert.equal(store.channelByExternal("slack", "C0CELAUNCH1")?.id, workspaceChannelId(A), "bound on first keep");
  const ingest = events.filter((e) => e.kind === "slack-file-ingest");
  assert.deepEqual(ingest.map((e) => e.skipped), [false]);
  await files.kick();
  const [row] = store.listVisible(ANH).filter((f) => f.slackFileId === "FBRIEF");
  assert.ok(row, "Files row visible to the linked member");
  assert.equal(row.status, "active");
  assert.ok(row.consoleFileId, "stored to Walrus Console");
  assert.equal(row.ownerUserId, ANH, "owned by the Sederunt member, not a guest");

  // Same Slack retry is idempotent: no second binding attempt or second file.
  await call(port, keep);
  assert.equal(store.listVisible(ANH).filter((f) => f.slackFileId === "FBRIEF").length, 1);
  assert.equal(events.filter((e) => e.kind === "slack-file-ingest").length, 2);

  log.length = 0;
  const asked = await call(port, dm("UANH", "Send me launch-brief.txt", "300.5"));
  assert.equal(asked.status, 200);
  assert.ok(log.some((e) => e.href.includes("files.completeUploadExternal")), "file was posted back to the DM");
  assert.equal(log.some((e) => e.href.startsWith("https://files.slack.com/private/")), false, "no Slack download for the resend");
  assert.deepEqual(events.filter((e) => e.kind === "slack-file-resend").map((e) => e.source), ["walrus"]);
  const uploaded = log.find((e) => e.href.startsWith("https://files.slack.com/upload/"));
  assert.equal(Buffer.from(uploaded.body).toString("utf8"), "launch brief bytes");
});

test("resend order: the Walrus copy first, then the decision's Console id, then Slack; a Walrus failure still resends", async () => {
  const session = { decisions: [{ fileNames: [{ name: "plan.pdf", slackFileId: "FPLAN" }] }] };
  const slackReads = [];
  const deps = { slack: { tenantScoped: true, async downloadFile(file) { slackReads.push(file.id); return { bytes: "from slack" }; } } };
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
  const fromWalrus = await storedFileBytes(session, "plan.pdf", deps, {}, null, { walrus: async ({ slackFileId }) => (slackFileId === "FPLAN" ? pdf : null) });
  assert.ok(Buffer.isBuffer(fromWalrus), "binary bytes stay bytes");
  assert.deepEqual([...fromWalrus], [...pdf]);
  assert.deepEqual(slackReads, []);
  assert.equal(await storedFileBytes(session, "plan.pdf", deps, {}, null, { walrus: async () => { throw new Error("console down"); } }), "from slack");
  assert.equal(await storedFileBytes(session, "plan.pdf", deps, {}, null, { walrus: async () => null }), "from slack");
  assert.deepEqual(slackReads, ["FPLAN", "FPLAN"]);
});

test("a channel @mention never answers from the asker's Meet-room memory (everyone in the channel reads the reply)", async (t) => {
  const { port, log, identities } = await setup(t);
  for (const [event, ts] of [
    [{ type: "app_mention", channel: "C0CELAUNCH1", channel_type: "channel" }, "400.1"],
    [{ type: "message", channel: "G0CEGROUP01", channel_type: "mpim" }, "400.2"],
  ]) {
    log.length = 0;
    const result = await call(port, { type: "event_callback", team_id: "TNORTH", api_app_id: "APP", authorizations: [{ user_id: "UBOTA", is_bot: true }],
      event: { ...event, user: "UANH", text: "<@UBOTA> What happened in the Google Meet we just had?", ts, client_msg_id: `m-${ts}` } });
    assert.equal(result.status, 200);
    assert.doesNotMatch(JSON.stringify(posted(log)), /Friday|meet-room/i, `${event.channel_type} reply stays Slack-only`);
  }
  // The same person in a one-to-one DM still gets the Meet-room answer.
  log.length = 0;
  await call(port, dm("UANH", "What happened in the Google Meet we just had?", "400.3"));
  assert.match(posted(log)[0]?.text || "", /Friday/);
  assert.equal(identities.identities.get("slack|TNORTH|UANH")?.userId, ANH);
});
