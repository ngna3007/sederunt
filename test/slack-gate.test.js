import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { mockAccount } from "../src/memory/mock-account.js";
import { createApp } from "../src/server.js";
import { slackBotUserIds, slackDelivery, slackEventHasFiles } from "../src/slack/sign.js";

const secret = "slack-gate-secret";
const SUMMARIZE = "Please summarize the important announcement I just posted in #new-channel, and resend/share the attached file demo-note.txt (or a working link to it).";

function withBot(event, botUserIds = ["UBOT"]) {
  return slackDelivery(event, { botUserIds });
}

test("a DM or a bot mention asks, and any other channel line is stored", () => {
  const statement = "The booth opens at nine.";
  const dm = slackDelivery({ type: "message", user: "U1", channel: "D1", channel_type: "im", text: statement });
  assert.equal(dm.ask, true);
  assert.equal(dm.room.id, "");
  assert.equal(dm.text, statement);

  assert.equal(slackDelivery({ type: "message", channel: "CMPIM", channel_type: "mpim", text: statement }).ask, true);
  assert.equal(slackDelivery({ type: "message", channel: "CMPIM", channel_type: "MPIM", text: statement }).room.id, "");
  assert.equal(slackDelivery({ type: "message", channel: "DNOCHAN", text: "hello" }).ask, true);
  assert.equal(slackDelivery({ type: "message", channel: "C1", channel_type: "IM", text: "hello" }).ask, true);

  const stored = withBot({ type: "message", user: "U1", channel: "C1", channel_type: "channel", text: "what was decided" });
  assert.equal(stored.ask, false);
  assert.equal(stored.room.id, "C1");
  assert.equal(withBot({ type: "message", channel: "C1", text: SUMMARIZE }).ask, false);
  assert.equal(withBot({ type: "message", channel: "C1", text: "when does the booth open?" }).ask, false);
  assert.equal(withBot({ type: "message", channel: "GPRIV", channel_type: "group", text: "what was decided" }).ask, false);

  const other = withBot({ type: "message", channel: "C1", text: "ask <@UOTHER> what was decided" });
  assert.equal(other.ask, false);
  assert.equal(other.text, "ask <@UOTHER> what was decided");
  assert.equal(other.room.id, "C1");

  const mention = withBot({ type: "message", channel: "C1", text: "<@UBOT> what was decided" });
  assert.equal(mention.ask, true);
  assert.equal(mention.room.id, "");
  assert.equal(mention.text, "what was decided");

  const labeled = withBot({ type: "message", channel: "C1", text: "<@UBOT|Adam> summarize the announcement" });
  assert.equal(labeled.ask, true);
  assert.equal(labeled.text, "summarize the announcement");

  const middle = withBot({ type: "message", channel: "C1", text: "please <@UBOT> summarize the file" });
  assert.equal(middle.ask, true);
  assert.equal(middle.text, "please summarize the file");

  assert.equal(slackDelivery({ type: "message", channel: "C1", text: "<@UBOT> what was decided" }).ask, false);
  const appMention = slackDelivery({ type: "app_mention", channel: "C1", text: "<@UBOT> what was decided" });
  assert.equal(appMention.ask, true);
  assert.equal(appMention.text, "what was decided");

  const fileDm = slackDelivery({
    type: "message",
    subtype: "file_share",
    channel: "D1",
    channel_type: "im",
    text: "The floor plan is floor-plan.pdf",
    files: [{ name: "floor-plan.pdf", url_private: "https://files.slack.com/x" }],
  });
  assert.equal(fileDm.ask, true);
  const fileChannel = withBot({
    type: "message",
    subtype: "file_share",
    channel: "C1",
    text: "The floor plan is floor-plan.pdf",
    files: [{ name: "floor-plan.pdf" }],
  });
  assert.equal(fileChannel.ask, false);
  assert.equal(fileChannel.file.name, "floor-plan.pdf");

  const huddle = withBot({ type: "huddle", channel: "C1", text: "<@UBOT> what was decided" });
  assert.equal(huddle.ask, false);
  assert.equal(huddle.room.kind, "huddle");

  const deleted = withBot({
    type: "message",
    subtype: "message_deleted",
    channel: "D1",
    channel_type: "im",
    deleted_ts: "1.000",
    previous_message: { user: "U1", text: "<@UBOT> The booth opens at nine." },
  });
  assert.equal(deleted.ask, false);
  assert.equal(deleted.intent, "delete");
  assert.equal(deleted.forgetIds[0], "1.000");
});

test("bot user ids come from the env and from bot authorizations", () => {
  assert.deepEqual(
    slackBotUserIds({
      authorizations: [
        { user_id: "UBOT", is_bot: true },
        { user_id: "UHUMAN", is_bot: false },
      ],
    }, {}),
    ["UBOT"],
  );
  assert.deepEqual(slackBotUserIds({}, { SLACK_BOT_USER_ID: "UBOT" }), ["UBOT"]);
  assert.deepEqual(
    slackBotUserIds({ authorizations: [{ user_id: "UAUTH", is_bot: true }] }, { SLACK_BOT_USER_ID: "UBOT" }),
    ["UBOT", "UAUTH"],
  );
  assert.deepEqual(
    slackBotUserIds({ authorizations: [{ user_id: "ubot" }, { user_id: " UBOT ", is_bot: true }] }, { SLACK_BOT_USER_ID: "UBOT" }),
    ["UBOT"],
  );
});

function signed(event, extra = {}) {
  const payload = JSON.stringify({ ...extra, event });
  const timestamp = "1700000000";
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return {
    payload,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
  };
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}

function post(port, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: "/api/slack",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, raw, body: raw.startsWith("{") ? JSON.parse(raw) : raw });
      });
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
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the slack route answers a DM or a mention and stores an untagged channel line", async () => {
  const posts = [];
  const channels = [];
  const memory = mockAccount({ accountId: "company-slack-gate", delegates: ["delegate-slack-gate"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: {
        async postMessage(message) { posts.push(message); },
        async members(channel) { channels.push(channel); return ["U1"]; },
      },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  const port = await listen(app);
  const send = (event, extra) => {
    const message = signed({ type: "message", user: "U1", ...event }, extra);
    return post(port, message.payload, message.headers);
  };
  const decisions = async () => (await get(port, "/api/console?member=U1")).decisions;
  try {
    const stored = await send({ channel: "C1", text: "The booth opens at nine.", client_msg_id: "store-1" });
    assert.equal(stored.body.decisions, 1);
    assert.equal(stored.body.posted, false);
    assert.equal(posts.length, 0);
    assert.equal((await decisions()).some((item) => item.text === "The booth opens at nine."), true);

    const untagged = await send({ channel: "C1", text: "what was decided", client_msg_id: "ask-untagged" });
    // An untagged channel line is kept, whatever its words say. Only a DM or @mention asks.
    assert.equal(untagged.body.posted, false);
    assert.equal(posts.length, 0);
    assert.equal(untagged.body.decisions, 2);

    const summarize = await send({ channel: "C1", text: SUMMARIZE, client_msg_id: "ask-sum" });
    assert.equal(summarize.body.posted, false);
    assert.equal(posts.length, 0);
    assert.equal(summarize.body.decisions, 3);

    const noId = await send({ channel: "C1", text: "<@UBOT> what was decided", client_msg_id: "ask-noid" });
    assert.equal(noId.body.posted, false);
    assert.equal(posts.length, 0);

    const other = await send(
      { channel: "C1", text: "<@UOTHER> what was decided", client_msg_id: "ask-other" },
      { authorizations: [{ user_id: "UBOT", is_bot: true }] },
    );
    assert.equal(other.body.posted, false);
    assert.equal(posts.length, 0);
    assert.equal((await decisions()).length, 3);

    const mentioned = await send(
      { channel: "C1", text: "<@UBOT> what was decided", client_msg_id: "ask-auth" },
      { authorizations: [{ user_id: "UBOT", is_bot: true }, { user_id: "UHUMAN", is_bot: false }] },
    );
    assert.equal(mentioned.body.posted, true);
    assert.match(mentioned.body.body, /The booth opens at nine/);
    assert.equal(posts.at(-1).channel, "C1");
    assert.match(posts.at(-1).text, /The booth opens at nine/);
    assert.equal(posts.length, 1);
    assert.equal(mentioned.body.decisions, 3);

    const appMention = await send({
      type: "app_mention",
      channel: "C1",
      text: "<@UBOT> The floor is open.",
      client_msg_id: "app-1",
    });
    assert.equal(appMention.body.posted, true);
    assert.equal(posts.length, 2);
    assert.equal(appMention.body.decisions, 3);
    assert.equal((await decisions()).some((item) => /floor is open/i.test(item.text)), false);

    const dm = await send({ channel: "D1", channel_type: "im", text: "The booth opens at nine.", client_msg_id: "dm-1" });
    assert.equal(dm.body.posted, true);
    assert.equal(posts.at(-1).channel, "D1");
    assert.equal(dm.body.decisions, 3);
    assert.equal((await decisions()).filter((item) => item.text === "The booth opens at nine.").length, 1);

    const mpim = await send({ channel: "CMPIM", channel_type: "mpim", text: "ping", client_msg_id: "mpim-1" });
    assert.equal(mpim.body.posted, true);
    assert.equal(posts.at(-1).channel, "CMPIM");

    const dPrefix = await send({ channel: "DPREFIX", text: "hello there", client_msg_id: "d-prefix" });
    assert.equal(dPrefix.body.posted, true);
    assert.equal(posts.at(-1).channel, "DPREFIX");
    assert.equal((await decisions()).length, 3);
    for (const channel of ["D1", "CMPIM", "DPREFIX"]) {
      assert.equal(channels.includes(channel), false, channel);
    }
  } finally {
    await close(app);
  }
});

test("a file_share with several attachments delivers every file", () => {
  const delivery = slackDelivery({
    type: "message",
    subtype: "file_share",
    user: "U1",
    channel: "C1",
    text: "Please keep the announcement and both attachments.",
    files: [
      { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/a" },
      { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/b" },
      { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/c" },
    ],
  });
  assert.equal(delivery.file.name, "northline-ops-announcement.txt");
  assert.deepEqual(delivery.files.map((file) => file.name), [
    "northline-ops-announcement.txt",
    "northline-d7-floor-brief.txt",
    "northline-launch-gate.txt",
  ]);
});

test("message_changed with the original ts still has a distinct delivery id", () => {
  const ts = "1793954184.202039";
  const files = [
    { id: "F1", name: "northline-ops-announcement.txt" },
    { id: "F2", name: "northline-d7-floor-brief.txt" },
    { id: "F3", name: "northline-launch-gate.txt" },
  ];
  const first = slackDelivery({
    type: "message",
    user: "U1",
    channel: "C1",
    ts,
    text: "Northline ops note (pack-77e165a) — please keep the files.",
  });
  const changed = slackDelivery({
    type: "message",
    subtype: "message_changed",
    channel: "C1",
    ts,
    message: { user: "U1", text: first.text, ts, files },
    previous_message: { user: "U1", text: first.text, ts },
  });
  assert.equal(first.deliveryId, ts);
  assert.notEqual(changed.deliveryId, first.deliveryId);
  assert.match(changed.deliveryId, /^changed:/);
  assert.equal(slackEventHasFiles({ subtype: "message_changed", message: { files } }), true);
  assert.equal(slackEventHasFiles({ subtype: "message_changed", files }), true);
  assert.deepEqual(changed.files.map((file) => file.name), [
    "northline-ops-announcement.txt",
    "northline-d7-floor-brief.txt",
    "northline-launch-gate.txt",
  ]);
});
