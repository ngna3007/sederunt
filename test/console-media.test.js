import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { sealSession } from "../src/console-auth.js";
import { mediaFromBot } from "../src/meeting/recall.js";
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
});

test("bot media keeps the download urls and names processing, expiry, and a missing recording", () => {
  const ready = mediaFromBot(botPayload(), Date.parse("2026-11-03T00:00:00.000Z"));
  assert.equal(ready.state, "ready");
  assert.equal(ready.videoUrl, "https://example.test/mixed.mp4");
  assert.equal(ready.timelineUrl, "https://example.test/timeline.json");
  assert.equal(ready.title, "Booth planning");
  assert.equal(ready.duration, 184);
  const processing = mediaFromBot(botPayload({
    recordings: [{ status: { code: "processing" }, media_shortcuts: {} }],
  }));
  assert.equal(processing.state, "processing");
  const expired = mediaFromBot({ message: "Media has already expired", recordings: [] });
  assert.equal(expired.state, "expired");
  assert.equal(expired.videoUrl, "");
  assert.equal(mediaFromBot({ id: "bot", recordings: [], status_changes: [{ code: "done" }] }).state, "none");
});

test("room media requires the console session and does not return the recall key", async () => {
  const app = createApp({
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
