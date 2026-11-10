import assert from "node:assert/strict";
import test from "node:test";
import {
  clipSpoken,
  finishSpokenReply,
  lineHoldMs,
  meetingContext,
  rememberMeetingExchange,
  rememberMeetingLine,
} from "../src/meeting/speech-gate.js";
import { meetingLineShouldAnswer, refreshMeetingFloor } from "../src/meeting/voice.js";

test("a finished line waits 1.2s and a dangling word waits 2.5s", () => {
  assert.equal(lineHoldMs("hey adam what can you do"), 1200);
  assert.equal(lineHoldMs("at 7 pm today about"), 2500);
  assert.equal(lineHoldMs("set a reminder and"), 2500);
  assert.equal(lineHoldMs("what time?"), 1200);
});

test("a sentence inside 20 seconds does not need the name, and one after does", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const room = { id: "bot-1" };
  refreshMeetingFloor(session, { text: "hey adam", room, memberId: "100", speakerName: "Anh" });
  assert.equal(session.meetingFloor.until, 1_700_000_000_000 + 20_000);
  t.mock.timers.setTime(1_700_000_000_000 + 19_000);
  const follow = { text: "set it for 7 pm today", room, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(session, follow), true);
  t.mock.timers.setTime(1_700_000_000_000 + 20_001);
  assert.equal(meetingLineShouldAnswer(session, follow), false);
  t.mock.timers.reset();
});

test("spoken text is at most two English sentences, and the garbage lines are silent", () => {
  assert.equal(clipSpoken("vang toji stanglen genocra"), "");
  assert.equal(clipSpoken("ciao a nguyen mstanding nekha de high"), "");
  assert.equal(clipSpoken("Yes, I can hear you.", { priorHear: true }), "");
  assert.equal(clipSpoken("Yes, I can hear you."), "Yes, I can hear you.");
  assert.equal(clipSpoken("hey adam"), "");
  const glued = clipSpoken("Got it Amy. Yes, I can hear you. I can take notes and set a reminder.");
  assert.equal(glued.includes("hear you"), false);
  assert.equal(glued, "Got it Amy. I can take notes and set a reminder.");
  assert.equal(
    clipSpoken("The launch is Thursday. The booth opens at nine. I can take notes and set a reminder."),
    "The launch is Thursday. The booth opens at nine.",
  );
  assert.equal(clipSpoken("Done. The write ran."), "Done. The write ran.");
  assert.equal(
    clipSpoken("Not done. It needs approval before it runs."),
    "Not done. It needs approval before it runs.",
  );
  assert.equal(clipSpoken("Set a reminder."), "Set a reminder.");
  assert.equal(clipSpoken("Booked for tonight."), "Booked for tonight.");
  assert.equal(
    clipSpoken("You picked Postgres for the billing service."),
    "You picked Postgres for the billing service.",
  );
  assert.equal(clipSpoken("Assigned to Rowan."), "Assigned to Rowan.");
  assert.equal(
    clipSpoken("Mina said the billing service moves to Postgres."),
    "Mina said the billing service moves to Postgres.",
  );
  assert.equal(clipSpoken("The Saturn demo stays on the calendar."), "The Saturn demo stays on the calendar.");
  assert.equal(clipSpoken("I'm here."), "I'm here.");
  assert.equal(clipSpoken("I could not answer that just now."), "I could not answer that just now.");
  assert.equal(clipSpoken("Bạn muốn họp lúc mấy giờ?"), "");
  const breath = clipSpoken("got it amy… ready to help… yes i can hear you… I can take notes, summarize, set reminders…");
  assert.equal(/hear you/i.test(breath), false);
  assert.match(breath, /got it amy/i);
  assert.match(breath, /ready to help/i);
  const comma = clipSpoken("Got it Amy, yes I can hear you, I can take notes and set a reminder.");
  assert.equal(/hear you/i.test(comma), false);
  assert.match(comma, /Got it Amy/);
  assert.match(comma, /take notes and set a reminder/);
});

test("a second request still has the 7pm time and the invite, and does not ask again", () => {
  const session = {
    rooms: [{ id: "bot-saturn", kind: "meeting", platform: "Google Meet", botPresent: true }],
  };
  rememberMeetingLine(session, "bot-saturn", { speaker: "You", text: "set a meeting at 7 pm today about the Saturn demo" });
  rememberMeetingLine(session, "bot-saturn", { speaker: "You", text: "invite me only" });
  rememberMeetingExchange(session, "bot-saturn", { user: "invite me only", assistant: "Okay, I am waiting." });
  const memory = meetingContext(session, "bot-saturn");
  assert.match(memory.kept.map((line) => line.text).join("\n"), /7 pm today/);
  assert.match(memory.kept.map((line) => line.text).join("\n"), /invite me only/);
  assert.equal(memory.exchanges.length, 1);
  const spoken = finishSpokenReply(
    "What about the meeting? Who should I invite and what time? The Saturn demo stays on the calendar.",
    memory,
  );
  assert.equal(spoken, "What about the meeting? Who should I invite and what time?");
  assert.equal(session.rooms[0].lines.length, 2);
  assert.equal(session.rooms[0].exchanges.length, 1);
});

test("a saved time and an only-me phrase do not rewrite the reply", () => {
  const memory = {
    kept: [
      { speaker: "You", text: "at 8 pm today" },
      { speaker: "You", text: "invite only you" },
    ],
    exchanges: [],
  };
  const spoken = finishSpokenReply("Who should I invite and what time? Booked for tonight.", memory);
  assert.equal(spoken, "Who should I invite and what time? Booked for tonight.");
});

