import assert from "node:assert/strict";
import test from "node:test";
import { createSlackClient } from "../src/slack/post.js";
import { parseUtterance } from "../src/parse.js";
import { rankDecisions } from "../src/room-match.js";

test("a slack post checks HTTP status and prefers chat.getPermalink", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("chat.postMessage")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, channel: "C0123", ts: "1710000000.000100" }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, permalink: "https://sederunt.slack.com/archives/C0123/p1710000000000100" }) };
  };
  const slack = createSlackClient({ SLACK_BOT_TOKEN: "xoxb-test" }, fetchImpl);
  const posted = await slack.postMessage({ channel: "C0123", text: "Booth notes" });
  assert.equal(posted.permalink, "https://sederunt.slack.com/archives/C0123/p1710000000000100");
  assert.equal(calls.length, 2);
  await assert.rejects(
    () => createSlackClient({ SLACK_BOT_TOKEN: "xoxb-test" }, async () => ({ ok: false, status: 500, json: async () => ({}) })).postMessage({ channel: "C0123", text: "x" }),
    /HTTP 500/,
  );
});

test("a permalink falls back to the archive url", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("chat.postMessage")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, channel: "C0123", ts: "1710000000.000100" }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const posted = await createSlackClient({ SLACK_BOT_TOKEN: "xoxb-test" }, fetchImpl).postMessage({ channel: "C0123", text: "Booth notes" });
  assert.equal(posted.permalink, "https://slack.com/archives/C0123/p1710000000000100");
});

test("filing a ticket is a command, not a decision", () => {
  const parsed = parseUtterance("File the hiring ticket backend-roles");
  assert.equal(parsed.type, "write");
  assert.equal(parsed.tool, "linear");
  assert.match(parsed.title, /hiring ticket backend-roles/);
});

test("a question that hits no room and no decision text matches nothing", () => {
  const result = rankDecisions("xyzzy", [
    { roomId: "booth", text: "The booth opens at nine.", spokenAt: "2026-11-03T08:00:00.000Z" },
  ], [{ id: "booth", name: "Booth planning" }]);
  assert.equal(result.answer, "Nothing stored matches that.");
  assert.equal(result.cites.length, 0);
  const prefix = rankDecisions("what did plan decide?", [
    { roomId: "booth", text: "Planning the booth layout.", spokenAt: "2026-11-03T08:00:00.000Z" },
  ], [{ id: "planning", name: "Planning" }]);
  assert.equal(prefix.answer.includes("Planning the booth"), false);
});
