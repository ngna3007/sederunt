import assert from "node:assert/strict";
import test from "node:test";
import { proofMetadata, proofStatus } from "../scripts/console-live-proof.mjs";

test("the live proof records metadata keys, the five values, tags, and the delete status", () => {
  const viewed = proofMetadata({
    metadata: {
      sederunt_file_id: "proof-1",
      tenant_id: "00000000-0000-4000-a000-00000000acme",
      channel_id: "00000000-0000-4000-a000-00000000c001",
      owner_person_id: "00000000-0000-4000-a000-00000000a11c",
      slack_file_id: null,
      extra: "kept-as-a-key-only",
    },
    tags: ["tenant:0000000000004000a000000", "channel:0000000000004000a00000"],
  });
  assert.deepEqual(viewed.metadataKeys, [
    "sederunt_file_id",
    "tenant_id",
    "channel_id",
    "owner_person_id",
    "slack_file_id",
    "extra",
  ]);
  assert.equal(viewed.metadata.extra, undefined);
  assert.equal(viewed.metadata.sederunt_file_id, "proof-1");
  assert.equal(viewed.metadata.slack_file_id, null);
  assert.deepEqual(viewed.tags, ["tenant:0000000000004000a000000", "channel:0000000000004000a00000"]);
  assert.equal(proofStatus(null), "404");
  assert.equal(proofStatus({ status: "deleted" }), "deleted");
  assert.equal(proofStatus({ state: "deleting" }), "deleting");

  const parsed = proofMetadata({ metadata: JSON.stringify({ tenant_id: "t-1", channel_id: "c-1" }) });
  assert.deepEqual(parsed.metadataKeys, ["tenant_id", "channel_id"]);
  assert.deepEqual(parsed.metadata, { tenant_id: "t-1", channel_id: "c-1" });
});

test("proof metadata reads tags kept inside metadata", async () => {
  const { proofMetadata } = await import("../scripts/console-live-proof.mjs");
  const got = proofMetadata({ metadata: { tenant_id: "t", tags: ["tenant:t", "channel:c"] } });
  assert.deepEqual(got.tags, ["tenant:t", "channel:c"]);
});
