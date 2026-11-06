import assert from "node:assert/strict";
import test from "node:test";
import { guardConnectorUrl, isBlockedAddress, loopbackFakeAllowed } from "../src/connectors/url-guard.js";

function lookupOf(...addresses) {
  return async () => addresses.map((address) => ({ address }));
}

test("url guard allows public https and refuses private answers", async () => {
  const ok = await guardConnectorUrl("https://mcp.example/tools", { env: {}, lookup: lookupOf("1.2.3.4") });
  assert.equal(ok.href, "https://mcp.example/tools");
  const blocked = [
    "10.1.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.0.8",
    "172.16.0.1",
    "100.64.0.1",
    "192.0.2.10",
    "0.0.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
  ];
  for (const address of blocked) {
    await assert.rejects(
      () => guardConnectorUrl("https://mcp.example/tools", { env: {}, lookup: lookupOf(address) }),
      (error) => error.code === "blocked-url",
      address,
    );
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress("1.2.3.4"), false);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
});

test("url guard fails closed and rejects unsafe urls", async () => {
  await assert.rejects(
    () => guardConnectorUrl("https://mcp.example", { env: {}, lookup: async () => { throw new Error("dns down"); } }),
    (error) => error.code === "blocked-url",
  );
  const rejected = [
    "http://mcp.example/mcp",
    "ftp://mcp.example/mcp",
    "https://user:secret@mcp.example/mcp",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://2130706433/",
    "not a url",
  ];
  for (const raw of rejected) {
    await assert.rejects(() => guardConnectorUrl(raw, { env: {}, lookup: lookupOf("1.2.3.4") }), (error) => error.code === "invalid-url" || error.code === "blocked-url");
  }
  await assert.rejects(
    () => guardConnectorUrl("https://0177.0.0.1/", { env: {}, lookup: lookupOf("1.2.3.4") }),
    (error) => error.code === "blocked-url" || error.code === "invalid-url",
  );
});

test("loopback http is only allowed for the fake server", async () => {
  assert.equal(loopbackFakeAllowed({}), false);
  assert.equal(loopbackFakeAllowed({ SEDERUNT_MCP_FAKE: "1" }), true);
  assert.equal(loopbackFakeAllowed({ SEDERUNT_AUTH_FAKE: "1" }), true);
  assert.equal(loopbackFakeAllowed({ SEDERUNT_AUTH_FAKE: "1", SEDERUNT_MCP_FAKE: "0" }), false);
  await assert.rejects(() => guardConnectorUrl("http://127.0.0.1:9/mcp", { env: {}, lookup: lookupOf("127.0.0.1") }), (error) => error.code === "invalid-url");
  const allowed = await guardConnectorUrl("http://127.0.0.1:9/mcp", { env: { SEDERUNT_MCP_FAKE: "1" }, lookup: lookupOf("10.0.0.1") });
  assert.equal(allowed.hostname, "127.0.0.1");
  const localhost = await guardConnectorUrl("http://localhost:9/mcp", { env: { SEDERUNT_AUTH_FAKE: "1" } });
  assert.equal(localhost.hostname, "localhost");
  await assert.rejects(
    () => guardConnectorUrl("http://127.0.0.1:9/mcp", { env: { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_MCP_FAKE: "0" } }),
    (error) => error.code === "invalid-url",
  );
  await assert.rejects(
    () => guardConnectorUrl("https://127.0.0.1/mcp", { env: { SEDERUNT_MCP_FAKE: "1" } }),
    (error) => error.code === "blocked-url",
  );
});
