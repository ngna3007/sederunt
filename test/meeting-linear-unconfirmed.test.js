import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createSession } from "../src/session.js";
import { TITLE_QUESTION } from "../src/meeting/agent.js";
import { noteAgentMember } from "../src/meeting/seat.js";
import { createLinearClient } from "../src/linear/mcp.js";
import { createApp } from "../src/server.js";

// Live retest 3, Nov 11 2026, Recall bot 01ccb144 (Meet qgo-xguf-puz), deployment
// dpl_3H4161mYH7hhXGBPtAjLf1LxCuvr. The title answer reached the voice filing with
// preference "do"; both claims were written (06:56:19.347 and 06:56:19.953 UTC) and
// the Linear save came back without an issue inside about a second. The voice path
// then fell back to a held draft ("I've drafted the Linear issue ...") and awaited
// the hold's Walrus write, so the turn took 24 s.
//
// The rig mirrors that tenant's production setup, read from Supabase (read-only):
// a linear_installations row for workspace "rowan3007", team ROW; no tenant_connectors
// rows; bot_preferences holds only meeting_guest { name "Adam", triggers ["Hey Adam"] };
// action claims are on. Linear is the real MCP client against a fake Linear server.

const EAR = "cd".repeat(24);
const KEY = "sk-or-v1-linear-unconfirmed-key";
const TENANT = "2ecffdbc-314e-4a72-ae26-b73a7b535738";
const BOT = "01ccb144-7136-468e-bbfd-1711e7de6f72";
const TITLE = "Fixed the onboarding email before launch";
const TOKEN = "lin_oauth_test_token_should_never_be_logged_0123456789";

function linearServer(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), "https://mcp.linear.app/mcp");
    const body = JSON.parse(init.body);
    if (body.method === "notifications/initialized") return rpc(null);
    if (body.method === "initialize") return rpc({ jsonrpc: "2.0", id: body.id, result: {} });
    calls.push([body.params.name, body.params.arguments]);
    return rpc({ jsonrpc: "2.0", id: body.id, result: answer(body.params.name, body.params.arguments, calls.length) });
  };
  return { calls, fetchImpl };
}

function rpc(body) {
  return { ok: true, status: 200, headers: { get() { return ""; } }, text: async () => (body ? JSON.stringify(body) : "") };
}

const toolError = (text) => ({ isError: true, content: [{ type: "text", text }] });
const toolJson = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function redisFake(store) {
  return (init) => {
    const command = JSON.parse(init.body);
    const list = Array.isArray(command[0]) ? command : [command];
    const results = [];
    for (const item of list) {
      const [op, key, ...rest] = item;
      let result = "OK";
      if (op === "SET") {
        if (rest.includes("NX") && store.has(key)) result = null;
        else store.set(key, String(rest[0] ?? "1"));
      } else if (op === "GET") result = store.has(key) ? store.get(key) : null;
      else if (op === "DEL") result = store.delete(key) ? 1 : 0;
      results.push(result);
    }
    const payload = Array.isArray(command[0]) ? results.map((result) => ({ result })) : { result: results[0] };
    return { ok: true, json: async () => payload };
  };
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", port, method: "POST", path: "/api/meeting/agent/turn",
      headers: { "content-type": "application/json", "x-meeting-ear": EAR, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sentences(raw) {
  return raw.split("\n\n").filter((block) => block.startsWith("event: sentence"))
    .map((block) => JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || "{}").text);
}

async function answerTitle(answer, { disconnected = false } = {}) {
  const store = new Map();
  const redis = redisFake(store);
  const releases = [];
  const docs = [];
  const logs = [];
  // Walrus Memory writes took 20-30 s each in production. These finish only when released.
  const memory = {
    remember(row) {
      return new Promise((resolve) => releases.push(() => { docs.push(structuredClone(row)); resolve({ blobId: `blob-${docs.length}` }); }));
    },
    async index() { return docs.map((row) => structuredClone(row)); },
  };
  const server = linearServer(answer);
  const linear = createLinearClient(TOKEN, server.fetchImpl, { team: "ROW", workspace: "rowan3007" });

  const claimed = [];
  const actionClaims = { async claim(row) { claimed.push(row); return true; } };
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) return redis(init);
    return { ok: true, status: 200, body: { async *[Symbol.asyncIterator]() { yield Buffer.from("data: [DONE]\n\n"); } } };
  };
  const session = createSession();
  const meetingVoice = {};
  const app = createApp({
    session,
    meetingVoice,
    actionClaims,
    agentSeats: [{ ear: EAR, botId: BOT, tenantId: TENANT, roomId: BOT, botName: "Adam" }],
    env: { OPENROUTER_API_KEY: KEY, UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "redis-token" },
    deps: { memory, linear: disconnected ? { connected: false } : linear, actionClaims, requireActionClaims: true, tenantId: TENANT, log: (row) => logs.push(row) },
    sessions: new Map([[TENANT, session]]),
    fetch: fetchImpl,
  });
  noteAgentMember({ meetingVoice }, BOT, { participantId: "100", name: "Anh Nguyen", memberId: "100" });
  store.set(`sederunt:voice:heard-line:${BOT}`, JSON.stringify({
    text: "Hey Adam, create a task on Linear.", speaker: "Anh Nguyen", turn: "t-q", roomId: BOT,
    assistant: TITLE_QUESTION, hold: null, awaiting: { kind: "title", speaker: "Anh Nguyen", until: Date.now() + 60_000 },
  }));
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const started = Date.now();
    const reply = await Promise.race([
      post(port, JSON.stringify({ text: `${TITLE}.`, speaker: "Anh Nguyen", participantId: "100", turn_id: "t-title", people: ["100"] })),
      new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000)),
    ]);
    const ms = Date.now() - started;
    while (releases.length) releases.shift()();
    await new Promise((resolve) => setImmediate(resolve));
    while (releases.length) releases.shift()();
    await Promise.allSettled([...(app.workspace?.agentRuntime?.background || [])]);
    while (releases.length) releases.shift()();
    return { reply, ms, calls: server.calls, claimed, docs, logs, session };
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
}

test("a Linear save that comes back with no issue is reported, not turned into a draft for approval", async () => {
  const run = await answerTitle(() => toolError("Argument Validation Error"));
  assert.notEqual(run.reply, "TIMEOUT", "the turn waited on the hold's memory write");
  assert.equal(run.ms < 3000, true, String(run.ms));
  const spoken = sentences(run.reply);
  assert.equal(spoken.some((line) => /drafted/i.test(line)), false, spoken.join(" | "));
  assert.deepEqual(spoken, ["The Linear issue did not go through."]);
  // The Linear request did go out, once. As in production: the voice claim, then the connector claim.
  assert.equal(run.calls.filter(([name]) => name === "save_issue").length, 1);
  assert.equal(run.claimed.length, 2);
  const actions = run.docs.filter((row) => row.kind === "action" && row.actionItem?.actionRecord).map((row) => row.actionItem.actionRecord);
  assert.equal(actions.some((row) => row.state === "paused" && row.preference === "ask"), false, "no held draft");
  assert.equal(actions.some((row) => row.state === "outcome_unknown"), true);
});

test("the failed Linear call is logged without the token or the spoken title", async () => {
  const run = await answerTitle(() => toolError(`Could not save '${TITLE}': Bearer ${TOKEN} rejected`));
  const failed = run.logs.filter((row) => row.kind === "connector-failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].tool, "linear");
  assert.equal(failed[0].reason, "rejected");
  const raw = JSON.stringify(failed);
  assert.equal(raw.includes(TOKEN), false);
  assert.equal(raw.toLowerCase().includes("onboarding"), false);
  assert.match(failed[0].message, /rejected/);
});

test("a Linear answer with no issue id is spoken as unconfirmed and keeps the claim", async () => {
  const run = await answerTitle(() => toolJson({ ok: true }));
  assert.notEqual(run.reply, "TIMEOUT");
  assert.deepEqual(sentences(run.reply), ["Linear did not confirm the issue, so please check Linear before asking again."]);
  assert.equal(run.logs.some((row) => row.kind === "connector-failed" && row.reason === "no-id"), true);
});

test("a workspace without the Sederunt project still files into team ROW", async () => {
  const run = await answerTitle((_name, args) => (args.project
    ? toolError("Project not found: Sederunt")
    : toolJson({ id: "6f1c0d1e-0000-4000-8000-000000000001", identifier: "ROW-12", url: "https://linear.app/rowan3007/issue/ROW-12/fixed" })));
  assert.deepEqual(sentences(run.reply), [`I filed the Linear issue '${TITLE}'.`]);
  const saves = run.calls.filter(([name]) => name === "save_issue").map(([, args]) => args);
  assert.equal(saves.length, 2);
  assert.equal(saves[0].project, "Sederunt");
  assert.equal("project" in saves[1], false);
  assert.equal(saves.every((args) => args.team === "ROW" && !("idempotencyKey" in args)), true);
});

test("a save_issue answer in plain text still yields the issue id", async () => {
  const run = await answerTitle(() => ({ content: [{ type: "text", text: "Created issue ROW-13: see https://linear.app/rowan3007/issue/ROW-13/fixed" }] }));
  assert.deepEqual(sentences(run.reply), [`I filed the Linear issue '${TITLE}'.`]);
  const actions = run.docs.filter((row) => row.kind === "action" && row.actionItem?.actionRecord).map((row) => row.actionItem.actionRecord);
  assert.equal(actions.some((row) => row.state === "closed" && row.connectorId === "ROW-13"), true);
});

test("a held draft speaks without waiting on its memory write", async () => {
  const run = await answerTitle(() => toolJson({ identifier: "ROW-14" }), { disconnected: true });
  assert.notEqual(run.reply, "TIMEOUT", "the turn waited on the hold's memory write");
  assert.equal(sentences(run.reply).some((line) => /drafted the Linear issue/i.test(line)), true, sentences(run.reply).join(" | "));
  assert.equal(run.calls.length, 0);
  const actions = run.docs.filter((row) => row.kind === "action" && row.actionItem?.actionRecord).map((row) => row.actionItem.actionRecord);
  assert.equal(actions.some((row) => row.state === "paused"), true, "the hold was still saved");
});
