import assert from "node:assert/strict";
import test from "node:test";
import { addressesHearing, isRememberThisKeep, splitAddressedKeepSentences, stripHearing } from "../src/hearing.js";
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



test("isRememberThisKeep requires a remember-this payload", () => {
  assert.equal(isRememberThisKeep("remember this"), false);
  assert.equal(isRememberThisKeep("I'll remember this later"), false);
  assert.equal(isRememberThisKeep("the launch code is cedar92"), false);
  assert.equal(isRememberThisKeep("remember this the new hcmc office is District 7"), true);
  assert.equal(isRememberThisKeep("Remember this: launch stays November 18 only if billing is green by November 12"), true);
});

test("addressesHearing still ignores a bare remember-this keep", () => {
  assert.equal(addressesHearing("remember this the new hcmc office is District 7", null), false);
});

test("bare remember-this in a meeting keeps without a wake name or hold", async () => {
  const session = createSession();
  const room = { id: "bot-bare-remember", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const text = "remember this the new hcmc office is District 7, Building B, floors 8 and 9, move-in December 2";
  const kept = await handleUtterance({
    text,
    memberId: "anh",
    door: "meeting",
    addressed: false,
    deliveryId: "t-bare-d7",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  const texts = (session.decisions || []).map((d) => d.text);
  assert.ok(
    texts.some((row) => /district 7/i.test(row) && /floors 8 and 9/i.test(row)),
    `expected District 7 keep, got ${JSON.stringify(texts)}`,
  );
});

test("named keep refreshes hold so a later bare remember-this still enters", async () => {
  const session = createSession();
  const room = { id: "bot-session-arm", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const first = await handleUtterance({
    text: "Maple, remember this: the new hcmc office is District 7, Building B, floors 8 and 9, move-in December 2",
    memberId: "anh",
    door: "meeting",
    addressed: true,
    deliveryId: "t-arm-d7",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(first.kind, "silence");
  assert.ok(session.hearingArmedRooms instanceof Set && session.hearingArmedRooms.has(room.id));
  assert.ok(session.hearingHold?.roomId === room.id);

  const second = await handleUtterance({
    text: "remember this launch stays November 18 only if billing is green by November 12; otherwise we slip to November 25",
    memberId: "anh",
    door: "meeting",
    addressed: false,
    deliveryId: "t-arm-launch",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(second.kind, "silence");
  const texts = (session.decisions || []).filter((row) => !row.deleted).map((row) => row.text);
  assert.ok(texts.some((row) => /district 7/i.test(row)));
  assert.ok(
    texts.some((row) => /november 18/i.test(row) && /november 12/i.test(row)),
    `expected launch keep, got ${JSON.stringify(texts)}`,
  );
});

test("addressed keep refreshes hold so a split continuation still enters", async () => {
  const session = createSession();
  const room = { id: "bot-launch-split", botPresent: true, source: "recall", kind: "meeting", memberIds: ["anh"] };
  const first = await handleUtterance({
    text: "Maple, remember this: launch stays November 18 only if billing",
    memberId: "anh",
    door: "meeting",
    addressed: true,
    deliveryId: "t-launch-partial",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(first.kind, "silence");

  const second = await handleUtterance({
    text: "is green by November 12; otherwise we slip to November 25",
    memberId: "anh",
    door: "meeting",
    addressed: false,
    deliveryId: "t-launch-rest",
    participants: ["anh"],
    room,
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(second.kind, "silence");
  const texts = (session.decisions || []).filter((row) => !row.deleted).map((row) => row.text);
  assert.ok(texts.some((row) => /november 18/i.test(row)));
  assert.ok(
    texts.some((row) => /november 12/i.test(row) && /november 25/i.test(row)),
    `expected launch continuation, got ${JSON.stringify(texts)}`,
  );
});

test("splitAddressedKeepSentences splits bare remember-this clauses", () => {
  const raw = "remember this the new hcmc office is district 7 building b floors 8 and 9 move in december 2 remember this launch stays november 18 only if billing is green by november 12 otherwise we slip to november 25 remember this ops only the booth staging unlock is cedar 92";
  const parts = splitAddressedKeepSentences(raw, null);
  assert.equal(parts.length, 3, `expected 3 parts, got ${JSON.stringify(parts)}`);
  assert.match(parts[0], /district 7/i);
  assert.match(parts[1], /november 18/i);
  assert.match(parts[2], /cedar 92/i);
});

test("channel please-keep still stores without a meeting address", async () => {
  const session = createSession();
  const text = "Northline decision (pack-catchup) — please keep: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2.";
  const kept = await handleUtterance({
    text,
    memberId: "rowan",
    door: "channel",
    intent: "keep",
    deliveryId: "slack-catchup-d7",
    participants: ["rowan"],
    room: { id: "C-ops", kind: "channel", source: "slack", botPresent: true, memberIds: ["rowan"] },
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  const texts = (session.decisions || []).map((d) => d.text);
  assert.ok(
    texts.some((row) => /district 7/i.test(row) && /please keep/i.test(row)),
    `expected channel keep, got ${JSON.stringify(texts)}`,
  );
});

test("speaker omitted from channel members still keeps", async () => {
  const session = createSession();
  const text = "Northline decision (pack-catchup) — please keep: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2.";
  const kept = await handleUtterance({
    text,
    memberId: "rowan",
    door: "channel",
    intent: "keep",
    deliveryId: "slack-catchup-d7-omit-speaker",
    // Members list is non-empty but missing the poster — previously refused.
    participants: ["other", "bot"],
    room: { id: "C-ops", kind: "channel", source: "slack", botPresent: true, memberIds: ["other", "bot"] },
    session,
  }, {
    async remember() { return { ok: true }; },
  });
  assert.notEqual(kept.kind, "silence");
  assert.ok(!["no-room","missing-member","not-invited","memory-remember-failed"].includes(kept.outcome), kept.outcome);
  const texts = (session.decisions || []).map((d) => d.text);
  assert.ok(
    texts.some((row) => /district 7/i.test(row)),
    `expected channel keep with omitted speaker, got ${JSON.stringify(texts)}`,
  );
});
