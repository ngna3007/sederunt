import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { callTool, listTools, testConnection } from "../src/connectors/client.js";
import { createFormsApp } from "../src/mcp-forms/http.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        accept: headers.accept || "application/json",
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json(response) {
  return JSON.parse(response.raw);
}

test("built-in forms preset does not fetch loopback", async (t) => {
  const calls = [];
  const spy = async (resource) => {
    const url = resource instanceof URL ? resource.href : String(resource?.url || resource);
    calls.push(url);
    throw new Error("unexpected fetch");
  };
  const previous = globalThis.fetch;
  globalThis.fetch = spy;
  t.after(() => {
    globalThis.fetch = previous;
  });

  const forms = createFormsApp({ env: { SEDERUNT_FORMS_FAKE: "1" }, fetchImpl: spy, origin: "http://127.0.0.1:9" });
  const legacy = {
    url: "http://127.0.0.1:9/mcp/forms",
    preset: "google-forms",
    forms,
    origin: "http://127.0.0.1:9",
    env: { SEDERUNT_MCP_FAKE: "0", SEDERUNT_FORMS_FAKE: "1", SEDERUNT_PUBLIC_ORIGIN: "http://127.0.0.1:9" },
  };
  const tested = await testConnection(legacy);
  assert.equal(tested.ok, true);
  assert.equal(tested.tools.length, 5);
  const names = await listTools(legacy);
  assert.deepEqual(names.map((tool) => tool.name).sort(), ["add_questions", "create_form", "get_form", "list_responses", "publish_form"]);
  const read = await callTool(legacy, "get_form", { formId: "fake-form-seed" }, { env: legacy.env });
  assert.equal(read.ok, true);
  assert.equal(JSON.parse(read.text).title, "Weekly feedback");

  const blocked = await testConnection({
    url: "http://127.0.0.1:9/mcp",
    env: { SEDERUNT_MCP_FAKE: "0" },
    fetch: spy,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "invalid-url");

  const env = {
    SEDERUNT_FORMS_FAKE: "1",
    SEDERUNT_MCP_FAKE: "0",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
    SEDERUNT_PUBLIC_ORIGIN: "http://127.0.0.1:9",
  };
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    fetch: spy,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
  const port = await listen(app);
  env.SEDERUNT_PUBLIC_ORIGIN = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  const page = await call(port, "GET", "/console/connectors", null, { accept: "text/html" });
  assert.match(page.raw, /Built in/);
  const added = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}));
  assert.equal(added.ok, true);
  assert.equal(added.connector.url, "builtin:google-forms");
  assert.equal(added.connector.preset, "google-forms");
  assert.equal(added.connector.tools.length, 5);

  const form = json(await call(port, "POST", "/mcp", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "google-forms__get_form", arguments: { formId: "fake-form-seed" } },
  }));
  assert.equal(form.result.structuredContent.ok, true);
  assert.equal(JSON.parse(form.result.structuredContent.text).title, "Weekly feedback");

  const again = json(await call(port, "POST", `/console/connectors/${added.connector.id}/test`, {}));
  assert.equal(again.test.ok, true);
  assert.equal(again.connector.url, "builtin:google-forms");

  const held = json(await call(port, "POST", "/mcp", {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "google-forms__create_form",
      arguments: { title: "Launch check", questions: [{ title: "Ready?", type: "short_text" }] },
    },
  }));
  assert.equal(held.result.structuredContent.held, true);
  const created = json(await call(port, "POST", "/mcp", {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "google-forms__create_form",
      arguments: {
        title: "Launch check",
        questions: [{ title: "Ready?", type: "short_text" }],
        _confirm: held.result.structuredContent.actionId,
      },
    },
  }));
  assert.equal(created.result.structuredContent.ok, true);
  const preview = await call(port, "GET", "/forms/fake/fake-form-1/viewform", null, { accept: "text/html" });
  assert.equal(preview.status, 200);

  const loopback = calls.filter((url) => /127\.0\.0\.1|localhost|\[::1\]|\/mcp\/forms/i.test(url));
  assert.deepEqual(loopback, []);
});
