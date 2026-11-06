import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Home lists every upcoming meeting, not just the next one", async () => {
  const page = await readFile(new URL("../src/console-page.js", import.meta.url), "utf8");
  const paint = page.slice(page.indexOf("function paintMeetings()"), page.indexOf("function showEventError("));
  assert.match(paint, /"Upcoming meetings"/);
  assert.match(paint, /var shown = meetings;/);
  assert.doesNotMatch(paint, /meetings\.slice\(0, 1\)/);
});

test("Home labels the recent rooms block under the meetings", async () => {
  const page = await readFile(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.match(page, /roomsLabel\.textContent = "Recent rooms";/);
  assert.match(page, /roomsLabel\.hidden = !\(onHome && shown > 0\);/);
  const css = await readFile(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(css, /#home-rooms-label\[hidden\] \{ display: none; \}/);
});
