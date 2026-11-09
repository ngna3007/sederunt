import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
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
  const timestamp = String(Math.floor(Date.now() / 1000));
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

function stdioCalls(accountId, delegateKey, calls) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/mcp-stdio.js"], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        SEDERUNT_ACCOUNT: accountId,
        SEDERUNT_DELEGATE: delegateKey,
        SEDERUNT_MEMBER: "mina",
      },
    });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("stdio mcp timed out"));
    }, 8000);
    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    calls.forEach((call, index) => {
      child.stdin.write(frame({
        jsonrpc: "2.0",
        id: index + 2,
        method: "tools/call",
        params: { name: call.name, arguments: call.arguments },
      }));
    });
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

function stdioBody(messages, id) {
  return JSON.parse(messages.find((message) => message.id === id).result.content[0].text).body;
}

function mcpText(response) {
  return response.body.result.content[0].text;
}

const BOOTH = /the booth opens at nine\./i;
const ASSIGNED = /ROW-91 was assigned to mina/;

function threeFacts(text, where) {
  assert.match(text, BOOTH, `${where}: booth sentence`);
  assert.match(text, ASSIGNED, `${where}: ROW-91 assignment`);
}

test("the demo runs eleven ordered steps through the real handler with every outside service injected", async () => {
  const suffix = randomBytes(8).toString("hex");
  const accountId = `company-demo-flow-${suffix}`;
  const delegateKey = `delegate-demo-flow-${suffix}`;
  const ledgerDir = fileURLToPath(new URL(`../.local/ledgers/${createHash("sha256").update(accountId).digest("hex")}`, import.meta.url));
  const issued = ["ROW-91", "ROW-90"];
  const linear = {
    calls: [],
    async readOpenTripTickets() { return { trip: [], open: [] }; },
    async createIssue(input) {
      const id = issued.shift();
      this.calls.push(`create ${JSON.stringify(input.title)} -> ${id}`);
      return { identifier: id, id };
    },
    async assignIssue(input) {
      this.calls.push(`assign ${input.id} -> ${input.assignee}`);
      return { identifier: input.id, id: input.id };
    },
  };
  const meeting = { calls: [], async join() { this.calls.push("join"); return { botId: "bot-live" }; } };
  const uploads = [];
  const downloads = [];
  const posts = [];
  const memberLists = [];
  const fileFetches = [];
  const env = {
    SLACK_SIGNING_SECRET: secret,
    SLACK_BOT_USER_ID: "UBOT",
    RECALL_WEBHOOK_SECRET: webhook,
    COMPANY_MEMWAL_KEY: "key-sentinel-value",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
    SEDERUNT_MEMBER: "mina",
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
            const bytes = String(input.bytes ?? "");
            uploads.push({ name: input.name, bytes });
            return { id: "console-file-1", folderId: "folder-1" };
          },
          async download(input) {
            downloads.push(input?.id);
            const found = input?.id === "console-file-1" ? uploads.find((item) => item.name) : null;
            return found ? found.bytes : null;
          },
        },
      }),
      slack: {
        async postMessage(message) { posts.push(message); },
        async members(channel) { memberLists.push(channel); return ["mina"]; },
        async downloadFile(file) {
          fileFetches.push(file.url_private_download || file.url || "");
          return { name: file.name, bytes: "PDFBYTES" };
        },
      },
    },
  });
  const port = await listen(app);
  const consoleBoard = async () => (await get(port, "/api/console?member=mina")).body;
  const slackAs = (event) => {
    const message = signed({ type: "message", ...event }, secret);
    return post(port, "/api/slack", message.payload, message.headers);
  };
  try {
    // Step 1. Setup ticket through MCP act, confirmed from the console.
    const setup = await post(port, "/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "act",
        arguments: {
          text: "create a test ticket titled \"Booth test ticket\"",
          memberId: "mina",
          room: { id: "desk-mina", botPresent: true, memberIds: ["mina"] },
          deliveryId: "mcp-setup-1",
        },
      },
    });
    const setupBody = JSON.parse(mcpText(setup));
    assert.equal(setupBody.preference, "do");
    assert.equal(setupBody.issueId, "ROW-91");
    assert.deepEqual(linear.calls, ["create \"Booth test ticket\" -> ROW-91"]);
    assert.equal(linear.calls.length, 1);
    const afterSetup = await consoleBoard();
    assert.equal(afterSetup.tickets.some((row) => row.connectorId === "ROW-91" && row.edit === "create"), true);

    // Step 2. Join without a public origin.
    const joined = await post(port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.deepEqual(joined.body, { join: "not-configured" });
    assert.equal(/bot-/.test(joined.raw), false);
    assert.deepEqual(meeting.calls, []);

    // Step 3. A quiet line is not kept.
    assert.equal((await recallPost(port, transcript("The weather is fine today.", "quiet-1"), "msg-quiet")).status, 204);
    assert.equal((await consoleBoard()).decisions.some((item) => /weather/i.test(item.text)), false);

    // Step 4. An addressed decision is kept with no ticket yet.
    assert.equal((await recallPost(port, transcript("Hey Maple the booth opens at nine.", "spoken-1"), "msg-spoken")).status, 204);
    const kept = await consoleBoard();
    const booth = kept.decisions.find((item) => BOOTH.test(item.text));
    assert.ok(booth);
    assert.equal(booth.connectorId, "");
    assert.equal(linear.calls.length, 1);

    // Step 5. Assign ROW-91 to mina. The change runs without a confirm.
    assert.equal((await recallPost(port, transcript("Hey Maple assign ROW-91 to mina.", "assign-1"), "msg-assign")).status, 204);
    const pending = await consoleBoard();
    assert.equal(pending.waiting.length, 0);
    assert.equal(JSON.stringify(pending).includes("Who owns it?"), false);
    assert.deepEqual(linear.calls, ["create \"Booth test ticket\" -> ROW-91", "assign ROW-91 -> mina"]);
    assert.equal(linear.calls.length, 2);
    const afterAssign = await consoleBoard();
    const boothStill = afterAssign.decisions.find((item) => BOOTH.test(item.text));
    assert.equal(boothStill.connectorId, "");
    assert.equal(afterAssign.decisions.some((item) => ASSIGNED.test(item.text) && item.connectorId === "ROW-91"), true);
    assert.equal(afterAssign.tickets.some((row) => row.connectorId === "ROW-91" && row.edit === "assign"), true);

    // Step 6. The kept sentence is not a ticket waiting for confirm.
    assert.equal(afterAssign.waiting.some((row) => BOOTH.test(row.statement)), false);
    assert.equal(afterAssign.decisions.find((item) => BOOTH.test(item.text)).connectorId, "");

    // Step 7. Recall in every door.
    const slackAsk = await slackAs({ user: "mina", channel: "CDEMO", text: "<@UBOT> what was decided", client_msg_id: "ask-1" });
    assert.equal(posts.at(-1).channel, "CDEMO");
    threeFacts(posts.at(-1).text, "slack channel post");
    const decisionsBeforeChat = (await consoleBoard()).decisions.length;
    const chat = await post(port, "/api/chat", { text: "what was decided", memberId: "mina" });
    threeFacts(chat.body.body, "/api/chat");
    assert.equal(chat.body.stored, false);
    assert.equal((await consoleBoard()).decisions.length, decisionsBeforeChat);
    assert.equal(chat.body.body, slackAsk.body.body);
    const httpRecall = await post(port, "/mcp", {
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "recall", arguments: { text: "what was decided", memberId: "mina" } },
    });
    threeFacts(mcpText(httpRecall), "POST /mcp recall");
    const httpAct = await post(port, "/mcp", {
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "act", arguments: { text: "what was decided", memberId: "mina" } },
    });
    threeFacts(mcpText(httpAct), "POST /mcp act");
    const stdio = await stdioCalls(accountId, delegateKey, [
      { name: "recall", arguments: { text: "what was decided", memberId: "mina" } },
      { name: "act", arguments: { text: "what was decided", memberId: "mina" } },
    ]);
    threeFacts(stdioBody(stdio, 2), "stdio recall");
    threeFacts(stdioBody(stdio, 3), "stdio act");
    const postsBeforeOutsider = posts.length;
    const hidden = await slackAs({ user: "outsider", channel: "CDEMO", text: "what was decided", client_msg_id: "ask-out" });
    assert.equal(hidden.raw.includes("booth opens at nine"), false);
    assert.equal(hidden.raw.includes("floor-plan.pdf"), false);
    assert.equal(posts.length, postsBeforeOutsider);

    // Step 8. A channel file is fetched by url and stored in the Console.
    const stored = await slackAs({
      user: "mina",
      channel: "CDEMO",
      text: "The floor plan is floor-plan.pdf",
      client_msg_id: "file-1",
      members: ["outsider"],
      files: [{
        name: "floor-plan.pdf",
        bytes: "NOT-THE-FILE",
        url_private_download: "https://files.slack.com/files-pri/TDEMO/F1/download/floor-plan.pdf",
      }],
    });
    assert.equal(memberLists.includes("CDEMO"), true);
    assert.deepEqual(fileFetches, ["https://files.slack.com/files-pri/TDEMO/F1/download/floor-plan.pdf"]);
    assert.deepEqual(uploads, [{ name: "floor-plan.pdf", bytes: "PDFBYTES" }]);
    for (const secretish of ["PDFBYTES", "NOT-THE-FILE", "console-file-1"]) {
      assert.equal(stored.raw.includes(secretish), false, `slack response leaks ${secretish}`);
    }
    const boardWithFile = await consoleBoard();
    const fileRow = boardWithFile.decisions.find((item) => /floor plan/i.test(item.text));
    assert.deepEqual(fileRow.fileNames, [{ name: "floor-plan.pdf" }]);
    const boardRaw = JSON.stringify(boardWithFile);
    for (const secretish of ["PDFBYTES", "NOT-THE-FILE", "console-file-1"]) {
      assert.equal(boardRaw.includes(secretish), false, `console board leaks ${secretish}`);
    }
    const ledgerRaw = await readFile(`${ledgerDir}/record.json`, "utf8");
    const fileDocs = JSON.parse(ledgerRaw).documents.filter((doc) => doc.decision?.sourceDeliveryId === "file-1");
    assert.equal(fileDocs.length > 0, true);
    assert.equal(fileDocs.some((doc) => doc.decision.fileNames.some((file) => file.name === "floor-plan.pdf" && file.consoleFileId === "console-file-1")), true);
    assert.equal(ledgerRaw.includes("PDFBYTES"), false);
    assert.equal(ledgerRaw.includes("NOT-THE-FILE"), false);
    await slackAs({ user: "mina", channel: "CDEMO", text: "The badge list is badges.pdf", client_msg_id: "file-none" });
    const noBytes = (await consoleBoard()).decisions.find((item) => /badge list/i.test(item.text));
    assert.ok(noBytes);
    assert.deepEqual(noBytes.fileNames, []);
    assert.equal(uploads.length, 1);
    const outsiderAfterFile = posts.length;
    const hiddenFile = await slackAs({ user: "outsider", channel: "CDEMO", text: "what about the floor plan", client_msg_id: "ask-out-2" });
    assert.equal(hiddenFile.raw.includes("floor-plan.pdf"), false);
    assert.equal(hiddenFile.raw.includes("PDFBYTES"), false);
    assert.equal(posts.length, outsiderAfterFile);

    // Step 9. DM questions.
    const dm = await slackAs({ user: "mina", channel: "DMINA", channel_type: "im", text: "what about the floor plan", client_msg_id: "dm-1" });
    assert.equal(posts.at(-1).channel, "DMINA");
    assert.match(posts.at(-1).text, /floor plan/i);
    assert.match(posts.at(-1).text, /floor-plan\.pdf/);
    assert.equal(posts.at(-1).file?.name, "floor-plan.pdf");
    assert.equal(posts.at(-1).file?.bytes, "PDFBYTES");
    assert.equal(downloads.includes("console-file-1"), true);
    assert.equal(dm.raw.includes("PDFBYTES"), false);
    await slackAs({ user: "mina", channel: "DMINA", channel_type: "im", text: "what is the weather tomorrow", client_msg_id: "dm-2" });
    assert.equal(posts.at(-1).channel, "DMINA");
    assert.equal(posts.at(-1).file || "", "");
    assert.equal(/floor-plan\.pdf/.test(posts.at(-1).text), false);

    // Step 10. A deleted Slack message drops only its decision, also after a reload.
    await slackAs({
      subtype: "message_deleted",
      user: "mina",
      channel: "CDEMO",
      deleted_ts: "1700000001.000",
      previous_message: { user: "mina", text: "The floor plan is floor-plan.pdf", client_msg_id: "file-1" },
    });
    const after = await consoleBoard();
    assert.equal(after.decisions.some((item) => /floor plan/i.test(item.text)), false);
    assert.equal(after.decisions.some((item) => BOOTH.test(item.text)), true);
    assert.equal(after.decisions.some((item) => ASSIGNED.test(item.text)), true);
    await slackAs({ user: "mina", channel: "CDEMO", text: "<@UBOT> what was decided", client_msg_id: "ask-gone" });
    assert.equal(posts.at(-1).channel, "CDEMO");
    threeFacts(posts.at(-1).text, "slack channel after delete");
    assert.equal(/floor plan|floor-plan\.pdf/i.test(posts.at(-1).text), false);
    assert.equal(posts.at(-1).file || "", "");
    await slackAs({ user: "mina", channel: "DMINA", channel_type: "im", text: "what about the floor plan", client_msg_id: "dm-gone" });
    assert.equal(posts.at(-1).channel, "DMINA");
    assert.equal(/floor-plan\.pdf/.test(posts.at(-1).text), false);
    assert.equal(posts.at(-1).file || "", "");
    const reloaded = await stdioCalls(accountId, delegateKey, [
      { name: "recall", arguments: { text: "what was decided", memberId: "mina" } },
    ]);
    const reloadedBody = stdioBody(reloaded, 2);
    threeFacts(reloadedBody, "new process after delete");
    assert.equal(/floor plan|floor-plan\.pdf/i.test(reloadedBody), false);
    assert.match(reloadedBody, /the booth opens at nine/);

    // Step 11. No Slack huddle was added: every Slack event above is a plain message.
    assert.equal(posts.every((message) => !/huddle/i.test(JSON.stringify(message))), true);

    // The whole run, in order.
    assert.deepEqual(linear.calls, [
      "create \"Booth test ticket\" -> ROW-91",
      "assign ROW-91 -> mina",
    ]);
    assert.deepEqual(meeting.calls, []);
    console.log(`LINEAR_CALLS ${JSON.stringify(linear.calls)}`);
  } finally {
    await close(app);
    await rm(ledgerDir, { recursive: true, force: true });
  }
});
