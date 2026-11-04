import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { GOOGLE_CALENDAR_PRESET } from "../src/connectors/builtin-calendar.js";
import { googleCalendarPresetState } from "../src/connectors/calendar-preset.js";
import { renderConsolePage } from "../src/console-page.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const KEY = Buffer.alloc(32, 9).toString("base64");

function memoryStore(rows = []) {
  return { async list() { return rows; } };
}

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
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("a stored calendar token is ready before the preset is added", async () => {
  const state = await googleCalendarPresetState({
    store: memoryStore(),
    tenantId: "space",
    env: { CALENDAR_MCP_TOKEN: "calendar-token-for-test" },
  });
  assert.equal(state.state, "ready");
  assert.equal(state.connectUrl, "");
});

test("no calendar grant keeps the card on needs access", async () => {
  const state = await googleCalendarPresetState({
    store: memoryStore(),
    tenantId: "space",
    env: {},
  });
  assert.equal(state.state, "needs_access");
  assert.match(state.connectUrl, /intent=calendar/);
});

test("fake calendar is ready unless it is presented as disconnected", async () => {
  const ready = await googleCalendarPresetState({
    store: memoryStore(),
    tenantId: "space",
    env: { SEDERUNT_CALENDAR_FAKE: "1" },
  });
  assert.equal(ready.state, "ready");
  const closed = await googleCalendarPresetState({
    store: memoryStore(),
    tenantId: "space",
    env: { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_CALENDAR_FAKE_CONNECTED: "0" },
  });
  assert.equal(closed.state, "needs_access");
});

test("an existing preset row is connected", async () => {
  const state = await googleCalendarPresetState({
    store: memoryStore([{ preset: GOOGLE_CALENDAR_PRESET }]),
    tenantId: "space",
    env: { CALENDAR_MCP_TOKEN: "calendar-token-for-test" },
  });
  assert.equal(state.state, "connected");
});

test("the connectors page paints a ready preset as Connected", () => {
  const html = renderConsolePage({});
  assert.doesNotMatch(html, /already connected/);
  assert.match(html, /state === "ready"/);
  const calendarStart = html.indexOf('data-preset="google-calendar"');
  const calendar = html.slice(calendarStart, html.indexOf("</button>", calendarStart));
  assert.match(calendar, /data-state="add"/);
  assert.match(calendar, /data-preset-badge>Add</);
});

test("the ready card adds the preset with no consent", async (t) => {
  const calls = [];
  const env = {
    SEDERUNT_CALENDAR_FAKE: "1",
    SEDERUNT_MCP_FAKE: "1",
    SEDERUNT_MEMBER: "mina",
    MCP_SECRETS_KEY_V1: KEY,
    CALENDAR_MCP_TOKEN: "calendar-token-for-test",
  };
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    fetch: async (url) => {
      calls.push(String(url));
      throw new Error("outside");
    },
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
      calendar: createCalendarAdapter(env),
    },
  });
  const port = await listen(app);
  t.after(() => app.close());

  const before = JSON.parse((await call(port, "GET", "/console/connectors")).raw);
  assert.equal(before.presets["google-calendar"].state, "ready");
  assert.equal(before.presets["google-calendar"].connectUrl, "");
  assert.equal(before.connectors.length, 0);

  const page = await call(port, "GET", "/console/connectors", null, { accept: "text/html" });
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.raw, /already connected/);
  assert.match(page.raw, /data-preset="google-calendar"/);

  const added = JSON.parse((await call(port, "POST", "/console/connectors/presets/google-calendar", {})).raw);
  assert.equal(added.ok, true);
  assert.equal(added.connector.preset, "google-calendar");
  assert.equal(added.connector.status, "connected");
  const after = JSON.parse((await call(port, "GET", "/console/connectors")).raw);
  assert.equal(after.presets["google-calendar"].state, "connected");
  assert.equal(calls.length, 0);
  assert.equal(JSON.stringify(added).includes("calendar-token-for-test"), false);
});
