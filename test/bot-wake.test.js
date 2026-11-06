import assert from "node:assert/strict";
import test from "node:test";
import { detectWake } from "../src/bot/wake.js";

const addressed = [
  "Adam, send the notes",
  "Hey Adam, when is the retro?",
  "Hey, Adam!",
  "ok Adam what time",
  "We decided the date. Adam, tell Mai.",
  "you meant Thursday, Adam?",
  "What time is it Adam?",
  "Adum, can you hear me?",
  "a dam send the notes",
  "Edam, post that",
  "Ad am, are you there?",
  "Ê đam, gửi giúp với",
  "A đam ơi",
  "Hây Adam, mấy giờ họp?",
  "Adam ơi, note lại giúp",
  "này Adam, gửi cho Mai",
  "Quyết rồi. Adam ơi gửi biên bản.",
  "thanks, Adam",
  "anh Adam ơi",
  "anh, Adam",
];

const ignored = [
  "I told Adam yesterday",
  "I told Adam, yesterday",
  "Adam's report is ready",
  "Can someone tell Adam later",
  "please ask Adam",
  "Madam, the door",
  "Adams, come here",
  "Addam, come here",
  "anh Adam nói là",
  "báo cáo của Adam hôm qua",
  "tôi nói với Adam hôm qua",
  "try the Edam cheese",
  "Is Adam here?",
  "Ad, am you there",
];

test("English and Vietnamese address the bot, and a mention does not", () => {
  for (const line of addressed) {
    const heard = detectWake(line, { name: "Adam" });
    assert.equal(heard.addressed, true, line);
    assert.ok(heard.match, line);
  }
  for (const line of ignored) {
    const heard = detectWake(line, { name: "Adam" });
    assert.equal(heard.addressed, false, `${line} -> ${heard.match}`);
  }
  assert.deepEqual(detectWake("", { name: "Adam" }), { addressed: false, match: "" });
  assert.equal(detectWake("ADAM, send the notes").addressed, true);
});

test("a custom phrase wakes at the start of a clause, not in the middle", () => {
  const options = { name: "Lan", phrases: ["Lan ơi", "hey lan", "Dear Lan"] };
  assert.equal(detectWake("Lan ơi, gửi giúp", options).addressed, true);
  assert.equal(detectWake("hey lan, the notes", options).addressed, true);
  assert.equal(detectWake("Dear Lan, the notes", options).addressed, true);
  assert.equal(detectWake("please tell dear Lan the notes", options).addressed, false);
  assert.equal(detectWake("I wrote to Lan yesterday", options).addressed, false);
  assert.equal(detectWake("Hey Lan", { name: "Lan", phrases: [] }).addressed, true);
});

test("a short name matches only exactly", () => {
  assert.equal(detectWake("Bo, send it", { name: "Bo" }).addressed, true);
  assert.equal(detectWake("Be, send it", { name: "Bo" }).addressed, false);
  assert.equal(detectWake("Hey A", { name: "A" }).addressed, true);
  assert.equal(detectWake("B, send it", { name: "A" }).addressed, false);
});
