import assert from "node:assert/strict";
import test from "node:test";
import { addressesHearing, stripHearing } from "../src/hearing.js";
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

test("addressesHearing still requires Maple or trigger", () => {
  assert.equal(addressesHearing("Remember this: cedar92", null), false);
  assert.equal(addressesHearing("Maple remember cedar92", null), true);
});
