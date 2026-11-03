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
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "mina",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
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
    { path: "/console/status", table: "#tools-card .connectors", row: "#tools-card .connectors > .conn", head: "#tools-card .status-head" },
  ];

  for (const width of [1920, 1097, 1024, 768]) {
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
        const stacked = history && getComputedStyle(root).display === "block";
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
        };
      }, surface);
      assert.equal(measured.overflow, false, `${surface.path} ${width} overflows`);
      const uniqueHeights = [...new Set(measured.heights)];
      if (!(surface.history && width <= 768)) {
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
  assert.deepEqual(errors, []);
});
