import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, sealSession } from "../src/console-auth.js";
import { CALENDAR_SCOPES, FORMS_SCOPES, createPersonGoogleStore } from "../src/connectors/google-person.js";
import { createTenantBind } from "../src/tenant-bind.js";
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
    SLACK_TEAM_ID: "T_AUTHZ",
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
  };
}

function trackingMemory() {
  const remembered = [];
  const docs = [];
  return {
    remembered,
    docs,
    allowUnscoped: false,
    async remember(input) {
      remembered.push(input);
      if (input?.tenantId) {
        docs.push({ ...input, tenantId: input.tenantId, decision: input.decision || { text: input.text, id: `d-${docs.length}` } });
      }
      return { blobId: `blob-${remembered.length}` };
    },
    async index() {
      return docs.map((d) => ({ decision: d.decision || { text: d.text }, tenantId: d.tenantId }));
    },
    async recall() {
      return docs.map((d) => ({ decision: d.decision || { text: d.text }, tenantId: d.tenantId }));
    },
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
        resolve({ status: res.statusCode, raw, json, headers: res.headers });
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
  const shared = new Map();
  const memoryA = trackingMemory();
  const memoryB = trackingMemory();
  const bindA = createTenantBind({}, { memory: shared });
  const bindB = createTenantBind({}, { memory: shared });

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
  assert.equal(memoryB.remembered.some((row) => row.tenantId === TENANT_B), false);
});

test("concurrent consoles cannot reroute Slack callbacks via last-active workspace", async (t) => {
  const shared = new Map();
  const memory = trackingMemory();
  const binds = createTenantBind({}, { memory: shared });
  const app = createApp({
    companyLoaded: true,
    env: identityEnv({ SLACK_SIGNING_SECRET: SLACK_SECRET, SLACK_BOT_TOKEN: "xoxb-test", SLACK_TEAM_ID: "T_SHARED" }),
    identity: identityFor([{ id: TENANT_A }, { id: TENANT_B }]),
    tenantBind: binds,
    deps: {
      memory,
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
      slack: { async postMessage() {}, async members() { return ["U1"]; } },
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  // Console A activates tenant A (binds Slack team → A).
  const a = await call(port, "GET", `/api/console?company=${TENANT_A}`, null, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  });
  assert.equal(a.status, 200);
  assert.equal(await binds.resolve("slack", "T_SHARED"), TENANT_A);

  // Console B activates tenant B — must rebind team to B (durable), not leave a racey process global.
  const b = await call(port, "GET", `/api/console?company=${TENANT_B}`, null, {
    cookie: oauthCookie({ userId: "user-b", tenantId: TENANT_B, accessToken: "access-b" }),
  });
  assert.equal(b.status, 200);
  assert.equal(await binds.resolve("slack", "T_SHARED"), TENANT_B);

  // A concurrent console A read must not resurrect process-global last-active for callbacks.
  await call(port, "GET", `/api/console?company=${TENANT_A}`, null, {
    cookie: oauthCookie({ tenantId: TENANT_A }),
  });
  // Last console bind wins for the team key (durable). Callbacks follow bind, not "last read".
  assert.equal(await binds.resolve("slack", "T_SHARED"), TENANT_A);

  const payload = JSON.stringify({
    type: "event_callback",
    team_id: "T_SHARED",
    event: { type: "message", user: "U1", channel: "C1", text: "Keep after rebind", client_msg_id: "rebind-1" },
  });
  await call(port, "POST", "/api/slack", payload, signSlack(payload));
  assert.equal(memory.remembered.length >= 1, true);
  assert.equal(memory.remembered.at(-1).tenantId, TENANT_A);
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

  const consoleDenied = await call(port, "GET", `/api/console?company=${TENANT_C}`, null, { cookie });
  assert.equal(consoleDenied.status, 403);

  const askDenied = await call(port, "POST", "/api/ask", { text: "what was decided", company: TENANT_C }, {
    cookie,
    "sec-fetch-site": "same-origin",
  });
  assert.equal(askDenied.status, 403);

  const chatDenied = await call(port, "POST", "/api/chat", { text: "what was decided in the booth", company: TENANT_C }, { cookie });
  assert.equal(chatDenied.status, 403);

  const roomDenied = await call(port, "GET", `/api/room?company=${TENANT_C}`, null, { cookie });
  assert.equal(roomDenied.status, 403);

  const hearingDenied = await call(port, "POST", "/api/hearing", { company: TENANT_C, name: "Adam" }, { cookie });
  assert.equal(hearingDenied.status, 403);

  const typedDenied = await call(port, "POST", "/api/typed", {
    text: "hello",
    company: TENANT_C,
    memberId: "mina",
    room: { id: "r1", kind: "meeting", memberIds: ["mina"] },
  }, { cookie });
  assert.equal(typedDenied.status, 403);
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

test("calendar-only grant satisfies calendar predicate; forms-only does not; no env token used", async () => {
  const grants = createPersonGoogleStore({
    env: grantEnv(),
    grantRows: createGrantRows(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return { access_token: "ya29.calendar-only", expires_in: 3600 }; },
    }),
  });

  assert.equal(await grants.save("person-1", {
    refreshToken: "rt-calendar",
    accessToken: "ya29.calendar-only",
    expiresAt: Date.now() + 60_000,
    scopes: [...CALENDAR_SCOPES],
  }, { tenantId: TENANT_A }), true);

  assert.equal(await grants.granted("person-1", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES }), true);
  assert.equal(await grants.granted("person-1", { tenantId: TENANT_A, scopes: FORMS_SCOPES }), false);

  const opened = await grants.openAccess("person-1", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES });
  assert.equal(opened.needsAccess, false);
  assert.equal(opened.accessToken, "ya29.calendar-only");
  assert.equal(JSON.stringify(opened).includes("rt-calendar"), false);

  assert.equal(await grants.save("person-2", {
    refreshToken: "rt-forms",
    accessToken: "ya29.forms-only",
    expiresAt: Date.now() + 60_000,
    scopes: [...FORMS_SCOPES],
  }, { tenantId: TENANT_A }), true);

  assert.equal(await grants.granted("person-2", { tenantId: TENANT_A, scopes: FORMS_SCOPES }), true);
  assert.equal(await grants.granted("person-2", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES }), false);
  const calDenied = await grants.openAccess("person-2", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES });
  assert.equal(calDenied.needsAccess, true);
  assert.equal(calDenied.accessToken, "");
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
  const described = await grants.describe("person-m", { tenantId: TENANT_A, scopes: CALENDAR_SCOPES });
  assert.equal(described.granted, true);
  for (const scope of [...FORMS_SCOPES, ...CALENDAR_SCOPES]) {
    assert.equal(described.scopes.includes(scope), true);
  }
});
