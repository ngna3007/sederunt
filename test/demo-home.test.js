import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import vm from "node:vm";
import { canReadInSession, meetingRoomReaders, withMeetingReaders } from "../src/domain/read-access.js";
import { mediaFromBot, meetingPlatformName } from "../src/meeting/recall.js";
import { mergeRoomLists } from "../src/room-match.js";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { companyBoard, lineSpeakers, rebuildCompanyIndex, roomLedger } from "../src/typed-path.js";

// Demo take-1 (Nov 11 2026, Northline). Recall names the host participant
// "100"; the console member is the person who sent the bot. Ids below are
// stand-ins, not the tenant's.
const ROOM = "0871a492-71b3-436d-97d1-e3897ceb5eff";
const OWNER = "owner-console-member";
const HOST_PARTICIPANT = "100";

function demoIndex() {
  return [
    { kind: "room", account: "company", room: { id: ROOM, kind: "meeting", platform: "Google Meet", call: "joining_call", startedAt: "2026-11-11T10:13:01.330Z", memberIds: [OWNER] } },
    { kind: "room", account: "company", room: { id: ROOM, kind: "meeting", call: "in_call_recording" } },
    {
      kind: "decision",
      account: "company",
      text: "the design review moved to thursday",
      decision: {
        id: "decision-heads-up",
        roomId: ROOM,
        text: "the design review moved to thursday",
        inviteMemberIds: [HOST_PARTICIPANT],
        account: "company",
        kind: "decision",
        speakerMemberId: HOST_PARTICIPANT,
        spokenAt: "2026-11-11T10:13:59.489Z",
      },
    },
  ];
}

async function demoSession() {
  const session = createSession();
  const rows = demoIndex();
  await rebuildCompanyIndex(session, { memory: { async index() { return rows; } } });
  return session;
}

test("demo home: the heads-up kept for participant 100 shows on Home and in the room for the member who sent the bot", async () => {
  const session = await demoSession();
  assert.equal(session.decisions.length, 1, "the fact is stored");
  assert.deepEqual(session.decisions[0].inviteMemberIds, [HOST_PARTICIPANT], "stored record is not rewritten");
  for (const principal of [OWNER, { memberId: OWNER, identities: [] }]) {
    const board = companyBoard(session, principal);
    assert.deepEqual(board.decisions.map((row) => row.text), ["the design review moved to thursday"]);
    const ledger = roomLedger(session, ROOM, principal);
    assert.deepEqual(ledger.decisions.map((row) => row.text), ["the design review moved to thursday"], "room Decisions tab");
  }
  assert.deepEqual(session.decisions[0].inviteMemberIds, [HOST_PARTICIPANT], "reading does not change the record");
  assert.equal(companyBoard(session, "someone-else").decisions.length, 0, "a member not on the room still sees nothing");
  assert.equal(companyBoard(session, HOST_PARTICIPANT).decisions.length, 1, "the participant still reads it");
});

test("demo home: meeting readers widen only company records in meeting rooms with stored members", () => {
  const session = {
    rooms: [
      { id: "m1", kind: "meeting", memberIds: [OWNER] },
      { id: "m2", kind: "meeting" },
      { id: "C0123456789", kind: "slack", memberIds: [OWNER] },
    ],
  };
  const readers = meetingRoomReaders(session);
  assert.deepEqual([...readers.keys()], ["m1"]);
  const personal = { roomId: "m1", account: "personal", inviteMemberIds: ["100"] };
  assert.equal(withMeetingReaders(personal, readers), personal);
  assert.equal(canReadInSession(OWNER, personal, readers), false, "a personal note stays personal");
  assert.equal(canReadInSession(OWNER, { roomId: "m2", inviteMemberIds: ["100"] }, readers), false, "a room with no stored members widens nothing");
  assert.equal(canReadInSession(OWNER, { roomId: "C0123456789", inviteMemberIds: ["100"] }, readers), false, "only meeting rooms");
  assert.equal(canReadInSession(OWNER, { roomId: "m1", inviteMemberIds: ["100"] }, readers), true);
  assert.equal(canReadInSession(OWNER, { roomId: "m1", inviteMemberIds: [], deleted: false }, readers), false, "an empty invite list is not widened");
});

test("demo home: room media is not 404 for the member who sent the bot, and marks the room Done from Recall", async () => {
  const session = await demoSession();
  session.readReport = { ok: true, empty: false };
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    session,
    env: { RECALL_API_KEY: "recall-key-sentinel", SEDERUNT_MEMBER: OWNER },
    deps: { memory: { async index() { return demoIndex(); }, async recall() { return []; }, async remember(input) { remembered.push(input); return { blobId: null }; } } },
    recall: {
      async readBot() {
        return {
          id: ROOM,
          meeting_url: { meeting_id: "zym-txow-kfo", platform: "google_meet" },
          status_changes: [{ code: "in_call_recording" }, { code: "call_ended", sub_code: "bot_received_leave_call" }, { code: "recording_done" }, { code: "done" }],
          recordings: [{ started_at: "2026-11-11T10:13:19.000Z", completed_at: "2026-11-11T10:15:16.000Z", status: { code: "done" }, media_shortcuts: {} }],
        };
      },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const before = await (await fetch(`http://127.0.0.1:${port}/api/console?member=${OWNER}`)).json();
    assert.equal(before.decisions.length, 1, "Home counts the decision");
    const media = await fetch(`http://127.0.0.1:${port}/console/rooms/${ROOM}/media?member=${OWNER}`);
    assert.equal(media.status, 200, "the room's media was 404 while its decision was invited to participant 100 only");
    const body = await media.json();
    assert.equal(body.call, "done");
    assert.equal(body.platform, "Google Meet");
    const after = await (await fetch(`http://127.0.0.1:${port}/api/console?member=${OWNER}`)).json();
    assert.equal(after.rooms.find((room) => room.id === ROOM).call, "done");
    const hidden = await fetch(`http://127.0.0.1:${port}/console/rooms/${ROOM}/media?member=someone-else`);
    assert.equal(hidden.status, 404, "another member still gets 404");
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
});

test("demo home: a later call phase the page learned from Recall is not replaced by an older list row", () => {
  const prior = [{ id: ROOM, call: "done", platform: "Google Meet", startedAt: "2026-11-11T10:13:01.330Z", duration: 117, speakers: ["Anh Nguyễn"] }];
  const incoming = [{ id: ROOM, call: "in_call_recording", platform: "Google Meet" }];
  const [room] = mergeRoomLists(prior, incoming);
  assert.equal(room.call, "done");
  assert.deepEqual(room.speakers, ["Anh Nguyễn"]);
  assert.equal(room.duration, 117);
  const [later] = mergeRoomLists([{ id: ROOM, call: "in_call_recording" }], [{ id: ROOM, call: "done" }]);
  assert.equal(later.call, "done", "a later phase from the server still wins");
});

test("demo home: Recall's meeting_url names the platform, so a webhook-only room is not called 'Room'", () => {
  assert.equal(meetingPlatformName({ meeting_url: { platform: "google_meet" } }), "Google Meet");
  assert.equal(meetingPlatformName({ meeting_url: { platform: "zoom" } }), "Zoom");
  assert.equal(meetingPlatformName({ meeting_url: { platform: "nope" } }), "");
  assert.equal(meetingPlatformName(null), "");
  assert.equal(mediaFromBot({ meeting_url: { platform: "google_meet" }, recordings: [] }).platform, "Google Meet");
  assert.equal(mediaFromBot(null).platform, "");
});

test("demo home: the board lists who Recall heard, by name, without the bot", () => {
  const lines = [
    { speaker: "Anh Nguyễn", text: "hey adam can you hear me" },
    { speaker: "Unknown", text: "yes i can hear you" },
    { speaker: "Anh Nguyễn", text: "heads up thursday" },
    { speaker: "Binh", text: "ok" },
  ];
  assert.deepEqual(lineSpeakers(lines), ["Anh Nguyễn", "Binh"]);
  const session = createSession();
  session.rooms.push({ id: ROOM, kind: "meeting", platform: "Google Meet", botPresent: true, call: "done", lines, memberIds: [OWNER] });
  const board = companyBoard(session, OWNER);
  assert.deepEqual(board.rooms.find((room) => room.id === ROOM).speakers, ["Anh Nguyễn", "Binh"]);
  assert.equal(board.rooms.find((room) => room.id === ROOM).lines, undefined, "the list still carries no transcript");
});

async function consolePage() {
  const { renderConsolePage } = await import("../src/console-page.js");
  return renderConsolePage();
}

function grabFrom(page, name) {
  const start = page.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  let depth = 0;
  for (let index = page.indexOf("{", start); index < page.length; index += 1) {
    if (page[index] === "{") depth += 1;
    if (page[index] === "}") { depth -= 1; if (depth === 0) return page.slice(start, index + 1); }
  }
  return "";
}

test("demo home: Home does not show the empty card while the memory index is still being read", async () => {
  const page = await consolePage();
  const context = { workspaceKind: "company", sectionName: "home", state: null, roomTotal: () => 0 };
  vm.runInNewContext(`${grabFrom(page, "emptyHomeNow")}\nthis.empty = emptyHomeNow;`, context);
  assert.equal(context.empty(), false, "before any answer");
  context.state = { reading: true, shell: true, rooms: [] };
  assert.equal(context.empty(), false, "a shell answer is not an empty company");
  context.state = { read: "failed" };
  assert.equal(context.empty(), false);
  context.state = { read: "empty", rooms: [] };
  assert.equal(context.empty(), true, "a read that found nothing is empty");
  assert.match(page, /firstEmpty && !state\) firstEmpty\.hidden = true/, "a failed first read hides the server-painted empty card");
});

test("demo home: the checklist marks the calendar from the board's per-person grant check", async () => {
  const page = await consolePage();
  const nodes = {};
  const node = (id, cls = []) => {
    const classes = new Set(cls);
    const el = {
      id, textContent: "", hidden: false, style: {}, removed: false,
      classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
      querySelector: (sel) => el.children[sel] || null,
      remove() { el.removed = true; delete calendar.children[".check-go"]; },
      children: {},
    };
    nodes[id] = el;
    return el;
  };
  const calendar = node("checklist-calendar", ["check-item"]);
  calendar.children[".check-title"] = { textContent: "Connect your calendar" };
  calendar.children[".check-state"] = { textContent: "To do" };
  calendar.children[".check-go"] = { remove() { delete calendar.children[".check-go"]; } };
  const card = node("home-checklist");
  card.querySelectorAll = (sel) => [calendar].filter((item) => sel === ".check-item" || item.classList.contains("done"));
  node("checklist-count");
  node("checklist-bar");
  const context = { state: { doors: { calendar: true } }, document: { getElementById: (id) => nodes[id] || null }, Math };
  vm.runInNewContext(`${grabFrom(page, "paintChecklist")}\nthis.paint = paintChecklist;`, context);
  context.paint(false, false);
  assert.equal(calendar.classList.contains("done"), true);
  assert.equal(calendar.children[".check-title"].textContent, "Calendar connected");
  assert.equal(calendar.children[".check-state"].textContent, "Done");
  assert.equal(nodes["checklist-count"].textContent, "1 of 1 done");
});

test("demo home: a granted calendar is remembered briefly so a slow grant read does not print 'Connect your calendar'", async () => {
  let reads = 0;
  let slow = false;
  const googleGrants = {
    async granted() {
      reads += 1;
      if (slow) await new Promise((resolve) => setTimeout(resolve, 2000));
      return true;
    },
  };
  // The helper both the page render and the board's door check use.
  const { personCalendarGranted } = await import("../src/server.js");
  const workspace = { googleGrants };
  assert.equal(await personCalendarGranted(workspace, "t1", "p1"), true);
  slow = true;
  const started = Date.now();
  assert.equal(await personCalendarGranted(workspace, "t1", "p1"), true);
  assert.equal(Date.now() - started < 500, true, "the cached grant answers at once");
  assert.equal(reads, 1);
  googleGrants.granted = async () => false;
  assert.equal(await personCalendarGranted(workspace, "t1", "p2"), false, "a missing grant is read every time");
  assert.equal(workspace.calendarGrantCache.has("t1:p2"), false);
});
