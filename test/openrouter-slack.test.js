import assert from "node:assert/strict";
import test from "node:test";
import { openRouterComplete, openRouterConfig } from "../src/openrouter.js";
import { answerSlackQuestion, mergeSemanticVisible, recallVisibleForAsk, slackAnswer } from "../src/slack/reply.js";

const FACTS = [
  { text: "the booth opens at nine", fileName: null, connectorId: "ROW-69" },
];

test("openRouterConfig defaults model and requires a key", () => {
  assert.equal(openRouterConfig({}).enabled, false);
  assert.equal(openRouterConfig({}).model, "openai/gpt-oss-120b");
  assert.equal(openRouterConfig({ OPENROUTER_API_KEY: " sk-or-test " }).enabled, true);
  assert.equal(
    openRouterConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "openai/gpt-oss-120b" }).model,
    "openai/gpt-oss-120b",
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
