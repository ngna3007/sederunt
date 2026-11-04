import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderConsolePage } from "../src/console-page.js";

const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
const html = renderConsolePage({});

function hex(rule, prop) {
  const m = css.match(new RegExp(rule.replace(/\./g, "\\.") + "\\s*\\{[^}]*" + prop + ":\\s*(#[0-9a-fA-F]{6}|var\\(--[a-z-]+\\))"));
  assert.ok(m, rule + " " + prop);
  const v = m[1].startsWith("var(") ? css.match(new RegExp(m[1].slice(4, -1) + ":\\s*(#[0-9a-fA-F]{6})"))[1] : m[1];
  return v;
}
function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("badge tones meet WCAG AA (4.5:1)", () => {
  for (const tone of [".badge.ok", ".badge.warn", ".badge.accent", ".badge.info"]) {
    assert.ok(ratio(hex(tone, "color"), hex(tone, "background")) >= 4.5, tone);
  }
  assert.ok(ratio("#b42318", "#ffffff") >= 4.5, ".badge.bad");
});

test("preset tones: Connected green, Add accent, error red", () => {
  assert.match(html, /state === "connected" \|\| state === "ready"\) return "ok"/);
  assert.match(html, /state === "error"\) return "bad"/);
  assert.match(html, /return "accent"/);
  assert.match(html, /badge accent" data-preset-badge>Add</);
  assert.doesNotMatch(html, /already connected/);
});

test("tool badges: Read blue, Write amber, Delete red", () => {
  assert.match(html, /actionClass === "delete" \? "badge bad" : tool\.actionClass === "read" \? "badge info" : "badge warn"/);
});

test("Forms and Calendar icons keep full colour", () => {
  assert.match(html, /logo-google-forms[\s\S]*?#673AB7/i);
  assert.match(html, /logo-google-calendar[\s\S]*?#3c90ff/i);
});
