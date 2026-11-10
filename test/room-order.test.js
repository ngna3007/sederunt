import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { compareRoomsNewestFirst, mergeRoomLists } from "../src/room-match.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "room-order-secret";

function byId(rooms) {
  return Object.fromEntries(rooms.map((room) => [room.id, room]));
}

test("a thinner later room list stays newest first and keeps rooms already shown", () => {
  const prior = [
    {
      id: "old",
      name: "Older meeting",
      platform: "Google Meet",
      startedAt: "2026-11-09T17:32:55.000Z",
      duration: 31,
      lines: [
        { speaker: "You", text: "set a meeting at 7 pm today" },
        { speaker: "You", text: "invite me only" },
      ],
    },
    { id: "mid", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T11:00:00.000Z" },
    { id: "channel", name: "ops", platform: "Slack", channel: "ops" },
    { id: "live", name: "Adam", platform: "Google Meet", call: "in_call_recording" },
  ];
  const incoming = [
    { id: "live", name: "", platform: "", call: "", startedAt: "" },
    { id: "old", name: "", platform: "", startedAt: "", recordingStart: "", duration: 0, lines: [{ speaker: "You", text: "short" }] },
    { id: "saturn", name: "Saturn demo", platform: "Google Meet", startedAt: "2026-11-10T10:21:29.000Z", call: "done" },
    { id: "mid", name: "Launch review", platform: "Zoom", recordingStart: "2026-11-03T08:00:00.000Z", startedAt: "" },
  ];
  const merged = mergeRoomLists(prior, incoming);
  assert.deepEqual(merged.map((room) => room.id), ["live", "old", "saturn", "mid", "channel"]);
  const rooms = byId(merged);
  assert.equal(rooms.live.name, "Adam");
  assert.equal(rooms.live.call, "in_call_recording");
  assert.equal(rooms.live.platform, "Google Meet");
  assert.equal(rooms.old.name, "Older meeting");
  assert.equal(rooms.old.startedAt, "2026-11-09T17:32:55.000Z");
  assert.equal(rooms.old.platform, "Google Meet");
  assert.equal(rooms.old.duration, 31);
  assert.equal(rooms.old.lines.length, 2);
  assert.equal(rooms.old.lines[1].text, "invite me only");
  assert.equal(rooms.mid.name, "Launch review");
  assert.equal(rooms.mid.platform, "Zoom");
  assert.equal(rooms.mid.recordingStart, "2026-11-03T08:00:00.000Z");
  assert.equal(rooms.channel.channel, "ops");
  const newest = merged.slice().sort(compareRoomsNewestFirst).map((room) => room.id);
  assert.deepEqual(newest, ["live", "saturn", "old", "mid", "channel"]);
});

test("a live call with no start ranks ahead of a dated room, and a finished undated room does not", () => {
  const rooms = [
    { id: "done", call: "done" },
    { id: "dated", startedAt: "2026-11-10T10:21:29.000Z" },
    { id: "waiting", call: "joining_call" },
    { id: "recorded", recordingStart: "2026-11-10T12:00:00.000Z" },
  ];
  const ids = rooms.slice().sort(compareRoomsNewestFirst).map((room) => room.id);
  assert.deepEqual(ids, ["waiting", "recorded", "dated", "done"]);
});

test("equal start times keep their order", () => {
  const rooms = [
    { id: "first", startedAt: "2026-11-03T11:00:00.000Z" },
    { id: "second", startedAt: "2026-11-03T11:00:00.000Z" },
  ];
  assert.deepEqual(rooms.slice().sort(compareRoomsNewestFirst).map((room) => room.id), ["first", "second"]);
});

test("a longer incoming transcript replaces a shorter one, and a positive duration replaces zero", () => {
  const [room] = mergeRoomLists(
    [{ id: "old", duration: 0, lines: [{ text: "one" }] }],
    [{ id: "old", duration: 40, lines: [{ text: "one" }, { text: "two" }, { text: "three" }] }],
  );
  assert.equal(room.duration, 40);
  assert.equal(room.lines.length, 3);
});

async function browserPath(chromium) {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
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

function seeded() {
  const session = createSession();
  session.rooms.push(
    { id: "channel", name: "ops", platform: "Slack", channel: "ops" },
    { id: "mid", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T11:00:00.000Z" },
    { id: "old", name: "Older meeting", platform: "Google Meet", startedAt: "2026-11-09T17:32:55.000Z", duration: 31 },
    { id: "live", name: "Adam", platform: "Google Meet", call: "in_call_recording" },
  );
  return session;
}

function thinBoard(body) {
  const rooms = (body.rooms || [])
    .filter((room) => room.id !== "channel")
    .map((room) => {
      if (room.id === "live") return { ...room, name: "", platform: "", call: "", startedAt: "" };
      if (room.id === "old") return { ...room, name: "", platform: "", startedAt: "", recordingStart: "", duration: 0 };
      return room;
    });
  rooms.push({
    id: "saturn",
    name: "Saturn demo",
    platform: "Google Meet",
    startedAt: "2026-11-10T10:21:29.000Z",
    call: "done",
  });
  return { ...body, rooms };
}

test("Home and Rooms paint the same newest-first union after a thinner board", async (t) => {
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
  const app = createApp({
    session: seeded(),
    companyLoaded: true,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "mina",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
      CALENDAR_TIME_ZONE: "Asia/Ho_Chi_Minh",
    },
  });
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(() => {
    browser.close();
    app.close();
  });
  app.listen(0, "127.0.0.1");
  const port = await once(app, "listening").then(() => app.address().port);
  const token = sealSession({ memberId: "mina", name: "Mina", exp: Date.now() + 60_000 }, SECRET);
  const cookie = sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
  const context = await browser.newContext();
  const eq = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: `http://127.0.0.1:${port}` }]);
  const page = await context.newPage();
  const boards = [];
  page.on("response", async (response) => {
    if (response.request().method() !== "GET" || !response.url().includes("/api/console")) return;
    try {
      const body = await response.json();
      if (body && body.reading !== true && Array.isArray(body.rooms) && body.rooms.length) boards.push(body);
    } catch {
      // A later intercepted body is read from the route.
    }
  });
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#room-list a.room", { timeout: 45000 });
  const firstIds = await page.evaluate(() => [...document.querySelectorAll("#room-list a.room")].map((row) => row.getAttribute("data-room")));
  assert.deepEqual(firstIds, ["live", "old", "mid", "channel"]);
  const prior = boards.at(-1);
  assert.ok(prior, "the first board never arrived");
  const priorRooms = JSON.parse(JSON.stringify(prior.rooms));
  let served = null;
  await page.route(/\/api\/console(?:\?|$)/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    served = thinBoard(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(served),
    });
  });
  await page.evaluate(() => {
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
  });
  await page.waitForSelector('#room-list a.room[data-room="saturn"]', { timeout: 15000 });
  const expected = mergeRoomLists(priorRooms, served.rooms).slice().sort(compareRoomsNewestFirst).map((room) => room.id);
  assert.deepEqual(expected, ["live", "saturn", "old", "mid", "channel"]);
  const homeIds = await page.evaluate(() => [...document.querySelectorAll("#room-list a.room")].map((row) => row.getAttribute("data-room")));
  assert.deepEqual(homeIds, expected);
  const kept = await page.evaluate(() => {
    const row = document.querySelector('#room-list a.room[data-room="old"]');
    return {
      title: row?.querySelector("strong")?.textContent || "",
      platform: row?.querySelector('[data-col="platform"]')?.textContent || "",
      length: row?.querySelector('[data-col="length"]')?.textContent || "",
      headHidden: !!document.querySelector("#rooms .explorer-head")?.hidden,
    };
  });
  assert.equal(kept.title, "Older meeting");
  assert.equal(kept.platform, "Meet");
  assert.equal(kept.length, "00:00:31");
  assert.equal(kept.headHidden, true);
  await page.locator(".rail a[data-show='rooms']").click();
  await page.waitForFunction(() => document.querySelector("#rooms .explorer-head")?.hidden === false);
  const roomIds = await page.evaluate(() => [...document.querySelectorAll("#room-list a.room")].map((row) => row.getAttribute("data-room")));
  assert.deepEqual(roomIds, expected);
  await page.locator(".rail a[data-show='home']").click();
  await page.waitForFunction(() => document.querySelector("#rooms .explorer-head")?.hidden === true);
  const homeAgain = await page.evaluate(() => [...document.querySelectorAll("#room-list a.room")].map((row) => row.getAttribute("data-room")));
  assert.deepEqual(homeAgain, expected);
});
