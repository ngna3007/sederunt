import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { startFakeMcpServer } from "../src/connectors/fake-server.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const TOKEN = "SEDERUNT-MCP-TOKEN-9f3c1a7e0b24d8aa";
const WRONG = "SEDERUNT-MCP-WRONG-11aa22bb33cc44dd";
const WIDTHS = [1920, 1097, 1024, 768, 640, 390];

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

function appFor(session = createSession()) {
  return createApp({
    session,
    companyLoaded: true,
    env: { SEDERUNT_MCP_FAKE: "1", SEDERUNT_MEMBER: "mina", MCP_SECRETS_KEY_V1: KEY },
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
}

function json(response) {
  return JSON.parse(response.raw);
}

function mcp(port, id, method, params) {
  return call(port, "POST", "/mcp", { jsonrpc: "2.0", id, method, params });
}

test("connector page is reachable and keeps tokens out of HTML", async (t) => {
  const app = appFor();
  const port = await listen(app);
  t.after(() => app.close());
  const page = await call(port, "GET", "/console/connectors", null, { accept: "text/html" });
  assert.equal(page.status, 200);
  assert.match(page.raw, /id="mcp-add"/);
  assert.match(page.raw, /Add a connector/);
  assert.match(page.raw, /data-preset="google-forms"/);
  assert.match(page.raw, /data-preset="google-calendar"/);
  assert.match(page.raw, /Google Forms/);
  assert.match(page.raw, /Google Calendar/);
  assert.match(page.raw, /Uses this person's Google account/);
  assert.doesNotMatch(page.raw, /Coming soon/);
  assert.equal(page.raw.includes(TOKEN), false);
});

test("connector flow on the fake server", async (t) => {
  const fake = await startFakeMcpServer({ token: TOKEN });
  t.after(() => fake.close());
  const session = createSession();
  const app = appFor(session);
  const port = await listen(app);
  t.after(() => app.close());
  const seen = [];
  const track = async (response) => {
    seen.push(response.raw);
    assert.equal(response.raw.includes(TOKEN), false);
    assert.equal(response.raw.includes(WRONG), false);
    return response;
  };

  const empty = json(await track(await call(port, "GET", "/console/connectors")));
  assert.equal(empty.ok, true);
  assert.equal(empty.connectors.length, 0);
  assert.match(empty.demoUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

  const invalid = json(await track(await call(port, "POST", "/console/connectors", { name: "Nope", url: "http://10.1.1.1/mcp" })));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-url");
  assert.equal(json(await call(port, "GET", "/console/connectors")).connectors.length, 0);

  const refused = json(await track(await call(port, "POST", "/console/connectors", { name: "Refused", url: fake.url, token: WRONG })));
  assert.equal(refused.ok, true);
  assert.equal(refused.test.ok, false);
  assert.equal(refused.test.message, "The server refused the token.");
  assert.equal(refused.connector.status, "needs_auth");
  assert.equal(refused.connector.lastError, "The server refused the token.");
  assert.equal(refused.connector.tokenLast4, WRONG.slice(-4));
  await track(await call(port, "POST", `/console/connectors/${refused.connector.id}/remove`, {}));

  const saved = json(await track(await call(port, "POST", "/console/connectors", { name: "Demo", url: fake.url, token: TOKEN })));
  assert.equal(saved.test.ok, true);
  assert.equal(saved.connector.slug, "demo");
  assert.equal(saved.connector.status, "connected");
  assert.equal(saved.connector.tools.every((tool) => tool.enabled === false), true);
  const id = saved.connector.id;
  const enabled = json(await track(await call(port, "POST", `/console/connectors/${id}/tools/lookup_customer`, { enabled: true })));
  assert.equal(enabled.connector.tools.find((tool) => tool.name === "lookup_customer").enabled, true);
  await track(await call(port, "POST", `/console/connectors/${id}/tools/create_note`, { enabled: true }));

  const listed = json(await track(await mcp(port, 1, "tools/list")));
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("recall"));
  assert.ok(names.includes("act"));
  assert.ok(names.includes("demo__lookup_customer"));
  assert.ok(names.includes("demo__create_note"));
  assert.equal(names.includes("demo__delete_note"), false);
  assert.equal(names.includes("demo__ping_status"), false);
  const lookup = listed.result.tools.find((tool) => tool.name === "demo__lookup_customer");
  assert.equal(lookup.description, "Look up a customer by id.");
  assert.equal(lookup.inputSchema.properties.id.type, "string");

  const read = json(await track(await mcp(port, 2, "tools/call", { name: "demo__lookup_customer", arguments: { id: "acme" } })));
  assert.deepEqual(read.result.structuredContent, { id: "acme", note: "demo" });
  assert.match(read.result.content[0].text, /lookup_customer/);
  assert.match(read.result.content[0].text, /acme/);

  const before = fake.calls.filter((entry) => entry.method === "tools/call" && entry.name === "create_note").length;
  const held = json(await track(await mcp(port, 3, "tools/call", { name: "demo__create_note", arguments: { text: "hello" } })));
  assert.equal(held.result.structuredContent.held, true);
  assert.equal(held.result.structuredContent.needsConfirmation, true);
  assert.equal(held.result.structuredContent.tool, "demo__create_note");
  assert.equal(held.result.structuredContent.actionClass, "write");
  assert.equal(held.result.structuredContent.preference, "ask");
  assert.match(held.result.content[0].text, /Needs confirmation/);
  assert.equal(fake.calls.filter((entry) => entry.method === "tools/call" && entry.name === "create_note").length, before);

  fake.setMode("changed");
  const retested = json(await track(await call(port, "POST", `/console/connectors/${id}/test`, {})));
  const changed = retested.connector.tools.find((tool) => tool.name === "lookup_customer");
  assert.equal(changed.enabled, false);
  assert.equal(changed.changed, true);
  const after = json(await track(await mcp(port, 4, "tools/list")));
  assert.equal(after.result.tools.some((tool) => tool.name === "demo__lookup_customer"), false);

  await track(await call(port, "POST", `/console/connectors/${id}/remove`, {}));
  const gone = json(await track(await mcp(port, 5, "tools/list")));
  assert.deepEqual(gone.result.tools.map((tool) => tool.name), ["recall", "act"]);
  const home = await track(await call(port, "GET", "/api/console"));
  assert.equal(home.raw.includes(TOKEN), false);
  assert.equal(JSON.stringify(session.activity).includes(TOKEN), false);
  assert.equal(seen.length > 0, true);
});

async function browserPath(chromium) {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(Boolean);
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next binary.
    }
  }
  try {
    const bundled = chromium.executablePath();
    await access(bundled);
    return bundled;
  } catch {
    return "";
  }
}

test("connector page flow and layout", { timeout: 180000 }, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return;
  }
  const executablePath = await browserPath(chromium);
  if (!executablePath) {
    t.skip("no browser binary found");
    return;
  }
  const fake = await startFakeMcpServer({ token: TOKEN });
  const app = appFor();
  const port = await listen(app);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => {
    await browser.close();
    await fake.close();
    await app.close();
  });
  const page = await browser.newPage();
  const leaks = [];
  page.on("response", async (response) => {
    try {
      const text = await response.text();
      if (text.includes(TOKEN) || text.includes(WRONG)) leaks.push(response.url());
    } catch {
      // A closed response has no body to scan.
    }
  });
  await page.route("**/*", async (route) => {
    let host = "";
    try { host = new URL(route.request().url()).hostname; } catch { host = ""; }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  const origin = `http://127.0.0.1:${port}`;
  await page.goto(`${origin}/console/connectors`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body:not(.is-reading) #mcp-add", { timeout: 45000 });
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-forms']");
    return card && card.getAttribute("data-state") === "needs_access";
  });
  const empty = await page.evaluate(() => ({
    cta: document.getElementById("mcp-add").textContent.trim(),
    preset: document.querySelector("[data-preset='google-forms']").disabled,
    presetText: document.querySelector("[data-preset='google-forms']").textContent,
    state: document.querySelector("[data-preset='google-forms']").getAttribute("data-state"),
  }));
  assert.equal(empty.cta, "Add a connector");
  assert.equal(empty.preset, false);
  assert.equal(empty.state, "needs_access");
  assert.match(empty.presetText, /Google Forms/);
  assert.match(empty.presetText, /Needs Google access/);
  assert.match(empty.presetText, /Connect Google Forms/);

  await page.click("#mcp-add");
  await page.waitForSelector("#mcp-dialog:not([hidden])");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const panel = document.querySelector("#mcp-dialog .panel").getBoundingClientRect();
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        dialogHidden: document.getElementById("mcp-dialog").hidden,
        panelHeight: panel.height,
        viewHeight: window.innerHeight,
      };
    });
    assert.equal(layout.dialogHidden, false, `dialog hidden at ${width}`);
    assert.equal(layout.overflow, false, `page overflows at ${width}`);
    if (width === 390) assert.ok(layout.panelHeight >= layout.viewHeight - 2, `sheet ${layout.panelHeight} vs ${layout.viewHeight}`);
    if (width >= 768) assert.ok(layout.panelHeight < layout.viewHeight - 40, `dialog fills the screen at ${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click("#mcp-use-demo");
  const demoUrl = await page.locator("#mcp-url").inputValue();
  assert.match(demoUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  await page.fill("#mcp-name", "Demo");
  await page.fill("#mcp-url", "http://10.1.1.1/mcp");
  await page.click("#mcp-test");
  await page.waitForSelector("#mcp-error:not([hidden])");
  assert.match(await page.locator("#mcp-error").innerText(), /not allowed|valid server URL/i);

  await page.fill("#mcp-url", fake.url);
  await page.fill("#mcp-token", WRONG);
  await page.click("#mcp-save");
  await page.waitForFunction(() => {
    const card = document.querySelector("#mcp-list .alert");
    return card && /refused the token/i.test(card.textContent);
  });
  assert.equal((await page.content()).includes(WRONG), false);
  if (await page.locator("#mcp-manage-dialog").isHidden()) await page.click("#mcp-list .mcp-manage");
  await page.click("#mcp-manage-dialog .danger");
  await page.waitForSelector("#mcp-remove-dialog:not([hidden])");
  await page.click("#mcp-remove-confirm");
  await page.waitForSelector("#mcp-add:not([hidden])");

  await page.click("#mcp-add");
  await page.fill("#mcp-name", "Demo");
  await page.fill("#mcp-url", fake.url);
  await page.fill("#mcp-token", TOKEN);
  await page.click("#mcp-test");
  await page.waitForSelector("#mcp-ok:not([hidden])");
  assert.match(await page.locator("#mcp-ok").innerText(), /Demo tools/);
  await page.click("#mcp-save");
  await page.waitForSelector("#mcp-list .mcp-manage");
  await page.click("#mcp-list .mcp-manage");
  await page.waitForSelector("#mcp-manage-dialog:not([hidden]) [data-tool='lookup_customer']");
  const disabled = await page.locator("[data-tool='lookup_customer'] input").isChecked();
  assert.equal(disabled, false);
  assert.equal((await page.content()).includes(TOKEN), false);
  await page.locator("[data-tool='lookup_customer'] input").check();
  await page.waitForFunction(() => document.querySelector("[data-tool='lookup_customer'] input").checked);
  await page.locator("[data-tool='create_note'] input").check();
  await page.waitForFunction(() => document.querySelector("[data-tool='create_note'] input").checked);
  const called = await page.evaluate(async () => {
    const post = (body) => fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    }).then((response) => response.json());
    const listed = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const read = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "demo__lookup_customer", arguments: { id: "acme" } } });
    const held = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "demo__create_note", arguments: { text: "hello" } } });
    return { listed, read, held };
  });
  assert.ok(called.listed.result.tools.some((tool) => tool.name === "demo__lookup_customer"));
  assert.deepEqual(called.read.result.structuredContent, { id: "acme", note: "demo" });
  assert.match(called.read.result.content[0].text, /lookup_customer/);
  assert.equal(called.held.result.structuredContent.held, true);
  assert.equal(called.held.result.structuredContent.needsConfirmation, true);
  assert.equal(fake.calls.filter((entry) => entry.method === "tools/call" && entry.name === "create_note").length, 0);
  fake.setMode("changed");
  await page.getByRole("button", { name: "Test again" }).click();
  await page.waitForSelector("text=Changed since approval");
  const still = await page.evaluate(async () => {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    });
    return response.json();
  });
  assert.equal(still.result.tools.some((tool) => tool.name === "demo__lookup_customer"), false);
  if (await page.locator("#mcp-manage-dialog").isHidden()) await page.click("#mcp-list .mcp-manage");
  await page.click("#mcp-manage-dialog .danger");
  await page.click("#mcp-remove-confirm");
  await page.waitForSelector("#mcp-empty:not([hidden]) #mcp-add");
  const after = await page.evaluate(async () => {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    });
    return response.json();
  });
  assert.equal(after.result.tools.some((tool) => String(tool.name).startsWith("demo__")), false);
  assert.equal((await page.content()).includes(TOKEN), false);
  assert.deepEqual(leaks, []);
});
