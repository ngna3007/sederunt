import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";

const secret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

test("joining binds the ear and the old clip route is gone", async () => {
  const held = {};
  const ear = "a1".repeat(24);
  const app = createApp({
    companyLoaded: true,
    linearReady: true,
    meetingVoice: held,
    env: {
      RECALL_API_KEY: "recall-key",
      RECALL_WEBHOOK_SECRET: secret,
      SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
      SLACK_SIGNING_SECRET: "slack-signing",
      SLACK_BOT_TOKEN: "slack-bot",
      SEDERUNT_MEMBER: "100",
      CONSOLE_API_KEY: "console-key",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-service",
      CONSOLE_FOLDER_ID: "folder",
      COMPANY_MEMWAL_KEY: "company-key",
      COMPANY_MEMWAL_ACCOUNT_ID: "company-account",
    },
    deps: {
      meeting: { async join() { return { id: "bot-live", ear }; } },
      memory: {
        async remember() { return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const joined = await post(port, "/api/join", JSON.stringify({
      url: "https://meet.google.com/abc-defg-hij",
    }));
    assert.equal(JSON.parse(joined.raw).join, "sent");
    assert.equal(held.ears.get("bot-live"), ear);
    const missing = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("the camera tile shows the guest name and answers only when addressed", { timeout: 60000 }, async (t) => {
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
  const held = {};
  const ear = "b2".repeat(24);
  const app = createApp({
    meetingVoice: held,
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  });
  const origin = `http://127.0.0.1:${port}`;
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const voiceHits = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (hit) => {
      if (hit.url().includes("/meeting/voice")) voiceHits.push(hit.url());
    });
    await page.goto(`${origin}/meeting?name=${encodeURIComponent("Adam <b>no</b>")}&ear=${ear}`);
    await page.locator("#guest").waitFor();
    assert.equal(await page.locator("#guest").innerText(), "Adam <b>no</b>");
    assert.equal((await page.locator("#guest b").count()), 0);
    const box = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      color: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.getElementById("guest")).color,
    }));
    assert.equal(box.scroll <= box.client, true);
    assert.equal(box.color, "rgb(8, 20, 40)");
    assert.equal(box.ink, "rgb(250, 248, 245)");
    const decision = await page.evaluate(() => {
      const agent = window.__sederunt;
      const chatter = agent.shouldRespond("We should ship the booth on Thursday.", "Priya", 2000);
      const follow = agent.shouldRespond("And the booth.", "Priya", 1000);
      agent.noteAnswer("Priya", 1000);
      return {
        chatter,
        called: agent.shouldRespond("Adam, keep Thursday.", "Priya", 2000),
        self: agent.shouldRespond("Adam, keep Thursday.", "Adam", 2000),
        followBefore: follow,
        followAfter: agent.shouldRespond("And the booth.", "Priya", 2000),
        other: agent.shouldRespond("And the booth.", "Sam", 2000),
        alone: (function () {
          agent.notePerson("7", "Priya");
          var yes = agent.shouldRespond("What should we ship on Thursday?", "Priya", 2000);
          var note = agent.shouldRespond("Okay, quick solo planning note. We launch November 18.", "Priya", 30000);
          agent.notePerson("8", "Sam");
          var no = agent.shouldRespond("What should we ship on Thursday?", "Sam", 2000);
          return { yes: yes, note: note, no: no };
        })(),
        closed: agent.endOfTurn("Keep the launch.", 1200),
        early: agent.endOfTurn("Keep the launch.", 1199),
        unfinished: agent.endOfTurn("Keep the about", 1200),
        unfinishedDone: agent.endOfTurn("Keep the about", 2500),
        state: document.getElementById("guest").dataset.state,
      };
    });
    assert.equal(decision.chatter, false);
    assert.equal(decision.called, true);
    assert.equal(decision.self, false);
    assert.equal(decision.followBefore, false);
    assert.equal(decision.followAfter, true);
    assert.equal(decision.other, false);
    assert.equal(decision.alone.yes, true);
    assert.equal(decision.alone.note, false);
    assert.equal(decision.alone.no, false);
    assert.equal(decision.closed, true);
    assert.equal(decision.early, false);
    assert.equal(decision.unfinished, false);
    assert.equal(decision.unfinishedDone, true);
    assert.equal(decision.state, "listening");
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(voiceHits.length, 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("the agent page does not poll for a clip", { timeout: 30000 }, async (t) => {
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
  const ear = "c4".repeat(24);
  const app = createApp({
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  let releaseStop = () => {};
  const stopGate = new Promise((resolve) => { releaseStop = resolve; });
  t.after(async () => {
    releaseStop();
    await browser.close();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const voiceHits = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (hit) => {
    if (hit.url().includes("/meeting/voice")) voiceHits.push(hit.url());
  });
  await page.goto(`http://127.0.0.1:${port}/meeting?name=Adam&ear=${ear}`);
  await page.locator("#guest").waitFor();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(voiceHits.length, 0);
  assert.equal(await page.locator("#guest").innerText(), "Adam");
  assert.equal(await page.locator("#guest").getAttribute("data-state"), "listening");
  releaseStop();
  assert.deepEqual(errors, []);
  await page.close();
});

test("the agent page fits a phone width and does not poll for clips", { timeout: 30000 }, async (t) => {
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
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const voiceHits = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (hit) => {
    if (hit.url().includes("/meeting/voice")) voiceHits.push(hit.url());
  });
  const ear = "d5".repeat(24);
  await page.goto(`http://127.0.0.1:${port}/meeting?name=Adam&ear=${ear}`);
  await page.locator("#guest").waitFor();
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    socket: document.documentElement.innerHTML.includes("wss://meeting-data.bot.recall.ai/api/v1/transcript"),
  }));
  assert.equal(box.scroll <= box.client, true);
  assert.equal(box.socket, true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(voiceHits.length, 0);
  assert.deepEqual(errors, []);
  await page.close();
});

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: String(res.headers["content-type"] || ""),
        cache: String(res.headers["cache-control"] || ""),
        hold: String(res.headers["x-sederunt-hold"] || ""),
        body: Buffer.concat(chunks),
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function browserPath(chromium) {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
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
