import test from "node:test";
import assert from "node:assert/strict";
import { askDisplayName, askSystemPrompt, scrubAskIds } from "../src/ask/run.js";

test("askDisplayName blanks Slack and UUID ids", () => {
  assert.equal(askDisplayName("U0CE7CM2N8Z"), "");
  assert.equal(askDisplayName("u0ce7cm2n8z"), "");
  assert.equal(askDisplayName("C0CEZT4KYP2"), "");
  assert.equal(askDisplayName("ddc28b7b-790a-4551-8720-b5cfe62e4721"), "");
  assert.equal(askDisplayName("Anh"), "Anh");
});

test("askSystemPrompt never injects a raw Slack speaker id", () => {
  const prompt = askSystemPrompt([{ text: "Floor plan kept", speaker: "U0CE7CM2N8Z", spokenAt: "2026-11-06T04:00:00.000Z", roomId: "C0CEZT4KYP2" }]);
  assert.doesNotMatch(prompt, /U0CE7CM2N8Z/i);
  assert.doesNotMatch(prompt, /C0CEZT4KYP2/);
  assert.match(prompt, /Floor plan kept/);
  assert.match(prompt, /Never quote Slack user ids/);
});

test("scrubAskIds replaces leftover technical ids in model text", () => {
  assert.equal(
    scrubAskIds("Kept by U0CE7CM2N8Z in C0CEZT4KYP2."),
    "Kept by someone in a channel.",
  );
});
