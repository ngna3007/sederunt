import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { logAction, logRequest } from "../src/activity.js";
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
