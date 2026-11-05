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
      const scope = empty.closest(".home-tools")?.parentElement || document.body;
      const primaries = [...scope.querySelectorAll(".primary")]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.textContent.trim());
      return {
        primaries,
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
    // One primary on an empty Home: the card's button, not the header's New room.
    assert.deepEqual(home.primaries, ["Add Sederunt to a meeting"], `primaries ${width}`);
    assert.equal(home.connect, "Connect tools");
    assert.equal(home.connectHref, "/console/setup");
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
  assert.equal(await page.locator("#ask-ai-dialog").isHidden(), true, "Ask AI opens straight to the composer");
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

serial("setup and account keep their actions in the right cards", async (t) => {
  const opened = await openConsole(t, createSession(), 4709);
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console/setup`, { waitUntil: "networkidle" });
    await page.waitForSelector("#overview:not([hidden]) .tool-ask", { timeout: 45000 });
    const setup = await page.evaluate(() => {
      const title = document.querySelector("#overview .page-title");
      const nav = document.getElementById("show-connectors");
      const asks = [...document.querySelectorAll("#tools-card .tool-ask")].filter((node) => node.getClientRects().length);
      const connects = [...document.querySelectorAll("#tools-card .conn-connect")].filter((node) => node.getClientRects().length);
      const manages = [...document.querySelectorAll("#tools-card .conn-manage")].filter((node) => node.getClientRects().length);
      const rows = [...document.querySelectorAll("#tools-card .connectors > .conn")].filter((node) => node.getClientRects().length);
      const toolX = rows.map((row) => Math.round(row.querySelector('[data-col="tool"]').getBoundingClientRect().x));
      const actionX = rows.map((row) => Math.round(row.querySelector('[data-col="action"]').getBoundingClientRect().x));
      const headTool = Math.round(document.querySelector('#tools-card .status-head [data-col="tool"]').getBoundingClientRect().x);
      const switchX = asks.map((row) => Math.round(row.querySelector(".conn-ask").getBoundingClientRect().x));
      const doc = document.documentElement;
      const clipped = [...document.querySelectorAll("#tools-card .conn, #tools-card .tool-ask")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.right > window.innerWidth + 1 || box.left < -1;
      }).length;
      return {
        title: title ? title.textContent.trim() : "",
        nav: nav ? nav.textContent.trim() : "",
        crumb: document.getElementById("crumb-current").textContent.trim(),
        asks: asks.map((node) => node.textContent.replace(/\s+/g, " ").trim()),
        connects: connects.map((node) => node.textContent.trim()),
        manages: manages.length,
        toolX,
        actionX,
        headTool,
        switchX,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        clipped,
      };
    });
    assert.equal(setup.title, "Setup", `title ${width}`);
    assert.equal(setup.nav, "Setup", `nav ${width}`);
    assert.equal(setup.crumb, "Setup");
    assert.deepEqual(setup.asks, ["Run automatically for Calendar", "Run automatically for Linear", "Run automatically for Slack"]);
    assert.deepEqual(setup.connects, ["Connect", "Connect", "Connect"]);
    assert.equal(setup.manages, 0, "Manage shows before a tool is connected");
    assert.equal(setup.headTool, setup.toolX[0]);
    assert.ok(setup.toolX.every((x) => Math.abs(x - setup.toolX[0]) <= 1), `tool x ${setup.toolX}`);
    assert.ok(setup.actionX.every((x) => Math.abs(x - setup.actionX[0]) <= 1), `action x ${setup.actionX}`);
    assert.ok(setup.switchX.every((x) => Math.abs(x - setup.switchX[0]) <= 1), `switch x ${setup.switchX}`);
    assert.equal(setup.overflow, false, `setup ${width} overflows`);
    assert.equal(setup.clipped, 0, `setup ${width} clips`);
    await page.goto(`http://127.0.0.1:${opened.port}/console/account`, { waitUntil: "networkidle" });
    await page.waitForSelector("#account-card #account-edit", { timeout: 45000 });
    const account = await page.evaluate(() => {
      const card = document.getElementById("account-card");
      const edit = document.getElementById("account-edit");
      const sessions = [...document.querySelectorAll("#account-page .settings-card")].find((node) => node.querySelector(".section-label") && node.querySelector(".section-label").textContent.trim() === "Sessions");
      const avatar = document.getElementById("account-page-avatar").getBoundingClientRect();
      const name = document.getElementById("account-page-name").getBoundingClientRect();
      const button = edit.getBoundingClientRect();
      const doc = document.documentElement;
      return {
        name: document.getElementById("account-page-name").textContent.trim(),
        role: document.getElementById("account-page-role").textContent.trim(),
        editInCard: card.contains(edit),
        secondary: edit.classList.contains("secondary"),
        signOut: sessions ? sessions.querySelector("#account-signout") !== null : false,
        editInSessions: sessions ? sessions.querySelector("#account-edit") !== null : true,
        dir: getComputedStyle(card).flexDirection,
        horizontal: button.left >= name.right - 1 && avatar.left < name.left,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(account.name, "Mina");
    assert.equal(account.role, "Owner");
    assert.equal(account.editInCard, true);
    assert.equal(account.secondary, true);
    assert.equal(account.signOut, true);
    assert.equal(account.editInSessions, false);
    if (width >= 768) assert.equal(account.dir, "row");
    if (width >= 768) assert.equal(account.horizontal, true, `account layout ${width}`);
    assert.equal(account.overflow, false, `account ${width} overflows`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${opened.port}/console/status`, { waitUntil: "networkidle" });
  await page.waitForSelector("#overview:not([hidden]) .page-title", { timeout: 45000 });
  const alias = await page.evaluate(() => ({
    path: location.pathname,
    title: document.querySelector("#overview .page-title").textContent.trim(),
  }));
  assert.equal(alias.path, "/console/status");
  assert.equal(alias.title, "Setup");
  await page.goto(`http://127.0.0.1:${opened.port}/console/account`, { waitUntil: "networkidle" });
  await page.click("#account-edit");
  await page.waitForSelector("#profile-dialog:not([hidden])", { timeout: 45000 });
  assert.deepEqual(errors, []);

  const connected = await openConsole(t, createSession(), 4710, {
    linearReady: true,
    env: {
      CALENDAR_MCP_TOKEN: "calendar-token",
      SLACK_SIGNING_SECRET: "slack-secret",
      SLACK_BOT_TOKEN: "slack-token",
    },
  });
  if (!connected) return;
  await connected.page.setViewportSize({ width: 1280, height: 900 });
  await connected.page.goto(`http://127.0.0.1:${connected.port}/console/setup`, { waitUntil: "networkidle" });
  await connected.page.waitForSelector("#slack-manage:not([hidden])", { timeout: 45000 });
  const linked = await connected.page.evaluate(() => {
    const manages = [...document.querySelectorAll("#tools-card .conn-manage")].filter((node) => node.getClientRects().length);
    const connects = [...document.querySelectorAll("#tools-card .conn-connect")].filter((node) => node.getClientRects().length);
    return {
      manages: manages.map((node) => node.getAttribute("data-connect")),
      connects: connects.length,
      states: [...document.querySelectorAll("#tools-card .conn-state")].map((node) => node.textContent.trim()),
    };
  });
  assert.deepEqual(linked.manages, ["calendar", "linear", "slack"]);
  assert.equal(linked.connects, 0);
  assert.deepEqual(linked.states, ["Connected", "Connected", "Connected"]);
  const saved = connected.page.waitForResponse((response) => response.url().includes("/api/typed") && response.request().method() === "POST");
  await connected.page.locator("#slack-ask").click();
  const response = await saved;
  assert.equal(response.ok(), true);
  await connected.page.waitForFunction(() => document.getElementById("slack-ask").checked === false);
  await connected.page.reload({ waitUntil: "networkidle" });
  await connected.page.waitForSelector("#slack-ask");
  assert.equal(await connected.page.locator("#slack-ask").isChecked(), false);
  assert.deepEqual(connected.errors, []);
});

test("console type scale is 12/13/14/16/20/28 and weights 400/500/600, all through tokens", () => {
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  const tokens = css.slice(css.indexOf("/* @tokens start"), css.indexOf("/* @tokens end"));
  const scale = Object.fromEntries([...tokens.matchAll(/--text-(xs|sm|base|lg|xl|2xl):\s*(\d+px)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(scale, { xs: "12px", sm: "13px", base: "14px", lg: "16px", xl: "20px", "2xl": "28px" });
  const sizes = [...css.matchAll(/font-size:\s*([^;]+)/g)].map((match) => match[1].replace(/!important/g, "").trim());
  const allowedSizes = new Set(["0", "var(--text-xs)", "var(--text-sm)", "var(--text-base)", "var(--text-lg)", "var(--text-xl)", "var(--text-2xl)"]);
  for (const size of sizes) assert.ok(allowedSizes.has(size), `font-size ${size}`);
  assert.match(tokens, /--weight-regular: 400;[\s\S]*--weight-medium: 500;[\s\S]*--weight-semibold: 600;/);
  const weights = [...css.matchAll(/font-weight:\s*([^;]+)/g)].map((match) => match[1].replace(/!important/g, "").trim());
  for (const weight of weights) {
    if (weight === "100 900") continue;
    assert.ok(/^var\(--weight-(regular|medium|semibold)\)$/.test(weight), `font-weight ${weight}`);
  }
});

function polishSession() {
  const session = attentionSession();
  for (let i = 1; i <= 18; i += 1) {
    const n = String(i).padStart(2, "0");
    session.rooms.push({
      id: `palette-${n}`,
      name: `Palette room ${n}`,
      platform: "Google Meet",
      startedAt: "2026-11-03T09:00:00.000Z",
    });
  }
  return session;
}

serial("polish keeps the logo, rows, sign-in, and palette inside the page", async (t) => {
  const opened = await openConsole(t, polishSession(), 4711);
  if (!opened) return;
  const { page, errors } = opened;
  const bare = await page.context().browser().newContext();
  t.after(() => bare.close());
  const sign = await bare.newPage();
  sign.on("pageerror", (error) => errors.push(String(error)));

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("p.brand svg.sederunt-mark", { timeout: 45000 });
    const logo = await page.evaluate(() => {
      const mark = document.querySelector("p.brand svg.sederunt-mark");
      const word = document.querySelector("p.brand .brand-word");
      const box = mark.getBoundingClientRect();
      const text = word.getBoundingClientRect();
      const logoBg = "rgb(8, 20, 40)";
      const tiles = [...document.querySelectorAll("#chip-mark, #workspace-menu .tile-mark")].map((node) => {
        const style = getComputedStyle(node);
        return {
          bg: style.backgroundColor,
          border: parseFloat(style.borderTopWidth),
        };
      });
      const doc = document.documentElement;
      return {
        size: [box.width, box.height],
        dy: Math.abs((text.top + text.bottom) / 2 - (box.top + box.bottom) / 2),
        logoBg,
        tiles,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.deepEqual(logo.size, [28, 28], `logo size ${width}`);
    assert.ok(logo.dy <= 2, `logo dy ${width} ${logo.dy}`);
    assert.ok(logo.tiles.length >= 2, `workspace tiles ${width}`);
    for (const tile of logo.tiles) {
      assert.notEqual(tile.bg, logo.logoBg, `workspace tile matches the logo at ${width}`);
      assert.ok(tile.border >= 1, `workspace tile border ${width}`);
    }
    assert.equal(logo.overflow, false, `home ${width} overflows`);

    await page.goto(`http://127.0.0.1:${opened.port}/console/people`, { waitUntil: "networkidle" });
    await page.waitForSelector("#people-table .people-row .num", { timeout: 45000 });
    if (width === 390) {
      const people = await page.evaluate(() => {
        const row = document.querySelector("#people-table .people-row");
        const num = row.querySelector(".num");
        const heard = row.querySelector(".heard");
        const name = row.querySelector(".person");
        const numBox = num.getBoundingClientRect();
        const heardBox = heard.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const chips = row.querySelector(".room-chips");
        const chipsStyle = chips ? getComputedStyle(chips) : null;
        return {
          height: rowBox.height,
          count: num.textContent,
          heard: heard.textContent,
          sameLine: Math.abs((numBox.top + numBox.bottom) - (heardBox.top + heardBox.bottom)) <= 4,
          underName: numBox.top >= nameBox.bottom - 2,
          heardInside: heardBox.top >= rowBox.top - 1 && heardBox.bottom <= rowBox.bottom + 1,
          chipsHidden: !chips || chipsStyle.display === "none" || chips.getClientRects().length === 0,
          clipped: row.scrollHeight > row.clientHeight + 1,
        };
      });
      assert.ok(people.height >= 64 && people.height <= 72, `people row ${people.height}`);
      assert.match(people.count, /decision/);
      assert.ok(people.heard.length > 0);
      assert.equal(people.sameLine, true);
      assert.equal(people.underName, true);
      assert.equal(people.heardInside, true);
      assert.equal(people.chipsHidden, true);
      assert.equal(people.clipped, false);
    }

    await page.goto(`http://127.0.0.1:${opened.port}/console/decisions`, { waitUntil: "networkidle" });
    await page.waitForSelector("#record-list .decision-row", { timeout: 45000 });
    const decisions = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#record-list .decision-row")];
      const visible = [...document.querySelectorAll("#record-list .decision-row .badge")].filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
      }).map((node) => node.textContent.trim());
      const doc = document.documentElement;
      return {
        current: visible.filter((text) => text === "Current").length,
        clashing: visible.filter((text) => text === "Clashing").length,
        pills: document.querySelectorAll("#record-list .plat-badge").length,
        names: rows.map((row) => (row.querySelector(".room-name") || {}).textContent || ""),
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(decisions.current, 0, `Current badges at ${width}`);
    assert.ok(decisions.clashing >= 1, `Clashing badge at ${width}`);
    assert.equal(decisions.pills, 0, `platform pills at ${width}`);
    assert.ok(decisions.names.every((name) => name.includes("Booth")), JSON.stringify(decisions.names));
    assert.equal(decisions.overflow, false, `decisions ${width} overflows`);

    await page.goto(`http://127.0.0.1:${opened.port}/console/history`, { waitUntil: "networkidle" });
    await page.waitForSelector("#history-list .day-heading", { timeout: 45000 });
    const history = await page.evaluate(() => {
      const head = document.querySelector('#history-list .history-head [data-col="action"]');
      const open = document.querySelector("#history-list .history-open");
      const day = document.querySelector("#history-list .day-heading");
      const doc = document.documentElement;
      const clipped = [...document.querySelectorAll("#history-list .activity-row, #history-list .day-heading")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1);
      }).length;
      return {
        day: day ? day.textContent.trim() : "",
        headShown: !!(head && getComputedStyle(head).display !== "none" && head.getClientRects().length),
        head: head ? head.textContent.trim() : "",
        open: open ? open.textContent.trim() : "",
        inAction: !!(open && open.closest(".activity-action")),
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        clipped,
      };
    });
    assert.ok(history.day.length > 0, `day heading ${width}`);
    if (width >= 1024) {
      assert.equal(history.headShown, true, `Open header ${width}`);
      assert.equal(history.head, "Open");
    }
    assert.equal(history.open, "Open");
    assert.equal(history.inAction, true);
    assert.equal(history.overflow, false, `history ${width} overflows`);
    assert.equal(history.clipped, 0, `history ${width} clips`);

    await page.goto(`http://127.0.0.1:${opened.port}/console/does-not-exist`, { waitUntil: "networkidle" });
    await page.waitForSelector("#page-missing:not([hidden]) .empty-title", { timeout: 45000 });
    const missing = await page.evaluate(() => {
      const title = document.querySelector("#page-missing .empty-title");
      const link = document.querySelector("#page-missing a.secondary");
      const probe = document.createElement("span");
      probe.style.color = "var(--foreground)";
      document.body.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      const doc = document.documentElement;
      return {
        title: title.textContent.trim(),
        color: getComputedStyle(title).color,
        ink,
        link: link ? link.textContent.replace(/\s+/g, " ").trim() : "",
        href: link ? link.getAttribute("href") : "",
        shown: link && link.getClientRects().length > 0,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(missing.title, "Page not found");
    assert.equal(missing.color, missing.ink, `missing title ${width}`);
    assert.equal(missing.link, "Back to Home");
    assert.equal(missing.href, "/console");
    assert.equal(missing.shown, true);
    assert.equal(missing.overflow, false, `missing ${width} overflows`);

    await sign.setViewportSize({ width, height: 900 });
    await sign.goto(`http://127.0.0.1:${opened.port}/console/sign-in?reason=mismatch`, { waitUntil: "networkidle" });
    await sign.waitForFunction(() => document.activeElement && document.activeElement.id === "sign-pass");
    const auth = await sign.evaluate(() => {
      const pass = document.getElementById("sign-pass");
      const name = document.getElementById("sign-name");
      const error = document.getElementById("pass-error");
      const probe = document.createElement("span");
      probe.style.color = "var(--destructive)";
      document.body.append(probe);
      const danger = getComputedStyle(probe).color;
      probe.remove();
      const doc = document.documentElement;
      return {
        passFirst: pass.getBoundingClientRect().top < name.getBoundingClientRect().top,
        invalid: pass.getAttribute("aria-invalid"),
        described: pass.getAttribute("aria-describedby"),
        error: error ? error.textContent.trim() : "",
        tied: error ? error.id : "",
        border: getComputedStyle(pass).borderTopColor,
        nameBorder: getComputedStyle(name).borderTopColor,
        danger,
        focused: document.activeElement && document.activeElement.id,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(auth.passFirst, true, `passphrase order ${width}`);
    assert.equal(auth.invalid, "true");
    assert.match(auth.described, /\bpass-error\b/);
    assert.equal(auth.error, "That passphrase does not match.");
    assert.equal(auth.tied, "pass-error");
    assert.equal(auth.border, auth.danger, `pass border ${width} ${auth.border}`);
    assert.notEqual(auth.border, auth.nameBorder);
    assert.equal(auth.focused, "sign-pass");
    assert.equal(auth.overflow, false, `sign-in ${width} overflows`);

    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.waitForSelector("#palette:not([hidden]) #palette-list [data-group='Rooms']", { timeout: 45000 });
    const palette = await page.evaluate(() => {
      const panel = document.querySelector(".palette-panel");
      const list = document.getElementById("palette-list");
      const rooms = list.querySelector("[data-group='Rooms']");
      const panelBox = panel.getBoundingClientRect();
      const doc = document.documentElement;
      return {
        panelBottom: panelBox.bottom,
        view: window.innerHeight,
        scrollable: list.scrollHeight > list.clientHeight + 8,
        roomsTop: rooms.getBoundingClientRect().top,
        listBottom: list.getBoundingClientRect().bottom,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.ok(palette.panelBottom <= palette.view + 1, `palette bottom ${width} ${palette.panelBottom}`);
    assert.equal(palette.scrollable, true, `palette scroll ${width}`);
    assert.ok(palette.roomsTop < palette.listBottom, `rooms group cut off at ${width}`);
    await page.evaluate(() => {
      const list = document.getElementById("palette-list");
      list.scrollTop = list.scrollHeight;
    });
    const late = await page.evaluate(() => {
      const list = document.getElementById("palette-list");
      const button = [...list.querySelectorAll("button")].find((node) => node.textContent.includes("Palette room 18"));
      if (!button) return { found: false };
      const box = button.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        found: true,
        inside: box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 2 && box.right <= listBox.right + 1,
      };
    });
    assert.equal(late.found, true, `late room ${width}`);
    assert.equal(late.inside, true, `late room visible ${width}`);
    assert.equal(palette.overflow, false, `palette ${width} overflows`);
    await page.keyboard.press("Escape");
  }
  assert.deepEqual(errors, []);
});

function reviewSession() {
  const session = attentionSession();
  session.decisions.push({
    id: "d-mina",
    account: "company",
    kind: "decision",
    text: "Mina keeps the north entrance.",
    speakerMemberId: "mina",
    inviteMemberIds: ["mina"],
    roomId: "booth",
    spokenAt: "2026-11-03T11:30:00.000Z",
    contradicts: [],
    fileNames: [],
  });
  session.rooms.push({ id: "quiet", name: "Quiet room", platform: "", startedAt: "" });
  return session;
}

serial("pass 04 columns, avatars, and failed contrast still hold", async (t) => {
  const opened = await openConsole(t, reviewSession(), 4712);
  if (!opened) return;
  const { page, errors } = opened;
  for (const width of [1920, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
    await page.waitForSelector("#room-list a.room .avatar-stack .face", { timeout: 45000 });
    const rooms = await page.evaluate(() => {
      const head = document.querySelector('#rooms .explorer-head [data-col="started"]');
      const headBox = head.getBoundingClientRect();
      const rows = [...document.querySelectorAll("#room-list > a.room")];
      const startedX = rows.map((row) => Math.round(row.querySelector('[data-col="started"]').getBoundingClientRect().x));
      const platformX = rows.map((row) => Math.round(row.querySelector('[data-col="platform"]').getBoundingClientRect().x));
      const quiet = rows.find((row) => row.getAttribute("data-room") === "quiet");
      const stack = document.querySelector('#room-list a.room[data-room="booth"] .avatar-stack');
      const faces = [...stack.querySelectorAll(".face")].map((face, index) => {
        const range = document.createRange();
        range.selectNodeContents(face);
        const glyph = range.getBoundingClientRect();
        const next = face.nextElementSibling;
        const nextBox = next ? next.getBoundingClientRect() : null;
        const style = getComputedStyle(face);
        return {
          text: face.textContent,
          shadow: style.boxShadow,
          margin: style.marginLeft,
          covered: !!(nextBox && (glyph.left + glyph.right) / 2 >= nextBox.left),
          index,
        };
      });
      const chevron = document.querySelector("#room-list a.room .row-view");
      const doc = document.documentElement;
      return {
        started: head ? head.textContent.trim() : "",
        align: head ? getComputedStyle(head).textAlign : "",
        headX: Math.round(headBox.x),
        startedX,
        platformX,
        quietStarted: quiet.querySelector('[data-col="started"]').textContent,
        quietPlatform: quiet.querySelector('[data-col="platform"]').textContent,
        chevron: !!(chevron && getComputedStyle(chevron).display !== "none" && chevron.getClientRects().length),
        faces,
        overflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    });
    assert.equal(rooms.started, "Started", `started header ${width}`);
    assert.ok(rooms.align === "left" || rooms.align === "start", rooms.align);
    assert.ok(rooms.startedX.every((x) => Math.abs(x - rooms.headX) <= 1), `${width} started x ${rooms.startedX} head ${rooms.headX}`);
    assert.ok(rooms.platformX.every((x) => Math.abs(x - rooms.platformX[0]) <= 1), `${width} platform x ${rooms.platformX}`);
    assert.equal(rooms.quietStarted, "");
    assert.equal(rooms.quietPlatform, "");
    assert.equal(rooms.quietStarted.includes("—"), false);
    assert.equal(rooms.chevron, true, `chevron ${width}`);
    assert.equal(rooms.faces.length, 3, JSON.stringify(rooms.faces));
    assert.equal(rooms.faces[2].text.startsWith("+"), true, rooms.faces[2].text);
    for (const face of rooms.faces) {
      assert.ok(face.text.length > 0);
      assert.equal(face.covered, false, `${width} ${face.text} covered`);
      if (face.index > 0) assert.match(face.shadow, /2px/);
    }
    assert.match(rooms.faces[1].margin, /^-6px/);
    assert.equal(rooms.overflow, false, `rooms ${width} overflow`);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${opened.port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#counts .count.danger", { timeout: 45000 });
  await page.waitForSelector(".badge.attention-failed", { timeout: 45000 });
  const contrast = await page.evaluate(() => {
    const channel = (color) => {
      const match = String(color).match(/rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)(?:,\s*([0-9.]+))?\)/);
      if (!match) return null;
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] == null ? 1 : Number(match[4]) };
    };
    const composite = (over, under) => {
      const alpha = over.a + under.a * (1 - over.a);
      if (!alpha) return { r: 255, g: 255, b: 255, a: 1 };
      return {
        r: (over.r * over.a + under.r * under.a * (1 - over.a)) / alpha,
        g: (over.g * over.a + under.g * under.a * (1 - over.a)) / alpha,
        b: (over.b * over.a + under.b * under.a * (1 - over.a)) / alpha,
        a: 1,
      };
    };
    const backing = (node) => {
      const chain = [];
      let current = node;
      while (current) {
        chain.push(current);
        current = current.parentElement;
      }
      let acc = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const bg = channel(getComputedStyle(chain[i]).backgroundColor);
        if (bg && bg.a > 0) acc = composite(bg, acc);
      }
      return acc;
    };
    const luminance = (rgb) => {
      const lin = (part) => {
        const s = part / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    };
    const ratio = (node) => {
      const fg = channel(getComputedStyle(node).color);
      const bg = backing(node);
      const hi = Math.max(luminance(fg), luminance(bg));
      const lo = Math.min(luminance(fg), luminance(bg));
      return (hi + 0.05) / (lo + 0.05);
    };
    const card = document.querySelector("#counts .count.danger");
    const probe = document.createElement("span");
    probe.className = "badge bad";
    probe.textContent = "Failed";
    card.append(probe);
    const samples = {
      label: ratio(card.querySelector("span")),
      number: ratio(card.querySelector("strong")),
      note: ratio(card.querySelector(".count-note")),
      attention: ratio(document.querySelector(".badge.attention-failed")),
      badge: ratio(probe),
    };
    probe.remove();
    return samples;
  });
  for (const [name, value] of Object.entries(contrast)) {
    assert.ok(value >= 4.5, `${name} contrast ${value}`);
  }
  assert.deepEqual(errors, []);
});
