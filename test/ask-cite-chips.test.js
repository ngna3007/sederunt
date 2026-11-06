import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { speakerLabel } from "../src/console-page.js";

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, "../src/console-page.js"), "utf8");

test("speakerLabel blanks Slack user ids in any case", () => {
  assert.equal(speakerLabel("U0CE7CM2N8Z", "Anh", "member-1"), "");
  assert.equal(speakerLabel("u0ce7cm2n8z", "Anh", "member-1"), "");
  assert.equal(speakerLabel("Anh", "Anh", "member-1"), "Anh");
});

test("Ask cite path uses personLabel and strips raw Slack ids", () => {
  assert.match(page, /personLabel\(item\.speaker\)/);
  assert.match(page, /Never show raw Slack user\/channel ids/);
  assert.match(page, /function citeReadable\(cite\)/);
  const askMap = page.slice(page.indexOf("appendCites(span.parentNode, sources.map"));
  const chunk = askMap.slice(0, 500);
  assert.equal(chunk.includes("toLowerCase()"), false, chunk);
});

test("Ask cite chips join speaker and when once", () => {
  const start = page.indexOf("function citeReadable(cite)");
  assert.ok(start > 0);
  const chunk = page.slice(start, start + 900);
  assert.match(chunk, /if \(head && when && head === when\) head = ""/);
  assert.match(page, /Label is the friendly speaker only/);
});
