import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { FORMS_SCOPES } from "../src/connectors/google-person.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const WIDTHS = [1920, 1097, 1024, 768, 640, 390];
const SECRET = "forms-preset-session-secret";

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
      res.on("end", () => resolve({
        status: res.statusCode,
        raw: Buffer.concat(chunks).toString("utf8"),
        headers: res.headers,
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json(response) {
  return JSON.parse(response.raw);
}

function appFor(session, env) {
  return createApp({
    session,
    companyLoaded: true,
    env,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
}

function fakeEnv() {
  return {
    SEDERUNT_FORMS_FAKE: "1",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
  };
}

function mcp(port, id, method, params) {
  return call(port, "POST", "/mcp", { jsonrpc: "2.0", id, method, params });
}

function toolBody(response) {
  const body = json(response);
  assert.equal(body.error, undefined);
  return body.result;
}

function storeCookies(jar, headers) {
  const raw = headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    const pair = String(line).split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (!value) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function followAuth(port, startPath) {
  const jar = new Map();
  let path = startPath;
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await call(port, "GET", path, null, {
      accept: "text/html",
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    });
    storeCookies(jar, response.headers);
    if (response.status !== 302 && response.status !== 303) return { response, jar, path };
    const location = response.headers.location || "";
    assert.equal(location.startsWith("http"), false, location);
    path = location;
  }
  throw new Error("too many auth redirects");
}

test("google forms preset adds five tools and confirms a write", async (t) => {
  const session = createSession();
  const app = appFor(session, fakeEnv());
  const port = await listen(app);
  t.after(() => app.close());

  const before = json(await call(port, "GET", "/console/connectors"));
  assert.equal(before.presets["google-forms"].state, "add");
  assert.equal(before.connectors.length, 0);

  const added = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}));
  assert.equal(added.ok, true);
  const connector = added.connector;
  assert.equal(connector.preset, "google-forms");
  assert.equal(connector.authType, "google_oauth");
  assert.equal(connector.slug, "google-forms");
  assert.equal(connector.hasToken, false);
  assert.equal(connector.tokenLast4, "");
  assert.equal(connector.url, "builtin:google-forms");
  assert.deepEqual(connector.scopes, [...FORMS_SCOPES]);
  assert.equal(connector.tools.length, 5);
  assert.equal(connector.tools.every((tool) => tool.enabled === true), true);
  const classes = Object.fromEntries(connector.tools.map((tool) => [tool.name, tool.actionClass]));
  assert.equal(classes.create_form, "write");
  assert.equal(classes.add_questions, "write");
  assert.equal(classes.publish_form, "write");
  assert.equal(classes.get_form, "read");
  assert.equal(classes.list_responses, "read");
  assert.match(connector.lastTestedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(added).includes("ya29."), false);

  const again = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}));
  assert.equal(again.ok, true);
  assert.equal(again.connector.id, connector.id);

  const replaced = await call(port, "POST", `/console/connectors/${connector.id}/token`, { token: "ya29.should-not-stick" });
  assert.equal(replaced.status, 400);
  assert.match(json(replaced).message, /signed-in Google account/);
  assert.equal(replaced.raw.includes("ya29.should-not-stick"), false);

  const listed = json(await mcp(port, 1, "tools/list")).result;
  const names = listed.tools.map((tool) => tool.name);
  for (const name of ["create_form", "add_questions", "get_form", "list_responses", "publish_form"]) {
    assert.ok(names.includes(`google-forms__${name}`), name);
  }

  const form = toolBody(await mcp(port, 2, "tools/call", {
    name: "google-forms__get_form",
    arguments: { formId: "fake-form-seed" },
  }));
  assert.equal(form.isError, undefined);
  const seed = form.structuredContent;
  assert.equal(seed.title, "Weekly feedback");
  assert.equal(seed.questionCount, 2);
  assert.match(seed.responderUri, /\/forms\/fake\/fake-form-seed\/viewform$/);
  assert.match(form.content[0].text, /Weekly feedback \(fake-form-seed\), 2 questions\./);

  const responses = toolBody(await mcp(port, 3, "tools/call", {
    name: "google-forms__list_responses",
    arguments: { formId: "fake-form-seed" },
  }));
  const listedResponses = responses.structuredContent;
  assert.equal(listedResponses.responses[0].answers["How was the week?"], "Good");
  assert.equal(listedResponses.responses[0].answers["Anything else?"], "Ship it");
  assert.equal(listedResponses.responses[1].answers["How was the week?"], "Busy");
  assert.equal(responses.content[0].text, "2 responses.");

  const missing = await call(port, "GET", "/forms/fake/fake-form-1/viewform", null, { accept: "text/html" });
  assert.equal(missing.status, 404);

  const held = toolBody(await mcp(port, 4, "tools/call", {
    name: "google-forms__create_form",
    arguments: {
      title: "Launch check",
      description: "Before we ship",
      questions: [{ title: "Ready?", type: "short_text", required: true }],
    },
  }));
  assert.equal(held.structuredContent.held, true);
  assert.equal(held.structuredContent.needsConfirmation, true);
  assert.equal(held.structuredContent.tool, "google-forms__create_form");
  assert.equal(held.structuredContent.actionClass, "write");
  assert.equal(held.structuredContent.preference, "ask");
  assert.ok(held.structuredContent.actionId);
  assert.match(held.content[0].text, /Needs confirmation before google-forms__create_form runs/);
  const stillMissing = await call(port, "GET", "/forms/fake/fake-form-1/viewform", null, { accept: "text/html" });
  assert.equal(stillMissing.status, 404);

  const created = toolBody(await mcp(port, 5, "tools/call", {
    name: "google-forms__create_form",
    arguments: {
      title: "Launch check",
      description: "Before we ship",
      questions: [{ title: "Ready?", type: "short_text", required: true }],
      _confirm: held.structuredContent.actionId,
    },
  }));
  assert.equal(created.isError, undefined);
  const made = created.structuredContent;
  assert.match(created.content[0].text, /Created "Launch check" \(fake-form-1\)\./);
  assert.equal(made.formId, "fake-form-1");
  assert.equal(made.title, "Launch check");
  assert.equal(made.published, true);
  assert.equal(made.questionCount, 1);
  assert.match(made.responderUri, /\/forms\/fake\/fake-form-1\/viewform$/);
  assert.equal(made.editUrl, "https://docs.google.com/forms/d/fake-form-1/edit");
  const preview = await call(port, "GET", "/forms/fake/fake-form-1/viewform", null, { accept: "text/html" });
  assert.equal(preview.status, 200);
  assert.match(preview.raw, /Launch check/);
  assert.match(preview.raw, /Sederunt/);
  assert.match(preview.raw, /<svg/);

  const spent = toolBody(await mcp(port, 6, "tools/call", {
    name: "google-forms__create_form",
    arguments: { title: "Launch check", _confirm: held.structuredContent.actionId },
  }));
  assert.equal(spent.isError, true);
  assert.equal(spent.structuredContent.code, "confirm");
  assert.match(spent.structuredContent.message, /no longer available/);
  assert.match(spent.content[0].text, /no longer available/);
  const notSecond = toolBody(await mcp(port, 7, "tools/call", {
    name: "google-forms__get_form",
    arguments: { formId: "fake-form-2" },
  }));
  assert.equal(notSecond.isError, true);
  assert.equal(notSecond.structuredContent.code, "not-found");
  assert.match(notSecond.content[0].text, /^not-found:/);

  const badHeld = toolBody(await mcp(port, 8, "tools/call", {
    name: "google-forms__create_form",
    arguments: {
      title: "Broken",
      questions: [{ title: "Pick one", type: "multiple_choice" }],
    },
  }));
  assert.equal(badHeld.structuredContent.held, true);
  const bad = toolBody(await mcp(port, 9, "tools/call", {
    name: "google-forms__create_form",
    arguments: {
      title: "Broken",
      questions: [{ title: "Pick one", type: "multiple_choice" }],
      _confirm: badHeld.structuredContent.actionId,
    },
  }));
  assert.equal(bad.isError, true);
  assert.equal(bad.structuredContent.code, "invalid-argument");
  assert.match(bad.content[0].text, /^invalid-argument: Choice questions need between 1 and 50 options/);
  const stillOne = toolBody(await mcp(port, 10, "tools/call", {
    name: "google-forms__get_form",
    arguments: { formId: "fake-form-2" },
  }));
  assert.equal(stillOne.isError, true);
  assert.match(stillOne.content[0].text, /^not-found:/);

  const appendHeld = toolBody(await mcp(port, 11, "tools/call", {
    name: "google-forms__add_questions",
    arguments: {
      formId: "fake-form-1",
      questions: [{ title: "When?", type: "date" }],
    },
  }));
  assert.equal(appendHeld.structuredContent.held, true);
  const appended = toolBody(await mcp(port, 12, "tools/call", {
    name: "google-forms__add_questions",
    arguments: {
      formId: "fake-form-1",
      questions: [{ title: "When?", type: "date" }],
    },
    _meta: { confirmed: true, confirmActionId: appendHeld.structuredContent.actionId },
  }));
  assert.equal(appended.structuredContent.questionCount, 2);
  assert.equal(appended.structuredContent.added, 1);
  assert.match(appended.content[0].text, /Added 1 question\. 2 on the form\./);

  session.preferences.push({
    id: "preference-9",
    tool: "mcp:google-forms:create_form",
    value: "do",
    roomId: "",
    replacedBy: null,
  });
  const direct = toolBody(await mcp(port, 13, "tools/call", {
    name: "google-forms__create_form",
    arguments: { title: "Automatic", publish: false },
  }));
  assert.equal(direct.isError, undefined);
  const second = direct.structuredContent;
  assert.equal(second.formId, "fake-form-2");
  assert.equal(second.published, false);
  assert.match(direct.content[0].text, /Created "Automatic" \(fake-form-2\)\./);
});

test("google forms preset asks for access until Forms scopes are granted", async (t) => {
  const session = createSession();
  const app = appFor(session, {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_FORMS_FAKE: "0",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    SEDERUNT_SESSION_SECRET: SECRET,
    MCP_SECRETS_KEY_V1: KEY,
  });
  const port = await listen(app);
  t.after(() => app.close());

  const closed = await call(port, "GET", "/console/connectors");
  assert.equal(closed.status, 401);

  const plain = await followAuth(port, "/console/auth/google?next=/console/connectors");
  assert.equal(plain.path, "/console/connectors");
  assert.equal([...plain.jar.keys()].some((name) => name === "sederunt_oauth"), false);
  const sessionCookie = [...plain.jar.entries()].find(([name]) => name === "sederunt_session");
  assert.ok(sessionCookie);
  const sessionPayload = JSON.parse(Buffer.from(decodeURIComponent(sessionCookie[1]).split(".")[0], "base64url").toString("utf8"));
  assert.equal(JSON.stringify(sessionPayload).includes("fr.google"), false);
  assert.equal(JSON.stringify(sessionPayload).includes("fa.google"), false);

  const needs = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(plain.jar) }));
  assert.equal(needs.presets["google-forms"].state, "needs_access");
  assert.equal(needs.presets["google-forms"].connectUrl, "/console/auth/google?intent=forms&next=/console/connectors");
  assert.equal(needs.connectors.length, 0);
  const refused = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}, { cookie: cookieHeader(plain.jar) }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "needs_access");
  assert.equal(json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(plain.jar) })).connectors.length, 0);

  const started = await call(port, "GET", "/console/auth/google?intent=forms&next=/console/connectors", null, { accept: "text/html" });
  assert.equal(started.status, 302);
  const location = started.headers.location || "";
  assert.match(location, /^\/console\/auth\/fake\/google\?/);
  const params = new URL(location, "http://127.0.0.1").searchParams;
  assert.equal(params.get("include_granted_scopes"), "true");
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("prompt"), "consent");
  for (const scope of FORMS_SCOPES) assert.match(params.get("scope") || "", new RegExp(scope.replace(/[.]/g, "\\.")));

  const bare = await call(port, "GET", "/console/auth/google", null, { accept: "text/html" });
  assert.equal(bare.status, 302);
  assert.equal(bare.headers.location, "/console/auth/fake/google");

  const granted = await followAuth(port, "/console/auth/google?intent=forms&next=/console/connectors");
  assert.equal(granted.path, "/console/connectors");
  const grantedCookie = [...granted.jar.entries()].find(([name]) => name === "sederunt_session");
  const grantedPayload = JSON.parse(Buffer.from(decodeURIComponent(grantedCookie[1]).split(".")[0], "base64url").toString("utf8"));
  assert.equal(JSON.stringify(grantedPayload).includes("fr.google"), false);
  const ready = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(granted.jar) }));
  assert.equal(ready.presets["google-forms"].state, "add");
  const connected = json(await call(port, "POST", "/console/connectors/presets/google-forms", {}, { cookie: cookieHeader(granted.jar) }));
  assert.equal(connected.ok, true);
  assert.equal(connected.connector.authType, "google_oauth");
  assert.equal(connected.connector.tools.filter((tool) => tool.enabled).length, 5);
  assert.equal(JSON.stringify(connected).includes("fr.google"), false);
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

async function openBrowser(t) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return null;
  }
  const executablePath = await browserPath(chromium);
  if (!executablePath) {
    t.skip("no browser binary found");
    return null;
  }
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();
  await page.route("**/*", async (route) => {
    let host = "";
    try { host = new URL(route.request().url()).hostname; } catch { host = ""; }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  return page;
}

async function assertFits(page, width) {
  await page.setViewportSize({ width, height: 900 });
  const problems = await page.evaluate(() => {
    const issues = [];
    const doc = document.documentElement;
    const home = document.getElementById("home");
    if (doc.scrollWidth > doc.clientWidth + 1) issues.push("document overflows");
    if (home && home.scrollWidth > home.clientWidth + 1) issues.push("home overflows");
    const nodes = [
      document.querySelector("[data-preset='google-forms']"),
      document.querySelector("[data-preset-badge]"),
      ...document.querySelectorAll("#mcp-list .mcp-card, #mcp-list .mcp-name, #mcp-list .mcp-url, #mcp-list .mcp-tool, #mcp-list .mcp-tool-name, #mcp-list .meta"),
    ].filter(Boolean);
    for (const el of nodes) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      if (rect.width < 1) continue;
      if (rect.left < -1 || rect.right > window.innerWidth + 1) issues.push(`off screen ${el.className || el.tagName}`);
      const overflowX = getComputedStyle(el).overflowX;
      if ((overflowX === "hidden" || overflowX === "clip") && el.scrollWidth > el.clientWidth + 2) {
        issues.push(`clipped ${el.className || el.tagName}`);
      }
    }
    return issues;
  });
  assert.deepEqual(problems, [], `${width}: ${problems.join("; ")}`);
}

test("google forms preset layout", { timeout: 180000 }, async (t) => {
  const page = await openBrowser(t);
  if (!page) return;
  const app = appFor(createSession(), fakeEnv());
  const port = await listen(app);
  t.after(() => app.close());
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/console/connectors/presets/google-forms", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/console/connectors`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body:not(.is-reading) #mcp-add", { timeout: 45000 });
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-forms']");
    return card && card.getAttribute("data-state") === "add";
  });
  await page.click("[data-preset='google-forms']");
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-forms']");
    return card && card.getAttribute("data-state") === "connecting" && /Connecting/.test(card.textContent);
  });
  release();
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-forms']");
    return card && card.getAttribute("data-state") === "connected" && card.disabled;
  });
  const cardText = await page.locator("[data-preset='google-forms']").innerText();
  assert.match(cardText, /Google Forms/);
  assert.match(cardText, /Connected/);
  assert.match(cardText, /Uses this person's Google account/);
  await page.waitForSelector("#mcp-list .mcp-card");
  const connectorText = await page.locator("#mcp-list .mcp-card").innerText();
  assert.match(connectorText, /Uses this person's Google account/);
  assert.doesNotMatch(connectorText, /Add token/);
  const tested = await page.locator("#mcp-list .meta").first().innerText();
  assert.match(tested, /Last tested .+\d{1,2}:\d{2} (AM|PM) \S+/);
  assert.doesNotMatch(tested, /\d{4}-\d{2}-\d{2}T/);
  for (const width of WIDTHS) {
    await assertFits(page, width);
    if ([1920, 1097, 768, 390].includes(width)) {
      const urlText = (await page.locator("#mcp-list .mcp-url").first().innerText()).trim();
      assert.equal(urlText, "Built in", String(width));
      assert.doesNotMatch(urlText, /127\.0\.0\.1|localhost|builtin:google-forms/);
    }
  }
});

test("google forms preset needs-access layout", { timeout: 180000 }, async (t) => {
  const page = await openBrowser(t);
  if (!page) return;
  const app = appFor(createSession(), {
    SEDERUNT_FORMS_FAKE: "0",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
  });
  const port = await listen(app);
  t.after(() => app.close());
  await page.goto(`http://127.0.0.1:${port}/console/connectors`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body:not(.is-reading) [data-preset='google-forms']", { timeout: 45000 });
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-forms']");
    return card && card.getAttribute("data-state") === "needs_access";
  });
  const text = await page.locator("[data-preset='google-forms']").innerText();
  assert.match(text, /Needs Google access/);
  assert.match(text, /Connect Google Forms/);
  for (const width of WIDTHS) await assertFits(page, width);
  await page.evaluate(() => {
    const detail = document.querySelector("[data-preset='google-forms'] .preset-detail");
    if (detail) detail.textContent = "Google did not grant Forms access. Connect again and allow Forms.";
  });
  for (const width of [1920, 1097, 768, 390]) await assertFits(page, width);
  await page.click("[data-preset='google-forms']");
  await page.waitForURL(/\/console\/auth\/google\?intent=forms/);
  assert.match(page.url(), /next=\/console\/connectors/);
});
