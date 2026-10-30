import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { test } from "node:test";
import { MAX_UPLOAD_BYTES, createConsoleAdapter } from "../src/console/upload.js";
import { createApp } from "../src/server.js";

test("an upload waits until completed and a download returns the plaintext without the api key on the file host", async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    seen.push({ href, authorization: init.headers?.authorization || null, method: init.method || "GET" });
    if (href.endsWith("/buckets/folder-1") && !href.includes("/files")) {
      return json({ data: { seal_policy_id: "0xpolicy" } });
    }
    if (href.endsWith("/files") && init.method === "POST") {
      assert.equal(init.body instanceof FormData, true);
      return json({ data: { id: "file-1" } }, 202);
    }
    if (href.endsWith("/status")) {
      const prior = seen.filter((call) => call.href.endsWith("/status")).length;
      return json({ data: { state: prior > 1 ? "completed" : "queued" } });
    }
    if (href.endsWith("/download")) {
      return {
        status: 307,
        ok: false,
        headers: { get: (name) => (name === "location" ? "https://files.example/cipher" : null) },
        json: async () => ({}),
      };
    }
    if (href === "https://files.example/cipher") {
      assert.equal(init.headers, undefined);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([9]).buffer,
      };
    }
    throw new Error(`unexpected ${href}`);
  };
  const adapter = createConsoleAdapter({
    apiKey: "hbr_test",
    serviceKey: "service-key",
    folderId: "folder-1",
    fetch: fetchImpl,
    wait: async () => {},
    encrypt: async (plain) => plain,
    decrypt: async () => new TextEncoder().encode("hello from the folder"),
  });
  const saved = await adapter.upload({ name: "offsite.txt", bytes: "hello from the folder" });
  assert.deepEqual(saved, { id: "file-1", folderId: "folder-1", state: "completed" });
  assert.equal(await adapter.download({ id: "file-1" }), "hello from the folder");
  assert.equal(seen.some((call) => call.href === "https://files.example/cipher" && call.authorization), false);
});

test("a file over the upload cap is refused before the folder is read", async () => {
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
  let called = false;
  const adapter = createConsoleAdapter({
    apiKey: "hbr_test",
    serviceKey: "service-key",
    folderId: "folder-1",
    maxBytes: 4,
    fetch: async () => {
      called = true;
      return json({});
    },
    encrypt: async (plain) => plain,
  });
  await assert.rejects(() => adapter.upload({ name: "big.txt", bytes: "hello" }), /payload_too_large/);
  assert.equal(called, false);
  assert.deepEqual(adapter.calls, ["big.txt"]);
});

test("the console page says the sentence lives in Walrus Memory", async () => {
  const app = createApp({ deps: { tatum: { async getObject() { throw new Error("Tatum read failed"); } } } });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const opened = await new Promise((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port: app.address().port, path: "/console" }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(opened.status, 200);
    assert.match(opened.raw, /Onboard/);
    assert.match(opened.raw, /Walrus Memory/);
    assert.match(opened.raw, /metadata/);
    assert.equal(opened.raw.includes("—"), false);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

function json(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
