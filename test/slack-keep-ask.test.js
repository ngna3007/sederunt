import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { mockAccount } from "../src/memory/mock-account.js";
import { createSession } from "../src/session.js";
import { createApp } from "../src/server.js";

const secret = "slack-keep-ask-secret";
const ANNOUNCEMENT = "Live demo announcement demo-note.txt — please keep.";

function signed(event) {
  const payload = JSON.stringify({ event });
  const timestamp = "1700000000";
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return { payload, headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature } };
}

function post(port, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: "/api/slack",
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** Slack Web API stand-in: file download, text posts, and file uploads. */
function slackApi() {
  const texts = [];
  const uploads = [];
  const comments = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("/conversations.members")) {
      return { ok: true, status: 200, async json() { return { ok: true, members: ["U1"], response_metadata: { next_cursor: "" } }; } };
    }
    if (href.endsWith("/files.info") || href.includes("/files.info?")) {
      return { ok: true, status: 200, async json() { return { ok: true, file: { id: "F1", name: "demo-note.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/demo-note.txt" } }; } };
    }
    if (href.includes("/download/")) return { ok: true, status: 200, async text() { return "bring the demo note"; }, async arrayBuffer() { return new TextEncoder().encode("bring the demo note").buffer; } };
    if (href.endsWith("/chat.postMessage")) {
      texts.push(JSON.parse(init.body));
      return { ok: true, status: 200, async json() { return { ok: true }; } };
    }
    if (href.endsWith("/files.completeUploadExternal") && init.body) {
      try {
        const body = JSON.parse(init.body);
        if (typeof body.initial_comment === "string") comments.push(body.initial_comment);
      } catch { /* ignore */ }
    }
    uploads.push(href);
    return { ok: true, status: 200, async json() { return { ok: true, upload_url: "https://files.slack.com/upload/v1/x", file_id: "FUP" }; }, async text() { return "OK"; } };
  };
  return { fetch, texts, uploads, comments };
}

test("a channel announcement that names its file is kept, Kept posts once, and a duplicate does not post Kept", async () => {
  const api = slackApi();
  const memory = mockAccount({ accountId: "company-keep-ask", delegates: ["delegate-keep-ask"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch: api.fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  const file = [{ id: "F1", name: "demo-note.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/demo-note.txt" }];
  try {
    const first = await send({ subtype: "file_share", channel: "C1", text: ANNOUNCEMENT, client_msg_id: "keep-1", files: file });
    assert.equal(first.status, 200, first.raw);
    assert.equal(first.body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), ["Kept demo-note.txt."]);

    // Same sentence again: nothing new is recorded, so no Kept.
    const again = await send({ subtype: "file_share", channel: "C1", text: ANNOUNCEMENT, client_msg_id: "keep-2", files: file });
    assert.equal(again.status, 200);
    assert.equal(again.body.decisions, 1);
    assert.equal(api.texts.filter((item) => /^Kept /.test(item.text)).length, 1);

    // A DM ask with the model down still finds the stored file by its name.
    const dm = await send({ channel: "D1", channel_type: "im", text: "resend demo-note.txt", client_msg_id: "dm-1" });
    assert.equal(dm.status, 200);
    assert.equal(dm.body.posted, true);
    assert.ok(api.uploads.length > 0, "the stored file is uploaded back to the DM");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});


test("Slack ask keeps the model reply (not result.learned) and pins a named file when attach is null", async () => {
  const api = slackApi();
  const openrouterCalls = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      openrouterCalls.push(JSON.parse(init.body || "{}"));
      // Model answers naturally but forgets attach — server must pin via replyFile.
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '{"text":"Here is demo-note.txt from the announcement.","attach":null}' } }],
          };
        },
      };
    }
    return api.fetch(url, init);
  };
  const session = createSession();
  // An action-item that overlaps the ask so shapeAnswer would set result.learned
  // to a raw sentence dump — the old bug overwrote Adam's reply with that dump.
  session.learned = [{
    kind: "action-item",
    text: "Resend the demo note to #new-channel after each huddle.",
    at: "2026-11-05T00:00:00.000Z",
    key: "learned:action-item:demo",
  }];
  const memory = mockAccount({ accountId: "company-keep-ask-pin", delegates: ["delegate-keep-ask-pin"] });
  const app = createApp({
    session,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
      console: {
        async download() { return null; },
        async upload() { return { id: "file-console", folderId: "folder-x" }; },
      },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  const file = [{ id: "F1", name: "demo-note.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/demo-note.txt" }];
  try {
    const kept = await send({ subtype: "file_share", channel: "C1", text: ANNOUNCEMENT, client_msg_id: "keep-pin-1", files: file });
    assert.equal(kept.status, 200, kept.raw);
    assert.equal(kept.body.decisions, 1);

    const dm = await send({ channel: "D1", channel_type: "im", text: "can you resend demo-note.txt", client_msg_id: "dm-pin-1" });
    assert.equal(dm.status, 200);
    assert.equal(dm.body.posted, true);
    assert.ok(openrouterCalls.length >= 1, "OpenRouter was asked");
    // File replies carry Adam's text as initial_comment, not chat.postMessage.
    assert.deepEqual(api.comments, ["Here is demo-note.txt from the announcement."]);
    // The learned dump includes the action-item line; that must not replace the reply.
    assert.equal(api.comments.some((text) => text.includes("Resend the demo note to #new-channel")), false);
    assert.ok(api.uploads.some((href) => href.includes("completeUploadExternal")),
      "named file is pinned and uploaded even when attach was null");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a DM answer posts only once when the Slack client and bot token are both set", async () => {
  const { createSlackClient } = await import("../src/slack/post.js");
  const api = slackApi();
  const openrouterCalls = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      openrouterCalls.push(href);
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ text: "One clear answer.", attach: null }) } }] };
        },
      };
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-once", delegates: ["delegate-once"] });
  const session = createSession();
  session.learned = [{
    kind: "decision",
    text: "Ship the demo",
    at: "2026-11-05T00:00:00.000Z",
    key: "learned:decision:demo",
  }];
  const client = createSlackClient({ SLACK_BOT_TOKEN: "xoxb-test" }, fetch);
  const app = createApp({
    session,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: client,
      fetch,
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const message = signed({ type: "message", user: "U1", channel: "D1", channel_type: "im", text: "what did we decide?", client_msg_id: "dm-once-1" });
    const reply = await post(port, message.payload, message.headers);
    const body = JSON.parse(reply.raw);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(body.posted, true);
    assert.equal(api.texts.length, 1, `expected one chat.postMessage, got ${api.texts.length}`);
    assert.equal(api.texts[0].text, "One clear answer.");
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a channel file is kept when conversations.members returns empty", async () => {
  const api = slackApi();
  const fetch = async (url, init = {}) => {
    if (String(url).includes("/conversations.members")) {
      return { ok: true, status: 200, async json() { return { ok: false, error: "ratelimited" }; } };
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-empty-members", delegates: ["delegate-keep-empty"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return []; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const message = signed({
      type: "message",
      subtype: "file_share",
      user: "U1",
      channel: "C1",
      text: ANNOUNCEMENT,
      client_msg_id: "keep-empty-members",
      ts: "1700000099.000100",
      files: [{ id: "F1", name: "demo-note.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/demo-note.txt" }],
    });
    const reply = await post(port, message.payload, message.headers);
    assert.equal(reply.status, 200, reply.raw);
    const body = JSON.parse(reply.raw);
    assert.equal(body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), ["Kept demo-note.txt."]);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("message_changed with files is kept", async () => {
  const api = slackApi();
  const memory = mockAccount({ accountId: "company-keep-changed", delegates: ["delegate-keep-changed"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch: api.fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const message = signed({
      type: "message",
      subtype: "message_changed",
      channel: "C1",
      message: {
        user: "U1",
        text: "Live demo announcement floor-plan.txt — please keep.",
        ts: "1700000100.000200",
        files: [{ id: "F1", name: "demo-note.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/demo-note.txt" }],
      },
      previous_message: { user: "U1", text: "Live demo announcement floor-plan.txt — please keep.", ts: "1700000100.000200" },
    });
    const reply = await post(port, message.payload, message.headers);
    assert.equal(reply.status, 200, reply.raw);
    const body = JSON.parse(reply.raw);
    assert.equal(body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), ["Kept demo-note.txt."]);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});


test("a channel post with several attachments keeps every file and a floor-brief ask resends it", async () => {
  const api = slackApi();
  const uploadNames = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/files.getUploadURLExternal") && init.body) {
      uploadNames.push(new URLSearchParams(String(init.body)).get("filename") || "");
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-multi", delegates: ["delegate-keep-multi"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
      console: { async upload() { await new Promise(() => {}); } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  const files = [
    { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
    { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
    { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
  ];
  try {
    const kept = await send({
      subtype: "file_share",
      channel: "C1",
      text: "Northline ops note — please keep the announcement and both attachments.",
      client_msg_id: "keep-multi-1",
      files,
    });
    assert.equal(kept.status, 200, kept.raw);
    assert.equal(kept.body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), [
      "Kept northline-ops-announcement.txt, northline-d7-floor-brief.txt, and northline-launch-gate.txt.",
    ]);

    const dm = await send({
      channel: "D1",
      channel_type: "im",
      text: "Send me the District 7 floor brief we kept.",
      client_msg_id: "dm-floor-1",
    });
    assert.equal(dm.status, 200, dm.raw);
    assert.equal(dm.body.posted, true);
    assert.ok(uploadNames.includes("northline-d7-floor-brief.txt"), `expected floor brief upload, got ${JSON.stringify(uploadNames)}`);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});


test("a multi-file keep still stores the files that downloaded when one download fails", async () => {
  const api = slackApi();
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("/download/northline-d7-floor-brief.txt")) {
      return { ok: false, status: 500, async text() { return ""; } };
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-partial", delegates: ["delegate-keep-partial"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const message = signed({
      type: "message",
      subtype: "file_share",
      user: "U1",
      channel: "C1",
      text: "Northline ops note — please keep the announcement and both attachments.",
      client_msg_id: "keep-partial-1",
      files: [
        { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
        { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
        { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
      ],
    });
    const reply = await post(port, message.payload, message.headers);
    const body = JSON.parse(reply.raw);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), [
      "Kept northline-ops-announcement.txt and northline-launch-gate.txt.",
    ]);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});



test("message_changed files on a same-text keep are merged and Kept lists them", async () => {
  const api = slackApi();
  const uploadNames = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/files.getUploadURLExternal") && init.body) {
      uploadNames.push(new URLSearchParams(String(init.body)).get("filename") || "");
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-merge", delegates: ["delegate-keep-merge"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  const text = "Northline ops note (pack-test) — please keep northline-ops-announcement.txt, northline-d7-floor-brief.txt, and northline-launch-gate.txt.";
  const ts = "1793954184.202039";
  const files = [
    { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
    { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
    { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
  ];
  try {
    const first = await send({
      channel: "C1",
      text,
      client_msg_id: "keep-merge-text",
      ts,
    });
    assert.equal(first.status, 200, first.raw);
    assert.equal(first.body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), ["Kept."]);

    const changed = await send({
      subtype: "message_changed",
      channel: "C1",
      ts,
      message: {
        user: "U1",
        text,
        ts,
        files,
      },
      previous_message: { user: "U1", text, ts },
    });
    assert.equal(changed.status, 200, changed.raw);
    assert.equal(changed.body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), [
      "Kept.",
      "Kept northline-ops-announcement.txt, northline-d7-floor-brief.txt, and northline-launch-gate.txt.",
    ]);

    const again = await send({
      subtype: "file_share",
      channel: "C1",
      text,
      client_msg_id: "keep-merge-again",
      ts: "1793953600.000000",
      files,
    });
    assert.equal(again.status, 200, again.raw);
    assert.equal(again.body.decisions, 1);
    assert.equal(api.texts.filter((item) => /^Kept /.test(item.text)).length, 1);

    const dm = await send({
      channel: "D1",
      channel_type: "im",
      text: "Send me the District 7 floor brief we kept.",
      client_msg_id: "dm-merge-floor",
    });
    assert.equal(dm.status, 200, dm.raw);
    assert.equal(dm.body.posted, true);
    assert.ok(uploadNames.includes("northline-d7-floor-brief.txt"), `expected floor brief upload, got ${JSON.stringify(uploadNames)}`);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("two deliveries of the same DM post only one Slack answer", async () => {
  const { createSlackClient } = await import("../src/slack/post.js");
  const { claimSlackAsk } = await import("../src/slack/reply.js");
  const api = slackApi();
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ text: "Nothing is stored that you can read about that.", attach: null }) } }] };
        },
      };
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-dup-ask", delegates: ["delegate-dup-ask"] });
  const makeApp = () => createApp({
    session: createSession(),
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: createSlackClient({ SLACK_BOT_TOKEN: "xoxb-test" }, fetch),
      fetch,
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  const first = makeApp();
  first.listen(0, "127.0.0.1");
  await once(first, "listening");
  const port = first.address().port;
  try {
    const message = signed({ type: "message", user: "U1", channel: "D1", channel_type: "im", text: "launch code?", client_msg_id: "dm-dup-1", ts: "1700000000.000100" });
    const a = await post(port, message.payload, message.headers);
    assert.equal(a.status, 200, a.raw);
    // Same delivery id again (Slack retry / second isolate uses same claim key via memory Set in this process).
    const b = await post(port, message.payload, message.headers);
    assert.equal(b.status, 200, b.raw);
    assert.equal(api.texts.length, 1, `expected one chat.postMessage, got ${api.texts.length}: ${JSON.stringify(api.texts)}`);
    assert.equal(await claimSlackAsk({}, "1700000000.000100"), false);
  } finally {
    await new Promise((resolve, reject) => first.close((error) => (error ? reject(error) : resolve())));
  }
});


test("an explicit keep still acks when every file download fails", async () => {
  const api = slackApi();
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("/download/")) {
      return { ok: false, status: 403, async text() { return ""; } };
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-empty", delegates: ["delegate-keep-empty"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const message = signed({
      type: "message",
      subtype: "file_share",
      user: "U1",
      channel: "C1",
      text: "Northline ops note (pack-empty) — please keep northline-ops-announcement.txt, northline-d7-floor-brief.txt, and northline-launch-gate.txt.",
      client_msg_id: "keep-empty-1",
      files: [
        { name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
        { name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
        { name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
      ],
    });
    const reply = await post(port, message.payload, message.headers);
    const body = JSON.parse(reply.raw);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(body.decisions, 1);
    assert.deepEqual(api.texts.map((item) => item.text), ["Kept. The files did not arrive."]);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a floor-brief ask attaches northline-d7-floor-brief even if the model picks floor-plan", async () => {
  const api = slackApi();
  const uploadNames = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '{"text":"Here is the floor brief.","attach":"floor-plan.txt"}' } }],
          };
        },
      };
    }
    if (href.endsWith("/files.getUploadURLExternal") && init.body) {
      uploadNames.push(new URLSearchParams(String(init.body)).get("filename") || "");
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-prefer", delegates: ["delegate-keep-prefer"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  try {
    const junk = await send({
      subtype: "file_share",
      channel: "C1",
      text: "The floor plan is floor-plan.txt — please keep.",
      client_msg_id: "keep-junk-plan",
      files: [{ id: "F0", name: "floor-plan.txt", url_private_download: "https://files.slack.com/files-pri/T/F0/download/floor-plan.txt" }],
    });
    assert.equal(junk.status, 200, junk.raw);
    const kept = await send({
      subtype: "file_share",
      channel: "C1",
      text: "Northline ops note — please keep the announcement and both attachments.",
      client_msg_id: "keep-prefer-northline",
      files: [
        { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
        { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
        { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
      ],
    });
    assert.equal(kept.status, 200, kept.raw);
    const dm = await send({
      channel: "D1",
      channel_type: "im",
      text: "Send me the District 7 floor brief we kept.",
      client_msg_id: "dm-prefer-floor",
    });
    assert.equal(dm.status, 200, dm.raw);
    assert.equal(dm.body.posted, true);
    assert.ok(uploadNames.includes("northline-d7-floor-brief.txt"), `expected floor brief upload, got ${JSON.stringify(uploadNames)}`);
    assert.equal(uploadNames.includes("floor-plan.txt"), false, `old floor-plan.txt must not be attached, got ${JSON.stringify(uploadNames)}`);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a floor-brief DM attaches northline from recall when the session only kept floor-plan", async () => {
  const api = slackApi();
  const uploadNames = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '{"text":"Here is the District 7 floor brief.","attach":"floor-plan.txt"}' } }],
          };
        },
      };
    }
    if (href.endsWith("/files.getUploadURLExternal") && init.body) {
      uploadNames.push(new URLSearchParams(String(init.body)).get("filename") || "");
    }
    if (href.endsWith("/files.info") || href.includes("/files.info?")) {
      const id = new URLSearchParams(String(init.body || "")).get("file") || "";
      const files = {
        F0: { id: "F0", name: "floor-plan.txt" },
        F2: { id: "F2", name: "northline-d7-floor-brief.txt" },
      };
      const found = files[id] || files.F0;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            file: {
              ...found,
              url_private_download: `https://files.slack.com/files-pri/T/${found.id}/download/${found.name}`,
            },
          };
        },
      };
    }
    if (href.includes("/download/northline-d7-floor-brief.txt")) {
      return { ok: true, status: 200, async text() { return "D7 FLOOR"; } };
    }
    return api.fetch(url, init);
  };
  const base = mockAccount({ accountId: "company-keep-stale", delegates: ["delegate-keep-stale"] });
  const memory = {
    ...base,
    async recall(query) {
      if (/floor brief|northline-d7-floor-brief/i.test(String(query || ""))) {
        return [{
          decision: {
            id: "decision-nl",
            text: "Northline ops note — please keep the announcement and both attachments.",
            inviteMemberIds: ["U1"],
            fileNames: [{ name: "northline-d7-floor-brief.txt", slackFileId: "F2" }],
          },
          distance: 0.05,
        }];
      }
      return base.recall(query);
    },
  };
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  try {
    const junk = await send({
      subtype: "file_share",
      channel: "C1",
      text: "The floor plan is floor-plan.txt — please keep.",
      client_msg_id: "keep-stale-plan",
      files: [{ id: "F0", name: "floor-plan.txt", url_private_download: "https://files.slack.com/files-pri/T/F0/download/floor-plan.txt" }],
    });
    assert.equal(junk.status, 200, junk.raw);
    const dm = await send({
      channel: "D1",
      channel_type: "im",
      text: "Send me the District 7 floor brief we kept.",
      client_msg_id: "dm-stale-floor",
    });
    assert.equal(dm.status, 200, dm.raw);
    assert.equal(dm.body.posted, true);
    assert.ok(uploadNames.includes("northline-d7-floor-brief.txt"), `expected floor brief upload, got ${JSON.stringify(uploadNames)}`);
    assert.equal(uploadNames.includes("floor-plan.txt"), false, `old floor-plan.txt must not be attached, got ${JSON.stringify(uploadNames)}`);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});


test("a file-pin DM caption strips leaked JSON and replaces the empty fallback", async () => {
  const api = slackApi();
  const uploadNames = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      const body = JSON.parse(init.body || "{}");
      const asked = String(body.messages?.at(-1)?.content || "");
      const content = /northline-d7-floor-brief\s*$/.test(asked)
        ? '{"text":"Nothing is stored that you can read about that.","attach":null}'
        : "Here’s the District 7 floor brief you requested.,\"attach\":\"floor-plan.txt\"}";
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content } }] };
        },
      };
    }
    if (href.endsWith("/files.getUploadURLExternal") && init.body) {
      uploadNames.push(new URLSearchParams(String(init.body)).get("filename") || "");
    }
    return api.fetch(url, init);
  };
  const memory = mockAccount({ accountId: "company-keep-caption", delegates: ["delegate-keep-caption"] });
  const app = createApp({
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { fetch, async members() { return ["U1"]; } },
    },
    env: {
      COMPANY_MEMWAL_KEY: "key-sentinel-value",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
      SLACK_SIGNING_SECRET: secret,
      SLACK_BOT_TOKEN: "xoxb-test",
      SEDERUNT_MEMBER: "U1",
      OPENROUTER_API_KEY: "sk-or-test",
    },
    companyLoaded: true,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const send = async (event) => {
    const message = signed({ type: "message", user: "U1", ...event });
    const reply = await post(port, message.payload, message.headers);
    return { ...reply, body: JSON.parse(reply.raw) };
  };
  try {
    const junk = await send({
      subtype: "file_share",
      channel: "C1",
      text: "The floor plan is floor-plan.txt — please keep.",
      client_msg_id: "keep-caption-plan",
      files: [{ id: "F0", name: "floor-plan.txt", url_private_download: "https://files.slack.com/files-pri/T/F0/download/floor-plan.txt" }],
    });
    assert.equal(junk.status, 200, junk.raw);
    const kept = await send({
      subtype: "file_share",
      channel: "C1",
      text: "Northline ops note — please keep the announcement and both attachments.",
      client_msg_id: "keep-caption-northline",
      files: [
        { id: "F1", name: "northline-ops-announcement.txt", url_private_download: "https://files.slack.com/files-pri/T/F1/download/northline-ops-announcement.txt" },
        { id: "F2", name: "northline-d7-floor-brief.txt", url_private_download: "https://files.slack.com/files-pri/T/F2/download/northline-d7-floor-brief.txt" },
        { id: "F3", name: "northline-launch-gate.txt", url_private_download: "https://files.slack.com/files-pri/T/F3/download/northline-launch-gate.txt" },
      ],
    });
    assert.equal(kept.status, 200, kept.raw);

    const leaked = await send({
      channel: "D1",
      channel_type: "im",
      text: "Send me the District 7 floor brief we kept.",
      client_msg_id: "dm-caption-leak",
    });
    assert.equal(leaked.status, 200, leaked.raw);
    assert.equal(leaked.body.posted, true);
    assert.ok(uploadNames.includes("northline-d7-floor-brief.txt"), `expected floor brief upload, got ${JSON.stringify(uploadNames)}`);
    assert.equal(uploadNames.includes("floor-plan.txt"), false, `old floor-plan.txt must not be attached, got ${JSON.stringify(uploadNames)}`);
    assert.deepEqual(api.comments, ["Here’s the District 7 floor brief you requested."]);
    assert.equal(api.comments.some((text) => text.includes("attach") || text.includes("floor-plan.txt")), false);

    const fallback = await send({
      channel: "D1",
      channel_type: "im",
      text: "northline-d7-floor-brief",
      client_msg_id: "dm-caption-fallback",
    });
    assert.equal(fallback.status, 200, fallback.raw);
    assert.equal(fallback.body.posted, true);
    assert.equal(uploadNames.filter((name) => name === "northline-d7-floor-brief.txt").length >= 2, true,
      `expected a second floor brief upload, got ${JSON.stringify(uploadNames)}`);
    assert.equal(api.comments.at(-1), "Here's the District 7 floor brief.");
    assert.equal(api.comments.some((text) => /Nothing is stored/i.test(text)), false);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});
