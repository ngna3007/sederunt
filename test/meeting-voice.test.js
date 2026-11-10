import assert from "node:assert/strict";
import test from "node:test";
import { applyPlayedFloor, meetingLineClosesFloor, meetingLineShouldAnswer, meetingToolArguments, noteMeetingHeard, refreshMeetingFloor, speakMeetingTurn, spokenLine } from "../src/meeting/voice.js";

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

test("recall and act keep the transcript member and drop a model member id", () => {
  const recall = meetingToolArguments("recall", { text: "launch date", memberId: "hacker" }, "100", { id: "bot-1" });
  assert.equal(recall.memberId, "100");
  assert.deepEqual(recall.participants, ["100"]);
  assert.equal(recall.text, "launch date");
  const custom = meetingToolArguments("notes__search", { query: "d7", memberId: "hacker", token: "secret" }, "100", { id: "bot-1" });
  assert.deepEqual(custom, { query: "d7" });
});

test("the meeting voice tries the fast tool model, then the other vendor", async () => {
  const seen = [];
  const http = scripted((url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      seen.push(body);
      if (body.model === "google/gemini-2.5-flash-lite") return { ok: false, async text() { return ""; } };
      return chat({ content: "The launch is Thursday." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, when is the launch",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-model" },
    session: { hearing: { name: "Adam", triggers: ["hey adam"] } },
    deliveryId: "model-1",
    env: { OPENROUTER_API_KEY: "sk-test-voice", RECALL_API_KEY: "recall-test-key" },
    fetchImpl: http.fetch,
  });
  assert.equal(result.spoke, true);
  assert.deepEqual(seen.map((body) => body.model), ["google/gemini-2.5-flash-lite", "openai/gpt-4.1-mini"]);
  assert.equal(seen[0].temperature, 0.2);
  assert.equal(seen[0].reasoning, undefined);
});

test("a called line speaks the model reply and can use a connected tool", async () => {
  let chats = 0;
  const seen = [];
  const http = scripted((url) => {
    if (url.includes("/chat/completions")) {
      chats += 1;
      if (chats === 1) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "notes__search", arguments: JSON.stringify({ query: "d7", memberId: "hacker" }) },
          }],
        });
      }
      return chat({ content: "The launch is Thursday." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam" }, decisions: [{ roomId: "bot-1", text: "Ship on Thursday.", account: "company" }] };
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, when is the launch?",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-1" },
    session,
    deliveryId: "voice-tool",
    env,
    fetchImpl: http.fetch,
    context: { tenantId: "northline" },
    listTools: async () => [{ name: "notes__search", description: "Search notes", inputSchema: { type: "object", properties: { query: { type: "string" } } } }],
    runTool: async (call) => {
      seen.push(call);
      return { ok: true, text: "Thursday" };
    },
  });
  assert.equal(result.spoke, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, "notes__search");
  assert.deepEqual(seen[0].arguments, { query: "d7" });
  assert.equal(seen[0].memberId, "100");
  const chatBody = JSON.parse(http.calls[0].init.body);
  assert.equal(chatBody.model, "voice-model");
  const names = chatBody.tools.map((tool) => tool.function.name);
  assert.equal(names.includes("recall"), true);
  assert.equal(names.includes("act"), true);
  assert.equal(names.includes("notes__search"), true);
  assert.equal(JSON.stringify(chatBody.tools).includes("memberId"), false);
  const speech = JSON.parse(http.calls.find((call) => call.url.includes("/audio/speech")).init.body);
  assert.equal(speech.response_format, "mp3");
  assert.equal(speech.input, "The launch is Thursday.");
  const played = http.calls.find((call) => call.url.includes("/output_audio/"));
  assert.equal(played.url, "https://ap-northeast-1.recall.ai/api/v1/bot/bot-1/output_audio/");
  assert.equal(played.init.headers.authorization, "Token recall-test-key");
  const audio = JSON.parse(played.init.body);
  assert.equal(audio.kind, "mp3");
  assert.equal(Buffer.from(audio.b64_data, "base64")[0], 0xff);
  assert.equal(played.init.body.includes("sk-test-voice"), false);
  assert.equal(speech.input.includes("recall-test-key"), false);
  assert.equal(session.lastVoiceLine, "The launch is Thursday.");
});

test("a held write is described as waiting, and the model member id is ignored", async () => {
  let chats = 0;
  const http = scripted((url, init) => {
    if (url.includes("/chat/completions")) {
      chats += 1;
      if (chats === 1) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-act",
            type: "function",
            function: { name: "act", arguments: JSON.stringify({ text: "file the ticket", memberId: "hacker" }) },
          }],
        });
      }
      const body = JSON.parse(init.body);
      assert.equal(JSON.stringify(body.messages).includes("Not done. It needs approval"), true);
      assert.equal(JSON.stringify(body.messages).includes("hacker"), false);
      return chat({ content: "I'll send that for approval." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const seen = [];
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, file the ticket",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-2" },
    session: { hearing: { name: "Adam" } },
    deliveryId: "voice-held",
    env,
    fetchImpl: http.fetch,
    runTool: async (call) => {
      seen.push(call);
      return { held: true, needsConfirmation: true, text: "Needs confirmation before act runs." };
    },
  });
  assert.equal(result.spoke, true);
  assert.equal(seen[0].arguments.memberId, "100");
  assert.equal(seen[0].arguments.text, "file the ticket");
  const speech = JSON.parse(http.calls.find((call) => call.url.includes("/audio/speech")).init.body);
  assert.equal(speech.input, "I'll send that for approval.");
});

test("the guest's own line, an echo, a missing key, and a failed clip stay quiet", async () => {
  const boom = scripted(() => { throw new Error("should not fetch"); });
  const quiet = {
    answer: true,
    text: "Adam, hello",
    speakerName: "Adam",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-3" },
    session: {},
    deliveryId: "voice-self",
    env,
    fetchImpl: boom.fetch,
  };
  assert.deepEqual(await speakMeetingTurn(quiet), { spoke: false });
  assert.deepEqual(await speakMeetingTurn({
    ...quiet,
    speakerName: "Anh",
    text: "the booth opens at nine tomorrow",
    deliveryId: "voice-echo",
    session: { lastVoiceLine: "The booth opens at nine tomorrow." },
  }), { spoke: false });
  assert.deepEqual(await speakMeetingTurn({
    ...quiet,
    speakerName: "Anh",
    text: "Adam",
    deliveryId: "voice-nokey",
    env: { RECALL_API_KEY: "recall-test-key" },
    session: {},
  }), { spoke: false });
  assert.equal(boom.calls.length, 0);

  const failedSpeech = scripted((url) => {
    if (url.includes("/chat/completions")) return chat({ content: "I'm here." });
    if (url.includes("/audio/speech")) return { ok: false, async text() { return "" } };
    throw new Error(`unexpected ${url}`);
  });
  assert.deepEqual(await speakMeetingTurn({
    answer: true,
    text: "Adam",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-4" },
    session: {},
    deliveryId: "voice-speech-fail",
    env,
    fetchImpl: failedSpeech.fetch,
  }), { spoke: false });
  assert.equal(failedSpeech.calls.some((call) => call.url.includes("/output_audio/")), false);

  const failedPlay = scripted((url) => {
    if (url.includes("/chat/completions")) return chat({ content: "I'm here." });
    if (url.includes("/audio/speech")) return mp3Response();
    return { ok: false, async text() { return "" } };
  });
  const played = await speakMeetingTurn({
    answer: true,
    text: "Adam",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-5" },
    session: {},
    deliveryId: "voice-play-fail",
    env,
    fetchImpl: failedPlay.fetch,
    wait: async () => {},
  });
  assert.deepEqual(played, { spoke: false });
  assert.equal(failedPlay.calls.filter((call) => call.url.includes("/output_audio/")).length, 4);

  let audioPosts = 0;
  const retryPlay = scripted((url) => {
    if (url.includes("/chat/completions")) return chat({ content: "Yes, I can hear you." });
    if (url.includes("/audio/speech")) return mp3Response();
    audioPosts += 1;
    return { ok: audioPosts > 1, async text() { return "" } };
  });
  const retried = await speakMeetingTurn({
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-6" },
    session: {},
    deliveryId: "voice-play-retry",
    env,
    fetchImpl: retryPlay.fetch,
    wait: async () => {},
  });
  assert.equal(retried.spoke, true);
  assert.equal(audioPosts, 2);
  assert.equal(spokenLine("See https://example.com/ticket and `the` **note**"), "See and the note");
});

test("the same delivery is spoken once", async () => {
  let chats = 0;
  const http = scripted((url) => {
    if (url.includes("/chat/completions")) {
      chats += 1;
      return chat({ content: "I'm here." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return "" } };
    throw new Error(`unexpected ${url}`);
  });
  const input = {
    answer: true,
    text: "Adam, when is the launch",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-6" },
    session: {},
    deliveryId: "voice-once",
    env,
    fetchImpl: http.fetch,
  };
  assert.equal((await speakMeetingTurn(input)).spoke, true);
  assert.equal((await speakMeetingTurn({ ...input, session: {} })).spoke, false);
  assert.equal(chats, 1);
});

test("a presence check is spoken without the model, and the same utterance is not spoken twice", async () => {
  let chats = 0;
  const http = scripted((url) => {
    if (url.includes("/chat/completions")) {
      chats += 1;
      return chat({ content: "too late" });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const input = {
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-presence" },
    session: {},
    deliveryId: "voice-presence-partial",
    utteranceId: "tr-presence:0",
    env,
    fetchImpl: http.fetch,
  };
  assert.equal((await speakMeetingTurn(input)).spoke, true);
  assert.equal((await speakMeetingTurn({
    ...input,
    deliveryId: "voice-presence-final",
    session: {},
  })).spoke, false);
  assert.equal(chats, 0);
  const speech = JSON.parse(http.calls.find((call) => call.url.includes("/audio/speech")).init.body);
  assert.equal(speech.input, "Yes, I can hear you.");
  assert.equal(http.calls.filter((call) => call.url.includes("/audio/speech")).length, 1);
});

test("an unanswered model still says it could not answer", async () => {
  const http = scripted((url) => {
    if (url.includes("/chat/completions")) return { ok: false, async text() { return "" } };
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return "" } };
    throw new Error(`unexpected ${url}`);
  });
  const result = await speakMeetingTurn({
    answer: true,
    text: "Adam, hello",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-7" },
    session: {},
    deliveryId: "voice-empty",
    env,
    fetchImpl: http.fetch,
  });
  assert.equal(result.spoke, true);
  const speech = JSON.parse(http.calls.find((call) => call.url.includes("/audio/speech")).init.body);
  assert.equal(speech.input, "I could not answer that just now.");
});

test("the floor opens when the answer is spoken", async () => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let saw = () => {};
  const ready = new Promise((resolve) => { saw = resolve; });
  const http = scripted(async (url) => {
    if (url.includes("/chat/completions")) {
      saw();
      await gate;
      return chat({ content: "The launch is Thursday." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const turn = speakMeetingTurn({
    answer: true,
    text: "Adam, when is the launch",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-floor-open" },
    session,
    deliveryId: "floor-open",
    env,
    fetchImpl: http.fetch,
  });
  await ready;
  assert.equal(session.meetingFloor, undefined);
  release();
  assert.equal((await turn).spoke, true);
  assert.equal(session.meetingFloor.speaker, "id:100");
  assert.ok(session.meetingFloor.until > Date.now());
});

test("a presence partial does not open the floor, and the final does", async () => {
  const http = scripted((url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam" } };
  const base = {
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-partial-floor" },
    session,
    utteranceId: "tr-floor",
    env,
    fetchImpl: http.fetch,
  };
  const early = await speakMeetingTurn({ ...base, partial: true, deliveryId: "partial-floor" });
  assert.equal(early.spoke, true);
  assert.equal(session.meetingFloor, undefined);
  const finalLine = await speakMeetingTurn({ ...base, deliveryId: "final-floor" });
  assert.equal(finalLine.spoke, false);
  assert.equal(session.meetingFloor.speaker, "id:100");
  const again = { hearing: { name: "Adam" } };
  const repeated = {
    ...base,
    session: again,
    room: { id: "bot-same-delivery" },
    utteranceId: "tr-same",
    deliveryId: "same-line",
  };
  assert.equal((await speakMeetingTurn({ ...repeated, partial: true })).spoke, true);
  assert.equal(again.meetingFloor, undefined);
  assert.equal((await speakMeetingTurn(repeated)).spoke, false);
  assert.equal(again.meetingFloor.speaker, "id:100");
});

test("a final does not open the floor when the answer never played", async () => {
  const http = scripted((url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: false, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const failed = {
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    env,
    fetchImpl: http.fetch,
    wait: async () => {},
  };
  const same = { hearing: { name: "Adam" } };
  const sameBase = { ...failed, session: same, room: { id: "bot-unplayed-same" }, utteranceId: "tr-unplayed-same", deliveryId: "unplayed-same" };
  assert.equal((await speakMeetingTurn({ ...sameBase, partial: true })).spoke, false);
  assert.equal(same.meetingFloor, undefined);
  assert.equal((await speakMeetingTurn(sameBase)).spoke, false);
  assert.equal(same.meetingFloor, undefined);
  const other = { hearing: { name: "Adam" } };
  const otherBase = { ...failed, session: other, room: { id: "bot-unplayed-other" }, utteranceId: "tr-unplayed-other" };
  assert.equal((await speakMeetingTurn({ ...otherBase, partial: true, deliveryId: "unplayed-partial" })).spoke, false);
  assert.equal((await speakMeetingTurn({ ...otherBase, deliveryId: "unplayed-final" })).spoke, false);
  assert.equal(other.meetingFloor, undefined);
});

test("a presence final during playback still lets the check finish", async () => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let saw = () => {};
  const ready = new Promise((resolve) => { saw = resolve; });
  const http = scripted(async (url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) {
      saw();
      await gate;
      return { ok: true, async text() { return ""; } };
    }
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam" } };
  const base = {
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-final-during-play" },
    session,
    utteranceId: "tr-during",
    env,
    fetchImpl: http.fetch,
  };
  const partial = speakMeetingTurn({ ...base, partial: true, deliveryId: "during-partial" });
  await ready;
  const finalLine = await speakMeetingTurn({ ...base, deliveryId: "during-final" });
  assert.equal(finalLine.spoke, false);
  assert.equal(session.meetingFloor, undefined);
  release();
  assert.equal((await partial).spoke, true);
  assert.equal(session.meetingFloor.speaker, "id:100");
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["Yes, I can hear you."]);
});

test("wait replaces a reply that has not been spoken", async () => {
  let releaseChat = () => {};
  const chatGate = new Promise((resolve) => { releaseChat = resolve; });
  let sawFirst = () => {};
  const firstReady = new Promise((resolve) => { sawFirst = resolve; });
  const users = [];
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      users.push(user);
      if (users.length === 1) {
        sawFirst();
        await chatGate;
        return chat({ content: "I only heard the first request." });
      }
      return chat({ content: "Okay, I am waiting." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-wait" },
    session: { hearing: { name: "Adam", triggers: ["hey adam"] } },
    env,
    fetchImpl: http.fetch,
  };
  const first = speakMeetingTurn({ ...base, text: "Adam, file a booth ticket", deliveryId: "wait-1" });
  await firstReady;
  const second = speakMeetingTurn({ ...base, text: "Adam, wait", deliveryId: "wait-2" });
  releaseChat();
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.spoke, false);
  assert.equal(newer.spoke, true);
  assert.equal(users.at(-1).includes("wait"), true);
  assert.equal(users.at(-1).includes("file a booth ticket"), false);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["Okay, I am waiting."]);
});

test("a longer line that starts with wait still joins the reply being composed", async () => {
  let releaseChat = () => {};
  const chatGate = new Promise((resolve) => { releaseChat = resolve; });
  let sawFirst = () => {};
  const firstReady = new Promise((resolve) => { sawFirst = resolve; });
  const users = [];
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      users.push(user);
      if (users.length === 1) {
        sawFirst();
        await chatGate;
        return chat({ content: "I only heard the first request." });
      }
      return chat({ content: "The other ticket is filed." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-wait-more" },
    session: { hearing: { name: "Adam", triggers: ["hey adam"] } },
    env,
    fetchImpl: http.fetch,
  };
  const first = speakMeetingTurn({ ...base, text: "Adam, file a booth ticket", deliveryId: "wait-more-1" });
  await firstReady;
  const second = speakMeetingTurn({ ...base, text: "Adam, wait, also file the other ticket", deliveryId: "wait-more-2" });
  releaseChat();
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.spoke, false);
  assert.equal(newer.spoke, true);
  assert.equal(users.some((line) => line.includes("file a booth ticket") && line.includes("file the other ticket")), true);
});

test("the same caller can continue while a reply is composing, and someone else cannot", async () => {
  const users = [];
  let releaseChat = () => {};
  let chatGate = new Promise((resolve) => { releaseChat = resolve; });
  let sawChat = () => {};
  let chatReady = new Promise((resolve) => { sawChat = resolve; });
  let releasePlay = () => {};
  let playGate = new Promise((resolve) => { releasePlay = resolve; });
  let sawPlay = () => {};
  let playReady = new Promise((resolve) => { sawPlay = resolve; });
  const arm = () => {
    chatGate = new Promise((resolve) => { releaseChat = resolve; });
    chatReady = new Promise((resolve) => { sawChat = resolve; });
    playGate = new Promise((resolve) => { releasePlay = resolve; });
    playReady = new Promise((resolve) => { sawPlay = resolve; });
  };
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      users.push(user);
      if (user.includes("file a booth ticket") && !user.includes("make it about the launch")) {
        sawChat();
        await chatGate;
        return chat({ content: "I only heard the first request." });
      }
      if (user.includes("make it about the launch")) return chat({ content: "The booth opens at nine, for the launch." });
      if (user.includes("wait")) return chat({ content: "Okay, I am waiting." });
      return chat({ content: "Okay." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) {
      sawPlay();
      await playGate;
      return { ok: true, async text() { return ""; } };
    }
    throw new Error(`unexpected ${url}`);
  });
  const hearing = { name: "Adam", triggers: ["hey adam"] };
  const joinSession = { hearing };
  const joinRoom = { id: "bot-compose-join" };
  const joinBase = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: joinRoom,
    session: joinSession,
    env,
    fetchImpl: http.fetch,
  };
  const joining = speakMeetingTurn({ ...joinBase, text: "Adam, file a booth ticket", deliveryId: "compose-join-1" });
  await chatReady;
  assert.equal(joinSession.hearingHold, undefined);
  assert.equal(joinSession.meetingFloor, undefined);
  const follow = { text: "make it about the launch", room: joinRoom, memberId: "100", speakerName: "Anh" };
  const other = { text: "make it about the launch", room: joinRoom, memberId: "200", speakerName: "Lan" };
  const elsewhere = { text: "make it about the launch", room: { id: "bot-other" }, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(joinSession, follow), true);
  assert.equal(meetingLineShouldAnswer(joinSession, { text: "wait", room: joinRoom, memberId: "100", speakerName: "Anh" }), true);
  assert.equal(meetingLineShouldAnswer(joinSession, { text: "okay", room: joinRoom, memberId: "100", speakerName: "Anh" }), false);
  assert.equal(meetingLineShouldAnswer(joinSession, other), false);
  assert.equal(meetingLineShouldAnswer(joinSession, elsewhere), false);
  assert.equal(joinSession.meetingFloor, undefined);
  const joined = speakMeetingTurn({ ...joinBase, text: follow.text, deliveryId: "compose-join-2" });
  releaseChat();
  await playReady;
  assert.equal(joinSession.meetingFloor, undefined);
  releasePlay();
  const [olderJoin, newerJoin] = await Promise.all([joining, joined]);
  assert.equal(olderJoin.spoke, false);
  assert.equal(newerJoin.spoke, true);
  assert.equal(joinSession.meetingFloor.speaker, "id:100");
  joinSession.meetingFloor.until = Date.now() - 1;
  assert.equal(meetingLineShouldAnswer(joinSession, follow), false);
  assert.equal(users.some((line) => line.includes("file a booth ticket") && line.includes("make it about the launch")), true);
  assert.equal(users.some((line) => line.includes("Lan")), false);

  arm();
  users.length = 0;
  const waitSession = { hearing };
  const waitRoom = { id: "bot-compose-wait" };
  const waitBase = { ...joinBase, room: waitRoom, session: waitSession };
  const waiting = speakMeetingTurn({ ...waitBase, text: "Adam, file a booth ticket", deliveryId: "compose-wait-1" });
  await chatReady;
  assert.equal(waitSession.meetingFloor, undefined);
  const holdOn = { text: "wait", room: waitRoom, memberId: "100", speakerName: "Anh" };
  assert.equal(meetingLineShouldAnswer(waitSession, holdOn), true);
  assert.equal(meetingLineShouldAnswer(waitSession, { text: "wait", room: waitRoom, memberId: "200", speakerName: "Lan" }), false);
  assert.equal(waitSession.meetingFloor, undefined);
  const held = speakMeetingTurn({ ...waitBase, text: holdOn.text, deliveryId: "compose-wait-2" });
  releaseChat();
  await playReady;
  assert.equal(waitSession.meetingFloor, undefined);
  releasePlay();
  const [olderWait, newerWait] = await Promise.all([waiting, held]);
  assert.equal(olderWait.spoke, false);
  assert.equal(newerWait.spoke, true);
  assert.equal(users.at(-1).includes("wait"), true);
  assert.equal(users.at(-1).includes("file a booth ticket"), false);
  assert.equal(waitSession.meetingFloor.speaker, "id:100");
  waitSession.meetingFloor.until = Date.now() - 1;
  assert.equal(meetingLineShouldAnswer(waitSession, holdOn), false);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["The booth opens at nine, for the launch.", "Okay, I am waiting."]);
});

test("a floor owner does not join another speaker's reply", async () => {
  const users = [];
  let releaseChat = () => {};
  const chatGate = new Promise((resolve) => { releaseChat = resolve; });
  let sawChat = () => {};
  const chatReady = new Promise((resolve) => { sawChat = resolve; });
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      users.push(user);
      if (user.includes("file a booth ticket")) {
        sawChat();
        await chatGate;
        return chat({ content: "I only heard the first request." });
      }
      return chat({ content: "Pricing is on the sheet." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const room = { id: "bot-floor-owner" };
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room,
    session,
    env,
    fetchImpl: http.fetch,
  };
  const first = speakMeetingTurn({ ...base, text: "Adam, file a booth ticket", deliveryId: "floor-owner-1" });
  await chatReady;
  session.meetingFloor = { roomId: room.id, speaker: "id:200", until: Date.now() + 90_000 };
  const side = { text: "what about pricing", room, memberId: "200", speakerName: "Lan" };
  const called = { text: "Adam, what about pricing", room, memberId: "200", speakerName: "Lan" };
  assert.equal(meetingLineShouldAnswer(session, side), false);
  assert.equal(meetingLineShouldAnswer(session, called), true);
  const second = speakMeetingTurn({
    ...base,
    text: called.text,
    speakerName: "Lan",
    memberId: "200",
    deliveryId: "floor-owner-2",
  });
  releaseChat();
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.spoke, false);
  assert.equal(newer.spoke, true);
  assert.equal(users.some((line) => line.includes("file a booth ticket") && line.includes("what about pricing")), false);
  assert.equal(users.at(-1).includes("what about pricing"), true);
  assert.equal(users.at(-1).includes("file a booth ticket"), false);
});

test("a replacement clip waits until the hold finishes", async () => {
  let chatHits = 0;
  let delivered = false;
  const http = scripted(async (url) => {
    if (url.includes("/chat/completions")) {
      chatHits += 1;
      return chat({ content: "Pricing is on the sheet." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const room = { id: "bot-cut-wait" };
  const session = { hearing: { name: "Adam", triggers: ["hey adam"] } };
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room,
    session,
    env,
    fetchImpl: http.fetch,
  };
  const first = await speakMeetingTurn({
    ...base,
    text: "hey adam",
    deliveryId: "cut-wait-1",
    utteranceId: "cut-wait-u1",
  });
  assert.equal(first.spoke, true);
  let releaseCut = () => {};
  const cutGate = new Promise((resolve) => { releaseCut = resolve; });
  let markCut = () => {};
  const cutSeen = new Promise((resolve) => { markCut = resolve; });
  const second = speakMeetingTurn({
    ...base,
    text: "Adam, what is the price",
    deliveryId: "cut-wait-2",
    cutPlayback: () => {
      markCut();
      return cutGate;
    },
    deliver: async () => {
      delivered = true;
      return true;
    },
  });
  await cutSeen;
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
  assert.equal(chatHits, 1);
  assert.equal(delivered, false);
  releaseCut();
  const result = await second;
  assert.equal(result.spoke, true);
  assert.equal(delivered, true);
});

test("queueing a page clip does not open the floor", async () => {
  const http = scripted((url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam" } };
  const result = await speakMeetingTurn({
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-queued-floor" },
    session,
    deliveryId: "queued-floor",
    utteranceId: "tr-queued",
    env,
    fetchImpl: http.fetch,
    deliver: async () => true,
  });
  assert.equal(result.spoke, true);
  assert.equal(session.meetingFloor, undefined);
  assert.equal(http.calls.some((call) => String(call.url).includes("/output_audio/")), false);
  const played = { roomId: "bot-queued-floor", speaker: "id:100", until: Date.now() + 90_000 };
  assert.equal(applyPlayedFloor(session, played, "bot-queued-floor"), true);
  assert.equal(session.meetingFloor.speaker, "id:100");
  assert.equal(applyPlayedFloor(session, { ...played, until: played.until - 1 }, "bot-queued-floor"), false);
  assert.equal(session.meetingFloor.until, played.until);
  const openedAt = session.meetingFloor.at;
  assert.equal(applyPlayedFloor(session, null, "bot-queued-floor", openedAt + 1), false);
  assert.equal(session.meetingFloor, undefined);
  const later = Date.now();
  session.meetingFloor = { roomId: "bot-queued-floor", speaker: "id:100", until: later + 90_000, at: later };
  assert.equal(applyPlayedFloor(session, null, "bot-queued-floor", later - 10), false);
  assert.equal(session.meetingFloor.speaker, "id:100");
});

test("a lookup stays silent until the result", async () => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let started = () => {};
  const ready = new Promise((resolve) => { started = resolve; });
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const tools = body.messages.filter((row) => row.role === "tool").map((row) => String(row.content || "")).join("\n");
      if (tools.includes("Thursday")) return chat({ content: "The launch is Thursday." });
      return chat({
        content: "",
        tool_calls: [{
          id: "call-recall",
          type: "function",
          function: { name: "recall", arguments: JSON.stringify({ text: "launch" }) },
        }],
      });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const turn = speakMeetingTurn({
    answer: true,
    text: "Adam, when is the launch",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-quiet-lookup" },
    session: { hearing: { name: "Adam" } },
    deliveryId: "quiet-lookup",
    env,
    fetchImpl: http.fetch,
    runTool: async () => {
      started();
      await gate;
      return { ok: true, text: "Thursday" };
    },
  });
  await ready;
  assert.equal(http.calls.some((call) => call.url.includes("/audio/speech")), false);
  release();
  assert.equal((await turn).spoke, true);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["The launch is Thursday."]);
});

test("a later request is answered while an earlier write is still running", async () => {
  let releaseAct = () => {};
  const actGate = new Promise((resolve) => { releaseAct = resolve; });
  let actStarted = () => {};
  const actReady = new Promise((resolve) => { actStarted = resolve; });
  let actFinished = false;
  let recallStarted = false;
  let playing = 0;
  let maxPlaying = 0;
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      const tools = body.messages.filter((row) => row.role === "tool").map((row) => String(row.content || "")).join("\n");
      if (tools.includes("Not done")) return chat({ content: "That goes for approval." });
      if (tools.includes("Thursday")) return chat({ content: "The launch is Thursday." });
      if (user.includes("file the booth")) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-act",
            type: "function",
            function: { name: "act", arguments: JSON.stringify({ text: "file the booth ticket" }) },
          }],
        });
      }
      if (user.includes("launch")) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-recall",
            type: "function",
            function: { name: "recall", arguments: JSON.stringify({ text: "when is the launch" }) },
          }],
        });
      }
      return chat({ content: "Okay." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) {
      playing += 1;
      maxPlaying = Math.max(maxPlaying, playing);
      await new Promise((resolve) => setTimeout(resolve, 25));
      playing -= 1;
      return { ok: true, async text() { return ""; } };
    }
    throw new Error(`unexpected ${url}`);
  });
  const session = { hearing: { name: "Adam" } };
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-overlap" },
    session,
    env,
    fetchImpl: http.fetch,
    runTool: async (call) => {
      if (call.name === "act") {
        actStarted();
        await actGate;
        actFinished = true;
        return { held: true };
      }
      if (call.name === "recall") {
        recallStarted = true;
        return { ok: true, text: "Thursday" };
      }
      return { ok: false, text: "no" };
    },
  };
  const first = speakMeetingTurn({ ...base, text: "Adam, file the booth ticket", deliveryId: "task-act" });
  await actReady;
  const second = await speakMeetingTurn({ ...base, text: "Adam, when is the launch", deliveryId: "task-recall" });
  assert.equal(recallStarted, true);
  assert.equal(second.spoke, true);
  releaseAct();
  const filed = await first;
  assert.equal(actFinished, true);
  assert.equal(filed.spoke, false);
  assert.equal(maxPlaying, 1);
  const said = http.calls
    .filter((call) => call.url.includes("/audio/speech"))
    .map((call) => JSON.parse(call.init.body).input);
  assert.equal(said.includes("I'm sending that for approval."), false);
  assert.equal(said.includes("That goes for approval."), false);
  assert.equal(said.includes("The launch is Thursday."), true);
  assert.equal(said.includes("I'm looking that up."), false);
  assert.equal(said.includes("I'm on those."), false);
});

test("a second line before the answer is spoken is answered once", async () => {
  let releaseChat = () => {};
  const chatGate = new Promise((resolve) => { releaseChat = resolve; });
  let sawFirst = () => {};
  const firstReady = new Promise((resolve) => { sawFirst = resolve; });
  const users = [];
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      users.push(user);
      if (users.length === 1) {
        sawFirst();
        await chatGate;
        return chat({ content: "I only heard the first request." });
      }
      return chat({ content: "The booth opens at nine, for the launch." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-combine" },
    session: {},
    env,
    fetchImpl: http.fetch,
  };
  const first = speakMeetingTurn({ ...base, text: "Adam, file a booth ticket", deliveryId: "combine-1" });
  await firstReady;
  const second = speakMeetingTurn({ ...base, text: "Adam, make it about the launch", deliveryId: "combine-2" });
  releaseChat();
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.spoke, false);
  assert.equal(newer.spoke, true);
  assert.equal(users.some((line) => line.includes("file a booth ticket") && line.includes("make it about the launch")), true);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["The booth opens at nine, for the launch."]);
});

test("okay while the reply is playing does not replace it", async () => {
  let releasePlay = () => {};
  const playGate = new Promise((resolve) => { releasePlay = resolve; });
  let playStarted = () => {};
  const playReady = new Promise((resolve) => { playStarted = resolve; });
  const http = scripted(async (url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) {
      playStarted();
      await playGate;
      return { ok: true, async text() { return ""; } };
    }
    throw new Error(`unexpected ${url}`);
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-back" },
    session: {},
    env,
    fetchImpl: http.fetch,
  };
  const first = speakMeetingTurn({ ...base, text: "hey adam", deliveryId: "back-1", utteranceId: "back-u1" });
  await playReady;
  const side = await speakMeetingTurn({ ...base, text: "okay", deliveryId: "back-2", utteranceId: "back-u2" });
  assert.equal(side.spoke, false);
  releasePlay();
  assert.equal((await first).spoke, true);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.deepEqual(said, ["Yes, I can hear you."]);
});

test("okay on an open floor does not start a reply, and thanks does not either", async () => {
  const http = scripted(() => {
    throw new Error("no network");
  });
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-idle-ok" },
    session: { hearing: { name: "Adam", triggers: ["hey adam"] } },
    env,
    fetchImpl: http.fetch,
  };
  const okay = await speakMeetingTurn({ ...base, text: "okay", deliveryId: "idle-ok" });
  const thanks = await speakMeetingTurn({ ...base, text: "thanks", room: { id: "bot-idle-thanks" }, deliveryId: "idle-thanks" });
  assert.equal(okay.spoke, false);
  assert.equal(thanks.spoke, false);
  assert.equal(http.calls.length, 0);
});

test("an automatic write is spoken as done, and a held write still needs approval", async () => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let started = () => {};
  const ready = new Promise((resolve) => { started = resolve; });
  const http = scripted(async (url, init) => {
    if (url.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      const user = body.messages.filter((row) => row.role === "user").map((row) => String(row.content || "")).join("\n");
      const tools = body.messages.filter((row) => row.role === "tool").map((row) => String(row.content || "")).join("\n");
      if (tools.includes("The write ran.")) return chat({ content: "Sure, I'll send that for approval after the call." });
      if (tools.includes("needs approval")) return chat({ content: "I'll send that for approval." });
      if (user.includes("random task") || user.includes("hold this")) {
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
  const base = {
    answer: true,
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    env,
    fetchImpl: http.fetch,
  };
  const filing = speakMeetingTurn({
    ...base,
    text: "Adam, create a random task on linear",
    room: { id: "bot-auto" },
    session: {},
    deliveryId: "auto-1",
    runTool: async () => {
      started();
      await gate;
      return { preference: "do", allow: "do", body: "Random task\nfiled\npreference do\nLIN-9" };
    },
  });
  await ready;
  assert.equal(http.calls.some((call) => call.url.includes("/audio/speech")), false);
  release();
  assert.equal((await filing).spoke, true);
  const held = await speakMeetingTurn({
    ...base,
    text: "Adam, hold this task",
    room: { id: "bot-ask" },
    session: {},
    deliveryId: "ask-1",
    runTool: async () => ({ held: true, needsConfirmation: true }),
  });
  assert.equal(held.spoke, true);
  const said = http.calls.filter((call) => call.url.includes("/audio/speech")).map((call) => JSON.parse(call.init.body).input);
  assert.equal(said.includes("Done. The write ran."), true);
  assert.equal(said.includes("Sure, I'll send that for approval after the call."), false);
  assert.equal(said.includes("I'm sending that for approval."), false);
  assert.equal(said.includes("I'll send that for approval."), true);
});

test("a clip handed to the meeting page is not also sent as output audio", async () => {
  const clips = [];
  const http = scripted((url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const result = await speakMeetingTurn({
    answer: true,
    text: "hey adam can you hear me",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-page" },
    session: {},
    deliveryId: "voice-page",
    utteranceId: "tr-page:0",
    env,
    fetchImpl: http.fetch,
    deliver: async (audio) => {
      clips.push(Buffer.from(audio));
      return true;
    },
  });
  assert.equal(result.spoke, true);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].length > 0, true);
  assert.equal(http.calls.some((call) => String(call.url).includes("/output_audio/")), false);
  assert.equal(http.calls.some((call) => String(call.url).includes("/chat/completions")), false);
});

test("a missed meeting page still plays output audio", async () => {
  let posts = 0;
  const http = scripted((url) => {
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) {
      posts += 1;
      return { ok: true, async text() { return ""; } };
    }
    throw new Error(`unexpected ${url}`);
  });
  const missed = await speakMeetingTurn({
    answer: true,
    text: "hey adam",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-miss" },
    session: {},
    deliveryId: "voice-miss",
    utteranceId: "tr-miss:1",
    env,
    fetchImpl: http.fetch,
    deliver: async () => false,
  });
  assert.equal(missed.spoke, true);
  const thrown = await speakMeetingTurn({
    answer: true,
    text: "hey adam",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-throw" },
    session: {},
    deliveryId: "voice-throw",
    utteranceId: "tr-throw:1",
    env,
    fetchImpl: http.fetch,
    deliver: async () => {
      throw new Error("page down");
    },
  });
  assert.equal(thrown.spoke, true);
  assert.equal(posts, 2);
});

test("a meeting page still runs a connected tool and leaves a write on the allow gate", async () => {
  let chats = 0;
  const seen = [];
  const clips = [];
  const http = scripted((url, init) => {
    if (url.includes("/chat/completions")) {
      chats += 1;
      if (chats === 1) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-page-tool",
            type: "function",
            function: { name: "notes__search", arguments: JSON.stringify({ query: "d7", memberId: "hacker" }) },
          }],
        });
      }
      if (chats === 2) return chat({ content: "The launch is Thursday." });
      if (chats === 3) {
        return chat({
          content: "",
          tool_calls: [{
            id: "call-page-act",
            type: "function",
            function: { name: "act", arguments: JSON.stringify({ text: "file the ticket", memberId: "hacker" }) },
          }],
        });
      }
      const body = JSON.parse(init.body);
      assert.equal(JSON.stringify(body.messages).includes("Not done. It needs approval"), true);
      return chat({ content: "I'll send that for approval." });
    }
    if (url.includes("/audio/speech")) return mp3Response();
    if (url.includes("/output_audio/")) return { ok: true, async text() { return ""; } };
    throw new Error(`unexpected ${url}`);
  });
  const deliver = async (audio) => {
    clips.push(Buffer.from(audio));
    return true;
  };
  const lookedUp = await speakMeetingTurn({
    answer: true,
    text: "Adam, when is the launch?",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-page-tool" },
    session: { hearing: { name: "Adam" } },
    deliveryId: "voice-page-tool",
    env,
    fetchImpl: http.fetch,
    deliver,
    context: { tenantId: "northline" },
    listTools: async () => [{ name: "notes__search", description: "Search notes", inputSchema: { type: "object", properties: { query: { type: "string" } } } }],
    runTool: async (call) => {
      seen.push(call);
      return { ok: true, text: "Thursday" };
    },
  });
  assert.equal(lookedUp.spoke, true);
  assert.equal(seen[0].name, "notes__search");
  assert.deepEqual(seen[0].arguments, { query: "d7" });
  assert.equal(seen[0].memberId, "100");
  const filed = await speakMeetingTurn({
    answer: true,
    text: "Adam, file the ticket",
    speakerName: "Anh",
    botName: "Adam",
    memberId: "100",
    room: { id: "bot-page-act" },
    session: { hearing: { name: "Adam" } },
    deliveryId: "voice-page-act",
    env,
    fetchImpl: http.fetch,
    deliver,
    runTool: async (call) => {
      seen.push(call);
      return { held: true, needsConfirmation: true };
    },
  });
  assert.equal(filed.spoke, true);
  assert.equal(seen[1].name, "act");
  assert.equal(seen[1].arguments.memberId, "100");
  assert.equal(seen[1].arguments.text, "file the ticket");
  const said = http.calls
    .filter((call) => call.url.includes("/audio/speech"))
    .map((call) => JSON.parse(call.init.body).input);
  assert.equal(said.includes("The launch is Thursday."), true);
  assert.equal(said.includes("I'll send that for approval."), true);
  assert.equal(clips.length >= 2, true);
  assert.equal(http.calls.some((call) => String(call.url).includes("/output_audio/")), false);
});
