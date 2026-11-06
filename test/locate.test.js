import assert from "node:assert/strict";
import test from "node:test";
import { encodeBlobContent } from "../src/memory/blob.js";
import { locateMemory, WALRUS_BLOB_TYPE } from "../src/memory/locate.js";

const blobId = "FqC_szXusTD8s7ADsC1KpZIwpy8ffj_tK8LtMhy7WIo";
const objectId = "0x1a13b3bb2fed62845bd3269fc09c7157c645e9f1fa6a2ac4b399dc153ee6b7c2";
const otherId = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const owner = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const digest = "C1J2cwJJQyaXZYBWqaDY5LRJHALA8JrtobJgD9BoWFjq";
const checkpoint = 335852087;

test("locateMemory matches an owned Blob over gRPC and reads the certifying checkpoint", async () => {
  const pages = [];
  const reads = [];
  const txs = [];
  const tatum = {
    async listOwnedObjects(query) {
      pages.push(query);
      assert.equal(query.owner, owner);
      assert.equal(query.type, WALRUS_BLOB_TYPE);
      assert.equal(query.limit, 50);
      if (!query.cursor) {
        return {
          objects: [{ objectId: otherId, content: encodeBlobContent({ blobId: otherBlob(), certified: true }) }],
          hasNextPage: true,
          cursor: "older-page",
        };
      }
      assert.equal(query.cursor, "older-page");
      return {
        objects: [{
          objectId,
          previousTransaction: digest,
          content: encodeBlobContent({ blobId, certified: true }),
        }],
        hasNextPage: false,
        cursor: null,
      };
    },
    async getObject(id) {
      reads.push(id);
      return {
        objectId: id,
        previousTransaction: digest,
        content: encodeBlobContent({ blobId, certified: true }),
      };
    },
    async getTransaction(id) {
      txs.push(id);
      return { digest: id, checkpoint, timestampMs: 1_762_160_000_000 };
    },
  };
  const found = await locateMemory(blobId, { tatum, owner });
  assert.equal(found.objectId, objectId);
  assert.equal(found.digest, digest);
  assert.equal(found.checkpoint, checkpoint);
  assert.equal(found.checkpointTime, new Date(1_762_160_000_000).toISOString());
  assert.deepEqual(reads, [objectId]);
  assert.deepEqual(txs, [digest]);
  assert.equal(pages.length, 2);
});

test("a stored object id is one GetObject and does not list owned objects", async () => {
  let listed = 0;
  const tatum = {
    async listOwnedObjects() {
      listed += 1;
      return { objects: [] };
    },
    async getObject(id) {
      return {
        objectId: id,
        certifyingDigest: digest,
        checkpoint,
        checkpointTime: "2026-11-03T02:32:22.000Z",
        content: encodeBlobContent({ blobId, certified: true }),
      };
    },
  };
  const found = await locateMemory(blobId, { tatum, owner, objectId });
  assert.equal(listed, 0);
  assert.equal(found.objectId, objectId);
  assert.equal(found.checkpoint, checkpoint);
  assert.equal(found.digest, digest);
});

test("locateMemory does not scan the chain when the owner is missing", async () => {
  let listed = 0;
  const found = await locateMemory(blobId, {
    tatum: {
      async listOwnedObjects() {
        listed += 1;
        return { objects: [] };
      },
      async getObject() {
        throw new Error("should not read");
      },
    },
    owner: "fixture",
  });
  assert.equal(listed, 0);
  assert.equal(found.objectId, null);
  assert.equal(found.locateError, "The blob owner is required to list owned objects.");
});

test("locateMemory reports a missing Tatum key and does not call", async () => {
  const found = await locateMemory(blobId, { owner });
  assert.equal(found.locateError, "Tatum key not set");
  assert.equal(found.objectId, null);
});

function otherBlob() {
  return Buffer.alloc(32, 7).toString("base64url");
}
