import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { logAction, logFailure, logRequest } from "../src/activity.js";
import { sealSession, sessionCookie } from "../src/console-auth.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";

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
  const changes = [{ field: "start", from: "2:00 PM", to: "3:00 PM" }];
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
        async call(name, params) { calls.push(["calendar", name, params]); return { id: "evt-1" }; },
      },
      linear: {
        async createIssue(input) { calls.push(["create", input]); return { identifier: "ROW-9", id: "ROW-9" }; },
        async assignIssue(input) { calls.push(["assign", input]); return { id: input.id }; },
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
    assert.equal(calls[0][0], "calendar");
    assert.equal(calls[0][2].day, "3:00 PM");
    const retried = session.activity.find((row) => row.kind === "action" && row.requestId === "req-move");
    assert.equal(retried.changes[0].from, "2:00 PM");
    assert.equal(retried.changes[0].to, "3:00 PM");
    assert.equal(session.activity.find((row) => row.id === "fail-move").resolved, true);
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
    assert.equal(wideBody.decisions, 3);
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
