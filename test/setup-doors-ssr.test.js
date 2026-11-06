import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("Setup HTML SSRs Linear Connected when the workspace Linear door is ready", async () => {
  const app = createApp({
    linearReady: true,
    companyLoaded: true,
    env: {
      SEDERUNT_MEMBER: "U1",
      SLACK_SIGNING_SECRET: "secret",
      SLACK_BOT_TOKEN: "xoxb-test",
      // calendarPresentedConnected needs these-ish; leave calendar off
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const page = await get(port, "/console/setup");
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="lin-conn" class="conn-state">Connected/);
    assert.match(page.raw, /id="slack-conn" class="conn-state">Connected/);
    assert.match(page.raw, /id="cal-conn" class="conn-state off">Not connected/);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Setup HTML SSRs Linear Not connected when Linear is not ready", async () => {
  const app = createApp({
    linearReady: false,
    companyLoaded: true,
    env: {
      SEDERUNT_MEMBER: "U1",
      SLACK_SIGNING_SECRET: "secret",
      SLACK_BOT_TOKEN: "xoxb-test",
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const page = await get(port, "/console/setup");
    assert.equal(page.status, 200);
    assert.match(page.raw, /id="lin-conn" class="conn-state off">Not connected/);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});
