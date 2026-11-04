import assert from "node:assert/strict";
import test from "node:test";
import { callTool, testConnection } from "../src/connectors/client.js";
import { startFakeMcpServer } from "../src/connectors/fake-server.js";

const env = { SEDERUNT_MCP_FAKE: "1" };
const TOKEN = "demo-token-please-do-not-log";

test("client connects, pages tools, and calls the fake server", async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  t.after(() => fake.close());
  const connected = await testConnection({ url: fake.url, auth: { token: TOKEN, headerName: "Authorization" }, env, timeoutMs: 4000 });
  assert.equal(connected.ok, true, connected.message);
  assert.equal(connected.serverInfo.name, "Demo tools");
  assert.equal(connected.protocolVersion, "2025-11-25");
  assert.deepEqual(connected.tools.map((tool) => tool.name), ["lookup_customer", "create_note", "delete_note", "ping_status"]);
  assert.equal(connected.tools[0].annotations.readOnlyHint, true);
  assert.equal(connected.tools[2].annotations.destructiveHint, true);
  assert.equal(connected.tools[3].annotations && connected.tools[3].annotations.readOnlyHint, undefined);
  assert.equal(fake.calls.filter((call) => call.method === "tools/list").length >= 2, true);
  const called = await callTool({ url: fake.url, token: TOKEN, headerName: "Authorization" }, "lookup_customer", { id: "acme", z: 1 }, { env, timeoutMs: 4000 });
  assert.equal(called.ok, true, called.message);
  assert.equal(called.text, `lookup_customer:${JSON.stringify({ id: "acme", z: 1 })}`);
  assert.equal(JSON.stringify(connected).includes(TOKEN), false);
});

test("client reports a refused token and a timeout", async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  t.after(() => fake.close());
  const refused = await testConnection({ url: fake.url, auth: { token: "wrong-token-value" }, env, timeoutMs: 4000 });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "unauthorized");
  assert.equal(refused.message, "The server refused the token.");
  assert.equal(JSON.stringify(refused).includes(TOKEN), false);
  assert.equal(JSON.stringify(refused).includes("wrong-token-value"), false);
  fake.setMode("hang");
  const started = Date.now();
  const hung = await testConnection({ url: fake.url, auth: { token: TOKEN }, env, timeoutMs: 300 });
  assert.equal(hung.ok, false);
  assert.equal(hung.code, "timeout");
  assert.equal(hung.message, "The server did not answer in time.");
  assert.ok(Date.now() - started < 3000);
});

test("client falls back to SSE when streamable HTTP is missing", async (t) => {
  const fake = await startFakeMcpServer({ protocol: "sse" });
  t.after(() => fake.close());
  const connected = await testConnection({ url: fake.url, env, timeoutMs: 4000 });
  assert.equal(connected.ok, true, connected.message);
  assert.equal(connected.tools.length, 4);
  const called = await callTool({ url: fake.url, transport: "sse" }, "ping_status", {}, { env, transport: "sse", timeoutMs: 4000 });
  assert.equal(called.ok, true, called.message);
  assert.match(called.text, /^ping_status:/);
});

test("client rejects urls that are not allowed before fetching", async () => {
  const blocked = await testConnection({ url: "http://10.1.1.1/mcp", env: {}, timeoutMs: 500 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "invalid-url");
  assert.equal(blocked.message, "Enter a valid server URL.");
});
