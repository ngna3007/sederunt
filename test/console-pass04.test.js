import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { logAction, logFailure } from "../src/activity.js";
import { undoPrompt } from "../src/activity-feed.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { ROOM_COLUMNS, renderConsolePage } from "../src/console-page.js";
import { rankDecisions } from "../src/room-match.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

const SECRET = "pass04-secret";

test("missing room copy is a card and the shell stays hidden", () => {
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(page, /id="room-missing-link"[^>]*>[\s\S]*Back to rooms</);
  assert.doesNotMatch(page, /Back to Rooms/);
  const block = css.slice(css.indexOf("Fix pass 04"));
  assert.match(block, /body\.room-missing #room-split/);
  assert.match(block, /body\.room-missing #timeline/);
  assert.match(block, /body\.room-missing \.underline-tabs/);
  assert.match(block, /body\.room-missing \.room-settings/);
  assert.match(block, /#room-missing \.empty-title \{\s*color: var\(--foreground\)/);
});

test("a later rooms shell keeps rows that are already on screen", () => {
  const page = renderConsolePage({ signedIn: true });
  assert.match(page, /var keepRooms = shell && state && state\.rooms && state\.rooms\.length > 0/);
  assert.match(page, /if \(hasRows\) \{\s*if \(empty\) empty\.hidden = true;/);
  assert.match(page, /listed\.setAttribute\("aria-busy", "true"\)/);
  assert.match(page, /emptyLine\.textContent = "Loading\.\.\."/);
  assert.match(page, /listedBusy\.removeAttribute\("aria-busy"\)/);
  assert.match(page, /shellTries <= 2 \? 200 : shellTries === 3 \? 500 : 1500/);
});

test("focus rings and a skip link are in the console", () => {
  const page = renderConsolePage({ signedIn: true });
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(page, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(page, /<div class="stage" id="main" tabindex="-1">/);
  const block = css.slice(css.lastIndexOf("Fix pass 04"));
  assert.match(block, /\.rail a:focus-visible[\s\S]*box-shadow: var\(--focus-ring\) !important/);
  assert.match(block, /#room-list > a\.room:focus-visible/);
  // One focus ring across the design system (docs/design/design-system.md), tabs included.
  assert.match(block, /\.underline-tabs button:focus-visible \{\s*outline: none;\s*box-shadow: var\(--focus-ring\);/);
  assert.match(block, /\.skip-link:focus-visible[\s\S]*box-shadow: var\(--focus-ring\)/);
});

test("a narrow decision row keeps only the clashing badge", () => {
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(page, /badge-inline/);
  assert.match(page, /badge\.textContent = clashing \? "Clashing" : ""/);
  const block = css.slice(css.lastIndexOf("Fix pass 04"));
  assert.match(block, /@media \(max-width: 640px\) \{[\s\S]*-webkit-line-clamp: 3 !important/);
  assert.match(block, /@media \(max-width: 640px\) \{[\s\S]*\.badge-inline \{\s*display: inline-flex !important/);
});

test("sign-in off is a banner only when no secret is configured", async () => {
  const off = renderConsolePage({ signInOff: true });
  assert.match(off, /Sign-in is off\. Anyone with this link can act as you\./);
  assert.match(off, /Set a console secret/);
  assert.match(off, /id="console-secret"/);
  assert.match(off, /SEDERUNT_CONSOLE_SECRET/);
  const on = renderConsolePage({ signInOff: false, signedIn: true });
  assert.doesNotMatch(on, /id="set-console-secret"/);
  assert.doesNotMatch(on, /id="console-secret"/);
  assert.match(on, /Sign-in is not set up|Owner/);
  const open = createApp({
    companyLoaded: true,
    env: { SEDERUNT_MEMBER: "mina" },
  });
  open.listen(0, "127.0.0.1");
  const port = await once(open, "listening").then(() => open.address().port);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/console`);
    const html = await response.text();
    assert.match(html, /class="sign-in-off"/);
    assert.match(html, /Sign-in is off\. Anyone with this link can act as you\./);
    assert.doesNotMatch(html, /pass04-secret/);
  } finally {
    open.close();
  }
});

test("undo confirm names the inverse change", () => {
  const label = undoPrompt({
    target: { system: "linear", id: "ROW-151", title: "Booth sign" },
    changes: [{ field: "label", to: "events" }],
  }, "UTC", "UTC");
  assert.equal(label.ask, "Remove label \u201cevents\u201d from ROW-151?");
  assert.equal(label.done, "Removed label \u201cevents\u201d from ROW-151.");
  const move = undoPrompt({
    target: { system: "calendar", id: "evt-1", title: "Design crit" },
    changes: [{ field: "start", from: "2026-11-03T07:00:00.000Z", to: "2026-11-03T08:00:00.000Z" }],
  }, "Asia/Ho_Chi_Minh", "Asia/Ho_Chi_Minh");
  assert.equal(move.ask, "Move \u201cDesign crit\u201d back to 2:00 PM?");
  assert.equal(move.done, "Moved \u201cDesign crit\u201d back to 2:00 PM.");
  const end = undoPrompt({
    target: { system: "calendar", title: "Design crit" },
    changes: [{ field: "end", from: "2026-11-03T08:00:00.000Z", to: "2026-11-03T09:00:00.000Z" }],
  }, "Asia/Ho_Chi_Minh", "Asia/Ho_Chi_Minh");
  assert.match(end.ask, /^Move the end of \u201cDesign crit\u201d back to 3:00 PM\?$/);
  const assign = undoPrompt({
    target: { system: "linear", id: "ROW-131" },
    changes: [{ field: "assignee", from: "Tomas", to: "Mina" }],
  }, "UTC", "UTC");
  assert.equal(assign.ask, "Assign ROW-131 back to Tomas?");
  const clear = undoPrompt({
    target: { system: "linear", id: "ROW-131" },
    changes: [{ field: "assignee", to: "Mina" }],
  }, "UTC", "UTC");
  assert.equal(clear.ask, "Clear the assignee on ROW-131?");
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.match(page, /function confirmUndo/);
  assert.match(page, /Undo change/);
  assert.match(page, /textContent = "Undone"/);
  assert.match(page, /undo-reason/);
  assert.match(page, /addEventListener\("keydown", onKey, true\)/);
});

test("room status describes the meeting and failures are a separate chip", () => {
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(page, /function meetingWord/);
  assert.match(page, /No recording/);
  assert.match(page, /failed action/);
  assert.doesNotMatch(page.slice(page.indexOf("function meetingWord"), page.indexOf("function failedActions")), /Failed/);
  const block = css.slice(css.lastIndexOf("Fix pass 04"));
  assert.match(block, /\.count\.danger strong \{ color: var\(--danger-text\); \}/);
  assert.match(css, /--danger-text: #b42318;/);
  assert.match(block, /\.count\.danger \{\s*background: var\(--card\)/);
  assert.match(block, /\.badge\.live/);
  assert.match(block, /\.fail-chip/);
});

test("a clash answer leads with one sentence and keeps room cite labels", () => {
  const result = rankDecisions("When does the booth open?", [
    {
      roomId: "booth",
      text: "The booth opens at nine and badge pickup stays at the north entrance",
      status: "clashing",
      spokenAt: "2026-11-03T11:20:00.000Z",
      speaker: "rowan",
    },
    {
      roomId: "booth",
      text: "The booth opens at ten so setup is not rushed",
      status: "clashing",
      spokenAt: "2026-11-03T10:43:00.000Z",
      speaker: "tomas",
    },
  ], [{ id: "booth", name: "Booth planning" }]);
  assert.match(result.answer, /These decisions clash/);
  assert.match(result.answer, /opens at ten so setup is not rushed/);
  assert.match(result.cites[0].label, /Booth planning/);
  assert.match(result.lead, /^Two decisions disagree: the booth opens at nine and badge pickup stays at the north entrance \(rowan, \d{1,2}:\d{2} [AP]M\) vs ten so setup is not rushed \(tomas, \d{1,2}:\d{2} [AP]M\)\.$/);
  assert.equal(result.clash[0].speaker, "rowan");
  assert.match(result.clash[0].clock, /^\d{1,2}:\d{2} [AP]M$/);
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.match(page, /relativeWhen\(cite\.spokenAt\) \|\| whenLabel\(cite\.spokenAt\)/);
  assert.match(page, /Open room/);
  assert.match(page, /more decisions/);
  assert.match(page, /className = "callout callout-warn chat-clash"/);
});

test("list columns share a grid and cap avatar stacks", () => {
  assert.deepEqual(ROOM_COLUMNS, ["Room", "Platform", "Speakers", "Status", "Started", "Length", ""]);
  const page = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(page, /people\.slice\(0, 2\)/);
  assert.match(page, /whenText: ident\.when \? \(relativeWhen\(ident\.when\) \|\| ""\) : ""/);
  assert.match(page, /dataset\.col = "started"/);
  const block = css.slice(css.lastIndexOf("Fix pass 04"));
  assert.match(block, /--cols-rooms:/);
  assert.match(block, /--cols-decisions:/);
  assert.match(block, /--cols-people:/);
  assert.match(block, /--cols-history:/);
  assert.match(block, /--cols-status:/);
  assert.match(block, /grid-template-columns: subgrid !important/);
  assert.match(block, /margin-left: -6px/);
  assert.match(block, /box-shadow: var\(--ring-surface\)/);
  assert.match(css, /#ask-block \.conn \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
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
  logAction(session, {
    id: "act-fail",
    requestId: "act-fail",
    actor: { type: "person", name: "Mina" },
    verb: "label",
    target: { system: "linear", type: "issue", id: "ROW-FAIL", title: "Broken" },
    changes: [{ field: "label", to: "nope" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
    undo: { available: true, until: "2099-01-01T00:00:00.000Z" },
  });
  logFailure(session, {
    id: "fail-booth",
    requestId: "fail-booth",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "label",
    target: { system: "linear", id: "ROW-151", title: "Booth sign" },
    changes: [{ field: "label", to: "events" }],
    error: "timed out",
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
  });
  logFailure(session, {
    id: "fail-launch",
    requestId: "fail-launch",
    actor: { type: "sederunt", name: "Sederunt" },
    verb: "move",
    target: { system: "calendar", title: "Launch" },
    changes: [],
    error: "read only",
    origin: { roomId: "launch", roomName: "Launch review" },
    tool,
  });
  return session;
}

test("home and rooms columns line up, and the pass 04 fixes hold in the browser", async (t) => {
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
      linear: {
        async removeLabel(input) {
          if (input.id === "ROW-FAIL") throw new Error("nope");
          return { id: input.id };
        },
        async addLabel(input) { return { id: input.id }; },
        async updateIssue(input) { return { id: input.id }; },
        async assignIssue(input) { return { id: input.id }; },
        async unassignIssue(input) { return { id: input.id }; },
        async createIssue() { return { identifier: "ROW-9", id: "ROW-9" }; },
      },
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#room-list a.room", { timeout: 45000 });
  const banner = await page.locator(".sign-in-off").count();
  assert.equal(banner, 0);

  for (const width of [1920, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    // Home only previews a few rooms and hides the explorer head; measure columns on Rooms.
    for (const path of ["/console/rooms"]) {
      await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "networkidle" });
      await page.waitForSelector("#room-list a.room", { timeout: 45000 });
      const measured = await page.evaluate(() => {
        const cols = ["room", "platform", "speakers", "status", "started", "action"];
        const rows = [...document.querySelectorAll("#room-list > a.room")];
        const head = document.querySelector("#rooms .explorer-head");
        const columns = {};
        for (const col of cols) {
          const xs = rows.map((row) => {
            const cell = row.querySelector(`[data-col="${col}"]`);
            return cell ? Math.round(cell.getBoundingClientRect().x) : null;
          });
          const headCell = head && head.querySelector(`[data-col="${col}"]`);
          columns[col] = { xs, headX: headCell ? Math.round(headCell.getBoundingClientRect().x) : null };
        }
        const first = rows[0];
        const boxes = cols.map((col) => first.querySelector(`[data-col="${col}"]`).getBoundingClientRect());
        const gaps = [];
        for (let index = 1; index < boxes.length; index += 1) gaps.push(Math.round(boxes[index].x - boxes[index - 1].right));
        const heights = rows.map((row) => Math.round(row.getBoundingClientRect().height));
        const doc = document.documentElement;
        return {
          columns,
          gaps,
          heights,
          overflow: doc.scrollWidth > doc.clientWidth + 1,
          faces: Math.max(...rows.map((row) => row.querySelectorAll(".avatar-stack .face").length)),
        };
      });
      assert.equal(measured.overflow, false, `${path} ${width} overflows`);
      assert.ok(measured.faces <= 3, `${path} ${width} shows ${measured.faces} faces`);
      const uniqueHeights = [...new Set(measured.heights)];
      assert.deepEqual(uniqueHeights, [measured.heights[0]], `${path} ${width} row heights ${measured.heights.join(",")}`);
      for (const gap of measured.gaps) assert.ok(gap >= 16, `${path} ${width} gap ${gap}`);
      for (const [col, data] of Object.entries(measured.columns)) {
        assert.ok(data.xs.every((x) => x != null), `${path} ${width} ${col} missing`);
        const firstX = data.xs[0];
        for (const x of data.xs) assert.ok(Math.abs(x - firstX) <= 1, `${path} ${width} ${col} x ${data.xs.join(",")}`);
        assert.ok(Math.abs(data.headX - firstX) <= 1, `${path} ${width} ${col} header ${data.headX} cell ${firstX}`);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/console/decisions`, { waitUntil: "networkidle" });
  await page.waitForSelector("#record-list .decision-row", { timeout: 45000 });
  const narrow = await page.evaluate(() => {
    const row = document.querySelector("#record-list .decision-row");
    const strong = row.querySelector("strong");
    const inline = row.querySelector(".badge-inline");
    const status = row.querySelector(':scope > [data-col="status"]');
    const doc = document.documentElement;
    return {
      clamp: getComputedStyle(strong).webkitLineClamp,
      strongWidth: Math.round(strong.getBoundingClientRect().width),
      rowWidth: Math.round(row.getBoundingClientRect().width),
      inline: inline ? getComputedStyle(inline).display : "",
      inlineText: inline ? inline.textContent : "",
      statusText: status ? status.textContent : "",
      overflow: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
  assert.equal(narrow.clamp, "3");
  assert.ok(narrow.strongWidth >= narrow.rowWidth - 40, `sentence ${narrow.strongWidth} row ${narrow.rowWidth}`);
  assert.equal(narrow.inline, "flex");
  assert.equal(narrow.inlineText, "Clashing");
  assert.equal(narrow.overflow, false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "networkidle" });
  await page.waitForSelector("#room-list a.room", { timeout: 45000 });
  const homePreview = await page.evaluate(() => ({
    count: document.querySelectorAll("#room-list a.room").length,
    headHidden: !!document.querySelector("#rooms .explorer-head")?.hidden,
    allRooms: !!document.getElementById("home-all-rooms") && !document.getElementById("home-all-rooms").hidden,
  }));
  assert.ok(homePreview.count >= 2 && homePreview.count <= 3, JSON.stringify(homePreview));
  assert.equal(homePreview.headHidden, true);

  await page.goto(`http://127.0.0.1:${port}/console/rooms`, { waitUntil: "networkidle" });
  await page.waitForSelector("#room-list a.room", { timeout: 45000 });
  const rooms = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#room-list a.room")].map((row) => ({
      title: row.querySelector("strong")?.textContent || "",
      status: row.querySelector(".status-cell .badge")?.textContent || "",
      chip: row.querySelector(".fail-chip")?.textContent || "",
      when: row.querySelector(".when")?.textContent || "",
    }));
    const card = document.querySelector(".count.danger");
    const numeral = card && card.querySelector("strong");
    const label = card && card.querySelector("span");
    return {
      rows,
      numeral: numeral ? getComputedStyle(numeral).color : "",
      label: label ? getComputedStyle(label).color : "",
      card: card ? getComputedStyle(card).backgroundColor : "",
    };
  });
  assert.ok(rooms.rows.length >= 2);
  assert.ok(rooms.rows.every((row) => row.status !== "Failed"), JSON.stringify(rooms.rows));
  assert.ok(rooms.rows.some((row) => row.status === "Done"));
  assert.ok(rooms.rows.some((row) => row.status === "No recording"));
  assert.ok(rooms.rows.some((row) => row.status === "Channel"));
  assert.ok(rooms.rows.some((row) => row.chip === "1 failed action"));
  assert.ok(rooms.rows.some((row) => row.when === ""));
  assert.equal(rooms.numeral, "rgb(180, 35, 24)");
  assert.equal(rooms.card, "rgb(255, 255, 255)");
  assert.notEqual(rooms.label, "rgb(180, 35, 24)");

  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => ({
    text: document.activeElement && document.activeElement.textContent,
    shadow: document.activeElement ? getComputedStyle(document.activeElement).boxShadow : "",
  }));
  assert.equal(skip.text, "Skip to content");
  assert.notEqual(skip.shadow, "none");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "main");
  await page.locator(".rail a[data-label='Rooms']").focus();
  const railShadow = await page.evaluate(() => {
    const link = document.querySelector(".rail a[data-label='Rooms']");
    if (link.focus) link.focus({ focusVisible: true });
    return getComputedStyle(link).boxShadow;
  });
  assert.notEqual(railShadow, "none");
  await page.locator("#room-list a.room").first().evaluate((node) => node.focus({ focusVisible: true }));
  const rowShadow = await page.evaluate(() => getComputedStyle(document.querySelector("#room-list a.room")).boxShadow);
  assert.notEqual(rowShadow, "none");

  await page.goto(`http://127.0.0.1:${port}/console/rooms/not-a-room`, { waitUntil: "networkidle" });
  await page.waitForSelector("body.room-missing #room-missing", { timeout: 45000 });
  const missing = await page.evaluate(() => {
    const shown = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && node.getClientRects().length > 0;
    };
    const title = document.querySelector("#room-missing .empty-title");
    return {
      missing: shown("#room-missing"),
      split: shown("#room-split"),
      timeline: shown("#timeline"),
      tabs: shown(".underline-tabs"),
      settings: shown(".room-settings"),
      color: title ? getComputedStyle(title).color : "",
      back: document.querySelector("#room-missing-link")?.textContent || "",
    };
  });
  assert.equal(missing.missing, true);
  assert.equal(missing.split, false);
  assert.equal(missing.timeline, false);
  assert.equal(missing.tabs, false);
  assert.equal(missing.settings, false);
  assert.equal(missing.color, "rgb(23, 26, 36)");
  assert.match(missing.back, /Back to rooms/);
  assert.deepEqual(errors, []);

  await page.goto(`http://127.0.0.1:${port}/console/history`, { waitUntil: "networkidle" });
  await page.waitForSelector(".activity-undo", { timeout: 45000 });
  const failRow = page.locator("#activity-act-fail");
  await failRow.locator(".activity-undo").click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.textContent === "Undo change");
  assert.match(await failRow.locator(".undo-confirm p").first().innerText(), /Remove label “nope” from ROW-FAIL\?/);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("activity-undo"));
  await failRow.locator(".activity-undo").click();
  await page.getByRole("button", { name: "Undo change" }).click();
  await page.waitForSelector("#activity-act-fail .undo-reason", { timeout: 15000 });
  assert.match(await page.locator("#activity-act-fail .undo-reason").innerText(), /cannot be undone|did not go through|no longer here|Superseded|already undone|refused/);

  const labelRow = page.locator("#activity-act-label");
  await labelRow.locator(".activity-undo").click();
  await labelRow.getByRole("button", { name: "Cancel" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("activity-undo"));
  await labelRow.locator(".activity-undo").click();
  await labelRow.getByRole("button", { name: "Undo change" }).click();
  await page.waitForSelector("#toast", { timeout: 15000 });
  await page.waitForFunction(() => {
    const toast = document.getElementById("toast");
    return toast && !toast.hidden && /Removed label/.test(toast.textContent || "");
  });
  await page.waitForSelector("#activity-act-label .undone-mark", { timeout: 15000 });
  assert.match(await page.locator("#activity-act-label .undone-mark").innerText(), /Undone/);

  await page.goto(`http://127.0.0.1:${port}/console/chat`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chat-text", { timeout: 45000 });
  assert.equal(await page.locator("#ask-ai-dialog").isHidden(), true, "Ask AI opens straight to the composer");
  await page.fill("#chat-text", "When does the booth open?");
  await page.locator("#ask-send").click();
  await page.waitForSelector(".chat-bot .chat-answer-md", { timeout: 15000 });
  const answer = await page.locator(".chat-bot").innerText();
  assert.match(answer, /booth opens at nine/i);
  assert.doesNotMatch(answer, /missing-member|preference ask/);
  assert.equal(await page.locator(".ask-avatar").count(), 1);

  for (const width of [1920, 1097, 1024, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/console/rooms`, { waitUntil: "networkidle" });
    await page.waitForSelector("#room-list a.room", { timeout: 45000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `rooms ${width} overflows`);
  }
});
