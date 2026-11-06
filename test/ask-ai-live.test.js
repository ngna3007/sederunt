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
  assert.match(html, /id="ask-send"/);
  assert.match(html, /class="ask-avatar"|ask-avatar/);
  assert.match(html, /id="chat-log"/);
  assert.match(html, /Thinking/);
  assert.match(html, /id="chat-suggests"/);
  assert.match(page, /function humanAskText/);
  assert.match(page, /function stopAsk/);
  assert.doesNotMatch(html, /source === "retrieval" && done\.result/);
  assert.match(html, /id="ask-send" class="primary" type="button"/);
  assert.match(page, /var askBusy = false/);
  assert.match(page, /if \(askBusy\) return/);
  assert.match(page, /if \(askBusy \|\| askSend\.disabled\) return/);
  assert.match(page, /askSend\.disabled = true/);
  assert.doesNotMatch(page, /button\.type = on \? "button" : "submit"/);
  assert.doesNotMatch(page, /if \(!askState\.streams\[reply\.body\.id\]\) releaseAsk\(\)/);
  const settle = page.slice(page.indexOf("function settleAsk"), page.indexOf("var askSend"));
  assert.doesNotMatch(settle, /requestSubmit|fetch\("\/api\/ask"/);
  const follow = page.slice(page.indexOf("function followAsk"), page.indexOf("function drawAnswer"));
  assert.doesNotMatch(follow, /requestSubmit|method: "POST"/);
  assert.match(follow, /if \(data\.quota\) takeAskQuota\(data\.quota\)/);
  const load = page.slice(page.indexOf("function loadAsks"), page.indexOf("function showAskThread"));
  assert.match(load, /fetch\("\/api\/ask"/);
  assert.doesNotMatch(load, /method:\s*"POST"/);
  assert.match(load, /priorAsksForThread\(Array\.isArray\(data\.asks\) \? data\.asks : \[\]\)/);
  assert.match(load, /if \(followAsk\(ask\.id, turn, ask\.count \|\| 0\)\) askBusy = true/);
  const stop = page.slice(page.indexOf("function stopAsk"), page.indexOf("function followAsk"));
  assert.doesNotMatch(stop, /releaseAsk\(\);\s*var live = askLive/);
  const enter = page.slice(page.indexOf('chatBox.addEventListener("keydown"'), page.indexOf('document.getElementById("goto")'));
  assert.match(enter, /askBusy \|\| askSendLocked\(\)/);
  assert.match(enter, /ask-stop|askSendLocked/);
  const suggest = page.slice(page.indexOf("var suggestBox"), page.indexOf("var roomPrev"));
  assert.match(suggest, /askSendLocked\(\)/);
  const click = page.slice(page.indexOf("var askSend = document.getElementById"), page.indexOf('document.getElementById("chat-form").addEventListener("submit"'));
  assert.match(click, /askSend\.disabled = true[\s\S]*requestSubmit/);
});
