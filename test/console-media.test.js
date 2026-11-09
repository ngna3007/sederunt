import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { sealSession } from "../src/console-auth.js";
import { mediaFromBot, transcriptLines } from "../src/meeting/recall.js";
import { createApp } from "../src/server.js";
import { rankDecisions } from "../src/console-page.js";

const SECRET = "fixture-passphrase";
const KEY = "recall-key-sentinel";

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function botPayload(patch = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    recordings: [{
      started_at: "2026-11-02T10:29:18.000Z",
      completed_at: "2026-11-02T10:32:22.000Z",
      expires_at: "2026-12-02T10:32:22.000Z",
      status: { code: "done" },
      media_shortcuts: {
        video_mixed: { status: { code: "done" }, data: { download_url: "https://example.test/mixed.mp4" }, format: "mp4" },
        transcript: { data: { download_url: "https://example.test/transcript.json" } },
        participant_events: {
          data: {
            participants_download_url: "https://example.test/participants.json",
            participant_events_download_url: "https://example.test/events.json",
            speaker_timeline_download_url: "https://example.test/timeline.json",
          },
        },
        meeting_metadata: { data: { download_url: "https://example.test/meta.json", title: "Booth planning" } },
      },
    }],
    ...patch,
  };
}

test("a question about a room returns every decision in that room", () => {
  const decisions = [
    { roomId: "offsite", text: "The offsite is in Da Lat for three nights, from the second to the fifth.", spokenAt: "2026-11-03T01:00:00.000Z" },
    { roomId: "offsite", text: "Each team gets a travel budget of four hundred dollars per person.", spokenAt: "2026-11-03T02:00:00.000Z" },
    { roomId: "offsite", text: "Catering is vegetarian by default with a meat option on request.", spokenAt: "2026-11-03T03:00:00.000Z" },
    { roomId: "booth", text: "The booth opens at nine.", spokenAt: "2026-11-03T04:00:00.000Z" },
  ];
  const result = rankDecisions("what did we decide about the offsite?", decisions, [
    { id: "offsite", platform: "Zoom" },
    { id: "booth", platform: "Google Meet" },
  ]);
  assert.equal(result.cites.length, 3);
  assert.equal(result.cites.some((cite) => cite.text.includes("Da Lat")), true);
  assert.equal(result.cites.some((cite) => cite.text.includes("travel budget")), true);
  assert.equal(result.cites.some((cite) => cite.text.includes("Catering")), true);
  assert.equal(result.answer.includes("(in "), false);
  assert.equal(result.cites.some((cite) => cite.roomId === "booth"), false);
});

test("a question that names a room returns only that room", () => {
  const decisions = [
    { roomId: "offsite", text: "The offsite is in Da Lat for three nights.", spokenAt: "2026-11-03T01:00:00.000Z" },
    { roomId: "offsite", text: "Catering is vegetarian by default.", spokenAt: "2026-11-03T02:00:00.000Z" },
    { roomId: "booth", text: "The booth opens at nine.", spokenAt: "2026-11-03T04:00:00.000Z" },
    { roomId: "booth", text: "Badge pickup is at the north entrance.", spokenAt: "2026-11-03T05:00:00.000Z" },
  ];
  const rooms = [
    { id: "offsite", name: "Quarterly planning offsite: venue, catering, travel and budget sync in Da Lat", platform: "Zoom" },
    { id: "booth", name: "Booth planning", platform: "Google Meet" },
  ];
  const result = rankDecisions("What did Booth planning decide?", decisions, rooms);
  assert.equal(result.cites.length, 2);
  assert.equal(result.cites.every((cite) => cite.roomId === "booth"), true);
  assert.equal(result.answer.includes("Da Lat"), false);
  assert.equal(result.answer.includes("Catering"), false);
  assert.match(result.cites[0].label, /Booth planning/);
  assert.doesNotMatch(result.cites[0].label, /opens at/);
});

test("a room answer says when its decisions clash", () => {
  const result = rankDecisions("What did Booth planning decide?", [
    { roomId: "booth", text: "The booth opens at ten", status: "clashing", spokenAt: "2026-11-03T04:00:00.000Z" },
    { roomId: "booth", text: "The booth opens at nine", status: "clashing", spokenAt: "2026-11-03T05:00:00.000Z" },
  ], [{ id: "booth", name: "Booth planning" }]);
  assert.match(result.answer, /These decisions clash/);
  assert.match(result.answer, /opens at ten\./);
});

test("bot media keeps the download urls and names processing, expiry, and a missing recording", () => {
  const ready = mediaFromBot(botPayload(), Date.parse("2026-11-03T00:00:00.000Z"));
  assert.equal(ready.state, "ready");
  assert.equal(ready.videoUrl, "https://example.test/mixed.mp4");
  assert.equal(ready.timelineUrl, "https://example.test/timeline.json");
  assert.equal(ready.title, "Booth planning");
  assert.equal(ready.duration, 184);
  assert.equal(ready.call, "done");
  const processing = mediaFromBot(botPayload({
    recordings: [{ status: { code: "processing" }, media_shortcuts: {} }],
  }));
  assert.equal(processing.state, "processing");
  const expired = mediaFromBot({ message: "Media has already expired", recordings: [] });
  assert.equal(expired.state, "expired");
  assert.equal(expired.videoUrl, "");
  assert.equal(mediaFromBot({ id: "bot", recordings: [], status_changes: [{ code: "done" }] }).state, "none");
});

test("a finished Meet is Done and keeps Recall's video", () => {
  const media = mediaFromBot({
    id: "efb230d9-e9db-41b0-846a-27f6b445be58",
    meeting_url: { meeting_id: "qag-mnzm-gzv", platform: "google_meet" },
    join_at: "2026-11-09T15:40:49.635519Z",
    status_changes: [
      { code: "joining_call" },
      { code: "in_waiting_room" },
      { code: "in_call_not_recording" },
      { code: "in_call_recording" },
      { code: "call_ended", sub_code: "timeout_exceeded_everyone_left" },
      { code: "done" },
    ],
    recordings: [{
      started_at: "2026-11-09T15:40:54.000Z",
      completed_at: "2026-11-09T15:41:37.000Z",
      status: { code: "done" },
      media_shortcuts: {
        video_mixed: { data: { download_url: "https://example.test/mixed.mp4" } },
        transcript: { data: { download_url: "https://example.test/transcript.json" } },
      },
    }],
  }, Date.parse("2026-11-10T00:00:00.000Z"));
  assert.equal(media.call, "done");
  assert.equal(media.state, "ready");
  assert.equal(media.videoUrl, "https://example.test/mixed.mp4");
  assert.equal(media.duration, 43);
  assert.equal(media.endedNote, "Everyone left, so the guest left.");
  const stillLive = mediaFromBot({
    status_changes: [{ code: "in_call_recording" }],
    recordings: [{ status: { code: "processing" }, media_shortcuts: {} }],
  });
  assert.equal(stillLive.call, "in_call_recording");
  assert.equal(stillLive.state, "processing");
  const fileReady = mediaFromBot({
    status_changes: [{ code: "in_call_recording" }],
    recordings: [{
      started_at: "2026-11-09T15:40:54.000Z",
      completed_at: "2026-11-09T15:41:37.000Z",
      status: { code: "done" },
      media_shortcuts: { video_mixed: { data: { download_url: "https://example.test/mixed.mp4" } } },
    }],
  });
  assert.equal(fileReady.call, "done");
  assert.equal(fileReady.state, "ready");
});

test("a Recall transcript becomes spoken lines with times", () => {
  const lines = transcriptLines([
    {
      participant: { id: 100, name: "Anh Nguyễn" },
      words: [
        { text: "hey", start_timestamp: { relative: 4.0 }, end_timestamp: { relative: 4.2 } },
        { text: "hey", start_timestamp: { relative: 4.3 }, end_timestamp: { relative: 4.5 } },
        { text: "adam", start_timestamp: { relative: 4.6 }, end_timestamp: { relative: 4.9 } },
      ],
    },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].speaker, "Anh Nguyễn");
  assert.equal(lines[0].text, "hey hey adam");
  assert.equal(lines[0].start, 4);
  assert.equal(lines[0].end, 4.9);
});

test("an opened meeting with no decision still plays the Recall recording", async () => {
  const session = (await import("../src/session.js")).createSession();
  const id = "11111111-1111-1111-1111-111111111111";
  session.rooms.push({ id, kind: "meeting", platform: "Google Meet", botPresent: true, call: "done" });
  session.readReport = { ok: true, empty: false };
  const app = createApp({
    companyLoaded: true,
    session,
    env: { RECALL_API_KEY: KEY, SEDERUNT_MEMBER: "mina" },
    deps: { memory: { async index() { return []; }, async recall() { return []; }, async remember() { return { blobId: null }; } } },
    recall: { async readBot() { return botPayload(); } },
    fetch: async (url) => {
      if (String(url) === "https://example.test/transcript.json") {
        return new Response(JSON.stringify([
          { participant: { name: "Anh Nguyễn" }, words: [{ text: "hey", start_timestamp: { relative: 1 }, end_timestamp: { relative: 1.4 } }, { text: "adam", start_timestamp: { relative: 1.5 }, end_timestamp: { relative: 1.8 } }] },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("no", { status: 404 });
    },
  });
  const port = await listen(app);
  try {
    const board = await fetch(`http://127.0.0.1:${port}/api/console?member=mina`);
    const listed = await board.json();
    assert.equal(listed.rooms.some((room) => room.id === id), true);
    assert.equal(listed.rooms.find((room) => room.id === id).call, "done");
    const media = await fetch(`http://127.0.0.1:${port}/console/rooms/${id}/media?member=mina`);
    assert.equal(media.status, 200);
    const body = await media.json();
    assert.equal(body.videoUrl, "https://example.test/mixed.mp4");
    assert.equal(body.call, "done");
    assert.equal(body.lines[0].text, "hey adam");
    assert.equal(body.lines[0].speaker, "Anh Nguyễn");
    const hidden = await fetch(`http://127.0.0.1:${port}/console/rooms/22222222-2222-4222-8222-222222222222/media?member=mina`);
    assert.equal(hidden.status, 404);
  } finally {
    app.close();
  }
});

test("the room list does not wait for Recall", async () => {
  const session = (await import("../src/session.js")).createSession();
  session.rooms.push({ id: "11111111-1111-1111-1111-111111111111", kind: "meeting", platform: "Zoom", botPresent: true });
  session.decisions.push({
    id: "d1",
    account: "company",
    kind: "decision",
    text: "Kept.",
    roomId: "11111111-1111-1111-1111-111111111111",
    inviteMemberIds: ["mina"],
    speakerMemberId: "mina",
    spokenAt: "2026-11-03T08:00:00.000Z",
    deleted: false,
  });
  let started = 0;
  const app = createApp({
    companyLoaded: true,
    session,
    env: { RECALL_API_KEY: KEY, SEDERUNT_MEMBER: "mina" },
    deps: { memory: { async index() { return []; }, async recall() { return []; } } },
    recall: { async readBot() { started += 1; await new Promise(() => {}); } },
  });
  const port = await listen(app);
  try {
    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}/api/console?member=mina`);
    const elapsed = Date.now() - startedAt;
    assert.equal(response.status, 200);
    assert.ok(elapsed < 1500, `list waited ${elapsed}ms`);
    const body = await response.json();
    assert.equal(body.rooms[0].startedAt || "", "");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(started, 0);
  } finally {
    app.close();
  }
});

test("the room list does not call Recall and room media stores the start", async () => {
  const session = (await import("../src/session.js")).createSession();
  const id = "11111111-1111-1111-1111-111111111111";
  session.rooms.push({ id, kind: "meeting", platform: "Zoom", botPresent: true });
  session.decisions.push({
    id: "d1",
    account: "company",
    kind: "decision",
    text: "Kept.",
    roomId: id,
    inviteMemberIds: ["mina"],
    speakerMemberId: "mina",
    spokenAt: "2026-11-03T08:00:00.000Z",
    deleted: false,
  });
  let reads = 0;
  const remembered = [];
  const app = createApp({
    companyLoaded: true,
    session,
    env: { RECALL_API_KEY: KEY, SEDERUNT_MEMBER: "mina" },
    deps: {
      memory: {
        async index() { return []; },
        async recall() { return []; },
        async remember(input) { remembered.push(input); return { blobId: null }; },
      },
    },
    recall: { async readBot() { reads += 1; return botPayload(); } },
  });
  const port = await listen(app);
  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/console?member=mina`);
    assert.equal(first.status, 200);
    const listed = await first.json();
    assert.equal(listed.rooms[0].startedAt || "", "");
    assert.equal(reads, 0);
    const media = await fetch(`http://127.0.0.1:${port}/console/rooms/${id}/media`);
    assert.equal(media.status, 200);
    const body = await media.json();
    assert.equal(body.startedAt, "2026-11-02T10:29:18.000Z");
    assert.equal(reads, 1);
    const second = await fetch(`http://127.0.0.1:${port}/api/console?member=mina`);
    const again = await second.json();
    assert.equal(again.rooms[0].startedAt, "2026-11-02T10:29:18.000Z");
    assert.equal(reads, 1);
    assert.equal(remembered.some((item) => item?.room?.startedAt === "2026-11-02T10:29:18.000Z"), true);
  } finally {
    app.close();
  }
});

test("room media requires the console session and does not return the recall key", async () => {
  const session = (await import("../src/session.js")).createSession();
  session.decisions.push({ id: "d1", roomId: "11111111-1111-1111-1111-111111111111", text: "Kept.", account: "company", inviteMemberIds: ["Mina"] });
  const app = createApp({
    session,
    companyLoaded: true,
    env: { SEDERUNT_MEMBER: "Mina", SEDERUNT_CONSOLE_SECRET: SECRET, RECALL_API_KEY: KEY },
    deps: {
      recall: {
        async readBot() {
          return botPayload();
        },
      },
    },
  });
  const port = await listen(app);
  try {
    const closed = await fetch(`http://127.0.0.1:${port}/console/rooms/booth/media`);
    assert.equal(closed.status, 401);
    const token = sealSession({ memberId: "Mina", name: "Mina", exp: Date.now() + 60_000 }, SECRET);
    const opened = await fetch(`http://127.0.0.1:${port}/console/rooms/11111111-1111-1111-1111-111111111111/media`, {
      headers: { cookie: `sederunt_session=${encodeURIComponent(token)}` },
    });
    assert.equal(opened.status, 200);
    const raw = await opened.text();
    assert.equal(raw.includes(KEY), false);
    assert.equal(raw.includes("Token "), false);
    const body = JSON.parse(raw);
    assert.equal(body.state, "ready");
    assert.equal(body.videoUrl, "https://example.test/mixed.mp4");
    assert.equal(body.title, "Booth planning");
  } finally {
    app.close();
  }
});
