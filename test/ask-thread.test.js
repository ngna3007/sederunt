import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import { ASK_UNAVAILABLE, NOTHING, humanAskText } from "../src/ask/run.js";
import { priorAsksForThread } from "../src/ask/thread.js";
import { renderConsolePage } from "../src/console-page.js";

const PRODUCT = "Sederunt joins a channel or a meeting, keeps what was decided, and answers later from that record.";

function ask(fields) {
  return {
    id: "ask-1",
    question: "When does the booth open?",
    status: "done",
    text: "",
    createdAt: 1,
    ...fields,
  };
}

/** What loadAsks would have to paint, using the server's humanAskText as the oracle. */
function readable(row) {
  const streamed = humanAskText(row.text);
  if (streamed) return streamed;
  const result = row.result && typeof row.result === "object" ? row.result : null;
  const learned = result && typeof result.learned === "string" ? result.learned : "";
  const body = result && typeof result.body === "string" ? result.body : "";
  return humanAskText(learned || body);
}

function failureOnly(text) {
  if (!text) return true;
  return text.split("\n").every((line) => line === ASK_UNAVAILABLE);
}

test("prior asks skip the friendly failure and tool protocol, and keep real answers", () => {
  const samples = [
    ask({ id: "fail", text: ASK_UNAVAILABLE }),
    ask({ id: "fail-twice", text: `${ASK_UNAVAILABLE}\n${ASK_UNAVAILABLE}` }),
    ask({ id: "fail-result", text: "", result: { body: ASK_UNAVAILABLE } }),
    ask({ id: "protocol", text: "missing-member\nrecorded\npreference ask" }),
    ask({ id: "protocol-result", text: "", result: { body: "not-invited\ncheckpoint walrus\nROW-12\nupdated" } }),
    ask({ id: "learned-protocol", text: "", result: { learned: "duplicate-delivery\npreference do", body: PRODUCT } }),
    ask({ id: "blank", text: "   \n" }),
    ask({ id: "stopped-blank", status: "stopped", text: "" }),
    ask({ id: "memory", text: NOTHING }),
    ask({ id: "product", text: PRODUCT }),
    ask({ id: "decision", text: "The booth opens at nine.\nrecorded\npreference ask" }),
    ask({ id: "from-result", text: "", result: { body: "The booth opens at nine." } }),
    ask({ id: "from-learned", text: "", result: { learned: "The booth opens at nine.", body: ASK_UNAVAILABLE } }),
    ask({ id: "mixed", text: `${ASK_UNAVAILABLE}\nThe booth opens at nine.` }),
    ask({ id: "stopped-partial", status: "stopped", text: "The booth opens" }),
    ask({ id: "live", status: "streaming", text: "" }),
    ask({ id: "live-fail", status: "streaming", text: ASK_UNAVAILABLE }),
    ask({ id: "no-id", id: "" }),
  ];
  for (const row of samples) {
    const kept = priorAsksForThread([row]);
    const show = Boolean(row.id) && (row.status === "streaming" || !failureOnly(readable(row)));
    assert.deepEqual(kept.map((item) => item.id), show ? [row.id] : [], row.id);
  }
});

test("consecutive finished asks with the same question keep the newest", () => {
  const question = "When does the booth open?";
  const other = "What is Sederunt?";
  const kept = priorAsksForThread([
    ask({ id: "old", question, text: "Nine.", createdAt: 1 }),
    ask({ id: "retry-fail", question, text: ASK_UNAVAILABLE, createdAt: 2 }),
    ask({ id: "retry-protocol", question, text: "missing-member\npreference ask", createdAt: 3 }),
    ask({ id: "new", question: `  ${question}  `, text: "The booth opens at nine.", createdAt: 4 }),
    ask({ id: "product", question: other, text: PRODUCT, createdAt: 5 }),
    ask({ id: "older-copy", question: other, text: "A shorter product line.", createdAt: 4 }),
    ask({ id: "again", question, text: "Still nine.", createdAt: 6 }),
    ask({ id: "live", question, status: "streaming", text: "", createdAt: 7 }),
  ]);
  assert.deepEqual(kept.map((item) => item.id), ["new", "product", "again", "live"]);
});

test("a streaming ask is not collapsed away from an older answer", () => {
  const question = "When does the booth open?";
  const kept = priorAsksForThread([
    ask({ id: "done", question, text: "Nine.", createdAt: 1 }),
    ask({ id: "live", question, status: "streaming", text: "", createdAt: 2 }),
  ]);
  assert.deepEqual(kept.map((item) => item.id), ["done", "live"]);
});

test("an empty ask list stays empty", () => {
  assert.deepEqual(priorAsksForThread(null), []);
  assert.deepEqual(priorAsksForThread(undefined), []);
  assert.deepEqual(priorAsksForThread({}), []);
  assert.deepEqual(priorAsksForThread([null, { question: "Hi" }]), []);
});

test("the console page injects the same priorAsksForThread the tests call", () => {
  const html = renderConsolePage({
    email: "demo@example.com",
    name: "Demo",
    rooms: [],
    decisions: [],
    meetings: [],
    people: [],
    history: [],
    connectors: {},
    read: "empty",
  });
  const embedded = priorAsksForThread.toString().replaceAll("\n", "\n  ");
  assert.ok(html.includes(embedded));
  const shipped = vm.runInNewContext(`${embedded}\npriorAsksForThread`);
  const rows = [
    ask({ id: "fail", text: ASK_UNAVAILABLE, createdAt: 1 }),
    ask({ id: "protocol", text: "missing-member\nrecorded\npreference ask", createdAt: 2 }),
    ask({ id: "keep", text: NOTHING, createdAt: 3 }),
    ask({ id: "prose", question: "What is Sederunt?", text: PRODUCT, createdAt: 4 }),
  ];
  // The page copy runs in its own realm, so copy the ids before comparing.
  const ids = (list) => Array.from(list, (item) => item.id);
  assert.deepEqual(ids(shipped(rows)), ids(priorAsksForThread(rows)));
  assert.equal(humanAskText("missing-member\nrecorded\npreference ask"), "");
  assert.equal(humanAskText(`The booth opens at nine.\nrecorded\npreference ask`), "The booth opens at nine.");
  assert.notEqual(NOTHING, ASK_UNAVAILABLE);
});
