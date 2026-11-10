import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { callTool, dropCachedToolList, listTools, resetConnectorPool, testConnection } from "../src/connectors/client.js";
import { startFakeMcpServer } from "../src/connectors/fake-server.js";
import { callCustomTool, dropExposedTools, listExposedTools } from "../src/connectors/expose.js";
import { meetingTools } from "../src/meeting/agent.js";
import { extractActions } from "../src/meeting/actions.js";
import { meetingMetrics, resetMeetingMetrics } from "../src/meeting/metrics.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { dispatchMcp, mcpToolList } from "../src/mcp.js";
import { openRouterComplete, openRouterSpeechStream, openRouterStream } from "../src/openrouter.js";
import { createSession } from "../src/session.js";
import { createApp } from "../src/server.js";
import { handleUtterance } from "../src/typed-path.js";

const TOKEN = "phase4-demo-token";
const ENV = { SEDERUNT_MCP_FAKE: "1" };
const KEY = "sk-or-v1-phase4-test-key";
const EAR = "ab".repeat(24);
const CHAT_ENV = {
  OPENROUTER_API_KEY: KEY,
  OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
  OPENROUTER_MODEL_FALLBACKS: "openai/gpt-oss-120b,openai/gpt-oss-20b",
};

function hangUntil(signal) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (!signal) return;
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

function room() {
  return {
    id: "room-phase4",
    kind: "meeting",
    source: "meet",
    botPresent: true,
    memberIds: ["rowan", "alex", "mina"],
  };
}

function counts(calls, method) {
  return calls.filter((call) => call.method === method).length;
}

test("one connector connect serves repeated reads and a hang drops that client", { timeout: 20000 }, async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  const tenantId = "33333333-3333-4333-8333-333333333333";
  t.after(async () => {
    dropExposedTools(tenantId);
    dropCachedToolList(`${tenantId}:conn-1`);
    await resetConnectorPool();
    await fake.close();
  });
  const connector = {
    id: "conn-1",
    slug: "demo",
    status: "connected",
    enabled: true,
    url: fake.url,
    hasToken: true,
    authType: "bearer",
    headerName: "Authorization",
    tools: [{
      name: "lookup_customer",
      enabled: true,
      changed: false,
      actionClass: "read",
      description: "Look up a customer by id.",
    }],
  };
  const store = {
    async list() { return [connector]; },
    async openToken() { return { token: TOKEN, headerName: "Authorization" }; },
  };
  const session = createSession();
  const read = () => callCustomTool({
    store,
    tenantId,
    env: ENV,
    session,
    name: "demo__lookup_customer",
    args: { id: "acme" },
  });
  const first = await read();
  const second = await read();
  assert.equal(first.ok, true, first.text || first.code);
  assert.equal(second.ok, true, second.text || second.code);
  assert.equal(JSON.stringify(first).includes(TOKEN), false);
  assert.equal(counts(fake.calls, "initialize"), 1);
  assert.equal(counts(fake.calls, "tools/call"), 2);
  fake.setMode("hang");
  const started = Date.now();
  const hung = await callTool(
    { url: fake.url, token: TOKEN, headerName: "Authorization" },
    "lookup_customer",
    { id: "acme" },
    { env: ENV, timeoutMs: 200, poolKey: `${tenantId}:conn-1` },
  );
  assert.equal(hung.code, "timeout");
  assert.ok(Date.now() - started < 2000);
  fake.setMode("ok");
  const third = await read();
  assert.equal(third.ok, true, third.text || third.code);
  assert.equal(counts(fake.calls, "initialize"), 2);
  assert.equal(counts(fake.calls, "tools/call"), 3);
});

test("a connector change drops the cached tool list and an unchanged list is the same array", async (t) => {
  const tenantId = "44444444-4444-4444-8444-444444444444";
  t.after(() => dropExposedTools(tenantId));
  const tool = {
    name: "lookup_customer",
    enabled: true,
    changed: false,
    description: "Look up a customer by id.",
    actionClass: "read",
  };
  const connector = {
    id: "conn-exposed",
    slug: "demo",
    status: "connected",
    enabled: true,
    tools: [tool],
  };
  const store = { async list() { return [{ ...connector, tools: connector.tools.map((item) => ({ ...item })) }]; } };
  const first = await listExposedTools(store, tenantId);
  const second = await listExposedTools(store, tenantId);
  assert.equal(second, first);
  assert.equal(first.some((item) => item.name === "demo__lookup_customer"), true);
  tool.changed = true;
  const changed = await listExposedTools(store, tenantId);
  assert.notEqual(changed, first);
  assert.equal(changed.some((item) => item.name === "demo__lookup_customer"), false);
  tool.changed = false;
  const restored = await listExposedTools(store, tenantId);
  assert.equal(restored.some((item) => item.name === "demo__lookup_customer"), true);
  const expired = await listExposedTools(store, tenantId, { now: () => Date.now() + (11 * 60 * 1000) });
  assert.notEqual(expired, restored);
  assert.equal(expired.some((item) => item.name === "demo__lookup_customer"), true);
});

test("a remote tool list is reused until the revision or the age changes", async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  const poolKey = "55555555-5555-4555-8555-555555555555:remote";
  const failedKey = "66666666-6666-4666-8666-666666666666:remote";
  t.after(async () => {
    dropCachedToolList(poolKey);
    dropCachedToolList(failedKey);
    await fake.close();
  });
  const base = {
    url: fake.url,
    token: TOKEN,
    headerName: "Authorization",
    env: ENV,
    poolKey,
    timeoutMs: 4000,
  };
  const first = await listTools(base);
  const listed = counts(fake.calls, "tools/list");
  assert.ok(listed >= 2);
  const second = await listTools(base);
  assert.equal(counts(fake.calls, "tools/list"), listed);
  assert.notEqual(second, first);
  assert.deepEqual(second.map((tool) => tool.name), first.map((tool) => tool.name));
  await listTools({ ...base, revision: "next" });
  const revised = counts(fake.calls, "tools/list");
  assert.ok(revised > listed);
  await listTools({ ...base, revision: "next", now: () => Date.now() + (11 * 60 * 1000) });
  assert.ok(counts(fake.calls, "tools/list") > revised);
  const beforeFailure = fake.calls.length;
  await assert.rejects(() => listTools({ ...base, token: "wrong-token", poolKey: failedKey }));
  const afterFailure = fake.calls.length;
  const recovered = await listTools({ ...base, poolKey: failedKey });
  assert.ok(recovered.length >= 4);
  assert.ok(fake.calls.length > afterFailure);
  assert.ok(afterFailure >= beforeFailure);
});

test("recall and act return at most three sourced facts and keep the full record", async () => {
  const session = createSession();
  const here = room();
  const lines = [
    "The booth opens at nine.",
    "The assignment stays with Mina.",
    "The launch date stays Thursday.",
    "The onboarding email goes Friday.",
  ];
  for (const text of lines) {
    await handleUtterance({ text, session, memberId: "rowan", room: here, deliveryId: text }, {});
  }
  const recalled = await dispatchMcp({
    method: "tools/call",
    params: { name: "recall", arguments: { text: "what did we decide", memberId: "rowan", room: here } },
  }, session, {});
  const record = JSON.parse(recalled.content[0].text);
  assert.equal(typeof record.body, "string");
  assert.ok(record.visible.length >= 4);
  assert.equal(recalled.structuredContent.facts.length, 3);
  for (const fact of recalled.structuredContent.facts) {
    assert.equal(typeof fact.text, "string");
    assert.ok(fact.text.length > 0);
    assert.ok(record.visible.some((row) => row.id === fact.sourceId));
  }
  const listed = mcpToolList();
  for (const name of ["recall", "act"]) {
    const tool = listed.find((item) => item.name === name);
    assert.equal(tool.outputSchema.properties.facts.maxItems, 3);
    assert.deepEqual(tool.outputSchema.properties.facts.items.required, ["text", "sourceId"]);
  }
  const voice = await meetingTools({ env: {}, deps: {}, context: { tenantId: "" } });
  assert.match(voice.find((tool) => tool.name === "recall").description, /launch/);
  assert.match(voice.find((tool) => tool.name === "act").description, /approval/);
  let created = 0;
  await handleUtterance({ text: "set linear to ask", session, memberId: "rowan", room: here, deliveryId: "ask-linear" }, {});
  const acted = await dispatchMcp({
    method: "tools/call",
    params: {
      name: "act",
      arguments: { text: "create a Linear issue for the onboarding email", memberId: "rowan", room: here },
    },
  }, session, {
    linear: { async createIssue() { created += 1; return { identifier: "ROW-1", id: "ROW-1" }; } },
  });
  const actRecord = JSON.parse(acted.content[0].text);
  assert.equal(typeof actRecord.body, "string");
  assert.ok(Array.isArray(acted.structuredContent.facts));
  assert.ok(acted.structuredContent.facts.length <= 3);
  assert.equal(created, 0);
});

test("a chat stream stops at its timeout and stays open past four seconds without one", { timeout: 10000 }, async () => {
  const started = Date.now();
  const stopped = await openRouterStream({
    env: CHAT_ENV,
    messages: [{ role: "user", content: "hello" }],
    timeoutMs: 50,
    fetchImpl: (_url, init) => hangUntil(init.signal),
  });
  assert.equal(stopped.used, false);
  assert.ok(Date.now() - started < 1000);

  const caller = new AbortController();
  const callerStarted = Date.now();
  const aborting = openRouterStream({
    env: CHAT_ENV,
    messages: [{ role: "user", content: "hello" }],
    models: ["google/gemma-4-31b-it:free"],
    timeoutMs: 60000,
    signal: caller.signal,
    fetchImpl: (_url, init) => hangUntil(init.signal),
  });
  setTimeout(() => caller.abort(), 40);
  const aborted = await aborting;
  assert.equal(aborted.error, "aborted");
  assert.equal(aborted.used, false);
  assert.ok(Date.now() - callerStarted < 1000);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let sawAbort = false;
  const pending = openRouterStream({
    env: CHAT_ENV,
    models: ["google/gemma-4-31b-it:free"],
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      const fail = () => {
        sawAbort = true;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      };
      if (init.signal?.aborted) {
        fail();
        return;
      }
      init.signal?.addEventListener("abort", fail, { once: true });
      gate.then(() => {
        if (init.signal?.aborted) {
          fail();
          return;
        }
        resolve({
          ok: true,
          status: 200,
          body: (async function* () {
            yield Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: "kept" } }] })}\n\ndata: [DONE]\n\n`);
          })(),
        });
      });
    }),
  });
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 4500));
  assert.equal(settled, false);
  assert.equal(sawAbort, false);
  release();
  const kept = await pending;
  assert.equal(kept.used, true);
  assert.equal(kept.text, "kept");
  assert.equal(sawAbort, false);
});

test("a buffered completion and action extraction stop when their timeouts fire", { timeout: 2000 }, async () => {
  const started = Date.now();
  const completed = await openRouterComplete({
    env: {
      OPENROUTER_API_KEY: KEY,
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
      OPENROUTER_MODEL_FALLBACKS: "google/gemma-4-31b-it:free",
    },
    messages: [{ role: "user", content: "hello" }],
    timeoutMs: 40,
    fetchImpl: (_url, init) => hangUntil(init.signal),
  });
  assert.equal(completed.used, false);
  assert.ok(Date.now() - started < 1000);
  const extracted = await extractActions({
    transcript: "Ship the booth.",
    timeoutMs: 40,
    llm: { complete() { return hangUntil(null); } },
  });
  assert.deepEqual(extracted, { ok: false, errors: ["timeout"], items: [] });
  assert.ok(Date.now() - started < 1000);
});

test("connecting to a server that never answers stops at five seconds", { timeout: 12000 }, async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  t.after(() => fake.close());
  fake.setMode("hang");
  const started = Date.now();
  const hung = await testConnection({
    url: fake.url,
    auth: { token: TOKEN, headerName: "Authorization" },
    env: ENV,
    timeoutMs: 20000,
  });
  const elapsed = Date.now() - started;
  assert.equal(hung.ok, false);
  assert.equal(hung.code, "timeout");
  assert.equal(hung.message, "The server did not answer in time.");
  assert.ok(elapsed >= 4500, String(elapsed));
  assert.ok(elapsed < 9000, String(elapsed));
});

test("an aborted connector call stops without waiting out the tool budget", { timeout: 2000 }, async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  t.after(() => fake.close());
  fake.setMode("hang");
  const controller = new AbortController();
  const started = Date.now();
  const hung = callTool(
    { url: fake.url, token: TOKEN, headerName: "Authorization" },
    "lookup_customer",
    { id: "acme" },
    { env: ENV, timeoutMs: 20000, signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 30);
  const result = await hung;
  assert.equal(result.code, "timeout");
  assert.ok(Date.now() - started < 1000);
});

test("speech falls back when the first byte misses the three second voice budget", { timeout: 8000 }, async () => {
  const models = [];
  const started = Date.now();
  const result = await openRouterSpeechStream({
    env: {
      OPENROUTER_API_KEY: KEY,
      OPENROUTER_TTS_MODEL: "deepgram/aura-2",
      OPENROUTER_TTS_VOICE: "aura-2-thalia-en",
    },
    text: "We will keep Thursday.",
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      models.push({ model: payload.model, at: Date.now() - started });
      if (payload.model === "deepgram/aura-2") return hangUntil(init.signal);
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            let sent = false;
            return {
              async read() {
                if (sent) return { done: true };
                sent = true;
                return { done: false, value: Uint8Array.from([0xff, 0xfb]) };
              },
            };
          },
        },
      };
    },
  });
  assert.deepEqual(models.map((item) => item.model), ["deepgram/aura-2", "mistralai/voxtral-mini-tts-2603"]);
  assert.ok(models[1].at >= 2500, String(models[1].at));
  assert.ok(models[1].at < 4500, String(models[1].at));
  assert.equal(result.used, true);
  assert.equal(result.model, "mistralai/voxtral-mini-tts-2603");
});

test("a recall turn records tool and stage latency without the question or the speaker", async (t) => {
  resetMeetingMetrics();
  t.after(() => resetMeetingMetrics());
  const secret = "vault-code-purple";
  const session = createSession();
  session.decisions.push({
    id: "d-room",
    roomId: "bot-1",
    text: "Launch stays Thursday.",
    inviteMemberIds: ["7"],
    deleted: false,
  });
  const meetingVoice = {};
  const app = createApp({
    session,
    meetingVoice,
    agentSeats: [{ ear: EAR, botId: "bot-1", tenantId: "", roomId: "bot-1", botName: "Adam" }],
    env: { OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: "google/gemma-4-31b-it:free" },
    deps: { memory: null },
    fetch: async (url, init) => {
      const target = String(url);
      if (target.includes("/audio/speech")) {
        return {
          ok: true,
          status: 200,
          body: {
            getReader() {
              let sent = false;
              return {
                async read() {
                  if (sent) return { done: true };
                  sent = true;
                  return { done: false, value: Uint8Array.from([0xff, 0xfb, 0x11]) };
                },
              };
            },
          },
        };
      }
      const payload = JSON.parse(init.body);
      const answering = (payload.messages || []).some((message) => message.role === "tool");
      if (answering) {
        const text = "We will keep Thursday.";
        const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
        return { ok: true, status: 200, body: (async function* () { yield Buffer.from(frame); })() };
      }
      const call = {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call-recall",
              function: { name: "recall", arguments: JSON.stringify({ text: `what did we decide about ${secret}`, memberId: "other-member" }) },
            }],
          },
        }],
      };
      const frame = `data: ${JSON.stringify(call)}\n\ndata: [DONE]\n\n`;
      return { ok: true, status: 200, body: (async function* () { yield Buffer.from(frame); })() };
    },
  });
  noteAgentMember({ meetingVoice }, "bot-1", { participantId: "7", name: "Priya", memberId: "7" });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  t.after(() => new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve()))));
  const page = await call(port, "GET", "/meeting?name=Adam");
  assert.equal(page.status, 200);
  assert.match(page.raw, /playbackAt/);
  const turn = await call(port, "POST", "/api/meeting/agent/turn", {
    headers: { "content-type": "application/json", "x-meeting-ear": EAR },
    body: JSON.stringify({
      text: "Adam, what did we decide?",
      speaker: "Priya",
      participantId: "7",
      tenantId: "other-tenant",
      roomId: "other-room",
      botId: "other-bot",
      memberId: "other-member",
    }),
  });
  assert.equal(turn.status, 200);
  const sentence = turn.raw.split("\n\n").map((block) => block.trim()).filter(Boolean).map((block) => {
    const name = (block.match(/^event: (.+)$/m) || [])[1] || "";
    const data = (block.match(/^data: (.+)$/m) || [])[1] || "";
    return { name, data: data ? JSON.parse(data) : null };
  }).find((event) => event.name === "sentence");
  assert.equal(sentence.data.text, "We will keep Thursday.");
  const audio = await call(port, "POST", "/api/meeting/agent/speak", {
    headers: { "content-type": "application/json", "x-meeting-ear": EAR },
    body: JSON.stringify({ text: sentence.data.text }),
  });
  assert.equal(audio.status, 200);
  assert.equal(audio.raw.includes(KEY), false);
  const metrics = meetingMetrics();
  const recall = metrics.tools.find((row) => row.tool === "recall");
  assert.ok(recall);
  assert.deepEqual(Object.keys(recall).sort(), ["ms", "outcome", "tool"]);
  assert.equal(recall.outcome, "ok");
  assert.equal(metrics.stages.some((row) => row.stage === "first-token" && Number.isFinite(row.ms)), true);
  assert.equal(metrics.stages.some((row) => row.stage === "first-audio" && Number.isFinite(row.ms)), true);
  const dumped = JSON.stringify(metrics);
  assert.equal(dumped.includes(secret), false);
  assert.equal(dumped.includes("Priya"), false);
  assert.equal(dumped.includes(KEY), false);
});

function call(port, method, path, { headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: { ...headers, ...(body ? { "content-length": Buffer.byteLength(body) } : {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
