import assert from "node:assert/strict";
import test from "node:test";
import { meetingLineShouldAnswer, meetingToolArguments, speakMeetingTurn, spokenLine } from "../src/meeting/voice.js";

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

test("recall and act keep the transcript member and drop a model member id", () => {
  const recall = meetingToolArguments("recall", { text: "launch date", memberId: "hacker" }, "100", { id: "bot-1" });
  assert.equal(recall.memberId, "100");
  assert.deepEqual(recall.participants, ["100"]);
  assert.equal(recall.text, "launch date");
  const custom = meetingToolArguments("notes__search", { query: "d7", memberId: "hacker", token: "secret" }, "100", { id: "bot-1" });
  assert.deepEqual(custom, { query: "d7" });
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
  });
  assert.deepEqual(played, { spoke: false });
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
    text: "Adam",
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
