import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt } from "../src/bot/persona.js";
import {
  createMemoryPreferenceStore,
  forgetPreference,
  loadPreferences,
  preferenceFromUtterance,
  rememberPreference,
} from "../src/bot/preferences.js";

test("a user preference wins over the workspace preference in the prompt", async () => {
  const store = createMemoryPreferenceStore();
  await rememberPreference(store, { tenantId: "acme", scope: "workspace", key: "tone", value: "warm" });
  await rememberPreference(store, { tenantId: "acme", userId: "u-lan", scope: "user", key: "tone", value: "terse" });
  await rememberPreference(store, { tenantId: "acme", userId: "u-mai", scope: "user", key: "tone", value: "formal" });
  const lan = await loadPreferences(store, { tenantId: "acme", userId: "u-lan" });
  assert.equal(lan.workspace.tone, "warm");
  assert.equal(lan.user.tone, "terse");
  assert.equal(lan.applied.tone, "terse");
  assert.equal(lan.user.formal, undefined);
  const mai = await loadPreferences(store, { tenantId: "acme", userId: "u-mai" });
  assert.equal(mai.applied.tone, "formal");
  const prompt = buildSystemPrompt({ mode: "slack", preferences: lan });
  assert.match(prompt, /tone: terse/);
  assert.doesNotMatch(prompt, /tone: warm/);
  assert.doesNotMatch(prompt, /formal/);
});

test("remember this stores a user preference, and a workspace phrase stores a workspace row", async () => {
  const store = createMemoryPreferenceStore();
  const personal = preferenceFromUtterance("Please remember this: replies are one line");
  assert.equal(personal.scope, "user");
  assert.equal(personal.key, "replies");
  assert.equal(personal.value, "one line");
  await rememberPreference(store, { tenantId: "acme", userId: "u-lan", ...personal });
  const workspace = preferenceFromUtterance("remember this for the workspace: language is Vietnamese");
  assert.equal(workspace.scope, "workspace");
  assert.equal(workspace.key, "language");
  await rememberPreference(store, { tenantId: "acme", userId: "u-lan", ...workspace });
  const loaded = await loadPreferences(store, { tenantId: "acme", userId: "u-lan" });
  assert.equal(loaded.user.replies, "one line");
  assert.equal(loaded.workspace.language, "Vietnamese");
  assert.equal(preferenceFromUtterance("ship on Friday"), null);
  await forgetPreference(store, { tenantId: "acme", userId: "u-lan", scope: "user", key: "replies" });
  const after = await loadPreferences(store, { tenantId: "acme", userId: "u-lan" });
  assert.equal(after.user.replies, undefined);
  assert.equal(after.workspace.language, "Vietnamese");
  await assert.rejects(() => rememberPreference(store, { tenantId: "acme", scope: "user", key: "tone", value: "terse" }), /user/);
});
