import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { logAction, logFailure, logRequest } from "../src/activity.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { renderConsolePage } from "../src/console-page.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "pass06-secret";
const WIDTHS = [1920, 1097, 1024, 768, 640, 390];

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

test("history script keeps whitespace escapes", () => {
  const src = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const start = src.indexOf("return `<!DOCTYPE html>");
  const end = src.indexOf("</html>`;");
  const tpl = src.slice(start, end);
  const valid = new Set(["'", '"', "\\", "`", "$", "n", "r", "t", "f", "v", "0", "x", "u"]);
  for (let i = 0; i < tpl.length; i += 1) {
    if (tpl[i] !== "\\") continue;
    const next = tpl[i + 1] || "";
    if (next === "\\") {
      i += 1;
      continue;
    }
    assert.ok(valid.has(next), `unescaped \\${next} in the console template`);
  }
  const html = renderConsolePage({ signedIn: true });
  assert.equal(html.includes("replace(/s+/g"), false);
  assert.equal(html.includes("https?:///"), false);
  assert.match(html, /head\.slice\(0, 8\) === "https:\/\/"/);
  assert.match(html, /function collapseSpaces/);
  assert.match(html, /function ensureWordSpace/);
});

function historySession() {
  const session = createSession();
  session.rooms.push({ id: "booth", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T11:00:00.000Z" });
  session.decisions.push({
    id: "d-nine",
    account: "company",
    kind: "decision",
    text: "The booth opens at nine.",
    speakerMemberId: "rowan",
    inviteMemberIds: ["mina", "rowan"],
    roomId: "booth",
    spokenAt: "2026-11-03T11:20:00.000Z",
    contradicts: [],
    fileNames: [],
  });
  const tool = { name: "act", server: "sederunt-mcp" };
  logAction(session, {
    id: "act-post",
    requestId: "act-post",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "post",
    target: { system: "slack", type: "message", title: "Booth recap", channel: "ops", url: "https://sederunt.example/booth" },
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

function appFor(session) {
  return createApp({
    session,
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
}

async function openConsole(t, session, port) {
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
  const app = appFor(session);
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

serial("history sentences keep letters and single spaces", async (t) => {
  const opened = await openConsole(t, historySession(), 4706);
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console/history`, { waitUntil: "networkidle" });
    await page.waitForSelector("#history-list .activity-copy", { timeout: 45000 });
    const measured = await page.evaluate(() => {
      const copies = [...document.querySelectorAll("#history-list .activity-copy")].map((copy) => {
        const parts = [...copy.childNodes].map((node) => ({
          type: node.nodeType === 3 ? "text" : (node.className || node.tagName),
          text: node.textContent,
        }));
        const elements = [...copy.children];
        let separated = true;
        for (let i = 1; i < elements.length; i += 1) {
          const between = elements[i].previousSibling;
          if (!between || between.nodeType !== 3 || between.textContent !== " ") separated = false;
        }
        return { text: copy.textContent, parts, separated };
      });
      const doc = document.documentElement;
      const clipped = [...document.querySelectorAll("#history-list .activity-row")].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.right > window.innerWidth + 1 || box.left < -1;
      }).length;
      return {
        copies,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        clipped,
      };
    });
    assert.equal(measured.overflow, false, `history ${width} overflows`);
    assert.equal(measured.clipped, 0, `history ${width} clips a row`);
    const texts = measured.copies.map((copy) => copy.text);
    const posted = texts.find((text) => text.includes("posted"));
    const asked = texts.find((text) => text.includes("asked"));
    assert.equal(posted, "Sederunt posted Booth recap in #ops via Slack");
    assert.equal(asked, "Quang asked to update Travel budget sheet");
    for (const copy of measured.copies) {
      assert.equal(copy.separated, true, `${width} parts ${JSON.stringify(copy.parts)}`);
      assert.equal(copy.text.includes("  "), false, copy.text);
      assert.equal(copy.text.includes("po ted"), false);
      assert.equal(copy.text.includes("a ked"), false);
    }
  }
  assert.deepEqual(errors, []);
});

function attentionSession() {
  const session = historySession();
  session.decisions.push({
    id: "d-ten",
    account: "company",
    kind: "decision",
    text: "The booth opens at ten.",
    speakerMemberId: "tomas",
    inviteMemberIds: ["mina", "tomas"],
    roomId: "booth",
    spokenAt: "2026-11-03T10:43:00.000Z",
    contradicts: ["d-nine"],
    fileNames: [],
  });
  session.decisions[0].contradicts = ["d-ten"];
  const tool = { name: "act", server: "sederunt-mcp" };
  logFailure(session, {
    id: "fail-sheet",
    requestId: "fail-sheet",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "update",
    target: { system: "linear", type: "issue", id: "ROW-88", title: "Travel budget sheet" },
    error: "timed out",
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  return session;
}

serial("empty home and chat offer a next step", async (t) => {
  const opened = await openConsole(t, createSession(), 4707);
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("#home-empty:not([hidden])", { timeout: 45000 });
    const home = await page.evaluate(() => {
      const empty = document.getElementById("home-empty");
      const stats = document.getElementById("home-stats");
      const attention = document.getElementById("needs-attention");
      const add = document.getElementById("home-add-meeting");
      const connect = document.getElementById("home-connect-tools");
      const counts = [...document.querySelectorAll("#counts .count")];
      const doc = document.documentElement;
      return {
        empty: !empty.hidden && empty.getClientRects().length > 0,
        add: add.textContent.trim(),
        connect: connect.textContent.trim(),
        connectHref: connect.getAttribute("href"),
        statsHidden: stats.hidden || getComputedStyle(stats).display === "none",
        attentionHidden: attention.hidden,
        zeroShown: counts.some((node) => node.getClientRects().length > 0),
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(home.empty, true, `empty card ${width}`);
    assert.equal(home.add, "Add Sederunt to a meeting");
    assert.equal(home.connect, "Connect tools");
    assert.equal(home.connectHref, "/console/status");
    assert.equal(home.statsHidden, true, `stats ${width}`);
    assert.equal(home.attentionHidden, true);
    assert.equal(home.zeroShown, false);
    assert.equal(home.overflow, false, `empty home ${width} overflows`);
    await page.goto(`http://127.0.0.1:${opened.port}/console/chat`, { waitUntil: "networkidle" });
    await page.waitForSelector("#chat-suggests .suggest-chip", { timeout: 45000 });
    const chat = await page.evaluate(() => {
      const chips = [...document.querySelectorAll("#chat-suggests .suggest-chip")].map((node) => node.textContent.trim());
      const see = [...document.querySelectorAll("#chat button")].filter((node) => node.textContent.trim() === "See Status" && node.getClientRects().length > 0);
      const doc = document.documentElement;
      return { chips, see: see.length, overflow: doc.scrollWidth > doc.clientWidth + 1 };
    });
    assert.equal(chat.chips.length, 3);
    assert.equal(chat.see, 0, `See Status still visible at ${width}`);
    assert.equal(chat.overflow, false, `empty chat ${width} overflows`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${opened.port}/console/chat`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chat-suggests .suggest-chip", { timeout: 45000 });
  const prompt = await page.locator("#chat-suggests .suggest-chip").first().textContent();
  await page.locator("#chat-suggests .suggest-chip").first().click();
  const filled = await page.locator("#chat-text").inputValue();
  assert.equal(filled, prompt.trim());
  await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#home-connect-tools", { timeout: 45000 });
  await page.click("#home-connect-tools");
  await page.waitForFunction(() => {
    const overview = document.getElementById("overview");
    return overview && !overview.hidden;
  });
  await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#home-add-meeting", { timeout: 45000 });
  await page.click("#home-add-meeting");
  await page.waitForSelector("#create-dialog:not([hidden])", { timeout: 45000 });
  const dialog = await page.locator("#create-title").textContent();
  assert.match(dialog, /room|Meeting/i);
  assert.deepEqual(errors, []);
});

serial("home stats share a row and needs attention links the work", async (t) => {
  const opened = await openConsole(t, attentionSession(), 4708);
  if (!opened) return;
  const { page, errors } = opened;
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#needs-attention:not([hidden]) a.attention-row", { timeout: 45000 });
  const attention = await page.evaluate(() => {
    const section = document.getElementById("needs-attention");
    const stats = document.getElementById("home-stats");
    const rows = [...section.querySelectorAll("a.attention-row")];
    return {
      hidden: section.hidden,
      count: rows.length,
      texts: rows.map((row) => row.textContent.replace(/\s+/g, " ").trim()),
      hrefs: rows.map((row) => row.getAttribute("href")),
      below: section.getBoundingClientRect().top >= stats.getBoundingClientRect().bottom - 1,
    };
  });
  assert.equal(attention.hidden, false);
  assert.ok(attention.count >= 2 && attention.count <= 5, JSON.stringify(attention.texts));
  assert.equal(attention.below, true);
  assert.ok(attention.texts.some((text) => text.startsWith("Clashing")));
  assert.ok(attention.texts.some((text) => text.startsWith("Failed")));
  assert.ok(attention.hrefs.some((href) => href.startsWith("/console/rooms/booth")));
  assert.ok(attention.hrefs.some((href) => href.includes("#activity-fail-sheet")));
  await page.click("#needs-attention a.attention-row[href*='activity-fail-sheet']");
  await page.waitForSelector("#activity-fail-sheet", { timeout: 45000 });
  const historyOn = await page.evaluate(() => {
    const row = document.getElementById("activity-fail-sheet");
    const history = document.getElementById("history");
    return { historyHidden: history.hidden, row: !!row };
  });
  assert.equal(historyOn.historyHidden, false);
  assert.equal(historyOn.row, true);
  await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#needs-attention a[href*='/console/rooms/booth']", { timeout: 45000 });
  await page.click("#needs-attention a[href*='/console/rooms/booth']");
  await page.waitForFunction(() => document.body.classList.contains("room-open"), { timeout: 45000 });

  for (const width of [640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("#counts .count", { timeout: 45000 });
    const stats = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#counts .count")].filter((node) => node.getClientRects().length);
      const boxes = cards.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: Math.round(box.top), width: Math.round(box.width), left: Math.round(box.left) };
      });
      const doc = document.documentElement;
      return { boxes, overflow: doc.scrollWidth > doc.clientWidth + 1 };
    });
    assert.equal(stats.boxes.length, 3, `${width} cards ${JSON.stringify(stats.boxes)}`);
    const tops = new Set(stats.boxes.map((box) => box.top));
    assert.equal(tops.size, 1, `${width} tops ${JSON.stringify(stats.boxes)}`);
    const widths = stats.boxes.map((box) => box.width);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 2, `${width} widths ${widths.join(",")}`);
    assert.equal(stats.overflow, false, `home ${width} overflows`);
  }
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("#counts .count", { timeout: 45000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `populated home ${width} overflows`);
  }
  assert.deepEqual(errors, []);
});
