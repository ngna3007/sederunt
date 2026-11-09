import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import { mockAccount } from "../src/memory/mock-account.js";
import { serveMcpStdio } from "../src/mcp-stdio.js";
import { handleMcpRequest } from "../src/mcp.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { resolvePreference } from "../src/domain/preference.js";
import { companyBoard, handleUtterance, readProofs, rebuildCompanyIndex } from "../src/typed-path.js";

const SENTINELS = [
  "key-sentinel-value",
  "account-id-sentinel",
  "calendar-token-sentinel",
  "recall-key-sentinel",
  "recall-webhook-sentinel",
  "slack-secret-sentinel",
];

function cleanEnv(extra = {}) {
  return {
    COMPANY_MEMWAL_KEY: "key-sentinel-value",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-id-sentinel",
    CALENDAR_MCP_TOKEN: "calendar-token-sentinel",
    RECALL_API_KEY: "recall-key-sentinel",
    RECALL_WEBHOOK_SECRET: "recall-webhook-sentinel",
    ...extra,
  };
}

function liveWalkEnv(extra = {}) {
  return cleanEnv({
    SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
    SLACK_SIGNING_SECRET: "slack-signing-sentinel",
    SLACK_BOT_TOKEN: "slack-bot-sentinel",
    SEDERUNT_MEMBER: "U_MINA",
    CONSOLE_API_KEY: "console-key-sentinel",
    CONSOLE_SERVICE_PRIVATE_KEY: "console-service-sentinel",
    CONSOLE_FOLDER_ID: "folder-sentinel",
    ...extra,
  });
}

function quietTatum() {
  return { async getObject() { return { text: "", checkpoint: null, objectId: null }; } };
}

function room() {
  return {
    id: "room-1",
    kind: "meeting",
    source: "recall",
    botPresent: true,
    memberIds: ["mina", "rowan"],
  };
}

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
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
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
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
        resolve({ status: res.statusCode, raw, body: parsed });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function noSecret(raw) {
  for (const secret of SENTINELS) assert.equal(raw.includes(secret), false, secret);
  assert.equal(/\b0x[a-f0-9]{8,}\b/i.test(raw), false);
}

function accountKeyField(raw) {
  const inputs = raw.match(/<input\b[^>]*>/gi) || [];
  return inputs.some((tag) => {
    if (/\bid="mcp-token(?:-next)?"/.test(tag)) return false;
    return /type="password"|name="key"|name="token"/i.test(tag);
  });
}

test("the console is the workspace and the room page redirects", async () => {
  const memory = mockAccount({ accountId: "company-console", delegates: ["delegate-console"] });
  const meeting = { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } };
  const app = createApp({
    deps: { memory, meeting, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const home = await get(port, "/console");
    assert.equal(home.status, 200);
    assert.match(home.raw, /id="onboard"/);
    assert.match(home.raw, /id="home"/);
    assert.match(home.raw, /id="rooms"/);
    assert.match(home.raw, /id="history"/);
    assert.match(home.raw, /id="chat"/);
    assert.match(home.raw, /id="record"/);
    assert.match(home.raw, /id="people"/);
    assert.match(home.raw, /The company account is not loaded/);
    const visible = home.raw.slice(0, home.raw.indexOf('id="home"'));
    assert.match(visible, /id="meet-block"/);
    assert.match(visible, /Set SEDERUNT_PUBLIC_ORIGIN to a public https address, then restart/);
    assert.match(visible, /id="slack-block"/);
    assert.match(visible, /The channel door is not set up/);
    assert.match(home.raw, /Run automatically/);
    assert.match(home.raw, /The meeting has not sent who is there/);
    assert.match(home.raw, /Names heard in a room/);
    assert.match(home.raw, /Ask Sederunt/);
    assert.match(home.raw, /data-scope="group"/);
    assert.match(home.raw, /data-scope="you"/);
    assert.match(home.raw, /id="workspace-chip"/);
    assert.match(home.raw, /id="workspace-menu"/);
    assert.match(home.raw, /Create a workspace/);
    assert.match(home.raw, /Private notes stay in this workspace. They are never shared as rooms./);
    assert.match(home.raw, /A second company is a delegate added outside this page/);
    assert.match(home.raw, /This page does not take a key/);
    assert.match(home.raw, /id="cal-connect"/);
    assert.match(home.raw, /id="lin-connect"/);
    assert.match(home.raw, /id="slack-connect"/);
    assert.match(home.raw, /#e01e5a/);
    assert.match(home.raw, /#222326/);
    assert.match(home.raw, /#3c90ff/);
    assert.equal(home.raw.includes("Acme"), false);
    assert.equal(home.raw.includes("Auto"), false);
    assert.equal(accountKeyField(home.raw), false);
    assert.equal(home.raw.includes("—"), false);
    noSecret(home.raw);

    const redirected = await get(port, "/room");
    assert.equal(redirected.status, 302);
    assert.equal(redirected.location, "/console");
    assert.equal(redirected.raw.includes("Send bot to call"), false);

    const typed = await post(port, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "keep-1",
    });
    assert.equal(typed.status, 200);
    assert.match(typed.body.body, /The booth opens at nine/);

    const joined = await post(port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.body, { join: "not-configured" });
    assert.deepEqual(meeting.calls, []);

    const state = await get(port, "/api/console?member=mina");
    assert.equal(state.status, 200);
    const board = JSON.parse(state.raw);
    assert.equal(board.companyLoaded, true);
    assert.equal(board.preferences.linear, "do");
    assert.equal(board.preferences.calendar, "do");
    assert.equal(board.slack, "not-set-up");
    assert.equal(board.doors.meeting, false);
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(board.decisions[0].status, "current");
    assert.deepEqual(board.decisions[0].fileNames, []);
    assert.deepEqual(board.waiting, []);
    assert.equal(board.counts.kept, 1);
    assert.equal(board.counts.waiting, 0);
    assert.equal(board.counts.sent, 0);
    assert.equal(board.counts.failed, 0);
    assert.equal(typeof board.decisions[0].blobId, "string");
    assert.equal(board.decisions[0].proofStatus, "unknown");
    assert.equal(state.raw.includes("consoleFileId"), false);
    noSecret(state.raw);
  } finally {
    await close(app);
  }
});

test("a missing company delegate names the restart and has no key field", async () => {
  const app = createApp({
    deps: { memory: null, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: false,
  });
  const port = await listen(app);
  try {
    const home = await get(port, "/console");
    const state = JSON.parse((await get(port, "/api/console")).raw);
    assert.match(home.raw, /Add the delegate outside this page, then restart/);
    assert.equal(accountKeyField(home.raw), false);
    assert.equal(state.companyLoaded, false);
    assert.match(state.message, /not loaded/);
    assert.match(state.message, /restart/);
    noSecret(home.raw + state.message);
  } finally {
    await close(app);
  }
});

test("a kept sentence survives a new process, and a private note stays out", async () => {
  const memory = mockAccount({ accountId: "company-restart", delegates: ["delegate-restart"] });
  const deps = { memory, tatum: quietTatum() };
  const first = createApp({ deps, env: cleanEnv(), companyLoaded: true });
  const firstPort = await listen(first);
  try {
    await post(firstPort, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "restart-1",
    });
    await post(firstPort, "/api/typed", {
      text: "private: The side door code stays with Mina.",
      memberId: "mina",
      room: room(),
      deliveryId: "restart-private",
    });
  } finally {
    await close(first);
  }

  const second = createApp({ deps, env: cleanEnv({ SEDERUNT_MEMBER: "mina" }), companyLoaded: true });
  const port = await listen(second);
  try {
    const present = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(present.read, "ok");
    assert.equal(present.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(JSON.stringify(present).includes("side door code"), false);

    const absent = JSON.parse((await get(port, "/api/console?member=henry")).raw);
    assert.equal(absent.decisions.length, 0);
    assert.equal(JSON.stringify(absent).includes("booth opens"), false);

    const recalled = await post(port, "/api/mcp", {
      name: "recall",
      arguments: { text: "what was decided", memberId: "mina", room: room() },
    });
    assert.match(recalled.body.body, /The booth opens at nine/);
  } finally {
    await close(second);
  }
});

test("the shipped adapter keeps the decision document and a second process shows it", async () => {
  const stored = [];
  const client = {
    async rememberAndWait(text) {
      stored.push(String(text));
      return { blob_id: `fake-${stored.length}`, namespace: "sederunt", id: `fake-${stored.length}`, owner: "fixture" };
    },
    async recall() {
      return {
        results: stored.map((text, index) => ({ text, blob_id: `fake-${index + 1}`, distance: 0 })),
      };
    },
  };
  const env = {
    COMPANY_MEMWAL_KEY: "delegate-adapter-sentinel",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-adapter-sentinel",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("adapter test must not call the network");
  };
  try {
  const open = (extra = {}) => createApp({
    env,
    memwal: client,
    companyLoaded: true,
    tatum: quietTatum(),
    meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    ...extra,
  });
  const first = open();
  const firstPort = await listen(first);
  try {
    const kept = await post(firstPort, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "adapter-keep",
    });
    assert.match(kept.body.body, /The booth opens at nine/);
    assert.equal(stored.length, 1);
    assert.match(stored[0], /The booth opens at nine/);
    assert.match(stored[0], /inviteMemberIds/);
    assert.match(stored[0], /room-1/);
    assert.equal(stored[0].includes("delegate-adapter-sentinel"), false);
    assert.equal(stored[0].includes("account-adapter-sentinel"), false);
  } finally {
    await close(first);
  }

  const second = open();
  const port = await listen(second);
  try {
    const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(board.read, "ok");
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(board.decisions.some((item) => item.text.includes("delegate-adapter-sentinel")), false);
    noSecret(JSON.stringify(board));
    assert.equal(JSON.stringify(board).includes("delegate-adapter-sentinel"), false);
    assert.equal(JSON.stringify(board).includes("account-adapter-sentinel"), false);
  } finally {
    await close(second);
  }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed account read still reports Connected doors", async () => {
  const memory = {
    async index() {
      throw new Error("Calendar request failed secret-value");
    },
  };
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv({
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_SIGNING_SECRET: "signing",
      SEDERUNT_MEMBER: "mina",
    }),
    companyLoaded: true,
    linearReady: true,
  });
  const port = await listen(app);
  try {
    const failed = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(failed.read, "failed");
    assert.equal(failed.doors.calendar, true);
    assert.equal(failed.doors.linear, true);
    assert.equal(failed.doors.slack, true);
    assert.equal(failed.slack, "ready");
    const html = (await get(port, "/console/setup")).raw;
    assert.match(html, /id="cal-conn" class="conn-state">Connected/);
    assert.match(html, /id="lin-conn" class="conn-state">Connected/);
    assert.match(html, /id="slack-conn" class="conn-state">Connected/);
    assert.equal(html.includes(">Unknown<"), false);
  } finally {
    await close(app);
  }
});

test("a failed memory read is not an empty workspace", async () => {
  let reads = 0;
  const memory = {
    async index() {
      reads += 1;
      throw new Error("Calendar request failed secret-value");
    },
  };
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const failed = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(failed.read, "failed");
    assert.match(failed.message, /could not be read/);
    assert.match(failed.message, /Read the account again/);
    assert.equal(failed.message.includes("No decision is stored yet"), false);
    assert.equal(failed.message.includes("secret-value"), false);
    assert.equal((await get(port, "/console")).raw.includes("Read the account again"), true);
    const second = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(second.read, "failed");
    assert.equal(reads >= 2, true, "failed index must not stick — next GET retries");
    const again = JSON.parse((await post(port, "/api/console/read", {})).raw);
    assert.equal(again.read, "failed");
    assert.equal(reads >= 3, true);
  } finally {
    await close(app);
  }
});

test("an empty account says no decision is stored yet", async () => {
  const memory = mockAccount({ accountId: "company-empty", delegates: ["delegate-empty"] });
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const state = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(state.read, "empty");
    assert.match(state.message, /No decision is stored yet/);
    assert.deepEqual(state.decisions, []);
  } finally {
    await close(app);
  }
});

test("chat recalls a sentence and does not keep a statement", async () => {
  const memory = mockAccount({ accountId: "company-chat", delegates: ["delegate-chat"] });
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv({ SEDERUNT_MEMBER: "mina" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    await post(port, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "chat-keep",
    });
    const before = JSON.parse((await get(port, "/api/console?member=mina")).raw).decisions.length;
    const empty = await post(port, "/api/chat", { text: "   ", memberId: "mina" });
    assert.match(empty.body.body, /The question is missing/);
    const statement = await post(port, "/api/chat", { text: "We will use Postgres for staging.", memberId: "mina" });
    assert.match(statement.body.body, /A decision is kept from a room/);
    assert.equal(statement.body.stored, false);
    assert.equal(statement.body.decisions, before);
    const asked = await post(port, "/api/chat", { text: "what was decided", memberId: "mina" });
    assert.match(asked.body.body, /The booth opens at nine/);
    assert.equal(asked.body.decisions, before);
  } finally {
    await close(app);
  }
});

test("ask and a repeated delivery do not call the connector", async () => {
  const calls = [];
  const linear = {
    calls,
    async readOpenTripTickets() {
      calls.push("read");
      return { team: "ROW", trip: [], open: [] };
    },
    async createIssue() {
      calls.push("create");
      return { identifier: "ROW-1", id: "ROW-1" };
    },
  };
  const session = createSession();
  await handleUtterance({ text: "set linear to ask", session, memberId: "mina", room: room() }, { linear });
  const asked = await handleUtterance({
    text: "File the venue ticket hall",
    session,
    memberId: "mina",
    room: room(),
    deliveryId: "ask-1",
    door: "mcp",
    intent: "act",
  }, { linear });
  assert.match(asked.body, /preference ask/);
  assert.deepEqual(calls, []);

  await handleUtterance({
    text: "set linear to do",
    session,
    memberId: "mina",
    room: room(),
  }, { linear });
  const filed = await handleUtterance({
    text: "File the venue ticket hall-do",
    session,
    memberId: "mina",
    room: room(),
    deliveryId: "do-1",
    door: "mcp",
    intent: "act",
  }, { linear });
  assert.equal(filed.status, "filed");
  const repeat = await handleUtterance({
    text: "File the venue ticket hall-do",
    session,
    memberId: "mina",
    room: room(),
    deliveryId: "do-1",
    door: "mcp",
    intent: "act",
  }, { linear });
  assert.match(repeat.body, /duplicate-delivery/);
  assert.deepEqual(calls, ["create"]);

  const memory = mockAccount({ accountId: "company-mcp", delegates: ["delegate-mcp"] });
  await handleUtterance({
    text: "The booth opens at nine.",
    session: createSession(),
    memberId: "mina",
    room: room(),
    deliveryId: "mcp-keep",
  }, { memory });
  const rebuilt = createSession();
  const app = createApp({
    deps: { memory, linear, tatum: quietTatum() },
    session: rebuilt,
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    const recalled = await handleMcpRequest({
      name: "recall",
      arguments: { text: "what was decided", memberId: "mina", room: room(), session: rebuilt },
    }, { memory });
    assert.match(recalled.body, /The booth opens at nine/);
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.match(recalled.body, new RegExp(board.decisions[0].text.replace(/[.]/g, "\\.")));
  } finally {
    await close(app);
  }
});

test("the alpha walk keeps one sentence and stdio recall matches the console", async () => {
  const missing = createApp({
    deps: { memory: null, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: false,
  });
  const missingPort = await listen(missing);
  try {
    const onboard = await get(missingPort, "/console");
    assert.match(onboard.raw, /id="onboard"/);
    assert.match(onboard.raw, /Add the delegate outside this page, then restart/);
    assert.equal(accountKeyField(onboard.raw), false);
    noSecret(onboard.raw);
  } finally {
    await close(missing);
  }

  const meeting = { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } };
  const memory = mockAccount({ accountId: "company-walk", delegates: ["delegate-walk"] });
  const deps = { memory, meeting, tatum: quietTatum() };
  const first = createApp({ deps, env: cleanEnv(), companyLoaded: true });
  const firstPort = await listen(first);
  try {
    const home = await get(firstPort, "/console");
    assert.match(home.raw, /id="people"/);
    assert.match(home.raw, /SEDERUNT_PUBLIC_ORIGIN/);
    assert.match(home.raw, /Run automatically/);
    const joined = await post(firstPort, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.deepEqual(joined.body, { join: "not-configured" });
    assert.deepEqual(meeting.calls, []);
    const state = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(state.companyLoaded, true);
    assert.equal(state.preferences.calendar, "do");
    assert.equal(state.preferences.linear, "do");
    const kept = await stdioTools(createSession(), { memory, tatum: quietTatum() }, [{
      id: 2,
      name: "act",
      arguments: {
        text: "The booth opens at nine.",
        memberId: "mina",
        room: room(),
      },
    }]);
    assert.match(kept.body, /The booth opens at nine/);
  } finally {
    await close(first);
  }

  const second = createApp({ deps, env: cleanEnv({ SEDERUNT_MEMBER: "mina" }), companyLoaded: true });
  const port = await listen(second);
  try {
    const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(board.preferences.calendar, "do");
    assert.equal(board.preferences.linear, "do");
    const recalled = await stdioTools(createSession(), { memory, tatum: quietTatum() }, [{
      id: 2,
      name: "recall",
      arguments: { text: "what was decided", memberId: "mina", room: room() },
    }]);
    assert.match(recalled.body, /The booth opens at nine/);
    assert.match(recalled.body, new RegExp(board.decisions[0].text.replace(/[.]/g, "\\.")));
    const before = board.decisions.length;
    const asked = await post(port, "/api/chat", { text: "what was decided", memberId: "mina" });
    assert.match(asked.body.body, /The booth opens at nine/);
    assert.equal(asked.body.stored, false);
    assert.equal(asked.body.decisions, before);
    noSecret(JSON.stringify(board) + recalled.body + asked.raw);
  } finally {
    await close(second);
  }
});

test("a second company cannot read the first, and its key is not loaded", async () => {
  const companyA = mockAccount({ accountId: "company-a", delegates: ["delegate-a"] });
  const companyB = mockAccount({ accountId: "company-b", delegates: ["delegate-b"] });
  const touches = [];
  const memoryA = {
    async remember(input) {
      touches.push("remember");
      return companyA.remember(input);
    },
    async index() {
      touches.push("index");
      return companyA.index();
    },
    async recall(query, key) {
      touches.push(["recall", key]);
      return companyA.recall(query, key);
    },
  };
  const app = createApp({
    companies: { companyA: memoryA, companyB },
    deps: { tatum: quietTatum() },
    env: cleanEnv(),
  });
  const port = await listen(app);
  try {
    await post(port, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "company-a-keep",
      company: "companyA",
    });
    const before = touches.length;
    const other = JSON.parse((await get(port, "/api/console?company=companyB&member=henry")).raw);
    assert.equal(JSON.stringify(other).includes("booth opens"), false);
    assert.equal(touches.length, before);
    const recalled = await post(port, "/api/mcp", {
      name: "recall",
      arguments: { text: "what was decided", memberId: "henry", company: "companyB" },
    });
    assert.equal(recalled.body.body.includes("booth opens"), false);
    assert.equal(touches.length, before);
  } finally {
    await close(app);
  }
});

test("a signed slack channel stores one decision and a huddle stores none", async () => {
  const memory = mockAccount({ accountId: "company-slack", delegates: ["delegate-slack"] });
  const secret = "slack-secret-sentinel";
  const posts = [];
  const app = createApp({
    deps: {
      memory,
      tatum: quietTatum(),
      slack: {
        async postMessage(message) { posts.push(message); },
        async members() { return ["U1"]; },
      },
    },
    env: cleanEnv({ SLACK_SIGNING_SECRET: secret, SEDERUNT_MEMBER: "U1", SLACK_BOT_USER_ID: "UBOT" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const page = await get(port, "/console");
    assert.match(page.raw, /The channel door is not set up/);
    assert.equal(page.raw.includes(secret), false);
    const huddle = signed({
      type: "huddle",
      user: "U1",
      channel: "C1",
      text: "The huddle picks Friday.",
      client_msg_id: "huddle-1",
      members: ["U1"],
    }, secret);
    const refused = await post(port, "/api/slack", huddle.payload, huddle.headers);
    assert.match(refused.body.body, /A Slack huddle is not a meeting/);
    assert.equal(refused.body.decisions, 0);

    const channel = signed({
      type: "message",
      user: "U1",
      channel: "C1",
      text: "The booth opens at nine.",
      client_msg_id: "channel-1",
      members: ["U1"],
    }, secret);
    const stored = await post(port, "/api/slack", channel.payload, channel.headers);
    assert.equal(stored.body.decisions, 1);
    const board = JSON.parse((await get(port, "/api/console?member=U1")).raw);
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(board.slack, "not-set-up");

    const asked = signed({
      type: "message",
      user: "U1",
      channel: "C1",
      text: "<@UBOT> what was decided",
      client_msg_id: "ask-1",
      members: ["U1"],
    }, secret);
    const answer = await post(port, "/api/slack", asked.payload, asked.headers);
    assert.match(answer.body.body, /The booth opens at nine/);
    assert.equal(answer.body.decisions, 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].channel, "C1");
    assert.match(posts[0].text, /The booth opens at nine/);

    const chat = await post(port, "/api/chat", { text: "what was decided", memberId: "U1" });
    assert.match(chat.body.body, /The booth opens at nine/);
    assert.equal(chat.body.stored, false);

    const mcp = await post(port, "/api/mcp", {
      name: "recall",
      arguments: { text: "what was decided", memberId: "U1" },
    });
    assert.match(mcp.body.body, /The booth opens at nine/);

    const outsider = signed({
      type: "message",
      user: "U9",
      channel: "C1",
      text: "what was decided",
      client_msg_id: "ask-2",
      members: ["U1"],
    }, secret);
    const hidden = await post(port, "/api/slack", outsider.payload, outsider.headers);
    assert.equal(hidden.body.body.includes("The booth opens at nine."), false);
    assert.equal(posts.length, 1);
  } finally {
    await close(app);
  }
});

test("a Slack delete that only names deleted_ts forgets the stored message", async () => {
  const memory = mockAccount({ accountId: "company-slack-delete", delegates: ["delegate-slack-delete"] });
  const secret = "slack-secret-sentinel";
  const app = createApp({
    deps: {
      memory,
      tatum: quietTatum(),
      slack: { async members() { return ["U1"]; } },
    },
    env: cleanEnv({ SLACK_SIGNING_SECRET: secret, SEDERUNT_MEMBER: "U1" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const message = signed({
      type: "message",
      user: "U1",
      channel: "C1",
      text: "The floor plan is floor-plan.pdf",
      ts: "1700000001.000",
      client_msg_id: "file-client",
    }, secret);
    const stored = await post(port, "/api/slack", message.payload, message.headers);
    assert.equal(stored.body.decisions, 1);
    const deleted = signed({
      type: "message",
      subtype: "message_deleted",
      hidden: true,
      channel: "C1",
      ts: "1700000099.000",
      deleted_ts: "1700000001.000",
    }, secret);
    const gone = await post(port, "/api/slack", deleted.payload, deleted.headers);
    assert.match(gone.body.body, /^deleted/);
    const board = JSON.parse((await get(port, "/api/console?member=U1")).raw);
    assert.equal(board.decisions.some((item) => /floor plan/i.test(item.text)), false);
  } finally {
    await close(app);
  }
});

test("a Slack channel join is not stored", async () => {
  const memory = mockAccount({ accountId: "company-slack-join", delegates: ["delegate-slack-join"] });
  const secret = "slack-secret-sentinel";
  const app = createApp({
    deps: {
      memory,
      tatum: quietTatum(),
      slack: { async members() { return ["U1"]; } },
    },
    env: cleanEnv({ SLACK_SIGNING_SECRET: secret, SEDERUNT_MEMBER: "U1" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const joined = signed({
      type: "message",
      subtype: "channel_join",
      user: "U1",
      channel: "C1",
      text: "<@U1> has joined the channel",
      ts: "1700000003.000",
    }, secret);
    const ignored = await post(port, "/api/slack", joined.payload, joined.headers);
    assert.deepEqual(ignored.body, { slack: "ignored" });
    const board = JSON.parse((await get(port, "/api/console?member=U1")).raw);
    assert.equal(board.decisions.length, 0);
  } finally {
    await close(app);
  }
});

test("a repeated channel mention is posted once", async () => {
  const memory = mockAccount({ accountId: "company-slack-retry", delegates: ["delegate-slack-retry"] });
  const secret = "slack-secret-sentinel";
  const posts = [];
  const app = createApp({
    deps: {
      memory,
      tatum: quietTatum(),
      slack: {
        async postMessage(message) { posts.push(message); },
        async members() { return ["U1"]; },
      },
    },
    env: cleanEnv({ SLACK_SIGNING_SECRET: secret, SEDERUNT_MEMBER: "U1", SLACK_BOT_USER_ID: "UBOT" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const message = signed({
      type: "message",
      user: "U1",
      channel: "C1",
      text: "The booth opens at nine.",
      ts: "1700000004.000",
    }, secret);
    await post(port, "/api/slack", message.payload, message.headers);
    const asked = signed({
      type: "message",
      user: "U1",
      channel: "C1",
      text: "<@UBOT> what was decided",
      ts: "1700000005.000",
    }, secret);
    const first = await post(port, "/api/slack", asked.payload, asked.headers);
    const second = await post(port, "/api/slack", asked.payload, asked.headers);
    assert.match(first.body.body, /The booth opens at nine/);
    assert.equal(first.body.posted, true);
    assert.equal(second.body.posted, false);
    assert.equal(posts.length, 1);
  } finally {
    await close(app);
  }
});

test("slack without a signing secret does not store", async () => {
  const memory = mockAccount({ accountId: "company-slack-off", delegates: ["delegate-slack-off"] });
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const page = await get(port, "/console");
    assert.match(page.raw, /The channel door is not set up/);
    const sent = await post(port, "/api/slack", { event: { text: "The booth opens at nine.", user: "U1", channel: "C1" } });
    assert.deepEqual(sent.body, { slack: "not-set-up" });
    const board = JSON.parse((await get(port, "/api/console?member=U1")).raw);
    assert.equal(board.decisions.length, 0);
  } finally {
    await close(app);
  }
});

test("the room file names a file and a waiting change, and hides a clash the member cannot see", async () => {
  const memory = mockAccount({ accountId: "company-room-file", delegates: ["delegate-room-file"] });
  const app = createApp({
    deps: {
      memory,
      tatum: quietTatum(),
      console: {
        async upload(input) {
          assert.equal(input.bytes, "PDFBYTES");
          return { id: "console-brief", folderId: "folder-brief" };
        },
      },
    },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const kept = await post(port, "/api/typed", {
      text: "Keep brief.pdf for the booth.",
      memberId: "mina",
      room: room(),
      deliveryId: "file-name-1",
      file: { name: "brief.pdf", bytes: "PDFBYTES" },
    });
    assert.equal(kept.status, 200);
    const waiting = await post(port, "/api/typed", {
      text: "file the venue ticket hall",
      memberId: "mina",
      room: room(),
      deliveryId: "wait-1",
    });
    assert.equal(waiting.status, 200);
    assert.doesNotMatch(waiting.body.body, /Waiting for confirmation/);
    const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    const named = board.decisions.find((item) => item.text === "Keep brief.pdf for the booth.");
    assert.deepEqual(named.fileNames, [{ name: "brief.pdf" }]);
    assert.equal(board.waiting.length, 0);
    assert.equal(board.counts.waiting, 0);
    assert.equal(JSON.stringify(board).includes("consoleFileId"), false);
    assert.equal(JSON.stringify(board).includes("PDFBYTES"), false);
    assert.equal(JSON.stringify(board).includes("console-brief"), false);
    noSecret(JSON.stringify(board));
  } finally {
    await close(app);
  }

  const session = {
    decisions: [
      {
        id: "decision-1",
        account: "company",
        kind: "decision",
        text: "The booth opens at nine.",
        speakerMemberId: "mina",
        inviteMemberIds: ["mina"],
        roomId: "room-1",
        contradicts: ["decision-2"],
        fileNames: [{ name: "brief.pdf", consoleFileId: "secret-file", folderId: "secret-folder" }],
        replacedBy: null,
        predecessorId: null,
      },
      {
        id: "decision-2",
        account: "company",
        kind: "decision",
        text: "The booth opens at ten.",
        speakerMemberId: "rowan",
        inviteMemberIds: ["mina", "rowan"],
        roomId: "room-1",
        contradicts: ["decision-1"],
        fileNames: [],
        replacedBy: null,
        predecessorId: null,
      },
      {
        id: "decision-3",
        account: "personal",
        kind: "note",
        text: "side door code",
        speakerMemberId: "mina",
        inviteMemberIds: ["mina"],
        roomId: "room-1",
        contradicts: [],
        fileNames: [],
      },
    ],
    actions: [
      { id: "action-1", state: "waiting", roomId: "room-1", tool: "linear", statement: "file the venue ticket hall" },
      { id: "action-2", state: "waiting", roomId: "room-secret", tool: "calendar", statement: "move the hidden review" },
      { id: "action-3", state: "closed", roomId: "room-1", tool: "linear", statement: "filed earlier" },
    ],
    preferences: [],
  };
  const mina = companyBoard(session, "mina");
  assert.equal(mina.decisions.length, 2);
  assert.equal(mina.decisions.every((item) => item.status === "clashing"), true);
  assert.equal(mina.decisions.some((item) => item.text === "side door code"), false);
  assert.deepEqual(mina.decisions[0].fileNames, [{ name: "brief.pdf" }]);
  assert.equal(JSON.stringify(mina).includes("secret-file"), false);
  assert.equal(JSON.stringify(mina).includes("secret-folder"), false);
  assert.equal(JSON.stringify(mina).includes("hidden review"), false);
  assert.equal(mina.waiting.length, 1);
  assert.equal(mina.waiting[0].id, "action-1");
  assert.equal(mina.counts.sent, 1);
  assert.equal(mina.counts.failed, 0);
  const rowan = companyBoard(session, "rowan");
  assert.equal(rowan.decisions.length, 1);
  assert.equal(rowan.decisions[0].text, "The booth opens at ten.");
  assert.equal(rowan.decisions[0].status, "current");
  assert.equal(JSON.stringify(rowan).includes("nine"), false);
});

test("a personal workspace keeps the private note and has no room", async () => {
  const memory = mockAccount({ accountId: "company-personal", delegates: ["delegate-personal"] });
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv({ SEDERUNT_MEMBER: "mina" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const kept = await post(port, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "workspace-keep",
    });
    assert.equal(kept.status, 200);
    const note = await post(port, "/api/typed", {
      text: "private: The side door code stays with Mina.",
      memberId: "mina",
      room: room(),
      deliveryId: "workspace-note",
    });
    assert.equal(note.status, 200);
    const waiting = await post(port, "/api/typed", {
      text: "file the venue ticket hall",
      memberId: "mina",
      room: room(),
      deliveryId: "workspace-wait",
    });
    assert.equal(waiting.status, 200);

    const company = JSON.parse((await get(port, "/api/console?member=mina&workspace=company")).raw);
    assert.equal(company.workspace, "company");
    assert.equal(company.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(JSON.stringify(company).includes("side door code"), false);
    assert.equal(company.rooms.length, 1);
    assert.equal(company.counts.waiting, 0);

    const personal = JSON.parse((await get(port, "/api/console?member=mina&workspace=personal")).raw);
    assert.equal(personal.workspace, "personal");
    assert.deepEqual(personal.rooms, []);
    assert.deepEqual(personal.waiting, []);
    assert.equal(personal.counts.kept, 1);
    assert.equal(personal.counts.waiting, 0);
    assert.equal(personal.counts.sent, 0);
    assert.equal(personal.decisions.length, 1);
    assert.match(personal.decisions[0].text, /side door code/);
    assert.equal(personal.decisions[0].roomId, "");
    assert.equal(JSON.stringify(personal).includes("booth opens"), false);
    assert.equal(JSON.stringify(personal).includes("venue ticket"), false);
    assert.equal(typeof personal.decisions[0].blobId, "string");
    assert.equal(personal.decisions[0].proofStatus, "unknown");
    noSecret(JSON.stringify(personal));

    const hidden = JSON.parse((await get(port, "/api/console?member=henry&workspace=personal")).raw);
    assert.deepEqual(hidden.decisions, []);
    assert.deepEqual(hidden.rooms, []);

    const companyChat = await post(port, "/api/chat", {
      text: "what was decided",
      memberId: "mina",
      workspace: "company",
    });
    assert.equal(companyChat.body.stored, false);
    assert.match(companyChat.body.body, /The booth opens at nine/);
    assert.equal(companyChat.body.body.includes("side door code"), false);

    const personalChat = await post(port, "/api/chat", {
      text: "what was decided",
      memberId: "mina",
      workspace: "personal",
    });
    assert.equal(personalChat.body.stored, false);
    assert.match(personalChat.body.body, /side door code/);
    assert.equal(personalChat.body.body.includes("booth opens"), false);

    const after = JSON.parse((await get(port, "/api/console?member=mina&workspace=company")).raw);
    assert.equal(after.decisions.length, company.decisions.length);
  } finally {
    await close(app);
  }
});

test("ask first, voice, and clash survive a new process", async () => {
  const memory = mockAccount({ accountId: "company-room-setting", delegates: ["delegate-room-setting"] });
  const deps = { memory, tatum: quietTatum() };
  const first = createApp({ deps, env: cleanEnv(), companyLoaded: true });
  const firstPort = await listen(first);
  try {
    await post(firstPort, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "setting-keep",
    });
    const before = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(before.decisions.length, 1);
    assert.equal(before.rooms[0].ask, false);
    assert.equal(before.rooms[0].voice, "plain");
    assert.equal(before.rooms[0].raiseClash, false);

    const bareVoice = await post(firstPort, "/api/typed", {
      text: "set voice to short",
      memberId: "mina",
      deliveryId: "setting-bare-voice",
    });
    assert.match(bareVoice.body.body, /one room/);
    const bareClash = await post(firstPort, "/api/typed", {
      text: "set clash to on",
      memberId: "mina",
      deliveryId: "setting-bare-clash",
    });
    assert.match(bareClash.body.body, /one room/);

    await post(firstPort, "/api/typed", {
      text: "set linear to do in room room-1",
      memberId: "mina",
      deliveryId: "setting-linear",
    });
    await post(firstPort, "/api/typed", {
      text: "set calendar to do in room room-1",
      memberId: "mina",
      deliveryId: "setting-calendar",
    });
    await post(firstPort, "/api/typed", {
      text: "set voice to short in room room-1",
      memberId: "mina",
      deliveryId: "setting-voice",
    });
    const clash = await post(firstPort, "/api/typed", {
      text: "set clash to on in room room-1",
      memberId: "mina",
      deliveryId: "setting-clash",
    });
    assert.match(clash.body.body, /raise a clash here/);
    const prose = await post(firstPort, "/api/typed", {
      text: "The booth raises a clash at noon.",
      memberId: "mina",
      room: room(),
      deliveryId: "setting-prose",
    });
    assert.match(prose.body.body, /raises a clash at noon/);

    const saved = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(saved.decisions.length, 2);
    assert.equal(saved.decisions.some((item) => item.text === "set voice to short"), false);
    assert.equal(saved.decisions.some((item) => item.text === "set clash to on"), false);
    assert.equal(saved.preferences.linear, "do");
    assert.equal(saved.preferences.calendar, "do");
    assert.equal(saved.rooms[0].ask, false);
    assert.equal(saved.rooms[0].voice, "short");
    assert.equal(saved.rooms[0].raiseClash, true);
    assert.equal(JSON.stringify(saved).includes("replacedBy"), false);
    assert.equal(JSON.stringify(saved).includes("roomSetting"), false);
  } finally {
    await close(first);
  }

  const second = createApp({ deps, env: cleanEnv(), companyLoaded: true });
  const secondPort = await listen(second);
  try {
    const board = JSON.parse((await get(secondPort, "/api/console?member=mina")).raw);
    assert.equal(board.decisions.length, 2);
    assert.equal(board.decisions.some((item) => item.text === "The booth opens at nine."), true);
    assert.equal(board.decisions.some((item) => item.text === "The booth raises a clash at noon."), true);
    assert.equal(board.preferences.linear, "do");
    assert.equal(board.preferences.calendar, "do");
    const kept = board.rooms.find((item) => item.id === "room-1");
    assert.equal(kept.ask, false);
    assert.equal(kept.voice, "short");
    assert.equal(kept.raiseClash, true);
    assert.equal(JSON.stringify(board).includes("set voice to short"), false);
    noSecret(JSON.stringify(board));

    await post(secondPort, "/api/typed", {
      text: "The hall opens at ten.",
      memberId: "mina",
      room: { ...room(), id: "room-2" },
      deliveryId: "setting-room-2",
    });
    await post(secondPort, "/api/typed", {
      text: "set voice to formal in room room-1",
      memberId: "mina",
      deliveryId: "setting-formal",
    });
    const moved = JSON.parse((await get(secondPort, "/api/console?member=mina")).raw);
    const firstRoom = moved.rooms.find((item) => item.id === "room-1");
    const other = moved.rooms.find((item) => item.id === "room-2");
    assert.equal(firstRoom.voice, "formal");
    assert.equal(firstRoom.raiseClash, true);
    assert.equal(firstRoom.ask, false);
    assert.equal(other.voice, "plain");
    assert.equal(other.raiseClash, false);
    assert.equal(other.ask, false);
  } finally {
    await close(second);
  }

  const third = createApp({ deps, env: cleanEnv(), companyLoaded: true });
  const thirdPort = await listen(third);
  try {
    const board = JSON.parse((await get(thirdPort, "/api/console?member=mina")).raw);
    const firstRoom = board.rooms.find((item) => item.id === "room-1");
    const other = board.rooms.find((item) => item.id === "room-2");
    assert.equal(firstRoom.voice, "formal");
    assert.equal(firstRoom.raiseClash, true);
    assert.equal(firstRoom.ask, false);
    assert.equal(other.voice, "plain");
    assert.equal(other.raiseClash, false);
    assert.equal(board.preferences.linear, "do");
    const session = createSession();
    await rebuildCompanyIndex(session, { memory });
    assert.equal(resolvePreference(session.preferences, "linear", "room-1"), "do");
    assert.equal(resolvePreference(session.preferences, "calendar", "room-1"), "do");
    assert.equal(resolvePreference(session.preferences, "linear", "room-2"), "do");
    assert.equal(resolvePreference(session.preferences, "linear", ""), "do");
  } finally {
    await close(third);
  }
});

test("the shipped adapter reloads a room voice without keeping the command", async () => {
  const stored = [];
  const client = {
    async rememberAndWait(text) {
      stored.push(String(text));
      return { blob_id: `fake-${stored.length}`, namespace: "sederunt", id: `fake-${stored.length}`, owner: "fixture" };
    },
    async recall() {
      return { results: stored.map((text, index) => ({ text, blob_id: `fake-${index + 1}`, distance: 0 })) };
    },
  };
  const env = {
    COMPANY_MEMWAL_KEY: "delegate-setting-sentinel",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-setting-sentinel",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("adapter test must not call the network");
  };
  try {
    const open = () => createApp({
      env,
      memwal: client,
      companyLoaded: true,
      tatum: quietTatum(),
      meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    });
    const first = open();
    const firstPort = await listen(first);
    try {
      await post(firstPort, "/api/typed", {
        text: "The booth opens at nine.",
        memberId: "mina",
        room: room(),
        deliveryId: "adapter-setting-keep",
      });
      await post(firstPort, "/api/typed", {
        text: "set voice to short in room room-1",
        memberId: "mina",
        deliveryId: "adapter-setting-voice",
      });
      await post(firstPort, "/api/typed", {
        text: "set clash to on in room room-1",
        memberId: "mina",
        deliveryId: "adapter-setting-clash",
      });
      assert.equal(stored.some((text) => text.includes("roomSetting")), true);
      assert.equal(stored.some((text) => text.includes("delegate-setting-sentinel")), false);
    } finally {
      await close(first);
    }

    const second = open();
    const port = await listen(second);
    try {
      const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
      assert.equal(board.decisions.length, 1);
      assert.equal(board.decisions[0].text, "The booth opens at nine.");
      assert.equal(board.rooms[0].voice, "short");
      assert.equal(board.rooms[0].raiseClash, true);
      assert.equal(board.rooms[0].ask, false);
      assert.equal(JSON.stringify(board).includes("delegate-setting-sentinel"), false);
      noSecret(JSON.stringify(board));
    } finally {
      await close(second);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an older preference copy does not outrank the one that replaced it", async () => {
  const session = createSession();
  const report = await rebuildCompanyIndex(session, {
    memory: {
      async index() {
        return [
          {
            kind: "preference",
            preference: { id: "preference-5", tool: "linear", value: "do", roomId: "room-1", replacedBy: "preference-6" },
          },
          {
            kind: "preference",
            preference: { id: "preference-4", tool: "linear", value: "ask", roomId: "room-1", replacedBy: null },
          },
          {
            kind: "preference",
            preference: { id: "preference-5", tool: "linear", value: "do", roomId: "room-1", replacedBy: null },
          },
          {
            kind: "room",
            roomSetting: { id: "setting-5", roomId: "room-1", voice: "short", raiseClash: true, replacedBy: "setting-6" },
          },
          {
            kind: "room",
            roomSetting: { id: "setting-4", roomId: "room-1", voice: "formal", raiseClash: false, replacedBy: null },
          },
          {
            kind: "room",
            roomSetting: { id: "setting-5", roomId: "room-1", voice: "short", raiseClash: true, replacedBy: null },
          },
        ];
      },
    },
  });
  assert.equal(report.ok, true);
  assert.equal(resolvePreference(session.preferences, "linear", "room-1"), "ask");
  const board = companyBoard({
    ...session,
    decisions: [{
      id: "decision-9",
      account: "company",
      kind: "decision",
      text: "The booth opens at nine.",
      speakerMemberId: "mina",
      inviteMemberIds: ["mina"],
      roomId: "room-1",
      contradicts: [],
      fileNames: [],
    }],
  }, "mina");
  assert.equal(board.rooms[0].voice, "formal");
  assert.equal(board.rooms[0].raiseClash, false);
  assert.equal(board.decisions.length, 1);
});

function observeEpoch(memory, epoch) {
  return {
    async remember(input) {
      const saved = await memory.remember(input);
      const key = typeof input?.idempotencyKey === "string" ? input.idempotencyKey : "";
      if (key.endsWith(":expiry")) return saved;
      return { ...saved, expiryEpoch: epoch };
    },
    index() {
      return memory.index();
    },
  };
}

test("a named file stays in Console, the proof is read, and the epoch is not renewed", async () => {
  const inner = mockAccount({ accountId: "company-file-proof", delegates: ["delegate-file-proof"] });
  const memory = observeEpoch(inner, 420);
  const fileCalls = [];
  const files = {
    async upload(payload) {
      fileCalls.push(payload.name);
      assert.equal(payload.bytes, "PDFBYTES");
      return { id: "file-secret", folderId: "folder-secret" };
    },
    async renew() {
      fileCalls.push("renew");
    },
  };
  const reads = [];
  const tatum = {
    async getObject(id) {
      reads.push(id);
      return { text: "", checkpoint: 88, objectId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    },
  };
  const open = () => createApp({
    deps: {
      memory,
      tatum,
      console: files,
      meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const first = open();
  const firstPort = await listen(first);
  try {
    const page = await get(firstPort, "/console");
    assert.match(page.raw, /This page does not renew it/);
    assert.match(page.raw, /file-mark/);
    const kept = await post(firstPort, "/api/typed", {
      text: "Keep brief.pdf for the booth.",
      memberId: "mina",
      room: room(),
      deliveryId: "file-proof-1",
      file: { name: "brief.pdf", bytes: "PDFBYTES" },
    });
    assert.equal(kept.status, 200);
    const board = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(board.decisions.length, 1);
    assert.equal(board.decisions[0].text, "Keep brief.pdf for the booth.");
    assert.deepEqual(board.decisions[0].fileNames, [{ name: "brief.pdf" }]);
    assert.equal(board.decisions[0].expiryEpoch, 420);
    assert.equal(board.decisions[0].checkpoint, 88);
    assert.deepEqual(fileCalls, ["brief.pdf"]);
    assert.equal(reads.length, 1);
    const raw = JSON.stringify(board);
    assert.equal(raw.includes("file-secret"), false);
    assert.equal(raw.includes("folder-secret"), false);
    assert.equal(raw.includes("PDFBYTES"), false);
    assert.equal(board.decisions[0].proof.objectId, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.match(raw, /https:\/\/suiscan\.xyz\/mainnet\/object\/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    assert.equal(board.chain.transport, "tatum-grpc");
  } finally {
    await close(first);
  }

  const indexed = JSON.stringify(await memory.index());
  assert.equal(indexed.includes("PDFBYTES"), false);
  assert.equal(indexed.includes("brief.pdf"), true);
  assert.equal(indexed.includes("expiryEpoch"), true);

  const disagreed = {
    async getObject(id) {
      reads.push(id);
      return { text: "The object says the booth opens at ten.", checkpoint: 91 };
    },
  };
  const second = createApp({
    deps: {
      memory,
      tatum: disagreed,
      console: files,
      meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const secondPort = await listen(second);
  try {
    const board = JSON.parse((await get(secondPort, "/api/console?member=mina")).raw);
    assert.equal(board.decisions.length, 1);
    assert.equal(board.decisions[0].text, "The object says the booth opens at ten.");
    assert.deepEqual(board.decisions[0].fileNames, [{ name: "brief.pdf" }]);
    assert.equal(board.decisions[0].expiryEpoch, 420);
    assert.equal(board.decisions[0].checkpoint, 91);
    assert.deepEqual(fileCalls, ["brief.pdf"]);
    noSecret(JSON.stringify(board));
  } finally {
    await close(second);
  }

  const failed = createApp({
    deps: {
      memory,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
      console: files,
      meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const failedPort = await listen(failed);
  try {
    const board = JSON.parse((await get(failedPort, "/api/console?member=mina")).raw);
    assert.equal(board.decisions[0].text, "Keep brief.pdf for the booth.");
    assert.deepEqual(board.decisions[0].fileNames, [{ name: "brief.pdf" }]);
    assert.equal(board.decisions[0].expiryEpoch, 420);
    assert.equal(board.decisions[0].checkpoint, null);
    assert.deepEqual(fileCalls, ["brief.pdf"]);
  } finally {
    await close(failed);
  }
});

test("a later expiry copy does not clear the epoch already observed", async () => {
  const session = createSession();
  const report = await rebuildCompanyIndex(session, {
    memory: {
      async index() {
        return [
          {
            kind: "expiry",
            blobId: "blob-expiry",
            expiry: { decisionId: "decision-1", expiryEpoch: 420 },
          },
          {
            kind: "decision",
            blobId: "blob-sentence",
            decision: {
              id: "decision-1",
              text: "Keep brief.pdf for the booth.",
              speakerMemberId: "mina",
              inviteMemberIds: ["mina"],
              roomId: "room-1",
              account: "company",
              kind: "decision",
              fileNames: [{ name: "brief.pdf", consoleFileId: "file-secret", folderId: "folder-secret" }],
            },
          },
          {
            kind: "expiry",
            expiry: { decisionId: "decision-1", expiryEpoch: null },
          },
        ];
      },
    },
  });
  assert.equal(report.ok, true);
  assert.equal(session.decisions.length, 1);
  assert.equal(session.decisions[0].blobId, "blob-sentence");
  assert.equal(session.decisions[0].expiryEpoch, 420);
  const board = companyBoard(session, "mina");
  const proved = await readProofs(session, board, {
    async getObject(id) {
      assert.equal(id, "blob-sentence");
      return { text: "The object says the booth opens at ten.", checkpoint: 88 };
    },
  });
  assert.equal(proved.decisions[0].text, "The object says the booth opens at ten.");
  assert.equal(proved.decisions[0].checkpoint, 88);
  assert.equal(proved.decisions[0].expiryEpoch, 420);
  assert.deepEqual(proved.decisions[0].fileNames, [{ name: "brief.pdf" }]);
  assert.equal(JSON.stringify(proved).includes("file-secret"), false);
  assert.equal(proved.decisions[0].blobId, "blob-sentence");
  assert.equal(proved.decisions[0].proof.blobId, "blob-sentence");
  assert.equal(proved.decisions[0].proofStatus, "unknown");
  const unknown = await readProofs(session, companyBoard(session, "mina"), {
    async getObject() {
      throw new Error("Tatum read failed");
    },
  });
  assert.equal(unknown.decisions[0].text, "Keep brief.pdf for the booth.");
  assert.equal(unknown.decisions[0].checkpoint, null);
  assert.equal(unknown.decisions[0].expiryEpoch, 420);
});

test("the shipped adapter records the epoch and keeps the file name off the bytes", async () => {
  const stored = [];
  const client = {
    async rememberAndWait(text) {
      stored.push(String(text));
      return {
        blob_id: `fake-${stored.length}`,
        namespace: "sederunt",
        id: `fake-${stored.length}`,
        owner: "fixture",
        expiry_epoch: 420,
      };
    },
    async recall() {
      return { results: stored.map((text, index) => ({ text, blob_id: `fake-${index + 1}`, distance: 0 })) };
    },
  };
  const fileCalls = [];
  const env = {
    COMPANY_MEMWAL_KEY: "delegate-file-sentinel",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-file-sentinel",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("adapter test must not call the network");
  };
  try {
    const open = () => createApp({
      env,
      memwal: client,
      companyLoaded: true,
      tatum: {
        async getObject(id) {
          assert.equal(id, "fake-1");
          return { text: "", checkpoint: 88 };
        },
      },
      console: {
        async upload(payload) {
          fileCalls.push(payload.name);
          assert.equal(payload.bytes, "PDFBYTES");
          return { id: "file-secret", folderId: "folder-secret" };
        },
        async renew() {
          fileCalls.push("renew");
        },
      },
      meeting: { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } },
    });
    const first = open();
    const firstPort = await listen(first);
    try {
      const kept = await post(firstPort, "/api/typed", {
        text: "Keep brief.pdf for the booth.",
        memberId: "mina",
        room: room(),
        deliveryId: "adapter-file-1",
        file: { name: "brief.pdf", bytes: "PDFBYTES" },
      });
      assert.equal(kept.status, 200);
      assert.equal(stored.some((text) => text.includes("PDFBYTES")), false);
      assert.equal(stored.some((text) => text.includes("brief.pdf")), true);
      assert.equal(stored.some((text) => text.includes('"expiryEpoch":420')), true);
      assert.equal(stored.some((text) => text.includes("delegate-file-sentinel")), false);
      assert.deepEqual(fileCalls, ["brief.pdf"]);
    } finally {
      await close(first);
    }

    const second = open();
    const port = await listen(second);
    try {
      const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
      assert.equal(board.decisions.length, 1);
      assert.equal(board.decisions[0].text, "Keep brief.pdf for the booth.");
      assert.deepEqual(board.decisions[0].fileNames, [{ name: "brief.pdf" }]);
      assert.equal(board.decisions[0].expiryEpoch, 420);
      assert.equal(board.decisions[0].checkpoint, 88);
      const raw = JSON.stringify(board);
      assert.equal(raw.includes("file-secret"), false);
      assert.equal(raw.includes("folder-secret"), false);
      assert.equal(raw.includes("PDFBYTES"), false);
      assert.equal(raw.includes("delegate-file-sentinel"), false);
      noSecret(raw);
      assert.deepEqual(fileCalls, ["brief.pdf"]);
    } finally {
      await close(second);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an accepted meeting join keeps the waiting room after a new process and leaves the link out", async () => {
  const memory = mockAccount({ accountId: "company-join-room", delegates: ["delegate-join-room"] });
  const meeting = { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } };
  const link = "https://meet.google.com/abc-defg-hij?token=room-query-token";
  const open = () => createApp({
    deps: { memory, meeting, tatum: quietTatum() },
    env: liveWalkEnv(),
    linearReady: true,
    companyLoaded: true,
  });
  const first = open();
  const firstPort = await listen(first);
  try {
    const joined = await post(firstPort, "/api/join", { url: link });
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.body, { join: "sent" });
    assert.deepEqual(meeting.calls, ["join"]);
    const board = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(board.decisions.length, 0);
    assert.equal(board.rooms.length, 1);
    assert.equal(board.rooms[0].platform, "Google Meet");
    assert.equal(board.rooms[0].count, 0);
    assert.equal(board.rooms[0].ask, true);
    assert.equal(board.rooms[0].voice, "plain");
    assert.equal(board.rooms[0].raiseClash, false);
    assert.equal(board.counts.kept, 0);
    assert.equal(board.counts.failed, 0);
    const raw = JSON.stringify(board);
    assert.equal(raw.includes("room-query-token"), false);
    assert.equal(raw.includes("abc-defg-hij"), false);
    assert.equal(raw.includes("meet.google.com"), false);
    const personal = JSON.parse((await get(firstPort, "/api/console?workspace=personal&member=mina")).raw);
    assert.deepEqual(personal.rooms, []);
    const ignored = await post(firstPort, "/api/typed", {
      text: "",
      memberId: "mina",
      openedRoom: { platform: "Zoom" },
      deliveryId: "opened-room-ignored",
    });
    assert.equal(ignored.status, 200);
    const afterIgnored = JSON.parse((await get(firstPort, "/api/console?member=mina")).raw);
    assert.equal(afterIgnored.rooms.length, 1);
    assert.equal(afterIgnored.rooms[0].platform, "Google Meet");
  } finally {
    await close(first);
  }

  const indexed = JSON.stringify(await memory.index());
  assert.equal(indexed.includes("room-query-token"), false);
  assert.equal(indexed.includes("abc-defg-hij"), false);
  assert.equal(indexed.includes("Google Meet"), true);

  const second = open();
  const secondPort = await listen(second);
  try {
    const board = JSON.parse((await get(secondPort, "/api/console?member=mina")).raw);
    assert.equal(board.rooms.length, 1);
    assert.equal(board.rooms[0].platform, "Google Meet");
    assert.equal(board.decisions.length, 0);
    assert.equal(JSON.stringify(board).includes("room-query-token"), false);
    assert.deepEqual(meeting.calls, ["join"]);
  } finally {
    await close(second);
  }

  const failedMeeting = {
    calls: [],
    async join() {
      this.calls.push("join");
      throw new Error("Meeting join failed");
    },
  };
  const failed = createApp({
    deps: { memory, meeting: failedMeeting, tatum: quietTatum() },
    env: liveWalkEnv(),
    linearReady: true,
    companyLoaded: true,
  });
  const failedPort = await listen(failed);
  try {
    const joined = await post(failedPort, "/api/join", { url: "https://zoom.us/j/111" });
    assert.equal(joined.body.join, "failed");
    assert.deepEqual(failedMeeting.calls, ["join"]);
    const board = JSON.parse((await get(failedPort, "/api/console?member=mina")).raw);
    assert.equal(board.rooms.length, 1);
    assert.equal(board.rooms[0].platform, "Google Meet");
  } finally {
    await close(failed);
  }

  const slackMeeting = { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } };
  const slack = createApp({
    deps: { memory, meeting: slackMeeting, tatum: quietTatum() },
    env: liveWalkEnv(),
    linearReady: true,
    companyLoaded: true,
  });
  const slackPort = await listen(slack);
  try {
    const joined = await post(slackPort, "/api/join", { url: "https://app.slack.com/huddle/T123" });
    assert.equal(joined.body.join, "sent");
    assert.deepEqual(slackMeeting.calls, ["join"]);
    const board = JSON.parse((await get(slackPort, "/api/console?member=mina")).raw);
    assert.equal(board.rooms.length, 1);
    assert.equal(JSON.stringify(board).includes("slack.com"), false);
  } finally {
    await close(slack);
  }
  assert.equal(JSON.stringify(await memory.index()).includes("slack.com"), false);
});

test("the shipped adapter keeps an opened meeting room and leaves the link out", async () => {
  const stored = [];
  const client = {
    async rememberAndWait(text) {
      stored.push(String(text));
      return { blob_id: `fake-${stored.length}`, namespace: "sederunt", id: `fake-${stored.length}`, owner: "fixture" };
    },
    async recall() {
      return { results: stored.map((text, index) => ({ text, blob_id: `fake-${index + 1}`, distance: 0 })) };
    },
  };
  const env = liveWalkEnv({
    COMPANY_MEMWAL_KEY: "delegate-join-sentinel",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-join-sentinel",
  });
  const meeting = { calls: [], async join() { this.calls.push("join"); return { id: "fixture-bot" }; } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("adapter test must not call the network");
  };
  try {
    const open = () => createApp({
      env,
      memwal: client,
      companyLoaded: true,
      linearReady: true,
      tatum: quietTatum(),
      meeting,
    });
    const first = open();
    const firstPort = await listen(first);
    try {
      const joined = await post(firstPort, "/api/join", {
        url: "https://meet.google.com/abc-defg-hij?token=room-query-token",
      });
      assert.equal(joined.body.join, "sent");
      assert.equal(stored.some((text) => text.includes("Google Meet")), true);
      assert.equal(stored.some((text) => text.includes("room-query-token")), false);
      assert.equal(stored.some((text) => text.includes("abc-defg-hij")), false);
      assert.equal(stored.some((text) => text.includes("delegate-join-sentinel")), false);
    } finally {
      await close(first);
    }
    const second = open();
    const port = await listen(second);
    try {
      const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
      assert.equal(board.rooms.length, 1);
      assert.equal(board.rooms[0].platform, "Google Meet");
      assert.equal(board.decisions.length, 0);
      assert.equal(JSON.stringify(board).includes("room-query-token"), false);
      assert.equal(JSON.stringify(board).includes("delegate-join-sentinel"), false);
      assert.deepEqual(meeting.calls, ["join"]);
    } finally {
      await close(second);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an outside ask keeps who asked and leaves the sentence out", async () => {
  const memory = mockAccount({ accountId: "company-access", delegates: ["delegate-access"] });
  const texts = [];
  const inner = memory.remember.bind(memory);
  memory.remember = async (input) => {
    texts.push(String(input?.text ?? ""));
    return inner(input);
  };
  const asked = "what was decided about the marigold quarry";
  const filed = "File the venue ticket marigold-hall";
  const app = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const kept = await post(port, "/api/typed", {
      text: "The booth opens at nine.",
      memberId: "mina",
      room: room(),
      deliveryId: "access-keep",
    });
    assert.match(kept.body.body, /booth opens at nine/);
    const first = await post(port, "/api/typed", {
      text: asked,
      memberId: "lea",
      room: room(),
      deliveryId: "access-ask",
    });
    assert.match(first.body.body, /not-invited/);
    assert.equal(first.body.body.includes("marigold"), false);
    const repeat = await post(port, "/api/typed", {
      text: asked,
      memberId: "lea",
      room: room(),
      deliveryId: "access-ask-again",
    });
    assert.match(repeat.body.body, /not-invited/);
    const write = await post(port, "/api/typed", {
      text: filed,
      memberId: "lea",
      room: room(),
      deliveryId: "access-write",
    });
    assert.match(write.body.body, /marigold-hall/);
    assert.match(write.body.body, /not-invited/);
    const heard = await post(port, "/api/typed", {
      text: "what was decided",
      memberId: "mina",
      room: room(),
      deliveryId: "access-heard",
    });
    assert.match(heard.body.body, /booth opens at nine/);
    const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
    assert.equal(board.access.length, 1);
    assert.deepEqual(board.access[0], { roomId: board.rooms[0].id, speaker: "lea" });
    assert.equal(JSON.stringify(board).includes("marigold"), false);
    assert.equal(board.counts.failed, 0);
    const outsider = JSON.parse((await get(port, "/api/console?member=lea")).raw);
    assert.deepEqual(outsider.access, []);
    assert.equal(outsider.rooms.length, 0);
    assert.equal(JSON.stringify(outsider).includes("marigold"), false);
    assert.equal(JSON.stringify(outsider).includes("booth opens"), false);
    const personal = JSON.parse((await get(port, "/api/console?workspace=personal&member=mina")).raw);
    assert.deepEqual(personal.access, []);
    assert.deepEqual(personal.rooms, []);
    const accessDocs = (await memory.index()).filter((doc) => doc.kind === "access");
    assert.equal(accessDocs.length, 1);
    assert.equal(accessDocs[0].access.speaker, "lea");
    assert.equal(JSON.stringify(accessDocs[0]).includes("marigold"), false);
    assert.equal(texts.some((text) => text.includes("marigold")), false);
    assert.equal(texts.some((text) => text.endsWith(" asked")), true);
    noSecret(JSON.stringify(board));
  } finally {
    await close(app);
  }

  const again = createApp({
    deps: { memory, tatum: quietTatum() },
    env: cleanEnv(),
    companyLoaded: true,
  });
  const nextPort = await listen(again);
  try {
    const board = JSON.parse((await get(nextPort, "/api/console?member=mina")).raw);
    assert.equal(board.access.length, 1);
    assert.equal(board.access[0].speaker, "lea");
    assert.equal(JSON.stringify(board).includes("marigold"), false);
    await post(nextPort, "/api/typed", {
      text: asked,
      memberId: "lea",
      room: room(),
      deliveryId: "access-ask-restart",
    });
    assert.equal((await memory.index()).filter((doc) => doc.kind === "access").length, 1);
  } finally {
    await close(again);
  }
});

test("a missing member, an empty room, and a huddle store no outside ask", async () => {
  const memory = mockAccount({ accountId: "company-access-skip", delegates: ["delegate-access-skip"] });
  const texts = [];
  const inner = memory.remember.bind(memory);
  memory.remember = async (input) => {
    texts.push(String(input?.text ?? ""));
    return inner(input);
  };
  const asked = "what was decided about the marigold quarry";
  const empty = createSession();
  const none = await handleUtterance({
    text: asked,
    session: empty,
    memberId: "lea",
    room: room(),
    intent: "recall",
    deliveryId: "skip-empty",
  }, { memory });
  assert.match(none.body, /there are no notes yet/);
  assert.equal(empty.accesses.length, 0);

  const session = createSession();
  await handleUtterance({
    text: "The booth opens at nine.",
    session,
    memberId: "mina",
    room: room(),
    deliveryId: "skip-keep",
  }, { memory });
  const missing = await handleUtterance({
    text: asked,
    session,
    room: room(),
    intent: "recall",
    deliveryId: "skip-missing",
  }, { memory });
  assert.match(missing.body, /missing-member/);
  assert.equal(missing.body.includes("marigold"), false);
  const huddle = await handleUtterance({
    text: asked,
    session,
    memberId: "sam",
    room: {
      id: "room-1",
      kind: "huddle",
      source: "slack-huddle",
      botPresent: true,
      memberIds: ["mina", "rowan"],
    },
    intent: "recall",
    deliveryId: "skip-huddle",
  }, { memory });
  assert.match(huddle.body, /not-invited/);
  assert.equal(huddle.body.includes("marigold"), false);
  assert.equal(session.accesses.length, 0);
  assert.equal((await memory.index()).some((doc) => doc.kind === "access"), false);
  assert.equal(texts.some((text) => text.includes("marigold")), false);

  const named = mockAccount({ accountId: "company-access-wide", delegates: ["delegate-access-wide"] });
  const wideTexts = [];
  const namedInner = named.remember.bind(named);
  named.remember = async (input) => {
    wideTexts.push(String(input?.text ?? ""));
    return namedInner(input);
  };
  const open = createSession();
  await handleUtterance({
    text: "The booth opens at nine.",
    session: open,
    memberId: "mina",
    room: room(),
    deliveryId: "wide-keep",
  }, { memory: named });
  const wide = await handleUtterance({
    text: asked,
    session: open,
    memberId: "sam",
    intent: "recall",
    deliveryId: "wide-ask",
  }, { memory: named });
  assert.match(wide.body, /not-invited/);
  assert.equal(wide.body.includes("marigold"), false);
  assert.equal(open.accesses.length, 1);
  assert.deepEqual(
    open.accesses.map((row) => ({ roomId: row.roomId, speaker: row.speaker })),
    [{ roomId: "room-1", speaker: "sam" }],
  );
  await handleUtterance({
    text: "private: the spare phrase stays home",
    session: open,
    memberId: "mina",
    deliveryId: "wide-private",
  }, { memory: named });
  const personalAsk = await handleUtterance({
    text: asked,
    session: open,
    memberId: "ivy",
    workspace: "personal",
    intent: "recall",
    deliveryId: "wide-personal",
  }, { memory: named });
  assert.match(personalAsk.body, /not-invited/);
  assert.equal(personalAsk.body.includes("marigold"), false);
  assert.equal(personalAsk.body.includes("spare phrase"), false);
  assert.equal(open.accesses.some((row) => row.speaker === "ivy"), false);
  const filed = await handleUtterance({
    text: "File the venue ticket hall-keep",
    session: open,
    memberId: "mina",
    room: room(),
    deliveryId: "wide-file",
  }, { memory: named });
  assert.match(filed.body, /hall-keep/);
  const actionId = open.actions[0].id;
  const confirmed = await handleUtterance({
    text: `confirm ${actionId}`,
    session: open,
    memberId: "nile",
    room: room(),
    deliveryId: "wide-confirm",
  }, { memory: named });
  assert.match(confirmed.body, /not-invited/);
  assert.doesNotMatch(confirmed.body, /hall-keep/);
  const speakers = open.accesses.map((row) => row.speaker);
  assert.deepEqual(speakers, ["sam", "nile"]);
  const accessDocs = (await named.index()).filter((doc) => doc.kind === "access");
  assert.equal(accessDocs.length, 2);
  assert.equal(JSON.stringify(accessDocs).includes("marigold"), false);
  assert.equal(JSON.stringify(accessDocs).includes("hall-keep"), false);
  assert.equal(JSON.stringify(accessDocs).includes("spare phrase"), false);
  const askedTexts = wideTexts.filter((text) => text.endsWith(" asked"));
  assert.equal(askedTexts.length, 2);
  assert.equal(askedTexts.some((text) => text.includes("marigold") || text.includes("hall-keep") || text.includes("spare")), false);
  assert.equal(wideTexts.some((text) => text.includes("marigold")), false);
});

test("the shipped adapter keeps who asked and leaves the sentence out", async () => {
  const stored = [];
  const client = {
    async rememberAndWait(text) {
      stored.push(String(text));
      return { blob_id: `fake-access-${stored.length}`, namespace: "sederunt", id: `fake-access-${stored.length}`, owner: "fixture" };
    },
    async recall() {
      return { results: stored.map((text, index) => ({ text, blob_id: `fake-access-${index + 1}`, distance: 0 })) };
    },
  };
  const env = cleanEnv({
    COMPANY_MEMWAL_KEY: "delegate-access-sentinel",
    COMPANY_MEMWAL_ACCOUNT_ID: "account-access-sentinel",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("adapter test must not call the network");
  };
  const asked = "what was decided about the marigold quarry";
  try {
    const open = () => createApp({
      env,
      memwal: client,
      companyLoaded: true,
      tatum: quietTatum(),
    });
    const first = open();
    const firstPort = await listen(first);
    try {
      const kept = await post(firstPort, "/api/typed", {
        text: "The booth opens at nine.",
        memberId: "mina",
        room: room(),
        deliveryId: "ship-access-keep",
      });
      assert.match(kept.body.body, /booth opens at nine/);
      const refused = await post(firstPort, "/api/typed", {
        text: asked,
        memberId: "lea",
        room: room(),
        deliveryId: "ship-access-ask",
      });
      assert.match(refused.body.body, /not-invited/);
      assert.equal(refused.body.body.includes("marigold"), false);
      assert.equal(stored.some((text) => text.includes("marigold")), false);
      assert.equal(stored.some((text) => text.includes('"speaker":"lea"')), true);
      assert.equal(stored.some((text) => text.includes("delegate-access-sentinel")), false);
      assert.equal(stored.some((text) => text.includes("account-access-sentinel")), false);
    } finally {
      await close(first);
    }
    const second = open();
    const port = await listen(second);
    try {
      const board = JSON.parse((await get(port, "/api/console?member=mina")).raw);
      assert.equal(board.access.length, 1);
      assert.deepEqual(board.access[0], { roomId: board.rooms[0].id, speaker: "lea" });
      assert.equal(JSON.stringify(board).includes("marigold"), false);
      assert.equal(JSON.stringify(board).includes("delegate-access-sentinel"), false);
      assert.match(board.decisions.map((item) => item.text).join("\n"), /booth opens at nine/);
    } finally {
      await close(second);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function frameMessage(message) {
  const json = JSON.stringify(message);
  return Buffer.concat([
    Buffer.from(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`),
    Buffer.from(json),
  ]);
}

function readFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf("\r\n\r\n", offset);
    if (headerEnd < 0) break;
    const match = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(offset, headerEnd).toString("utf8"));
    if (!match) break;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) break;
    messages.push(JSON.parse(buffer.subarray(start, start + length).toString("utf8")));
    offset = start + length;
  }
  return messages;
}

function stdioTools(session, deps, calls) {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks = [];
  output.on("data", (chunk) => chunks.push(chunk));
  serveMcpStdio({ input, output, session, deps, memberId: "mina" });
  const wanted = new Set(calls.map((call) => call.id));
  input.write(frameMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "walk", version: "0" } },
  }));
  for (const call of calls) {
    input.write(frameMessage({
      jsonrpc: "2.0",
      id: call.id,
      method: "tools/call",
      params: { name: call.name, arguments: call.arguments },
    }));
  }
  input.end();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stdio recall timed out")), 2000);
    const finish = () => {
      const messages = readFrames(Buffer.concat(chunks));
      if (!messages.some((message) => wanted.has(message.id))) return;
      clearTimeout(timer);
      output.off("data", finish);
      const message = messages.find((item) => wanted.has(item.id));
      resolve(JSON.parse(message.result.content[0].text));
    };
    output.on("data", finish);
    finish();
  });
}

test("a Slack challenge is echoed and the console confirm uses the configured member", async () => {
  const memory = mockAccount({ accountId: "company-live-member", delegates: ["delegate-live-member"] });
  const secret = "slack-secret-sentinel";
  const linear = {
    calls: [],
    async createIssue() {
      this.calls.push("create");
      return { identifier: "ROW-91", id: "ROW-91" };
    },
    async assignIssue() {
      return { identifier: "ROW-91", id: "ROW-91" };
    },
  };
  const app = createApp({
    deps: { memory, tatum: quietTatum(), linear },
    env: cleanEnv({ SLACK_SIGNING_SECRET: secret, SEDERUNT_MEMBER: "U_MINA", SLACK_BOT_USER_ID: "UBOT" }),
    companyLoaded: true,
  });
  const port = await listen(app);
  try {
    const challengeBody = JSON.stringify({ type: "url_verification", challenge: "challenge-token" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${challengeBody}`).digest("hex")}`;
    const challenge = await post(port, "/api/slack", challengeBody, {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    });
    assert.equal(challenge.body.challenge, "challenge-token");

    const kept = await post(port, "/api/typed", {
      text: "Hey Maple the booth opens at nine.",
      door: "meeting",
      addressed: true,
      deliveryId: "live-booth",
      participants: ["U_MINA"],
      room: { id: "bot-live", kind: "meeting", source: "recall", botPresent: true, memberIds: ["U_MINA"] },
    });
    assert.match(kept.body.body, /booth opens at nine/);
    const board = JSON.parse((await get(port, "/api/console?member=U_MINA")).raw);
    assert.equal(board.waiting.length, 0);
    assert.deepEqual(linear.calls, []);

    const ask = signed({
      type: "message",
      user: "U_MINA",
      channel: "C1",
      text: "<@UBOT> what was decided",
      client_msg_id: "ask-mention",
    }, secret);
    const before = JSON.parse((await get(port, "/api/console?member=U_MINA")).raw).decisions.length;
    const answer = await post(port, "/api/slack", ask.payload, ask.headers);
    assert.match(answer.body.body, /booth opens at nine/);
    const after = JSON.parse((await get(port, "/api/console?member=U_MINA")).raw).decisions.length;
    assert.equal(after, before);
  } finally {
    await close(app);
  }
});

function signed(event, secret) {
  const payload = JSON.stringify({ event });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return {
    payload,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
  };
}
