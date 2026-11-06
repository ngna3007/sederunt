import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { logAction, logFailure, logRequest } from "../src/activity.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { companyBoard } from "../src/typed-path.js";

const SECRET = "activity-route-secret";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function cookie() {
  const token = sealSession({ memberId: "rowan", name: "Rowan Nguyen", exp: Date.now() + 60_000 }, SECRET);
  return sessionCookie(token, { headers: {}, socket: {} }, 60).split(";")[0];
}

function seeded() {
  const session = createSession();
  session.rooms.push(
    { id: "booth", name: "Booth planning", platform: "Google Meet" },
    { id: "design-crit", name: "Design crit: console empty states", platform: "Google Meet" },
    { id: "offsite", name: "Quarterly planning offsite: venue", platform: "Zoom" },
  );
  for (const id of ["booth", "design-crit", "offsite"]) {
    session.decisions.push({
      id: `decision-${id}`,
      account: "company",
      kind: "decision",
      text: `${id} kept a sentence.`,
      speakerMemberId: "rowan",
      inviteMemberIds: ["rowan"],
      roomId: id,
      contradicts: [],
      fileNames: [],
    });
  }
  const tool = { name: "act", server: "sederunt-mcp" };
  const changes = [{ field: "start", from: "2:00 PM", to: "4:00 PM" }];
  logRequest(session, {
    id: "req-move",
    requestId: "req-move",
    actor: { type: "person", name: "Mina", via: "Slack" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes,
    origin: { roomId: "design-crit", roomName: "Design crit" },
    tool,
  });
  logFailure(session, {
    id: "fail-move",
    requestId: "req-move",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    verb: "move",
    target: { system: "calendar", type: "event", title: "Design crit" },
    changes: [{ field: "start", from: "2:00 PM", to: "4:00 PM" }],
    error: "the calendar is read-only",
    origin: { roomId: "design-crit", roomName: "Design crit" },
    tool,
  });
  logAction(session, {
    id: "act-assign",
    requestId: "req-assign",
    actor: { type: "sederunt", name: "Sederunt", via: "MCP: cursor" },
    verb: "assign",
    target: { system: "linear", type: "issue", id: "ABC-123", title: "Fix booth signage" },
    changes: [{ field: "assignee", from: "", to: "Rowan" }],
    origin: { roomId: "booth", roomName: "Booth planning" },
    tool,
    undo: { available: true, until: new Date(Date.now() + 60_000).toISOString() },
  });
  return session;
}

function appFor(session, calls) {
  return createApp({
    session,
    companyLoaded: true,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "", checkpoint: null }; } },
      calendar: {
        async listTools() { return [{ name: "move_event", write: true }]; },
        async readEvent() { calls.push(["read"]); return { start: "2026-11-03T15:00:00.000Z", end: "2026-11-03T16:00:00.000Z" }; },
        async call(name, params) { calls.push(["calendar", name, params]); return { id: "evt-1" }; },
      },
      linear: {
        async createIssue(input) { calls.push(["create", input]); return { identifier: "ROW-9", id: "ROW-9" }; },
        async assignIssue(input) { calls.push(["assign", input]); return { id: input.id || "ABC-123" }; },
        async unassignIssue(input) { calls.push(["unassign", input]); return { id: input.id }; },
        async updateIssue(input) { calls.push(["update", input]); return { id: input.id }; },
        async addLabel(input) { calls.push(["add", input]); return { id: input.id }; },
        async removeLabel(input) { calls.push(["remove", input]); return { id: input.id }; },
      },
    },
    env: {
      SEDERUNT_CONSOLE_SECRET: SECRET,
      SEDERUNT_MEMBER: "rowan",
      COMPANY_MEMWAL_KEY: "k",
      COMPANY_MEMWAL_ACCOUNT_ID: "a",
    },
  });
}

test("activity routes refuse mutations when sign-in is not configured", async () => {
  const app = createApp({
    session: seeded(),
    companyLoaded: true,
    deps: { memory: { async remember() { return { blobId: null }; } }, tatum: { async getObject() { return { text: "", checkpoint: null }; } } },
    env: { COMPANY_MEMWAL_KEY: "k", COMPANY_MEMWAL_ACCOUNT_ID: "a", SEDERUNT_MEMBER: "Mina" },
  });
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "retry", id: "fail-move" }),
    });
    assert.equal(response.status, 401);
    const unknown = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie(), origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ op: "nope", id: "fail-move" }),
    });
    assert.equal(unknown.status, 401);
  } finally {
    app.close();
  }
});

test("activity routes require a session and a same-origin JSON post", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  try {
    const open = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "undo", id: "act-assign" }),
    });
    assert.equal(open.status, 401);
    const plain = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "text/plain", cookie: cookie() },
      body: JSON.stringify({ op: "undo", id: "act-assign" }),
    });
    assert.equal(plain.status, 403);
    const cross = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie(), origin: "https://evil.example" },
      body: JSON.stringify({ op: "undo", id: "missing" }),
    });
    assert.equal(cross.status, 403);
    const op = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie(), origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ op: "explode", id: "fail-move" }),
    });
    assert.equal(op.status, 400);
  } finally {
    app.close();
  }
});

test("undo rejects a missing row, a request, and a second undo", async () => {
  const session = seeded();
  const app = appFor(session, []);
  const port = await listen(app);
  const headers = { "content-type": "application/json", cookie: cookie(), origin: `http://127.0.0.1:${port}` };
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "undo", id: "nope" }),
    });
    assert.equal(missing.status, 404);
    const request = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "undo", id: "req-move" }),
    });
    assert.equal(request.status, 404);
    const onceUndo = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "undo", id: "act-assign" }),
    });
    assert.equal(onceUndo.status, 200);
    const undo = session.activity.find((row) => row.kind === "undo");
    assert.equal(undo.actor.name, "Rowan Nguyen");
    const again = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "undo", id: "act-assign" }),
    });
    assert.equal(again.status, 409);
  } finally {
    app.close();
  }
});

test("retry calls the connector and keeps the request's from value", async () => {
  const calls = [];
  const session = seeded();
  const app = appFor(session, calls);
  const port = await listen(app);
  const headers = { "content-type": "application/json", cookie: cookie(), origin: `http://127.0.0.1:${port}` };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "retry", id: "fail-move" }),
    });
    assert.equal(response.status, 200);
    const calendarCall = calls.find((call) => call[0] === "calendar");
    assert.equal(calendarCall[1], "update_event");
    assert.equal(calendarCall[2].start, "2026-11-03T09:00:00.000Z");
    assert.equal(calendarCall[2].end, "2026-11-03T10:00:00.000Z");
    assert.equal(calendarCall[2].timeZone, "Asia/Ho_Chi_Minh");
    const retried = session.activity.find((row) => row.kind === "action" && row.requestId === "req-move" && row.id !== "act-assign");
    assert.equal(retried.changes[0].from, "2026-11-03T15:00:00.000Z");
    assert.equal(retried.changes[0].to, "2026-11-03T09:00:00.000Z");
    assert.equal(session.activity.find((row) => row.id === "fail-move").resolved, true);
    const again = await fetch(`http://127.0.0.1:${port}/api/activity`, {
      method: "POST", headers, body: JSON.stringify({ op: "retry", id: "fail-move" }),
    });
    assert.equal(again.status, 409);
  } finally {
    app.close();
  }
});

test("activity search filters on the server with the feed module", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  try {
    const open = await fetch(`http://127.0.0.1:${port}/api/activity?q=signage`);
    assert.equal(open.status, 401);
    const found = await fetch(`http://127.0.0.1:${port}/api/activity?q=signage`, { headers: { cookie: cookie() } });
    assert.equal(found.status, 200);
    const body = await found.json();
    const sentences = body.groups.flatMap((group) => group.rows.map((row) => row.sentence));
    assert.equal(sentences.some((line) => line.includes("ABC-123")), true);
    assert.equal(sentences.some((line) => line.includes("Design crit")), false);
    assert.equal(body.groups.some((group) => group.rows.some((row) => row.kind === "resolve")), false);
  } finally {
    app.close();
  }
});

test("an unknown console path is a not-found page", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  const headers = { cookie: cookie() };
  try {
    const unknown = await fetch(`http://127.0.0.1:${port}/console/no-such-page`, { headers });
    assert.equal(unknown.status, 404);
    const page = await unknown.text();
    assert.match(page, /Page not found/);
    assert.match(page, /id="page-missing"/);
    const home = await fetch(`http://127.0.0.1:${port}/console`, { headers });
    assert.equal(home.status, 200);
    const history = await fetch(`http://127.0.0.1:${port}/console/history`, { headers });
    assert.equal(history.status, 200);
  } finally {
    app.close();
  }
});

test("a contradicting pair is clashing on the decisions board", () => {
  const session = createSession();
  session.decisions.push(
    {
      id: "off-1",
      account: "company",
      kind: "decision",
      text: "The offsite is in Da Lat for three nights.",
      speakerMemberId: "rowan",
      inviteMemberIds: ["rowan"],
      roomId: "offsite",
      contradicts: ["off-2"],
      fileNames: [],
    },
    {
      id: "off-2",
      account: "company",
      kind: "decision",
      text: "The offsite is in Hoi An for two nights.",
      speakerMemberId: "tomas",
      inviteMemberIds: ["rowan"],
      roomId: "offsite",
      contradicts: ["off-1"],
      fileNames: [],
    },
  );
  const board = companyBoard(session, "rowan");
  assert.equal(board.decisions.length, 2);
  assert.equal(board.decisions.every((row) => row.status === "clashing"), true);
});

test("Booth planning wins over a room that only shares planning", async () => {
  const session = createSession();
  session.rooms.push(
    { id: "booth", name: "Booth planning", platform: "Google Meet" },
    { id: "quarterly-planning-offsite", name: "Quarterly planning offsite: venue", platform: "Zoom" },
  );
  for (let index = 0; index < 4; index += 1) {
    session.decisions.push({
      id: `booth-${index}`,
      account: "company",
      kind: "decision",
      text: `Booth line ${index}.`,
      speakerMemberId: "rowan",
      inviteMemberIds: ["rowan"],
      roomId: "booth",
      contradicts: [],
      fileNames: [],
    });
  }
  for (let index = 0; index < 3; index += 1) {
    session.decisions.push({
      id: `off-${index}`,
      account: "company",
      kind: "decision",
      text: `Offsite line ${index}.`,
      speakerMemberId: "rowan",
      inviteMemberIds: ["rowan"],
      roomId: "quarterly-planning-offsite",
      contradicts: [],
      fileNames: [],
    });
  }
  const app = appFor(session, []);
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "What did Booth planning decide?", memberId: "rowan" }),
    });
    const body = await response.json();
    assert.equal(body.decisions, 4);
    assert.match(body.body, /Booth line/);
    assert.doesNotMatch(body.body, /Offsite line/);
    assert.doesNotMatch(body.body, /preference /);
  } finally {
    app.close();
  }
});

test("chat matches a room on a word boundary and counts only that room", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  try {
    const offsite = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "what did we decide about the offsite?", memberId: "rowan" }),
    });
    const offsiteBody = await offsite.json();
    assert.equal(offsiteBody.decisions, 1);
    assert.match(offsiteBody.body, /offsite kept/);
    assert.doesNotMatch(offsiteBody.body, /booth kept/);
    const wide = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "what did we decide about boothwide?", memberId: "rowan" }),
    });
    const wideBody = await wide.json();
    assert.equal(wideBody.body, "Nothing stored matches that.");
    assert.equal(wideBody.decisions, 0);
    const booth = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "What did Booth planning decide?", memberId: "rowan" }),
    });
    const boothBody = await booth.json();
    assert.equal(boothBody.decisions, 1);
    assert.match(boothBody.body, /booth kept/);
    assert.doesNotMatch(boothBody.body, /preference /);
    assert.doesNotMatch(boothBody.body, /offsite kept/);
    assert.doesNotMatch(boothBody.body, /design-crit kept/);
    const design = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "what was decided about Design crit?", memberId: "rowan" }),
    });
    const designBody = await design.json();
    assert.equal(designBody.decisions, 1);
    assert.match(designBody.body, /design-crit kept/);
  } finally {
    app.close();
  }
});

test("a question that matches nothing does not list every decision", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "what about xyzzy?", memberId: "rowan" }),
    });
    const body = await response.json();
    assert.equal(body.body, "Nothing stored matches that.");
    assert.equal(body.decisions, 0);
  } finally {
    app.close();
  }
});

test("the activity feed module is served under both paths", async () => {
  const app = appFor(seeded(), []);
  const port = await listen(app);
  try {
    const feed = await fetch(`http://127.0.0.1:${port}/console/activity-feed.js`);
    assert.equal(feed.status, 200);
    assert.match(await feed.text(), /formatActivitySentence/);
    const rooms = await fetch(`http://127.0.0.1:${port}/console/room-match.js`);
    assert.equal(rooms.status, 200);
    assert.match(await rooms.text(), /ROOM_WEAK/);
  } finally {
    app.close();
  }
});
