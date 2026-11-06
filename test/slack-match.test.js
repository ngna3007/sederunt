import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryMatchStore, lookupByEmail, matchInvitees } from "../src/slack/match.js";

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || "" },
    json: async () => body,
  };
}

test("lookup finds a user, caches it, and does not call Slack again", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body), auth: init.headers.authorization });
    return jsonResponse(200, { ok: true, user: { id: "U04LAN" } });
  };
  const store = createMemoryMatchStore();
  const first = await matchInvitees({
    invitees: ["Lan@Example.com"],
    token: "xoxb-test",
    fetchImpl,
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(first.ok, true);
  assert.equal(first.matches[0].email, "lan@example.com");
  assert.equal(first.matches[0].slackUserId, "U04LAN");
  assert.equal(first.matches[0].source, "lookup");
  assert.equal(first.matches[0].delivery, "slack");
  assert.equal(calls[0].url, "https://slack.com/api/users.lookupByEmail");
  assert.match(calls[0].body, /email=lan%40example\.com/);
  assert.equal(calls[0].auth, "Bearer xoxb-test");
  const second = await matchInvitees({
    invitees: ["lan@example.com"],
    token: "xoxb-test",
    fetchImpl,
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(second.matches[0].source, "lookup");
  assert.equal(calls.length, 1);
});

test("users_not_found is delivery email and is cached as none", async () => {
  const fetchImpl = async () => jsonResponse(200, { ok: false, error: "users_not_found" });
  const store = createMemoryMatchStore();
  const matched = await matchInvitees({
    invitees: ["guest@example.com"],
    token: "xoxb-test",
    fetchImpl,
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(matched.matches[0].source, "none");
  assert.equal(matched.matches[0].slackUserId, null);
  assert.equal(matched.matches[0].delivery, "email");
});

test("missing_scope stops the batch and is not cached", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { ok: false, error: "missing_scope" });
  };
  const store = createMemoryMatchStore();
  const matched = await matchInvitees({
    invitees: ["a@example.com", "b@example.com"],
    token: "xoxb-test",
    fetchImpl,
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(matched.ok, false);
  assert.equal(matched.code, "missing_scope");
  assert.equal(matched.needed, "users:read.email");
  assert.equal(calls, 1);
  assert.equal(await store.get({ tenantId: "acme", workspaceId: "T1", email: "a@example.com" }), null);
});

test("a rate limit waits for Retry-After and then succeeds", async () => {
  const waits = [];
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(429, { ok: false, error: "ratelimited" }, { "retry-after": "2" });
    return jsonResponse(200, { ok: true, user: { id: "U04MAI" } });
  };
  const looked = await lookupByEmail({
    email: "mai@example.com",
    token: "xoxb-test",
    fetchImpl,
    sleep: async (ms) => { waits.push(ms); },
  });
  assert.equal(looked.slackUserId, "U04MAI");
  assert.deepEqual(waits, [2000]);
  assert.equal(calls, 2);
});

test("an admin override wins and a later lookup does not replace it", async () => {
  const calls = [];
  const fetchImpl = async () => {
    calls.push("lookup");
    return jsonResponse(200, { ok: true, user: { id: "UOTHER" } });
  };
  const store = createMemoryMatchStore();
  await store.setOverride({
    tenantId: "acme",
    workspaceId: "T1",
    email: "Lan@Example.com",
    slackUserId: "U04LAN",
    overriddenBy: "alice",
  });
  const matched = await matchInvitees({
    invitees: ["lan@example.com"],
    token: "xoxb-test",
    fetchImpl,
    store,
    tenantId: "acme",
    workspaceId: "T1",
  });
  assert.equal(matched.matches[0].source, "override");
  assert.equal(matched.matches[0].slackUserId, "U04LAN");
  assert.equal(matched.matches[0].delivery, "slack");
  assert.equal(calls.length, 0);
  const raced = await store.upsertLookup({
    tenantId: "acme",
    workspaceId: "T1",
    email: "lan@example.com",
    slackUserId: "UOTHER",
  });
  assert.equal(raced.source, "override");
  assert.equal(raced.slackUserId, "U04LAN");
});

test("an invalid email does not call Slack", async () => {
  let calls = 0;
  const looked = await lookupByEmail({
    email: "not-an-email",
    token: "xoxb-test",
    fetchImpl: async () => { calls += 1; return jsonResponse(200, { ok: true, user: { id: "U1" } }); },
  });
  assert.equal(looked.code, "invalid_email");
  assert.equal(calls, 0);
});
