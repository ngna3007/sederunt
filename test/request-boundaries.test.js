import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { readCookie, sealSession } from "../src/console-auth.js";
import { testConnection } from "../src/connectors/client.js";
import { createApp } from "../src/server.js";

async function listen(t, app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => app.close());
  return `http://127.0.0.1:${app.address().port}`;
}
const deps = () => ({ memory: null, tatum: { async getObject() { return { text: "" }; } } });

test("malformed percent encoding in an auth cookie is treated as signed out", async (t) => {
  assert.equal(readCookie("other=ok; sederunt_session=%E0%A4%A", "sederunt_session"), "");
  assert.equal(readCookie("sederunt_session=valid%2Evalue", "sederunt_session"), "valid.value");
  const base = await listen(t, createApp({ env: { SEDERUNT_CONSOLE_SECRET: "fixture" }, deps: deps(), files: false }));
  const response = await fetch(`${base}/console`, { headers: { cookie: "sederunt_session=%" }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /^\/console\/sign-in/);
});

test("HTTP JSON bodies are bounded and malformed requests get a client error", async (t) => {
  const base = await listen(t, createApp({ env: {}, deps: deps(), files: false }));
  for (const [body, status] of [["{", 400], ["x".repeat(1024 * 1024 + 1), 413]]) {
    const response = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /SyntaxError|JSON at position|stack/);
  }
  const badPath = await fetch(`${base}/object/%E0%A4%A`);
  assert.equal(badPath.status, 400);
});

test("HTTP MCP requires the configured console session and refuses cross-site calls", async (t) => {
  const secret = "request-boundary-fixture";
  const base = await listen(t, createApp({ env: { SEDERUNT_CONSOLE_SECRET: secret, SEDERUNT_MEMBER: "owner" }, deps: deps(), files: false }));
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const cookie = `sederunt_session=${sealSession({ memberId: "owner" }, secret)}`;
  for (const path of ["/mcp", "/api/mcp"]) {
    const denied = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(denied.status, 401);
    const crossSite = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://outside.example", "sec-fetch-site": "cross-site" }, body });
    assert.equal(crossSite.status, 403);
  }
  const allowed = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", cookie }, body });
  assert.equal(allowed.status, 200);
  assert.ok((await allowed.json()).result.tools.some(tool => tool.name === "recall"));
});

test("a connector redirect cannot send its credential to a different origin", async (t) => {
  let leaked = 0;
  const target = await listen(t, createServer((_req, res) => { leaked++; res.end("unexpected"); }));
  const source = await listen(t, createServer((_req, res) => { res.writeHead(307, { location: target + "/capture" }); res.end(); }));
  const result = await testConnection({ url: source + "/mcp", auth: { token: "local-test-credential" }, env: { SEDERUNT_MCP_FAKE: "1" }, timeoutMs: 2000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "blocked-url");
  assert.equal(leaked, 0);
});

test("wrapping a write-only memory adapter does not invent read methods", async () => {
  const { bindMemoryTenant } = await import("../src/server.js");
  const { rebuildCompanyIndex } = await import("../src/typed-path.js");
  const { createSession } = await import("../src/session.js");
  const wrapped = bindMemoryTenant({ allowUnscoped: true, async remember() {} }, "");
  assert.equal(wrapped.index, undefined);
  assert.equal(wrapped.recall, undefined);
  assert.deepEqual(await rebuildCompanyIndex(createSession(), { memory: wrapped }), { ok: true, empty: true });
});

test("meeting hearing holds do not cross workspace sessions with the same room id", async () => {
  const { handleUtterance } = await import("../src/typed-path.js");
  const { createSession } = await import("../src/session.js");
  const first = createSession();
  const second = createSession();
  first.hearing = { name: "Maple", triggers: [] };
  const room = { id: "shared-provider-id", kind: "meeting", source: "recall", botPresent: true, memberIds: ["member"] };
  await handleUtterance({ session: first, door: "meeting", text: "Maple.", memberId: "member", room });
  assert.ok(first.hearingHold?.until > Date.now());
  const secondResult = await handleUtterance({ session: second, door: "meeting", text: "The launch is on Monday.", memberId: "member", room });
  assert.equal(secondResult.kind, "silence");
  assert.equal(second.decisions.length, 0);
});

test("HTTP MCP rejects another workspace even with a valid OAuth cookie", async (t) => {
  const own = "11111111-1111-4111-a111-111111111111";
  const other = "22222222-2222-4222-a222-222222222222";
  const secret = "workspace-boundary-fixture";
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: secret };
  const identity = { async myTenants() { return [{ id: own, kind: "team", name: "Fixture workspace" }]; } };
  const base = await listen(t, createApp({ env, identity, deps: deps(), files: false }));
  const cookie = `sederunt_session=${sealSession({ kind: "oauth", userId: "fixture-user", memberId: "fixture-user", tenantId: own, accessToken: "fixture-token", accessExp: Date.now() + 3600000 }, secret)}`;
  for (const path of ["/mcp", "/api/mcp"]) {
    const response = await fetch(base + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", name: "recall", arguments: { company: other }, params: { name: "recall", arguments: { company: other } } }) });
    assert.equal(response.status, 403);
    const spoofArgs = { company: own, memberId: "another-user" };
    const spoofed = await fetch(base + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", name: "recall", arguments: spoofArgs, params: { name: "recall", arguments: spoofArgs } }) });
    assert.equal(spoofed.status, 200);
    assert.match(await spoofed.text(), /not-invited/);
  }
});
