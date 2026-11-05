import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
test("relative dates read naturally mid-sentence", () => {
  assert.match(src, /function whenInSentence/);
  assert.match(src, /function countWords/);
  assert.doesNotMatch(src, /kept this on " \+/);
  assert.doesNotMatch(src, /"Kept on " \+/);
});
