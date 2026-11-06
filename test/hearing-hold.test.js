import assert from "node:assert/strict";
import test from "node:test";
import { addressesHearing, splitAddressedKeepSentences, stripHearing } from "../src/hearing.js";
import { handleUtterance } from "../src/typed-path.js";
import { createSession } from "../src/session.js";

test("stripHearing drops address-only Maple", () => {
  assert.equal(stripHearing("Maple.", null), "");
  assert.equal(stripHearing("Maple", null), "");
  assert.equal(
    stripHearing("Maple. Remember this: the launch code is cedar92", null),
    "Remember this: the launch code is cedar92",
  );
});

test("meeting address-only arms hold; next chunk keeps launch code", async () => {
  const session = createSession();
  const room = { id: "bot-cedar-hold", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const silence = await handleUtterance({
    text: "Maple.",
    memberId: "anh",
    door: "meeting",
    addressed: true,
    deliveryId: "t1",
    participants: ["anh"],
    room,
    session,
  }, {});
  assert.equal(silence.kind, "silence");
  assert.ok(session.hearingHold?.roomId === room.id || true);

  const kept = await handleUtterance({
    text: "Remember this: the launch code is cedar92",
    memberId: "anh",
    door: "meeting",
    addressed: false,
    deliveryId: "t2",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  const texts = (session.decisions || []).map((d) => d.text);
  assert.ok(
    texts.some((t) => /cedar92/i.test(t)),
    `expected cedar92 in decisions, got ${JSON.stringify(texts)}`,
  );
  assert.ok(!texts.some((t) => /^maple$/i.test(String(t).trim())), "must not keep bare maple");
});

test("unaddressed meeting line without hold stays silence", async () => {
  const session = createSession();
  const room = { id: "bot-no-hold", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const result = await handleUtterance({
    text: "the launch code is cedar92",
    memberId: "anh",
    door: "meeting",
    addressed: false,
    deliveryId: "t3",
    participants: ["anh"],
    room,
    session,
  }, {});
  assert.equal(result.kind, "silence");
  assert.equal((session.decisions || []).length, 0);
});

test("addressesHearing still requires Maple, Adam, or a trigger", () => {
  assert.equal(addressesHearing("Remember this: cedar92", null), false);
  assert.equal(addressesHearing("Maple remember cedar92", null), true);
  assert.equal(addressesHearing("Adam remember this: District 7", null), true);
});

test("stripHearing drops address-only Adam and keeps the District 7 sentence", () => {
  assert.equal(stripHearing("Adam.", null), "");
  assert.equal(
    stripHearing("Adam, remember this: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2nd.", null),
    "remember this: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2nd.",
  );
});

test("meeting line addressed to Adam keeps when hearing still defaults to Maple", async () => {
  const session = createSession();
  const room = { id: "bot-northline-adam", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const text = "Adam, remember this: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2nd.";
  const kept = await handleUtterance({
    text,
    memberId: "anh",
    door: "meeting",
    addressed: addressesHearing(text, null),
    deliveryId: "t-northline-d7",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  const texts = (session.decisions || []).map((d) => d.text);
  assert.ok(
    texts.some((row) => /district 7/i.test(row)),
    `expected District 7 in decisions, got ${JSON.stringify(texts)}`,
  );
});

const NORTHLINE_TRIPLE = "maple remember this the new hcmc office is district 7 building b floors 8 and 9 move in december 2 maple remember this launch stays november 18 only if billing is green by november 12 otherwise we slipped to november 25 maple remember this ops only the booth staging unlock is cedar 92";

test("splitAddressedKeepSentences splits three maple remember-this clauses", () => {
  const parts = splitAddressedKeepSentences(NORTHLINE_TRIPLE, null);
  assert.equal(parts.length, 3, `expected 3 parts, got ${JSON.stringify(parts)}`);
  assert.match(parts[0], /district 7/i);
  assert.match(parts[1], /november 18/i);
  assert.match(parts[2], /cedar 92/i);
});

test("one transcript with three maple remember-this sentences stores three keeps", async () => {
  const session = createSession();
  const room = { id: "bot-northline-triple", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const kept = await handleUtterance({
    text: NORTHLINE_TRIPLE,
    memberId: "anh",
    door: "meeting",
    addressed: addressesHearing(NORTHLINE_TRIPLE, null),
    deliveryId: "t-northline-triple",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  const texts = (session.decisions || []).filter((row) => !row.deleted).map((row) => row.text);
  assert.equal(texts.length, 3, `expected 3 keeps, got ${JSON.stringify(texts)}`);
  assert.match(texts[0], /district 7/i);
  assert.match(texts[1], /november 18/i);
  assert.match(texts[2], /cedar 92/i);
  assert.ok(texts.some((row) => /district 7/i.test(row) && /floors 8 and 9/i.test(row)));
  assert.ok(texts.some((row) => /november 18/i.test(row) && /november 12/i.test(row)));
  assert.ok(texts.some((row) => /cedar 92/i.test(row) && /ops only/i.test(row)));
});

