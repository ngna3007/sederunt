import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { logAction, logRequest } from "../src/activity.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "pass07-secret";

let tail = Promise.resolve();
function serial(name, fn) {
  test(name, async (t) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      await fn(t);
    } finally {
      release();
    }
  });
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

function appFor(session, extra = {}) {
  return createApp({
    session,
    companyLoaded: true,
    linearReady: extra.linearReady === true,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "mina",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
      ...(extra.env || {}),
    },
  });
}

async function openConsole(t, session, port, extra) {
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
  const app = appFor(session, extra);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(() => {
    browser.close();
    app.close();
  });
  app.listen(port, "127.0.0.1");
  const bound = await once(app, "listening").then(() => app.address().port);
  const token = sealSession({ memberId: "mina", name: "Mina", exp: Date.now() + 60_000 }, SECRET);
  const cookie = sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
  const context = await browser.newContext();
  const eq = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: `http://127.0.0.1:${bound}` }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return { page, errors, port: bound };
}

function visiblePhrases() {
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!/No rooms yet/.test(node.textContent || "")) continue;
    const el = node.parentElement;
    if (!el) continue;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (rect.width < 1 || rect.height < 1) continue;
    hits.push({ text: node.textContent.trim(), id: el.id || el.className });
  }
  const shown = (selector) => {
    const target = document.querySelector(selector);
    if (!target) return false;
    const style = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  return {
    hits,
    homeEmpty: shown("#home-empty"),
    explorer: shown("#rooms .explorer"),
    head: shown("#rooms .explorer-head"),
    roomEmpty: shown("#room-empty"),
    roomText: (document.getElementById("room-empty") || {}).innerText || "",
  };
}

function historySession() {
  const session = createSession();
  session.rooms.push({ id: "booth", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T11:00:00.000Z" });
  const tool = { name: "act", server: "sederunt-mcp" };
  logAction(session, {
    id: "act-post",
    requestId: "act-post",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "post",
    target: { system: "slack", type: "message", title: "Booth recap", channel: "ops", url: "https://sederunt.slack.com/archives/C012/p123" },
    changes: [{ field: "channel", to: "ops" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  logRequest(session, {
    id: "req-sheet",
    requestId: "req-sheet",
    actor: { type: "person", name: "Quang" },
    verb: "update",
    target: { system: "linear", type: "issue", id: "ROW-88", title: "Travel budget sheet" },
    changes: [{ field: "title", to: "Travel budget sheet" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  return session;
}

serial("empty home shows one No rooms yet, and Rooms keeps its empty state", async (t) => {
  const opened = await openConsole(t, createSession(), 4720, {
    env: { SLACK_SIGNING_SECRET: "slack-secret", SLACK_BOT_TOKEN: "slack-token" },
  });
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("body:not(.is-reading) #home-empty:not([hidden])", { timeout: 45000 });
    const home = await page.evaluate(visiblePhrases);
    assert.equal(home.homeEmpty, true, `home card ${width}`);
    assert.equal(home.explorer, false, `room table ${width}`);
    assert.equal(home.head, false, `room header ${width}`);
    assert.equal(home.roomEmpty, false, `room empty ${width}`);
    assert.equal(home.hits.length, 1, `${width} phrases ${JSON.stringify(home.hits)}`);
    assert.match(home.hits[0].text, /^No rooms yet\.?$/);
    await page.goto(`http://127.0.0.1:${opened.port}/console/rooms`, { waitUntil: "networkidle" });
    await page.waitForSelector("#room-empty:not([hidden])", { timeout: 45000 });
    const rooms = await page.evaluate(visiblePhrases);
    assert.equal(rooms.roomEmpty, true, `rooms empty ${width}`);
    assert.match(rooms.roomText, /No rooms yet/);
    assert.match(rooms.roomText, /Bring Sederunt into a meeting or a channel/);
    assert.equal(rooms.homeEmpty, false, `home card on rooms ${width}`);
  }
  assert.deepEqual(errors, []);
});

serial("stacked history meta is a clock, a spaced dot, and the room", async (t) => {
  const opened = await openConsole(t, historySession(), 4721);
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console/history`, { waitUntil: "networkidle" });
    await page.waitForSelector("#history-list .activity-meta", { timeout: 45000 });
    const metas = await page.evaluate(() => {
      return [...document.querySelectorAll("#history-list .activity-meta")].filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).map((node) => node.innerText);
    });
    assert.ok(metas.length > 0, `no meta at ${width}`);
    for (const text of metas) {
      assert.match(text, /^\d{1,2}:\d{2} [AP]M · \S/, `${width} meta ${JSON.stringify(text)}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${opened.port}/console/history`, { waitUntil: "networkidle" });
  await page.waitForSelector("#history-list .room-suffix", { timeout: 45000 });
  const wide = await page.evaluate(() => {
    const suffix = document.querySelector("#history-list .room-suffix");
    const sep = document.querySelector("#history-list .meta-sep");
    return {
      suffix: suffix ? suffix.innerText : "",
      sep: sep ? getComputedStyle(sep).display : "missing",
    };
  });
  assert.equal(wide.suffix, "Booth planning");
  assert.equal(wide.sep, "none");
  assert.deepEqual(errors, []);
});
