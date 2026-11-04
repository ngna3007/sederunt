import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";
import { renderSignInPage } from "../src/console-sign-in.js";
import { renderRoomPage } from "../src/room-page.js";
import { sederuntMark } from "../src/sederunt-mark.js";

function shapes(svg) {
  return [...svg.matchAll(/<(rect|path|circle)\b[^>]*>/g)].map((m) => m[0].replace(/\s*\/?>$/, "").replace(/\s+/g, " "));
}

test("the Sederunt mark is the favicon drawing, not a text tile", () => {
  const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
  const mark = sederuntMark();
  assert.deepEqual(shapes(mark), shapes(favicon));
  assert.match(mark, /role="img" aria-label="Sederunt"/);
  assert.match(mark, /viewBox="0 0 32 32"/);
});

for (const [name, html] of [
  ["console sidebar", () => renderConsolePage({})],
  ["sign-in page", () => renderSignInPage({})],
  ["room page", () => renderRoomPage()],
]) {
  test(`the ${name} shows the real Sederunt logo next to the wordmark`, () => {
    const page = html();
    assert.match(page, /<svg class="sederunt-mark"[^>]*aria-label="Sederunt"/);
    assert.match(page, /<span class="brand-word">Sederunt<\/span>/);
    assert.doesNotMatch(page, /<span[^>]*>S<\/span>\s*Sederunt/);
    assert.doesNotMatch(page, /tile-mark[^"]*"[^>]*>S</);
    assert.match(page, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  });
}
