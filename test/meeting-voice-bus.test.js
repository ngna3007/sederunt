import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { SILENT_MEETING_MP3 } from "../src/meeting/silent-clip.js";
import { bindMeetingEar, offerMeetingClip, takeMeetingClip } from "../src/meeting/voice-bus.js";
import { createApp } from "../src/server.js";

const secret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

function redisMock() {
  const ears = new Map();
  const queues = new Map();
  const calls = [];
  return {
    ears,
    queues,
    calls,
    async fetch(url, init) {
      calls.push(String(url));
      const command = JSON.parse(init.body);
      const pipeline = Array.isArray(command[0]);
      const commands = pipeline ? command : [command];
      const results = commands.map((parts) => {
        const [op, key, a] = parts;
        if (op === "SET") {
          ears.set(key, a);
          return { result: "OK" };
        }
        if (op === "GET") return { result: ears.get(key) ?? null };
        if (op === "RPUSH") {
          const list = queues.get(key) || [];
          list.push(a);
          queues.set(key, list);
          return { result: list.length };
        }
        if (op === "LTRIM") {
          const list = queues.get(key) || [];
          queues.set(key, list.slice(Number(a)));
          return { result: "OK" };
        }
        if (op === "EXPIRE") return { result: 1 };
        if (op === "LPOP") {
          const list = queues.get(key) || [];
          const item = list.shift() ?? null;
          queues.set(key, list);
          return { result: item };
        }
        return { result: null };
      });
      return { ok: true, async json() { return pipeline ? results : results[0]; } };
    },
  };
}

test("a spoken clip is served once from the same process", async () => {
  const workspace = {};
  const ear = "ab".repeat(24);
  const clip = Buffer.from("same-process-clip");
  assert.equal(await bindMeetingEar(workspace, "short", "bot-1", {}), false);
  assert.equal(await bindMeetingEar(workspace, ear, "bot-1", {}), true);
  assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.alloc(0), {}), false);
  assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.alloc(700001), {}), false);
  assert.equal(await offerMeetingClip(workspace, "missing", clip, {}), false);
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.from([i]), {}), true);
  }
  const got = [];
  for (let i = 0; i < 5; i += 1) got.push(await takeMeetingClip(workspace, ear, {}));
  assert.deepEqual(got.slice(0, 4).map((item) => item[0]), [2, 3, 4, 5]);
  assert.equal(got[4], null);
  assert.equal(await takeMeetingClip(workspace, "nope", {}), null);
});

test("a clip crosses isolates through redis and is not played twice", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const join = {};
  const webhook = {};
  const page = {};
  const ear = "cd".repeat(24);
  assert.equal(await bindMeetingEar(join, ear, "bot-redis", env, redis.fetch), true);
  assert.equal(join.meetingVoice.queues.size, 0);
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await offerMeetingClip(webhook, "bot-redis", Buffer.from([i, 9]), env, redis.fetch), true);
  }
  assert.equal(webhook.meetingVoice.queues.size, 0);
  const got = [];
  for (let i = 0; i < 5; i += 1) got.push(await takeMeetingClip(page, ear, env, redis.fetch));
  assert.deepEqual(got.slice(0, 4).map((item) => [...item]), [[2, 9], [3, 9], [4, 9], [5, 9]]);
  assert.equal(got[4], null);
  assert.equal(redis.calls.some((url) => url.endsWith("/pipeline")), true);
  assert.equal(redis.calls.some((url) => url.includes("token")), false);
});

test("the meeting page receives one clip and a bad ear gets nothing", async () => {
  const held = {};
  const ear = "ef".repeat(24);
  const clip = Buffer.from("page-bytes");
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
  try {
    const page = await get(port, "/meeting?name=Adam");
    assert.equal(page.status, 200);
    assert.match(page.raw, /Sederunt/);
    assert.match(page.raw, /\/meeting\/voice/);
    assert.match(page.raw, /getUserMedia/);
    assert.match(page.raw, /textContent/);
    assert.match(page.raw, /#081428/);
    assert.doesNotMatch(page.raw, /#f4f3ef/);
    assert.doesNotMatch(page.raw, /Quiet until addressed/);
    assert.doesNotMatch(page.raw, /Say this name/);
    assert.doesNotMatch(page.raw, /destination/);
    assert.equal(await bindMeetingEar({ meetingVoice: held }, ear, "bot-page", {}), true);
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-page", clip, {}), true);
    const first = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(first.status, 200);
    assert.equal(first.type, "audio/mpeg");
    assert.equal(first.cache, "no-store");
    assert.equal(first.body.equals(clip), true);
    const second = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(second.status, 204);
    assert.equal(second.cache, "no-store");
    assert.equal(second.body.length, 0);
    const missing = await get(port, "/meeting/voice?ear=short");
    assert.equal(missing.status, 204);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("joining binds the ear the meeting page polls", async () => {
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
    const clip = Buffer.from([1, 2, 3, 4]);
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-live", clip, {}), true);
    const played = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(played.status, 200);
    assert.equal(played.body.equals(clip), true);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("the camera tile shows the guest name and plays one clip", { timeout: 60000 }, async (t) => {
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
    page.on("pageerror", (error) => errors.push(String(error)));
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
    assert.equal(await bindMeetingEar({ meetingVoice: held }, ear, "bot-tile", {}), true);
    const spoken = Buffer.concat(Array.from({ length: 40 }, () => SILENT_MEETING_MP3));
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-tile", spoken, {}), true);
    await page.waitForFunction(() => {
      const audio = document.querySelector("#voice");
      const name = document.getElementById("guest");
      return Boolean(audio && audio.currentSrc.startsWith("blob:") && audio.paused === false && name.className === "speaking");
    });
    await page.evaluate(() => stopTalking());
    await page.waitForFunction(() => {
      const audio = document.querySelector("#voice");
      const name = document.getElementById("guest");
      return Boolean(audio && audio.paused === true && name.className === "");
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
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
