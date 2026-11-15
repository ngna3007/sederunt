import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../src/server.js";
import { renderLanding } from "../src/landing.js";
import { renderConsolePage } from "../src/console-page.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("renderLanding keeps clips, Slack logos, and the FAQ", () => {
  const html = renderLanding();
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Join the room/);
  assert.match(html, /src="\/clips\/join\.mp4"/);
  assert.match(html, /src="\/clips\/remember\.mp4"/);
  assert.match(html, /src="\/clips\/implement\.mp4"/);
  assert.match(html, /src="\/clips\/tenants\.mp4"/);
  assert.match(html, /aria-label="Workspace chat apps"/);
  assert.match(html, />Slack<\/span>/);
  assert.match(html, />Microsoft Teams<\/span>/);
  assert.match(html, />Google Chat<\/span>/);
  assert.match(html, />Discord<\/span>/);
  assert.match(html, /What is Sederunt\?/);
  assert.match(html, /<script type="module">/);
  assert.equal(sha256(html), "5054f7397c3fa966208686aa52e0b8964456b3dd3390dc8e8a4b8dad858730fb");
});

test("renderConsolePage keeps the rail, skip link, and in-page client script", () => {
  const html = renderConsolePage({ signedIn: true });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(html, /data-show="home"/);
  assert.match(html, /data-show="rooms"/);
  assert.match(html, /data-show="chat"/);
  assert.match(html, /id="history-list"/);
  assert.match(html, /<script type="module">/);
  assert.match(html, /import \{ formatActivitySentence/);
  assert.match(html, /import \{ renderConsoleProof \} from "\/console\/receipt\.js"/);
  assert.equal(sha256(html), "1a00f7b5db2d056c806259ba87a89c376ac7f152e145ffd8226251d55f1fceaf");
});

test("GET / serves the landing HTML; /console redirects when sign-in is on", async () => {
  const openApp = createApp({
    env: {},
    files: false,
    deps: { memory: null, tatum: { async getObject() { return {}; } } },
  });
  openApp.listen(0, "127.0.0.1");
  await once(openApp, "listening");
  const openPort = openApp.address().port;
  try {
    const home = await get(openPort, "/");
    assert.equal(home.status, 200);
    assert.match(home.headers["content-type"], /text\/html/);
    assert.equal(home.body, renderLanding());
    assert.match(home.body, /src="\/clips\/join\.mp4"/);
    assert.match(home.body, /aria-label="Workspace chat apps"/);
    const openConsole = await get(openPort, "/console");
    assert.equal(openConsole.status, 200);
    assert.match(openConsole.body, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  } finally {
    await new Promise((resolve, reject) => openApp.close((error) => (error ? reject(error) : resolve())));
  }

  const gated = createApp({
    env: { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: "html-structural-secret" },
    files: false,
    deps: { memory: null, tatum: { async getObject() { return {}; } } },
  });
  gated.listen(0, "127.0.0.1");
  await once(gated, "listening");
  const gatedPort = gated.address().port;
  try {
    const consoleRes = await get(gatedPort, "/console");
    assert.equal(consoleRes.status, 302);
    assert.match(consoleRes.headers.location, /^\/console\/sign-in/);
  } finally {
    await new Promise((resolve, reject) => gated.close((error) => (error ? reject(error) : resolve())));
  }
});

test("new static files are not dropped by .vercelignore; src and public still ship", () => {
  const lines = readFileSync(join(root, ".vercelignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const include = vercel.functions?.["src/server.js"]?.includeFiles || "";
  assert.match(include, /public\/\*\*/);
  assert.match(include, /src\/\*\*/);
  assert.ok(!lines.includes("src/"));
  assert.ok(!lines.includes("src/**"));
  assert.ok(!lines.includes("public/"));
  assert.ok(lines.includes("/clips/"));
});
