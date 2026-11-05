import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";

const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");

function mcpCardSource(html) {
  const start = html.indexOf("function mcpCard");
  const end = html.indexOf("function openMcpManage", start);
  assert.ok(start > 0 && end > start);
  return html.slice(start, end);
}

test("preset status badges stay in the right-hand slot after the class changes", () => {
  const html = renderConsolePage({});
  for (const id of ["google-forms", "google-calendar"]) {
    const start = html.indexOf(`data-preset="${id}"`);
    const card = html.slice(start, html.indexOf("</button>", start));
    const head = card.indexOf("preset-head");
    const detail = card.indexOf("preset-detail");
    const badge = card.indexOf("data-preset-badge");
    assert.ok(head > 0 && detail > head && badge > detail, id);
  }
  assert.match(css, /\.preset-card \[data-preset-badge\]\s*\{[^}]*grid-column:\s*2/);
  assert.match(css, /\.preset-card \[data-preset-badge\]\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s*2/);
  assert.doesNotMatch(css, /\.preset-card \.preset-action\s*\{[^}]*grid-column/);
});

test("connector cards place the status badge beside Manage, not in the title", () => {
  const card = mcpCardSource(renderConsolePage({}));
  const who = card.indexOf("who.append(mcpIcon(connector), title)");
  const actions = card.indexOf("actions.append(pill, manage)");
  const head = card.indexOf("head.append(who, actions)");
  assert.ok(who > 0 && actions > who && head > actions);
  assert.doesNotMatch(card, /who\.append\([^)]*\bpill\b/);
  assert.match(css, /\.mcp-card-actions\s*\{[^}]*margin-left:\s*auto/);
});
