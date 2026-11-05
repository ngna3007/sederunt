import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";

test("Ask AI stays in the rail as Coming soon and opens an MCP modal", () => {
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
  assert.match(html, /Ask AI<span class="rail-soon"[^>]*>Soon<\/span>/);
  assert.match(html, /page-title">Ask AI <span class="soon-chip">Coming soon<\/span>/);
  assert.match(html, /id="ask-ai-dialog"/);
  assert.match(html, /Ask AI is coming soon/);
  assert.match(html, /add an agent under Connectors \(MCP\)/);
  assert.match(html, /id="ask-ai-connectors"/);
  assert.doesNotMatch(html, /OpenRouter|paid model|blockchain/i);

  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.match(page, /openDialog\("ask-ai-dialog"\)/);
  assert.match(page, /ask-ai-connectors[\s\S]*showSection\("mcp"\)/);
  assert.match(page, /if \(name === "chat"\) return "Ask AI";/);
});
