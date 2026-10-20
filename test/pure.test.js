import assert from "node:assert/strict";
import test from "node:test";
import { authorize } from "../src/domain/allow.js";
import { clashStatuses } from "../src/domain/clash.js";
import { acceptCheckpoint } from "../src/domain/stamp.js";
import { itemStatus } from "../src/domain/status.js";
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

test("a read needs no allow, and a write or delete needs one that covers that tool", () => {
  assert.deepEqual(
    authorize({
      action: "read",
      tool: "linear.list_issues",
      standingAllows: [],
      spokenYes: null,
    }),
    { allowed: true, reason: "read" },
  );
  assert.equal(
    authorize({
      action: "write",
      tool: "linear.create_issue",
      proposalId: "proposal:venue",
      standingAllows: [],
      spokenYes: null,
    }).allowed,
    false,
  );
  assert.equal(
    authorize({
      action: "delete",
      tool: "linear.delete_issue",
      proposalId: "proposal:drop",
      standingAllows: [],
      spokenYes: null,
    }).allowed,
    false,
  );
  assert.equal(
    authorize({
      action: "write",
      tool: "linear.create_issue",
      proposalId: "proposal:venue",
      standingAllows: [{ tool: "linear.create_issue" }],
      spokenYes: null,
    }).reason,
    "standing",
  );
  const yes = { proposalId: "proposal:venue", tool: "linear.create_issue" };
  assert.equal(
    authorize({
      action: "write",
      tool: "linear.create_issue",
      proposalId: "proposal:venue",
      standingAllows: [],
      spokenYes: yes,
    }).reason,
    "spoken-yes",
  );
  assert.equal(
    authorize({
      action: "write",
      tool: "linear.create_issue",
      proposalId: "proposal:other",
      standingAllows: [],
      spokenYes: yes,
    }).allowed,
    false,
  );
  assert.equal(
    authorize({
      action: "delete",
      tool: "linear.delete_issue",
      proposalId: "proposal:venue",
      standingAllows: [],
      spokenYes: yes,
    }).allowed,
    false,
  );
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
