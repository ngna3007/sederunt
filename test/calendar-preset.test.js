import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createCalendarAdapter, CALENDAR_SCOPES } from "../src/calendar/mcp.js";
import { GOOGLE_CALENDAR_MCP_URL } from "../src/connectors/builtin-calendar.js";
import { actionClassForTool } from "../src/connectors/tools.js";
import { guardConnectorUrl } from "../src/connectors/url-guard.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const SECRET = "calendar-preset-session-secret";
const WIDTHS = [1920, 1097, 768, 390];
const EXISTING_ACCESS = "ya29.calendar-existing";
const EXISTING_REFRESH = "1//calendar-refresh-existing";

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

function appFor(session, env, fetchImpl) {
  return createApp({
    session,
    companyLoaded: true,
    env,
    fetch: fetchImpl,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
      calendar: createCalendarAdapter(env),
    },
  });
}

function recordingFetch(calls) {
  return async (url) => {
    calls.push(String(url));
    throw new Error("outside");
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

function sessionPayload(jar) {
  const cookie = [...jar.entries()].find(([name]) => name === "sederunt_session");
  assert.ok(cookie);
  return JSON.parse(Buffer.from(decodeURIComponent(cookie[1]).split(".")[0], "base64url").toString("utf8"));
}

function assertNoSecrets(raw) {
  assert.equal(raw.includes(EXISTING_ACCESS), false);
  assert.equal(raw.includes(EXISTING_REFRESH), false);
  assert.equal(raw.includes("fa.google"), false);
  assert.equal(raw.includes("fr.google"), false);
  assert.equal(raw.includes("ya29."), false);
}

test("calendar tool class uses annotations, then name rules", () => {
  assert.equal(actionClassForTool("list_events", {}), "read");
  assert.equal(actionClassForTool("get_event", {}), "read");
  assert.equal(actionClassForTool("search_events", {}), "read");
  assert.equal(actionClassForTool("create_event", {}), "write");
  assert.equal(actionClassForTool("update_event", {}), "write");
  assert.equal(actionClassForTool("respond_to_event", {}), "write");
  assert.equal(actionClassForTool("delete_event", {}), "delete");
  assert.equal(actionClassForTool("ping_status", {}), "write");
  assert.equal(actionClassForTool("list_events", { destructiveHint: true, readOnlyHint: true }), "delete");
  assert.equal(actionClassForTool("delete_event", { readOnlyHint: true, destructiveHint: false }), "read");
  assert.equal(actionClassForTool("update_event", { readOnlyHint: false, destructiveHint: false }), "write");
});

test("calendar preset url skips lookup only for the exact Google host", async () => {
  let lookups = 0;
  const lookup = async () => {
    lookups += 1;
    return [{ address: "1.2.3.4" }];
  };
  const trusted = await guardConnectorUrl(GOOGLE_CALENDAR_MCP_URL, { allowCalendarPreset: true, lookup, env: {} });
  assert.equal(lookups, 0);
  assert.equal(trusted.href, GOOGLE_CALENDAR_MCP_URL);
  const queried = await guardConnectorUrl(`${GOOGLE_CALENDAR_MCP_URL}?x=1`, { allowCalendarPreset: true, lookup, env: {} });
  assert.equal(lookups, 1);
  assert.equal(queried.search, "?x=1");
  await assert.rejects(
    () => guardConnectorUrl("https://user:pass@calendarmcp.googleapis.com/mcp/v1", { allowCalendarPreset: true, lookup, env: {} }),
    (error) => error.code === "invalid-url",
  );
  assert.equal(lookups, 1);
  const wrong = await guardConnectorUrl("https://calendarmcp.googleapis.com/other", { allowCalendarPreset: true, lookup, env: {} });
  assert.equal(lookups, 2);
  assert.equal(wrong.pathname, "/other");
  const plain = await guardConnectorUrl(GOOGLE_CALENDAR_MCP_URL, { lookup, env: {} });
  assert.equal(lookups, 3);
  assert.equal(plain.href, GOOGLE_CALENDAR_MCP_URL);
});

test("existing calendar connection adds the preset with no second consent", async (t) => {
  const calls = [];
  const env = {
    SEDERUNT_CALENDAR_FAKE: "1",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
    CALENDAR_MCP_TOKEN: EXISTING_ACCESS,
    CALENDAR_OAUTH_REFRESH_TOKEN: EXISTING_REFRESH,
  };
  const session = createSession();
  const app = appFor(session, env, recordingFetch(calls));
  const port = await listen(app);
  t.after(() => app.close());

  const beforeEvent = await call(port, "GET", "/console/calendar/events/launch-review");
  assert.equal(beforeEvent.status, 200);
  assertNoSecrets(beforeEvent.raw);

  const before = json(await call(port, "GET", "/console/connectors"));
  assert.equal(before.presets["google-calendar"].state, "add");
  assert.equal(before.presets["google-calendar"].connectUrl, "");
  assert.equal(before.connectors.length, 0);

  const added = json(await call(port, "POST", "/console/connectors/presets/google-calendar", {}));
  assert.equal(added.ok, true);
  const connector = added.connector;
  assert.equal(connector.preset, "google-calendar");
  assert.equal(connector.authType, "google_oauth");
  assert.equal(connector.slug, "google-calendar");
  assert.equal(connector.url, GOOGLE_CALENDAR_MCP_URL);
  assert.equal(connector.hasToken, false);
  assert.equal(connector.tokenLast4, "");
  assert.deepEqual(connector.scopes, [...CALENDAR_SCOPES]);
  const classes = Object.fromEntries(connector.tools.map((tool) => [tool.name, tool.actionClass]));
  assert.equal(classes.list_events, "read");
  assert.equal(classes.get_event, "read");
  assert.equal(classes.create_event, "write");
  assert.equal(classes.update_event, "write");
  assert.equal(classes.delete_event, "delete");
  assert.equal(connector.tools.find((tool) => tool.name === "delete_event").enabled, false);
  assert.equal(connector.tools.filter((tool) => tool.name !== "delete_event").every((tool) => tool.enabled === true), true);
  assertNoSecrets(JSON.stringify(added));

  const again = json(await call(port, "POST", "/console/connectors/presets/google-calendar", {}));
  assert.equal(again.ok, true);
  assert.equal(again.connector.id, connector.id);
  assertNoSecrets(JSON.stringify(again));

  const replaced = await call(port, "POST", `/console/connectors/${connector.id}/token`, { token: "ya29.should-not-stick" });
  assert.equal(replaced.status, 400);
  assert.equal(replaced.raw.includes("ya29.should-not-stick"), false);

  const after = json(await call(port, "GET", "/console/connectors"));
  assert.equal(after.presets["google-calendar"].state, "connected");
  assert.equal(after.presets["google-calendar"].connectUrl, "");

  const listed = json(await mcp(port, 1, "tools/list")).result;
  const names = listed.tools.map((tool) => tool.name);
  for (const name of ["list_events", "get_event", "create_event", "update_event"]) {
    assert.ok(names.includes(`google-calendar__${name}`), name);
  }
  assert.equal(names.includes("google-calendar__delete_event"), false);

  const events = toolBody(await mcp(port, 2, "tools/call", {
    name: "google-calendar__list_events",
    arguments: {},
  }));
  assert.equal(events.isError, undefined);
  assert.equal(events.structuredContent.events[0].id, "launch-review");
  assert.equal(events.structuredContent.events[0].summary, "Launch review");
  assert.match(events.content[0].text, /Launch review/);
  assertNoSecrets(JSON.stringify(events));

  const held = toolBody(await mcp(port, 3, "tools/call", {
    name: "google-calendar__create_event",
    arguments: { summary: "Design crit" },
  }));
  assert.equal(held.structuredContent.held, true);
  assert.equal(held.structuredContent.needsConfirmation, true);
  assert.equal(held.structuredContent.actionClass, "write");
  assert.equal(held.structuredContent.preference, "ask");
  assert.equal(held.structuredContent.tool, "google-calendar__create_event");
  assert.ok(held.structuredContent.actionId);
  const stillOne = toolBody(await mcp(port, 4, "tools/call", {
    name: "google-calendar__list_events",
    arguments: {},
  }));
  assert.equal(stillOne.structuredContent.events.length, 1);

  const created = toolBody(await mcp(port, 5, "tools/call", {
    name: "google-calendar__create_event",
    arguments: { summary: "Design crit", _confirm: held.structuredContent.actionId },
  }));
  assert.equal(created.isError, undefined);
  assert.equal(created.structuredContent.summary, "Design crit");
  assert.match(created.structuredContent.id, /^fake-event-/);
  assert.match(created.content[0].text, /Design crit/);
  const two = toolBody(await mcp(port, 6, "tools/call", {
    name: "google-calendar__list_events",
    arguments: {},
  }));
  assert.equal(two.structuredContent.events.length, 2);

  const enabled = json(await call(port, "POST", `/console/connectors/${connector.id}/tools/delete_event`, { enabled: true }));
  assert.equal(enabled.ok, true);
  const withDelete = json(await mcp(port, 7, "tools/list")).result.tools.map((tool) => tool.name);
  assert.ok(withDelete.includes("google-calendar__delete_event"));

  session.preferences.push({
    id: "preference-2",
    tool: "mcp:google-calendar:delete_event",
    value: "do",
    roomId: "",
    replacedBy: null,
  });
  const deleteHeld = toolBody(await mcp(port, 8, "tools/call", {
    name: "google-calendar__delete_event",
    arguments: { eventId: "launch-review" },
  }));
  assert.equal(deleteHeld.structuredContent.held, true);
  assert.equal(deleteHeld.structuredContent.actionClass, "delete");
  assert.equal(deleteHeld.structuredContent.preference, "ask");
  const kept = toolBody(await mcp(port, 9, "tools/call", {
    name: "google-calendar__list_events",
    arguments: {},
  }));
  assert.equal(kept.structuredContent.events.some((event) => event.id === "launch-review"), true);

  const removed = toolBody(await mcp(port, 10, "tools/call", {
    name: "google-calendar__delete_event",
    arguments: { eventId: "launch-review", _confirm: deleteHeld.structuredContent.actionId },
  }));
  assert.equal(removed.isError, undefined);
  assert.equal(removed.structuredContent.deleted, true);
  assert.equal(removed.structuredContent.id, "launch-review");
  const afterDelete = toolBody(await mcp(port, 11, "tools/call", {
    name: "google-calendar__list_events",
    arguments: {},
  }));
  assert.equal(afterDelete.structuredContent.events.some((event) => event.id === "launch-review"), false);

  session.preferences.push({
    id: "preference-4",
    tool: "mcp:google-calendar:create_event",
    value: "do",
    roomId: "",
    replacedBy: null,
  });
  const direct = toolBody(await mcp(port, 12, "tools/call", {
    name: "google-calendar__create_event",
    arguments: { summary: "Ship review" },
  }));
  assert.equal(direct.isError, undefined);
  assert.equal(direct.structuredContent.summary, "Ship review");
  assert.equal(direct.structuredContent.held, undefined);
  assert.equal(calls.length, 0);
});

test("calendar preset needs access, then one connect serves calendar-edit and the preset", async (t) => {
  const calls = [];
  const env = {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_CALENDAR_FAKE: "1",
    SEDERUNT_CALENDAR_FAKE_CONNECTED: "0",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    SEDERUNT_SESSION_SECRET: SECRET,
    MCP_SECRETS_KEY_V1: KEY,
  };
  const app = appFor(createSession(), env, recordingFetch(calls));
  const port = await listen(app);
  t.after(() => app.close());

  const signedIn = await followAuth(port, "/console/auth/google?next=/console/connectors");
  assert.equal(signedIn.path, "/console/connectors");
  const cookie = cookieHeader(signedIn.jar);
  assert.equal(JSON.stringify(sessionPayload(signedIn.jar)).includes("fa.google"), false);
  assert.equal(JSON.stringify(sessionPayload(signedIn.jar)).includes("fr.google"), false);

  const closed = await call(port, "GET", "/console/calendar/events/launch-review", null, { cookie });
  assert.equal(closed.status, 409);
  assertNoSecrets(closed.raw);

  const needs = json(await call(port, "GET", "/console/connectors", null, { cookie }));
  assert.equal(needs.presets["google-calendar"].state, "needs_access");
  assert.equal(needs.presets["google-calendar"].connectUrl, "/console/auth/google?intent=calendar&next=/console/connectors");
  assert.equal(needs.connectors.length, 0);
  const refused = json(await call(port, "POST", "/console/connectors/presets/google-calendar", {}, { cookie }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "needs_access");

  const started = await call(port, "GET", "/console/auth/google?intent=calendar&next=/console/connectors", null, {
    accept: "text/html",
    cookie,
  });
  assert.equal(started.status, 302);
  const params = new URL(started.headers.location || "", "http://127.0.0.1").searchParams;
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("prompt"), "consent");
  assert.equal(params.get("include_granted_scopes"), "true");
  for (const scope of CALENDAR_SCOPES) assert.match(params.get("scope") || "", new RegExp(scope.replace(/[.]/g, "\\.")));

  const bare = await call(port, "GET", "/console/auth/google", null, { accept: "text/html", cookie });
  assert.equal(bare.status, 302);
  assert.equal(bare.headers.location, "/console/auth/fake/google");

  const granted = await followAuth(port, "/console/auth/google?intent=calendar&next=/console/connectors");
  assert.equal(granted.path, "/console/connectors");
  const grantedPayload = JSON.stringify(sessionPayload(granted.jar));
  assert.equal(grantedPayload.includes("fa.google"), false);
  assert.equal(grantedPayload.includes("fr.google"), false);
  assert.equal(env.SEDERUNT_CALENDAR_FAKE_CONNECTED, "1");
  assert.equal(typeof env.CALENDAR_OAUTH_REFRESH_TOKEN, "string");
  assert.equal(env.CALENDAR_OAUTH_REFRESH_TOKEN.length > 0, true);
  assert.equal(env.CALENDAR_OAUTH_DECLINED, undefined);

  const shared = await call(port, "GET", "/console/calendar/events/launch-review", null, { cookie: cookieHeader(granted.jar) });
  assert.equal(shared.status, 200);
  assertNoSecrets(shared.raw);

  const ready = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(granted.jar) }));
  assert.equal(ready.presets["google-calendar"].state, "add");
  assert.equal(ready.presets["google-calendar"].connectUrl, "");
  assert.equal(ready.connectors.length, 0);
  const connected = json(await call(port, "POST", "/console/connectors/presets/google-calendar", {}, { cookie: cookieHeader(granted.jar) }));
  assert.equal(connected.ok, true);
  assert.equal(connected.connector.status, "connected");
  assert.equal(connected.connector.url, GOOGLE_CALENDAR_MCP_URL);
  assertNoSecrets(JSON.stringify(connected));
  const done = json(await call(port, "GET", "/console/connectors", null, { cookie: cookieHeader(granted.jar) }));
  assert.equal(done.presets["google-calendar"].state, "connected");
  assert.equal(done.presets["google-calendar"].connectUrl, "");
  assert.equal(calls.length, 0);
});

test("a partial calendar grant does not store a refresh token", async (t) => {
  const env = {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_AUTH_FAKE_SCOPE: "openid",
    SEDERUNT_CALENDAR_FAKE: "1",
    SEDERUNT_CALENDAR_FAKE_CONNECTED: "0",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    SEDERUNT_SESSION_SECRET: SECRET,
    MCP_SECRETS_KEY_V1: KEY,
  };
  const app = appFor(createSession(), env, recordingFetch([]));
  const port = await listen(app);
  t.after(() => app.close());

  const granted = await followAuth(port, "/console/auth/google?intent=calendar&next=/console/connectors");
  assert.equal(granted.path, "/console/connectors");
  assert.equal(JSON.stringify(sessionPayload(granted.jar)).includes("fr.google"), false);
  assert.equal(env.CALENDAR_OAUTH_REFRESH_TOKEN, undefined);
  assert.equal(env.CALENDAR_MCP_TOKEN, undefined);
  assert.equal(env.CALENDAR_OAUTH_DECLINED, "1");
  assert.equal(env.SEDERUNT_CALENDAR_FAKE_CONNECTED, "0");
  const cookie = cookieHeader(granted.jar);
  const needs = json(await call(port, "GET", "/console/connectors", null, { cookie }));
  assert.equal(needs.presets["google-calendar"].state, "needs_access");
  assert.match(needs.presets["google-calendar"].message, /did not grant Calendar access/);
  const refused = json(await call(port, "POST", "/console/connectors/presets/google-calendar", {}, { cookie }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "needs_access");
  assertNoSecrets(JSON.stringify(refused));
  const still = await call(port, "GET", "/console/calendar/events/launch-review", null, { cookie });
  assert.equal(still.status, 409);
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
    if (doc.scrollWidth > doc.clientWidth + 1) issues.push("document overflows");
    const nodes = [
      document.querySelector("[data-preset='google-forms']"),
      document.querySelector("[data-preset='google-calendar']"),
      document.querySelector("[data-preset='google-calendar'] .preset-name"),
      document.querySelector("[data-preset='google-calendar'] [data-preset-badge]"),
      ...document.querySelectorAll("#mcp-list .mcp-card, #mcp-list .mcp-name, #mcp-list .mcp-url, #mcp-list .mcp-tool, #mcp-list .mcp-tool-name, #mcp-list .badge"),
    ].filter(Boolean);
    for (const el of nodes) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      if (rect.width < 1) continue;
      if (rect.left < -1 || rect.right > window.innerWidth + 1) issues.push(`off screen ${el.className || el.tagName}`);
    }
    return issues;
  });
  assert.deepEqual(problems, [], `${width}: ${problems.join("; ")}`);
}

test("google calendar preset layout", { timeout: 180000 }, async (t) => {
  const page = await openBrowser(t);
  if (!page) return;
  const app = appFor(createSession(), {
    SEDERUNT_CALENDAR_FAKE: "1",
    SEDERUNT_FORMS_FAKE: "1",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
  });
  const port = await listen(app);
  t.after(() => app.close());
  await page.goto(`http://127.0.0.1:${port}/console/connectors`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body:not(.is-reading) [data-preset='google-calendar']", { timeout: 45000 });
  await page.waitForFunction(() => {
    const forms = document.querySelector("[data-preset='google-forms']");
    const calendar = document.querySelector("[data-preset='google-calendar']");
    return forms && calendar && forms.getAttribute("data-state") === "add" && calendar.getAttribute("data-state") === "add";
  });
  await page.click("[data-preset='google-calendar']");
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-preset='google-calendar']");
    return card && card.getAttribute("data-state") === "connected" && card.disabled;
  });
  const formsText = await page.locator("[data-preset='google-forms']").innerText();
  const calendarText = await page.locator("[data-preset='google-calendar']").innerText();
  assert.match(formsText, /Google Forms/);
  assert.match(calendarText, /Google Calendar/);
  assert.match(calendarText, /Connected/);
  assert.match(calendarText, /Uses this person's Google account/);
  const logo = await page.locator("[data-preset='google-calendar'] use").getAttribute("href");
  assert.equal(logo, "#logo-google-calendar");
  await page.waitForSelector("#mcp-list .mcp-card");
  const connectorText = await page.locator("#mcp-list .mcp-card").innerText();
  assert.match(connectorText, /Read/);
  assert.match(connectorText, /Write/);
  assert.match(connectorText, /Delete/);
  for (const width of WIDTHS) {
    await assertFits(page, width);
    const urlText = (await page.locator("#mcp-list .mcp-url").first().innerText()).trim();
    assert.match(urlText, /calendarmcp\.googleapis\.com\/mcp\/v1/, String(width));
    assert.doesNotMatch(urlText, /127\.0\.0\.1|localhost|Built in/);
  }
});
