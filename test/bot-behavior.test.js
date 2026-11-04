import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { BOT_SYSTEM_PROMPT, MODES, REPLY_RULES, buildSystemPrompt, checkReply } from "../src/bot/persona.js";

const fixtureDir = path.join(import.meta.dirname, "fixtures", "bot-evals");

function createFakeModel(messages) {
  const assistant = (messages || []).find((message) => message.role === "assistant") || {};
  return {
    async complete({ system, messages: turn }) {
      if (typeof system !== "string" || !system.includes("You are Adam")) throw new Error("missing system prompt");
      if (!Array.isArray(turn) || turn.some((message) => message.role === "assistant")) throw new Error("model saw the scripted answer");
      return {
        text: assistant.text || "",
        thread_ts: assistant.thread_ts || "",
        blocks: assistant.blocks || null,
      };
    },
  };
}

const cases = [];
for (const file of (await readdir(fixtureDir)).filter((name) => name.endsWith(".json")).sort()) {
  const parsed = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8"));
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) cases.push(item);
}

test("bot eval fixtures cover every reply rule with a good and a bad case", () => {
  assert.ok(cases.length >= REPLY_RULES.length * 2);
  for (const rule of REPLY_RULES) {
    assert.ok(cases.some((item) => item.rule === rule && item.expect === "pass"), `missing good ${rule}`);
    assert.ok(cases.some((item) => item.rule === rule && item.expect === "fail"), `missing bad ${rule}`);
  }
  for (const mode of MODES) {
    assert.ok(cases.some((item) => item.mode === mode && item.expect === "pass"), mode);
    assert.ok(cases.some((item) => item.mode === mode && item.expect === "fail"), mode);
  }
});

test("BOT_SYSTEM_PROMPT is the slack-mode default", () => {
  assert.equal(BOT_SYSTEM_PROMPT, buildSystemPrompt({ mode: "slack" }));
  assert.match(BOT_SYSTEM_PROMPT, /Answer first/);
  assert.match(BOT_SYSTEM_PROMPT, /TL;DR/);
  assert.match(BOT_SYSTEM_PROMPT, /owner\?/);
  assert.match(BOT_SYSTEM_PROMPT, /<!channel>/);
  assert.match(BOT_SYSTEM_PROMPT, /remember this/);
  assert.match(BOT_SYSTEM_PROMPT, /You are Adam/);
  assert.doesNotMatch(BOT_SYSTEM_PROMPT, /You are Sederunt/);
  assert.doesNotMatch(BOT_SYSTEM_PROMPT, /after the call/);
  const voice = buildSystemPrompt({ mode: "live_voice", language: "vi" });
  assert.match(voice, /after the call/);
  assert.match(voice, /half past two/);
  assert.match(voice, /Reply in Vietnamese/);
  assert.match(voice, /addresses you as Adam/);
  assert.doesNotMatch(voice, /thread_ts/);
  const chat = buildSystemPrompt({ mode: "meeting_chat" });
  assert.match(chat, /Do not write a long post/);
  assert.match(chat, /You are Adam/);
  const named = buildSystemPrompt({ mode: "live_voice", botName: "Mai" });
  assert.match(named, /You are Mai/);
  assert.match(named, /addresses you as Mai/);
  assert.doesNotMatch(named, /You are Adam/);
  const fromWorkspace = buildSystemPrompt({
    mode: "slack",
    preferences: {
      workspace: { bot_name: "Mai", tone: "warm" },
      user: { bot_name: "Zed" },
      applied: { bot_name: "Zed", tone: "terse" },
    },
  });
  assert.match(fromWorkspace, /You are Mai/);
  assert.match(fromWorkspace, /tone: terse/);
  assert.doesNotMatch(fromWorkspace, /You are Zed/);
  assert.doesNotMatch(fromWorkspace, /bot_name/);
  assert.doesNotMatch(fromWorkspace, /wake_phrases/);
  const withPrefs = buildSystemPrompt({
    mode: "slack",
    preferences: { workspace: { tone: "warm" }, user: { tone: "terse" } },
  });
  assert.match(withPrefs, /tone: terse/);
  assert.doesNotMatch(withPrefs, /tone: warm/);
  assert.throws(() => buildSystemPrompt({ mode: "email" }), /unknown mode/);
});

for (const item of cases) {
  test(`bot eval ${item.id}`, async () => {
    const prompt = buildSystemPrompt({
      mode: item.mode,
      preferences: item.preferences || null,
      language: item.context?.language || "",
    });
    if (item.preferences?.applied) {
      for (const value of Object.values(item.preferences.applied)) assert.match(prompt, new RegExp(value));
    }
    const users = item.messages.filter((message) => message.role === "user");
    const reply = await createFakeModel(item.messages).complete({ system: prompt, messages: users });
    const result = checkReply(reply, { mode: item.mode, ...(item.context || {}) });
    if (item.expect === "pass") {
      assert.equal(result.ok, true, `${item.id} ${JSON.stringify(result.violations)}`);
      assert.equal(result.violations.some((violation) => violation.rule === item.rule), false);
    } else {
      assert.equal(
        result.violations.some((violation) => violation.rule === item.rule),
        true,
        `${item.id} ${JSON.stringify(result.violations)}`,
      );
    }
  });
}
