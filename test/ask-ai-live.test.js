import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";

test("Ask AI is live in the rail: no Coming soon, no MCP gate, a daily quota pill", () => {
  const html = renderConsolePage({
    email: "demo@example.com",
    name: "Demo",
    rooms: [],
    decisions: [],
    meetings: [],
    people: [],
    history: [],
    connectors: {},
    read: "empty",
  });
  assert.match(html, /data-show="chat"[^>]*data-label="Ask AI"/);
  assert.doesNotMatch(html, /rail-soon|soon-chip|Coming soon|Ask AI is coming soon/);
  assert.match(html, /id="ask-quota"/);
  assert.match(html, /id="chat-form"/);
  // The dialog only explains the daily limit now, and still points at Connectors.
  assert.match(html, /id="ask-ai-dialog"/);
  assert.match(html, /questions a day/);
  assert.match(html, /id="ask-ai-connectors"/);
  assert.doesNotMatch(html, /OpenRouter|paid model|blockchain/i);

  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.match(page, /fetch\("\/api\/ask"/);
  assert.match(page, /new EventSource\("\/api\/ask\/"/);
  assert.match(page, /if \(name === "chat"\) loadAsks\(\);/);
  assert.doesNotMatch(page, /data-seen/);
  assert.match(page, /if \(name === "chat"\) return "Ask AI";/);
});
