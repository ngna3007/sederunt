import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clips = ["join.mp4", "implement.mp4", "remember.mp4", "tenants.mp4"];

function ignoreLines() {
  return readFileSync(join(root, ".vercelignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

test("vercelignore excludes the Remotion project, not the landing videos", () => {
  const lines = ignoreLines();
  assert.ok(lines.includes("/clips/"), "the root Remotion project must stay out of the deploy");
  assert.ok(!lines.includes("clips/"), "a bare clips/ pattern also drops public/clips");
  assert.ok(!lines.some((line) => line === "public/clips" || line === "public/clips/" || line === "/public/clips/" || line === "public/clips/**"));
});

test("the landing clips are H.264 mp4 files the server can range-serve", async () => {
  const app = createApp({
    env: {},
    files: false,
    deps: {
      memory: null,
      tatum: { async getObject() { return {}; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    for (const name of clips) {
      const onDisk = readFileSync(join(root, "public", "clips", name));
      assert.ok(onDisk.length > 1000, `${name} is missing or empty`);
      assert.ok(onDisk.subarray(4, 8).toString("ascii") === "ftyp", `${name} is not an mp4`);

      const full = await get(port, `/clips/${name}`);
      assert.equal(full.status, 200, `${name} ${full.status}`);
      assert.equal(full.headers["content-type"], "video/mp4");
      assert.equal(full.headers["accept-ranges"], "bytes");
      assert.equal(Number(full.headers["content-length"]), onDisk.length);
      assert.deepEqual(full.body, onDisk);

      const partial = await get(port, `/clips/${name}`, { Range: "bytes=0-15" });
      assert.equal(partial.status, 206, `${name} range ${partial.status}`);
      assert.equal(partial.headers["content-type"], "video/mp4");
      assert.equal(partial.headers["content-range"], `bytes 0-15/${onDisk.length}`);
      assert.deepEqual(partial.body, onDisk.subarray(0, 16));
    }

    const missing = await get(port, "/clips/missing.mp4");
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}
