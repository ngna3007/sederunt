import assert from "node:assert/strict";
import test from "node:test";
import {
  clipSpoken,
  claimMeetingSpeech,
  finishSpokenReply,
  meetingContext,
  meetingSpeechBook,
  rememberMeetingExchange,
  rememberMeetingLine,
  scheduleMeetingSpeech,
  speechBufferOpen,
  speechSpeakerKey,
} from "../src/meeting/speech-gate.js";
import { meetingLineJoinsOpenTurn, meetingLineShouldAnswer, refreshMeetingFloor, speakMeetingTurn } from "../src/meeting/voice.js";

const env = {
  OPENROUTER_API_KEY: "sk-test-voice",
  OPENROUTER_VOICE_MODEL: "voice-model",
  RECALL_API_KEY: "recall-test-key",
};

function chat(message) {
  return { ok: true, async json() { return { choices: [{ message }] }; } };
}

function mp3Response() {
  return { ok: true, async arrayBuffer() { return Uint8Array.from([0xff, 0xfb, 0x90, 0x64]).buffer; } };
}

function scripted(respond) {
  const calls = [];
  return {
    calls,
    async fetch(url, init) {
      calls.push({ url: String(url), init });
      return respond(String(url), init, calls);
    },
  };
}

function speechInputs(calls) {
  return calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
}

test("a partial is not scheduled and a finished line waits 1.2s", () => {
  const queue = { seq: 0, speakers: {} };
  const now = 5_000;
  assert.deepEqual(
    scheduleMeetingSpeech(queue, { partial: true, text: "hey adam can you hear me", name: "Adam", speaker: "id:100" }, now),
    { release: false, holdMs: 0, generation: 0 },
  );
  const scheduled = scheduleMeetingSpeech(queue, { text: "hey adam what can you do", name: "Adam", speaker: "id:100" }, now);
  assert.equal(scheduled.holdMs, 1200);
  assert.equal(claimMeetingSpeech(queue, scheduled.generation, now + 1199), null);
  const claimed = claimMeetingSpeech(queue, scheduled.generation, now + 1200);
  assert.equal(claimed.text, "hey adam what can you do");
});

test("a line that still ends on about or and waits 2.5s", () => {
  const queue = { seq: 0, speakers: {} };
  const now = 8_000;
  const about = scheduleMeetingSpeech(queue, { text: "at 7 pm today about", name: "Adam", speaker: "id:100" }, now);
  assert.equal(about.holdMs, 2500);
  assert.equal(claimMeetingSpeech(queue, about.generation, now + 2499), null);
  assert.equal(claimMeetingSpeech(queue, about.generation, now + 2500).text, "at 7 pm today about");
  const dangling = scheduleMeetingSpeech(queue, { text: "set a reminder and", name: "Adam", speaker: "id:100" }, now + 3000);
  assert.equal(dangling.holdMs, 2500);
  assert.equal(claimMeetingSpeech(queue, dangling.generation, now + 3000 + 2500).text, "set a reminder and");
});

test("pieces from one speaker join into one turn, and another speaker or bot stays apart", () => {
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const now = 20_000;
  const adam = meetingSpeechBook(session, "bot-a");
  const other = meetingSpeechBook(session, "bot-b");
  const speaker = speechSpeakerKey({ memberId: "100", speakerName: "Anh" });
  const first = scheduleMeetingSpeech(adam, { text: "hey adam", name: "Adam", speaker }, now);
  assert.equal(first.holdMs, 1200);
  assert.equal(speechBufferOpen(adam, speaker), true);
  const question = scheduleMeetingSpeech(adam, { text: "the billing service moves to postgres", name: "Adam", speaker }, now + 400);
  assert.equal(question.holdMs, 1200);
  assert.equal(question.text, "hey adam the billing service moves to postgres");
  assert.equal(claimMeetingSpeech(adam, first.generation, now + 1200), null);
  assert.equal(claimMeetingSpeech(adam, question.generation, now + 400 + 1199), null);
  const side = speechSpeakerKey({ memberId: "200", speakerName: "Lan" });
  const sideLine = scheduleMeetingSpeech(adam, { text: "I will take the notes", name: "Adam", speaker: side }, now + 500);
  assert.equal(meetingLineJoinsOpenTurn(session, {
    text: "the billing service moves to postgres",
    speakerName: "Anh",
    memberId: "100",
    room: { id: "bot-a" },
  }, adam, speaker), true);
  assert.equal(meetingLineJoinsOpenTurn(session, {
    text: "okay",
    speakerName: "Anh",
    memberId: "100",
    room: { id: "bot-a" },
  }, adam, speaker), false);
  assert.equal(meetingLineJoinsOpenTurn(session, {
    text: "what about pricing",
    speakerName: "Lan",
    memberId: "200",
    room: { id: "bot-a" },
  }, adam, side), true);
  const claimed = claimMeetingSpeech(adam, question.generation, now + 1600);
  assert.equal(claimed.text, "hey adam the billing service moves to postgres");
  assert.equal(claimed.wake, false);
  assert.equal(speechBufferOpen(adam, speaker), false);
  assert.equal(claimMeetingSpeech(adam, sideLine.generation, now + 500 + 1200).text, "I will take the notes");
  const foreign = scheduleMeetingSpeech(other, { text: "hello there", name: "Adam", speaker }, now);
  assert.equal(claimMeetingSpeech(adam, foreign.generation, now + 5000), null);
  assert.equal(claimMeetingSpeech(other, foreign.generation, now + 1200).text, "hello there");
  assert.notEqual(adam, other);
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
  assert.equal(clipSpoken("Yes, I can hear you.", { presence: "hear" }), "Yes, I can hear you.");
  assert.equal(clipSpoken("hey adam", { presence: "wake" }), "Hey! What do you need?");
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

test("a partial produces no speech", async () => {
  const http = scripted(() => {
    throw new Error("no network");
  });
  const result = await speakMeetingTurn({
    answer: true,
    partial: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-partial" },
    session: {},
    deliveryId: "partial-1",
    env,
    fetchImpl: http.fetch,
  });
  assert.equal(result.spoke, false);
  assert.equal(http.calls.length, 0);
});

test("a bare wake is one ack, and the following question is still answered", async () => {
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => row.content).join("\n");
      assert.match(user, /what can you do/);
      return chat({ content: "I can take notes and set a reminder." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = {};
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-wake" },
    session,
    env,
    fetchImpl: http.fetch,
  };
  const wake = await speakMeetingTurn({ ...base, text: "hey adam", deliveryId: "wake-1" });
  assert.equal(wake.spoke, true);
  const question = await speakMeetingTurn({ ...base, text: "what can you do", deliveryId: "wake-2" });
  assert.equal(question.spoke, true);
  assert.deepEqual(speechInputs(http.calls), [
    "Hey! What do you need?",
    "I can take notes and set a reminder.",
  ]);
});

test("a later answer does not glue the hear-me line or speak the garbage strings", async () => {
  const replies = [
    "Got it Amy. Yes, I can hear you. I can take notes and set a reminder.",
    "vang toji stanglen genocra",
    "ciao a nguyen mstanding nekha de high",
  ];
  let step = 0;
  const http = scripted(async (url) => {
    if (url.includes("/chat/completions")) return chat({ content: replies[step++] || "" });
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = { meetingHeardCheck: true };
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    session,
    env,
    fetchImpl: http.fetch,
  };
  const glued = await speakMeetingTurn({ ...base, text: "Adam, what can you do", room: { id: "bot-glue" }, deliveryId: "glue-1" });
  assert.equal(glued.spoke, true);
  const firstGarbage = await speakMeetingTurn({ ...base, text: "Adam, what are you talking", room: { id: "bot-junk-1" }, deliveryId: "junk-1" });
  const secondGarbage = await speakMeetingTurn({ ...base, text: "Adam, say that again", room: { id: "bot-junk-2" }, deliveryId: "junk-2" });
  assert.equal(firstGarbage.spoke, false);
  assert.equal(secondGarbage.spoke, false);
  assert.deepEqual(speechInputs(http.calls), ["Got it Amy. I can take notes and set a reminder."]);
});

test("the speaker drops a hear-me phrase glued into one breath and still says a short reply", async () => {
  const replies = [
    "got it amy… ready to help… yes i can hear you… I can take notes, summarize, set reminders…",
    "Got it Amy, yes I can hear you, I can take notes and set a reminder.",
    "Set a reminder.",
    "Booked for tonight.",
  ];
  let step = 0;
  const http = scripted(async (url) => {
    if (url.includes("/chat/completions")) return chat({ content: replies[step++] || "" });
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    session: { meetingHeardCheck: true },
    env,
    fetchImpl: http.fetch,
  };
  const breath = await speakMeetingTurn({ ...base, text: "Adam, what can you do", room: { id: "bot-breath" }, deliveryId: "breath-1" });
  const comma = await speakMeetingTurn({ ...base, text: "Adam, say that again", room: { id: "bot-comma" }, deliveryId: "comma-1" });
  const reminder = await speakMeetingTurn({ ...base, text: "Adam, set a reminder", room: { id: "bot-reminder" }, deliveryId: "reminder-1" });
  const booked = await speakMeetingTurn({ ...base, text: "Adam, book tonight", room: { id: "bot-booked" }, deliveryId: "booked-1" });
  assert.equal(breath.spoke, true);
  assert.equal(comma.spoke, true);
  assert.equal(reminder.spoke, true);
  assert.equal(booked.spoke, true);
  const said = speechInputs(http.calls);
  assert.equal(said.some((line) => /hear you/i.test(line)), false);
  assert.match(said[0], /got it amy/i);
  assert.match(said[0], /ready to help/i);
  assert.match(said[1], /Got it Amy/);
  assert.match(said[1], /take notes and set a reminder/);
  assert.equal(said[2], "Set a reminder.");
  assert.equal(said[3], "Booked for tonight.");
});

test("a held write is spoken as needing approval", async () => {
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const tools = body.messages.filter((row) => row.role === "tool").map((row) => String(row.content || "")).join("\n");
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      if (tools.includes("needs approval")) return chat({ content: "Okay." });
      if (user.includes("hold this")) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-write",
            type: "function",
            function: { name: "act", arguments: JSON.stringify({ text: user }) },
          }],
        });
      }
      return chat({ content: "Okay." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const held = await speakMeetingTurn({
    answer: true,
    text: "Adam, hold this meeting for 7 pm",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-held" },
    session: {},
    deliveryId: "held-1",
    env,
    fetchImpl: http.fetch,
    runTool: async () => ({ held: true, needsConfirmation: true }),
  });
  assert.equal(held.spoke, true);
  assert.deepEqual(speechInputs(http.calls), ["One moment.", "Not done. It needs approval before it runs."]);
});

test("a second reply still carries the saved lines", async () => {
  const session = {
    rooms: [{ id: "bot-saturn", kind: "meeting", platform: "Google Meet", botPresent: true, call: "in_call_recording" }],
  };
  rememberMeetingLine(session, "bot-saturn", { speaker: "You", text: "set a meeting at 7 pm today about the Saturn demo" });
  rememberMeetingLine(session, "bot-saturn", { speaker: "You", text: "invite me only" });
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const system = body.messages.find((row) => row.role === "system")?.content || "";
      assert.match(system, /7 pm today/);
      assert.match(system, /invite me only/);
      return chat({ content: "What about the meeting? Who should I invite and what time? The Saturn demo stays on the calendar." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, what about the meeting",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-saturn" },
    session,
    deliveryId: "saturn-2",
    env,
    fetchImpl: http.fetch,
  });
  assert.equal(result.spoke, true);
  const said = speechInputs(http.calls);
  assert.equal(said.length, 1);
  assert.equal(said[0], "What about the meeting? Who should I invite and what time?");
  const again = meetingContext(session, "bot-saturn");
  assert.equal(again.exchanges.length, 1);
  assert.match(again.kept.map((line) => line.text).join("\n"), /7 pm today/);
  assert.match(again.kept.map((line) => line.text).join("\n"), /invite me only/);
});

test("a saved time does not delete the model's question", async () => {
  const session = {
    rooms: [{ id: "bot-eight", kind: "meeting", platform: "Google Meet", botPresent: true, call: "in_call_recording" }],
  };
  rememberMeetingLine(session, "bot-eight", { speaker: "You", text: "at 8 pm today" });
  rememberMeetingLine(session, "bot-eight", { speaker: "You", text: "invite only you" });
  const http = scripted(async (url) => {
    if (url.includes("/chat/completions")) {
      return chat({ content: "Who should I invite and what time? Booked for tonight." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, what about the meeting",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-eight" },
    session,
    deliveryId: "eight-1",
    env,
    fetchImpl: http.fetch,
  });
  assert.equal(result.spoke, true);
  const said = speechInputs(http.calls);
  assert.deepEqual(said, ["Who should I invite and what time? Booked for tonight."]);
});
