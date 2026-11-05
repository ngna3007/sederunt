import assert from "node:assert/strict";
import test from "node:test";
import { answerSlackQuestion, slackRecentTurns } from "../src/slack/reply.js";

test("slackRecentTurns maps people to user and bots to assistant, oldest first", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          messages: [
            { ts: "3", user: "U1", text: "demo-note" },
            { ts: "2", bot_id: "B1", text: "Which file — demo-note or floor-plan?" },
            { ts: "1", user: "U1", text: "resend the announcement note" },
            { ts: "0", subtype: "channel_join", text: "joined" },
          ],
        };
      },
    };
  };
  const turns = await slackRecentTurns({
    token: "xoxb-test",
    channel: "D1",
    fetchImpl,
    excludeTs: "3",
  });
  assert.ok(calls[0].includes("conversations.history"));
  assert.deepEqual(turns, [
    { role: "user", content: "resend the announcement note" },
    { role: "assistant", content: "Which file — demo-note or floor-plan?" },
  ]);
});

test("answerSlackQuestion sends prior turns then the latest ask to OpenRouter", async () => {
  const bodies = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("openrouter.ai")) {
      bodies.push(JSON.parse(init.body || "{}"));
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ text: "Here is demo-note.txt.", attach: "demo-note.txt" }) } }] };
        },
      };
    }
    return { ok: true, status: 200, async json() { return { ok: true, messages: [] }; } };
  };
  const answer = await answerSlackQuestion(
    [{ text: "Kept demo-note.txt", fileName: "demo-note.txt" }],
    "demo-note",
    {
      env: { OPENROUTER_API_KEY: "sk-or-test" },
      fetchImpl,
      history: [
        { role: "user", content: "resend the announcement note" },
        { role: "assistant", content: "demo-note or the floor plan." },
      ],
    },
  );
  assert.equal(answer.text, "Here is demo-note.txt.");
  assert.equal(answer.file, "demo-note.txt");
  assert.equal(bodies.length, 1);
  const messages = bodies[0].messages.filter((item) => item.role !== "system");
  assert.deepEqual(messages, [
    { role: "user", content: "resend the announcement note" },
    { role: "assistant", content: "demo-note or the floor plan." },
    { role: "user", content: "demo-note" },
  ]);
});
