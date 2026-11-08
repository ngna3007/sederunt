import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { CONSOLE_COOKIE, openSession, sealSession } from "../src/console-auth.js";
import { renderBotSettings } from "../src/console/bot-settings.js";
import { createMemoryPreferenceStore, loadPreferences } from "../src/bot/preferences.js";
import { createIdentity } from "../src/identity/client.js";
import { createApp } from "../src/server.js";

const SECRET = "session-secret";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { body, headers, cookie, json } = {}) {
  const payload = json ? JSON.stringify(json) : body;
  const type = json ? "application/json" : body ? "application/x-www-form-urlencoded" : "";
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(payload ? { "content-type": type, "content-length": Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location || "",
        cookie: res.headers["set-cookie"],
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function absorb(jar, setCookie) {
  const list = setCookie == null ? [] : Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  for (const item of list) {
    const pair = String(item).split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!value) delete jar[name];
    else jar[name] = value;
  }
  return jar;
}

function header(jar) {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function withApp(env, identity, fn, store = createMemoryPreferenceStore()) {
  const app = createApp({ companyLoaded: true, env, identity, botPreferences: store });
  const port = await listen(app);
  try {
    await fn(port, store);
  } finally {
    app.close();
  }
}

function oauthCookie(role) {
  const token = sealSession({
    kind: "oauth", provider: "google",
    memberId: `user-${role}`,
    userId: `user-${role}`,
    name: role === "owner" ? "Ada" : "Bob",
    email: role === "owner" ? "ada@example.test" : "bob@example.test",
    exp: Date.now() + 3_600_000,
    accessToken: `access-${role}`,
    refreshToken: `refresh-${role}`,
    accessExp: Date.now() + 3_600_000,
    tenantId: TENANT,
    onboarded: true,
    provider: "google",
  }, SECRET);
  return `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`;
}

function identityFor(role) {
  return {
    async myTenants() {
      return [{ id: TENANT, name: "Acme", kind: "company", role }];
    },
  };
}

async function signIn(port) {
  const jar = {};
  const start = await call(port, "GET", "/console/auth/google?next=%2Fconsole%2Fwelcome");
  assert.equal(start.status, 302);
  absorb(jar, start.cookie);
  const consent = await call(port, "GET", start.location, { cookie: header(jar) });
  assert.equal(consent.status, 302);
  absorb(jar, consent.cookie);
  const done = await call(port, "GET", consent.location, { cookie: header(jar) });
  assert.equal(done.status, 302);
  absorb(jar, done.cookie);
  return jar;
}

test("the bot card escapes text and locks a member", () => {
  const html = renderBotSettings({
    name: "O'Neil",
    phrases: ["O'Neil <script>", "Hey O'Neil"],
    canEdit: true,
    phrasesCustomized: true,
  });
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /id="bot-save"/);
  assert.match(html, /Say 'O'Neil &lt;script&gt;, …'/);
  const locked = renderBotSettings({ name: `A"B`, phrases: ["Hey A"], canEdit: false });
  assert.match(locked, /value="A&quot;B"/);
  assert.match(locked, /disabled/);
  assert.equal(locked.includes('id="bot-save"'), false);
  assert.match(locked, /Only an owner or admin can change it/);
});

test("bot routes save a workspace name and refuse a member", async () => {
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
  await withApp(env, identityFor("member"), async (port) => {
    const open = await call(port, "GET", "/api/bot");
    assert.equal(open.status, 401);
    assert.match(open.raw, /Sign in again/);
    const denied = await call(port, "POST", "/api/bot", {
      cookie: oauthCookie("member"),
      json: { name: "Mai", phrases: ["Hey Mai", "Mai"] },
    });
    assert.equal(denied.status, 403);
    assert.match(denied.raw, /Only an owner or admin can change the bot/);
    const page = await call(port, "GET", "/console/account", { cookie: oauthCookie("member") });
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="bot-card"[^>]*data-can-edit="false"/);
    assert.equal(page.raw.includes('id="bot-save"'), false);
    assert.match(page.raw, /Only an owner or admin/);
  });

  const store = createMemoryPreferenceStore();
  await withApp(env, identityFor("owner"), async (port) => {
    const page = await call(port, "GET", "/console/account", { cookie: oauthCookie("owner") });
    assert.match(page.raw, /id="bot-card"[^>]*data-can-edit="true"/);
    assert.match(page.raw, /id="bot-save"/);
    assert.match(page.raw, /Say 'Hey Adam, …' in a meeting/);
    const saved = await call(port, "POST", "/api/bot", {
      cookie: oauthCookie("owner"),
      json: { name: "  Mai ", phrases: ["Mai ơi", "Hey Mai"] },
    });
    assert.equal(saved.status, 200, saved.raw);
    const body = JSON.parse(saved.raw);
    assert.equal(body.name, "Mai");
    assert.equal(body.phrasesCustomized, true);
    assert.deepEqual(body.phrases, ["Mai ơi", "Hey Mai"]);
    const loaded = await loadPreferences(store, { tenantId: TENANT, userId: null });
    assert.equal(loaded.workspace.bot_name, "Mai");
    assert.equal(loaded.workspace.wake_phrases, JSON.stringify(["Mai ơi", "Hey Mai"]));
    const again = await call(port, "GET", "/console/account", { cookie: oauthCookie("owner") });
    assert.match(again.raw, /value="Mai"/);
    assert.match(again.raw, /Say 'Mai ơi, …' in a meeting/);
    const bad = await call(port, "POST", "/api/bot", {
      cookie: oauthCookie("owner"),
      json: { name: "Mai2", phrases: ["Mai2"] },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.raw, /Use 1-32 letters/);
    const junk = await call(port, "POST", "/api/bot", {
      cookie: oauthCookie("owner"),
      body: "{",
      headers: { "content-type": "application/json" },
    });
    assert.equal(junk.status, 400);
    assert.match(junk.raw, /That could not be saved/);
    const method = await call(port, "DELETE", "/api/bot", { cookie: oauthCookie("owner") });
    assert.equal(method.status, 405);
    const script = await call(port, "GET", "/console/bot-identity.js");
    assert.equal(script.status, 200);
    assert.match(script.raw, /export function validateBotName/);
    const card = await call(port, "GET", "/console/bot-card.js");
    assert.match(card.raw, /export function wireBotCard/);
  }, store);

  await withApp({}, null, async (port, local) => {
    const saved = await call(port, "POST", "/api/bot", { json: { name: "Lan", phrases: ["Hey Lan", "Lan"] } });
    assert.equal(saved.status, 200, saved.raw);
    const read = await call(port, "GET", "/api/bot");
    assert.equal(JSON.parse(read.raw).name, "Lan");
    assert.equal(JSON.parse(read.raw).canEdit, true);
    const rows = await local.list({ tenantId: "local" });
    assert.equal(rows.some((row) => row.key === "wake_phrases"), false);
  });
});

test("onboarding can rename the bot and does not write a default or a join", async () => {
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
  const identity = createIdentity(env);
  const store = createMemoryPreferenceStore();
  await withApp(env, identity, async (port) => {
    const jar = await signIn(port);
    const first = await call(port, "GET", "/console/welcome", { cookie: header(jar) });
    assert.equal(first.status, 200);
    const field = first.raw.match(/<input id="ob-bot-name"[^>]*>/);
    assert.ok(field, first.raw.slice(0, 500));
    assert.match(field[0], /value="Adam"/);
    assert.equal(field[0].includes("required"), false);
    assert.match(first.raw, /Sederunt stays the product name/);

    const bad = await call(port, "POST", "/console/welcome", {
      cookie: header(jar),
      body: "action=create&name=Analytical+Engines&bot_name=Adam2",
    });
    assert.equal(bad.status, 400);
    assert.match(bad.raw, /Use 1-32 letters/);
    assert.match(bad.raw, /id="ob-bot-name"[^>]*value="Adam2"[^>]*aria-invalid="true"/);
    assert.doesNotMatch(bad.raw, /id="workspace-name"[^>]*aria-invalid/);
    const session = openSession(decodeURIComponent(jar.sederunt_session || ""), SECRET);
    const before = await identity.myTenants(session.accessToken);
    assert.equal(before.some((row) => row.kind === "company"), false);

    const plain = await call(port, "POST", "/console/welcome", {
      cookie: header(jar),
      body: "action=create&name=Analytical+Engines&bot_name=Adam",
    });
    assert.equal(plain.status, 302);
    assert.equal(plain.location, "/console/welcome?step=calendar");
    absorb(jar, plain.cookie);
    const owner = openSession(decodeURIComponent(jar.sederunt_session || ""), SECRET);
    const untouched = await loadPreferences(store, { tenantId: owner.tenantId, userId: null });
    assert.equal(untouched.workspace.bot_name, undefined);

    const named = await call(port, "POST", "/console/welcome", {
      cookie: header(jar),
      body: "action=create&name=Second+Desk&bot_name=Mai",
    });
    assert.equal(named.status, 302, named.raw);
    absorb(jar, named.cookie);
    const next = openSession(decodeURIComponent(jar.sederunt_session || ""), SECRET);
    const saved = await loadPreferences(store, { tenantId: next.tenantId, userId: null });
    assert.equal(saved.workspace.bot_name, "Mai");
    assert.equal(saved.workspace.wake_phrases, undefined);

    const joined = await call(port, "POST", "/console/welcome", {
      cookie: header(jar),
      body: "join=not-a-workspace&bot_name=Lan&name=Ignored",
    });
    assert.equal(joined.status, 400);
    const after = await loadPreferences(store, { tenantId: next.tenantId, userId: null });
    assert.equal(after.workspace.bot_name, "Mai");
    const rows = await store.list({ tenantId: next.tenantId });
    assert.equal(rows.some((row) => row.value === "Lan"), false);
  }, store);

  const failing = {
    async list() { return []; },
    async upsert() { throw new Error("disk"); },
    async remove() { throw new Error("disk"); },
  };
  const fresh = createIdentity(env);
  await withApp(env, fresh, async (port) => {
    const jar = await signIn(port);
    const created = await call(port, "POST", "/console/welcome", {
      cookie: header(jar),
      body: "action=create&name=Kept&bot_name=Mai",
    });
    assert.equal(created.status, 302);
    assert.equal(created.location, "/console/welcome?step=calendar");
  }, failing);
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

test("the bot card fits and edits at phone and desktop widths", { timeout: 120000 }, async (t) => {
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
  const store = createMemoryPreferenceStore();
  const app = createApp({ companyLoaded: true, env: {}, botPreferences: store });
  const port = await listen(app);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => {
    await browser.close();
    app.close();
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const origin = `http://127.0.0.1:${port}`;

  async function fit(width) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/account`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#account-page:not([hidden]) #bot-name");
    const report = await page.evaluate(() => {
      const doc = document.documentElement;
      const card = document.getElementById("bot-card");
      const outside = [];
      for (const node of card.querySelectorAll("input, button, p, label, li")) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 1) continue;
        if (rect.left < -1 || rect.right > window.innerWidth + 1) outside.push((node.id || node.textContent || "").trim().slice(0, 40));
      }
      const style = getComputedStyle(card);
      const clipped = (style.overflowX === "hidden" || style.overflowX === "clip") && card.scrollWidth > card.clientWidth + 1;
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        clipped,
        outside,
        preview: document.getElementById("bot-preview").textContent,
      };
    });
    assert.equal(report.overflow, false, `${width} overflows`);
    assert.equal(report.clipped, false, `${width} clips the bot card`);
    assert.deepEqual(report.outside, [], `${width} sits outside`);
    assert.match(report.preview, /Say '/);
  }

  for (const width of [375, 768, 1024, 1280]) await fit(width);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.fill("#bot-name", "Mai");
  await page.waitForFunction(() => [...document.querySelectorAll("#bot-phrase-list input")].map((node) => node.value).join("|") === "Hey Mai|Mai");
  await page.fill("#bot-phrase-list input", "nope");
  await page.waitForFunction(() => {
    const error = document.getElementById("bot-phrase-error");
    return error && !error.hidden && /include the bot's name/.test(error.textContent);
  });
  assert.equal(await page.locator("#bot-save").isDisabled(), true);
  await page.fill("#bot-phrase-list input", "Hey Mai");
  await page.fill("#bot-name", "Mai2");
  await page.waitForFunction(() => /1-32 letters/.test(document.getElementById("bot-name-error").textContent));
  await page.fill("#bot-name", "Mai");
  await page.click("#bot-add-phrase");
  const third = page.locator("#bot-phrase-list input").nth(2);
  await third.fill("Mai ơi");
  await page.click("#bot-save");
  await page.waitForFunction(() => document.getElementById("bot-note").textContent === "Saved.");
  const loaded = await loadPreferences(store, { tenantId: "local", userId: null });
  assert.equal(loaded.workspace.bot_name, "Mai");
  assert.equal(loaded.workspace.wake_phrases, JSON.stringify(["Hey Mai", "Mai", "Mai ơi"]));
  await page.locator("#bot-phrase-list button").last().click();
  await page.waitForFunction(() => document.querySelectorAll("#bot-phrase-list input").length === 2);
  await fit(375);
  assert.deepEqual(errors, []);
});
