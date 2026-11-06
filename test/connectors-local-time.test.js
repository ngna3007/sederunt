import assert from "node:assert/strict";
import test from "node:test";
import { formatLastTested } from "../src/console/local-time.js";
import { renderConsolePage } from "../src/console-page.js";

test("last tested uses the viewer's zone and a short zone name", () => {
  assert.equal(
    formatLastTested("2026-11-04T06:13:00.000Z", "Asia/Bangkok"),
    "Last tested Nov 4, 1:13 PM GMT+7",
  );
  assert.equal(formatLastTested("2026-11-04T06:13:00.000Z", "Asia/Ho_Chi_Minh"), "Last tested Nov 4, 1:13 PM GMT+7");
  assert.equal(formatLastTested("", "Asia/Bangkok"), "Not tested yet");
  assert.equal(formatLastTested("not-a-date", "UTC"), "Not tested yet");
});

test("a failed zone format stays labeled and is not raw UTC", () => {
  const fallback = formatLastTested("2026-11-04T06:13:00.000Z", "Not/AZone");
  assert.match(fallback, /^Last tested /);
  assert.match(fallback, /GMT[+-]\d/);
  assert.doesNotMatch(fallback, /\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(fallback, / UTC$/);
  assert.equal(fallback.includes("Z"), false);
});

test("the connectors page formats last tested in the browser", () => {
  const page = renderConsolePage();
  assert.match(page, /timeZoneName:\s*"short"/);
  assert.match(page, /function formatLastTested/);
  assert.equal(page.includes('.replace("Z", " UTC")'), false);
  assert.equal(page.includes("Last tested \" + text"), false);
});
