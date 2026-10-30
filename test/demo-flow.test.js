import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ledgerMemory } from "../src/memory/ledger.js";
import { createApp, defaultDeps } from "../src/server.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const secret = "slack-demo-secret";
const webhook = `whsec_${Buffer.from("recall-demo-secret").toString("base64")}`;

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function close(app) {
  return new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, raw, body: raw.startsWith("{") ? JSON.parse(raw) : raw });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function post(port, path, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
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
    req.end(payload);
  });
}

function signed(event, slackSecret) {
  const payload = JSON.stringify({ event });
  const timestamp = "1700000000";
  const signature = `v0=${createHmac("sha256", slackSecret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return {
    payload,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
  };
}

function signRecall(id, timestamp, payload) {
  const key = Buffer.from(webhook.slice("whsec_".length), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

function transcript(text, id) {
  return JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "bot-demo" },
      transcript: { id },
      data: {
        words: text.split(" ").map((word) => ({ text: word })),
        participant: { id: "mina", name: "Mina" },
      },
    },
  });
}

function recallPost(port, payload, id) {
  const timestamp = "1731705121";
  return post(port, "/api/recall", payload, {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signRecall(id, timestamp, payload)}`,
  });
}

function frame(message) {
  const json = JSON.stringify(message);
  return Buffer.concat([
    Buffer.from(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`),
    Buffer.from(json),
  ]);
}

function stdioRecall(accountId, delegateKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/mcp-stdio.js"], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        SEDERUNT_ACCOUNT: accountId,
        SEDERUNT_DELEGATE: delegateKey,
      },
    });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("stdio mcp timed out"));
    }, 8000);
    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "recall", arguments: { text: "what was decided", memberId: "mina" } },
    }));
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "act", arguments: { text: "what was decided", memberId: "mina" } },
    }));
    child.stdin.end();
    child.on("close", () => {
      clearTimeout(timer);
      const buffer = Buffer.concat(stdout);
      const messages = [];
      let offset = 0;
      while (offset < buffer.length) {
        const headerEnd = buffer.indexOf("\r\n\r\n", offset);
        if (headerEnd < 0) break;
        const header = buffer.subarray(offset, headerEnd).toString("utf8");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) break;
        const length = Number(match[1]);
        const start = headerEnd + 4;
        if (buffer.length < start + length) break;
        messages.push(JSON.parse(buffer.subarray(start, start + length).toString("utf8")));
        offset = start + length;
      }
      resolve(messages);
    });
  });
}

test("the demo keeps one meeting sentence, files it once, answers on three doors, returns a related file, and forgets a deleted message", async () => {
  const suffix = randomBytes(8).toString("hex");
  const accountId = `company-demo-flow-${suffix}`;
  const delegateKey = `delegate-demo-flow-${suffix}`;
  const linear = {
    calls: [],
    async readOpenTripTickets() { return { trip: [], open: [] }; },
    async createIssue() {
      this.calls.push("create");
      return { identifier: "ROW-90", id: "ROW-90" };
    },
  };
  const meeting = { calls: [], async join() { this.calls.push("join"); } };
  const uploads = [];
  const posts = [];
  const env = {
    SLACK_SIGNING_SECRET: secret,
    RECALL_WEBHOOK_SECRET: webhook,
    COMPANY_MEMWAL_KEY: "key-sentinel-value",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
  };
  const app = createApp({
    env,
    companyLoaded: true,
    deps: {
      ...defaultDeps({
        env,
        memory: ledgerMemory({ accountId, delegateKey }),
        linear,
        meeting,
        tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
        console: {
          async upload(input) {
            uploads.push({ name: input.name, bytes: String(input.bytes ?? "") });
            return { id: "console-file-1", folderId: "folder-1" };
          },
        },
      }),
      slack: { async postMessage(message) { posts.push(message); } },
    },
  });
  const port = await listen(app);
  try {
    const joined = await post(port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.deepEqual(joined.body, { join: "not-configured" });
    assert.equal(joined.raw.includes("bot-"), false);
    assert.deepEqual(meeting.calls, []);

    const quiet = transcript("The weather is fine today.", "quiet-1");
    assert.equal((await recallPost(port, quiet, "msg-quiet")).status, 204);
    const before = await get(port, "/api/console?member=mina");
    assert.equal(before.body.decisions.some((item) => /weather/.test(item.text)), false);

    const spoken = transcript("Hey Sederunt the booth opens at nine.", "spoken-1");
    assert.equal((await recallPost(port, spoken, "msg-spoken")).status, 204);
    const kept = await get(port, "/api/console?member=mina");
    const sentence = kept.body.decisions.find((item) => /booth opens at nine/.test(item.text));
    assert.ok(sentence);
    assert.equal(sentence.connectorId, "");
    assert.equal(kept.body.waiting.length, 1);
    assert.match(kept.body.waiting[0].statement, /booth opens at nine/);
    const confirmId = kept.body.waiting[0].id;
    assert.ok(confirmId);
    assert.deepEqual(linear.calls, []);
    const consoleConfirm = { text: `confirm ${confirmId}`, memberId: "mina" };
    assert.deepEqual(Object.keys(consoleConfirm).sort(), ["memberId", "text"]);
    const refused = await post(port, "/api/typed", { text: `confirm ${confirmId}`, memberId: "outsider" });
    assert.equal(refused.body.allow, "not-invited");
    assert.deepEqual(linear.calls, []);
    const filed = await post(port, "/api/typed", consoleConfirm);
    assert.equal(filed.body.allow, "confirmed");
    assert.equal(filed.body.status, "filed");
    assert.match(filed.body.body, /ROW-90/);
    assert.deepEqual(linear.calls, ["create"]);
    const again = await post(port, "/api/typed", { text: `confirm ${confirmId}`, memberId: "mina" });
    assert.deepEqual(linear.calls, ["create"]);
    assert.doesNotMatch(again.body.body, /filed/);
    const board = await get(port, "/api/console?member=mina");
    const filedRow = board.body.decisions.find((item) => /booth opens at nine/.test(item.text));
    assert.equal(filedRow.connectorId, "ROW-90");

    const channel = signed({
      type: "message",
      user: "mina",
      channel: "CDEMO",
      text: "The floor plan is floor-plan.pdf",
      client_msg_id: "file-1",
      members: ["mina"],
      files: [{ name: "floor-plan.pdf", bytes: "PDFBYTES" }],
    }, secret);
    const stored = await post(port, "/api/slack", channel.payload, channel.headers);
    assert.equal(stored.body.decisions >= 2, true);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].name, "floor-plan.pdf");
    assert.equal(uploads[0].bytes, "PDFBYTES");

    const ask = signed({
      type: "message",
      user: "mina",
      channel: "CDEMO",
      text: "what was decided",
      client_msg_id: "ask-1",
      members: ["mina"],
    }, secret);
    const slack = await post(port, "/api/slack", ask.payload, ask.headers);
    assert.match(slack.body.body, /booth opens at nine/);
    assert.match(slack.body.body, /ROW-90/);
    assert.equal(posts.at(-1).channel, "CDEMO");
    assert.match(posts.at(-1).text, /ROW-90/);
    assert.equal(posts.at(-1).file || "", "");

    const beforeChat = (await get(port, "/api/console?member=mina")).body.decisions.length;
    const chat = await post(port, "/api/chat", { text: "what was decided", memberId: "mina" });
    assert.match(chat.body.body, /booth opens at nine/);
    assert.match(chat.body.body, /ROW-90/);
    assert.equal(chat.body.stored, false);
    assert.equal(chat.body.decisions, beforeChat);

    const httpRecall = await post(port, "/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "recall", arguments: { text: "what was decided", memberId: "mina" } },
    });
    assert.match(httpRecall.body.result.content[0].text, /booth opens at nine/);
    assert.match(httpRecall.body.result.content[0].text, /ROW-90/);
    const httpAct = await post(port, "/mcp", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "act", arguments: { text: "what was decided", memberId: "mina" } },
    });
    assert.match(httpAct.body.result.content[0].text, /booth opens at nine/);
    assert.match(httpAct.body.result.content[0].text, /ROW-90/);

    const messages = await stdioRecall(accountId, delegateKey);
    const heard = JSON.parse(messages.find((message) => message.id === 2).result.content[0].text);
    const acted = JSON.parse(messages.find((message) => message.id === 3).result.content[0].text);
    assert.match(heard.body, /booth opens at nine/);
    assert.match(heard.body, /ROW-90/);
    assert.match(acted.body, /booth opens at nine/);
    assert.match(acted.body, /ROW-90/);

    const postsBeforeOutsider = posts.length;
    const outsider = signed({
      type: "message",
      user: "outsider",
      channel: "CDEMO",
      text: "what was decided",
      client_msg_id: "ask-out",
      members: ["mina"],
    }, secret);
    const hidden = await post(port, "/api/slack", outsider.payload, outsider.headers);
    assert.equal(hidden.body.body.includes("booth opens at nine"), false);
    assert.equal(hidden.body.body.includes("floor-plan.pdf"), false);
    assert.equal(posts.length, postsBeforeOutsider);

    const related = signed({
      type: "message",
      user: "mina",
      channel: "DMINA",
      channel_type: "im",
      text: "what about the floor plan",
      client_msg_id: "dm-1",
      members: ["mina"],
    }, secret);
    const dm = await post(port, "/api/slack", related.payload, related.headers);
    assert.equal(posts.at(-1).channel, "DMINA");
    assert.match(posts.at(-1).text, /floor plan/);
    assert.match(posts.at(-1).text, /floor-plan\.pdf/);
    assert.equal(posts.at(-1).file, "floor-plan.pdf");
    assert.match(dm.body.body, /floor plan/);

    const other = signed({
      type: "message",
      user: "mina",
      channel: "DMINA",
      channel_type: "im",
      text: "what is the weather tomorrow",
      client_msg_id: "dm-2",
      members: ["mina"],
    }, secret);
    await post(port, "/api/slack", other.payload, other.headers);
    assert.equal(posts.at(-1).file || "", "");
    assert.equal(/floor-plan\.pdf/.test(posts.at(-1).text), false);

    const removed = signed({
      type: "message",
      subtype: "message_deleted",
      user: "mina",
      channel: "CDEMO",
      deleted_ts: "1700000001.000",
      previous_message: {
        user: "mina",
        text: "The floor plan is floor-plan.pdf",
        client_msg_id: "file-1",
      },
      members: ["mina"],
    }, secret);
    await post(port, "/api/slack", removed.payload, removed.headers);
    const after = await get(port, "/api/console?member=mina");
    assert.equal(after.body.decisions.some((item) => /floor plan/.test(item.text)), false);
    assert.equal(after.body.decisions.some((item) => /booth opens at nine/.test(item.text) && item.connectorId === "ROW-90"), true);

    const channelAgain = signed({
      type: "message",
      user: "mina",
      channel: "CDEMO",
      text: "what about the floor plan",
      client_msg_id: "ask-gone",
      members: ["mina"],
    }, secret);
    await post(port, "/api/slack", channelAgain.payload, channelAgain.headers);
    assert.equal(/floor plan/.test(posts.at(-1).text), false);
    assert.equal(posts.at(-1).file || "", "");

    const dmAgain = signed({
      type: "message",
      user: "mina",
      channel: "DMINA",
      channel_type: "im",
      text: "what about the floor plan",
      client_msg_id: "dm-gone",
      members: ["mina"],
    }, secret);
    await post(port, "/api/slack", dmAgain.payload, dmAgain.headers);
    assert.equal(/floor-plan\.pdf/.test(posts.at(-1).text), false);
    assert.equal(posts.at(-1).file || "", "");
    const still = await get(port, "/api/console?member=mina");
    assert.equal(still.body.decisions.some((item) => /booth opens at nine/.test(item.text) && item.connectorId === "ROW-90"), true);
  } finally {
    await close(app);
  }
});
