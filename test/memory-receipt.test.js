import assert from "node:assert/strict";
import test from "node:test";
import { renderConsoleProof } from "../src/domain/receipt.js";
import { createSession } from "../src/session.js";
import { answerSlackQuestion, slackAnswer } from "../src/slack/reply.js";
import { handleUtterance } from "../src/typed-path.js";

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

const OBJECT_DIGEST = "9xQ2aLmN0pR4sT6uV8wX1yZ3bC5dE7fG9hJ0kL2mN4p";
const OBJECT_ID = `0x${"ab".repeat(32)}`;

function recalledDecision(extra = {}) {
  return {
    id: "d1",
    roomId: "room-1",
    text: "The booth opens at nine.",
    account: "company",
    kind: "decision",
    inviteMemberIds: ["mina"],
    blobId: BLOB,
    ...extra,
  };
}

function recall(session, tatum) {
  return handleUtterance({
    session,
    memberId: "mina",
    intent: "recall",
    text: "when does the booth open",
    room: { id: "room-1" },
  }, tatum ? { tatum } : {});
}

test("a recall row built for Slack keeps the blob id and the certifying transaction", async () => {
  const session = createSession();
  session.decisions = [recalledDecision()];
  const result = await recall(session, {
    async getObject(id) {
      assert.equal(id, BLOB);
      return {
        text: "The booth opens at nine.",
        checkpoint: 345604234,
        objectId: OBJECT_ID,
        digest: OBJECT_DIGEST,
        proof: {
          status: "verified",
          blobId: BLOB,
          digest: DIGEST,
          objectId: OBJECT_ID,
          checkpoint: 345604234,
        },
      };
    },
  });
  assert.equal(result.visible[0].blobId, BLOB);
  assert.equal(result.visible[0].digest, DIGEST);
  const slack = slackAnswer(result.visible, "when does the booth open");
  const asked = await answerSlackQuestion(result.visible, "when does the booth open", { env: {} });
  for (const output of [slack.text, asked.text]) {
    assert.equal(output.includes(BLOB), true);
    assert.equal(output.includes(DIGEST), true);
    assert.equal(output.includes(LINK), true);
    assert.equal(output.includes(OBJECT_DIGEST), false);
  }
});

test("a stored digest is kept when the chain read has no certifying transaction", async () => {
  const session = createSession();
  session.decisions = [recalledDecision({ digest: DIGEST })];
  const result = await recall(session, {
    async getObject() {
      return {
        text: "The booth opens at nine.",
        checkpoint: 345604234,
        objectId: OBJECT_ID,
        digest: OBJECT_DIGEST,
        proof: { status: "verified", blobId: BLOB, objectId: OBJECT_ID, checkpoint: 345604234 },
      };
    },
  });
  assert.equal(result.visible[0].digest, DIGEST);
  assert.equal(slackAnswer(result.visible, "when does the booth open").text.includes(OBJECT_DIGEST), false);
  assert.equal(slackAnswer(result.visible, "when does the booth open").text.includes(LINK), true);
});

test("a batch chain read copies each certifying digest onto the Slack row", async () => {
  const secondBlob = "bL0bSecondWalrusId0123456789abcdefghijk";
  const secondDigest = "D2K3dxKKRzbYaZCXXrbEZ6MSKIBM9KsucKKhE0CpXGkr";
  const session = createSession();
  session.decisions = [
    recalledDecision(),
    recalledDecision({ id: "d2", text: "The launch moves to the 18th.", blobId: secondBlob }),
  ];
  const seen = [];
  const result = await recall(session, {
    async getObject() {
      throw new Error("a batch recall must use getObjects");
    },
    async getObjects(requests) {
      seen.push(requests);
      return requests.map((request) => ({
        ok: true,
        object: {
          text: request.hints.blobId === secondBlob ? "The launch moves to the 18th." : "The booth opens at nine.",
          objectId: OBJECT_ID,
          digest: OBJECT_DIGEST,
          checkpoint: 345604234,
          proof: {
            status: "verified",
            blobId: request.hints.blobId,
            digest: request.hints.blobId === secondBlob ? secondDigest : DIGEST,
            objectId: OBJECT_ID,
            checkpoint: 345604234,
          },
        },
      }));
    },
  });
  assert.equal(seen.length, 1);
  const byId = new Map(result.visible.map((row) => [row.id, row]));
  assert.equal(byId.get("d1").blobId, BLOB);
  assert.equal(byId.get("d1").digest, DIGEST);
  assert.equal(byId.get("d2").blobId, secondBlob);
  assert.equal(byId.get("d2").digest, secondDigest);
  const slack = slackAnswer(result.visible, "when does the booth open");
  assert.equal(slack.text.includes(LINK), true);
  assert.equal(slack.text.includes(`https://suiscan.xyz/mainnet/tx/${secondDigest}`), true);
  assert.equal(slack.text.includes(OBJECT_DIGEST), false);
});

test("a remembered decision with no chain ids does not gain a receipt from recall", async () => {
  const session = createSession();
  session.decisions = [recalledDecision({ blobId: undefined, digest: undefined, connectorId: "ROW-69" })];
  const result = await recall(session, {
    async getObject() {
      throw new Error("Tatum should not be asked for a missing blob");
    },
  });
  assert.equal(result.visible[0].blobId, undefined);
  assert.equal(result.visible[0].digest, undefined);
  const slack = slackAnswer(result.visible, "when does the booth open");
  assert.equal(slack.text, "Decided: The booth opens at nine. (ROW-69)");
  assert.equal(slack.text.includes("suiscan.xyz"), false);
});
