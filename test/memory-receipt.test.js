import assert from "node:assert/strict";
import test from "node:test";
import { renderConsoleProof } from "../src/domain/receipt.js";
import { answerSlackQuestion, slackAnswer } from "../src/slack/reply.js";

const BLOB = "vK3mN0pQ1rS2tU3vW4xY5zA6bC7dE8fG9hI0jK1lM2n";
const DIGEST = "C1J2cwJJQyaXZYBWqaDY5LRJHALA8JrtobJgD9BoWFjq";
const LINK = `https://suiscan.xyz/mainnet/tx/${DIGEST}`;

test("console proof and Slack answer show a real blob id, digest, and explorer link", () => {
  const item = {
    text: "The booth opens at nine.",
    blobId: BLOB,
    digest: DIGEST,
  };
  const consoleText = renderConsoleProof(item);
  const slack = slackAnswer([item], "when does the booth open");
  for (const output of [consoleText, slack.text]) {
    assert.equal(output.includes(BLOB), true);
    assert.equal(output.includes(DIGEST), true);
    assert.equal(output.includes(LINK), true);
  }
  assert.equal(slack.text.includes("The booth opens at nine."), true);
});

test("a remembered item without a blob id or digest does not gain a fabricated receipt", () => {
  const item = { text: "The booth opens at nine.", connectorId: "ROW-69" };
  const consoleText = renderConsoleProof(item);
  const slack = slackAnswer([item], "when does the booth open");
  assert.equal(consoleText, "");
  assert.equal(slack.text, "Decided: The booth opens at nine. (ROW-69)");
  assert.equal(slack.text.includes("suiscan.xyz"), false);
  assert.equal(slack.text.includes("Walrus blob"), false);
  assert.equal(renderConsoleProof({ text: "only a blob", blobId: BLOB }), "");
  assert.equal(renderConsoleProof({ text: "only a digest", digest: DIGEST }), "");
  assert.equal(renderConsoleProof({ proof: { blobId: BLOB, digest: DIGEST } }).includes(LINK), true);
});

test("a model Slack answer keeps the receipt only when it quotes a stored sentence that already has ids", async () => {
  const item = { text: "The booth opens at nine.", blobId: BLOB, digest: DIGEST };
  const quoted = await answerSlackQuestion([item], "when does the booth open", {
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { choices: [{ message: { content: "The booth opens at nine." } }] };
      },
    }),
    history: [],
  });
  assert.equal(quoted.text.includes(BLOB), true);
  assert.equal(quoted.text.includes(DIGEST), true);
  assert.equal(quoted.text.includes(LINK), true);
  const paraphrased = await answerSlackQuestion([item], "when does the booth open", {
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Nine." } }] };
      },
    }),
    history: [],
  });
  assert.equal(paraphrased.text, "Nine.");
  assert.equal(paraphrased.text.includes(BLOB), false);
  const bare = await answerSlackQuestion([{ text: "The booth opens at nine." }], "when does the booth open", {
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { choices: [{ message: { content: "The booth opens at nine." } }] };
      },
    }),
    history: [],
  });
  assert.equal(bare.text, "The booth opens at nine.");
});
