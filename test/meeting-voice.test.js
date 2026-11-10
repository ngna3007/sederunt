import assert from "node:assert/strict";
import test from "node:test";
import { claimMeetingEvent, claimMeetingEventLocal, meetingEventKey, releaseMeetingEvent, releaseMeetingEventLocal } from "../src/meeting/events.js";
import { meetingLineClosesFloor, meetingLineShouldAnswer, noteMeetingHeard, refreshMeetingFloor } from "../src/meeting/voice.js";

test("one transcript event is claimed once per session, and Redis NX blocks the other instance", async () => {
  assert.equal(meetingEventKey("bot-1", { deliveryId: "chunk" }, "msg-1"), "bot-1:msg-1");
  assert.equal(meetingEventKey("bot-1", { deliveryId: "chunk" }, "msg-2"), "bot-1:msg-2");
  assert.equal(meetingEventKey("bot-1", { deliveryId: "evt-9" }), "bot-1:evt-9");
  assert.equal(meetingEventKey("bot-1", { memberId: "100", utteranceId: "tr:1.2" }), "bot-1:100:tr:1.2");
  assert.equal(meetingEventKey("meeting", { deliveryId: "evt-9" }), "");
  const here = {};
  const there = {};
  assert.equal(claimMeetingEventLocal(here, "bot-1:evt-9"), true);
  assert.equal(claimMeetingEventLocal(here, "bot-1:evt-9"), false);
  assert.equal(claimMeetingEventLocal(there, "bot-1:evt-9"), true);
  const seen = new Set();
  const redisEnv = { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" };
  const fetchImpl = async (url) => {
    const key = decodeURIComponent(String(url).split("/set/")[1].split("/")[0]);
    assert.match(key, /^sederunt:voice:heard:bot-1:evt-9$/);
    assert.match(String(url), /NX=true/);
    assert.match(String(url), /EX=600/);
    if (seen.has(key)) return { ok: true, async json() { return { result: null }; } };
    seen.add(key);
    return { ok: true, async json() { return { result: "OK" }; } };
  };
  assert.equal(await claimMeetingEvent(redisEnv, "bot-1:evt-9", fetchImpl), true);
  assert.equal(await claimMeetingEvent(redisEnv, "bot-1:evt-9", fetchImpl), false);
  assert.equal(await claimMeetingEvent(redisEnv, "bot-1:evt-9", async () => { throw new Error("down"); }), true);
  assert.equal(await claimMeetingEvent({}, "bot-1:evt-9", fetchImpl), true);
  releaseMeetingEventLocal(here, "bot-1:evt-9");
  assert.equal(claimMeetingEventLocal(here, "bot-1:evt-9"), true);
  const deleted = [];
  await releaseMeetingEvent(redisEnv, "bot-1:evt-9", async (url) => {
    deleted.push(String(url));
    return { ok: true, async json() { return { result: 1 }; } };
  });
  assert.match(deleted[0], /\/del\/sederunt%3Avoice%3Aheard%3Abot-1%3Aevt-9$/);
  await releaseMeetingEvent({}, "bot-1:evt-9", async () => { throw new Error("unused"); });
  await releaseMeetingEvent(redisEnv, "bot-1:evt-9", async () => { throw new Error("down"); });
  assert.equal(deleted.length, 1);
});

test("an unaddressed line and a closed hold do not call the model", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] }, hearingHold: { roomId: "bot-1", until: Date.now() - 1 } };
  assert.equal(meetingLineShouldAnswer(session, { text: "the weather is fine", room: { id: "bot-1" } }), false);
  assert.equal(meetingLineShouldAnswer(session, {
    text: "what time is the launch",
    room: { id: "bot-1" },
    addressed: false,
  }), false);
});

test("a name, a trigger, and an open hold are worth an answer", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] }, hearingHold: { roomId: "bot-1", until: Date.now() + 15000 } };
  assert.equal(meetingLineShouldAnswer(session, { text: "Adam", room: { id: "bot-1" } }), true);
  assert.equal(meetingLineShouldAnswer(session, { text: "hey adam the booth opens at nine", room: { id: "bot-1" } }), true);
  assert.equal(meetingLineShouldAnswer(session, { text: "what time is the launch", room: { id: "bot-1" } }), true);
});

test("the person who called can continue, and someone else is heard but not answered", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const room = { id: "bot-1" };
  const called = { text: "Adam, what time is the launch", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, called), true);
  refreshMeetingFloor(session, called);
  noteMeetingHeard(session, called);
  const side = { text: "the launch moved to Friday", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(session, side), false);
  noteMeetingHeard(session, side);
  assert.deepEqual(session.roomHeard, [
    "Anh: Adam, what time is the launch",
    "Lan: the launch moved to Friday",
  ]);
  const again = { text: "and who owns it", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, again), true);
  refreshMeetingFloor(session, { text: "thanks", room, memberId: "100", speakerName: "Anh" });
  assert.equal(session.meetingFloor, undefined);
  assert.equal(meetingLineShouldAnswer(session, again), false);
});

test("a backchannel is not a turn, and only the caller's thanks closes the floor", () => {
  const session = {
    hearing: { name: "Sederunt", triggers: ["hey sederunt"] },
    hearingHold: { roomId: "bot-1", until: Date.now() + 15_000 },
  };
  const room = { id: "bot-1" };
  const called = { text: "Sederunt, what time is the launch", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, called), true);
  refreshMeetingFloor(session, called);
  const until = session.meetingFloor.until;
  const okay = { text: "okay Sederunt", room, memberId: "100", speakerName: "Anh" };
  const leading = { text: "Sederunt, yeah", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, okay), false);
  assert.equal(meetingLineShouldAnswer(session, leading), false);
  refreshMeetingFloor(session, okay);
  assert.equal(session.meetingFloor.until, until);
  assert.equal(session.meetingFloor.speaker, "id:100");
  const sameName = { text: "and who owns it", room, memberId: "200", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, sameName), false);
  const sideThanks = { text: "thanks", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineClosesFloor(session, sideThanks), false);
  refreshMeetingFloor(session, sideThanks);
  assert.equal(session.meetingFloor.speaker, "id:100");
  const namedThanks = { text: "thanks, Sederunt", room, memberId: "200", speakerName: "Lan", partial: true };
  assert.equal(meetingLineClosesFloor(session, namedThanks), false);
  const yes = { text: "yes", room, memberId: "100", speakerName: "Anh" };
  const wait = { text: "wait", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, yes), true);
  assert.equal(meetingLineShouldAnswer(session, wait), true);
  const close = { text: "thanks, Sederunt", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(session, close), false);
  assert.equal(meetingLineClosesFloor(session, close), true);
  refreshMeetingFloor(session, close);
  assert.equal(session.meetingFloor, undefined);
  assert.equal(session.hearingHold, undefined);
  assert.equal(meetingLineShouldAnswer(session, { text: "and who owns it", room, memberId: "100", speakerName: "Anh" }), false);
});

test("a line with no participant id continues by name", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const room = { id: "bot-1" };
  const called = { text: "Adam, what time is the launch", room, speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(session, called), true);
  refreshMeetingFloor(session, called);
  assert.equal(session.meetingFloor.speaker, "name:lan");
  assert.equal(meetingLineShouldAnswer(session, { text: "and who owns it", room, speakerName: "Lan" }), true);
  assert.equal(meetingLineShouldAnswer(session, { text: "and who owns it", room, speakerName: "Minh" }), false);
});

test("wait stays a request, and thanks with the name still closes", () => {
  const room = { id: "bot-1" };
  const adam = {
    hearing: { name: "Adam", triggers: ["hey adam"] },
    meetingFloor: { roomId: "bot-1", speaker: "id:100", until: Date.now() + 90_000 },
  };
  const dotted = { text: "thanks Adam.", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(adam, dotted), false);
  assert.equal(meetingLineClosesFloor(adam, dotted), true);
  assert.equal(meetingLineShouldAnswer(adam, { text: "wait Adam, okay", room, memberId: "100", speakerName: "Anh" }), true);
  const jane = {
    hearing: { name: "Mary Jane" },
    meetingFloor: { roomId: "bot-1", speaker: "id:100", until: Date.now() + 90_000 },
  };
  const thanksJane = { text: "thanks Mary Jane", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(jane, thanksJane), false);
  assert.equal(meetingLineClosesFloor(jane, thanksJane), true);
});

test("a short hold stays with the caller, and a line with no speaker still enters", () => {
  const room = { id: "bot-1" };
  const session = {
    hearing: { name: "Adam", triggers: ["hey adam"] },
    hearingHold: { roomId: "bot-1", speaker: "id:100", until: Date.now() + 15_000 },
  };
  assert.equal(meetingLineShouldAnswer(session, { text: "what time is the launch", room, memberId: "200", speakerName: "Lan" }), false);
  assert.equal(meetingLineShouldAnswer(session, { text: "what time is the launch", room }), true);
  assert.equal(meetingLineShouldAnswer(session, { text: "what time is the launch", room, memberId: "100", speakerName: "Anh" }), true);
});

test("a backchannel stays out of the model context", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] }, roomHeard: [] };
  const room = { id: "bot-1" };
  noteMeetingHeard(session, { text: "okay", room, memberId: "100", speakerName: "Anh" });
  noteMeetingHeard(session, { text: "the launch moved", room, memberId: "200", speakerName: "Lan" });
  noteMeetingHeard(session, { text: "I can hear you", room, speakerName: "Adam" });
  assert.deepEqual(session.roomHeard, ["Lan: the launch moved"]);
});

test("the guest's own line does not take the floor", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const room = { id: "bot-1" };
  const own = { text: "the launch is Thursday", room, memberId: "9", speakerName: "Adam" };
  assert.equal(meetingLineShouldAnswer(session, own), false);
  assert.equal(meetingLineClosesFloor(session, { ...own, text: "thanks" }), false);
  refreshMeetingFloor(session, own);
  assert.equal(session.meetingFloor, undefined);
});
