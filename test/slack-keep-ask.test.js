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
