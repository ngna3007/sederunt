import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeOpenQuestion, parseUtterance } from "../src/parse.js";
import { slackAnswer, slackFileBytes, slackQuestion } from "../src/slack/reply.js";

test("summarize and resend file asks are Slack questions", () => {
  assert.equal(
    slackQuestion("Please summarize the important announcement I just posted in #new-channel, and resend/share the attached file demo-note.txt (or a working link to it)."),
    true,
  );
  assert.equal(
    slackQuestion("Hey Adam — please summarize the IMPORTANT ANNOUNCEMENT in #new-channel and resend demo-note.txt or a link."),
    true,
  );
  assert.equal(slackQuestion("what was decided"), true);
  assert.equal(slackQuestion("when does the booth open?"), true);
  assert.equal(slackQuestion("What is on Monday?"), false);
  assert.equal(slackQuestion("What tickets are open for the trip?"), false);
  assert.equal(slackQuestion("The booth opens at nine."), false);
  assert.equal(slackQuestion("The floor plan is floor-plan.pdf"), false);
});

test("calendar and trip reads stay parse reads, not open questions", () => {
  assert.equal(looksLikeOpenQuestion("What is on Monday?"), false);
  assert.equal(looksLikeOpenQuestion("What tickets are open for the trip?"), false);
  assert.equal(parseUtterance("what is on Monday").type, "read");
  assert.equal(parseUtterance("what is on Monday").tool, "calendar");
  assert.equal(parseUtterance("What tickets are open for the trip?").type, "read");
  assert.equal(parseUtterance("What tickets are open for the trip?").tool, "linear");
  assert.equal(parseUtterance("what was decided").type, "recall");
  assert.equal(
    parseUtterance("Please summarize the important announcement I just posted in #new-channel, and resend/share the attached file demo-note.txt (or a working link to it).").type,
    "recall",
  );
});

test("an unrelated question drops the file decision and its checkpoint", () => {
  const answer = slackAnswer(
    [
      { text: "the booth opens at nine", fileName: null, connectorId: "ROW-69" },
      { text: "The floor plan is floor-plan.txt", fileName: "floor-plan.txt" },
    ],
    "what is the weather tomorrow",
    [
      "the booth opens at nine",
      "current",
      "ROW-69",
      "checkpoint 340927355",
      "The floor plan is floor-plan.txt",
      "current",
      "checkpoint 340943539",
      "preference ask",
    ].join("\n"),
  );
  assert.equal(answer.file, "");
  assert.equal(answer.text, "Decided: the booth opens at nine (ROW-69)");
  assert.doesNotMatch(answer.text, /floor plan/i);
  assert.doesNotMatch(answer.text, /340943539/);
  assert.doesNotMatch(answer.text, /checkpoint/);
  assert.doesNotMatch(answer.text, /preference/);
});

test("a Slack file download follows the signed redirect", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).endsWith("/files.info")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, file: { name: "floor-plan.txt", url_private_download: "https://files.slack.com/files-pri/T/F/download/floor-plan.txt" } };
        },
      };
    }
    if (String(url).includes("/download/")) {
      return {
        ok: false,
        status: 302,
        headers: { get: () => "https://downloads.slack.example/floor-plan.txt?sig=1" },
      };
    }
    return { ok: true, status: 200, async text() { return "PLAN"; } };
  };
  const loaded = await slackFileBytes({
    token: "xoxb-test",
    file: { id: "F1", name: "floor-plan.txt" },
    fetchImpl,
  });
  assert.equal(loaded.name, "floor-plan.txt");
  assert.equal(loaded.bytes, "PLAN");
  assert.equal(seen.some((url) => url.endsWith("/files.info")), true);
  assert.equal(seen.at(-1), "https://downloads.slack.example/floor-plan.txt?sig=1");
});
