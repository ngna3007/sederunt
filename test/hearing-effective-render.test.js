import test from "node:test";
import assert from "node:assert/strict";
import { renderConsolePage } from "../src/console-page.js";

test("setup guest fields render the effective default, not blank", () => {
  const html = renderConsolePage({});
  assert.match(html, /id="hearing-name"[^>]*value="Maple"/);
  assert.doesNotMatch(html, /heard\.name !== "Maple" \? heard\.name : ""/);
});

test("setup guest fields render a saved guest and escape it", () => {
  const html = renderConsolePage({ hearing: { name: "Adam", triggers: ["Hey Adam", "<b>x</b>"] } });
  assert.match(html, /id="hearing-name"[^>]*value="Adam"/);
  assert.match(html, /placeholder="A sentence that wakes the bot">Hey Adam\n&lt;b&gt;x&lt;\/b&gt;<\/textarea>/);
});

test("new room edits the trigger and does not say joining is available", () => {
  const html = renderConsolePage({ meeting: true, hearing: { name: "Adam", triggers: [] } });
  assert.match(html, /id="join-trigger"[^>]*>Adam<\/textarea>/);
  assert.match(html, /People say this to wake the bot/);
  assert.doesNotMatch(html, /Joining is available/);
  assert.doesNotMatch(html, />Meet is ready\./);
  const off = renderConsolePage({});
  assert.match(off, /Joining meetings is not set up on this server yet/);
  assert.match(off, /id="join-trigger"[^>]*>Maple<\/textarea>/);
});

test("setup Slack is not connected from env readiness alone", () => {
  const html = renderConsolePage({ slackReady: true });
  assert.match(html, /id="slack-conn" class="conn-state off">Not connected/);
  assert.match(renderConsolePage({ slackConnected: true }), /id="slack-conn" class="conn-state">Connected/);
});
