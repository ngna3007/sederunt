import assert from "node:assert/strict";
import test from "node:test";
import { authorize } from "../src/domain/allow.js";
import { clashStatuses } from "../src/domain/clash.js";
import { checkInvite } from "../src/domain/invite.js";
import { resolvePreference } from "../src/domain/preference.js";
import { acceptCheckpoint } from "../src/domain/stamp.js";
import { itemStatus, STATUS_WORDS } from "../src/domain/status.js";
import { blobIdDecimal } from "../src/memory/locate.js";

globalThis.fetch = async () => {
  throw new Error("pure tests must not call the network");
};

test("a ticket is filed only when the connector returned an id", () => {
  assert.equal(itemStatus.length, 2);
  assert.equal(itemStatus({ kind: "ticket", edit: "create" }, "ROW-20"), "filed");
  assert.equal(itemStatus({ kind: "ticket", edit: "update" }, "ROW-20"), "updated");
  assert.equal(itemStatus({ kind: "ticket", edit: "create" }, null), "recorded");
  assert.equal(itemStatus({ kind: "ticket", edit: "create" }, ""), "recorded");
  assert.equal(itemStatus({ kind: "ticket", edit: "create" }, "   "), "recorded");
  assert.equal(itemStatus({ kind: "note" }, null), "recorded");
});

test("the visible status words are the closed set", () => {
  assert.deepEqual([...STATUS_WORDS], [
    "recorded",
    "filed",
    "updated",
    "current",
    "clashing",
    "replaced",
    "unknown",
  ]);
});

test("a read ignores preference, and a write runs for do or for the confirmed action", () => {
  assert.deepEqual(
    authorize({ action: "read", tool: "linear", preference: "ask" }),
    { allowed: true, reason: "read" },
  );
  assert.equal(
    authorize({ action: "read", tool: "calendar", preference: "do" }).reason,
    "read",
  );
  assert.deepEqual(
    authorize({ action: "write", tool: "linear" }),
    { allowed: true, reason: "do" },
  );
  assert.equal(
    authorize({ action: "write", tool: "linear", preference: "ask" }).allowed,
    false,
  );
  assert.equal(
    authorize({ action: "delete", tool: "linear", preference: "ask" }).reason,
    "ask",
  );
  assert.deepEqual(
    authorize({ action: "write", tool: "linear", preference: "do" }),
    { allowed: true, reason: "do" },
  );
  assert.equal(
    authorize({
      action: "write",
      tool: "linear",
      preference: "ask",
      confirmed: true,
      actionId: "action-1",
      confirmActionId: "action-1",
    }).reason,
    "confirmed",
  );
  assert.equal(
    authorize({
      action: "write",
      tool: "linear",
      preference: "ask",
      confirmed: true,
      actionId: "action-1",
      confirmActionId: "action-2",
    }).allowed,
    false,
  );
  assert.equal(authorize({ action: "noop", tool: "linear", preference: "do" }).allowed, false);
});

test("a room preference wins, and a missing preference runs", () => {
  assert.equal(resolvePreference([], "linear", "room-1"), "do");
  assert.equal(
    resolvePreference(
      [{ tool: "linear", value: "do", roomId: "", replacedBy: null }],
      "linear",
      "room-1",
    ),
    "do",
  );
  assert.equal(
    resolvePreference(
      [
        { tool: "linear", value: "do", roomId: "", replacedBy: null },
        { tool: "linear", value: "ask", roomId: "room-1", replacedBy: null },
      ],
      "linear",
      "room-1",
    ),
    "ask",
  );
  assert.equal(
    resolvePreference(
      [{ tool: "linear", value: "do", roomId: "", replacedBy: "preference-2" }],
      "linear",
      "",
    ),
    "do",
  );
});

test("the newer live preference wins when an older copy is still unmarked", () => {
  assert.equal(resolvePreference([
    { id: "preference-1", tool: "linear", value: "ask", roomId: "room-1", replacedBy: null },
    { id: "preference-2", tool: "linear", value: "do", roomId: "room-1", replacedBy: null },
  ], "linear", "room-1"), "do");
  assert.equal(resolvePreference([
    { id: "preference-2", tool: "linear", value: "do", roomId: "", replacedBy: "preference-3" },
    { id: "preference-3", tool: "linear", value: "ask", roomId: "", replacedBy: null },
  ], "linear", ""), "ask");
});

test("an invite check refuses a missing member and an outsider", () => {
  assert.equal(checkInvite("", ["rowan"]).reason, "missing-member");
  assert.equal(checkInvite(null, ["rowan"]).reason, "missing-member");
  assert.equal(checkInvite("sam", ["rowan", "alex"]).reason, "not-invited");
  assert.equal(checkInvite("rowan", ["rowan", "alex"]).ok, true);
});

test("a contradicting decision is clashing, newest does not win, and a replacement stays visible", () => {
  const alone = clashStatuses([
    { id: "first", area: "offsite", contradicts: [], predecessorId: null },
  ]);
  assert.equal(alone[0].status, "current");

  const clash = clashStatuses([
    { id: "older", area: "offsite", contradicts: ["newer"], predecessorId: null, checkpoint: 10 },
    { id: "newer", area: "offsite", contradicts: ["older"], predecessorId: "older", checkpoint: 90 },
  ]);
  assert.equal(clash.length, 2);
  assert.equal(clash.find((row) => row.id === "older").status, "clashing");
  assert.equal(clash.find((row) => row.id === "newer").status, "clashing");
  assert.notEqual(clash.find((row) => row.id === "newer").status, "current");

  const replaced = clashStatuses([
    { id: "old-plan", area: "offsite", contradicts: ["new-plan"], predecessorId: null, replacedBy: "new-plan" },
    { id: "new-plan", area: "offsite", contradicts: ["old-plan"], predecessorId: "old-plan", replaces: "old-plan", checkpoint: 200 },
  ]);
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((row) => row.id === "old-plan").status, "replaced");
  assert.equal(replaced.find((row) => row.id === "new-plan").status, "current");
});

test("a walrus blob id decodes to the little-endian id stored on the certification event", () => {
  assert.equal(
    blobIdDecimal("FqC_szXusTD8s7ADsC1KpZIwpy8ffj_tK8LtMhy7WIo"),
    "62575947033000038682330634974899207203795032031128080931274229481064074551318",
  );
});

test("a checkpoint later than when the result was knowable is refused", () => {
  const late = acceptCheckpoint({ checkpoint: 120, knowableAtCheckpoint: 100 });
  assert.equal(late.ok, false);
  assert.equal(late.reason, "late");
  const onTime = acceptCheckpoint({ checkpoint: 100, knowableAtCheckpoint: 100 });
  assert.deepEqual(onTime, { ok: true, stamp: 100 });
  const earlier = acceptCheckpoint({ checkpoint: 99, knowableAtCheckpoint: 100 });
  assert.equal(earlier.ok, true);
});
