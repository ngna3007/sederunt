import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readdirSync } from "node:fs";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importedFile } from "../src/files/console-files.js";
import { fileMetadata } from "../src/files/meta.js";
import { createFileStore } from "../src/files/store.js";
import { createMeetingFollowups, followupId } from "../src/meeting/followups.js";
import { createMemoryFollowupStore } from "../src/meeting/followup-store.js";
import { acceptMeetingEnd, buildMeetingFollowupInput, followupInteractionFields, validateFollowupEdit } from "../src/meeting/live-followups.js";
import { createParticipantBindings } from "../src/participant-bindings.js";
import { createSession } from "../src/session.js";
import { createApp } from "../src/server.js";
import { handleUtterance } from "../src/typed-path.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const recallSecret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

test("a shared file without SHA-256 is not imported", async () => {
  const store = createFileStore();
  assert.equal(await store.importActive({ id: "file-old", name: "notes.txt" }), null);
  const trusted = await store.importActive({
    id: "file-new", name: "notes.txt", tenantId: tenant, channelId: "C1", consoleFolderId: "folder", consoleFileId: "console",
    sha256: "ab".repeat(32),
  });
  assert.equal(Buffer.from(trusted.sha256).toString(), "ab".repeat(32));
  assert.equal((await store.listVisible("nobody")).length, 0);
});

test("files migration does not reuse the memory-deletions timestamp", () => {
  const names = readdirSync(new URL("../supabase/migrations/", import.meta.url));
  assert.ok(names.includes("20261109110000_memory_deletions.sql"));
  assert.ok(names.includes("20261109120000_files_runtime.sql"));
  assert.equal(names.includes("20261109110000_files_runtime.sql"), false);
});

test("meeting evidence ignores display names, owners, and completed actions", () => {
  const built = buildMeetingFollowupInput({
    tenantId: tenant,
    meetingId: "bot-1",
    teamId: "T1",
    decisions: [
      { id: "kept", text: "The booth opens at nine", roomId: "bot-1", memberId: "100", inviteMemberIds: ["100"] },
      { id: "done", text: "Already filed", roomId: "bot-1", memberId: "100", inviteMemberIds: ["100"] },
      { id: "named", text: "Mina said this", roomId: "bot-1", memberId: "Mina", inviteMemberIds: ["Mina"] },
    ],
    actions: [
      { id: "act-1", decisionId: "kept", tool: "linear", state: "paused", roomId: "bot-1", statement: "File the booth", params: { title: "Booth" }, preference: "ask" },
      { id: "act-2", decisionId: "done", tool: "linear", state: "closed", roomId: "bot-1", statement: "Already filed", params: { title: "Filed" }, connectorId: "ROW-1" },
    ],
    bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com", slackUserId: "U_MINA" }],
    preferences: [{ tool: "linear", value: "ask" }],
    channelRecipients: [{ memberId: "stranger" }],
    bindingChannelId: "C1",
  });
  assert.deepEqual(built.memberIds, ["100"]);
  assert.equal(built.channelAuthorized, false);
  assert.equal(built.meeting.emailSending, false);
  assert.deepEqual(built.proposals.map((row) => row.sourceId), ["kept"]);
  assert.equal(built.sources.find((row) => row.id === "done").action.connectorId, "ROW-1");
  assert.equal(validateFollowupEdit({ tool: "create_issue", args: {} }, { summary: "" }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "update_event", args: {} }, { summary: "Move it" }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "update_event", args: { eventId: "evt" } }, { summary: '{"description":"Move it"}' }).ok, true);
});

test("minutes go to the channel or to direct messages, once each", async () => {
  const posts = [];
  const slack = {
    teamId: "T1",
    async openConversation() { return { channel: { id: "D-opened" } }; },
    async postMessage(message) { posts.push(message); return { ts: `1.${posts.length}` }; },
    async updateMessage(message) { return { ts: message.ts }; },
  };
  const decisions = [
    { id: "d1", text: "The booth opens at nine", roomId: "bot-1", memberId: "100", inviteMemberIds: ["100", "200"] },
    { id: "d2", text: "Launch stays Tuesday", roomId: "bot-1", memberId: "200", inviteMemberIds: ["100", "200"] },
  ];
  const bindings = [
    { roomId: "bot-1", memberId: "100", email: "mina@example.com", slackUserId: "U_MINA" },
    { roomId: "bot-1", memberId: "200", email: "anh@example.com", slackUserId: "U_ANH" },
  ];
  const built = buildMeetingFollowupInput({
    tenantId: tenant,
    meetingId: "bot-1",
    teamId: "T1",
    decisions,
    bindings,
    bindingChannelId: "C-OPS",
    channelRecipients: [{ memberId: "100" }, { memberId: "200" }],
  });
  assert.equal(built.channelAuthorized, true);
  assert.equal(built.meeting.emailSending, false);
  assert.equal(built.meeting.privateOneToOne, false);
  const store = createMemoryFollowupStore();
  const coordinator = createMeetingFollowups({
    store,
    slackFor: async () => slack,
    authorizeDelivery: async () => true,
    handleUtterance: async () => { throw new Error("minutes must not write"); },
  });
  await coordinator.enqueue(built);
  await coordinator.drain({ tenantId: tenant, limit: 10 });
  await coordinator.drain({ tenantId: tenant, limit: 10 });
  assert.deepEqual(posts.map((row) => row.channel), ["C-OPS"]);
  const minutes = (await store.list(tenant, { kind: "delivery" })).filter((row) => !row.data.actionId);
  assert.equal(minutes.length, 1);
  assert.equal(minutes[0].status, "done");
  assert.equal(minutes[0].data.receipt.channel, "C-OPS");
  await coordinator.drain({ tenantId: tenant, limit: 10 });
  assert.equal(posts.length, 1);
  const privateMeeting = buildMeetingFollowupInput({
    tenantId: tenant,
    meetingId: "bot-1",
    teamId: "T1",
    decisions,
    bindings,
    bindingChannelId: "C-OPS",
    channelRecipients: [{ memberId: "100" }, { memberId: "200" }],
    meeting: { private: true },
  });
  assert.equal(privateMeeting.channelAuthorized, false);
  assert.equal(privateMeeting.meeting.bindingChannelId, "");
});

test("a verified meeting end is saved once, and only the requester can approve it", async () => {
  const store = createMemoryFollowupStore();
  const posts = [];
  const issues = [];
  const app = createApp({
    companyLoaded: true,
    autoRecovery: false,
    followupStore: store,
    env: {
      RECALL_WEBHOOK_SECRET: recallSecret,
      SLACK_SIGNING_SECRET: "slack-signing-secret",
      SLACK_CLIENT_ID: "slack-client",
      SLACK_CLIENT_SECRET: "slack-client-secret",
      SEDERUNT_RECOVERY_SECRET: "recovery-secret-value",
    },
    deps: {
      memory: { async remember() { return { blobId: "blob-1" }; }, async index() { return []; }, async recall() { return []; } },
      slack: { fetch: slackFetch(posts) },
      linear: { async createIssue(input) { issues.push(input); return { identifier: "ROW-70", id: "issue-70" }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    tenantBind: {
      async resolve(kind, id) {
        if (kind === "bot" && id === "bot-live") return tenant;
        if (kind === "slack" && (id === "T1" || id === "T1:C1")) return tenant;
        return "";
      },
      async releaseTenants() {},
    },
    slackInstallations: {
      async tokenFor() { return { token: "xoxb-test", teamId: "T1", generation: 1, botUserId: "B1", channelId: "" }; },
      async byTeam(team) { return team === "T1" ? { tenantId: tenant, token: "xoxb-test", teamId: "T1", generation: 1, botUserId: "B1", appId: "A1" } : null; },
    },
    slackMatches: {
      async get({ email }) { return email === "mina@example.com" ? { slackUserId: "U_MINA", source: "override" } : null; },
    },
    adminStore: { async tenantRetired() { return false; } },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const transcript = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-live" },
        data: {
          participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true },
          words: [{ text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }],
        },
      },
    });
    assert.equal((await recall(port, transcript)).status, 204);
    const ended = JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } });
    assert.equal((await recall(port, ended)).status, 204);
    assert.equal((await recall(port, ended)).status, 204);
    const outcomes = await store.list(tenant, { kind: "outcome" });
    assert.equal(outcomes.length, 1);
    const drained = await post(port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value",
      "content-type": "application/json",
    });
    assert.equal(drained.status, 200);
    assert.equal(drained.raw.includes("booth opens"), false);
    assert.equal(drained.raw.includes("recovery-secret-value"), false);
    const body = JSON.parse(drained.raw);
    assert.equal(body.followups.length, 1);
    assert.equal(posts.length, 0);
    const delivered = await post(port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value",
      "content-type": "application/json",
    });
    assert.equal(delivered.status, 200);
    assert.equal(posts.length, 1, JSON.stringify(await store.list(tenant, { kind: "delivery" })));
    assert.match(posts[0].text, /the booth opens at nine/);
    const again = await post(port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value",
      "content-type": "application/json",
    });
    assert.equal(again.status, 200);
    assert.equal(posts.length, 1);

    const authorizedSource = outcomes[0].data.input.sources[0].id;
    const actionId = followupId("action", tenant, "bot-live", "source-approve");
    await store.put({
      id: actionId, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: {
        sourceId: authorizedSource, kind: "assign_task", tool: "create_issue", args: { title: "Booth opens" },
        summary: "Booth opens", where: "Linear", requesterMemberId: "100", requesterSlackId: "U_MINA",
        teamId: "T1", memberIds: ["100"], argumentVersion: 1, attempts: 0, explicit: false, existingActionId: "",
        channelId: "D100", threadTs: "111.222", botName: "Maple",
      },
    });
    const value = `${actionId}:1`;
    const stranger = await slackAction(port, { user: "U_OTHER", value, action: "approve" });
    assert.equal(stranger.body.error, "forbidden_or_stale");
    assert.equal(issues.length, 0);
    const stale = await slackAction(port, { user: "U_MINA", value: `${actionId}:9`, action: "approve" });
    assert.equal(stale.body.ok, false);
    assert.equal(issues.length, 0);
    const approved = await slackAction(port, { user: "U_MINA", value, action: "approve" });
    assert.equal(approved.body.ok, true);
    assert.equal(approved.body.status, "running");
    await app.recover();
    assert.equal((await store.get(tenant, actionId)).status, "done");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].title, "Booth opens");
    const repeat = await slackAction(port, { user: "U_MINA", value, action: "approve" });
    assert.equal(repeat.body.ok, false);
    assert.equal(issues.length, 1);

    const skipId = followupId("action", tenant, "bot-live", "source-skip");
    await store.put({
      id: skipId, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: {
        sourceId: authorizedSource, kind: "assign_task", tool: "create_issue", args: { title: "Do not file" },
        summary: "Do not file", where: "Linear", requesterMemberId: "100", requesterSlackId: "U_MINA",
        teamId: "T1", memberIds: ["100"], argumentVersion: 1, attempts: 0, explicit: false, existingActionId: "",
        channelId: "D100", threadTs: "111.222", botName: "Maple",
      },
    });
    const skipped = await slackAction(port, { user: "U_MINA", value: `${skipId}:1`, action: "skip" });
    assert.equal(skipped.body.ok, true);
    assert.equal(skipped.body.ran, false);
    assert.equal(issues.length, 1);
    assert.equal((await store.get(tenant, skipId)).status, "skipped");

    const editId = followupId("action", tenant, "bot-live", "source-edit");
    await store.put({
      id: editId, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: {
        sourceId: authorizedSource, kind: "assign_task", tool: "create_issue", args: { title: "Old title" },
        summary: "Old title", where: "Linear", requesterMemberId: "100", requesterSlackId: "U_MINA",
        teamId: "T1", memberIds: ["100"], argumentVersion: 1, attempts: 0, explicit: false, existingActionId: "",
        channelId: "D100", threadTs: "111.222", botName: "Maple",
      },
    });
    const edited = await slackAction(port, { user: "U_MINA", value: `${editId}:1`, action: "edit" });
    assert.equal(edited.body.ran, false);
    assert.equal(issues.length, 1);
    const forged = await post(port, "/api/typed", JSON.stringify({
      intent: "followup-approve", text: "approve", followup: { id: editId, tool: "create_issue", args: { title: "Forged" } },
    }), { "content-type": "application/json" });
    assert.equal(forged.status, 403);
    assert.equal(issues.length, 1);
  } finally {
    await close(app);
  }
});

test("room media fails closed when the deletion overlay cannot be read", async () => {
  const session = createSession();
  session.decisions.push({
    id: "secret-decision", text: "hidden booth phrase", roomId: "room-1", deleted: false, inviteMemberIds: ["100"], memberId: "100",
  });
  const app = createApp({
    session, companyLoaded: true,
    deletions: { async list() { throw new Error("overlay down"); }, async request() { throw new Error("overlay down"); } },
    deps: {
      memory: { async remember() { return { blobId: "blob" }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const media = await get(app.address().port, "/console/rooms/room-1/media");
    assert.equal(media.status, 503);
    assert.equal(media.raw.includes("hidden booth phrase"), false);
  } finally {
    await close(app);
  }
});

test("Slack deletion does not report success when memory cannot store it", async () => {
  const session = createSession();
  session.decisions.push({
    id: "slack-decision", text: "keep the floor plan", roomId: "C1", sourceDeliveryId: "123.456", deleted: false, inviteMemberIds: ["U_MINA"], memberId: "U_MINA",
  });
  const app = createApp({
    session, companyLoaded: false,
    env: { SLACK_SIGNING_SECRET: "slack-signing-secret" },
    deps: { memory: null, slack: { fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }) } },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const raw = JSON.stringify({
      type: "event_callback", team_id: "T1",
      event: { type: "message", subtype: "message_deleted", channel: "C1", deleted_ts: "123.456" },
    });
    const sent = await post(app.address().port, "/api/slack", raw, slackHeaders(raw));
    assert.equal(sent.status, 503);
    assert.match(sent.raw, /could not be saved/i);
    assert.equal(session.decisions[0].deleted, false);
  } finally {
    await close(app);
  }
});

test("meeting evidence keeps a verified speaker, a calendar event, and a form", () => {
  const built = buildMeetingFollowupInput({
    tenantId: tenant,
    meetingId: "bot-1",
    teamId: "T1",
    decisions: [
      { id: "blank", text: "No speaker", roomId: "bot-1" },
      { id: "spk", text: "Speaker line", roomId: "bot-1", speakerMemberId: "100" },
      { id: "cal", text: "Move the review", roomId: "bot-1", memberId: "100" },
      { id: "form", text: "Make the form", roomId: "bot-1", memberId: "100" },
    ],
    actions: [
      { id: "a-bad", decisionId: "spk", tool: "unknown", state: "paused" },
      { id: "a-cal", decisionId: "cal", tool: "calendar", state: "paused", params: { id: "evt-9" }, statement: "Move" },
      { id: "a-form", decisionId: "form", tool: "forms", state: "paused", params: { title: "" }, statement: "Form title" },
    ],
    bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com" }],
    channelRecipients: null,
  });
  assert.equal(built.sources.some((row) => row.id === "blank"), false);
  assert.equal(built.sources.find((row) => row.id === "spk").memberId, "100");
  assert.equal(built.sources.find((row) => row.id === "spk").action, null);
  assert.equal(built.sources.find((row) => row.id === "cal").action.args.eventId, "evt-9");
  assert.equal(built.sources.find((row) => row.id === "cal").action.where, "Google Calendar");
  assert.equal(built.sources.find((row) => row.id === "form").action.where, "Google Forms");
  assert.equal(built.sources.find((row) => row.id === "form").action.args.title, "Form title");
  const blankEvent = buildMeetingFollowupInput({
    tenantId: tenant, meetingId: "bot-1", teamId: "T1",
    decisions: [{ id: "cal", text: "Move the review", roomId: "bot-1", memberId: "100" }],
    actions: [{ id: "a-cal", decisionId: "cal", tool: "calendar", state: "paused", params: {} }],
    bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com" }],
  });
  assert.equal(blankEvent.sources[0].action.args.eventId, "");
  const empty = buildMeetingFollowupInput({});
  assert.deepEqual(empty.memberIds, []);
  assert.equal(empty.tenantId, "");
  assert.equal(empty.teamId, "");
  assert.deepEqual(empty.sources, []);
  const sparse = buildMeetingFollowupInput({
    tenantId: tenant,
    meetingId: "m",
    decisions: [
      null,
      { id: "gone", deleted: true, roomId: "m", memberId: "100", text: "gone" },
      { id: "other", roomId: "elsewhere", memberId: "100", text: "other" },
      { id: "kept", roomId: "m", memberId: "100", text: "From the decision" },
      { id: "quiet", roomId: "m", memberId: "100", text: "" },
      { id: "cal", roomId: "m", memberId: "100", text: "Move" },
    ],
    actions: [
      { decisionId: "kept", tool: "linear", state: "paused" },
      { decisionId: "quiet", tool: "linear", state: "paused", params: { title: "" }, statement: "" },
      { decisionId: "cal", tool: "calendar", state: "paused" },
    ],
    bindings: [{ roomId: "m", memberId: "100", email: "mina@example.com" }],
  });
  assert.deepEqual(sparse.sources.map((row) => row.id), ["kept", "quiet", "cal"]);
  assert.equal(sparse.sources[0].action.args.title, "From the decision");
  assert.equal(sparse.sources[0].action.existingActionId, "");
  assert.equal(sparse.sources[0].action.connectorId, "");
  assert.equal(sparse.sources[1].action.args.title, "");
  assert.equal(sparse.sources[2].action.args.eventId, "");
  assert.equal(sparse.meeting.people[0].email, "mina@example.com");
  assert.equal(validateFollowupEdit({ tool: "create_issue", args: { title: "Old" } }, { summary: "Use the summary" }).args.title, "Use the summary");
  assert.equal(validateFollowupEdit({ tool: "create_form" }, { summary: "Form from the summary" }).args.title, "Form from the summary");
  const bare = followupInteractionFields({
    type: "block_actions",
    actions: [{ action_id: "approve:x", value: "id:1" }],
  }, null);
  assert.equal(bare.actorSlackId, "");
  assert.equal(bare.teamId, "");
  assert.equal(bare.channelId, "");
  assert.equal(bare.threadTs, "");
  const contained = followupInteractionFields({
    type: "block_actions",
    user: { id: "U1" },
    container: { channel_id: "C9", thread_ts: "9.1" },
    message: { ts: "8.1" },
    actions: [{ action_id: "skip:x", value: "id:1" }],
  }, null);
  assert.equal(contained.channelId, "C9");
  assert.equal(contained.threadTs, "9.1");
  const stamped = followupInteractionFields({
    type: "block_actions",
    user: { id: "U1" },
    team: { id: "T1" },
    channel: { id: "C1" },
    message: { ts: "8.1" },
    actions: [{ action_id: "edit:x", value: "id:1" }],
  }, null);
  assert.equal(stamped.threadTs, "8.1");
  const unstated = followupInteractionFields({
    type: "view_submission",
    user: { id: "U1" },
    team: { id: "T1" },
    view: {},
  }, { teamId: "T1", requesterSlackId: "U1", channelId: "C1", threadTs: "1.2" });
  assert.deepEqual(unstated.edit, { summary: "", change: "", title: "" });
  assert.equal(followupInteractionFields({ type: "block_actions", actions: "nope" }, null), null);
  const modal = followupInteractionFields({
    type: "view_submission",
    user: { id: "U1" },
    team: { id: "T1" },
    view: { state: { values: {} } },
  }, { teamId: "T1", requesterSlackId: "U1" });
  assert.equal(modal.verb, "save");
  assert.equal(modal.value, "");
  assert.equal(modal.channelId, "");
  assert.equal(modal.threadTs, "");
  assert.deepEqual(modal.edit, { summary: "", change: "", title: "" });
});

test("a meeting without a team or verified people is closed without a second write", async () => {
  const store = createMemoryFollowupStore();
  const noTeam = await acceptMeetingEnd({ async enqueue() { throw new Error("should not enqueue"); } }, store, {
    tenantId: tenant, meetingId: "bot-1", teamId: "", memberIds: ["100"],
  });
  const unverified = await acceptMeetingEnd({ async enqueue() { throw new Error("should not enqueue"); } }, store, {
    tenantId: tenant, meetingId: "bot-2", teamId: "T1", memberIds: [],
  });
  assert.equal(noTeam.data.terminal, "no-team");
  assert.equal(unverified.data.terminal, "unverified");
  assert.equal((await store.list(tenant, { kind: "outcome" })).length, 2);
  const again = await acceptMeetingEnd({ async enqueue() { throw new Error("should not enqueue"); } }, store, {
    tenantId: tenant, meetingId: "bot-1", teamId: "", memberIds: ["100"],
  });
  assert.equal(again.id, noTeam.id);
  await assert.rejects(() => acceptMeetingEnd({}, store, { tenantId: "", meetingId: "bot-1", teamId: "T1", memberIds: ["100"] }), /Verified meeting evidence/);
  await assert.rejects(() => acceptMeetingEnd({}, store, { tenantId: tenant, meetingId: "bot-3", teamId: "T1", memberIds: ["100"] }), /Follow-up finalization is unavailable/);
});

test("an edit keeps a title and a calendar event, and a Slack control must match the requester", () => {
  assert.equal(validateFollowupEdit({ tool: "create_issue", args: {} }, { summary: "x\u0000" }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "create_issue", args: {} }, { summary: "x".repeat(501) }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "create_form", args: {} }, { summary: "Form", title: " " }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "create_issue", args: {} }, { summary: "Short", title: "t".repeat(201) }).ok, false);
  assert.equal(validateFollowupEdit({ tool: "other", args: {} }, { summary: "Nope" }).ok, false);
  const fromId = validateFollowupEdit({ tool: "update_event", args: { id: "evt-2" } }, { summary: '{"description":"Move it"}' });
  assert.equal(fromId.ok, true);
  assert.equal(fromId.args.eventId, "evt-2");
  assert.equal(followupInteractionFields({
    type: "block_actions", user: { id: "U1" }, team: { id: "T1" }, actions: [{ action_id: "nope", value: "x" }],
  }, null), null);
  assert.equal(followupInteractionFields({ type: "shortcut", user: { id: "U1" }, team: { id: "T1" } }, null), null);
  assert.equal(followupInteractionFields({
    type: "view_submission", user: { id: "U2" }, team: { id: "T1" }, view: { private_metadata: "id:1" },
  }, { teamId: "T1", requesterSlackId: "U1", channelId: "D1", threadTs: "1.2" }), null);
  const saved = followupInteractionFields({
    type: "view_submission",
    user: { id: "U1" },
    team_id: "T1",
    view: {
      private_metadata: "action:abc:1",
      state: { values: { skip: "no", block: { change: { value: "Move it" }, title: { value: "Title" } } } },
    },
  }, { teamId: "T1", requesterSlackId: "U1", channelId: "C1", threadTs: "1.2" });
  assert.equal(saved.verb, "save");
  assert.deepEqual(saved.edit, { summary: "Move it", change: "Move it", title: "Title" });
  const closed = followupInteractionFields({
    type: "view_closed", user: { id: "U1" }, team: { id: "T1" }, view: { private_metadata: "action:abc:1" },
  }, { teamId: "T1", requesterSlackId: "U1", channelId: "C1", threadTs: "1.2" });
  assert.equal(closed.verb, "cancel");
  assert.equal(closed.edit, undefined);
});

test("approval reuses a saved action and does not treat an unknown connector result as done", async () => {
  const session = createSession();
  session.actions.push(
    { id: "act-filed", state: "closed", connectorId: "ROW-9", tool: "linear", statement: "Filed", preference: "do", roomId: "bot-1", memberId: "100" },
    { id: "act-dismissed", state: "dismissed", tool: "linear", statement: "Dismissed", preference: "do", roomId: "bot-1", memberId: "100" },
    { id: "act-open", state: "waiting", tool: "linear", statement: "Open booth", preference: "do", roomId: "bot-1", memberId: "100", params: { title: "Open booth" } },
  );
  const store = createMemoryFollowupStore();
  const issues = [];
  const forms = [];
  let coordinator;
  const deps = {
    linear: {
      async createIssue(input) {
        issues.push(input);
        if (input.title === "Explode") throw new Error("connector down");
        if (input.title === "Id only") return { id: "issue-only" };
        if (input.title === "No id") return {};
        return { identifier: "ROW-71" };
      },
    },
    forms: { async call(tool, args) { forms.push({ tool, args }); return { ok: true }; } },
  };
  coordinator = createMeetingFollowups({
    store,
    authorize: async () => true,
    authorizeDelivery: async () => false,
    validateEdit: async () => ({ ok: false }),
    handleUtterance: (input) => handleUtterance({ ...input, session }, { ...deps, followups: coordinator }),
  });
  const base = {
    kind: "action", status: "pending", meetingId: "bot-1", tenantId: tenant,
  };
  const filed = followupId("action", tenant, "bot-1", "reuse-filed");
  await store.put({
    ...base, id: filed,
    data: actionData({ existingActionId: "act-filed", explicit: true, title: "Filed" }),
  });
  const reused = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${filed}:1` });
  assert.equal(reused.ok, true);
  assert.equal(reused.result.connectorId, "ROW-9");
  assert.equal(issues.length, 0);

  const dismissed = followupId("action", tenant, "bot-1", "reuse-dismissed");
  await store.put({
    ...base, id: dismissed,
    data: actionData({ existingActionId: "act-dismissed", explicit: true, title: "Dismissed" }),
  });
  const paused = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${dismissed}:1` });
  assert.equal(paused.ok, false);
  assert.equal(paused.status, "failed");
  assert.match((await store.get(tenant, dismissed)).data.next, /before trying again/);
  assert.equal(issues.length, 0);

  const exploding = followupId("action", tenant, "bot-1", "explode");
  await store.put({
    ...base, id: exploding,
    data: actionData({ title: "Explode", explicit: false, existingActionId: "" }),
  });
  const failed = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${exploding}:1` });
  assert.equal(failed.status, "outcome_unknown");
  assert.match((await store.get(tenant, exploding)).data.next, /before trying again/);

  const form = followupId("action", tenant, "bot-1", "form");
  await store.put({
    ...base, id: form,
    data: actionData({ tool: "create_form", kind: "create_form", title: "Signup", explicit: false, existingActionId: "" }),
  });
  const uncertain = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${form}:1` });
  assert.equal(uncertain.ok, false);
  assert.equal(uncertain.status, "outcome_unknown");
  assert.equal(forms.length, 1);
  assert.equal(forms[0].tool, "create_form");
  assert.match((await store.get(tenant, form)).data.next, /connected tool/);

  deps.forms = {};
  const missing = followupId("action", tenant, "bot-1", "form-missing");
  await store.put({
    ...base, id: missing,
    data: actionData({ tool: "create_form", kind: "create_form", title: "No connector", explicit: false, existingActionId: "" }),
  });
  const unconnected = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${missing}:1` });
  assert.equal(unconnected.status, "failed");
  assert.match((await store.get(tenant, missing)).data.next, /before trying again/);

  const open = followupId("action", tenant, "bot-1", "reuse-open");
  await store.put({
    ...base, id: open,
    data: actionData({ existingActionId: "act-open", explicit: true, title: "Open booth" }),
  });
  const refiled = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${open}:1` });
  assert.equal(refiled.ok, true);
  assert.equal(refiled.result.connectorId, "ROW-71");
  assert.equal(session.actions.find((row) => row.id === "act-open").connectorId, "ROW-71");

  const idOnly = followupId("action", tenant, "bot-1", "id-only");
  await store.put({
    ...base, id: idOnly,
    data: actionData({ title: "Id only", explicit: false, existingActionId: "" }),
  });
  const identified = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${idOnly}:1` });
  assert.equal(identified.ok, true);
  assert.equal(identified.result.connectorId, "issue-only");

  const blank = followupId("action", tenant, "bot-1", "no-id");
  await store.put({
    ...base, id: blank,
    data: actionData({ title: "No id", explicit: false, existingActionId: "" }),
  });
  const unnamed = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${blank}:1` });
  assert.equal(unnamed.ok, false);
  assert.equal(unnamed.status, "outcome_unknown");
  assert.match((await store.get(tenant, blank)).data.next, /before trying again/);
});

test("calendar approval waits for the event and for that person's calendar", async () => {
  const { app, store } = followupApp();
  await listen(app);
  const authorizedSource = await primeFollowup(app, store);
  try {
    const missing = followupId("action", tenant, "bot-live", "cal-missing");
    await store.put({
      id: missing, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: actionData({ sourceId: authorizedSource, tool: "update_event", kind: "edit_calendar", title: "", args: {}, explicit: false, existingActionId: "" }),
    });
    const blocked = await slackAction(app.address().port, { user: "U_MINA", value: `${missing}:1`, action: "approve" });
    assert.equal(blocked.body.ok, true);
    assert.equal(blocked.body.ran, false);
    await app.recover();
    assert.match((await store.get(tenant, missing)).data.next, /calendar event is required/i);

    const present = followupId("action", tenant, "bot-live", "cal-present");
    await store.put({
      id: present, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: actionData({ sourceId: authorizedSource, tool: "update_event", kind: "edit_calendar", title: "", args: { eventId: "evt-1" }, explicit: false, existingActionId: "" }),
    });
    const unconnected = await slackAction(app.address().port, { user: "U_MINA", value: `${present}:1`, action: "approve" });
    assert.equal(unconnected.body.ok, true);
    assert.equal(unconnected.body.ran, false);
    await app.recover();
    assert.match((await store.get(tenant, present)).data.next, /Connect Google Calendar/);
  } finally {
    await close(app);
  }
});

test("a granted calendar runs the person's calendar, not the workspace calendar", async () => {
  const { app, store } = followupApp({
    env: { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_CALENDAR_FAKE: "1" },
    googleGrants: {
      async granted() { return true; },
      async openAccess() { return { accessToken: "person-token" }; },
    },
    deps: {
      memory: { async remember() { return { blobId: "blob-1" }; }, async index() { return []; }, async recall() { return []; } },
      slack: { fetch: slackFetch([]) },
      calendar: { async updateEventDetails() { throw new Error("workspace calendar must not run"); } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(app);
  const authorizedSource = await primeFollowup(app, store);
  try {
    const id = followupId("action", tenant, "bot-live", "cal-person");
    await store.put({
      id, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: actionData({ sourceId: authorizedSource, tool: "update_event", kind: "edit_calendar", args: { eventId: "evt-person" }, explicit: false, existingActionId: "" }),
    });
    const sent = await slackAction(app.address().port, { user: "U_MINA", value: `${id}:1`, action: "approve" });
    assert.equal(sent.body.ok, true);
    assert.equal(sent.body.ran, false);
    await app.recover();
    const next = (await store.get(tenant, id)).data.next || "";
    assert.equal(next.includes("workspace calendar"), false);
  } finally {
    await close(app);
  }
});

test("a failed Slack match leaves meeting finalization retryable", async () => {
  const { app, store } = followupApp({
    slackMatches: { async get() { throw new Error("lookup down"); } },
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom(tenantId, roomId) {
        return [{ tenantId, roomId, memberId: "100", email: "mina@example.com" }];
      },
    },
  });
  await listen(app);
  const port = app.address().port;
  try {
    const transcript = JSON.stringify({
      event: "transcript.data",
      data: { bot: { id: "bot-live" }, data: { participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true }, words: [{ text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }] } },
    });
    assert.equal((await recall(port, transcript)).status, 204);
    assert.equal((await recall(port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }))).status, 503);
    assert.equal((await store.list(tenant, { kind: "outcome" })).length, 0);
  } finally {
    await close(app);
  }
});

test("a binding outage after the meeting is saved does not post minutes", async () => {
  const posts = [];
  let reads = 0;
  const { app, store } = followupApp({
    slackMatches: { async get() { return { slackUserId: "U_MINA", source: "override" }; } },
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom(tenantId, roomId) {
        reads += 1;
        if (reads > 1) throw new Error("room bindings down");
        return [{ tenantId, roomId, memberId: "100", email: "mina@example.com" }];
      },
    },
    posts,
  });
  await listen(app);
  const port = app.address().port;
  try {
    const transcript = JSON.stringify({
      event: "transcript.data",
      data: { bot: { id: "bot-live" }, data: { participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true }, words: [{ text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }] } },
    });
    assert.equal((await recall(port, transcript)).status, 204);
    assert.equal((await recall(port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }))).status, 204);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const drained = await post(port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
        authorization: "Bearer recovery-secret-value", "content-type": "application/json",
      });
      assert.equal(drained.status, 200);
    }
    const deliveries = await store.list(tenant, { kind: "delivery" });
    assert.ok(deliveries.some((row) => row.status === "failed"), deliveries.map((row) => row.status).join(","));
    assert.equal(posts.length, 0);
  } finally {
    await close(app);
  }
});

test("meeting end stays pending when verified attendance cannot be read", async () => {
  const { app } = followupApp({
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom() { throw new Error("attendance unread"); },
    },
  });
  await listen(app);
  try {
    const transcript = JSON.stringify({
      event: "transcript.data",
      data: { bot: { id: "bot-live" }, data: { participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true }, words: [{ text: "Maple" }, { text: "keep" }, { text: "the" }, { text: "phrase" }, { text: "private." }] } },
    });
    assert.equal((await recall(app.address().port, transcript)).status, 204);
    const ended = await recall(app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(ended.status, 503);
    assert.match(ended.raw, /finalization-pending/);
    assert.equal(ended.raw.includes("keep the phrase private"), false);
  } finally {
    await close(app);
  }
});

test("room media fails closed when the overlay fails after the room was readable", async () => {
  const session = createSession();
  session.decisions.push({
    id: "visible-decision", text: "hidden booth phrase", roomId: "room-1", deleted: false, inviteMemberIds: ["100"], memberId: "100",
  });
  let reads = 0;
  const app = createApp({
    session, companyLoaded: true,
    deletions: {
      async list() {
        reads += 1;
        if (reads > 3) throw new Error("overlay down");
        return [];
      },
      async request() { throw new Error("overlay down"); },
    },
    deps: {
      memory: { async remember() { return { blobId: "blob" }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(app);
  try {
    const media = await get(app.address().port, "/console/rooms/room-1/media?member=100");
    assert.equal(media.status, 503);
    assert.equal(media.raw.includes("hidden booth phrase"), false);
    assert.ok(reads > 3);
  } finally {
    await close(app);
  }
});

test("a checksum is kept only in its trusted form, and room attendance uses the room rpc", async () => {
  const hex = "ab".repeat(32);
  assert.equal(fileMetadata({ id: "f1", sha256: Buffer.from(hex, "hex") }).sha256, hex);
  assert.equal(fileMetadata({ id: "f1", sha256: "AB".repeat(32) }).sha256, hex);
  assert.equal("sha256" in fileMetadata({ id: "f1", sha256: "nope" }), false);
  const folder = { folderId: "folder" };
  const meta = { sederunt_file_id: "f1", tenant_id: tenant, channel_id: "C1" };
  assert.equal(importedFile({ status: "active", id: "c1", name: "f1-notes.txt", metadata: { ...meta, sha256: hex } }, folder).sha256, hex);
  assert.equal(importedFile({ status: "active", id: "c1", name: "f1-notes.txt", metadata: { ...meta, sha256: 12 } }, folder).sha256, "");
  const store = createFileStore();
  const imported = await store.importActive({
    id: "file-buf", name: "notes.txt", tenantId: tenant, channelId: "C1", consoleFolderId: "folder", consoleFileId: "console", sha256: Buffer.from(hex, "hex"),
  });
  assert.equal(Buffer.from(imported.sha256).toString(), hex);
  const calls = [];
  const bindings = createParticipantBindings({
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SECRET_KEY: "service-key-for-fixture",
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => [{ member_id: "100", room_id: "room-a" }] };
    },
  });
  const rows = await bindings.forRoom(tenant, "room-a");
  assert.equal(calls[0].url.endsWith("/rest/v1/rpc/verified_participants_for_room"), true);
  assert.deepEqual(calls[0].body, { p_tenant: tenant, p_room: "room-a" });
  assert.equal(rows[0].member_id, "100");
  assert.deepEqual(await bindings.forRoom("", "room-a"), []);
  const empty = createParticipantBindings({
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SECRET_KEY: "service-key-for-fixture",
  }, { fetchImpl: async () => ({ ok: true, json: async () => null }) });
  assert.deepEqual(await empty.forRoom(tenant, "room-a"), []);
  const down = createParticipantBindings({
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SECRET_KEY: "service-key-for-fixture",
  }, { fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  await assert.rejects(() => down.forRoom(tenant, "room-b"), /could not be checked/);
});

test("production boot rejects an unsafe configuration", async () => {
  const planted = "planted-secret-value-should-not-appear";
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "production",
      PORT: "8799",
      SEDERUNT_AUTH_FAKE: "1",
      SEDERUNT_SESSION_SECRET: planted,
      ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE } : {}),
    },
  });
  let out = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.stderr.on("data", (chunk) => { out += chunk; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGTERM"); resolve("timeout"); }, 8000);
    child.on("exit", (status) => { clearTimeout(timer); resolve(status); });
  });
  assert.equal(code === 0 || code === "timeout", false);
  assert.equal(out.includes("Production configuration is incomplete"), true);
  assert.equal(out.includes("SEDERUNT_AUTH_FAKE"), true);
  assert.equal(out.includes(planted), false);
});

test("a broken Slack control does not run, and minutes can fail after the meeting is saved", async () => {
  const unset = followupApp({ env: { SLACK_SIGNING_SECRET: "" } });
  await listen(unset.app);
  try {
    const missing = await post(unset.app.address().port, "/api/slack/interactivity", "payload=%7B%7D", {
      "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(missing.status, 503);
    assert.equal(missing.raw, "Slack is not set up.");
  } finally {
    await close(unset.app);
  }

  const issues = [];
  const posts = [];
  const { app, store } = followupApp({
    deps: {
      memory: { async remember() { return { blobId: "blob-1" }; }, async index() { return []; }, async recall() { return []; } },
      slack: {
        fetch: async (url, options = {}) => {
          if (String(url).includes("views.open")) return slackJson({ ok: false, error: "invalid_trigger" });
          return slackFetch(posts)(url, options);
        },
      },
      linear: { async createIssue(input) { issues.push(input); return { identifier: "ROW-72", id: "issue-72", title: input.title }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(app);
  const port = app.address().port;
  const authorizedSource = await primeFollowup(app, store);
  try {
    const raw = new URLSearchParams({
      payload: JSON.stringify({
        type: "block_actions", team: { id: "T1" }, user: { id: "U_MINA" },
        actions: [{ action_id: "approve:1", value: `action:${"ab".repeat(32)}:1` }],
      }),
    }).toString();
    const badSig = await post(port, "/api/slack/interactivity", raw, {
      ...slackHeaders(raw), "x-slack-signature": "v0=deadbeef", "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(badSig.status, 401);
    assert.equal(badSig.raw, "rejected");

    const junk = "payload=not-json";
    const badBody = await post(port, "/api/slack/interactivity", junk, {
      ...slackHeaders(junk), "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(badBody.status, 400);
    assert.equal(badBody.raw, "Invalid request.");

    const foreign = new URLSearchParams({
      payload: JSON.stringify({
        type: "block_actions", team: { id: "T9" }, user: { id: "U_MINA" },
        actions: [{ action_id: "approve:1", value: "nope" }],
      }),
    }).toString();
    const foreignSent = await post(port, "/api/slack/interactivity", foreign, {
      ...slackHeaders(foreign), "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(foreignSent.status, 200);
    assert.equal(JSON.parse(foreignSent.raw).error, "forbidden_or_stale");

    const invalid = new URLSearchParams({
      payload: JSON.stringify({
        type: "block_actions", team: { id: "T1" }, user: { id: "U_MINA" },
        actions: [{ action_id: "nope", value: "nope" }],
      }),
    }).toString();
    const invalidSent = await post(port, "/api/slack/interactivity", invalid, {
      ...slackHeaders(invalid), "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(invalidSent.status, 200);
    assert.equal(JSON.parse(invalidSent.raw).error, "invalid");

    const editId = followupId("action", tenant, "bot-live", "source-modal");
    await store.put({
      id: editId, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "pending",
      data: actionData({ sourceId: authorizedSource, title: "Keep the booth" }),
    });
    const modal = await slackAction(port, { user: "U_MINA", value: `${editId}:1`, action: "edit" });
    assert.equal(modal.status, 503);
    assert.equal(JSON.parse(modal.raw).error, "modal-failed");
    assert.equal(issues.length, 0);
    assert.equal((await store.get(tenant, editId)).status, "pending");
  } finally {
    await close(app);
  }

  const saved = [];
  let minutes = false;
  const coordinated = followupApp({
    followups: {
      async enqueue(input) {
        saved.push(input.tenantId);
        return { id: "saved-meeting" };
      },
    },
    deps: {
      memory: {
        async remember() {
          if (minutes) throw new Error("minutes store failed");
          return { blobId: "blob-1" };
        },
        async index() { return []; },
        async recall() { return []; },
      },
      slack: { fetch: slackFetch([]) },
      linear: { async createIssue() { return { identifier: "ROW-73", id: "issue-73" }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(coordinated.app);
  try {
    const live = coordinated.app.address().port;
    const transcript = JSON.stringify({
      event: "transcript.data",
      data: {
        bot: { id: "bot-live" },
        data: {
          participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true },
          words: [{ text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }],
        },
      },
    });
    assert.equal((await recall(live, transcript)).status, 204);
    minutes = true;
    const ended = await recall(live, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(ended.status, 204);
    assert.deepEqual(saved, [tenant]);
  } finally {
    await close(coordinated.app);
  }

  const session = createSession();
  let minutesRead = false;
  session.actions.push({
    roomId: "bot-live",
    memberId: "100",
    get statement() {
      minutesRead = true;
      throw new Error("minutes view failed");
    },
  });
  const trapped = createApp({
    companyLoaded: false,
    session,
    env: { RECALL_WEBHOOK_SECRET: recallSecret },
    deps: {
      memory: { async remember() { return { blobId: "blob-1" }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(trapped);
  try {
    const ended = await recall(trapped.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(minutesRead, true);
    assert.equal(ended.status, 204);
    assert.equal(ended.raw.includes("minutes view failed"), false);
  } finally {
    await close(trapped);
  }
});

test("approval rejects an unknown tool, a blank title, a missing permit check, a stale permit, and a calendar with no connector", async () => {
  const session = createSession();
  const store = createMemoryFollowupStore();
  let coordinator;
  coordinator = createMeetingFollowups({
    store,
    authorize: async () => true,
    handleUtterance: (input) => handleUtterance({ ...input, session }, {
      linear: { async createIssue() { return { identifier: "ROW-71" }; } },
      followups: coordinator,
    }),
  });
  const base = { kind: "action", status: "pending", meetingId: "bot-1", tenantId: tenant };
  const unknown = followupId("action", tenant, "bot-1", "unknown-tool");
  await store.put({ ...base, id: unknown, data: actionData({ tool: "not_a_tool", kind: "note", title: "Booth" }) });
  const disconnected = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${unknown}:1` });
  assert.equal(disconnected.status, "failed");
  assert.equal((await store.get(tenant, unknown)).data.next, "This approval is not a connected action.");

  const blankTitle = followupId("action", tenant, "bot-1", "blank-title");
  await store.put({ ...base, id: blankTitle, data: actionData({ title: "   ", args: { title: "   " } }) });
  const untitled = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${blankTitle}:1` });
  assert.equal(untitled.status, "failed");
  assert.equal((await store.get(tenant, blankTitle)).data.next, "A title is required.");

  const missingTitle = followupId("action", tenant, "bot-1", "missing-title");
  await store.put({ ...base, id: missingTitle, data: actionData({ args: {} }) });
  const noTitle = await coordinator.interact({ tenantId: tenant, actorSlackId: "U_MINA", teamId: "T1", channelId: "D100", threadTs: "111.222", verb: "approve", value: `${missingTitle}:1` });
  assert.equal(noTitle.status, "failed");
  assert.equal((await store.get(tenant, missingTitle)).data.next, "A title is required.");

  const unchecked = await handleUtterance({
    intent: "followup-approve",
    memberId: "100",
    session,
    followup: { id: "loose", tool: "create_issue", args: { title: "Booth" }, meetingId: "bot-1" },
  }, { followups: {} });
  assert.equal(unchecked.next, "Approval could not be checked.");

  const staleId = followupId("action", tenant, "bot-1", "stale-permit");
  await store.put({ ...base, id: staleId, data: actionData({ title: "Booth" }) });
  const stale = await handleUtterance({
    intent: "followup-approve",
    memberId: "100",
    session,
    followup: {
      id: staleId, tenantId: tenant, meetingId: "bot-1", version: 1, claimId: "not-the-claim",
      actorSlackId: "U_MINA", requesterSlackId: "U_MINA", sourceId: "source", kind: "assign_task",
      tool: "create_issue", args: { title: "Booth" }, existingActionId: "", explicit: false,
    },
  }, { followups: coordinator, linear: { async createIssue() { throw new Error("must not file"); } } });
  assert.equal(stale.next, "This approval is no longer valid.");
  assert.equal((await store.get(tenant, staleId)).status, "pending");

  const calendar = await handleUtterance({
    intent: "followup-approve",
    memberId: "100",
    session,
    followup: { id: "cal-direct", tool: "update_event", args: { eventId: "evt-direct" }, meetingId: "bot-1" },
  }, {});
  assert.equal(calendar.next, "Connect Google Calendar, then approve again.");
});

test("a signed edit saves through the live validator, and a typed follow-up stays on Slack", async () => {
  const { app, store } = followupApp();
  await listen(app);
  const port = app.address().port;
  const authorizedSource = await primeFollowup(app, store);
  try {
    const id = followupId("action", tenant, "bot-live", "save-title");
    await store.put({
      id, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "editing",
      data: actionData({ sourceId: authorizedSource, title: "Old title" }),
    });
    const saved = await slackPayload(port, {
      type: "view_submission",
      team_id: "T1",
      user: { id: "U_MINA" },
      view: {
        private_metadata: `${id}:1`,
        state: { values: { block: { change: { value: "Retitle the booth" } } } },
      },
    });
    assert.equal(saved.body.ok, true);
    const row = await store.get(tenant, id);
    assert.equal(row.status, "pending");
    assert.equal(row.data.args.title, "Retitle the booth");
    assert.equal(row.data.argumentVersion, 2);

    const blankId = followupId("action", tenant, "bot-live", "save-blank");
    await store.put({
      id: blankId, tenantId: tenant, meetingId: "bot-live", kind: "action", status: "editing",
      data: actionData({ sourceId: authorizedSource, title: "Keep" }),
    });
    const rejected = await slackPayload(port, {
      type: "view_submission",
      team: { id: "T1" },
      user: { id: "U_MINA" },
      view: { private_metadata: `${blankId}:1`, state: { values: {} } },
    });
    assert.equal(rejected.body.response_action, "errors");
    assert.ok(rejected.body.errors.change);
    assert.equal((await store.get(tenant, blankId)).status, "editing");

    const forged = await post(port, "/api/typed", JSON.stringify({ text: "approve", followup: { id, tool: "create_issue" } }), { "content-type": "application/json" });
    assert.equal(forged.status, 403);
    assert.match(forged.raw, /signed Slack action/);
    const intentOnly = await post(port, "/api/typed", JSON.stringify({ intent: "followup-approve", text: "approve" }), { "content-type": "application/json" });
    assert.equal(intentOnly.status, 403);
    assert.match(intentOnly.raw, /signed Slack action/);

    const empty = await post(port, "/api/slack/interactivity", "payload=", { ...slackHeaders("payload="), "content-type": "application/x-www-form-urlencoded" });
    assert.equal(empty.status, 400);
    assert.equal(empty.raw, "Invalid request.");
    const broken = await post(port, "/api/slack", "{", slackHeaders("{"));
    assert.equal(broken.status, 400);
    assert.equal(broken.raw, "Invalid request.");

    const noTeam = await slackPayload(port, { type: "block_actions", user: { id: "U_MINA" }, actions: [{ action_id: "approve:x", value: `${id}:2` }] });
    assert.equal(noTeam.body.error, "forbidden_or_stale");
    const noValue = await slackPayload(port, { type: "block_actions", team: { id: "T1" }, user: { id: "U_MINA" } });
    assert.equal(noValue.body.error, "invalid");
  } finally {
    await close(app);
  }
});

test("meeting finalization records an empty Slack team as unverified and keeps a durable lookup pending", async () => {
  const seen = [];
  const emptyTeam = followupApp({
    slackInstallations: {
      async tokenFor() { return { token: "xoxb-test", teamId: "", generation: 1, botUserId: "B1", channelId: "" }; },
      async byTeam() { return null; },
    },
    slackMatches: { async get(input) { seen.push(input.workspaceId); return null; } },
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom() { return [{ memberId: "100", email: "mina@example.com", roomId: "bot-live" }]; },
    },
  });
  await listen(emptyTeam.app);
  try {
    const ended = await recall(emptyTeam.app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(ended.status, 204);
    assert.deepEqual(seen, []);
    assert.equal((await emptyTeam.store.list(tenant, { kind: "outcome" }))[0].data.terminal, "no-team");
  } finally {
    await close(emptyTeam.app);
  }

  const privateRoom = followupApp({
    slackMatches: { async get() { return {}; } },
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom() { return [{ memberId: "100", email: "mina@example.com", roomId: "bot-live" }]; },
    },
  });
  await listen(privateRoom.app);
  try {
    const ended = await recall(privateRoom.app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
    assert.equal(ended.status, 204);
    const outcome = (await privateRoom.store.list(tenant, { kind: "outcome" })).find((row) => row.data?.input);
    assert.ok(outcome);
    assert.equal(outcome.data.input.botName, "Adam");
    assert.equal(outcome.data.input.meeting.privateOneToOne, true);
    assert.equal(outcome.data.input.meeting.people[0].slackUserId, "");
  } finally {
    await close(privateRoom.app);
  }

  for (const coded of [false, true]) {
    const failed = followupApp({
      slackMatches: {
        durable: true,
        async get() {
          const error = new Error("lookup down");
          if (coded) error.code = "followup-persist";
          throw error;
        },
      },
      participantBindings: {
        async record() {},
        async forUser() { return []; },
        async forRoom() { return [{ memberId: "100", email: "mina@example.com", roomId: "bot-live" }]; },
      },
    });
    await listen(failed.app);
    try {
      const ended = await recall(failed.app.address().port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }));
      assert.equal(ended.status, 503);
      assert.equal(ended.raw, "finalization-pending");
      assert.equal(ended.raw.includes("lookup down"), false);
      assert.equal((await failed.store.list(tenant, { kind: "outcome" })).length, 0);
    } finally {
      await close(failed.app);
    }
  }
});

test("minutes and channel posts stay unsent without current recipient evidence", async () => {
  const posts = [];
  const { app, store } = followupApp({
    posts,
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom(_tenantId, roomId) {
        return roomId === "meet-null" ? null : [{ memberId: "100", email: "mina@example.com" }];
      },
    },
  });
  await store.put({ id: "delivery:none", tenantId: tenant, meetingId: "meet-none", kind: "delivery", status: "pending", data: { teamId: "T1", requesterSlackId: "U_MINA", text: "none", messageId: "m-none", attempts: 0 } });
  await store.put({ id: "outcome:empty", tenantId: tenant, meetingId: "meet-empty", kind: "outcome", status: "done", data: { input: { memberIds: [] } } });
  await store.put({ id: "delivery:empty", tenantId: tenant, meetingId: "meet-empty", kind: "delivery", status: "pending", data: { teamId: "T1", requesterSlackId: "U_MINA", text: "empty", messageId: "m-empty", attempts: 0 } });
  await store.put({ id: "outcome:null", tenantId: tenant, meetingId: "meet-null", kind: "outcome", status: "done", data: { input: { memberIds: ["100"], meeting: {} } } });
  await store.put({ id: "delivery:null", tenantId: tenant, meetingId: "meet-null", kind: "delivery", status: "pending", data: { teamId: "T1", requesterSlackId: "U_GHOST", text: "null", messageId: "m-null", attempts: 0 } });
  await store.put({ id: "outcome:open", tenantId: tenant, meetingId: "meet-open", kind: "outcome", status: "done", data: { input: { memberIds: ["100"], channelAuthorized: false, meeting: { bindingChannelId: "C-MEET" } } } });
  await store.put({ id: "delivery:open", tenantId: tenant, meetingId: "meet-open", kind: "delivery", status: "pending", data: { teamId: "T1", channelId: "C-MEET", text: "open", messageId: "m-open", attempts: 0 } });
  await store.put({ id: "outcome:channel", tenantId: tenant, meetingId: "meet-channel", kind: "outcome", status: "done", data: { input: { memberIds: ["100"], channelAuthorized: true, meeting: { bindingChannelId: "C-MEET", people: [{ memberId: "100", slackUserId: "U_MINA" }] } } } });
  await store.put({ id: "delivery:short", tenantId: tenant, meetingId: "meet-channel", kind: "delivery", status: "pending", data: { teamId: "T1", text: "short", messageId: "m-short", attempts: 0 } });
  await store.put({ id: "delivery:other", tenantId: tenant, meetingId: "meet-channel", kind: "delivery", status: "pending", data: { teamId: "T1", channelId: "C-OTHER", text: "other", messageId: "m-other", attempts: 0 } });
  await store.put({ id: "delivery:channel", tenantId: tenant, meetingId: "meet-channel", kind: "delivery", status: "pending", data: { teamId: "T1", channelId: "C-MEET", text: "Minutes for the booth", messageId: "m-channel", attempts: 0 } });
  await listen(app);
  try {
    const drained = await post(app.address().port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value", "content-type": "application/json",
    });
    assert.equal(drained.status, 200);
    for (const id of ["delivery:none", "delivery:empty", "delivery:null", "delivery:open", "delivery:short", "delivery:other"]) {
      assert.equal((await store.get(tenant, id)).status, "not_reached", id);
    }
    assert.equal((await store.get(tenant, "delivery:channel")).status, "not_reached");
    assert.equal(posts.some((row) => row.channel === "C-MEET" && row.text === "Minutes for the booth"), false);
    assert.equal(posts.some((row) => row.channel === "C-OTHER"), false);
  } finally {
    await close(app);
  }
});

test("recovery finds a pending tenant after older follow-ups but withholds unverified minutes", async () => {
  const posts = [];
  const buried = "33333333-3333-4333-8333-333333333333";
  const { app, store } = followupApp({
    posts,
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom() { return [{ memberId: "100", email: "mina@example.com" }]; },
    },
  });
  for (let index = 0; index < 101; index += 1) {
    await store.put({
      id: `outcome:history:${index}`, tenantId: tenant, meetingId: `meet-history-${index}`, kind: "outcome", status: "done",
      data: { input: { memberIds: ["100"] } },
    });
  }
  await store.put({
    id: "action:dirty-history", tenantId: tenant, meetingId: "meet-history-0", kind: "action", status: "done",
    data: { notificationsDirty: true, requesterSlackId: "U_MINA", requesterMemberId: "100", memberIds: ["100"], argumentVersion: 1, attempts: 0 },
  });
  await store.put({
    id: "outcome:buried", tenantId: buried, meetingId: "meet-buried", kind: "outcome", status: "done",
    data: { input: { memberIds: ["100"], channelAuthorized: true, meeting: { bindingChannelId: "C-MEET", people: [{ memberId: "100", slackUserId: "U_MINA" }] } } },
  });
  await store.put({
    id: "delivery:buried", tenantId: buried, meetingId: "meet-buried", kind: "delivery", status: "pending",
    data: { teamId: "T1", requesterSlackId: "U_MINA", text: "Minutes for the later tenant", messageId: "m-buried", attempts: 0 },
  });
  await listen(app);
  try {
    const drained = await post(app.address().port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value", "content-type": "application/json",
    });
    assert.equal(drained.status, 200);
    const body = JSON.parse(drained.raw);
    assert.equal(body.followups.some((row) => row.tenantId === buried && row.count >= 1), true);
    assert.equal((await store.get(buried, "delivery:buried")).status, "not_reached");
    assert.equal(posts.some((row) => row.text === "Minutes for the later tenant"), false);
    assert.equal((await store.get(tenant, "outcome:history:0")).status, "done");
  } finally {
    await close(app);
  }
});

test("a later meeting after older outcomes does not deliver minutes with incomplete evidence", async () => {
  const posts = [];
  const { app, store } = followupApp({
    posts,
    participantBindings: {
      async record() {},
      async forUser() { return []; },
      async forRoom(_tenantId, roomId) {
        return roomId === "meet-later" ? [{ memberId: "100", email: "mina@example.com" }] : [];
      },
    },
  });
  for (let index = 0; index < 101; index += 1) {
    await store.put({
      id: `outcome:older:${index}`, tenantId: tenant, meetingId: `meet-older-${index}`, kind: "outcome", status: "done",
      data: { input: { memberIds: ["9"], channelAuthorized: true, meeting: { bindingChannelId: "C-OLD", people: [{ memberId: "9", slackUserId: "U_OLD" }] } } },
    });
  }
  await store.put({
    id: "outcome:later-blank", tenantId: tenant, meetingId: "meet-later", kind: "outcome", status: "done", data: {},
  });
  await store.put({
    id: "outcome:later", tenantId: tenant, meetingId: "meet-later", kind: "outcome", status: "done",
    data: { input: { memberIds: ["100"], channelAuthorized: true, meeting: { bindingChannelId: "C-MEET", people: [{ memberId: "100", slackUserId: "U_MINA" }] } } },
  });
  await store.put({
    id: "delivery:later", tenantId: tenant, meetingId: "meet-later", kind: "delivery", status: "pending",
    data: { teamId: "T1", requesterSlackId: "U_MINA", text: "Minutes for the later meeting", messageId: "m-later", attempts: 0 },
  });
  await listen(app);
  try {
    const drained = await post(app.address().port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value", "content-type": "application/json",
    });
    assert.equal(drained.status, 200);
    assert.equal((await store.get(tenant, "delivery:later")).status, "not_reached");
    assert.equal(posts.some((row) => row.channel === "D100" && row.text === "Minutes for the later meeting"), false);
    assert.equal(posts.some((row) => row.channel === "C-OLD"), false);
  } finally {
    await close(app);
  }
});

test("a minutes delivery does not post when Slack is unlinked or has no team", async () => {
  const bindings = {
    async record() {},
    async forUser() { return []; },
    async forRoom() { return [{ memberId: "100", email: "mina@example.com" }]; },
  };
  const evidence = { memberIds: ["100"], channelAuthorized: true, meeting: { bindingChannelId: "C-MEET", people: [{ memberId: "100", slackUserId: "U_MINA" }] } };
  async function deliver(extra) {
    const posts = [];
    const { app, store } = followupApp({ ...extra, posts, participantBindings: bindings });
    await store.put({ id: "outcome:solo", tenantId: tenant, meetingId: "meet-solo", kind: "outcome", status: "done", data: { input: evidence } });
    await store.put({ id: "delivery:solo", tenantId: tenant, meetingId: "meet-solo", kind: "delivery", status: "pending", data: { teamId: "T1", channelId: "C-MEET", text: "Minutes", messageId: "m-solo", attempts: 0 } });
    await listen(app);
    try {
      const drained = await post(app.address().port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
        authorization: "Bearer recovery-secret-value", "content-type": "application/json",
      });
      assert.equal(drained.status, 200);
      assert.equal((await store.get(tenant, "delivery:solo")).status, "not_reached");
      assert.equal(posts.length, 0);
    } finally {
      await close(app);
    }
  }
  await deliver({ env: { SLACK_CLIENT_ID: "", SLACK_CLIENT_SECRET: "" } });
  await deliver({
    slackInstallations: {
      async tokenFor() { return { token: "xoxb-test", teamId: "", generation: 1, botUserId: "B1", channelId: "" }; },
      async byTeam() { return null; },
    },
  });
});

test("Slack deletion without a team id does not report success when memory cannot store it", async () => {
  const session = createSession();
  session.decisions.push({
    id: "slack-decision", text: "keep the floor plan", roomId: "C1", sourceDeliveryId: "123.456", deleted: false, inviteMemberIds: ["U_MINA"], memberId: "U_MINA",
  });
  const app = createApp({
    session, companyLoaded: false,
    env: {
      SLACK_SIGNING_SECRET: "slack-signing-secret",
      CONSOLE_API_KEY: "console-key",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-private",
      SEDERUNT_SESSION_SECRET: "session-secret-for-files-branch-test",
    },
    deps: { memory: null, slack: { fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }) } },
  });
  await listen(app);
  try {
    const raw = JSON.stringify({
      type: "event_callback",
      event: { type: "message", subtype: "message_deleted", channel: "C1", deleted_ts: "123.456" },
    });
    const sent = await post(app.address().port, "/api/slack", raw, slackHeaders(raw));
    assert.equal(sent.status, 503);
    assert.equal(sent.raw, JSON.stringify({ error: "Deletion could not be saved. Retry this event." }));
    assert.equal(session.decisions[0].deleted, false);
  } finally {
    await close(app);
  }
});

test("files use Supabase only when a server key is configured", async () => {
  const base = {
    CONSOLE_API_KEY: "console-key",
    CONSOLE_SERVICE_PRIVATE_KEY: "console-private",
    SEDERUNT_SESSION_SECRET: "session-secret-for-files-branch-test",
  };
  const apps = [
    createApp({ env: { ...base } }),
    createApp({ env: { ...base, SUPABASE_URL: "https://files.example.test", SUPABASE_SERVICE_ROLE_KEY: "service-role" } }),
    createApp({ env: { ...base, SUPABASE_URL: "https://files.example.test", SUPABASE_SECRET_KEY: "secret-role" } }),
    createApp({ env: { ...base, SUPABASE_URL: "https://files.example.test" } }),
  ];
  try {
    for (const app of apps) {
      await listen(app);
      const page = await get(app.address().port, "/");
      assert.equal(page.status, 200);
      assert.match(page.raw, /Sederunt/);
    }
  } finally {
    await Promise.all(apps.map((app) => close(app).catch(() => {})));
  }
});

test("an unreadable follow-up list fails the request, and room media stays unavailable", async () => {
  const { app, store } = followupApp();
  store.list = async () => { throw new Error("follow-up list down"); };
  await listen(app);
  try {
    const drained = await post(app.address().port, "/api/recovery/drain", JSON.stringify({ limit: 10 }), {
      authorization: "Bearer recovery-secret-value", "content-type": "application/json",
    });
    assert.equal(drained.status, 500);
    assert.equal(drained.raw, "Request failed.");
    assert.equal(drained.raw.includes("follow-up list down"), false);
  } finally {
    await close(app);
  }

  const session = createSession();
  session.decisions.push({
    id: "secret-decision", text: "hidden booth phrase", roomId: "room-1", deleted: false, inviteMemberIds: ["100"], memberId: "100",
  });
  let reads = 0;
  const media = createApp({
    session, companyLoaded: true,
    env: { SEDERUNT_MEMBER: "100" },
    deletions: {
      async list() {
        reads += 1;
        if (reads > 1) throw new Error("overlay down");
        return [];
      },
      async request() { throw new Error("overlay down"); },
    },
    deps: {
      memory: { async remember() { return { blobId: "blob" }; }, async index() { return []; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  await listen(media);
  try {
    const body = await get(media.address().port, "/console/rooms/room-1/media");
    assert.equal(reads > 1, true);
    assert.equal(body.status, 503);
    assert.equal(body.raw, "Request failed.");
    assert.equal(body.raw.includes("hidden booth phrase"), false);
    assert.equal(body.raw.includes("overlay down"), false);
  } finally {
    await close(media);
  }
});

test("production boot rejects incomplete configuration without printing a secret", async () => {
  const planted = "planted-secret-value-should-not-appear";
  const root = fileURLToPath(new URL("..", import.meta.url));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
    PORT: "8798",
    SUPABASE_URL: "http://127.0.0.1",
    SEDERUNT_CONSOLE_SECRET: planted,
  };
  if (process.env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, ["src/server.js"], { cwd: root, env });
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const timer = setTimeout(() => child.kill("SIGTERM"), 8000);
  const code = await new Promise((resolve) => child.once("exit", resolve));
  clearTimeout(timer);
  assert.notEqual(code, 0);
  assert.match(stderr, /Production configuration is incomplete/);
  assert.equal(stderr.includes(planted), false);
  assert.equal(stdout.includes(planted), false);
  assert.equal(stdout.includes("Sederunt typed path"), false);
});

function actionData(extra = {}) {
  return {
    sourceId: extra.sourceId || "source",
    kind: extra.kind || "assign_task",
    tool: extra.tool || "create_issue",
    args: extra.args || { title: extra.title || "Booth" },
    summary: extra.summary || extra.title || "Booth",
    where: extra.where || "Linear",
    requesterMemberId: "100",
    requesterSlackId: "U_MINA",
    teamId: "T1",
    memberIds: ["100"],
    argumentVersion: 1,
    attempts: 0,
    explicit: extra.explicit === true,
    existingActionId: extra.existingActionId || "",
    channelId: "D100",
    threadTs: "111.222",
    botName: "Maple",
  };
}

function followupApp(extra = {}) {
  const posts = extra.posts || [];
  const store = extra.store || createMemoryFollowupStore();
  const app = createApp({
    companyLoaded: true,
    autoRecovery: false,
    followupStore: store,
    env: {
      RECALL_WEBHOOK_SECRET: recallSecret,
      SLACK_SIGNING_SECRET: "slack-signing-secret",
      SLACK_CLIENT_ID: "slack-client",
      SLACK_CLIENT_SECRET: "slack-client-secret",
      SEDERUNT_RECOVERY_SECRET: "recovery-secret-value",
      ...(extra.env || {}),
    },
    deps: extra.deps || {
      memory: { async remember() { return { blobId: "blob-1" }; }, async index() { return []; }, async recall() { return []; } },
      slack: { fetch: slackFetch(posts) },
      linear: { async createIssue(input) { return { identifier: "ROW-71", id: "issue-71", title: input.title }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
    tenantBind: {
      async resolve(kind, id) {
        if (kind === "bot" && id === "bot-live") return tenant;
        if (kind === "slack" && (id === "T1" || id === "T1:C1")) return tenant;
        return "";
      },
      async releaseTenants() {},
    },
    slackInstallations: extra.slackInstallations || {
      async tokenFor() { return { token: "xoxb-test", teamId: "T1", generation: 1, botUserId: "B1", channelId: "" }; },
      async byTeam(team) { return team === "T1" ? { tenantId: tenant, token: "xoxb-test", teamId: "T1", generation: 1, botUserId: "B1", appId: "A1" } : null; },
    },
    ...(extra.session ? { session: extra.session } : {}),
    ...(extra.followups ? { followups: extra.followups } : {}),
    slackMatches: extra.slackMatches || { async get({ email }) { return email === "mina@example.com" ? { slackUserId: "U_MINA", source: "override" } : null; } },
    participantBindings: extra.participantBindings,
    googleGrants: extra.googleGrants,
    adminStore: { async tenantRetired() { return false; } },
  });
  return { app, posts, store };
}

async function primeFollowup(app, store) {
  const port = app.address().port;
  const transcript = JSON.stringify({ event: "transcript.data", data: { bot: { id: "bot-live" }, data: {
    participant: { id: 100, name: "Mina", email: "mina@example.com", email_verified: true },
    words: [{ text: "Maple" }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }],
  } } });
  assert.equal((await recall(port, transcript)).status, 204);
  assert.equal((await recall(port, JSON.stringify({ event: "bot.done", data: { bot: { id: "bot-live" } } }))).status, 204);
  const outcomes = await store.list(tenant, { kind: "outcome", meetingId: "bot-live" });
  assert.ok(outcomes[0]?.data?.input?.sources?.length);
  return outcomes[0].data.input.sources[0].id;
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening");
}

function slackFetch(posts) {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    const target = String(url);
    if (target.includes("conversations.open")) return slackJson({ ok: true, channel: { id: "D100" } });
    if (target.includes("chat.postMessage") || target.includes("chat.update")) {
      posts.push(body);
      return slackJson({ ok: true, channel: body.channel, ts: body.ts || `1700000000.${posts.length}` });
    }
    if (target.includes("views.open")) return slackJson({ ok: true });
    if (target.includes("chat.getPermalink")) return slackJson({ ok: true, permalink: "https://slack.example/archives/D100/p1" });
    return slackJson({ ok: true });
  };
}

function slackJson(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function recall(port, payload) {
  const id = `msg_${payload.length}`;
  const timestamp = "1731705121";
  return post(port, "/api/recall", payload, {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signRecall(id, timestamp, payload)}`,
  });
}

function signRecall(id, timestamp, payload) {
  const key = Buffer.from(recallSecret.slice("whsec_".length), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

function slackHeaders(raw) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", "slack-signing-secret").update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  return { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature, "content-type": "application/json" };
}

function slackPayload(port, payload) {
  const raw = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  return post(port, "/api/slack/interactivity", raw, { ...slackHeaders(raw), "content-type": "application/x-www-form-urlencoded" }).then((sent) => ({
    ...sent,
    body: JSON.parse(sent.raw || "{}"),
  }));
}

function slackAction(port, { user, value, action }) {
  const payload = {
    type: "block_actions",
    team: { id: "T1" },
    user: { id: user },
    channel: { id: "D100" },
    message: { ts: "111.222", thread_ts: "111.222" },
    actions: [{ action_id: `${action}:${value}`, value }],
  };
  const raw = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  return post(port, "/api/slack/interactivity", raw, { ...slackHeaders(raw), "content-type": "application/x-www-form-urlencoded" }).then((sent) => ({
    ...sent,
    body: JSON.parse(sent.raw || "{}"),
  }));
}

function post(port, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}


test("paused explicit meeting requests become proposals without an invented decision link", () => {
  const built = buildMeetingFollowupInput({ tenantId: tenant, meetingId: "bot-1", teamId: "T1",
    decisions: [], bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com", slackUserId: "U_MINA" }],
    actions: [{ id: "act-1", deliveryId: "spoken-1", roomId: "bot-1", memberId: "100", state: "paused", tool: "linear", statement: "File the booth", params: { title: "Booth" }, inviteMemberIds: ["100"] },
      { id: "closed", roomId: "bot-1", memberId: "100", state: "closed", tool: "linear", statement: "Already done", connectorId: "ROW-1", inviteMemberIds: ["100"] }] });
  assert.equal(built.proposals.length, 1);
  assert.equal(built.proposals[0].sourceId, "action:spoken-1");
  assert.equal(built.sources[0].action.existingActionId, "act-1");
  assert.deepEqual(built.sources[0].action.args, { title: "Booth" });
  assert.deepEqual(built.minutes.decisions, []);
});


test("a precise inferred ticket suggestion requires approval and keeps its speaker", () => {
  const built = buildMeetingFollowupInput({ tenantId: tenant, meetingId: "bot-1", teamId: "T1", actions: [],
    decisions: [{ id: "d1", roomId: "bot-1", speakerMemberId: "100", inviteMemberIds: ["100"], text: "We should create a ticket titled Booth setup." }],
    bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com", slackUserId: "U_MINA" }] });
  assert.equal(built.proposals.length, 1);
  assert.equal(built.sources[0].action.explicit, false);
  assert.equal(built.sources[0].action.args.title, "Booth setup");
  assert.equal(built.sources[0].slackUserId, "U_MINA");
});


test("an inferred suggestion cannot duplicate a completed request from the same source", () => {
  const built = buildMeetingFollowupInput({ tenantId: tenant, meetingId: "bot-1", teamId: "T1",
    decisions: [{ id: "d1", roomId: "bot-1", speakerMemberId: "100", sourceDeliveryId: "spoken-1", inviteMemberIds: ["100"], text: "We should create a ticket titled Booth setup." }],
    actions: [{ id: "act-1", deliveryId: "spoken-1", roomId: "bot-1", memberId: "100", state: "closed", tool: "linear", statement: "Booth setup", connectorId: "ROW-1", inviteMemberIds: ["100"] }],
    bindings: [{ roomId: "bot-1", memberId: "100", email: "mina@example.com", slackUserId: "U_MINA" }] });
  assert.deepEqual(built.proposals, []);
});
