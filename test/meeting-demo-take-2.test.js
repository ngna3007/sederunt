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

// ---- Review of PR 29 (Nov 11 2026) ----

test("review: command words that start plain statements do not wake Adam in a solo call", () => {
  for (const line of ["list price is up", "file is uploaded to the drive", "update: we shipped the beta", "open house is Friday", "book fair was great",
    "show went well", "set up was done yesterday", "draft looks good", "log shows nothing", "invite went out", "send button works now", "move was approved"]) {
    assert.equal(directRequest(line), false, line);
  }
  for (const line of ["schedule a launch sync tomorrow at 10 am", "show me the decisions", "list the open issues", "find the budget note",
    "look up the venue", "draft an email to Bao", "update the launch sync to 11", "invite Bao to the review", "log a bug for the scanner"]) {
    assert.equal(directRequest(line), true, line);
  }
});

test("review: group calls still need the name; mic checks and keeps stay quiet in solo", () => {
  const room = { id: "r-1" };
  const group = { hearing: { name: "Adam" }, meetingDirect: false };
  for (const line of ["schedule a launch sync tomorrow at 10 am", "send the notes to the team", "update the doc"]) {
    assert.equal(meetingLineShouldAnswer(group, { text: line, room, memberId: "100", speakerName: "Anh" }), false, line);
  }
  const solo = { hearing: { name: "Adam" }, meetingDirect: true };
  for (const line of ["testing testing", "check one two", "okay thanks", "Heads up, the review moved to Thursday", "list price is up"]) {
    assert.equal(meetingLineShouldAnswer(solo, { text: line, room, memberId: "100", speakerName: "Anh" }), false, line);
  }
});

test("review: a send said without the name still waits for a spoken yes", async () => {
  const { writeRisk } = await import("../src/meeting/voice-write.js");
  assert.equal(writeRisk("gmail__send_email"), "confirm");
  assert.equal(writeRisk("calendar__update_event"), "confirm");
});
