import assert from "node:assert/strict";
import test from "node:test";
import { renderPeopleMatching, overrideFromControl } from "../src/console/people-matching.js";
import { renderConsolePage } from "../src/console-page.js";
import { createMemoryMatchStore, matchInvitees } from "../src/slack/match.js";

const rows = [
  { email: "lan@example.com", slackUserId: "U04LAN", source: "lookup" },
  { email: "guest@example.com", slackUserId: null, source: "none" },
];

test("people matching lists email, Slack user, and source", () => {
  const html = renderPeopleMatching({ matches: rows, canOverride: false });
  assert.match(html, /id="people-matching"/);
  assert.match(html, /People matching/);
  assert.match(html, /lan@example.com/);
  assert.match(html, /U04LAN/);
  assert.match(html, /data-source="lookup"/);
  assert.match(html, /data-source="none"/);
  assert.match(html, /data-delivery="email"/);
  assert.doesNotMatch(html, /data-save-override/);
  assert.doesNotMatch(html, /<input/);
});

test("only an admin gets the override control", () => {
  const html = renderPeopleMatching({ matches: rows, canOverride: true });
  assert.match(html, /data-save-override="lan@example.com"/);
  assert.match(html, /data-override-for="guest@example.com"/);
  const escaped = renderPeopleMatching({
    matches: [{ email: `a@b.com" onmouseover="alert(1)`, slackUserId: "<U1>", source: "lookup" }],
    canOverride: true,
  });
  assert.doesNotMatch(escaped, /onmouseover="/);
  assert.match(escaped, /&quot; onmouseover=&quot;/);
  assert.match(escaped, /&lt;U1&gt;/);
});

test("the account page includes People matching", () => {
  const page = renderConsolePage({
    peopleMatches: rows,
    canAdmin: true,
  });
  assert.match(page, /id="people-matching"/);
  assert.match(page, /data-save-override="lan@example.com"/);
  const member = renderConsolePage({ peopleMatches: rows, canAdmin: false });
  assert.match(member, /id="people-matching"/);
  assert.doesNotMatch(member, /data-save-override/);
});

test("saving an override wins the next match", async () => {
  const store = createMemoryMatchStore();
  await store.upsertLookup({ tenantId: "acme", workspaceId: "T1", email: "lan@example.com", slackUserId: "UOLD" });
  const override = overrideFromControl({
    email: "Lan@Example.com",
    slackUserId: "U04LAN",
    overriddenBy: "alice",
    tenantId: "acme",
    workspaceId: "T1",
  });
  await store.setOverride(override);
  let calls = 0;
  const matched = await matchInvitees({
    invitees: ["lan@example.com"],
    token: "xoxb-test",
    fetchImpl: async () => { calls += 1; return { ok: true, status: 200, headers: { get: () => "" }, json: async () => ({ ok: true, user: { id: "UNEW" } }) }; },
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(calls, 0);
  assert.equal(matched.matches[0].source, "override");
  assert.equal(matched.matches[0].slackUserId, "U04LAN");
  const cleared = overrideFromControl({ email: "lan@example.com", slackUserId: "", overriddenBy: "alice", tenantId: "acme", workspaceId: "T1" });
  assert.equal(cleared.slackUserId, null);
});
