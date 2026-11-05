import assert from "node:assert/strict";
import test from "node:test";
import { OPENROUTER_OUTPUT_TOKENS, openRouterComplete, openRouterConfig, openRouterModels, openRouterStream, textFromContent } from "../src/openrouter.js";
import { answerSlackQuestion, mergeSemanticVisible, recallVisibleForAsk, slackAnswer } from "../src/slack/reply.js";

const FACTS = [
  { text: "the booth opens at nine", fileName: null, connectorId: "ROW-69" },
];

test("openRouterConfig defaults model and requires a key", () => {
  assert.equal(openRouterConfig({}).enabled, false);
  assert.equal(openRouterConfig({}).model, "google/gemma-4-31b-it:free");
  assert.deepEqual(openRouterModels({}), [
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ]);
  assert.equal(openRouterConfig({ OPENROUTER_API_KEY: " sk-or-test " }).enabled, true);
  assert.equal(
    openRouterConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "openai/gpt-oss-120b" }).model,
    "openai/gpt-oss-120b",
  );
  assert.deepEqual(
    openRouterModels({ OPENROUTER_MODEL: "openai/gpt-oss-120b" }),
    ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  );
  assert.deepEqual(
    openRouterModels({
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
      OPENROUTER_MODEL_FALLBACKS: "openai/gpt-oss-120b, openai/gpt-oss-20b",
    }),
    ["google/gemma-4-31b-it:free", "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  );
});

test("answerSlackQuestion stays retrieval-only without a key", async () => {
  const answer = await answerSlackQuestion(FACTS, "when does the booth open?", { env: {} });
  assert.equal(answer.source, "retrieval");
  assert.equal(answer.text, slackAnswer(FACTS, "when does the booth open?").text);
});

test("answerSlackQuestion uses OpenRouter when the key is set", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.authorization });
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "The booth opens at nine." } }] };
      },
    };
  };
  const answer = await answerSlackQuestion(FACTS, "when does the booth open?", {
    env: { OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_MODEL: "openai/gpt-oss-120b" },
    fetchImpl,
  });
  assert.equal(answer.source, "openrouter");
  assert.equal(answer.text, "The booth opens at nine.");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen[0].body.model, "openai/gpt-oss-120b");
  assert.equal(seen[0].body.max_tokens, OPENROUTER_OUTPUT_TOKENS);
  assert.ok(seen[0].body.max_tokens >= 2048);
  assert.deepEqual(seen[0].body.reasoning, { effort: "low", exclude: true });
  assert.equal(seen[0].body.temperature, undefined);
  assert.equal(seen[0].auth, "Bearer sk-or-test");
  assert.match(seen[0].body.messages[0].content, /Relevant memories/);
  assert.match(seen[0].body.messages[0].content, /booth opens at nine/);
  assert.match(seen[0].body.messages[0].content, /Walrus Memory recall/);
});

test("answerSlackQuestion falls back to retrieval when OpenRouter fails", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, async json() { return {}; } });
  const answer = await answerSlackQuestion(FACTS, "when does the booth open?", {
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl,
  });
  assert.equal(answer.source, "retrieval");
  assert.equal(answer.text, slackAnswer(FACTS, "when does the booth open?").text);
});

test("openRouterComplete does not throw when fetch rejects", async () => {
  const result = await openRouterComplete({
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    system: "Be brief.",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl: async () => { throw new Error("network"); },
  });
  assert.equal(result.used, false);
  assert.equal(result.text, "");
});

test("openRouterComplete tries gemma then gpt-oss fallbacks on failure", async () => {
  const seen = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (body.model === "google/gemma-4-31b-it:free") {
      return { ok: false, status: 429, async json() { return { error: { message: "rate" } }; } };
    }
    if (body.model === "openai/gpt-oss-120b") {
      return { ok: false, status: 503, async json() { return {}; } };
    }
    return {
      ok: true,
      async json() { return { choices: [{ message: { content: "Hello from 20b." } }] }; },
    };
  };
  const result = await openRouterComplete({
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    system: "Be brief.",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl,
  });
  assert.equal(result.used, true);
  assert.equal(result.text, "Hello from 20b.");
  assert.equal(result.model, "openai/gpt-oss-20b");
  assert.deepEqual(seen.map((body) => body.model), [
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ]);
  assert.deepEqual(result.tried, seen.map((body) => body.model));
  assert.equal(seen[0].reasoning, undefined);
  assert.equal(seen[0].temperature, 0.2);
  assert.equal(seen[0].max_tokens, OPENROUTER_OUTPUT_TOKENS);
  assert.deepEqual(seen[2].reasoning, { effort: "low", exclude: true });
  assert.equal(seen[2].temperature, undefined);
  assert.equal(seen[2].max_tokens, OPENROUTER_OUTPUT_TOKENS);
});

test("openRouterComplete skips a reasoning-only length stop and keeps the next answer", async () => {
  const seen = [];
  const result = await openRouterComplete({
    env: { OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_MODEL: "openai/gpt-oss-120b", OPENROUTER_MODEL_FALLBACKS: "openai/gpt-oss-20b" },
    messages: [{ role: "user", content: "What is Sederunt in one sentence?" }],
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body.model);
      if (body.model === "openai/gpt-oss-120b") {
        return {
          ok: true,
          async json() {
            return { choices: [{ finish_reason: "length", message: { content: null, reasoning: "secret chain of thought" } }] };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { choices: [{ finish_reason: "stop", message: { content: "  Sederunt keeps what a meeting decided.  ", reasoning: "hidden" } }] };
        },
      };
    },
  });
  assert.deepEqual(seen, ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  assert.equal(result.used, true);
  assert.equal(result.text, "Sederunt keeps what a meeting decided.");
  assert.doesNotMatch(result.text, /secret|hidden/);
});

test("recallVisibleForAsk ranks and caps memories like withMemWal maxMemories", () => {
  const visible = [
    { text: "the booth opens at nine", fileName: null },
    { text: "lunch is at noon", fileName: null },
    { text: "ship the deck on Friday", fileName: null },
    { text: "hire two engineers", fileName: null },
    { text: "the booth needs power", fileName: null },
    { text: "parking is free", fileName: null },
  ];
  const picked = recallVisibleForAsk(visible, "when does the booth open?", 2);
  assert.equal(picked.length, 2);
  assert.match(picked[0].text, /booth/);
  assert.match(picked[1].text, /booth/);
});

test("mergeSemanticVisible prefers MemWal recall hits inside the invite set", () => {
  const visible = [
    { id: "a", text: "the booth opens at nine", fileName: null },
    { id: "b", text: "lunch is at noon", fileName: null },
    { id: "c", text: "parking is free", fileName: null },
  ];
  const hits = [
    { distance: 0.4, decision: { id: "c", text: "parking is free" } },
    { distance: 0.1, decision: { id: "a", text: "the booth opens at nine" } },
    { distance: 0.05, decision: { id: "outsider", text: "secret" } },
  ];
  const merged = mergeSemanticVisible(visible, hits, "booth?", 2);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "a");
  assert.equal(merged[1].id, "c");
});

test("answerSlackQuestion uses options.recall before OpenRouter", async () => {
  const seen = [];
  let recalledQuery = "";
  const fetchImpl = async (_url, init) => {
    seen.push(JSON.parse(init.body));
    return { ok: true, async json() { return { choices: [{ message: { content: "Nine." } }] }; } };
  };
  const visible = [
    { id: "a", text: "the booth opens at nine", fileName: null },
    { id: "b", text: "lunch is at noon", fileName: null },
  ];
  const answer = await answerSlackQuestion(visible, "booth open?", {
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl,
    recall: async (query) => {
      recalledQuery = query;
      return [{ distance: 0.2, decision: { id: "a", text: "the booth opens at nine" } }];
    },
  });
  assert.equal(answer.source, "openrouter");
  assert.equal(recalledQuery, "booth open?");
  assert.match(seen[0].messages[0].content, /booth opens at nine/);
  assert.doesNotMatch(seen[0].messages[0].content, /lunch is at noon/);
});

test("openRouterStream tries next model after rate-limit, without reasoning on gemma", async () => {
  const seen = [];
  const encoder = new TextEncoder();
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ model: body.model, reasoning: body.reasoning, max_tokens: body.max_tokens, temperature: body.temperature });
    if (body.model === "google/gemma-4-31b-it:free") {
      return { ok: false, status: 429, body: null };
    }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Nine." } }] })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return { ok: true, body: stream, status: 200 };
  };
  const deltas = [];
  const result = await openRouterStream({
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    messages: [{ role: "user", content: "when?" }],
    fetchImpl,
    onDelta: (t) => deltas.push(t),
  });
  assert.equal(result.used, true);
  assert.equal(result.text, "Nine.");
  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.deepEqual(deltas, ["Nine."]);
  assert.equal(seen[0].model, "google/gemma-4-31b-it:free");
  assert.equal(seen[0].reasoning, undefined);
  assert.equal(seen[0].temperature, 0.2);
  assert.equal(seen[0].max_tokens, OPENROUTER_OUTPUT_TOKENS);
  assert.equal(seen[1].model, "openai/gpt-oss-120b");
  assert.deepEqual(seen[1].reasoning, { effort: "low", exclude: true });
  assert.equal(seen[1].temperature, undefined);
  assert.equal(seen[1].max_tokens, OPENROUTER_OUTPUT_TOKENS);
});

test("openRouterStream falls through a 500 and a network error", async () => {
  const seen = [];
  const encoder = new TextEncoder();
  const result = await openRouterStream({
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    messages: [{ role: "user", content: "when?" }],
    fetchImpl: async (_url, init) => {
      const model = JSON.parse(init.body).model;
      seen.push(model);
      if (model === "google/gemma-4-31b-it:free") return { ok: false, status: 500, body: null };
      if (model === "openai/gpt-oss-120b") throw new Error("network");
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Nine." } }] })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream };
    },
  });
  assert.deepEqual(seen, ["google/gemma-4-31b-it:free", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  assert.equal(result.text, "Nine.");
  assert.equal(result.model, "openai/gpt-oss-20b");
});

function streamOf(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

test("openRouterStream keeps assistant text and drops reasoning and tool deltas", async () => {
  assert.equal(textFromContent([{ type: "text", text: "Nine." }, { type: "reasoning", text: "hidden" }]), "Nine.");
  const deltas = [];
  const result = await openRouterStream({
    env: { OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_MODEL: "openai/gpt-oss-20b", OPENROUTER_MODEL_FALLBACKS: "" },
    messages: [{ role: "user", content: "when?" }],
    fetchImpl: async () => streamOf([
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "think", content: [{ type: "reasoning", text: "hidden" }, { type: "text", text: "The booth " }] } }] })}\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: "1" }], content: null } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, message: { content: "opens at nine." } }] })}`,
    ]),
    onDelta: (text) => deltas.push(text),
  });
  assert.equal(result.used, true);
  assert.equal(result.text, "The booth opens at nine.");
  assert.deepEqual(deltas, ["The booth ", "opens at nine."]);
  assert.doesNotMatch(result.text, /hidden|tool/);
});

test("openRouterStream tries the next model when the first returns only reasoning", async () => {
  const seen = [];
  const deltas = [];
  const result = await openRouterStream({
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    messages: [{ role: "user", content: "when?" }],
    onDelta: (text) => deltas.push(text),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      seen.push({ model: body.model, max_tokens: body.max_tokens, reasoning: body.reasoning || null });
      if (body.model === "google/gemma-4-31b-it:free") {
        return streamOf([
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "secret", content: "" } }] })}\n\n`,
          "data: [DONE]\n\n",
        ]);
      }
      if (body.model === "openai/gpt-oss-120b") {
        return streamOf([
          `data: ${JSON.stringify({ choices: [{ finish_reason: null, delta: { reasoning: "secret chain", reasoning_details: [{ type: "reasoning.text", text: "secret chain" }], content: null } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ finish_reason: "length", delta: { content: "   ", reasoning: "still thinking" } }] })}\n\n`,
          "data: [DONE]\n\n",
        ]);
      }
      return streamOf([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "hidden", content: "Nine." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    },
  });
  assert.deepEqual(seen.map((row) => row.model), ["google/gemma-4-31b-it:free", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  assert.equal(seen[0].reasoning, null);
  assert.deepEqual(seen[1].reasoning, { effort: "low", exclude: true });
  assert.ok(seen[1].max_tokens >= 2048);
  assert.equal(result.text, "Nine.");
  assert.equal(result.model, "openai/gpt-oss-20b");
  assert.deepEqual(deltas, ["Nine."]);
  assert.doesNotMatch(result.text, /secret|hidden|thinking/);
});
