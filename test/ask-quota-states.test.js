import test from "node:test";
import assert from "node:assert/strict";
import { renderConsolePage } from "../src/console-page.js";

test("ask quota pill renders a visible default before the list loads", () => {
  const html = renderConsolePage({ askLimit: 5 });
  const pill = html.match(/<span id="ask-quota"[^>]*>([^<]*)<\/span>/);
  assert.ok(pill, "pill is in the page");
  assert.doesNotMatch(pill[0], /\bhidden\b/);
  assert.equal(pill[1], "5 questions a day");
});

test("out-of-quota note sits inside the composer and follows the limit", () => {
  const html = renderConsolePage({ askLimit: 3 });
  const form = html.match(/<form id="chat-form"[\s\S]*?<\/form>/)[0];
  assert.match(form, /id="ask-out"[^>]*hidden/);
  assert.match(form, /You've used all 3\./);
  assert.match(html, /var askState = \{ limit: 3,/);
});
