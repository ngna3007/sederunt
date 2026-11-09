import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { CALENDAR_SCOPES, FORMS_SCOPES, createPersonGoogleStore } from "../src/connectors/google-person.js";
import { resolveMcpSpace } from "../src/connectors/expose.js";
import { claimWorkspaceSlack, slackClaimState } from "../src/slack/claim.js";
import { createTenantBind } from "../src/tenant-bind.js";
import { createMemoryPreferenceStore } from "../src/bot/preferences.js";
import { createApp } from "../src/server.js";

const SECRET = "tenant-authz-session-secret";
const SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SLACK_SECRET = "slack-authz-secret";
const RECALL_SECRET = `whsec_${Buffer.from("recall-authz-secret").toString("base64")}`;

function identityEnv(extra = {}) {
  return {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    COMPANY_MEMWAL_KEY: "company-key",
    COMPANY_MEMWAL_ACCOUNT_ID: "company-account",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: SECRETS_KEY,
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    ...extra,
  };
}

function oauthCookie({ userId = "user-a", tenantId = TENANT_A, accessToken = "access-a" } = {}) {
  const token = sealSession({
    kind: "oauth",
    memberId: userId,
    userId,
    name: "Ada",
    email: "ada@example.test",
    exp: Date.now() + 3_600_000,
    accessToken,
    refreshToken: "refresh-a",
    accessExp: Date.now() + 3_600_000,
    tenantId,
    onboarded: true,
    provider: "google",
  }, SECRET);
  return `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`;
}

function passphraseCookie() {
  const token = sealSession({
    memberId: "mina",
    name: "Mina",
    exp: Date.now() + 3_600_000,
  }, SECRET);
  return `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`;
}

function identityFor(memberships) {
  return {
    async myTenants() {
      return memberships.map((row) => ({
        id: row.id,
        name: row.name || "Workspace",
        kind: row.kind || "company",
        role: row.role || "owner",
      }));
    },
    async getUser() {
      return { user_metadata: {} };
    },
    async updateUser() {},
  };
}

const PERSONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NORTHLINE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function formsConnector(name) {
  return {
    id: `forms-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    slug: "google-forms",
    name,
    preset: "google-forms",
    status: "connected",
    enabled: true,
    tools: [{
      name: "get_form",
      description: "Get a form",
      enabled: true,
      changed: false,
      inputSchema: { type: "object" },
    }],
  };
}

function fakeConnectors(rowsByTenant) {
  return {
    kind: "memory",
    soleTenantId() {
      const ids = Object.keys(rowsByTenant);
      return ids.length === 1 ? ids[0] : "";
    },
    async list(tenantId) {
      return rowsByTenant[tenantId] || [];
    },
  };
}

function slackAuth(teamId = "T_CLAIM") {
  return {
    async postMessage() {},
    async members() { return ["U1"]; },
    async authTest() { return { ok: true, teamId, teamName: "Claimed" }; },
  };
}

function emptyDeps(extra = {}) {
  return {
    memory: trackingMemory(),
    tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    ...extra,
  };
}

function trackingMemory() {
  const remembered = [];
  return {
    remembered,
    allowUnscoped: false,
    async remember(input) {
      remembered.push(input);
      return { blobId: `blob-${remembered.length}` };
    },
    async index() { return []; },
    async recall() { return []; },
  };
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, body, headers = {}) {
  const payload = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(raw); } catch { /* plain */ }
        resolve({ status: res.statusCode, raw, json, headers: res.headers, location: res.headers.location || "" });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signSlack(payload, secret = SLACK_SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  return {
    "content-type": "application/json",
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  };
}

function signRecall(payload, secret = RECALL_SECRET) {
  const id = "msg-authz";
  const timestamp = "1731705121";
  const encoded = String(secret).startsWith("whsec_") ? String(secret).slice("whsec_".length) : String(secret);
  const key = Buffer.from(encoded, "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

function grantEnv() {
  return {
    MCP_SECRETS_KEY_V1: SECRETS_KEY,
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    SEDERUNT_AUTH_FAKE: "1",
  };
}

function createGrantRows() {
  const map = new Map();
  const key = (tenantId, personId, provider = "google") => `${tenantId}\0${personId}\0${provider}`;
  return {
    async get(tenantId, personId, provider = "google") {
      const row = map.get(key(tenantId, personId, provider));
      if (!row) return null;
      return {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion,
        scopes: [...row.scopes],
      };
    },
    async put(row) {
      map.set(key(row.tenantId, row.personId, row.provider || "google"), {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion,
        scopes: [...(row.scopes || [])],
      });
    },
    async delete(tenantId, personId, provider = "google") {
      map.delete(key(tenantId, personId, provider));
    },
  };
}

test("cold unbound Slack under identity does not write legacy or empty-tenant keeps", async (t) => {
  const memory = trackingMemory();
  const binds = createTenantBind({}, { memory: new Map() });
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({ SLACK_SIGNING_SECRET: SLACK_SECRET, SLACK_BOT_TOKEN: "xoxb-test" }),
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { async postMessage() {}, async members() { return ["U1"]; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const payload = JSON.stringify({
    type: "event_callback",
    team_id: "T_UNBOUND",
    event: { type: "message", user: "U1", channel: "C_COLD", text: "Legacy cedar-92 should never land", client_msg_id: "cold-1" },
  });
  const res = await call(port, "POST", "/api/slack", payload, signSlack(payload));
  assert.equal(res.status, 200);
  assert.equal(memory.remembered.length, 0);
});

test("cold unbound Recall under identity does not write", async (t) => {
  const memory = trackingMemory();
  const binds = createTenantBind({}, { memory: new Map() });
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({ RECALL_WEBHOOK_SECRET: RECALL_SECRET }),
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const payload = JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "bot-unbound" },
      transcript: { id: "tr-1" },
      data: {
        participant: { id: 1, name: "Mina" },
        words: [{ text: "Legacy" }, { text: "unscoped" }, { text: "cedar-92" }],
      },
    },
  });
  const res = await call(port, "POST", "/api/recall", payload, signRecall(payload));
  assert.equal(res.status, 204);
  assert.equal(memory.remembered.length, 0);
});

test("join on isolate A then Recall on isolate B stamps the bound tenant", async (t) => {
  const sharedRemote = new Map();
  const remote = {
    async get(key) { return sharedRemote.get(key) || ""; },
    async setNx(key, value) {
      if (sharedRemote.has(key)) return "conflict";
      sharedRemote.set(key, value);
      return "ok";
    },
    async expire(key) { return sharedRemote.has(key); },
  };
  // Distinct local maps — only remote is shared (real cross-isolate).
  const bindA = createTenantBind({}, { memory: new Map(), remote });
  const bindB = createTenantBind({}, { memory: new Map(), remote });
  const memoryA = trackingMemory();
  const memoryB = trackingMemory();

  const env = identityEnv({
    RECALL_WEBHOOK_SECRET: RECALL_SECRET,
    RECALL_API_KEY: "recall-key",
    SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
    SLACK_SIGNING_SECRET: "slack",
    SLACK_BOT_TOKEN: "xoxb",
    CONSOLE_API_KEY: "k",
    CONSOLE_SERVICE_PRIVATE_KEY: "p",
    CONSOLE_FOLDER_ID: "f",
  });

  const appA = createApp({
    companyLoaded: true,
    linearReady: true,
    env,
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: bindA,
    deps: {
      memory: memoryA,
      meeting: { async join() { return { id: "bot-shared-1", startedAt: "2026-11-06T12:00:00.000Z" }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const appB = createApp({
    companyLoaded: true,
    env,
    identity: identityFor([{ id: TENANT_B }]),
    tenantBind: bindB,
    deps: {
      memory: memoryB,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const portA = await listen(appA);
  const portB = await listen(appB);
  t.after(() => { appA.close(); appB.close(); });

  const join = await call(portA, "POST", "/api/join", { url: "https://meet.google.com/abc-defg-hij" }, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  });
  assert.equal(join.status, 200);
  assert.equal(join.json?.join, "sent");
  assert.equal(await bindB.resolve("bot", "bot-shared-1"), TENANT_A);

  const payload = JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "bot-shared-1" },
      transcript: { id: "tr-shared" },
      data: {
        participant: { id: "mina", name: "Mina" },
        words: [{ text: "Adam," }, { text: "the" }, { text: "booth" }, { text: "opens" }, { text: "at" }, { text: "nine." }],
      },
    },
  });
  const recall = await call(portB, "POST", "/api/recall", payload, signRecall(payload));
  assert.equal(recall.status, 204);
  assert.equal(memoryB.remembered.length >= 1, true);
  assert.equal(memoryB.remembered.every((row) => row.tenantId === TENANT_A), true);
});

test("console browsing does not rebind Slack; explicit claim is first-writer-wins", async (t) => {
  const memory = trackingMemory();
  const binds = createTenantBind({}, { memory: new Map() });
  const slack = {
    async postMessage() {},
    async members() { return ["U1"]; },
    async authTest() { return { ok: true, teamId: "T_SHARED", teamName: "Shared" }; },
  };
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({
      SLACK_SIGNING_SECRET: SLACK_SECRET,
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_DEFAULT_CHANNEL: "C1",
    }),
    identity: identityFor([{ id: TENANT_A }, { id: TENANT_B }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack,
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  // Console A then B browsing must NOT claim Slack.
  assert.equal((await call(port, "GET", `/api/console?company=${TENANT_A}`, null, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  })).status, 200);
  assert.equal((await call(port, "GET", `/api/console?company=${TENANT_B}`, null, {
    cookie: oauthCookie({ userId: "user-b", tenantId: TENANT_B, accessToken: "access-b" }),
  })).status, 200);
  assert.equal(await binds.resolve("slack", "T_SHARED"), "");
  assert.equal(await binds.resolve("slack", "T_SHARED:C1"), "");

  const claimed = await claimWorkspaceSlack({
    tenantBind: binds,
    slack,
    channelId: "C1",
  }, TENANT_A);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.teamId, "T_SHARED");

  const conflict = await claimWorkspaceSlack({
    tenantBind: binds,
    slack,
    channelId: "C1",
  }, TENANT_B);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);

  // More console browsing still cannot steal the bind.
  await call(port, "GET", `/api/console?company=${TENANT_B}`, null, {
    cookie: oauthCookie({ userId: "user-b", tenantId: TENANT_B, accessToken: "access-b" }),
  });
  assert.equal(await binds.resolve("slack", "T_SHARED:C1"), TENANT_A);

  const payload = JSON.stringify({
    type: "event_callback",
    team_id: "T_SHARED",
    event: { type: "message", user: "U1", channel: "C1", text: "Keep for owner A", client_msg_id: "own-1" },
  });
  await call(port, "POST", "/api/slack", payload, signSlack(payload));
  assert.equal(memory.remembered.length >= 1, true);
  assert.equal(memory.remembered.at(-1).tenantId, TENANT_A);
});

test("passphrase session cannot select a company UUID while identity is on", async (t) => {
  const app = createApp({
    companyLoaded: true,
    env: identityEnv(),
    identity: identityFor([{ id: TENANT_A }]),
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const denied = await call(port, "GET", `/api/console?company=${TENANT_A}`, null, {
    cookie: passphraseCookie(),
  });
  assert.equal(denied.status, 401);
});

test("unauthorized signed-in Ask/console denied for foreign company", async (t) => {
  const app = createApp({
    companyLoaded: true,
    env: identityEnv(),
    identity: identityFor([{ id: TENANT_A }]),
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const cookie = oauthCookie({ tenantId: TENANT_A });

  assert.equal((await call(port, "GET", `/api/console?company=${TENANT_C}`, null, { cookie })).status, 403);
  assert.equal((await call(port, "POST", "/api/ask", { text: "what was decided", company: TENANT_C }, {
    cookie,
    "sec-fetch-site": "same-origin",
  })).status, 403);
  assert.equal((await call(port, "POST", "/api/chat", { text: "what was decided in the booth", company: TENANT_C }, { cookie })).status, 403);
  assert.equal((await call(port, "GET", `/api/room?company=${TENANT_C}`, null, { cookie })).status, 403);
  assert.equal((await call(port, "POST", "/api/hearing", { company: TENANT_C, name: "Adam" }, { cookie })).status, 403);
  assert.equal((await call(port, "POST", "/api/typed", {
    text: "hello",
    company: TENANT_C,
    memberId: "mina",
    room: { id: "r1", kind: "meeting", memberIds: ["mina"] },
  }, { cookie })).status, 403);
});

test("unauthenticated console/chat/room denied when identity is on", async (t) => {
  const app = createApp({
    companyLoaded: true,
    env: identityEnv(),
    identity: identityFor([{ id: TENANT_A }]),
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  assert.equal((await call(port, "GET", `/api/console?company=${TENANT_A}`)).status, 401);
  assert.equal((await call(port, "POST", "/api/chat", { text: "what was decided", company: TENANT_A })).status, 401);
  assert.equal((await call(port, "GET", `/api/room?company=${TENANT_A}`)).status, 401);
  assert.equal((await call(port, "POST", "/api/hearing", { company: TENANT_A, name: "Adam" })).status, 401);
  assert.equal((await call(port, "POST", "/api/typed", { text: "hi", company: TENANT_A, memberId: "mina" })).status, 401);
});

test("calendar-only grant powers welcome/detail; forms-only does not; env tokens ignored", async (t) => {
  const grants = createPersonGoogleStore({
    env: grantEnv(),
    grantRows: createGrantRows(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return { access_token: "ya29.calendar-only", expires_in: 3600 }; },
    }),
  });
  await grants.save("user-a", {
    refreshToken: "rt-calendar",
    accessToken: "ya29.calendar-only",
    expiresAt: Date.now() + 60_000,
    scopes: [...CALENDAR_SCOPES],
  }, { tenantId: TENANT_A });

  const formsOnly = createPersonGoogleStore({
    env: grantEnv(),
    grantRows: createGrantRows(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return { access_token: "ya29.forms", expires_in: 3600 }; },
    }),
  });
  await formsOnly.save("user-a", {
    refreshToken: "rt-forms",
    accessToken: "ya29.forms",
    expiresAt: Date.now() + 60_000,
    scopes: [...FORMS_SCOPES],
  }, { tenantId: TENANT_A });

  // Env calendar tokens present — must not authorize OAuth reads.
  const env = identityEnv({
    SEDERUNT_CALENDAR_FAKE: "0",
    CALENDAR_MCP_TOKEN: "ya29.env-must-not-use",
    CALENDAR_OAUTH_REFRESH_TOKEN: "rt-env-must-not-use",
  });

  const calCalls = [];
  const app = createApp({
    companyLoaded: true,
    env,
    identity: identityFor([{ id: TENANT_A }]),
    googleGrants: grants,
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      calendar: {
        async listUpcoming() { calCalls.push("env-list"); return [{ title: "ENV LEAK" }]; },
        async readDay() { calCalls.push("env-day"); return { day: "friday", events: [{ title: "ENV LEAK" }] }; },
        async readEventDetails() { calCalls.push("env-detail"); return { id: "e1", title: "ENV LEAK" }; },
      },
    },
    fetch: async (url, init = {}) => {
      if (String(url).includes("googleapis.com/auth/calendar") || String(url).includes("mcp.googleapis.com") || String(url).includes("calendar")) {
        calCalls.push({ url: String(url), auth: String(init.headers?.Authorization || init.headers?.authorization || "") });
      }
      if (String(url).includes("oauth2.googleapis.com")) {
        return { ok: true, status: 200, async json() { return { access_token: "ya29.calendar-only", expires_in: 3600 }; }, async text() { return "{}"; } };
      }
      // Calendar MCP list
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({
                  events: [{
                    id: "evt-person",
                    summary: "Person grant standup",
                    start: { dateTime: "2099-01-02T03:00:00+07:00" },
                    end: { dateTime: "2099-01-02T03:30:00+07:00" },
                  }],
                }),
              }],
            },
          });
        },
        async json() { return {}; },
      };
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const cookie = oauthCookie({ tenantId: TENANT_A, userId: "user-a" });

  // Detail route must use person grant path — env adapter must not run.
  const detail = await call(port, "GET", "/console/calendar/events/evt-person", null, { cookie });
  assert.equal(calCalls.includes("env-detail"), false);
  assert.equal(JSON.stringify(detail.json || {}).includes("ENV LEAK"), false);
  assert.equal(JSON.stringify(detail.json || {}).includes("ya29.env"), false);
  assert.equal(JSON.stringify(detail.json || {}).includes("rt-env"), false);
  // Env adapter would return 200 + "ENV LEAK". Person-grant path is connected (not 409 from env check)
  // and never surfaces deployment credentials even when MCP returns not-found.
  assert.notEqual(detail.json?.event?.title, "ENV LEAK");
  assert.equal(detail.status === 409 && detail.json?.error === "not-connected", false);

  // Forms-only app: detail must be not-connected despite env tokens.
  const appForms = createApp({
    companyLoaded: true,
    env,
    identity: identityFor([{ id: TENANT_A }]),
    googleGrants: formsOnly,
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      calendar: {
        async readEventDetails() { return { id: "e1", title: "ENV LEAK" }; },
      },
    },
  });
  const portForms = await listen(appForms);
  t.after(() => appForms.close());
  const formsDetail = await call(portForms, "GET", "/console/calendar/events/evt-person", null, { cookie });
  assert.equal(formsDetail.status, 409);
  assert.equal(formsDetail.json?.error, "not-connected");
  assert.equal(JSON.stringify(formsDetail.json || {}).includes("ENV LEAK"), false);
});

test("calendar and forms scopes merge on save; consent remains scope-aware", async () => {
  const grants = createPersonGoogleStore({ env: grantEnv(), grantRows: createGrantRows() });
  assert.equal(await grants.save("person-m", {
    refreshToken: "rt-1",
    scopes: [...FORMS_SCOPES],
  }, { tenantId: TENANT_A }), true);
  assert.equal(await grants.save("person-m", {
    refreshToken: "rt-1",
    scopes: [...CALENDAR_SCOPES],
  }, { tenantId: TENANT_A }), true);
  assert.equal(await grants.granted("person-m", { tenantId: TENANT_A, scopes: FORMS_SCOPES }), true);
  assert.equal(await grants.granted("person-m", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES }), true);
});

test("join reports failed when durable bot bind cannot be acknowledged", async (t) => {
  const remote = {
    async get() { return ""; },
    async setNx() { return "error"; },
    async expire() { return false; },
  };
  const binds = createTenantBind(
    { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" },
    { memory: new Map(), remote },
  );
  const meeting = {
    left: [],
    async join() { return { id: "bot-no-bind" }; },
    async leave(id) { this.left.push(id); return { ok: true }; },
  };
  const app = createApp({
    companyLoaded: true,
    linearReady: true,
    env: identityEnv({
      RECALL_API_KEY: "recall-key",
      RECALL_WEBHOOK_SECRET: RECALL_SECRET,
      SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
      SLACK_SIGNING_SECRET: "slack",
      SLACK_BOT_TOKEN: "xoxb",
      CONSOLE_API_KEY: "k",
      CONSOLE_SERVICE_PRIVATE_KEY: "p",
      CONSOLE_FOLDER_ID: "f",
      UPSTASH_REDIS_REST_URL: "https://x",
      UPSTASH_REDIS_REST_TOKEN: "t",
    }),
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: binds,
    deps: {
      memory: trackingMemory(),
      meeting,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const join = await call(port, "POST", "/api/join", { url: "https://meet.google.com/abc-defg-hij" }, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  });
  assert.equal(join.status, 200);
  assert.equal(join.json?.join, "failed");
  assert.equal(join.json?.reason, "bind-failed");
  assert.equal(join.json?.left, true);
  assert.deepEqual(meeting.left, ["bot-no-bind"]);
});

test("team-first claim rolls back leftover channel; rejected tenant owns nothing", async () => {
  const store = new Map();
  const remote = {
    async get(key) { return store.get(key) || ""; },
    async setNx(key, value) {
      if (store.has(key)) return "conflict";
      store.set(key, value);
      return "ok";
    },
    async expire(key) { return store.has(key); },
    async compareAndDelete(key, value) {
      if (store.get(key) !== value) return false;
      store.delete(key);
      return true;
    },
  };
  const env = { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" };
  const binds = createTenantBind(env, { memory: new Map(), remote });
  const slack = { async authTest() { return { ok: true, teamId: "T_ORPHAN", teamName: "Orphan" }; } };

  // Case 1: A owns team-only; B claims team+C_DEFAULT → fail; no channel leftover for B
  assert.equal((await binds.bind("slack", "T_ORPHAN", TENANT_A)).ok, true);
  const bDefault = await claimWorkspaceSlack({
    tenantBind: binds, slack, channelId: "C_DEFAULT", requireRemote: true,
  }, TENANT_B);
  assert.equal(bDefault.ok, false);
  assert.equal(bDefault.conflict, true);
  assert.equal(await binds.resolve("slack", "T_ORPHAN"), TENANT_A);
  assert.equal(await binds.resolve("slack", "T_ORPHAN:C_DEFAULT"), "");

  // Case 2: A owns team+C1; B claims C2 → fail; C2 not left owned by B
  assert.equal((await binds.bind("slack", "T_ORPHAN:C1", TENANT_A)).ok, true);
  const bC2 = await claimWorkspaceSlack({
    tenantBind: binds,
    slack: { async authTest() { return { ok: true, teamId: "T_ORPHAN", teamName: "Orphan" }; } },
    channelId: "C2",
    requireRemote: true,
  }, TENANT_B);
  assert.equal(bC2.ok, false);
  assert.equal(await binds.resolve("slack", "T_ORPHAN:C2"), "");
  assert.equal(await binds.resolve("slack", "T_ORPHAN:C1"), TENANT_A);
});

test("channel claim failure rolls back only our new team key; never another owner", async () => {
  const store = new Map();
  let failChannel = false;
  const remote = {
    async get(key) { return store.get(key) || ""; },
    async setNx(key, value) {
      // Channel keys look like ...:slack:TEAM:CHANNEL (two more segments after slack)
      const parts = String(key).split(":");
      const isChannel = parts.length >= 5;
      if (failChannel && isChannel) return "error";
      if (store.has(key)) return "conflict";
      store.set(key, value);
      return "ok";
    },
    async expire(key) { return store.has(key); },
    async compareAndDelete(key, value) {
      if (store.get(key) !== value) return false;
      store.delete(key);
      return true;
    },
  };
  const env = { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" };
  const binds = createTenantBind(env, { memory: new Map(), remote });

  // B creates team then channel write fails → team rolled back
  failChannel = true;
  const failed = await claimWorkspaceSlack({
    tenantBind: binds,
    teamId: "T_ROLL",
    channelId: "C_NEW",
    requireRemote: true,
  }, TENANT_B);
  assert.equal(failed.ok, false);
  assert.equal(failed.rolledBackTeam, true);
  assert.equal(await binds.resolve("slack", "T_ROLL"), "");
  assert.equal(await binds.resolve("slack", "T_ROLL:C_NEW"), "");

  // A successfully claims team; B channel-only attempt that somehow created team earlier must not delete A
  failChannel = false;
  assert.equal((await claimWorkspaceSlack({
    tenantBind: binds, teamId: "T_ROLL", channelId: "C_A", requireRemote: true,
  }, TENANT_A)).ok, true);

  // Simulate B holding a stale "createdTeam" path: release with B must not wipe A
  assert.equal((await binds.release("slack", "T_ROLL", TENANT_B)).ok, false);
  assert.equal(await binds.resolve("slack", "T_ROLL"), TENANT_A);
});

test("split-brain / mismatched keysets fail closed for routing and claim state", async (t) => {
  const store = new Map();
  const remote = {
    async get(key) { return store.get(key) || ""; },
    async setNx(key, value) {
      if (store.has(key)) return "conflict";
      store.set(key, value);
      return "ok";
    },
    async expire(key) { return store.has(key); },
    async compareAndDelete(key, value) {
      if (store.get(key) !== value) return false;
      store.delete(key);
      return true;
    },
  };
  const envBind = { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" };
  const binds = createTenantBind(envBind, { memory: new Map(), remote });
  // Legacy team-only A + orphan channel leftover as B
  await binds.bind("slack", "T_SPLIT", TENANT_A);
  store.set("sederunt:tenant-bind:slack:T_SPLIT:C_LEFT", TENANT_B);

  const stateB = await slackClaimState({
    tenantBind: binds, teamId: "T_SPLIT", channelId: "C_LEFT", slackConfigured: true,
  }, TENANT_B);
  assert.equal(stateB.linked, false);
  assert.equal(stateB.splitBrain === true || Boolean(stateB.conflictOwner), true);

  const memory = trackingMemory();
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({
      SLACK_SIGNING_SECRET: SLACK_SECRET,
      SLACK_BOT_TOKEN: "xoxb-test",
      UPSTASH_REDIS_REST_URL: "https://x",
      UPSTASH_REDIS_REST_TOKEN: "t",
    }),
    identity: identityFor([{ id: TENANT_B }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: {
        async postMessage() {},
        async members() { return ["U1"]; },
        async authTest() { return { ok: true, teamId: "T_SPLIT", teamName: "Split" }; },
      },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const payload = JSON.stringify({
    type: "event_callback",
    team_id: "T_SPLIT",
    event: { type: "message", user: "U1", channel: "C_LEFT", text: "Should not land for B", client_msg_id: "split-1" },
  });
  await call(port, "POST", "/api/slack", payload, signSlack(payload));
  assert.equal(memory.remembered.length, 0);

  // Legacy team-only routes to A when no channel key
  const binds2 = createTenantBind(envBind, { memory: new Map(), remote });
  await binds2.bind("slack", "T_LEGACY", TENANT_A);
  const memory2 = trackingMemory();
  const app2 = createApp({
    companyLoaded: true,
    env: identityEnv({ SLACK_SIGNING_SECRET: SLACK_SECRET, SLACK_BOT_TOKEN: "xoxb-test" }),
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: binds2,
    deps: {
      memory: memory2,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { async postMessage() {}, async members() { return ["U1"]; } },
    },
  });
  const port2 = await listen(app2);
  t.after(() => app2.close());
  const legacy = JSON.stringify({
    type: "event_callback",
    team_id: "T_LEGACY",
    event: { type: "message", user: "U1", channel: "C_ANY", text: "Legacy team only for A", client_msg_id: "leg-1" },
  });
  await call(port2, "POST", "/api/slack", legacy, signSlack(legacy));
  assert.equal(memory2.remembered.length >= 1, true);
  assert.equal(memory2.remembered.at(-1).tenantId, TENANT_A);
});

test("welcome Connect Slack HTTP path requires owner/admin; member rejected", async (t) => {
  const store = new Map();
  const remote = {
    async get(key) { return store.get(key) || ""; },
    async setNx(key, value) {
      if (store.has(key)) return "conflict";
      store.set(key, value);
      return "ok";
    },
    async expire(key) { return store.has(key); },
    async compareAndDelete(key, value) {
      if (store.get(key) !== value) return false;
      store.delete(key);
      return true;
    },
  };
  const binds = createTenantBind(
    { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" },
    { memory: new Map(), remote },
  );
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({
      SLACK_SIGNING_SECRET: SLACK_SECRET,
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_DEFAULT_CHANNEL: "C1",
      UPSTASH_REDIS_REST_URL: "https://x",
      UPSTASH_REDIS_REST_TOKEN: "t",
    }),
    identity: identityFor([{ id: TENANT_A, role: "member" }]),
    tenantBind: binds,
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: {
        async postMessage() {},
        async members() { return ["U1"]; },
        async authTest() { return { ok: true, teamId: "T_WELCOME", teamName: "Welcome" }; },
      },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const denied = await call(port, "POST", "/console/welcome", "action=chat&choice=connect", {
    cookie: oauthCookie({ tenantId: TENANT_A }),
    "content-type": "application/x-www-form-urlencoded",
  });
  assert.equal(denied.status, 200);
  assert.match(denied.raw, /Only an owner or admin can connect Slack/);
  assert.equal(await binds.resolve("slack", "T_WELCOME"), "");
  assert.equal(await binds.resolve("slack", "T_WELCOME:C1"), "");

  // Owner path succeeds via same HTTP handler
  const ownerApp = createApp({
    companyLoaded: true,
    env: identityEnv({
      SLACK_SIGNING_SECRET: SLACK_SECRET,
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_DEFAULT_CHANNEL: "C1",
      UPSTASH_REDIS_REST_URL: "https://x",
      UPSTASH_REDIS_REST_TOKEN: "t",
    }),
    identity: identityFor([{ id: TENANT_A, role: "owner" }]),
    tenantBind: binds,
    deps: {
      memory: trackingMemory(),
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: {
        async postMessage() {},
        async members() { return ["U1"]; },
        async authTest() { return { ok: true, teamId: "T_WELCOME", teamName: "Welcome" }; },
      },
    },
  });
  const portOwner = await listen(ownerApp);
  t.after(() => ownerApp.close());
  const ok = await call(portOwner, "POST", "/console/welcome", "action=chat&choice=connect", {
    cookie: oauthCookie({ tenantId: TENANT_A }),
    "content-type": "application/x-www-form-urlencoded",
  });
  assert.equal(ok.status, 302);
  assert.equal(await binds.resolve("slack", "T_WELCOME"), TENANT_A);
  assert.equal(await binds.resolve("slack", "T_WELCOME:C1"), TENANT_A);

  const chat = await call(portOwner, "GET", "/console/welcome?step=chat", null, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  });
  assert.match(chat.raw, /id="slack-status">[\s\S]*?Connected/);
});

test("unbound early Recall callback is retryable and does not ingest", async (t) => {
  const memory = trackingMemory();
  const binds = createTenantBind(
    { UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" },
    {
      memory: new Map(),
      remote: {
        async get() { return ""; },
        async setNx() { return "ok"; },
        async expire() { return true; },
        async compareAndDelete() { return true; },
      },
    },
  );
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({
      RECALL_WEBHOOK_SECRET: RECALL_SECRET,
      UPSTASH_REDIS_REST_URL: "https://x",
      UPSTASH_REDIS_REST_TOKEN: "t",
    }),
    identity: identityFor([{ id: TENANT_A }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const payload = JSON.stringify({
    event: "transcript.data",
    data: {
      bot: { id: "bot-early-1" },
      transcript: { id: "tr-early" },
      data: {
        participant: { id: "mina", name: "Mina" },
        words: [{ text: "Adam," }, { text: "early" }, { text: "callback" }, { text: "should" }, { text: "retry." }],
      },
    },
  });
  const early = await call(port, "POST", "/api/recall", payload, signRecall(payload));
  assert.equal(early.status, 503);
  assert.equal(memory.remembered.length, 0);
});

test("oauth connector and MCP space follow membership, not restored session.tenantId", async (t) => {
  const northlineForms = formsConnector("Northline Forms");
  const personalForms = formsConnector("Personal Forms");
  const foreignForms = formsConnector("Foreign Forms");
  const store = fakeConnectors({
    [NORTHLINE]: [northlineForms],
    [PERSONAL]: [personalForms],
    [TENANT_C]: [foreignForms],
  });
  const memberIdentity = identityFor([
    { id: PERSONAL, name: "Personal", kind: "personal" },
    { id: NORTHLINE, name: "Northline", kind: "company" },
  ]);
  const personalOnly = identityFor([
    { id: PERSONAL, name: "Personal", kind: "personal" },
  ]);
  const failingIdentity = {
    async myTenants() { throw new Error("spaces down"); },
    async getUser() { return { user_metadata: {} }; },
    async updateUser() {},
  };

  async function listedConnectors(port, cookie) {
    return call(port, "GET", "/console/connectors", null, {
      cookie,
      accept: "application/json",
    });
  }

  async function listedMcpTools(port, cookie) {
    const res = await call(port, "POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { cookie });
    return (res.json?.result?.tools || []).map((tool) => tool.name);
  }

  await t.test("restored personal tenantId still lists Northline Forms and MCP space", async () => {
    const app = createApp({
      companyLoaded: true,
      env: identityEnv(),
      identity: memberIdentity,
      connectors: store,
      deps: emptyDeps(),
    });
    const port = await listen(app);
    t.after(() => app.close());
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const listed = await listedConnectors(port, cookie);
    assert.equal(listed.status, 200);
    assert.deepEqual((listed.json?.connectors || []).map((row) => row.name), ["Northline Forms"]);
    const tools = await listedMcpTools(port, cookie);
    assert.equal(tools.includes("google-forms__get_form"), true);
    const gate = { session: { kind: "oauth", provider: "google", tenantId: PERSONAL, accessToken: "access-a" }, required: true };
    assert.equal(await resolveMcpSpace(gate, memberIdentity, store), NORTHLINE);
  });

  await t.test("foreign session tenantId resolves to the authorized company, never the foreign space", async () => {
    const app = createApp({
      companyLoaded: true,
      env: identityEnv(),
      identity: memberIdentity,
      connectors: store,
      deps: emptyDeps(),
    });
    const port = await listen(app);
    t.after(() => app.close());
    const cookie = oauthCookie({ tenantId: TENANT_C });
    const listed = await listedConnectors(port, cookie);
    assert.equal(listed.status, 200);
    const names = (listed.json?.connectors || []).map((row) => row.name);
    assert.deepEqual(names, ["Northline Forms"]);
    assert.equal(names.includes("Foreign Forms"), false);
    const tools = await listedMcpTools(port, cookie);
    assert.equal(tools.includes("google-forms__get_form"), true);
    const gate = { session: { kind: "oauth", provider: "google", tenantId: TENANT_C, accessToken: "access-a" }, required: true };
    assert.equal(await resolveMcpSpace(gate, memberIdentity, store), NORTHLINE);
  });

  await t.test("myTenants failure fails closed with 409 and no MCP leak", async () => {
    const app = createApp({
      companyLoaded: true,
      env: identityEnv(),
      identity: failingIdentity,
      connectors: store,
      deps: emptyDeps(),
    });
    const port = await listen(app);
    t.after(() => app.close());
    const cookie = oauthCookie({ tenantId: TENANT_C });
    const listed = await listedConnectors(port, cookie);
    assert.equal(listed.status, 409);
    assert.equal(listed.json?.ok, false);
    const tools = await listedMcpTools(port, cookie);
    assert.equal(tools.includes("google-forms__get_form"), false);
    const gate = { session: { kind: "oauth", provider: "google", tenantId: TENANT_C, accessToken: "access-a" }, required: true };
    assert.equal(await resolveMcpSpace(gate, failingIdentity, store), "");
  });

  await t.test("personal-only user still resolves the personal space", async () => {
    const app = createApp({
      companyLoaded: true,
      env: identityEnv(),
      identity: personalOnly,
      connectors: store,
      deps: emptyDeps(),
    });
    const port = await listen(app);
    t.after(() => app.close());
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const listed = await listedConnectors(port, cookie);
    assert.equal(listed.status, 200);
    assert.deepEqual((listed.json?.connectors || []).map((row) => row.name), ["Personal Forms"]);
    const gate = { session: { kind: "oauth", provider: "google", tenantId: PERSONAL, accessToken: "access-a" }, required: true };
    assert.equal(await resolveMcpSpace(gate, personalOnly, store), PERSONAL);
  });

  await t.test("passphrase sessions keep session.tenantId and soleTenantId stays non-oauth", async () => {
    const sole = fakeConnectors({ [NORTHLINE]: [northlineForms] });
    assert.equal(await resolveMcpSpace({
      session: { tenantId: PERSONAL, memberId: "mina" },
      required: true,
    }, memberIdentity, store), PERSONAL);
    assert.equal(await resolveMcpSpace({ session: {}, required: false }, null, store), "local");
    assert.equal(await resolveMcpSpace({ session: {}, required: true }, null, sole), NORTHLINE);
    assert.equal(await resolveMcpSpace({
      session: { kind: "oauth", provider: "google", tenantId: PERSONAL, accessToken: "access-a" },
      required: true,
    }, failingIdentity, sole), "");
  });
});

test("oauth Slack Connected follows the claimed active tenant", async (t) => {
  const membership = [
    { id: PERSONAL, name: "Personal", kind: "personal" },
    { id: NORTHLINE, name: "Northline", kind: "company" },
  ];
  const slackEnv = {
    SLACK_SIGNING_SECRET: SLACK_SECRET,
    SLACK_BOT_TOKEN: "xoxb-test",
  };

  async function slackApp({ claimedBy = "", extraEnv = {}, identity = identityFor(membership) } = {}) {
    const binds = createTenantBind({}, { memory: new Map() });
    const slack = slackAuth();
    if (claimedBy) {
      const claimed = await claimWorkspaceSlack({ tenantBind: binds, slack }, claimedBy);
      assert.equal(claimed.ok, true);
    }
    const app = createApp({
      companyLoaded: true,
      env: identityEnv({ ...slackEnv, ...extraEnv }),
      identity,
      tenantBind: binds,
      deps: emptyDeps({ slack }),
    });
    const port = await listen(app);
    t.after(() => app.close());
    return port;
  }

  await t.test("env-ready and unclaimed Setup SSR is Not connected and payload slack is not ready", async () => {
    const port = await slackApp();
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const page = await call(port, "GET", "/console/setup", null, { cookie });
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="slack-conn" class="conn-state off">Not connected/);
    const payload = await call(port, "GET", "/api/console", null, { cookie });
    assert.equal(payload.status, 200);
    assert.notEqual(payload.json?.slack, "ready");
    assert.equal(payload.json?.doors?.slack, false);
  });

  await t.test("claimed for the active tenant shows Connected and ready", async () => {
    const port = await slackApp({ claimedBy: NORTHLINE });
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const page = await call(port, "GET", "/console/setup", null, { cookie });
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="slack-conn" class="conn-state">Connected/);
    const payload = await call(port, "GET", "/api/console", null, { cookie });
    assert.equal(payload.json?.slack, "ready");
    assert.equal(payload.json?.doors?.slack, true);
  });

  await t.test("claimed by another tenant stays Not connected", async () => {
    const port = await slackApp({ claimedBy: TENANT_B });
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const page = await call(port, "GET", "/console/setup", null, { cookie });
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="slack-conn" class="conn-state off">Not connected/);
    const payload = await call(port, "GET", "/api/console", null, { cookie });
    assert.notEqual(payload.json?.slack, "ready");
    assert.equal(payload.json?.doors?.slack, false);
  });

  await t.test("company query does not override the authorized active tenant for Slack", async () => {
    const identity = identityFor([
      ...membership,
      { id: TENANT_B, name: "Zebra", kind: "company" },
    ]);
    const port = await slackApp({ claimedBy: TENANT_B, identity });
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const payload = await call(port, "GET", `/api/console?company=${TENANT_B}`, null, { cookie });
    assert.equal(payload.status, 200);
    assert.notEqual(payload.json?.slack, "ready");
  });

  await t.test("no active tenant fails Slack closed", async () => {
    const port = await slackApp({ identity: identityFor([]) });
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const page = await call(port, "GET", "/console/setup", null, { cookie });
    assert.match(page.raw, /id="slack-conn" class="conn-state off">Not connected/);
    const payload = await call(port, "GET", "/api/console", null, { cookie });
    assert.notEqual(payload.json?.slack, "ready");
  });

  await t.test("SEDERUNT_TOOLS_FAKE keeps the env Slack door without a claim", async () => {
    const port = await slackApp({ extraEnv: { SEDERUNT_TOOLS_FAKE: "1" } });
    const cookie = oauthCookie({ tenantId: PERSONAL });
    const page = await call(port, "GET", "/console/setup", null, { cookie });
    assert.match(page.raw, /id="slack-conn" class="conn-state">Connected/);
    const payload = await call(port, "GET", "/api/console", null, { cookie });
    assert.equal(payload.json?.slack, "ready");
  });
});

test("passphrase Setup still SSRs Slack Connected from env doors", async (t) => {
  const app = createApp({
    companyLoaded: true,
    env: {
      SEDERUNT_MEMBER: "mina",
      SLACK_SIGNING_SECRET: SLACK_SECRET,
      SLACK_BOT_TOKEN: "xoxb-test",
    },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const page = await call(port, "GET", "/console/setup");
  assert.equal(page.status, 200);
  assert.match(page.raw, /id="slack-conn" class="conn-state">Connected/);
});

test("hearing and bot saves share the owner gate and do not mutate on 401 or 403", async (t) => {
  const store = createMemoryPreferenceStore();
  const memory = trackingMemory();
  const byToken = {
    "access-owner": [{ id: TENANT_A, name: "A", kind: "company", role: "owner" }],
    "access-admin": [{ id: TENANT_A, name: "A", kind: "company", role: "admin" }],
    "access-member": [{ id: TENANT_A, name: "A", kind: "company", role: "member" }],
    "access-outsider": [],
  };
  const app = createApp({
    companyLoaded: true,
    env: identityEnv(),
    identity: {
      async myTenants(token) {
        return (byToken[token] || []).map((row) => ({ ...row }));
      },
      async getUser() { return { user_metadata: {} }; },
      async profile() { return null; },
      async updateUser() {},
    },
    botPreferences: store,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  async function snap() {
    return {
      tenant: JSON.stringify(await store.list({ tenantId: TENANT_A })),
      local: JSON.stringify(await store.list({ tenantId: "local" })),
      remembered: memory.remembered.length,
    };
  }

  const before = await snap();
  const denied = [
    ["/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, undefined, 401],
    ["/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, undefined, 401],
    ["/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, oauthCookie({ accessToken: "access-member", tenantId: TENANT_A, userId: "user-member" }), 403],
    ["/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, oauthCookie({ accessToken: "access-member", tenantId: TENANT_A, userId: "user-member" }), 403],
    ["/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, oauthCookie({ accessToken: "access-outsider", tenantId: TENANT_A, userId: "user-out" }), 403],
    ["/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, oauthCookie({ accessToken: "access-outsider", tenantId: TENANT_A, userId: "user-out" }), 403],
  ];
  for (const [path, body, cookie, status] of denied) {
    const response = await call(port, "POST", path, body, cookie ? { cookie } : {});
    assert.equal(response.status, status, path);
    assert.equal(response.json?.ok, false);
    assert.deepEqual(await snap(), before);
  }

  const adminHearing = await call(port, "POST", "/api/hearing", { name: "Nia", triggers: "Hey Nia" }, {
    cookie: oauthCookie({ accessToken: "access-admin", tenantId: TENANT_A, userId: "user-admin" }),
  });
  assert.equal(adminHearing.status, 200, adminHearing.raw?.slice?.(0, 180));
  assert.equal(adminHearing.json?.hearing?.name, "Nia");
  const adminBot = await call(port, "POST", "/api/bot", { name: "Nia", phrases: ["Hey Nia", "Nia"] }, {
    cookie: oauthCookie({ accessToken: "access-admin", tenantId: TENANT_A, userId: "user-admin" }),
  });
  assert.equal(adminBot.status, 200, adminBot.raw);
  assert.equal(adminBot.json?.name, "Nia");
  const ownerHearing = await call(port, "POST", "/api/hearing", { name: "Quinn", triggers: "red cedar" }, {
    cookie: oauthCookie({ accessToken: "access-owner", tenantId: TENANT_A, userId: "user-owner" }),
  });
  assert.equal(ownerHearing.status, 200);
  assert.equal(ownerHearing.json?.hearing?.name, "Quinn");
  assert.ok(memory.remembered.some((item) => item.kind === "hearing"));
  const written = await snap();
  assert.notEqual(written.tenant, before.tenant);
  assert.equal(written.local, before.local);

  const memberHearing = await call(port, "POST", "/api/hearing", { name: "Zoe", triggers: "Hey Zoe" }, {
    cookie: oauthCookie({ accessToken: "access-member", tenantId: TENANT_A, userId: "user-member" }),
  });
  const memberBot = await call(port, "POST", "/api/bot", { name: "Zoe", phrases: ["Hey Zoe", "Zoe"] }, {
    cookie: oauthCookie({ accessToken: "access-member", tenantId: TENANT_A, userId: "user-member" }),
  });
  assert.equal(memberHearing.status, 403);
  assert.equal(memberBot.status, 403);
  assert.deepEqual(await snap(), written);
});

test("calendar status on Home/welcome/Setup follows the person grant; Connect goes to Google OAuth", async (t) => {
  const { CALENDAR_CONNECT_PATH } = await import("../src/connectors/calendar-preset.js");
  const { CALENDAR_WELCOME_CONNECT_PATH } = await import("../src/console-flow.js");
  assert.equal(CALENDAR_WELCOME_CONNECT_PATH, "/console/auth/google?intent=calendar&next=%2Fconsole%2Fwelcome%3Fstep%3Dcalendar");
  const env = identityEnv({
    SEDERUNT_CALENDAR_FAKE: "0",
    CALENDAR_MCP_TOKEN: "ya29.env-must-not-use",
    CALENDAR_OAUTH_REFRESH_TOKEN: "rt-env-must-not-use",
  });
  async function appWith(scopes) {
    const grants = createPersonGoogleStore({
      env: grantEnv(),
      grantRows: createGrantRows(),
      fetchImpl: async () => ({ ok: true, status: 200, async json() { return { access_token: "ya29.x", expires_in: 3600 }; } }),
    });
    if (scopes) {
      await grants.save("user-a", { refreshToken: "rt", accessToken: "ya29.x", expiresAt: Date.now() + 60_000, scopes }, { tenantId: TENANT_A });
    }
    const app = createApp({
      companyLoaded: true,
      env,
      identity: identityFor([{ id: TENANT_A, role: "owner" }]),
      googleGrants: grants,
      deps: {
        memory: trackingMemory(),
        tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
        calendar: { async listUpcoming() { return []; }, async readDay() { return { day: "friday", events: [] }; } },
      },
      fetch: async () => ({ ok: true, status: 200, async text() { return "{}"; }, async json() { return {}; } }),
    });
    const port = await listen(app);
    t.after(() => app.close());
    return port;
  }
  const cookie = oauthCookie({ tenantId: TENANT_A, userId: "user-a" });
  async function statuses(port) {
    const setup = await call(port, "GET", "/console/setup", null, { cookie });
    const home = await call(port, "GET", "/console", null, { cookie });
    const welcome = await call(port, "GET", "/console/welcome?step=calendar", null, { cookie });
    return {
      setup: /id="cal-conn" class="conn-state">Connected/.test(setup.raw),
      setupOff: /id="cal-conn" class="conn-state off">Not connected/.test(setup.raw),
      setupScript: setup.raw.includes(JSON.stringify(CALENDAR_CONNECT_PATH)),
      home: home.status === 200 && /id="cal-conn" class="conn-state">Connected/.test(home.raw),
      welcome: /id="calendar-status">[\s\S]{0,400}?Connected</.test(welcome.raw) && !/id="calendar-status">Not connected/.test(welcome.raw),
      welcomeStatus: welcome.status,
    };
  }

  // Fresh owner, deployment calendar tokens set, no person grant: Not connected everywhere.
  const none = await appWith(null);
  const off = await statuses(none);
  assert.equal(off.setup, false);
  assert.equal(off.setupOff, true);
  assert.equal(off.setupScript, true);
  assert.equal(off.home, false);
  assert.equal(off.welcome, false);
  const connect = await call(none, "POST", "/console/welcome", "action=calendar&choice=connect", {
    cookie,
    "content-type": "application/x-www-form-urlencoded",
  });
  assert.equal(connect.status, 302);
  assert.equal(connect.location, CALENDAR_WELCOME_CONNECT_PATH);
  // Same verified Google route as the Connectors preset, only the safe console return differs.
  assert.equal(CALENDAR_WELCOME_CONNECT_PATH.split("&next=")[0], CALENDAR_CONNECT_PATH.split("&next=")[0]);
  const oauth = await call(none, "GET", CALENDAR_WELCOME_CONNECT_PATH, null, { cookie });
  assert.notEqual(oauth.status, 404);

  // Full calendar grant: Connected everywhere.
  const on = await statuses(await appWith([...CALENDAR_SCOPES]));
  assert.equal(on.setup, true);
  assert.equal(on.home, true);
  assert.equal(on.welcome, true);

  // Forms-only (partial / declined calendar): Not connected.
  const forms = await statuses(await appWith([...FORMS_SCOPES]));
  assert.equal(forms.setup, false);
  assert.equal(forms.home, false);
  assert.equal(forms.welcome, false);
});
