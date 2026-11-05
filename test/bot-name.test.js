import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BOT_NAME,
  defaultWakePhrases,
  phraseHasName,
  previewLine,
  resolveBotIdentity,
  saveBotIdentity,
  validateBotName,
  validateWakePhrases,
} from "../src/bot/identity.js";
import { createMemoryPreferenceStore, loadPreferences, rememberPreference } from "../src/bot/preferences.js";

test("a bot name is 1-32 cased letters, spaces, hyphens, or apostrophes", () => {
  assert.equal(validateBotName("  Mai  ").name, "Mai");
  assert.equal(validateBotName("Ngô Thị Mai").name, "Ngô Thị Mai");
  assert.equal(validateBotName("Jean-Luc").name, "Jean-Luc");
  assert.equal(validateBotName("O'Neil").name, "O'Neil");
  assert.equal(validateBotName("O\u2019Neil").name, "O\u2019Neil");
  assert.equal(validateBotName("Ý").name, "Ý");
  assert.equal(validateBotName("A").ok, true);
  assert.equal(validateBotName("M".repeat(32)).ok, true);
  for (const bad of ["", "   ", "Adam2", "Mai_bot", "M".repeat(33), "-Mai", "中", "Mai  Lan"]) {
    const result = bad === "Mai  Lan" ? validateBotName(bad) : validateBotName(bad);
    if (bad === "Mai  Lan") {
      assert.equal(result.name, "Mai Lan");
      continue;
    }
    assert.equal(result.ok, false, bad);
  }
  assert.equal(validateBotName("").error, "Give the bot a name.");
  assert.equal(validateBotName("Adam2").error, "Use 1-32 letters, spaces, hyphens, or apostrophes.");
});

test("wake phrases follow the name until someone customizes them", async () => {
  assert.deepEqual(defaultWakePhrases("Mai"), ["Hey Mai", "Mai"]);
  assert.deepEqual(defaultWakePhrases("Ý"), ["Hey Ý"]);
  assert.equal(phraseHasName("Hey Jean-Luc", "Jean-Luc"), true);
  assert.equal(phraseHasName("Adamant", "Adam"), false);
  assert.equal(phraseHasName("Ngô ơi", "Ngô"), true);
  assert.equal(validateWakePhrases(["Hey Mai", "hey mai"], "Mai").error, "Wake phrases must be unique.");
  assert.equal(validateWakePhrases(["hello"], "Mai").error, "Each wake phrase must include the bot's name.");
  assert.equal(validateWakePhrases(["M"], "Mai").error, "Each wake phrase must be 2-40 characters.");
  assert.equal(validateWakePhrases(["Mai", "Mai", "Mai", "Mai", "Mai", "Mai"], "Mai").error, "You can keep up to 5 wake phrases.");
  assert.equal(validateWakePhrases("Mai", "Mai").error, "Add at least one wake phrase.");
  assert.equal(previewLine("Mai", ["Hey Mai", "Mai"]), "Say 'Hey Mai, …' in a meeting");

  const store = createMemoryPreferenceStore();
  const kept = await saveBotIdentity(store, { tenantId: "acme", name: "Adam", phrases: ["Hey Adam", "Adam"] });
  assert.equal(kept.phrasesCustomized, false);
  assert.deepEqual(await store.list({ tenantId: "acme" }), []);

  const renamed = await saveBotIdentity(store, { tenantId: "acme", name: " Mai ", phrases: defaultWakePhrases("Mai") });
  assert.equal(renamed.name, "Mai");
  assert.equal(renamed.phrasesCustomized, false);
  let loaded = await loadPreferences(store, { tenantId: "acme", userId: "u-lan" });
  assert.equal(loaded.workspace.bot_name, "Mai");
  assert.equal(loaded.workspace.wake_phrases, undefined);

  const custom = await saveBotIdentity(store, { tenantId: "acme", name: "Mai", phrases: ["Mai ơi", "Hey Mai"] });
  assert.equal(custom.phrasesCustomized, true);
  assert.deepEqual(custom.phrases, ["Mai ơi", "Hey Mai"]);
  loaded = await loadPreferences(store, { tenantId: "acme", userId: null });
  assert.equal(loaded.workspace.wake_phrases, JSON.stringify(["Mai ơi", "Hey Mai"]));

  await rememberPreference(store, { tenantId: "acme", userId: "u-lan", scope: "user", key: "bot_name", value: "Zed" });
  await rememberPreference(store, { tenantId: "acme", userId: "u-lan", scope: "user", key: "wake_phrases", value: "[\"Zed\"]" });
  loaded = await loadPreferences(store, { tenantId: "acme", userId: "u-lan" });
  assert.equal(loaded.user.bot_name, "Zed");
  const resolved = resolveBotIdentity(loaded.workspace);
  assert.equal(resolved.name, "Mai");
  assert.deepEqual(resolved.phrases, ["Mai ơi", "Hey Mai"]);

  await saveBotIdentity(store, { tenantId: "acme", name: "Mai", phrases: ["hey mai", "MAI"] });
  loaded = await loadPreferences(store, { tenantId: "acme", userId: null });
  assert.equal(loaded.workspace.wake_phrases, undefined);
  assert.equal(resolveBotIdentity(loaded.workspace).phrasesCustomized, false);

  await saveBotIdentity(store, { tenantId: "acme", name: "Adam", phrases: ["Hey Adam", "Adam"] });
  loaded = await loadPreferences(store, { tenantId: "acme", userId: null });
  assert.equal(loaded.workspace.bot_name, undefined);
  assert.equal(resolveBotIdentity({ bot_name: "Adam2", wake_phrases: "{" }).name, DEFAULT_BOT_NAME);
  assert.deepEqual(resolveBotIdentity({ bot_name: "Lan", wake_phrases: "nope" }).phrases, ["Hey Lan", "Lan"]);
  await assert.rejects(() => saveBotIdentity(store, { tenantId: "", name: "Mai", phrases: ["Mai"] }), /missing workspace/);
});
