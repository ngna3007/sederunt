import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { meetingContext } from "../src/meeting/speech-gate.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { companyBoard, noteMeetingLines, rebuildCompanyIndex } from "../src/typed-path.js";

const ROOM = "8d988983-1111-4111-8111-111111111111";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

test("the transcript stays on the meeting and off the room list", async () => {
  const session = createSession();
  session.rooms.push({
    id: ROOM,
    kind: "meeting",
    platform: "Google Meet",
    botPresent: true,
    call: "in_call_recording",
    exchanges: [
      { user: "set a meeting at 7 pm today about the Saturn demo", assistant: "Okay, I am waiting." },
      { user: "invite me only", assistant: "I'll send that for approval." },
    ],
  });
  const remembered = [];
  const lines = [
    { speaker: "You", text: "set a meeting at 7 pm today about the Saturn demo", start: 83, end: 90 },
    { speaker: "You", text: "invite me only", start: 91, end: 94 },
  ];
  const deps = {
    memory: {
      async remember(input) { remembered.push(input); return { blobId: null }; },
    },
  };
  assert.equal(await noteMeetingLines(session, deps, ROOM, lines), true);
  assert.equal(session.rooms[0].lines[1].text, "invite me only");
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].text, `${ROOM} meeting transcript`);
  assert.equal(remembered[0].text.includes("7 pm"), false);
  assert.equal(remembered[0].idempotencyKey, `${ROOM}:transcript:2`);
  assert.equal(remembered[0].room.lines[0].text.includes("7 pm today"), true);
  assert.equal(remembered[0].room.exchanges.length, 2);
  const listed = companyBoard(session, "mina").rooms.find((room) => room.id === ROOM);
  assert.equal(listed.lines, undefined);
  assert.equal(listed.exchanges, undefined);
  assert.equal(await noteMeetingLines(session, deps, ROOM, [{ speaker: "You", text: "short", start: 0, end: 1 }]), false);
  assert.equal(session.rooms[0].lines.length, 2);
  assert.equal(remembered.length, 1);

  const reloaded = createSession();
  const report = await rebuildCompanyIndex(reloaded, {
    memory: { async index() { return remembered; } },
  });
  assert.equal(report.ok, true);
  const room = reloaded.rooms.find((item) => item.id === ROOM);
  assert.equal(room.platform, "Google Meet");
  assert.equal(room.lines.length, 2);
  assert.equal(room.lines[1].text, "invite me only");
  const context = meetingContext(reloaded, ROOM);
  assert.match(context.kept.map((line) => line.text).join("\n"), /7 pm today/);
  assert.match(context.kept.map((line) => line.text).join("\n"), /invite me only/);
  assert.equal(context.exchanges.length, 2);
  assert.equal(context.exchanges[1].assistant, "I'll send that for approval.");
});

test("room media stores the spoken lines and a later load still has them", async () => {
  const session = createSession();
  session.rooms.push({
    id: ROOM,
    kind: "meeting",
    platform: "Google Meet",
    botPresent: true,
    call: "done",
  });
  const remembered = [];
  const lines = [
    { speaker: "You", text: "set a meeting at 7 pm today about the Saturn demo", start: 83, end: 90 },
    { speaker: "You", text: "invite me only", start: 91, end: 94 },
  ];
  const app = createApp({
    companyLoaded: true,
    session,
    env: { RECALL_API_KEY: "recall-test", SEDERUNT_MEMBER: "mina" },
    deps: {
      memory: {
        async index() { return []; },
        async recall() { return []; },
        async remember(input) { remembered.push(input); return { blobId: null }; },
      },
    },
    recall: {
      async readBot() {
        return { id: ROOM, lines };
      },
    },
  });
  const port = await listen(app);
  try {
    const media = await fetch(`http://127.0.0.1:${port}/console/rooms/${ROOM}/media`);
    assert.equal(media.status, 200);
    const body = await media.json();
    assert.equal(body.lines.length, 2);
    assert.equal(body.lines[1].text, "invite me only");
    assert.equal(session.rooms[0].lines.length, 2);
    assert.equal(remembered.some((item) => item.text === `${ROOM} meeting transcript`), true);
    assert.equal(remembered.some((item) => String(item.text || "").includes("invite me only")), false);
    const listed = await fetch(`http://127.0.0.1:${port}/api/console?member=mina`);
    const raw = await listed.text();
    assert.equal(raw.includes("invite me only"), false);
    const again = await fetch(`http://127.0.0.1:${port}/console/rooms/${ROOM}/media`);
    assert.equal((await again.json()).lines[0].text.includes("7 pm today"), true);
    assert.equal(remembered.filter((item) => item.text === `${ROOM} meeting transcript`).length, 1);
  } finally {
    app.close();
  }

  const reloaded = createSession();
  await rebuildCompanyIndex(reloaded, { memory: { async index() { return remembered; } } });
  const next = createApp({
    companyLoaded: true,
    session: reloaded,
    env: { RECALL_API_KEY: "recall-test", SEDERUNT_MEMBER: "mina" },
    deps: {
      memory: {
        async index() { return remembered; },
        async recall() { return []; },
        async remember() { return { blobId: null }; },
      },
    },
    recall: { async readBot() { return { id: ROOM }; } },
  });
  const nextPort = await listen(next);
  try {
    const media = await fetch(`http://127.0.0.1:${nextPort}/console/rooms/${ROOM}/media`);
    assert.equal(media.status, 200);
    const body = await media.json();
    assert.equal(body.lines[0].text.includes("7 pm today"), true);
    assert.equal(body.lines[1].text, "invite me only");
    const board = await fetch(`http://127.0.0.1:${nextPort}/api/console?member=mina`);
    assert.equal((await board.text()).includes("invite me only"), false);
  } finally {
    next.close();
  }
});
