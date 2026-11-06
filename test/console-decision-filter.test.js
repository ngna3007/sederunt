import assert from "node:assert/strict";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";

test("Decisions Current chip sets recordFilter and paint uses it", () => {
  const html = renderConsolePage({ signedIn: true });
  assert.match(html, /data-decision-filter="all"/);
  assert.match(html, /data-decision-filter="current"/);
  assert.match(html, /data-decision-filter="clashing"/);
  assert.match(html, /querySelectorAll\("\[data-decision-filter\]"\)/);
  assert.match(html, /function applyRecordFilter\(filter\)/);
  assert.match(html, /recordFilter = filter === "current" \|\| filter === "clashing" \? filter : "all"/);
  assert.match(html, /recordFilter === "current"/);
  assert.match(html, /recordFilter === "clashing"/);
  assert.match(html, /function paintRecord\(/);
  assert.match(html, /paintRecord\(\)/);
});
