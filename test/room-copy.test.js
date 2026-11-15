import test from "node:test";
import assert from "node:assert/strict";
import { consolePageSource } from "./console-source.js";
const src = consolePageSource();
test("relative dates read naturally mid-sentence", () => {
  assert.match(src, /function whenInSentence/);
  assert.match(src, /function countWords/);
  assert.doesNotMatch(src, /kept this on " \+/);
  assert.doesNotMatch(src, /"Kept on " \+/);
});
