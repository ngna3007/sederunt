import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderCameraPage } from "../src/meeting/camera.js";
import { directRequest, meetingLineShouldAnswer } from "../src/meeting/voice.js";

// Demo take 2 (Nov 11 2026, bot 11972295): Anh, alone with Adam, said "Adam,
// schedule a launch sync tomorrow at 10am". Recall's low-latency stream gave
// "schedule a launch sync tomorrow at 10 am" (speech_on 10:55:20.66Z, first
// word 10:55:22.24Z), so there was no name, the 20 s floor after ROW-76 had
// closed, and the solo-call rule did not count "schedule" as a request.
const HEARD = "schedule a launch sync tomorrow at 10 am";

test("demo take 2: a command without the name is a request in a one-person call", () => {
  for (const line of [HEARD, "file an issue for the onboarding email", "book a room for friday", "add a task to fix login", "set up a sync on monday", "send the notes to the team", "move the launch sync to 11"]) {
    assert.equal(directRequest(line), true, line);
  }
  for (const line of ["okay thanks", "so the launch is next week", "the design review moved to thursday", "hmm", "check check one two", "let me think"]) {
    assert.equal(directRequest(line), false, line);
  }
});

test("demo take 2: the meeting page asks for the line Recall heard without 'Adam'", () => {
  const page = renderCameraPage();
  const script = page.slice(page.indexOf("<script>") + "<script>".length, page.indexOf("</script>"));
  const grab = (name) => {
    const start = script.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, name);
    let depth = 0;
    for (let index = script.indexOf("{", start); index < script.length; index += 1) {
      if (script[index] === "{") depth += 1;
      if (script[index] === "}") { depth -= 1; if (depth === 0) return script.slice(start, index + 1); }
    }
    return "";
  };
  const context = { botName: "Adam", participantId: "bot-1", floorSpeaker: "Anh Nguyễn", floorUntil: 0, direct: true };
  vm.runInNewContext(`${grab("directRequest")}\n${grab("letters")}\n${grab("shouldRespond")}\nthis.gate = shouldRespond;`, context);
  assert.equal(context.gate(HEARD, "Anh Nguyễn", Date.now(), "100"), true, "solo call, floor closed, no name");
  context.direct = false;
  assert.equal(context.gate(HEARD, "Anh Nguyễn", Date.now(), "100"), false, "with other people the name is still needed");
  assert.equal(context.gate(`adam ${HEARD}`, "Anh Nguyễn", Date.now(), "100"), true);
});

test("demo take 2: the webhook path agrees in a one-person call", () => {
  const session = { hearing: { name: "Adam" }, meetingDirect: true };
  assert.equal(meetingLineShouldAnswer(session, { text: HEARD, room: { id: "11972295-72c3-4b09-8025-e5d59d0b14b1" }, memberId: "100", speakerName: "Anh Nguyễn" }), true);
});
