// Design system guards. See docs/design/design-system.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { renderConsolePage } from "../src/console-page.js";

const src = new URL("../src/", import.meta.url);
const css = readFileSync(new URL("console.css", src), "utf8");
const START = "/* @tokens start";
const END = "/* @tokens end */";

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const tokenBlock = css.slice(css.indexOf(START), css.indexOf(END));
const outside = stripComments(css.slice(0, css.indexOf(START)) + css.slice(css.indexOf(END) + END.length));

// Brand files draw third-party logos and the Sederunt mark in their own colours.
const BRAND_FILES = new Set(["brand-logos.js", "provider-marks.js", "sederunt-mark.js"]);
const HEX = /(^|[^&\w/-])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FN = /\b(rgba?|hsla?)\(/g;

function tokens() {
  const map = {};
  for (const m of tokenBlock.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const TOKENS = tokens();
function resolve(value) {
  let v = value;
  for (let i = 0; i < 6 && /^var\(/.test(v); i++) v = TOKENS[v.slice(4, -1)];
  assert.match(v || "", /^#[0-9a-f]{6}$/i, `${value} resolves to a hex colour`);
  return v;
}
function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(resolve(a)), lum(resolve(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("console.css has exactly one token block at the top", () => {
  assert.equal(css.split(START).length, 2);
  assert.equal(css.split(END).length, 2);
  const before = stripComments(css.slice(0, css.indexOf(START))).replace(/@font-face\s*\{[^}]*\}/g, "").trim();
  assert.equal(before, "", "only @font-face may come before the tokens");
  assert.match(tokenBlock, /:root\s*\{/);
});

test("no raw colours in console.css outside the token block", () => {
  const hex = [...outside.matchAll(HEX)].map((m) => `#${m[2]}`);
  const fn = [...outside.matchAll(FN)].map((m) => m[0]);
  assert.deepEqual(hex, [], "hex colours belong in the token block");
  assert.deepEqual(fn, [], "rgb()/hsl() colours belong in the token block");
});

test("no raw colours in console-*.js markup (brand files excepted)", () => {
  const files = readdirSync(src).filter((f) => /^console-.*\.js$/.test(f) && !BRAND_FILES.has(f));
  assert.ok(files.length >= 5, files.join(","));
  const hits = [];
  for (const f of files) {
    const text = readFileSync(new URL(f, src), "utf8");
    for (const m of text.matchAll(HEX)) hits.push(`${f}: #${m[2]}`);
    for (const m of text.matchAll(FN)) hits.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test("every var(--token) used in console.css is defined", () => {
  const defined = new Set(Object.keys(TOKENS));
  // Custom properties set by a rule or inline from markup (per-element values, not design tokens).
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const f of readdirSync(src).filter((f) => f.endsWith(".js"))) {
    for (const m of readFileSync(new URL(f, src), "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
    for (const m of readFileSync(new URL(f, src), "utf8").matchAll(/setProperty\("(--[a-z0-9-]+)"/g)) defined.add(m[1]);
  }
  const missing = [...new Set([...outside.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((v) => !defined.has(v));
  assert.deepEqual(missing, []);
});

test("type, spacing, control and radius scales are fixed", () => {
  const want = {
    "--text-xs": "12px", "--text-sm": "13px", "--text-base": "14px", "--text-lg": "16px", "--text-xl": "20px", "--text-2xl": "28px",
    "--space-1": "4px", "--space-2": "8px", "--space-3": "12px", "--space-4": "16px", "--space-6": "24px", "--space-8": "32px", "--space-12": "48px",
    "--control-xs": "24px", "--control-sm": "28px", "--control-h": "32px", "--control-lg": "40px", "--control-touch": "44px",
    "--radius": "6px", "--radius-control": "var(--radius)", "--radius-card": "var(--radius-xl)", "--radius-pill": "999px",
  };
  for (const [k, v] of Object.entries(want)) assert.equal(TOKENS[k], v, k);
});

test("approved colours hold: primary blue, Connected green, error red, Write amber", () => {
  assert.equal(TOKENS["--primary"], "#2458f6");
  assert.equal(TOKENS["--success-text"], "#146c34");
  assert.equal(TOKENS["--danger-text"], "#b42318");
  assert.equal(TOKENS["--warning-text"], "#8a5a00");
  assert.equal(TOKENS["--info-text"], "#0b4f8a");
});

test("text on every component surface meets WCAG AA (4.5:1)", () => {
  const pairs = {
    "body text": ["var(--foreground)", "var(--background)"],
    "muted text on card": ["var(--muted-foreground)", "var(--card)"],
    "muted text on muted": ["var(--muted-foreground)", "var(--muted)"],
    "primary button": ["var(--primary-foreground)", "var(--primary)"],
    "primary button hover": ["var(--primary-foreground)", "var(--primary-hover)"],
    "link on card": ["var(--primary)", "var(--card)"],
    "badge ok": ["var(--success-text)", "var(--success-subtle)"],
    "badge warn": ["var(--warning-text)", "var(--warning-subtle)"],
    "badge bad": ["var(--danger-text)", "var(--danger-subtle)"],
    "badge info": ["var(--info-text)", "var(--info-subtle)"],
    "badge accent": ["var(--accent-text)", "var(--accent-subtle)"],
    "alert danger": ["var(--danger-strong)", "var(--danger-subtle)"],
    "alert warn": ["var(--warning-strong)", "var(--warning-subtle)"],
    "alert info": ["var(--foreground)", "var(--primary-subtle)"],
    "field error": ["var(--danger-text)", "var(--card)"],
    "danger button": ["var(--danger-text)", "var(--card)"],
    "menu item danger": ["var(--danger-text)", "var(--card)"],
    "menu item danger hover": ["var(--danger-text)", "var(--danger-subtle)"],
    "menu item hover": ["var(--foreground)", "var(--muted)"],
    "menu item checked": ["var(--primary)", "var(--primary-subtle)"],
    "sidebar text": ["var(--sidebar-foreground)", "var(--sidebar-accent)"],
  };
  for (const [name, [fg, bg]] of Object.entries(pairs)) {
    const r = ratio(fg, bg);
    assert.ok(r >= 4.5, `${name}: ${r.toFixed(2)}`);
  }
});

test("components use the tones the design system names", () => {
  const rule = (sel) => {
    const i = outside.indexOf(sel + " {");
    assert.ok(i >= 0, sel);
    return outside.slice(i, outside.indexOf("}", i));
  };
  assert.match(rule(".alert"), /background: var\(--danger-subtle\)[\s\S]*color: var\(--danger-strong\)/);
  assert.match(rule(".alert.warn"), /color: var\(--warning-strong\)/);
  assert.match(outside, /\.badge\.bad \{ background: var\(--danger-subtle\); color: var\(--danger-text\); \}/);
  assert.match(rule("button.danger"), /color: var\(--danger-text\)/);
  assert.match(outside, /\.ob-page \.ob-primary \{[^}]*background: var\(--primary\)/);
});

test("menu item: plain full-width rows with no border or button box; danger rows are red", () => {
  const i = outside.indexOf(".menu-item,\n.menu button,");
  assert.ok(i >= 0, "menu item component");
  const base = outside.slice(i, outside.indexOf("}", i));
  for (const sel of ["#palette-list button", ".account-menu button", "#account-menu #sign-out"]) assert.ok(base.includes(sel), sel);
  assert.match(base, /width: 100%/);
  assert.match(base, /border: 0;/);
  assert.match(base, /background: transparent;/);
  assert.match(base, /box-shadow: none;/);
  assert.match(outside, /\.menu-item:hover,[\s\S]*?background: var\(--muted\)/);
  assert.match(outside, /\.menu-item\.danger,\n#account-menu #sign-out \{ color: var\(--danger-text\); \}/);

  const html = renderConsolePage({ signedIn: true });
  assert.match(html, /id="sign-out" class="menu-item danger"/);
  assert.match(html, /class="menu-item"[^>]*role="menuitemradio"/);
  assert.match(html, /button\.className = "menu-item";/, "palette rows");
});

test("every block in console.css closes, including each @media", () => {
  const text = stripComments(css);
  let depth = 0;
  let media = 0;
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      const head = text.slice(text.lastIndexOf("}", i) + 1, i).trim();
      stack.push(/^@media/.test(head.split("\n").pop().trim()) || /@media[^{;]*$/.test(head));
      depth++;
    } else if (text[i] === "}") {
      assert.ok(depth > 0, `stray } at ${i}`);
      if (stack.pop()) media++;
      depth--;
    }
  }
  assert.equal(depth, 0, "unclosed block");
  assert.ok(media > 10, `media blocks seen: ${media}`);
});
