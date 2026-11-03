import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import {
  consoleSecret,
  openSession,
  passphraseMatches,
  safeConsoleNext,
  sealSession,
} from "../src/console-auth.js";
import { createApp } from "../src/server.js";

const SECRET = "fixture-passphrase";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { body, headers, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(body ? { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) } : {}),
        ...(cookie ? { cookie } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location || "",
        cookie: res.headers["set-cookie"],
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("a console passphrase seals a session and a bad signature does not open", () => {
  assert.equal(consoleSecret({}), "");
  assert.equal(consoleSecret({ SEDERUNT_CONSOLE_SECRET: "  desk  " }), "desk");
  assert.equal(passphraseMatches("desk", "desk"), true);
  assert.equal(passphraseMatches("other", "desk"), false);
  const token = sealSession({ memberId: "Mina", name: "Mina Chen", exp: Date.now() + 1000 }, "desk");
  const opened = openSession(token, "desk");
  assert.equal(opened.ok, true);
  assert.equal(opened.memberId, "Mina");
  assert.equal(opened.name, "Mina Chen");
  assert.equal(openSession(token, "other").reason, "invalid");
  assert.equal(openSession(sealSession({ memberId: "Mina", exp: Date.now() - 10 }, "desk"), "desk").reason, "expired");
  assert.equal(safeConsoleNext("https://evil.example"), "/console");
  assert.equal(safeConsoleNext("/console/rooms"), "/console/rooms");
  assert.equal(safeConsoleNext("/console/sign-in"), "/console");
});

test("sign-in is off until a passphrase is set, and a set passphrase gates only the console", async () => {
  const open = createApp({
    companyLoaded: true,
    env: { SEDERUNT_MEMBER: "Mina" },
  });
  const port = await listen(open);
  try {
    const home = await call(port, "GET", "/console");
    assert.equal(home.status, 200);
    assert.match(home.raw, /Your name/);
    const page = await call(port, "GET", "/console/sign-in");
    assert.equal(page.status, 200);
    assert.match(page.raw, /Sign-in is not set up/);
    assert.match(page.raw, /SEDERUNT_CONSOLE_SECRET/);
    const slack = await call(port, "POST", "/api/slack", { body: "{}" });
    assert.equal(slack.status, 200);
  } finally {
    open.close();
  }

  const gated = createApp({
    companyLoaded: true,
    env: { SEDERUNT_MEMBER: "Mina", SEDERUNT_CONSOLE_SECRET: SECRET },
  });
  const gatedPort = await listen(gated);
  try {
    const blocked = await call(gatedPort, "GET", "/console/rooms");
    assert.equal(blocked.status, 302);
    assert.match(blocked.location, /^\/console\/sign-in\?next=/);
    const wrong = await call(gatedPort, "POST", "/console/sign-in", {
      body: "name=Mina&passphrase=nope&next=/console/history",
    });
    assert.equal(wrong.status, 401);
    assert.match(wrong.raw, /That passphrase does not match/);
    const signed = await call(gatedPort, "POST", "/console/sign-in", {
      body: "name=Mina&passphrase=fixture-passphrase&next=/console/history",
    });
    assert.equal(signed.status, 302);
    assert.equal(signed.location, "/console/history");
    const cookie = String(signed.cookie || "");
    assert.match(cookie, /sederunt_session=/);
    assert.match(cookie, /HttpOnly/);
    const home = await call(gatedPort, "GET", "/console/history", { cookie: cookie.split(";")[0] });
    assert.equal(home.status, 200);
    assert.match(home.raw, /Sign out/);
    const board = await call(gatedPort, "GET", "/api/console?member=henry", { cookie: cookie.split(";")[0] });
    assert.equal(board.status, 200);
    const expired = sealSession({ memberId: "Mina", name: "Mina", exp: Date.now() - 1000 }, SECRET);
    const bounced = await call(gatedPort, "GET", "/console", { cookie: `sederunt_session=${encodeURIComponent(expired)}` });
    assert.equal(bounced.status, 302);
    assert.match(bounced.location, /reason=expired/);
    const slack = await call(gatedPort, "POST", "/api/slack", { body: "{}" });
    assert.equal(slack.status, 200);
    assert.equal(slack.location, "");
  } finally {
    gated.close();
  }
});
