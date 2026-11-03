import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
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

test("table headers and cells share an x at 1920, 1024, 768, and 640", async (t) => {
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
    session,
    companyLoaded: true,
    deps: { memory: { async remember() { return { blobId: null }; } }, tatum: { async getObject() { return { text: "" }; } } },
    env: { SEDERUNT_CONSOLE_SECRET: SECRET, SEDERUNT_MEMBER: "mina", COMPANY_MEMWAL_KEY: "k", COMPANY_MEMWAL_ACCOUNT_ID: "a" },
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
    for (const width of [1920, 1280, 1180, 1101, 1097, 1024, 768, 640, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${port}/console/decisions`, { waitUntil: "networkidle" });
      await page.waitForSelector("#record-list .decision-row", { timeout: 45000 });
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
          room: { head: at('.decision-head [data-col="room"]'), cell: at('#record-list [data-col="room"]') },
          status: { head: at('.decision-head [data-col="status"]'), cell: at('#record-list [data-col="status"]') },
          action: { head: at('.decision-head [data-col="action"]'), cell: at('#record-list [data-col="action"]') },
          headBottom: at(".decision-head")?.bottom,
          rowTop: at("#record-list .decision-row")?.x && Math.round(document.querySelector("#record-list .decision-row").getBoundingClientRect().top),
          rowPad: (() => {
            const row = document.querySelector("#record-list .decision-row");
            const text = document.querySelector('#record-list [data-col="sentence"]');
            if (!row || !text) return 0;
            return Math.round(text.getBoundingClientRect().top - row.getBoundingClientRect().top);
          })(),
        };
      });
      for (const key of ["sentence", "room", "status", "action"]) {
        const pair = aligned[key];
        if (!pair.head || !pair.cell) {
          assert.ok(width <= 1100, `${width} ${key} header and cell are visible`);
          continue;
        }
        assert.ok(Math.abs(pair.head.x - pair.cell.x) <= 2, `${width} ${key} header ${pair.head.x} cell ${pair.cell.x}`);
      }
      assert.ok(aligned.rowPad >= 8, `${width} decision row padding ${aligned.rowPad}`);
      if (aligned.sentence.cell && width >= 640) {
        assert.ok(aligned.sentence.cell.width >= 300, `${width} decision text column is ${aligned.sentence.cell.width}px`);
      }
      if (aligned.headBottom && aligned.rowTop) {
        assert.ok(aligned.rowTop - aligned.headBottom <= 2, `${width} header gap ${aligned.rowTop - aligned.headBottom}`);
      }
      await page.goto(`http://127.0.0.1:${port}/console/people`, { waitUntil: "networkidle" });
      await page.waitForSelector(".people-row", { timeout: 45000 });
      const people = await page.evaluate(() => {
        const visible = (node) => node && getComputedStyle(node).display !== "none" && node.getClientRects().length > 0;
        const at = (selector) => {
          const node = document.querySelector(selector);
          if (!visible(node)) return null;
          const box = node.getBoundingClientRect();
          return { x: Math.round(box.x), y: Math.round(box.y), right: Math.round(box.right) };
        };
        const chips = [...document.querySelectorAll(".room-chips .mini-chip")].filter((chip) => getComputedStyle(chip).display !== "none");
        return {
          name: { head: at('.people-head [data-col="name"]'), cell: at('.people-row [data-col="name"]') },
          rooms: { head: at('.people-head [data-col="rooms"]'), cell: at('.people-row [data-col="rooms"]') },
          count: { head: at('.people-head [data-col="count"]'), cell: at('.people-row [data-col="count"]') },
          overflow: chips.filter((chip) => chip.scrollWidth > chip.clientWidth + 1).map((chip) => chip.textContent),
          named: chips.filter((chip) => chip.className.indexOf("more-") === -1).length,
          clipped: (() => {
            const cell = document.querySelector('.people-row [data-col="rooms"]');
            if (!cell) return chips.map((chip) => chip.textContent);
            const box = cell.getBoundingClientRect();
            return chips.filter((chip) => {
              const rect = chip.getBoundingClientRect();
              return rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1;
            }).map((chip) => chip.textContent);
          })(),
        };
      });
      for (const key of ["name", "rooms", "count"]) {
        const pair = people[key];
        if (width <= 700) {
          assert.ok(pair.cell, `${width} people ${key} cell is visible`);
          continue;
        }
        assert.ok(pair.head && pair.cell, `${width} people ${key} header and cell are visible`);
        assert.ok(Math.abs(pair.head.x - pair.cell.x) <= 2, `${width} people ${key} header ${pair.head.x} cell ${pair.cell.x}`);
        if (key === "rooms" && people.count.cell) {
          assert.ok(pair.cell.right <= people.count.cell.x + 1, `${width} chips ${pair.cell.right} overlap count ${people.count.cell.x}`);
        }
      }
      if (width <= 700 && people.name.cell && people.rooms.cell) {
        assert.ok(people.rooms.cell.y >= people.name.cell.y, `${width} rooms sit under the name`);
      }
      assert.deepEqual(people.overflow, [], `${width} chip overflow ${people.overflow.join(",")}`);
      assert.deepEqual(people.clipped, [], `${width} chip clipped ${people.clipped.join(",")}`);
      if (width <= 1200) assert.equal(people.named, 1, `${width} shows ${people.named} room chips`);

      await page.goto(`http://127.0.0.1:${port}/console/rooms`, { waitUntil: "networkidle" });
      await page.waitForSelector("#room-list a.room", { timeout: 45000 });
      const rooms = await page.evaluate(() => {
        const row = document.querySelector("#room-list a.room");
        const svg = row && row.querySelector('.row-view svg');
        const when = document.querySelector("#room-list .when");
        const rowBox = row ? row.getBoundingClientRect() : null;
        const svgBox = svg ? svg.getBoundingClientRect() : null;
        const whenBox = when ? when.getBoundingClientRect() : null;
        const card = document.querySelector("#rooms .explorer");
        const cardBox = card ? card.getBoundingClientRect() : null;
        return {
          chevron: svg && getComputedStyle(svg).display !== "none" && svg.getClientRects().length
            ? {
              right: Math.round(svgBox.right),
              left: Math.round(svgBox.left),
              rowRight: Math.round(rowBox.right),
              rowLeft: Math.round(rowBox.left),
              cardRight: cardBox ? Math.round(cardBox.right) : Math.round(rowBox.right),
            }
            : null,
          when: when ? {
            text: when.textContent,
            ellipsis: getComputedStyle(when).textOverflow === "ellipsis",
            cut: when.scrollWidth > when.clientWidth + 1,
            right: Math.round(whenBox.right),
            cardRight: cardBox ? Math.round(cardBox.right) : 0,
          } : null,
        };
      });
      if (width >= 1101) {
        assert.ok(rooms.chevron, `${width} view chevron is visible`);
        assert.ok(rooms.chevron.right <= rooms.chevron.rowRight + 1, `${width} chevron ${rooms.chevron.right} past row ${rooms.chevron.rowRight}`);
        assert.ok(rooms.chevron.right <= rooms.chevron.cardRight + 1, `${width} chevron ${rooms.chevron.right} past card ${rooms.chevron.cardRight}`);
        assert.ok(rooms.chevron.left >= rooms.chevron.rowLeft - 1, `${width} chevron starts before the row`);
      }
      if (width <= 640 && rooms.when && rooms.when.text) {
        assert.equal(rooms.when.ellipsis, false, `${width} time uses ellipsis`);
        assert.equal(rooms.when.cut, false, `${width} time is cut (${rooms.when.text})`);
        assert.ok(rooms.when.right <= rooms.when.cardRight + 1, `${width} time ${rooms.when.right} past card ${rooms.when.cardRight}`);
      }
    }
});

test("pass 02 keeps room, status, and list layout inside the viewport", () => {
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const block = css.slice(css.lastIndexOf("Fix pass 02"));
  assert.ok(block.length > 200, "fix pass 02 block is present");
  assert.match(block, /#home, #onboard \{ scrollbar-gutter: auto; \}/);
  assert.match(block, /#file-meta \.meta-item \{[\s\S]*white-space: nowrap;/);
  assert.match(block, /\.room-actions \{[\s\S]*margin-left: auto;/);
  assert.match(block, /#right-overview\.tab-pane \{[\s\S]*overflow: auto !important;/);
  assert.match(block, /#ask-block \.conn\.ask-quiet \{[\s\S]*display: flex !important;/);
  assert.match(block, /#ask-block \.conn\.ask-quiet \.set-copy \{[\s\S]*flex: 1 1 auto;/);
  assert.match(block, /\.settings-card \.connectors \{[\s\S]*border: 0 !important;/);
  assert.match(block, /#read-error\.still-loading \{[\s\S]*height: 32px !important;/);
  assert.match(block, /\.room-chips \.mini-chip:not\(\.more-narrow\):not\(\.more-wide\) \{[\s\S]*width: auto;/);
  assert.match(block, /#record-list \.decision-row \{[\s\S]*row-gap: 8px !important;/);
  assert.match(block, /#record-list \.decision-row \.plat-badge \{[\s\S]*height: 20px;/);
  assert.match(block, /#history-list \.room-suffix,[\s\S]*max-width: none;/);
  assert.match(block, /#history-list \.activity-feed,[\s\S]*gap: 16px;/);
  assert.match(page, /loading\.insertBefore\(slowBox, loading\.firstChild\)/);
  const zone = page.slice(page.indexOf("function zoneParts"), page.indexOf("function relativeWhen"));
  assert.doesNotMatch(zone, /calendar-zone/);
  assert.match(page, /relativeWhen\(item\.spokenAt\) \|\| whenLabel\(item\.spokenAt\)/);
  assert.match(page, /relativeWhen\(cite\.spokenAt\) \|\| whenLabel\(cite\.spokenAt\)/);
});

test("pass 03 lays out ask rows that have no tool icon", () => {
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  const block = css.slice(css.lastIndexOf("Fix pass 03"));
  assert.ok(block.length > 80, "fix pass 03 block is present");
  assert.match(block, /#ask-block \.conn \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
  assert.match(block, /#ask-block \.conn \{[\s\S]*min-height:\s*56px;/);
  assert.match(block, /#ask-block \.conn \.conn-ask \{[\s\S]*justify-self:\s*end;[\s\S]*align-self:\s*center;/);
  assert.match(block, /#ask-block \.conn \.set-copy \{[\s\S]*white-space:\s*nowrap;/);
  assert.match(block, /@media \(max-width: 639px\) \{[\s\S]*#ask-block \.conn \.set-copy,[\s\S]*white-space:\s*normal;/);
});
