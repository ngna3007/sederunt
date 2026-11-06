import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { askBackend, createAskStore, quotaDay, settledStatus } from "../src/ask/store.js";
import { ASK_UNAVAILABLE, NOTHING, askFallbackText, askSpendsQuota, askSystemPrompt, groundedAskAnswer, runAsk } from "../src/ask/run.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "ask-stream-secret";
const NOON_SAIGON = Date.parse("2026-11-05T05:00:00Z");

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function cookie(memberId = "rowan") {
  const token = sealSession({ memberId, name: memberId, exp: Date.now() + 60_000 }, SECRET);
  return sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
}

function seeded() {
  const session = createSession();
  session.rooms.push({ id: "booth", name: "Booth planning", platform: "Google Meet" });
  session.decisions.push({
    id: "decision-booth",
    account: "company",
    kind: "decision",
    text: "The booth opens at nine.",
    speakerMemberId: "rowan",
    inviteMemberIds: ["rowan", "mina"],
    roomId: "booth",
    spokenAt: "2026-11-03T02:00:00.000Z",
    contradicts: [],
    fileNames: [],
  });
  return session;
}

/** An OpenRouter stand-in that streams SSE deltas and records the order of calls. */
function sseFetch(order, deltas, { delayMs = 0 } = {}) {
  return async (url, init) => {
    order.push(["generate", String(url), JSON.parse(init.body)]);
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        for (const delta of deltas) {
          if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}

function appFor({ env = {}, order = [], deltas = ["The booth ", "opens at ", "nine."], delayMs = 0, askStore } = {}) {
  return createApp({
    session: seeded(),
    companyLoaded: true,
    askStore,
    openrouterFetch: sseFetch(order, deltas, { delayMs }),
    deps: {
      memory: {
        async remember() { return { blobId: null }; },
        async recall(query) {
          order.push(["recall", query]);
          return [{ text: "The booth opens at nine.", score: 0.9 }];
        },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null }; } },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "rowan",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
      ...env,
    },
  });
}

async function ask(port, text, who = "rowan") {
  const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie(who) },
    body: JSON.stringify({ text }),
  });
  return { status: response.status, body: await response.json() };
}

/** Read an SSE response to its end and return the events. */
async function readStream(port, id, from = 0, who = "rowan") {
  const response = await fetch(`http://127.0.0.1:${port}/api/ask/${id}/stream?from=${from}`, { headers: { cookie: cookie(who) } });
  if (response.status !== 200) return { status: response.status, events: [] };
  const raw = await response.text();
  const events = raw.split("\n\n").filter((block) => block.startsWith("event:")).map((block) => {
    const [head, data] = block.split("\n");
    return { event: head.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return { status: 200, events };
}

test("quota day follows Asia/Saigon and resets at local midnight", () => {
  const late = quotaDay({}, Date.parse("2026-11-05T16:59:00Z"));
  assert.equal(late.day, "2026-11-05");
  assert.equal(late.secondsLeft, 60);
  assert.equal(late.resetAt, "2026-11-05T17:00:00.000Z");
  assert.equal(quotaDay({}, Date.parse("2026-11-05T17:00:00Z")).day, "2026-11-06");
  assert.equal(quotaDay({ ASK_QUOTA_TIMEZONE: "UTC" }, Date.parse("2026-11-05T17:00:00Z")).day, "2026-11-05");
});

test("backend choice: Upstash REST first, then REDIS_URL, else memory", () => {
  assert.equal(askBackend({}), "memory");
  assert.equal(askBackend({ REDIS_URL: "redis://x" }), "redis");
  assert.equal(askBackend({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t", REDIS_URL: "redis://x" }), "rest");
  assert.equal(askBackend({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" }), "rest");
});

test("memory store: 5 prompts a day per user, next day resets, users are separate", async () => {
  let now = NOON_SAIGON;
  const store = createAskStore({}, { now: () => now });
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push((await store.claim("rowan", 5)).ok);
  assert.deepEqual(results, [true, true, true, true, true, false]);
  assert.equal((await store.quota("rowan", 5)).remaining, 0);
  assert.equal((await store.claim("mina", 5)).remaining, 4);
  now += 24 * 3600 * 1000;
  assert.equal((await store.quota("rowan", 5)).remaining, 5);
});

test("Upstash REST store sends Bearer commands with a dated quota key", async () => {
  const calls = [];
  const data = new Map();
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
    const out = JSON.parse(init.body).map(([name, key, ...rest]) => {
      if (name === "INCR") { data.set(key, (Number(data.get(key)) || 0) + 1); return { result: data.get(key) }; }
      if (name === "DECR") { data.set(key, (Number(data.get(key)) || 0) - 1); return { result: data.get(key) }; }
      if (name === "GET") return { result: data.has(key) ? String(data.get(key)) : null };
      return { result: rest.length ? 1 : 0 };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  };
  const store = createAskStore({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "tok" }, { fetchImpl, now: () => NOON_SAIGON });
  assert.equal(store.kind, "rest");
  for (let i = 0; i < 5; i += 1) assert.equal((await store.claim("rowan", 5)).ok, true);
  assert.equal((await store.claim("rowan", 5)).ok, false);
  assert.equal((await store.quota("rowan", 5)).remaining, 0);
  assert.equal(calls[0].url, "https://example.upstash.io/multi-exec");
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(calls[0].body[0], ["INCR", "sederunt:ask:quota:rowan:2026-11-05"]);
  assert.equal(calls[0].body[1][0], "EXPIRE");
  assert.ok(Number(calls[0].body[1][2]) > 12 * 3600);
});

test("one prompt increments the quota key once and overview reads that same key", async () => {
  const calls = [];
  const data = new Map();
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const out = body.map(([name, key]) => {
      if (name === "INCR") { data.set(key, (Number(data.get(key)) || 0) + 1); return { result: data.get(key) }; }
      if (name === "GET") return { result: data.has(key) ? String(data.get(key)) : null };
      return { result: 1 };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  };
  const store = createAskStore({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "tok" }, { fetchImpl, now: () => NOON_SAIGON });
  const claimed = await store.claim("qa-user", 5);
  const view = await store.overview("qa-user", 5);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.remaining, 4);
  assert.equal(view.quota.used, 1);
  assert.equal(view.quota.remaining, 4);
  const incrs = calls.filter((body) => body[0][0] === "INCR");
  const gets = calls.filter((body) => body[0][0] === "GET");
  assert.equal(incrs.length, 1);
  assert.equal(gets.length, 1);
  assert.equal(incrs[0][0][1], "sederunt:ask:quota:qa-user:2026-11-05");
  assert.equal(gets[0][0][1], incrs[0][0][1]);
});

test("ask system prompt answers what Sederunt is from product knowledge when memory is empty", () => {
  const prompt = askSystemPrompt([], "Sederunt");
  assert.match(prompt, /Memory recall ran before this reply/);
  assert.match(prompt, /Built-in product knowledge/);
  assert.match(prompt, /what Sederunt is or how Sederunt works/);
  assert.match(prompt, /Sederunt joins a channel or a meeting, keeps what was decided, and answers later from that record/);
  assert.match(prompt, /even when no memory applies/);
  assert.match(prompt, /Do not answer a product question with the empty-memory sentence/);
  assert.match(prompt, /Do not invent decisions, dates, owners, or numbers/);
  assert.match(prompt, /Only if none of the memories below apply/);
  assert.match(prompt, new RegExp(NOTHING.replace(/[.]/g, "\\.")));
  assert.match(prompt, /Memories:\n\(none\)/);
  assert.doesNotMatch(prompt, /Answer only from the memories below/);
  assert.doesNotMatch(prompt, /If nothing below applies/);
});

test("ask system prompt still cites a kept decision and forbids inventing one", () => {
  const prompt = askSystemPrompt([{
    text: "The booth opens at nine.",
    speaker: "rowan",
    spokenAt: "2026-11-03T02:00:00.000Z",
    roomId: "booth",
  }], "");
  assert.match(prompt, /1\. The booth opens at nine\./);
  assert.match(prompt, /Do not invent decisions, dates, owners, or numbers/);
  assert.match(prompt, /Only if none of the memories below apply/);
  assert.doesNotMatch(prompt, /\(none\)/);
});

test("ask fallback text is a sentence, never protocol keys", () => {
  assert.equal(askFallbackText("What is Sederunt in one sentence?", {
    body: "missing-member\nrecorded\npreference ask",
  }), ASK_UNAVAILABLE);
  assert.equal(askFallbackText("When does the booth open?", {
    body: "The booth opens at nine.\nrecorded\npreference ask",
  }), "The booth opens at nine.");
  assert.doesNotMatch(ASK_UNAVAILABLE, /missing-member|recorded|preference/);
});

function redisUp(port = 6390) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.end(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

test("Redis store keeps chunks resumable from an index", { skip: !(await redisUp()) && "no local Redis on 6390" }, async () => {
  const store = createAskStore({ REDIS_URL: "redis://127.0.0.1:6390", ASK_REDIS_PREFIX: `test:${Date.now()}`, ASK_TTL_SECONDS: "60" });
  assert.equal(store.kind, "redis");
  const id = await store.create("rowan", "When does the booth open?");
  await store.append(id, "The booth ");
  await store.append(id, "opens at nine.");
  assert.deepEqual(await store.chunks(id, 1), ["opens at nine."]);
  assert.equal(settledStatus(await store.meta(id)), "streaming");
  await store.finish(id, { source: "openrouter", sources: [{ text: "x" }] });
  const meta = await store.meta(id);
  assert.equal(meta.status, "done");
  assert.deepEqual(meta.sources, [{ text: "x" }]);
  for (let i = 0; i < 5; i += 1) assert.equal((await store.claim("rowan", 5)).ok, true);
  assert.equal((await store.claim("rowan", 5)).ok, false);
  await store.close();
});

test("a stream left mid-answer by a dead process reads as stopped", () => {
  const now = Date.now();
  assert.equal(settledStatus({ status: "streaming", updatedAt: now - 1000 }, now), "streaming");
  assert.equal(settledStatus({ status: "streaming", updatedAt: now - 120_000 }, now), "stopped");
  assert.equal(settledStatus(null), "missing");
});

test("runAsk sends product knowledge for an empty workspace and keeps the model sentence", async () => {
  const order = [];
  const store = createAskStore({});
  const question = "What is Sederunt in one sentence?";
  const sentence = "Sederunt joins a meeting, keeps what was decided, and answers later from that record.";
  const id = await store.create("rowan", question);
  await runAsk({
    store,
    id,
    question,
    visible: [],
    recall: async (query) => { order.push(["recall", query]); return []; },
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: sseFetch(order, [sentence]),
  });
  assert.deepEqual(order.map((row) => row[0]), ["recall", "generate"]);
  const system = order[1][2].messages[0].content;
  assert.match(system, /what Sederunt is or how Sederunt works/);
  assert.match(system, /\(none\)/);
  assert.doesNotMatch(system, /If nothing below applies/);
  assert.equal(order[1][2].model, "google/gemma-4-31b-it:free");
  assert.equal((await store.chunks(id, 0)).join(""), sentence);
  const meta = await store.meta(id);
  assert.equal(meta.status, "done");
  assert.equal(meta.source, "openrouter");
});

test("runAsk recalls before generating and writes deltas to the store", async () => {
  const order = [];
  const store = createAskStore({});
  const id = await store.create("rowan", "When does the booth open?");
  await runAsk({
    store,
    id,
    question: "When does the booth open?",
    visible: [{ id: "d1", text: "The booth opens at nine.", speaker: "rowan", roomId: "booth", spokenAt: "2026-11-03T02:00:00.000Z" }],
    recall: async (query) => { order.push(["recall", query]); return [{ text: "The booth opens at nine." }]; },
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: sseFetch(order, ["The booth ", "opens at nine."]),
  });
  assert.deepEqual(order.map((row) => row[0]), ["recall", "generate"]);
  const request = order[1][2];
  assert.equal(request.model, "google/gemma-4-31b-it:free");
  assert.equal(request.stream, true);
  assert.ok(request.max_tokens >= 2048);
  assert.equal(request.reasoning, undefined);
  assert.match(request.messages[0].content, /The booth opens at nine\./);
  assert.equal((await store.chunks(id, 0)).join(""), "The booth opens at nine.");
  const meta = await store.meta(id);
  assert.equal(meta.status, "done");
  assert.equal(meta.source, "openrouter");
  assert.equal(meta.sources[0].roomId, "booth");
});

test("POST /api/ask streams, resumes after a reload, lists history, and stops at 5 a day", async () => {
  const order = [];
  const app = appFor({ env: { OPENROUTER_API_KEY: "test-key" }, order, delayMs: 160 });
  const port = await listen(app);
  try {
    const unsigned = await fetch(`http://127.0.0.1:${port}/api/ask`);
    assert.equal(unsigned.status, 401);

    const first = await ask(port, "When does the booth open?");
    assert.equal(first.status, 200);
    assert.ok(first.body.id);
    assert.equal(first.body.limit, 5);
    assert.equal(first.body.remaining, 4);

    const live = await readStream(port, first.body.id, 0);
    const chunks = live.events.filter((row) => row.event === "chunk");
    assert.ok(chunks.length >= 2, "the answer arrives in more than one piece");
    assert.equal(chunks.map((row) => row.data.t).join(""), "The booth opens at nine.");
    const done = live.events.at(-1);
    assert.equal(done.event, "done");
    assert.equal(done.data.status, "done");
    assert.equal(done.data.source, "openrouter");
    assert.equal(done.data.quota.used, 1);
    assert.equal(done.data.quota.remaining, 4);
    assert.ok(done.data.sources.length >= 1);

    // A reloaded page that already had chunk 0 asks from 1 and gets only the rest.
    const resumed = await readStream(port, first.body.id, 1);
    const rest = resumed.events.filter((row) => row.event === "chunk");
    assert.equal(rest[0].data.i, 1);
    assert.equal(rest.map((row) => row.data.t).join(""), chunks.slice(1).map((row) => row.data.t).join(""));

    // Someone else cannot read this answer.
    assert.equal((await readStream(port, first.body.id, 0, "mina")).status, 404);

    const history = await fetch(`http://127.0.0.1:${port}/api/ask`, { headers: { cookie: cookie() } }).then((r) => r.json());
    assert.equal(history.remaining, 4);
    assert.equal(history.live, true);
    assert.equal(history.asks.length, 1);
    assert.equal(history.asks[0].text, "The booth opens at nine.");
    assert.equal(history.asks[0].status, "done");

    // Recall ran before the first generate call (withMemWal: recall → inject → generate).
    const firstRecall = order.findIndex((row) => row[0] === "recall");
    const firstGenerate = order.findIndex((row) => row[0] === "generate");
    assert.ok(firstRecall >= 0 && firstGenerate > firstRecall, "recall runs before generate");
    assert.ok(order.some((row) => row[0] === "recall" && row[1] === "When does the booth open?"));

    for (let i = 0; i < 4; i += 1) assert.equal((await ask(port, `Question ${i}?`)).status, 200);
    const blocked = await ask(port, "One more?");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, "limit");
    assert.equal(blocked.body.remaining, 0);
    // Another person still has their own five.
    assert.equal((await ask(port, "When does the booth open?", "mina")).body.remaining, 4);

    const empty = await ask(port, "   ", "mina");
    assert.equal(empty.status, 400);
  } finally {
    app.close();
  }
});

test("ask quota is spent only for a real answer", () => {
  assert.equal(askSpendsQuota("openrouter", "done"), true);
  assert.equal(askSpendsQuota("retrieval", "done"), true);
  assert.equal(askSpendsQuota("unavailable", "done"), false);
  assert.equal(askSpendsQuota("openrouter", "error"), false);
  assert.equal(askSpendsQuota("", "error"), false);
  assert.equal(askSpendsQuota(undefined, "stopped"), false);
});

test("model NOTHING with a recalled keep falls back to that keep and still spends a question", async () => {
  const app = appFor({ env: { OPENROUTER_API_KEY: "test-key" }, deltas: [NOTHING] });
  const port = await listen(app);
  try {
    const first = await ask(port, "When does the booth open?");
    assert.equal(first.status, 200);
    assert.equal(first.body.remaining, 4);
    const streamed = await readStream(port, first.body.id, 0);
    const text = streamed.events.filter((row) => row.event === "chunk").map((row) => row.data.t).join("");
    assert.match(text, /booth opens at nine/i);
    assert.notEqual(text, NOTHING);
    const done = streamed.events.at(-1);
    assert.equal(done.event, "done");
    assert.equal(done.data.source, "retrieval");
    assert.equal(done.data.quota.used, 1);
    assert.equal(done.data.quota.remaining, 4);
  } finally {
    app.close();
  }
});

test("groundedAskAnswer prefers the November launch keep over unlock codes", () => {
  const maple = { text: "remember the launch code is maple47" };
  const cedar = { text: "the booth staging unlock is cedar 92" };
  const gate = { text: "Northline decision — please keep: launch is November 18 if billing is green by November 12; otherwise slip to November 25." };
  const answer = groundedAskAnswer("What's the launch gate for November?", [gate, maple, cedar]);
  assert.match(answer, /November 18/);
  assert.match(answer, /billing/i);
  assert.equal(answer.includes("maple47"), false);
});

test("model NOTHING with no recalled keeps still returns NOTHING and spends a question", async () => {
  const store = createAskStore({});
  await runAsk({
    store,
    id: await store.create("rowan", "What's the launch gate for November?"),
    question: "What's the launch gate for November?",
    visible: [],
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async (_url, init) => {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: NOTHING } }] })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    },
  });
  // find latest id
  const overview = await store.overview("rowan", 5);
  const id = overview.ids[0];
  const chunks = await store.chunks(id);
  assert.equal(chunks.join(""), NOTHING);
  const meta = await store.meta(id);
  assert.equal(meta.source, "openrouter");
});

test("a model reply that is exactly the unavailable sentence refunds the quota", async () => {
  const app = appFor({ env: { OPENROUTER_API_KEY: "test-key" }, deltas: [ASK_UNAVAILABLE] });
  const port = await listen(app);
  try {
    const first = await ask(port, "When does the booth open?");
    assert.equal(first.status, 200);
    assert.equal(first.body.used, 1);
    assert.equal(first.body.remaining, 4);
    const streamed = await readStream(port, first.body.id, 0);
    const text = streamed.events.filter((row) => row.event === "chunk").map((row) => row.data.t).join("");
    assert.equal(text, ASK_UNAVAILABLE);
    const done = streamed.events.at(-1);
    assert.equal(done.data.status, "done");
    assert.equal(done.data.source, "unavailable");
    assert.equal(done.data.quota.used, 0);
    assert.equal(done.data.quota.remaining, 5);
    const again = await fetch(`http://127.0.0.1:${port}/api/ask`, { headers: { cookie: cookie() } }).then((r) => r.json());
    assert.equal(again.used, 0);
    assert.equal(again.remaining, 5);
  } finally {
    app.close();
  }
});

test("a failed model chain stores a friendly answer, not protocol, and refunds the quota", async () => {
  const store = createAskStore({});
  const tried = [];
  const app = createApp({
    session: seeded(),
    companyLoaded: true,
    askStore: store,
    openrouterFetch: async (_url, init) => {
      tried.push(JSON.parse(init.body).model);
      return { ok: false, status: 401, body: null };
    },
    deps: {
      memory: { async remember() { return { blobId: null }; }, async recall() { return []; } },
      tatum: { async getObject() { return { text: "", checkpoint: null }; } },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
      OPENROUTER_API_KEY: "test-key",
    },
  });
  const port = await listen(app);
  try {
    const first = await ask(port, "What is Sederunt in one sentence?");
    assert.equal(first.status, 200);
    assert.equal(first.body.remaining, 4);
    assert.equal(first.body.used, 1);
    const streamed = await readStream(port, first.body.id, 0);
    const text = streamed.events.filter((row) => row.event === "chunk").map((row) => row.data.t).join("");
    assert.equal(text, ASK_UNAVAILABLE);
    assert.doesNotMatch(text, /missing-member|preference ask|\brecorded\b/);
    const done = streamed.events.at(-1);
    assert.equal(done.data.source, "unavailable");
    assert.equal(done.data.result.body, ASK_UNAVAILABLE);
    assert.equal(done.data.quota.used, 0);
    assert.equal(done.data.quota.remaining, 5);
    const again = await fetch(`http://127.0.0.1:${port}/api/ask`, { headers: { cookie: cookie() } }).then((r) => r.json());
    assert.equal(again.used, 0);
    assert.equal(again.remaining, 5);
    assert.equal(tried.length, 3);
    const second = await ask(port, "What is Sederunt in one sentence?");
    assert.equal(second.body.used, 1);
    assert.equal(second.body.remaining, 4);
  } finally {
    app.close();
  }
});

test("GET /console/ask redirects to the chat page", async () => {
  const app = appFor();
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/console/ask`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/console/chat");
  } finally {
    app.close();
  }
});

test("POST /api/ask falls back to the kept-decision answer when no model key is set", async () => {
  const order = [];
  const app = appFor({ order });
  const port = await listen(app);
  try {
    const first = await ask(port, "When does the booth open?");
    assert.equal(first.status, 200);
    assert.equal(first.body.live, false);
    const streamed = await readStream(port, first.body.id, 0);
    const done = streamed.events.at(-1);
    assert.equal(done.event, "done");
    assert.equal(done.data.source, "retrieval");
    assert.ok(done.data.result && typeof done.data.result.body === "string");
    assert.equal(order.some((row) => row[0] === "generate"), false);
  } finally {
    app.close();
  }
});
