import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { loadCompanyEnv, loadLocalEnv } from "../src/local-env.js";
import { createMeetingAdapter } from "../src/meeting/recall.js";
import { renderRoomPage } from "../src/room-page.js";
import { createSession } from "../src/session.js";
import { createApp, defaultDeps, doorReport } from "../src/server.js";
import { handleUtterance, roomLedger } from "../src/typed-path.js";

const desk = {
  id: "desk",
  kind: "meeting",
  source: "meet",
  botPresent: true,
  memberIds: ["mina"],
};

test("the room page names the empty state and keeps secrets off the page", () => {
  const html = renderRoomPage();
  assert.match(html, /No decision yet\. Say one sentence\. This list lives in the server process, so a restart clears it\./);
  assert.match(html, /Send bot to call/);
  assert.match(html, /Clash with this/);
  assert.match(html, /Replace this/);
  assert.match(html, /Kept that sentence\./);
  assert.match(html, /Dismissed calendar change\./);
  assert.match(html, /That sentence is already in the list\./);
  assert.match(html, /Ask a question/);
  assert.match(html, /That is a statement\. Switch to Record decision to keep it\./);
  assert.match(html, /That is not a Google Meet link/);
  assert.match(html, /localStorage/);
  assert.match(html, /clearReply\(\);\s*\n\}/);
  assert.match(html, /SEDERUNT_PUBLIC_ORIGIN/);
  assert.match(html, /min-height:\s*44px/);
  assert.match(html, /id="reply" hidden/);
  assert.equal(html.includes("required"), false);
  assert.equal(html.includes("—"), false);
  assert.equal(html.includes("innerHTML"), false);
  assert.equal(html.includes("outline: none"), false);
  assert.doesNotMatch(html, /RECALL_API_KEY|COMPANY_MEMWAL|whsec_|0x[a-f0-9]{8}/i);
});

test("door flags are booleans and a local address is not a meeting door", () => {
  assert.deepEqual(doorReport({}, false), {
    meeting: false, calendar: false, linear: false, slack: false, member: false, console: false, company: false, walk: false,
  });
  assert.deepEqual(doorReport({
    RECALL_API_KEY: "present",
    RECALL_WEBHOOK_SECRET: "present",
    SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
    CALENDAR_OAUTH_REFRESH_TOKEN: "present",
    SLACK_SIGNING_SECRET: "present",
    SLACK_BOT_TOKEN: "present",
    SEDERUNT_MEMBER: "U_MINA",
    CONSOLE_API_KEY: "present",
    CONSOLE_SERVICE_PRIVATE_KEY: "present",
    CONSOLE_FOLDER_ID: "present",
    COMPANY_MEMWAL_KEY: "present",
    COMPANY_MEMWAL_ACCOUNT_ID: "present",
  }, true), {
    meeting: true, calendar: true, linear: true, slack: true, member: true, console: true, company: true, walk: true,
  });
  assert.equal(doorReport({
    RECALL_API_KEY: "present",
    SEDERUNT_PUBLIC_ORIGIN: "http://127.0.0.1:8787",
  }, false).meeting, false);
  assert.equal(doorReport({ SLACK_SIGNING_SECRET: "present" }, false).slack, false);
  assert.equal(doorReport({ SLACK_SIGNING_SECRET: "present", SLACK_BOT_TOKEN: "present" }, false).slack, true);
});

test("local env fills meeting, calendar, console, and slack files and does not override", () => {
  const seen = [];
  const env = { RECALL_API_KEY: "already" };
  loadLocalEnv(env, (name) => {
    seen.push(name);
    if (name === "recall.env") return "RECALL_API_KEY=from-file\nSEDERUNT_PUBLIC_ORIGIN=https://sederunt.example\n# note\n\n";
    if (name === "calendar-oauth.env") return "CALENDAR_MCP_TOKEN=present\n";
    if (name === "public.env") throw new Error("missing");
    if (name === "console.env") return "CONSOLE_API_KEY=present\n";
    if (name === "slack.env") return "SLACK_BOT_TOKEN=present\n";
    if (name === "tatum.env") return "TATUM_API_KEY=present\n";
    throw new Error(`unexpected file ${name}`);
  });
  assert.deepEqual(seen, ["recall.env", "calendar-oauth.env", "public.env", "console.env", "slack.env", "tatum.env"]);
  assert.equal(env.RECALL_API_KEY, "already");
  assert.equal(env.SEDERUNT_PUBLIC_ORIGIN, "https://sederunt.example");
  assert.equal(env.CALENDAR_MCP_TOKEN, "present");
  assert.equal(env.CONSOLE_API_KEY, "present");
  assert.equal(env.SLACK_BOT_TOKEN, "present");
  assert.equal(env.TATUM_API_KEY, "present");
  assert.equal(env.COMPANY_MEMWAL_KEY, undefined);
  assert.equal(env.PERSONAL_MEMWAL_KEY, undefined);
  const company = {};
  loadCompanyEnv(company, (name) => {
    if (name === "company.env") return "COMPANY_MEMWAL_KEY=delegate\nCOMPANY_MEMWAL_ACCOUNT_ID=account\n";
    throw new Error(`unexpected file ${name}`);
  });
  assert.equal(company.COMPANY_MEMWAL_KEY, "delegate");
  assert.equal(company.COMPANY_MEMWAL_ACCOUNT_ID, "account");
});

test("a join without a public origin reports not-configured and does not fetch", async () => {
  let fetches = 0;
  const meeting = createMeetingAdapter(
    { RECALL_API_KEY: "present", SEDERUNT_PUBLIC_ORIGIN: "" },
    { fetch() { fetches += 1; throw new Error("fetch ran"); } },
  );
  const session = createSession();
  const result = await handleUtterance({
    text: "The offsite is in Lisbon",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "join-local",
    room: desk,
    participants: ["mina"],
    join: { url: "https://meet.google.com/abc-defg-hij" },
    session,
  }, { meeting, memory: null });
  assert.equal(result.join, "not-configured");
  assert.equal(fetches, 0);
  assert.match(result.body, /Lisbon/);
  assert.equal(result.visible[0].status, "current");
  assert.equal(result.visible[0].text.includes("Lisbon"), true);
});

test("a failed join stays a word and the typed answer remains", async () => {
  const session = createSession();
  const result = await handleUtterance({
    text: "The offsite is in Lisbon",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "join-failed",
    room: desk,
    participants: ["mina"],
    join: { url: "https://meet.google.com/abc-defg-hij" },
    session,
  }, {
    memory: null,
    meeting: {
      async join() {
        throw new Error("Meeting join failed secret-value");
      },
    },
  });
  assert.equal(result.join, "failed");
  assert.match(result.body, /Lisbon/);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("a join route reports failure without the error text and keeps no sentence", async () => {
  const calls = [];
  const meeting = {
    async join() {
      calls.push("join");
      throw new Error("Meeting join failed secret-value");
    },
  };
  const blocked = createApp({ deps: { memory: null, meeting }, env: {} });
  blocked.listen(0, "127.0.0.1");
  await once(blocked, "listening");
  try {
    const joined = await postPath(blocked.address().port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.equal(joined.body.join, "not-configured");
    assert.deepEqual(calls, []);
    assert.equal(joined.raw.includes("secret-value"), false);
    const ledger = JSON.parse((await get(blocked.address().port, "/api/room?room=desk")).raw);
    assert.deepEqual(ledger.decisions, []);
  } finally {
    await new Promise((resolve, reject) => blocked.close((error) => (error ? reject(error) : resolve())));
  }

  const meetingOnly = createApp({
    deps: { memory: null, meeting },
    env: { RECALL_API_KEY: "present", RECALL_WEBHOOK_SECRET: "present", SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example" },
  });
  meetingOnly.listen(0, "127.0.0.1");
  await once(meetingOnly, "listening");
  try {
    const joined = await postPath(meetingOnly.address().port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.equal(joined.body.join, "not-configured");
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve, reject) => meetingOnly.close((error) => (error ? reject(error) : resolve())));
  }

  const ready = createApp({
    deps: { memory: null, meeting },
    linearReady: true,
    env: {
      RECALL_API_KEY: "present",
      RECALL_WEBHOOK_SECRET: "present",
      SEDERUNT_PUBLIC_ORIGIN: "https://sederunt.example",
      SLACK_SIGNING_SECRET: "present",
      SLACK_BOT_TOKEN: "present",
      SEDERUNT_MEMBER: "U_MINA",
      CONSOLE_API_KEY: "present",
      CONSOLE_SERVICE_PRIVATE_KEY: "present",
      CONSOLE_FOLDER_ID: "present",
      COMPANY_MEMWAL_KEY: "present",
      COMPANY_MEMWAL_ACCOUNT_ID: "present",
    },
  });
  ready.listen(0, "127.0.0.1");
  await once(ready, "listening");
  try {
    const joined = await postPath(ready.address().port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.equal(joined.body.join, "failed");
    assert.deepEqual(calls, ["join"]);
    assert.equal(joined.raw.includes("secret-value"), false);
  } finally {
    await new Promise((resolve, reject) => ready.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a missing Linear token records the file and does not throw the token error", async () => {
  const deps = defaultDeps({
    liveLinear: true,
    memory: null,
    loadToken() {
      throw new Error("Linear token for team ROW is missing secret-token");
    },
  });
  const session = createSession();
  const room = desk;
  await handleUtterance({
    text: "set linear to do",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "pref-do",
    room,
    participants: ["mina"],
    session,
  }, deps);
  const filed = await handleUtterance({
    text: "File the venue ticket hall",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "file-hall",
    room,
    participants: ["mina"],
    session,
  }, deps);
  assert.deepEqual(deps.linear.calls, ["create"]);
  assert.equal(filed.status, "recorded");
  assert.match(filed.body, /The edit did not happen/);
  assert.equal(JSON.stringify(filed).includes("secret-token"), false);
});

test("a question and a repeated sentence are not kept", async () => {
  const session = createSession();
  const room = desk;
  const question = await handleUtterance({
    text: "What did we agree on today?",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "question",
    room,
    participants: ["mina"],
    session,
  }, { memory: null });
  assert.equal(question.outcome, "question");
  assert.equal(session.decisions.length, 0);
  await handleUtterance({
    text: "The booth opens at nine.",
    memberId: "rowan",
    door: "meeting",
    addressed: true,
    deliveryId: "booth",
    room,
    participants: ["rowan"],
    session,
  }, { memory: null });
  const again = await handleUtterance({
    text: "The booth opens at nine.",
    memberId: "alex",
    door: "meeting",
    addressed: true,
    deliveryId: "booth-again",
    room,
    participants: ["alex"],
    session,
  }, { memory: null });
  assert.equal(again.outcome, "duplicate");
  assert.equal(session.decisions.length, 1);
  await handleUtterance({
    text: "private: the note stays with mina",
    memberId: "mina",
    door: "meeting",
    addressed: true,
    deliveryId: "private-note",
    room,
    participants: ["mina"],
    session,
  }, { memory: null });
  const ledger = roomLedger(session, "desk");
  assert.equal(ledger.decisions.length, 1);
  assert.equal(ledger.decisions[0].speaker, "rowan");
  assert.equal(ledger.decisions[0].status, "current");
  assert.match(ledger.decisions[0].spokenAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(ledger).includes("blobId"), false);
  assert.equal(JSON.stringify(ledger).includes("private"), false);
});

test("a calendar read that throws stays a sentence and drops the error text", async () => {
  const session = createSession();
  const result = await handleUtterance({
    text: "what is on Friday",
    memberId: "rowan",
    door: "meeting",
    addressed: true,
    session,
  }, {
    calendar: {
      async readDay() { throw new Error("Calendar request failed secret-value"); },
    },
  });
  assert.match(result.body, /The calendar could not be read/);
  assert.equal(result.body.includes("secret-value"), false);
  assert.equal(session.decisions.length, 0);
});

test("the room keeps a clash and a replacement for the person in the room", async () => {
  let fetches = 0;
  const meeting = createMeetingAdapter(
    { RECALL_API_KEY: "present" },
    { fetch() { fetches += 1; throw new Error("fetch ran"); } },
  );
  const app = createApp({
    deps: {
      memory: null,
      meeting,
      tatum: { async getObject() { throw new Error("unread"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const page = await get(port, "/room");
    assert.equal(page.status, 302);
    assert.equal(page.location, "/console");
    const home = await get(port, "/console");
    assert.equal(home.status, 200);
    assert.match(home.raw, /Record/);
    assert.equal(home.raw.includes("—"), false);

    const joined = await postPath(port, "/api/join", { url: "https://meet.google.com/abc-defg-hij" });
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.body, { join: "not-configured" });
    assert.equal(joined.raw.includes("secret"), false);
    const before = JSON.parse((await get(port, "/api/room?room=desk")).raw);
    assert.deepEqual(before.decisions, []);
    assert.deepEqual(before.preferences, { linear: "do", calendar: "do" });

    const ready = await get(port, "/api/ready");
    assert.equal(ready.status, 200);
    const report = JSON.parse(ready.raw);
    assert.equal(typeof report.meeting, "boolean");
    assert.equal(typeof report.calendar, "boolean");
    assert.equal(typeof report.linear, "boolean");
    assert.deepEqual(Object.keys(report).sort(), ["calendar", "company", "console", "linear", "meeting", "member", "slack", "walk"]);
    assert.equal(ready.raw.includes("present"), false);

    const first = await post(port, {
      text: "The offsite is in Lisbon",
      memberId: "mina",
      door: "meeting",
      addressed: true,
      deliveryId: "lisbon",
      room: desk,
      participants: ["mina"],
      join: { url: "https://meet.google.com/abc-defg-hij" },
    });
    assert.equal(first.body.join, "not-configured");
    assert.equal(fetches, 0);
    assert.equal(first.body.visible.length, 1);
    assert.equal(first.body.visible[0].status, "current");
    assert.equal("blobId" in first.body.visible[0], false);

    const second = await post(port, {
      text: "The offsite is in Porto",
      memberId: "mina",
      door: "meeting",
      addressed: true,
      deliveryId: "porto",
      room: desk,
      participants: ["mina"],
      decision: { contradicts: [first.body.decisionId] },
    });
    assert.equal(second.body.visible.find((row) => row.text.includes("Lisbon")).status, "clashing");
    assert.equal(second.body.visible.find((row) => row.text.includes("Porto")).status, "clashing");

    const kept = await post(port, {
      text: "The offsite is in Madrid",
      memberId: "mina",
      door: "meeting",
      addressed: true,
      deliveryId: "madrid",
      room: desk,
      participants: ["mina"],
      decision: { replaces: first.body.decisionId },
    });
    assert.equal(kept.body.visible.find((row) => row.text.includes("Lisbon")).status, "replaced");
    assert.equal(kept.body.visible.find((row) => row.text.includes("Madrid")).status, "current");
    assert.match(kept.body.body, /replaced/);

    const ledger = JSON.parse((await get(port, "/api/room?room=desk")).raw);
    assert.equal(ledger.decisions.length, 3);
    assert.equal(ledger.decisions.find((row) => row.text.includes("Lisbon")).status, "replaced");
    assert.equal(ledger.decisions.find((row) => row.text.includes("Lisbon")).speaker, "mina");
    const lisbon = ledger.decisions.find((row) => row.text.includes("Lisbon"));
    const porto = ledger.decisions.find((row) => row.text.includes("Porto"));
    assert.ok(lisbon.contradicts.includes(porto.id));
    assert.ok(porto.contradicts.includes(lisbon.id));
    assert.equal(ledger.decisions.find((row) => row.text.includes("Madrid")).replaces, first.body.decisionId);
    assert.match(ledger.decisions[0].spokenAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(JSON.stringify(ledger).includes("blobId"), false);
  } finally {
    await new Promise((resolve, reject) => {
      app.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("a clean server is not ready and a fully configured server is", async () => {
  const empty = createApp({ env: {}, deps: { memory: null } });
  empty.listen(0, "127.0.0.1");
  await once(empty, "listening");
  try {
    const body = JSON.parse((await get(empty.address().port, "/api/ready")).raw);
    assert.deepEqual(body, {
      meeting: false, calendar: false, linear: false, slack: false, member: false, console: false, company: false, walk: false,
    });
  } finally {
    await new Promise((resolve, reject) => empty.close((error) => (error ? reject(error) : resolve())));
  }
  const full = createApp({
    env: {
      RECALL_API_KEY: "recall-sentinel",
      RECALL_WEBHOOK_SECRET: "webhook-sentinel",
      SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
      SLACK_SIGNING_SECRET: "slack-signing-sentinel",
      SLACK_BOT_TOKEN: "slack-bot-sentinel",
      SEDERUNT_MEMBER: "U_MINA",
      CONSOLE_API_KEY: "console-key-sentinel",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-service-sentinel",
      CONSOLE_FOLDER_ID: "folder-sentinel",
      COMPANY_MEMWAL_KEY: "delegate-sentinel",
      COMPANY_MEMWAL_ACCOUNT_ID: "account-sentinel",
    },
    linearReady: true,
    deps: { memory: null },
  });
  full.listen(0, "127.0.0.1");
  await once(full, "listening");
  try {
    const raw = (await get(full.address().port, "/api/ready")).raw;
    assert.equal(raw.includes("sentinel"), false);
    assert.deepEqual(JSON.parse(raw), {
      meeting: true, calendar: false, linear: true, slack: true, member: true, console: true, company: true, walk: true,
    });
  } finally {
    await new Promise((resolve, reject) => full.close((error) => (error ? reject(error) : resolve())));
  }
});

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

function post(port, body) {
  return postPath(port, "/api/typed", body);
}

function postPath(port, path, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, raw, body: JSON.parse(raw) });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
