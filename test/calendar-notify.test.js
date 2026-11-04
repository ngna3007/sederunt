import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createFakeCalendarAdapter } from "../src/calendar/fake.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function blockOutbound() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || input);
    let host = "";
    try { host = new URL(raw).hostname; } catch { host = ""; }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      throw new Error(`blocked outbound fetch to ${host}`);
    }
    return realFetch(input, init);
  };
  return () => { globalThis.fetch = realFetch; };
}

test("saving with notify off sends sendUpdates none", async (t) => {
  const restore = blockOutbound();
  t.after(restore);
  const env = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_MEMBER: "mina" };
  const calendar = createFakeCalendarAdapter(env);
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    deps: { memory: { async remember() { return { blobId: null }; } }, tatum: { async getObject() { return { text: "" }; } }, calendar },
  });
  const port = await listen(app);
  t.after(() => app.close());
  const saved = JSON.parse((await call(port, "POST", "/console/calendar/events/launch-review", {
    description: "Ship checklist",
    attendees: ["ada@example.com", "mina@example.com"],
    notify: false,
  })).raw);
  assert.equal(saved.ok, true);
  assert.equal(saved.sendUpdates, "none");
  assert.equal(calendar.calls.at(-1).arguments.sendUpdates, "none");
});

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

test("notify off toast says saved without notifying guests", { timeout: 180000 }, async (t) => {
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
  const restore = blockOutbound();
  t.after(restore);
  const env = { SEDERUNT_CALENDAR_FAKE: "1", SEDERUNT_MEMBER: "mina" };
  const calendar = createFakeCalendarAdapter(env);
  const app = createApp({
    session: createSession(),
    companyLoaded: true,
    env,
    deps: { memory: { async remember() { return { blobId: null }; } }, tatum: { async getObject() { return { text: "" }; } }, calendar },
  });
  const port = await listen(app);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => {
    await browser.close();
    app.close();
  });
  const page = await browser.newPage();
  await page.route("**/*", async (route) => {
    let host = "";
    try { host = new URL(route.request().url()).hostname; } catch { host = ""; }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/console`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#meeting-list [data-edit-event='launch-review']", { timeout: 45000 });
  await page.click("#meeting-list [data-edit-event='launch-review']");
  await page.waitForFunction(() => {
    const save = document.getElementById("event-save");
    return save && !save.disabled;
  });
  await page.locator("#event-notify").uncheck();
  await page.click("#event-save");
  await page.waitForFunction(() => {
    const toast = document.getElementById("toast");
    return toast && !toast.hidden && toast.textContent.includes("Saved without notifying guests.");
  });
  assert.equal(calendar.calls.at(-1).arguments.sendUpdates, "none");
});
