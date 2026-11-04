import assert from "node:assert/strict";
import test from "node:test";
import { callTool, testConnection } from "../src/connectors/client.js";

const env = { SEDERUNT_MCP_FAKE: "1" };
const URL = "http://127.0.0.1:9/mcp";
const PROTOCOL = "The server did not speak MCP.";
const REFUSED = "The server refused the token.";

function fetchFor(status, body, contentType = "text/plain") {
  return async (_resource, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (method === "GET") {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    return new Response(body, { status, headers: { "content-type": contentType } });
  };
}

async function probe(status, body, contentType) {
  const fetch = fetchFor(status, body, contentType);
  const tested = await testConnection({ url: URL, env, fetch, timeoutMs: 4000 });
  const called = await callTool({ url: URL }, "list_events", {}, { env, fetch, timeoutMs: 4000 });
  return { tested, called };
}

function assertClean(value) {
  const raw = JSON.stringify(value);
  assert.equal(raw.includes("ya29."), false);
  assert.equal(raw.includes("header-secret"), false);
  assert.equal(raw.includes("Bearer"), false);
}

test("a 4xx JSON-RPC result and error message are the tool and test error", async () => {
  const quota = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { isError: true, content: [{ type: "text", text: "Calendar quota exceeded" }] },
  });
  const fromResult = await probe(422, quota, "application/json");
  assert.equal(fromResult.tested.ok, false);
  assert.equal(fromResult.tested.code, "protocol");
  assert.equal(fromResult.tested.message, "Calendar quota exceeded");
  assert.equal(fromResult.called.ok, false);
  assert.equal(fromResult.called.code, "protocol");
  assert.equal(fromResult.called.message, "Calendar quota exceeded");
  assert.equal(fromResult.called.text, "Calendar quota exceeded");

  const denied = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32600, message: "The calendar id is unknown" },
  });
  const fromError = await probe(422, denied, "application/json");
  assert.equal(fromError.tested.message, "The calendar id is unknown");
  assert.equal(fromError.called.message, "The calendar id is unknown");
  assert.equal(fromError.called.text, "The calendar id is unknown");
});

test("plain text and JSON error or message fields are surfaced", async () => {
  const plain = await probe(400, "Room is closed");
  assert.equal(plain.tested.code, "protocol");
  assert.equal(plain.tested.message, "Room is closed");
  assert.equal(plain.called.text, "Room is closed");

  const asError = await probe(409, JSON.stringify({ error: "Forms scope missing" }), "application/json");
  assert.equal(asError.tested.message, "Forms scope missing");
  assert.equal(asError.called.message, "Forms scope missing");

  const asMessage = await probe(422, JSON.stringify({ message: "Try again later" }), "application/json");
  assert.equal(asMessage.tested.message, "Try again later");
  assert.equal(asMessage.called.message, "Try again later");
});

test("readable 4xx text is trimmed and stripped of tokens and headers", async () => {
  const noisy = "Authorization: Bearer ya29.planted-token\nx-secret: header-secret\nCalendar failed";
  const cleaned = await probe(422, noisy);
  assert.equal(cleaned.tested.code, "protocol");
  assert.equal(cleaned.tested.message.includes("ya29."), false);
  assert.equal(cleaned.tested.message.includes("header-secret"), false);
  assert.equal(cleaned.tested.message.includes("Bearer"), false);
  assert.match(cleaned.tested.message, /Calendar failed/);
  assertClean(cleaned.tested);
  assertClean(cleaned.called);
  assert.equal(cleaned.called.text, cleaned.called.message);

  const long = await probe(422, `slow ${"x".repeat(400)}`);
  assert.equal(long.tested.message.length <= 300, true);
  assert.match(long.tested.message, /^slow x+/);
});

test("unreadable 4xx bodies stay on the protocol message", async () => {
  const cases = [
    ["<html><body>nope</body></html>", "text/html"],
    ["{not json", "application/json"],
    [JSON.stringify({ foo: 1 }), "application/json"],
    ["ya29.only-a-token", "text/plain"],
    ["\u0000\u0001", "application/octet-stream"],
  ];
  for (const [body, type] of cases) {
    const result = await probe(422, body, type);
    assert.equal(result.tested.message, PROTOCOL, type);
    assert.equal(result.tested.code, "protocol");
    assert.equal(result.called.message, PROTOCOL);
    assert.equal(result.called.text, "");
    assertClean(result.tested);
  }
});

test("401 stays unauthorized and does not surface the body", async () => {
  const refused = await probe(401, "ya29.should-stay-hidden header-secret");
  assert.equal(refused.tested.ok, false);
  assert.equal(refused.tested.code, "unauthorized");
  assert.equal(refused.tested.message, REFUSED);
  assert.equal(refused.called.code, "unauthorized");
  assert.equal(refused.called.message, REFUSED);
  assert.equal(refused.called.text, "");
  assertClean(refused.tested);
  assertClean(refused.called);
});
