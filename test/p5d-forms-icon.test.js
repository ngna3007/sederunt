import assert from "node:assert/strict";
import test from "node:test";
import { brandLogo, brandSprite } from "../src/brand-logos.js";
import { renderConsolePage } from "../src/console-page.js";

test("the Google Forms preset card uses an inline forms mark", () => {
  const html = renderConsolePage({});
  const start = html.indexOf('data-preset="google-forms"');
  const end = html.indexOf('data-preset="google-calendar"');
  assert.equal(start > 0 && end > start, true);
  const card = html.slice(start, end);
  assert.match(card, /preset-head/);
  assert.match(card, /Google Forms/);
  assert.match(card, /href="#logo-google-forms"/);
  assert.match(brandLogo("google-forms"), /href="#logo-google-forms"/);
  const sprite = brandSprite();
  assert.match(sprite, /id="logo-google-forms"/);
  assert.match(sprite, /#673AB7/);
  assert.match(html, /id="logo-google-forms"/);
  const calendar = html.slice(end, end + 500);
  assert.match(calendar, /href="#logo-google-calendar"/);
});
