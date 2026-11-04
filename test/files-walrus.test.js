import assert from "node:assert/strict";
import test from "node:test";
import {
  blobAlreadyGone,
  createMemoryWalrus,
  isRetryableWalrusError,
  withWalrusRetry,
} from "../src/files/walrus.js";

class RetryableWalrusClientError extends Error {
  constructor() {
    super("behind the epoch");
  }
}

test("a deletable blob can be written, read, and deleted, and a second delete is success", async () => {
  const walrus = createMemoryWalrus();
  const written = await walrus.writeBlob({
    bytes: Buffer.from("hello"),
    deletable: true,
    epochs: 3,
    attributes: { "sederunt:file_id": "file-1" },
  });
  assert.equal(written.deletable, true);
  assert.equal(walrus.object(written.objectId).attributes["sederunt:file_id"], "file-1");
  assert.equal((await walrus.readBlob({ blobId: written.blobId })).toString(), "hello");
  const removed = await walrus.deleteBlob({ blobObjectId: written.objectId });
  assert.equal(removed.alreadyGone, false);
  const again = await walrus.deleteBlob({ blobObjectId: written.objectId });
  assert.equal(again.alreadyGone, true);
  assert.equal(blobAlreadyGone(new Error("blob already deleted")), true);
  assert.equal(blobAlreadyGone(new Error("storage unavailable")), false);
});

test("a permanent blob is refused", async () => {
  const walrus = createMemoryWalrus();
  await assert.rejects(() => walrus.writeBlob({ bytes: Buffer.from("x"), deletable: false, epochs: 1 }));
});

test("a retryable Walrus error resets the client and tries again", async () => {
  const client = { resets: 0, reset() { this.resets += 1; } };
  let calls = 0;
  const value = await withWalrusRetry(client, async () => {
    calls += 1;
    if (calls === 1) throw new RetryableWalrusClientError();
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(client.resets, 1);
  assert.equal(isRetryableWalrusError(new RetryableWalrusClientError()), true);
  assert.equal(isRetryableWalrusError(new Error("no")), false);
});
