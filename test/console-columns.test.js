import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { DECISION_COLUMNS, PEOPLE_COLUMNS, ROOM_COLUMNS, renderConsolePage } from "../src/console-page.js";
import { renderSignInPage } from "../src/console-sign-in.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "column-secret";

test("sign-in tells the reader where the passphrase comes from", () => {
  const page = renderSignInPage({ configured: true, memberSet: true });
  assert.match(page, /Ask your workspace admin for the console passphrase/);
});

test("table headers and cells share an x at 1920, 1024, and 768", async () => {
  const html = renderConsolePage({ signedIn: true });
  assert.equal(html.slice(html.indexOf('class="explorer-head"'), html.indexOf('id="room-empty"')).match(/<span/g).length, ROOM_COLUMNS.length);
  assert.equal(html.slice(html.indexOf("decision-head"), html.indexOf('id="record-list"')).match(/<span/g).length, DECISION_COLUMNS.length);
  assert.equal(PEOPLE_COLUMNS.length, 5);

  const session = createSession();
  session.rooms.push(
    { id: "booth", name: "Booth planning", platform: "Google Meet", startedAt: "2026-11-03T12:00:00.000Z" },
    { id: "design", name: "Design crit: console empty states and the long room label", platform: "Google Meet", startedAt: "2026-11-03T12:00:00.000Z" },
  );
  for (const [id, text] of [["booth", "The booth opens at nine and badge pickup stays at the north entrance."], ["design", "Empty states use the shared card across the console."]]) {
    session.decisions.push({
      id: `d-${id}`,
      account: "company",
      kind: "decision",
      text,
      speakerMemberId: "mina",
      inviteMemberIds: ["mina"],
      roomId: id,
      spokenAt: "2026-11-03T12:05:00.000Z",
      contradicts: [],
      fileNames: [],
    });
  }
  const app = createApp({
    session,
    companyLoaded: true,
    deps: { memory: { async remember() { return { blobId: null }; } }, tatum: { async getObject() { return { text: "" }; } } },
    env: { SEDERUNT_CONSOLE_SECRET: SECRET, SEDERUNT_MEMBER: "mina", COMPANY_MEMWAL_KEY: "k", COMPANY_MEMWAL_ACCOUNT_ID: "a" },
  });
  app.listen(0, "127.0.0.1");
  const port = await once(app, "listening").then(() => app.address().port);
  const token = sealSession({ memberId: "mina", name: "Mina", exp: Date.now() + 60_000 }, SECRET);
  const cookie = sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext();
    const eq = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: `http://127.0.0.1:${port}` }]);
    const page = await context.newPage();
    for (const width of [1920, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${port}/console/decisions`, { waitUntil: "networkidle" });
      await page.waitForSelector("#record-list .decision-row");
      const aligned = await page.evaluate(() => {
        const visible = (node) => node && getComputedStyle(node).display !== "none" && node.getClientRects().length > 0;
        const at = (selector) => {
          const node = document.querySelector(selector);
          if (!visible(node)) return null;
          const box = node.getBoundingClientRect();
          return { x: Math.round(box.x), right: Math.round(box.right), width: Math.round(box.width), bottom: Math.round(box.bottom) };
        };
        return {
          sentence: { head: at('.decision-head [data-col="sentence"]'), cell: at('#record-list [data-col="sentence"]') },
          action: { head: at('.decision-head [data-col="action"]'), cell: at('#record-list [data-col="action"]') },
          headBottom: at(".decision-head")?.bottom,
          rowTop: at("#record-list .decision-row")?.x && Math.round(document.querySelector("#record-list .decision-row").getBoundingClientRect().top),
        };
      });
      for (const key of ["sentence", "action"]) {
        const pair = aligned[key];
        if (!pair.head || !pair.cell) continue;
        assert.ok(Math.abs(pair.head.x - pair.cell.x) <= 2, `${width} ${key} header ${pair.head.x} cell ${pair.cell.x}`);
      }
      if (width === 768) {
        assert.ok(aligned.sentence.cell.width > 80, `decision text column is ${aligned.sentence.cell.width}px`);
      }
      if (aligned.headBottom && aligned.rowTop) {
        assert.ok(aligned.rowTop - aligned.headBottom <= 2, `${width} header gap ${aligned.rowTop - aligned.headBottom}`);
      }
      await page.goto(`http://127.0.0.1:${port}/console/people`, { waitUntil: "networkidle" });
      await page.waitForSelector(".people-row");
      const people = await page.evaluate(() => {
        const visible = (node) => node && getComputedStyle(node).display !== "none" && node.getClientRects().length > 0;
        const at = (selector) => {
          const node = document.querySelector(selector);
          if (!visible(node)) return null;
          const box = node.getBoundingClientRect();
          return { x: Math.round(box.x), right: Math.round(box.right) };
        };
        return {
          name: { head: at('.people-head [data-col="name"]'), cell: at('.people-row [data-col="name"]') },
          rooms: { head: at('.people-head [data-col="rooms"]'), cell: at('.people-row [data-col="rooms"]') },
          count: { head: at('.people-head [data-col="count"]'), cell: at('.people-row [data-col="count"]') },
        };
      });
      for (const key of ["name", "rooms", "count"]) {
        const pair = people[key];
        if (!pair.head || !pair.cell) continue;
        assert.ok(Math.abs(pair.head.x - pair.cell.x) <= 2, `${width} people ${key} header ${pair.head.x} cell ${pair.cell.x}`);
        if (key === "rooms" && people.count.cell) {
          assert.ok(pair.cell.right <= people.count.cell.x + 1, `${width} chips ${pair.cell.right} overlap count ${people.count.cell.x}`);
        }
      }
    }
  } finally {
    await browser.close();
    app.close();
  }
});
