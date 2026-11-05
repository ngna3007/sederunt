import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeOpenQuestion, parseUtterance } from "../src/parse.js";
import { answerSlackQuestion, slackAnswer, slackFileBytes } from "../src/slack/reply.js";
import { createSession } from "../src/session.js";
import { handleUtterance } from "../src/typed-path.js";

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

function channelUtterance(session, text, extra = {}) {
  return {
    text,
    session,
    memberId: "anh",
    door: "channel",
    room: { id: "CNEW", kind: "channel", source: "slack", botPresent: true, memberIds: ["anh"] },
    participants: ["anh"],
    ...extra,
  };
}

test("a channel attachment is stored when the sentence does not name the file", async () => {
  const session = createSession();
  const uploads = [];
  await handleUtterance(
    channelUtterance(session, "Live demo announcement — please keep the attached note.", {
      file: { name: "demo-note.txt", bytes: "bring the demo note" },
    }),
    {
      console: {
        async upload(input) {
          uploads.push(input);
          return { id: "file-demo", folderId: "folder" };
        },
      },
    },
  );
  assert.deepEqual(uploads, [{ name: "demo-note.txt", bytes: "bring the demo note" }]);
  assert.equal(session.decisions.length, 1);
  assert.equal(session.decisions[0].text, "Live demo announcement — please keep the attached note.");
  assert.deepEqual(session.decisions[0].fileNames, [{
    name: "demo-note.txt",
    consoleFileId: "file-demo",
    folderId: "folder",
  }]);
});

test("an attached file is kept under its own name when the sentence names a different file", async () => {
  const session = createSession();
  const uploads = [];
  await handleUtterance(
    channelUtterance(session, "The floor plan is floor-plan.txt", {
      file: { name: "demo-note.txt", bytes: "NOTE" },
    }),
    {
      console: {
        async upload(input) {
          uploads.push({ name: input.name, bytes: input.bytes });
          return { id: "file-note", folderId: "folder" };
        },
      },
    },
  );
  assert.deepEqual(uploads, [{ name: "demo-note.txt", bytes: "NOTE" }]);
  assert.equal(session.decisions[0].fileNames[0].name, "demo-note.txt");
});

test("a filename in the sentence is uploaded when that file is attached, and stored without a file when nothing is", async () => {
  const session = createSession();
  const uploads = [];
  await handleUtterance(
    channelUtterance(session, "The floor plan is floor-plan.txt", {
      file: { name: "floor-plan.txt", bytes: "PLAN" },
    }),
    {
      console: {
        async upload(input) {
          uploads.push({ name: input.name, bytes: input.bytes });
          return { id: "file-plan", folderId: "folder" };
        },
      },
    },
  );
  assert.deepEqual(uploads, [{ name: "floor-plan.txt", bytes: "PLAN" }]);
  assert.equal(session.decisions[0].fileNames[0].name, "floor-plan.txt");

  const bare = createSession();
  await handleUtterance(
    channelUtterance(bare, "The badge list is badges.pdf"),
    {
      console: {
        async upload() {
          throw new Error("no bytes to upload");
        },
      },
    },
  );
  assert.equal(bare.decisions.length, 1);
  assert.deepEqual(bare.decisions[0].fileNames, []);
});

test("answerSlackQuestion returns a stored file and does not ask to confirm", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Please confirm before I resend demo-note.txt." } }] };
      },
    };
  };
  const answer = await answerSlackQuestion(
    [{ text: "Live demo announcement — please keep the attached note.", fileName: "demo-note.txt" }],
    "can you resend demo-note.txt",
    { env: { OPENROUTER_API_KEY: "sk-or-test" }, fetchImpl },
  );
  assert.equal(called, false);
  assert.equal(answer.source, "retrieval");
  assert.equal(answer.file, "demo-note.txt");
  assert.match(answer.text, /demo-note\.txt/);
  assert.doesNotMatch(answer.text, /confirm/i);
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
