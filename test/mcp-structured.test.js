import assert from "node:assert/strict";
import test from "node:test";
import { redactStructured } from "../src/connectors/expose.js";
import { presentCustomToolResult } from "../src/mcp.js";

test("custom tool results keep structured content and a text fallback", () => {
  const upstream = { formId: "Form_1", title: "Standup", published: true, questionCount: 1 };
  const shown = presentCustomToolResult({
    ok: true,
    text: 'Created "Standup" (Form_1).',
    structuredContent: upstream,
  });
  assert.equal(shown.structuredContent, upstream);
  assert.equal(shown.content[0].text, 'Created "Standup" (Form_1).');
  assert.equal(shown.isError, undefined);

  const plain = presentCustomToolResult({ ok: true, text: "ping_status:{}" });
  assert.equal(Object.hasOwn(plain, "structuredContent"), false);
  assert.equal(plain.content[0].text, "ping_status:{}");

  const fallback = presentCustomToolResult({ ok: true, text: "", structuredContent: { id: "acme", note: "demo" } });
  assert.deepEqual(fallback.structuredContent, { id: "acme", note: "demo" });
  assert.equal(fallback.content[0].text, JSON.stringify({ id: "acme", note: "demo" }));

  const held = presentCustomToolResult({
    held: true,
    actionId: "mcp-hold-1",
    tool: "demo__create_note",
    actionClass: "write",
    preference: "ask",
    text: "Needs confirmation before demo__create_note runs.",
  });
  assert.deepEqual(held.structuredContent, {
    held: true,
    needsConfirmation: true,
    actionId: "mcp-hold-1",
    tool: "demo__create_note",
    actionClass: "write",
    preference: "ask",
  });
  assert.match(held.content[0].text, /Needs confirmation before demo__create_note/);

  const error = presentCustomToolResult({
    ok: false,
    code: "needs_access",
    text: "Google needs you to sign in again.",
  });
  assert.equal(error.isError, true);
  assert.deepEqual(error.structuredContent, {
    code: "needs_access",
    message: "Google needs you to sign in again.",
  });
  assert.equal(error.content[0].text, "Google needs you to sign in again.");
});

test("structured tool results drop bearer tokens", () => {
  const token = "ya29.super-secret-token";
  const cleaned = redactStructured({
    title: `hello ${token}`,
    nested: { authorization: `Bearer ${token}` },
  }, token);
  const encoded = JSON.stringify(cleaned);
  assert.equal(encoded.includes(token), false);
  assert.equal(encoded.includes("ya29."), false);
  assert.equal(encoded.includes("Bearer"), false);
  const same = { id: "acme", note: "demo" };
  assert.equal(redactStructured(same, token), same);
});
