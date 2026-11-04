import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createFakeCalendarAdapter } from "../src/calendar/fake.js";
import { createIdentity } from "../src/identity/client.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "calendar-edit-secret";
const WIDTHS = [1920, 1097, 768, 390];

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { body, headers, cookie } = {}) {
  const payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
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

function json(response) {
  return JSON.parse(response.raw);
}

function stubDeps(calendar) {
  return {
    memory: { async remember() { return { blobId: null }; } },
    tatum: { async getObject() { return { text: "" }; } },
    calendar,
  };
}

function populatedSession() {
  const session = createSession();
  session.rooms.push({
    id: "booth",
    name: "Booth planning",
    platform: "Google Meet",
    startedAt: "2026-11-03T11:00:00.000Z",
    calendarEventId: "design-crit",
  });
  session.decisions.push({
    id: "d-booth",
    account: "company",
    kind: "decision",
    text: "The booth opens at nine.",
    speakerMemberId: "mina",
    inviteMemberIds: ["mina"],
    roomId: "booth",
    spokenAt: "2026-11-03T11:20:00.000Z",
    contradicts: [],
    fileNames: [],
  });
  return session;
}

function blockOutbound() {
  const realFetch = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || input);
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      host = "";
    }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      outbound.push(raw);
      throw new Error(`blocked outbound fetch to ${host}`);
    }
    return realFetch(input, init);
  };
  return {
    outbound,
    restore() { globalThis.fetch = realFetch; },
  };
}

test("calendar event routes validate and save on the fake calendar", async (t) => {
  const network = blockOutbound();
  t.after(() => network.restore());
  const env = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_MEMBER: "mina" };
  const calendar = createFakeCalendarAdapter(env);
  const app = createApp({
    session: populatedSession(),
    companyLoaded: true,
    env,
    deps: stubDeps(calendar),
  });
  const port = await listen(app);
  t.after(() => app.close());

  const read = json(await call(port, "GET", "/console/calendar/events/launch-review"));
  assert.equal(read.ok, true);
  assert.equal(read.event.title, "Launch review");
  assert.equal(read.event.attendees.some((guest) => guest.organizer && guest.email === "ada@example.com"), true);

  const quiet = json(await call(port, "POST", "/console/calendar/events/launch-review", {
    body: {
      description: "Ship checklist",
      attendees: ["Ada@Example.com", "grace@example.com", "mina@example.com"],
      notify: false,
    },
  }));
  assert.equal(quiet.ok, true);
  assert.equal(quiet.sendUpdates, "none");
  assert.equal(quiet.changed, true);
  assert.equal(quiet.event.description, "Ship checklist");
  const quietCall = calendar.calls.at(-1);
  assert.equal(quietCall.name, "update_event");
  // Calendar MCP update_event shape: only what changed, notificationLevel.
  assert.deepEqual(quietCall.arguments, {
    eventId: "launch-review",
    description: "Ship checklist",
    notificationLevel: "NONE",
  });

  const writes = calendar.calls.length;
  const same = json(await call(port, "POST", "/console/calendar/events/launch-review", {
    body: {
      description: "Ship checklist",
      attendees: ["ada@example.com", "GRACE@example.com", "mina@example.com"],
      notify: true,
    },
  }));
  assert.equal(same.ok, true);
  assert.equal(calendar.calls.length, writes, "an unchanged save sends no update_event");
  assert.equal(same.changed, false, "an unchanged save says nothing changed");
  assert.equal(same.sendUpdates, "none", "an unchanged save notifies nobody, even with notify on");

  const loud = json(await call(port, "POST", "/console/calendar/events/launch-review", {
    body: {
      description: "Ship checklist",
      attendees: ["ada@example.com", "grace@example.com", "quang@example.com"],
      notify: true,
    },
  }));
  assert.equal(loud.sendUpdates, "all");
  assert.deepEqual(calendar.calls.at(-1).arguments, {
    eventId: "launch-review",
    addedAttendees: [{ email: "quang@example.com" }],
    removedAttendeeEmails: ["mina@example.com"],
    notificationLevel: "ALL",
  });

  const invalid = json(await call(port, "POST", "/console/calendar/events/launch-review", {
    body: { description: "x", attendees: ["not-an-email"], notify: true },
  }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "invalid-email");

  const dropped = json(await call(port, "POST", "/console/calendar/events/launch-review", {
    body: { description: "x", attendees: ["grace@example.com"], notify: true },
  }));
  assert.equal(dropped.error, "organizer");
  assert.match(dropped.message, /organizer cannot be removed/);

  const readOnly = json(await call(port, "POST", "/console/calendar/events/board-readout", {
    body: { description: "nope", attendees: ["ada@example.com"], notify: true },
  }));
  assert.equal(readOnly.error, "read-only");

  const cross = await call(port, "POST", "/console/calendar/events/launch-review", {
    body: { description: "x", attendees: ["ada@example.com"], notify: true },
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  assert.equal(cross.status, 403);

  const home = json(await call(port, "GET", "/api/console"));
  assert.equal(home.doors.calendar, true);
  assert.ok(home.meetings.some((meeting) => meeting.id === "launch-review"));
  assert.equal(home.rooms.some((room) => room.calendarEventId === "design-crit"), true);

  const lockedEnv = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_CONSOLE_SECRET: "gate" };
  const locked = createApp({
    companyLoaded: true,
    env: lockedEnv,
    deps: stubDeps(createFakeCalendarAdapter(lockedEnv)),
  });
  const lockedPort = await listen(locked);
  t.after(() => locked.close());
  const signedOut = json(await call(lockedPort, "GET", "/console/calendar/events/launch-review"));
  assert.equal(signedOut.error, "sign-in");

  const offEnv = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_CALENDAR_FAKE_CONNECTED: "0" };
  const off = createApp({
    companyLoaded: true,
    env: offEnv,
    deps: stubDeps(createFakeCalendarAdapter(offEnv)),
  });
  const offPort = await listen(off);
  t.after(() => off.close());
  const disconnected = json(await call(offPort, "GET", "/console/calendar/events/launch-review"));
  assert.equal(disconnected.error, "not-connected");
  const listed = json(await call(offPort, "GET", "/api/console"));
  assert.equal(listed.doors.calendar, false);
  assert.ok(listed.meetings.some((meeting) => meeting.id === "launch-review"));
  assert.deepEqual(network.outbound, []);
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

test("console edit dialog, ask, and layout", { timeout: 180000 }, async (t) => {
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
  const network = blockOutbound();
  t.after(() => network.restore());
  const env = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_MEMBER: "mina" };
  const calendar = createFakeCalendarAdapter(env);
  const app = createApp({
    session: populatedSession(),
    companyLoaded: true,
    env,
    deps: stubDeps(calendar),
  });
  const port = await listen(app);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => {
    await browser.close();
    app.close();
  });
  const page = await browser.newPage();
  const errors = [];
  const outbound = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    let host = "";
    try { host = new URL(url).hostname; } catch { host = ""; }
    const local = !host || host === "127.0.0.1" || host === "localhost" || host === "::1" || url.startsWith("data:") || url.startsWith("blob:");
    if (!local) {
      outbound.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const origin = `http://127.0.0.1:${port}`;

  await page.goto(`${origin}/console`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body:not(.is-reading) #home-add-to-meeting", { timeout: 45000 });
  await page.waitForSelector("#meeting-list [data-edit-event='launch-review']", { timeout: 45000 });
  const home = await page.evaluate(() => ({
    emptyHidden: document.getElementById("home-empty").hidden,
    add: document.getElementById("home-add-to-meeting").textContent.trim(),
    addVisible: document.getElementById("home-add-to-meeting").getClientRects().length > 0,
    roomEdit: !!document.querySelector("#room-list [data-edit-event='design-crit']"),
  }));
  assert.equal(home.emptyHidden, true);
  assert.equal(home.add, "Add to a meeting");
  assert.equal(home.addVisible, true);
  assert.equal(home.roomEdit, true);

  await page.click("#home-add-to-meeting");
  await page.waitForSelector("#create-dialog:not([hidden])");
  await page.click("#create-dialog .close");
  await page.waitForFunction(() => document.getElementById("create-dialog").hidden);

  await page.goto(`${origin}/console/rooms/booth`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#file-edit-event:not([hidden])", { timeout: 45000 });
  await page.click("#file-edit-event");
  await page.waitForFunction(() => {
    const title = document.getElementById("event-title");
    return title && /Design crit/.test(title.textContent);
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("event-dialog").hidden);

  await page.goto(`${origin}/console`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#meeting-list [data-edit-event='launch-review']", { timeout: 45000 });
  await page.click("#meeting-list [data-edit-event='launch-review']");
  await page.waitForSelector("#event-dialog:not([hidden]) #event-guests [data-organizer='true']");
  await page.waitForFunction(() => {
    const save = document.getElementById("event-save");
    const notify = document.getElementById("event-notify");
    return save && !save.disabled && notify && notify.checked;
  });

  const opened = await page.evaluate(() => ({
    title: document.getElementById("event-title").textContent,
    organizerRemove: !!document.querySelector("[aria-label='Remove ada@example.com']"),
    help: document.getElementById("event-notify-help").textContent,
  }));
  assert.equal(opened.title, "Launch review");
  assert.equal(opened.organizerRemove, false);
  assert.match(opened.help, /Guests receive an email/);

  await page.fill("#event-email", "not-an-email");
  await page.click("#event-add");
  await page.waitForSelector("#event-email-error:not([hidden])");
  const invalid = await page.locator("#event-email-error").textContent();
  assert.match(invalid, /valid email address/);

  await page.fill("#event-email", "new.guest@example.com, extra.guest@example.com");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#event-guests [data-email='new.guest@example.com']");
  await page.waitForSelector("#event-guests [data-email='extra.guest@example.com']");
  await page.click("[aria-label='Remove grace@example.com']");
  await page.waitForFunction(() => !document.querySelector("[data-email='grace@example.com']"));
  assert.equal(await page.locator("[data-email='ada@example.com']").count(), 1);

  await page.fill("#event-description", "Unsaved note");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#event-discard:not([hidden])");
  await page.click("#event-keep");
  assert.equal(await page.locator("#event-dialog").getAttribute("hidden"), null);
  await page.keyboard.press("Escape");
  await page.click("#event-discard-confirm");
  await page.waitForFunction(() => document.getElementById("event-dialog").hidden);

  await page.click("#meeting-list [data-edit-event='launch-review']");
  await page.waitForFunction(() => {
    const save = document.getElementById("event-save");
    return save && !save.disabled;
  });
  await page.fill("#event-description", "Ship checklist");
  await page.fill("#event-email", "new.guest@example.com");
  await page.click("#event-add");
  await page.waitForSelector("[data-email='new.guest@example.com']");
  await page.click("[aria-label='Remove grace@example.com']");
  await page.locator("#event-notify").uncheck();
  assert.match(await page.locator("#event-notify-help").textContent(), /won't get an email/);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const panel = document.querySelector("#event-dialog .panel").getBoundingClientRect();
      const description = document.getElementById("event-description");
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        dialogHidden: document.getElementById("event-dialog").hidden,
        panelHeight: panel.height,
        viewHeight: window.innerHeight,
        descriptionClip: description.scrollWidth > description.clientWidth + 1,
      };
    });
    assert.equal(layout.dialogHidden, false, `dialog hidden at ${width}`);
    assert.equal(layout.overflow, false, `dialog overflows at ${width}`);
    assert.equal(layout.descriptionClip, false, `description clips at ${width}`);
    if (width === 390) assert.ok(layout.panelHeight >= layout.viewHeight - 2, `sheet ${layout.panelHeight} vs ${layout.viewHeight}`);
    if (width >= 768) assert.ok(layout.panelHeight < layout.viewHeight - 40, `dialog fills the screen at ${width}`);
  }

  const quietResponse = page.waitForResponse((res) => res.url().includes("/console/calendar/events/launch-review") && res.request().method() === "POST");
  await page.click("#event-save");
  const quiet = await (await quietResponse).json();
  assert.equal(quiet.sendUpdates, "none");
  await page.waitForFunction(() => {
    const toast = document.getElementById("toast");
    return toast && !toast.hidden && toast.textContent.includes("Saved without notifying guests.");
  });
  assert.deepEqual(calendar.calls.at(-1).arguments, {
    eventId: "launch-review",
    description: "Ship checklist",
    addedAttendees: [{ email: "new.guest@example.com" }],
    removedAttendeeEmails: ["grace@example.com"],
    notificationLevel: "NONE",
  });

  await page.click("#meeting-list [data-edit-event='launch-review']");
  await page.waitForFunction(() => {
    const save = document.getElementById("event-save");
    const notify = document.getElementById("event-notify");
    const description = document.getElementById("event-description");
    return save && !save.disabled && notify && notify.checked && description.value === "Ship checklist";
  });
  await page.fill("#event-description", "Ship checklist tomorrow");
  const loudResponse = page.waitForResponse((res) => res.url().includes("/console/calendar/events/launch-review") && res.request().method() === "POST");
  await page.click("#event-save");
  const loud = await (await loudResponse).json();
  assert.equal(loud.sendUpdates, "all");
  await page.waitForFunction(() => {
    const toast = document.getElementById("toast");
    return toast && !toast.hidden && toast.textContent.includes("Saved. Guests were notified.");
  });
  assert.deepEqual(calendar.calls.at(-1).arguments, {
    eventId: "launch-review",
    description: "Ship checklist tomorrow",
    notificationLevel: "ALL",
  });

  // Saving with nothing changed must not claim guests were notified.
  const writesBefore = calendar.calls.length;
  await page.click("#meeting-list [data-edit-event='launch-review']");
  await page.waitForFunction(() => {
    const save = document.getElementById("event-save");
    const notify = document.getElementById("event-notify");
    const description = document.getElementById("event-description");
    return save && !save.disabled && notify && notify.checked && description.value === "Ship checklist tomorrow";
  });
  const noopResponse = page.waitForResponse((res) => res.url().includes("/console/calendar/events/launch-review") && res.request().method() === "POST");
  await page.click("#event-save");
  const noop = await (await noopResponse).json();
  assert.equal(noop.changed, false);
  assert.equal(noop.sendUpdates, "none");
  await page.waitForFunction(() => {
    const toast = document.getElementById("toast");
    return toast && !toast.hidden && toast.textContent.includes("No changes to save.");
  });
  assert.equal((await page.locator("#toast").textContent()).includes("notified"), false);
  assert.equal(calendar.calls.length, writesBefore, "a no-change save writes nothing");

  // A same-day meeting shows its date once: "<day> at 9:00 AM – 9:45 AM".
  const when = await page.evaluate(() => {
    const button = document.querySelector("#meeting-list [data-edit-event='launch-review']");
    return button.closest(".meeting-row").querySelector(".meta").textContent;
  });
  assert.match(when, / – \d{1,2}:\d{2}\s?[AP]M$/, `same-day range repeats the date: ${when}`);

  await page.click("#meeting-list [data-edit-event='board-readout']");
  await page.waitForSelector("#event-readonly:not([hidden])");
  const locked = await page.evaluate(() => ({
    note: document.getElementById("event-readonly").textContent,
    description: document.getElementById("event-description").disabled,
    email: document.getElementById("event-email").disabled,
    add: document.getElementById("event-add").disabled,
    notify: document.getElementById("event-notify").disabled,
    saveHidden: document.getElementById("event-save").hidden,
    organizerRemove: !!document.querySelector("[aria-label='Remove ada@example.com']"),
  }));
  assert.match(locked.note, /read-only/);
  assert.equal(locked.description, true);
  assert.equal(locked.email, true);
  assert.equal(locked.add, true);
  assert.equal(locked.notify, true);
  assert.equal(locked.saveHidden, true);
  assert.equal(locked.organizerRemove, false);
  await page.keyboard.press("Escape");

  const offEnv = {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_CALENDAR_FAKE_CONNECTED: "0",
    SEDERUNT_SESSION_SECRET: SECRET,
    SEDERUNT_MEMBER: "mina",
  };
  const offApp = createApp({
    session: populatedSession(),
    companyLoaded: true,
    env: offEnv,
    identity: createIdentity(offEnv),
    deps: stubDeps(createFakeCalendarAdapter(offEnv)),
  });
  const offPort = await listen(offApp);
  t.after(() => offApp.close());
  const offOrigin = `http://127.0.0.1:${offPort}`;
  const offPage = await browser.newPage();
  offPage.on("pageerror", (error) => errors.push(String(error)));
  await offPage.route("**/*", async (route) => {
    const url = route.request().url();
    let host = "";
    try { host = new URL(url).hostname; } catch { host = ""; }
    const local = !host || host === "127.0.0.1" || host === "localhost" || host === "::1" || url.startsWith("data:") || url.startsWith("blob:");
    if (!local) {
      outbound.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  await offPage.goto(`${offOrigin}/console/auth/google?next=/console`, { waitUntil: "domcontentloaded" });
  await offPage.waitForSelector("#choice-personal", { timeout: 45000 });
  await offPage.click("#choice-personal");
  await offPage.waitForSelector("body:not(.is-reading) #home-add-to-meeting", { timeout: 45000 });
  await offPage.waitForSelector("#tool-ask-calendar:not([hidden])", { timeout: 45000 });
  await offPage.waitForSelector("#meeting-list [data-edit-event='launch-review']", { timeout: 45000 });
  const askHome = await offPage.evaluate(() => ({
    add: document.getElementById("home-add-to-meeting").getClientRects().length > 0,
    ask: !document.getElementById("tool-ask-calendar").hidden,
    dialog: document.getElementById("event-dialog").hidden,
  }));
  assert.equal(askHome.add, true);
  assert.equal(askHome.ask, true);
  assert.equal(askHome.dialog, true);
  await offPage.click("#meeting-list [data-edit-event='launch-review']");
  const afterEdit = await offPage.evaluate(() => ({
    dialog: document.getElementById("event-dialog").hidden,
    ask: !document.getElementById("tool-ask-calendar").hidden,
  }));
  assert.equal(afterEdit.dialog, true);
  assert.equal(afterEdit.ask, true);
  await offPage.click("#home-add-to-meeting");
  const createHidden = await offPage.locator("#create-dialog").getAttribute("hidden");
  assert.notEqual(createHidden, null);

  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
  assert.deepEqual(network.outbound, []);
});
