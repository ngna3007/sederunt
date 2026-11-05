import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { logAction, logFailure } from "../src/activity.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "pass05-secret";

test("meeting words separate live, ended, channel, and silence", () => {
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const word = page.slice(page.indexOf("function meetingWord"), page.indexOf("function failedActions"));
  assert.match(word, /word: "Live"/);
  assert.match(word, /word: "Channel"/);
  assert.match(word, /word: "Ended"/);
  assert.match(word, /word: "No recording"/);
  assert.match(word, /decisionsFor\(room\.id\)/);
  assert.doesNotMatch(word, /Failed|Done/);
  assert.match(page, /countText \+ \" · \"|person\.count === 1 \? \"1 decision\"/);
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  const block = css.slice(css.lastIndexOf("Fix pass 05"));
  assert.match(block, /--cols-history: 24px minmax\(0, 1fr\) max-content minmax\(6\.5rem, 10rem\) max-content/);
  assert.match(block, /#history-list \.activity-row \{\s*height: 46px !important/);
  assert.match(block, /#people-table \.people-row > \.num[\s\S]*text-align: left !important/);
  assert.match(block, /#record-list \.decision-row \.room-name[\s\S]*white-space: nowrap !important/);
  assert.match(block, /align-self: center !important/);
  assert.match(page, /function speakerHue/);
  assert.match(page, /function utteranceSegments/);
  assert.match(page, /className = "utter-name"/);
  assert.match(page, /speaker-dot/);
  assert.match(page, /transcriptUrl/);
  assert.match(page, /is-scrub/);
  assert.match(page, /placeRoomChrome/);
  assert.match(css, /--dock-pad/);
  assert.match(css, /\.spk-0 \{ background: var\(--speaker-0\)/);
  assert.match(css, /--speaker-0: #3b6fd8;/);
  assert.doesNotMatch(css.slice(css.indexOf(".spk-0"), css.indexOf("History: stable retry")), /#b42318|#9d174d|#146c34|#0f6e56|#3b6d11/);
  assert.match(page, /function dayHeading/);
  assert.match(page, /function clockOnly/);
  assert.match(page, /is-retry/);
  assert.match(page, /history-open/);
  const feed = readFileSync(new URL("../src/activity-feed.js", import.meta.url), "utf8");
  assert.match(feed, /b\.opened - a\.opened/);
  assert.match(feed, /export function formatConsoleWhen/);
  assert.match(page, /import \{[^}]*formatConsoleWhen/);
  assert.match(page, /return formatConsoleWhen\(iso\)/);
  assert.match(page, /formatConsoleWhen\(iso, \{ time: false \}\)/);
  assert.match(page, /formatConsoleWhen\(ms, \{ part: "day" \}\)/);
  assert.match(page, /Clashes with:/);
  assert.match(page, /id="decision-room"/);
  assert.match(page, /id="decision-copy"/);
  assert.doesNotMatch(page, /No checkpoint was returned/);
  assert.match(page, /Verified on Walrus/);
  assert.match(page, /Show technical details/);
  assert.equal(page.slice(page.indexOf('id="right-overview"'), page.indexOf('id="right-decisions"')).includes('id="proof-panel"'), false);
  assert.match(page, /1 change did not go through/);
  assert.match(page, /changes did not go through/);
  assert.doesNotMatch(page, /No room yet\./);
  assert.match(page, /No rooms yet\./);
  assert.match(page, /Home could not be loaded/);
  assert.match(page, /Try again/);
  assert.doesNotMatch(page, /Couldn't load your workspace/);
  assert.match(page, /Connect a tool to let Sederunt act in it\./);
  assert.doesNotMatch(page, /A tool that is not connected cannot be used from this page/);
  const tap = css.slice(css.lastIndexOf("Phone tap targets"));
  assert.match(tap, /max-width: 768px/);
  assert.match(tap, /a::after/);
  assert.match(tap, /height: max\(100%, 44px\)/);
  assert.match(tap, /min-height: 44px !important/);
});

function seeded() {
  const session = createSession();
  session.rooms.push(
    { id: "booth", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T11:00:00.000Z" },
    { id: "launch", name: "Launch review", platform: "Zoom", startedAt: "2026-11-03T08:00:00.000Z" },
    { id: "slack", name: "ops", platform: "Slack", channel: "ops" },
    { id: "infra", name: "Infra sync", platform: "Google Meet" },
    { id: "quiet", name: "Quiet room", platform: "Google Meet" },
  );
  const rows = [
    ["d-nine", "booth", "The booth opens at nine and badge pickup stays at the north entrance.", "rowan", "2026-11-03T11:20:00.000Z", ["d-ten"]],
    ["d-ten", "booth", "The booth opens at ten so setup is not rushed.", "tomas", "2026-11-03T10:43:00.000Z", ["d-nine"]],
    ["d-launch", "launch", "The launch review stays on Thursday.", "mina", "2026-11-03T08:10:00.000Z", []],
    ["d-slack", "slack", "Ops keeps the channel for incidents.", "mina", "2026-11-03T09:00:00.000Z", []],
    ["d-infra", "infra", "Infra waits for the recording.", "rowan", "2026-11-03T07:00:00.000Z", []],
  ];
  for (const [id, roomId, text, speaker, spokenAt, contradicts] of rows) {
    session.decisions.push({
      id,
      account: "company",
      kind: "decision",
      text,
      speakerMemberId: speaker,
      inviteMemberIds: ["mina", speaker],
      roomId,
      spokenAt,
      contradicts,
      fileNames: [],
    });
  }
  const tool = { name: "act", server: "sederunt-mcp" };
  // Local midnight minus 12 hours stays inside yesterday in the viewer zone.
  // A fixed offset (26h) crosses into the day before yesterday after midnight.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const yesterday = new Date(startOfToday.getTime() - 12 * 60 * 60 * 1000).toISOString();
  logAction(session, {
    id: "act-label",
    requestId: "act-label",
    actor: { type: "person", name: "Mina" },
    verb: "label",
    target: { system: "linear", type: "issue", id: "ROW-151", title: "Booth sign" },
    changes: [{ field: "label", to: "events" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
  });
  logAction(session, {
    id: "act-slack",
    requestId: "act-slack",
    ts: yesterday,
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "post",
    target: { system: "slack", type: "message", url: "https://sederunt.slack.com/archives/C0DEMO/p1", title: "Booth notes" },
    changes: [{ field: "channel", to: "ops" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  logAction(session, {
    id: "act-newer",
    requestId: "act-newer",
    ts: new Date(Date.now() + 60 * 1000).toISOString(),
    actor: { type: "person", name: "Mina" },
    verb: "label",
    target: { system: "linear", type: "issue", id: "ROW-200", title: "Newer banner" },
    changes: [{ field: "label", to: "later" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  logFailure(session, {
    id: "fail-booth",
    requestId: "fail-booth",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "label",
    target: { system: "linear", id: "ROW-175", title: "Badge printer" },
    changes: [{ field: "label", to: "events" }],
    error: "timed out",
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  return session;
}

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

function listGap(width) {
  if (width >= 1920) return "28px";
  if (width >= 1440) return "24px";
  if (width >= 1024) return "20px";
  return "16px";
}

test("list columns share a gap and history rows stay compact", async (t) => {
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
      linear: { async addLabel() { return { id: "ROW-175" }; } },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "mina",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
    },
    recall: {
      async readBot(id) {
        if (id === "booth") {
          return {
            id: "booth",
            lines: [
              { participant: { id: 5, name: "Rowan" }, words: [
                { text: "The", start_timestamp: { relative: 2 }, end_timestamp: { relative: 2.4 } },
                { text: "booth", start_timestamp: { relative: 2.5 }, end_timestamp: { relative: 3.2 } },
              ] },
              { participant: { id: 6, name: "Tomas" }, words: [
                { text: "Open", start_timestamp: { relative: 9 }, end_timestamp: { relative: 10 } },
              ] },
            ],
            recordings: [{
              started_at: "2026-11-03T11:00:00.000Z",
              completed_at: "2026-11-03T11:03:04.000Z",
              status: { code: "done" },
              media_shortcuts: {
                transcript: { data: { download_url: "http://127.0.0.1:9/transcript.json" } },
              },
            }],
          };
        }
        if (id === "quiet") {
          return {
            id: "quiet",
            recordings: [{
              started_at: "2026-11-03T11:00:00.000Z",
              completed_at: "2026-11-03T11:03:04.000Z",
              status: { code: "done" },
              media_shortcuts: {
                video_mixed: { status: { code: "done" }, data: { download_url: "/missing.mp4" } },
              },
            }],
          };
        }
        return null;
      },
    },
  });
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(() => {
    browser.close();
    app.close();
  });
  app.listen(4705, "127.0.0.1");
  const port = await once(app, "listening").then(() => app.address().port);
  const token = sealSession({ memberId: "mina", name: "Mina", exp: Date.now() + 60_000 }, SECRET);
  const cookie = sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
  const context = await browser.newContext();
  const eq = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: `http://127.0.0.1:${port}` }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  const surfaces = [
    { path: "/console", table: "#rooms .explorer", row: "#room-list > a.room", head: "#rooms .explorer-head" },
    { path: "/console/rooms", table: "#rooms .explorer", row: "#room-list > a.room", head: "#rooms .explorer-head" },
    { path: "/console/decisions", table: "#record-table", row: "#record-list .decision-row", head: "#record-table > .decision-head" },
    { path: "/console/people", table: "#people-table", row: "#people-table .people-row", head: "#people-table .people-head" },
    { path: "/console/history", table: "#history-table", row: "#history-list .activity-row", head: "#history-list .history-head", history: true },
    { path: "/console/setup", table: "#tools-card .connectors", row: "#tools-card .connectors > .conn", head: "#tools-card .status-head" },
  ];

  for (const width of [1920, 1097, 1024, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const surface of surfaces) {
      await page.goto(`http://127.0.0.1:${port}${surface.path}`, { waitUntil: "networkidle" });
      await page.waitForSelector(surface.row, { timeout: 45000 });
      const measured = await page.evaluate(({ table, row, head, history }) => {
        const root = document.querySelector(table);
        const rows = [...document.querySelectorAll(row)].filter((node) => node.getClientRects().length);
        const headRow = document.querySelector(head);
        const headShown = !!(headRow && getComputedStyle(headRow).display !== "none" && headRow.getClientRects().length);
        const cellsOf = (node) => {
          const marked = [...node.querySelectorAll("[data-col]")].filter((cell) => cell.closest(".activity-row, .decision-row, .people-row, a.room, .conn") === node);
          return marked.length ? marked : [...node.children];
        };
        const perRow = [];
        rows.forEach((item) => {
          const found = new Map();
          cellsOf(item).forEach((cell) => {
            if (getComputedStyle(cell).display === "none" || cell.getClientRects().length === 0) return;
            const key = cell.dataset.col || cell.className || cell.tagName;
            if (!found.has(key)) found.set(key, []);
            found.get(key).push(Math.round(cell.getBoundingClientRect().x));
          });
          perRow.push(found);
        });
        const keys = perRow[0] ? [...perRow[0].keys()] : [];
        const columns = {};
        for (const key of keys) {
          const xs = perRow.map((found) => (found.has(key) ? found.get(key)[0] : null));
          let headX = null;
          if (headShown) {
            const match = [...headRow.children].find((cell) => (cell.dataset.col || cell.className || cell.tagName) === key && getComputedStyle(cell).display !== "none");
            if (match && match.getClientRects().length) headX = Math.round(match.getBoundingClientRect().x);
          }
          columns[key] = { xs, headX };
        }
        const heights = rows.map((item) => Math.round(item.getBoundingClientRect().height));
        const doc = document.documentElement;
        const gap = root ? getComputedStyle(root).columnGap : "";
        const display = root ? getComputedStyle(root).display : "";
        const stacked = display === "block";
        const rowClip = rows.filter((item) => {
          const box = item.getBoundingClientRect();
          return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1);
        }).length;
        const clips = [...document.querySelectorAll("#history-list .entity-id, #history-list .label-pill")].filter((node) => {
          const box = node.getBoundingClientRect();
          const line = node.closest(".activity-row");
          const rowBox = line ? line.getBoundingClientRect() : box;
          return node.scrollWidth > node.clientWidth + 1 || box.right > rowBox.right + 1 || box.bottom > rowBox.bottom + 1;
        }).map((node) => node.textContent);
        const actions = [...document.querySelectorAll("#history-list .activity-undo, #history-list .activity-retry")].map((node) => {
          const box = node.getBoundingClientRect();
          const line = node.closest(".activity-row").getBoundingClientRect();
          return { text: node.textContent, inRow: box.right <= line.right + 1 && box.left >= line.left - 1 && box.width >= 44, onScreen: box.right <= window.innerWidth + 1 && box.left >= 0 };
        });
        return {
          columns,
          heights,
          gap,
          stacked,
          overflow: doc.scrollWidth > doc.clientWidth + 1,
          clips,
          actions,
          headShown,
          rowClip,
        };
      }, surface);
      assert.equal(measured.overflow, false, `${surface.path} ${width} overflows`);
      assert.equal(measured.rowClip, 0, `${surface.path} ${width} clips a row`);
      const uniqueHeights = [...new Set(measured.heights)];
      if (!measured.stacked) {
        assert.deepEqual(uniqueHeights, [measured.heights[0]], `${surface.path} ${width} heights ${measured.heights.join(",")}`);
      }
      if (surface.history && width >= 1024) {
        assert.ok(measured.heights.every((height) => height >= 44 && height <= 48), `history ${width} heights ${measured.heights.join(",")}`);
      }
      if (surface.history && width <= 768) {
        assert.equal(measured.stacked, true, "history should stack at 768");
        assert.equal(measured.clips.length, 0, `clipped ${measured.clips.join(",")}`);
        assert.ok(measured.actions.some((item) => item.text === "Undo" && item.inRow && item.onScreen), JSON.stringify(measured.actions));
        assert.ok(measured.actions.some((item) => item.text === "Retry" && item.inRow && item.onScreen), JSON.stringify(measured.actions));
        const metaLeft = await page.evaluate(() => {
          const rows = [...document.querySelectorAll("#history-list .activity-row")];
          return rows.map((row) => Math.round(row.querySelector(".activity-meta").getBoundingClientRect().x));
        });
        const firstMeta = metaLeft[0];
        for (const x of metaLeft) assert.ok(Math.abs(x - firstMeta) <= 1, `history meta x ${metaLeft.join(",")}`);
      }
      if (!measured.stacked) {
        assert.equal(measured.gap, listGap(width), `${surface.path} ${width} gap ${measured.gap}`);
        for (const [col, data] of Object.entries(measured.columns)) {
          if (data.xs.some((x) => x == null)) continue;
          const firstX = data.xs[0];
          for (const x of data.xs) assert.ok(Math.abs(x - firstX) <= 1, `${surface.path} ${width} ${col} x ${data.xs.join(",")}`);
          if (data.headX != null) assert.ok(Math.abs(data.headX - firstX) <= 1, `${surface.path} ${width} ${col} header ${data.headX} cell ${firstX}`);
        }
      }
    }
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console/people`, { waitUntil: "networkidle" });
  await page.waitForSelector("#people-table .people-row .num", { timeout: 45000 });
  const people = await page.evaluate(() => {
    const head = document.querySelector('#people-table .people-head [data-col="count"]');
    const cell = document.querySelector("#people-table .people-row .num");
    return {
      headX: Math.round(head.getBoundingClientRect().x),
      cellX: Math.round(cell.getBoundingClientRect().x),
      headAlign: getComputedStyle(head).textAlign,
      cellAlign: getComputedStyle(cell).textAlign,
    };
  });
  assert.ok(Math.abs(people.headX - people.cellX) <= 1, `people count head ${people.headX} cell ${people.cellX}`);
  assert.equal(people.headAlign, "left");
  assert.equal(people.cellAlign, "left");

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/console/people`, { waitUntil: "networkidle" });
  await page.waitForSelector("#people-table .people-row .num", { timeout: 45000 });
  const phone = await page.evaluate(() => {
    const num = document.querySelector("#people-table .people-row .num");
    const heard = document.querySelector("#people-table .people-row .heard");
    const name = document.querySelector("#people-table .people-row .person");
    const numBox = num.getBoundingClientRect();
    const heardBox = heard.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    return {
      count: num.textContent,
      heard: heard.textContent,
      sameLine: Math.abs((numBox.top + numBox.bottom) - (heardBox.top + heardBox.bottom)) <= 4,
      underName: numBox.top >= nameBox.bottom - 2,
      heardShown: getComputedStyle(heard).display !== "none" && heard.getClientRects().length > 0,
    };
  });
  assert.match(phone.count, /decision/);
  assert.equal(phone.heardShown, true);
  assert.equal(phone.sameLine, true);
  assert.equal(phone.underName, true);
  assert.ok(phone.heard.length > 0);

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console/decisions`, { waitUntil: "networkidle" });
  await page.waitForSelector("#record-list .decision-row .room-name", { timeout: 45000 });
  const rooms = await page.evaluate(() => {
    const names = [...document.querySelectorAll("#record-list .decision-row .room-name")];
    const rows = [...document.querySelectorAll("#record-list .decision-row")];
    return {
      lines: names.map((node) => getComputedStyle(node).whiteSpace),
      titles: names.map((node) => node.title),
      heights: rows.map((node) => Math.round(node.getBoundingClientRect().height)),
      chevron: rows.map((node) => {
        const view = node.querySelector(".row-view");
        const row = node.getBoundingClientRect();
        const box = view.getBoundingClientRect();
        return Math.round((box.top + box.bottom) / 2 - (row.top + row.bottom) / 2);
      }),
    };
  });
  assert.ok(rooms.lines.every((value) => value === "nowrap"));
  assert.ok(rooms.titles.every((value) => value.length > 0));
  assert.deepEqual([...new Set(rooms.heights)], [rooms.heights[0]]);
  assert.ok(rooms.chevron.every((delta) => Math.abs(delta) <= 2), `chevron offset ${rooms.chevron.join(",")}`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console/rooms`, { waitUntil: "networkidle" });
  await page.waitForSelector("#room-list a.room", { timeout: 45000 });
  const status = await page.evaluate(() => [...document.querySelectorAll("#room-list a.room")].map((row) => ({
    title: row.querySelector("strong")?.textContent || "",
    status: row.querySelector(".status-cell .badge")?.textContent || "",
    chip: row.querySelector(".fail-chip")?.textContent || "",
  })));
  const byTitle = Object.fromEntries(status.map((row) => [row.title, row]));
  assert.equal(byTitle["Booth planning"].status, "Ended");
  assert.equal(byTitle["#ops"].status, "Channel");
  assert.equal(byTitle["Quiet room"].status, "No recording");
  assert.equal(byTitle["Infra sync"].status, "Ended");
  assert.equal(byTitle["Booth planning"].chip, "1 failed action");
  assert.ok(status.every((row) => row.status !== "Failed" && row.status !== "Done"));

  for (const width of [1920, 1097, 1024, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/console", "/console/rooms", "/console/decisions", "/console/people", "/console/history", "/console/status"]) {
      await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(overflow, false, `${path} ${width} overflows`);
    }
  }

  const banned = new Set(["rgb(180, 35, 24)", "rgb(157, 23, 77)", "rgb(20, 108, 52)", "rgb(15, 110, 86)", "rgb(59, 109, 17)"]);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/console/rooms/booth`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#file-callout .callout-warn", { timeout: 45000 });
    await page.waitForSelector("#tl-speakers .tl-seg", { timeout: 45000, state: "attached" });
    const order = await page.evaluate(() => {
      const pick = (sel) => {
        const node = document.querySelector(sel);
        const box = node.getBoundingClientRect();
        return { top: Math.round(box.top), height: Math.round(box.height), hidden: node.hidden === true };
      };
      return {
        head: pick("#file-head"),
        alerts: pick("#file-callout"),
        tabs: pick("#room-left > .underline-tabs"),
        player: pick("#room-left .player-frame"),
        transcript: pick("#file-transcript"),
        failed: !!document.querySelector("#file-callout .callout-bad"),
        before: document.getElementById("file-callout").previousElementSibling && document.getElementById("file-callout").previousElementSibling.id,
      };
    });
    assert.equal(order.alerts.hidden, false, `${width} alerts hidden`);
    assert.equal(order.failed, true, `${width} missing failed alert`);
    assert.equal(order.before, "file-head", `${width} callout follows ${order.before}`);
    assert.ok(order.alerts.top >= order.head.top + order.head.height - 2, JSON.stringify(order));
    assert.ok(order.tabs.top >= order.alerts.top + order.alerts.height - 2, JSON.stringify(order));
    assert.ok(order.player.top >= order.tabs.top + 8, JSON.stringify(order));
    assert.ok(order.transcript.top >= order.player.top + order.player.height - 2, JSON.stringify(order));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `room ${width} overflows`);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console/rooms/booth`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#file-transcript .speaker-dot", { timeout: 45000 });
  await page.waitForSelector("#tl-speakers .tl-seg", { timeout: 45000 });
  const speakers = await page.evaluate((bannedList) => {
    const ink = getComputedStyle(document.body).color;
    const names = [...document.querySelectorAll("#file-transcript .utter-name")];
    const dots = [...document.querySelectorAll("#file-transcript .speaker-dot")];
    const segs = [...document.querySelectorAll("#tl-speakers .tl-seg")];
    const banned = new Set(bannedList);
    return {
      ink,
      names: names.map((node) => ({ text: node.textContent, color: getComputedStyle(node).color, clipped: node.scrollWidth > node.clientWidth + 1 })),
      dots: dots.map((node) => ({ cls: node.className, color: getComputedStyle(node).backgroundColor })),
      segs: segs.map((node) => ({ title: node.title, cls: node.className, color: getComputedStyle(node).backgroundColor })),
      calloutInOverview: !!document.querySelector("#right-overview #file-callout"),
    };
  }, [...banned]);
  assert.equal(speakers.calloutInOverview, true);
  assert.ok(speakers.names.length >= 2);
  assert.equal(speakers.dots.length, speakers.names.length);
  assert.ok(speakers.names.every((row) => row.color === speakers.ink && !row.clipped), JSON.stringify(speakers.names));
  assert.ok(speakers.dots.every((row) => /^speaker-dot spk-\d$/.test(row.cls) && !banned.has(row.color)), JSON.stringify(speakers.dots));
  assert.ok(speakers.segs.length >= 2, JSON.stringify(speakers.segs));
  assert.ok(speakers.segs.every((row) => /spk-\d/.test(row.cls) && !banned.has(row.color)), JSON.stringify(speakers.segs));
  assert.ok(speakers.segs.some((row) => row.title === "Rowan") && speakers.segs.some((row) => row.title === "Tomas"));

  for (const width of [1920, 1097, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/console/rooms/booth`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#right-overview .room-settings", { timeout: 45000 });
    await page.waitForSelector("#timeline:not([hidden])", { timeout: 45000 });
    const clear = await page.evaluate(() => {
      const card = document.querySelector("#right-overview .room-settings");
      let node = card;
      while (node) {
        if (node.scrollHeight > node.clientHeight + 2) node.scrollTop = node.scrollHeight;
        node = node.parentElement;
      }
      window.scrollTo(0, document.body.scrollHeight);
      const cardBox = card.getBoundingClientRect();
      const dock = document.getElementById("timeline").getBoundingClientRect();
      return {
        cardBottom: Math.round(cardBox.bottom),
        cardTop: Math.round(cardBox.top),
        dockTop: Math.round(dock.top),
        dockH: Math.round(dock.height),
        clear: cardBox.bottom <= dock.top + 1 && cardBox.top < dock.top,
      };
    });
    assert.equal(clear.clear, true, `settings under dock at ${width} ${JSON.stringify(clear)}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `room ${width} overflows`);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/console/rooms/quiet`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#timeline.is-scrub", { timeout: 45000 });
  const scrub = await page.evaluate(() => {
    const dock = document.getElementById("timeline");
    const track = document.getElementById("tl-track");
    return {
      height: Math.round(dock.getBoundingClientRect().height),
      segs: document.querySelectorAll("#tl-speakers .tl-seg").length,
      track: getComputedStyle(track).display,
    };
  });
  assert.ok(scrub.height <= 52 && scrub.height >= 44, `scrub height ${scrub.height}`);
  assert.equal(scrub.segs, 0);
  assert.equal(scrub.track, "none");

  for (const width of [640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/console/rooms/booth`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#file-transcript .utter", { timeout: 45000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `room ${width} overflows`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console/history`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#history-list .activity-retry", { timeout: 45000 });
  const historyBefore = await page.evaluate(() => ({
    headings: [...document.querySelectorAll("#history-list .day-heading")].map((node) => node.textContent),
    times: [...document.querySelectorAll("#history-list time")].map((node) => node.textContent),
    openInAction: !!document.querySelector("#history-list .activity-action .history-open"),
    first: document.querySelector("#history-list .activity-row")?.textContent || "",
  }));
  assert.ok(historyBefore.headings.includes("Today"), JSON.stringify(historyBefore.headings));
  assert.ok(historyBefore.headings.includes("Yesterday"), JSON.stringify(historyBefore.headings));
  assert.ok(historyBefore.times.length > 0);
  assert.ok(historyBefore.times.every((value) => !/Today|Yesterday|\d{4}/.test(value)), JSON.stringify(historyBefore.times));
  assert.equal(historyBefore.openInAction, true);
  assert.match(historyBefore.first, /ROW-200/);
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#counts .count", { timeout: 45000 });
  const failedNote = await page.evaluate(() => [...document.querySelectorAll("#counts .count")].map((node) => node.textContent).find((text) => text.includes("Failed")) || "");
  assert.match(failedNote, /1 change did not go through/);
  await page.goto(`http://127.0.0.1:${port}/console/history`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#history-list .activity-retry", { timeout: 45000 });
  await page.click("#history-list .activity-retry");
  await page.waitForSelector("#history-list .retried", { timeout: 20000 });
  const historyAfter = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#history-list .activity-row")];
    const fail = document.querySelector("#history-list .retried")?.closest(".activity-row");
    const group = fail && fail.closest(".activity-group");
    const nested = group && group.querySelector(".is-retry");
    const members = group ? [...group.querySelectorAll(".activity-row")] : [];
    return {
      first: rows[0] ? rows[0].textContent : "",
      faded: !!(fail && fail.classList.contains("muted")),
      opacity: fail ? getComputedStyle(fail).opacity : "",
      noteInCopy: !!(fail && fail.querySelector(".activity-copy .retried")),
      noteInAction: !!(fail && fail.querySelector(".activity-action .retried")),
      nestedAfter: !!(nested && fail && members.indexOf(nested) > members.indexOf(fail)),
    };
  });
  assert.match(historyAfter.first, /ROW-200/);
  assert.equal(historyAfter.faded, false);
  assert.equal(historyAfter.opacity, "1");
  assert.equal(historyAfter.noteInCopy, true);
  assert.equal(historyAfter.noteInAction, false);
  assert.equal(historyAfter.nestedAfter, true, JSON.stringify(historyAfter));

  const stamp = /^(Today at \d{1,2}:\d{2} [AP]M|Yesterday at \d{1,2}:\d{2} [AP]M|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) at \d{1,2}:\d{2} [AP]M|\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [AP]M)$/;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#counts .count", { timeout: 45000 });
  const homeCopy = await page.evaluate(() => ({
    again: document.getElementById("read-again").textContent,
    error: document.getElementById("read-error-copy").textContent,
  }));
  assert.equal(homeCopy.again, "Try again");
  assert.match(homeCopy.error, /^Home could not be loaded/);
  assert.doesNotMatch(homeCopy.error, /Try again|Retry/);

  await page.goto(`http://127.0.0.1:${port}/console/status`, { waitUntil: "domcontentloaded" });
  const toolHelp = await page.locator("#tools-card .card-help").innerText();
  assert.equal(toolHelp, "Connect a tool to let Sederunt act in it.");

  await page.goto(`http://127.0.0.1:${port}/console/rooms`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#room-list [data-col='started']", { timeout: 45000 });
  const started = await page.evaluate(() => [...document.querySelectorAll("#room-list [data-col='started']")].map((node) => node.textContent.trim()).filter(Boolean));
  assert.ok(started.length > 0, "rooms have start times");
  assert.ok(started.every((value) => /^(Today at \d{1,2}:\d{2} [AP]M|Yesterday at \d{1,2}:\d{2} [AP]M|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) at \d{1,2}:\d{2} [AP]M|\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [AP]M)$/.test(value)), JSON.stringify(started));

  await page.goto(`http://127.0.0.1:${port}/console/account`, { waitUntil: "domcontentloaded" });
  const expiry = (await page.locator("#account-detail-expiry").innerText()).trim();
  assert.match(expiry, stamp, expiry);

  await page.goto(`http://127.0.0.1:${port}/console/decisions`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#record-list .decision-row", { timeout: 45000 });
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll("#record-list .decision-row")].find((node) => /opens at ten/.test(node.textContent));
    const meta = row.querySelector(".meta").textContent;
    const found = meta.match(/(Today at \d{1,2}:\d{2} [AP]M|Yesterday at \d{1,2}:\d{2} [AP]M|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) at \d{1,2}:\d{2} [AP]M|\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [AP]M)/);
    row.click();
    return { when: found ? found[1] : "" };
  });
  assert.match(opened.when, stamp, opened.when);
  await page.waitForSelector("#decision-dialog:not([hidden])", { timeout: 10000 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const width of [1920, 1097, 1024, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const detail = await page.evaluate(() => {
      const sentence = document.getElementById("decision-sentence");
      const other = document.getElementById("decision-other");
      const proof = document.getElementById("decision-proof");
      const clip = (node) => !!(node && node.scrollWidth > node.clientWidth + 1);
      return {
        hidden: document.getElementById("decision-dialog").hidden,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        sentenceClip: clip(sentence),
        otherClip: clip(other),
        heard: document.getElementById("decision-heard").textContent,
        other: other.textContent,
        proof: proof.textContent,
        proofHidden: proof.hidden,
        href: document.getElementById("decision-room").getAttribute("href"),
        copy: document.getElementById("decision-copy").textContent,
        jargon: document.body.innerText.includes("No checkpoint was returned."),
      };
    });
    assert.equal(detail.hidden, false, `dialog hidden at ${width}`);
    assert.equal(detail.overflow, false, `dialog ${width} overflows`);
    assert.equal(detail.sentenceClip, false, `sentence clipped at ${width}`);
    assert.equal(detail.otherClip, false, `clash clipped at ${width}`);
    assert.match(detail.heard, new RegExp(opened.when.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.match(detail.other, /Clashes with: The booth opens at nine.+\(rowan, \d{1,2}:\d{2} [AP]M\)/);
    assert.equal(detail.proofHidden, true, detail.proof);
    assert.equal(detail.proof, "");
    assert.equal(detail.href, "/console/rooms/booth");
    assert.equal(detail.copy, "Copy");
    assert.equal(detail.jargon, false);
  }
  await page.click("#decision-copy");
  await page.waitForFunction(() => document.getElementById("toast") && !document.getElementById("toast").hidden, { timeout: 5000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /opens at ten/);
  assert.match(copied, /Clashes with:/);

  async function shortTargets(target) {
    return target.evaluate(() => {
      const nodes = [...document.querySelectorAll("a, button, input, select, textarea, summary, [role='button']")];
      const shorts = [];
      for (const el of nodes) {
        if (el.closest("[hidden]")) continue;
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "hidden") continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
        const host = el.getBoundingClientRect();
        if (host.width < 1 || host.height < 1) continue;
        if (host.right <= 1 || host.left >= window.innerWidth - 1) continue;
        let width = host.width;
        let height = host.height;
        for (const pseudo of ["::before", "::after"]) {
          const pseudoStyle = getComputedStyle(el, pseudo);
          const content = pseudoStyle.content;
          if (!content || content === "none" || content === "normal") continue;
          const w = parseFloat(pseudoStyle.width);
          const h = parseFloat(pseudoStyle.height);
          if (w > 0) width = Math.max(width, w);
          if (h > 0) height = Math.max(height, h);
        }
        if (width >= 43.5 && height >= 43.5) continue;
        shorts.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: String(el.className || "").slice(0, 60),
          w: Math.round(width),
          h: Math.round(height),
          text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        });
      }
      return {
        shorts,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  const phonePages = ["/console/history", "/console/status", "/console/rooms", "/console/rooms/booth"];
  for (const path of phonePages) {
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "domcontentloaded" });
    if (path.endsWith("/booth")) await page.waitForSelector("#file-head", { timeout: 45000 });
    else await page.waitForSelector("a, button", { timeout: 45000 });
    const hit = await shortTargets(page);
    assert.equal(hit.overflow, false, `${path} 390 overflows`);
    assert.deepEqual(hit.shorts, [], `${path} 390 short targets ${JSON.stringify(hit.shorts)}`);
  }
  const bare = await browser.newContext();
  const sign = await bare.newPage();
  await sign.setViewportSize({ width: 390, height: 800 });
  await sign.goto(`http://127.0.0.1:${port}/console/sign-in`, { waitUntil: "domcontentloaded" });
  await sign.waitForSelector("#sign-submit", { timeout: 45000 });
  const signHit = await shortTargets(sign);
  assert.equal(signHit.overflow, false, "sign-in 390 overflows");
  assert.deepEqual(signHit.shorts, [], `sign-in 390 short targets ${JSON.stringify(signHit.shorts)}`);
  await bare.close();
  assert.deepEqual(errors, []);
});
