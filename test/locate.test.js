import assert from "node:assert/strict";
import test from "node:test";
import { locateMemory } from "../src/memory/locate.js";

const blobId = "FqC_szXusTD8s7ADsC1KpZIwpy8ffj_tK8LtMhy7WIo";
const blobDecimal = "62575947033000038682330634974899207203795032031128080931274229481064074551318";
const objectId = "0x1a13b3bb2fed62845bd3269fc09c7157c645e9f1fa6a2ac4b399dc153ee6b7c2";
const digest = "C1J2cwJJQyaXZYBWqaDY5LRJHALA8JrtobJgD9BoWFjq";
const checkpoint = 335852087;

test("locateMemory returns the certifying checkpoint when it is outside the latest 50", async () => {
  const eventCalls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.query.includes("object(address")) {
      return json({
        data: {
          object: {
            address: objectId,
            asMoveObject: { contents: { type: { repr: "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob" } } },
          },
        },
      });
    }
    eventCalls.push(body.variables?.before ?? null);
    const before = body.variables?.before ?? null;
    if (before == null) {
      return json({
        data: {
          events: {
            pageInfo: { hasPreviousPage: true, startCursor: "older-page" },
            nodes: Array.from({ length: 50 }, (_unused, index) => ({
              contents: { json: { blob_id: String(index + 1), object_id: "0x1" } },
              transaction: { digest: `miss-${index}`, effects: { checkpoint: { sequenceNumber: 335861000 + index } } },
            })),
          },
        },
      });
    }
    assert.equal(before, "older-page");
    return json({
      data: {
        events: {
          pageInfo: { hasPreviousPage: true, startCursor: "older-still" },
          nodes: [
            {
              contents: { json: { blob_id: blobDecimal, object_id: objectId } },
              transaction: { digest, effects: { checkpoint: { sequenceNumber: checkpoint } } },
            },
          ],
        },
      },
    });
  };

  try {
    const found = await locateMemory(blobId);
    assert.equal(found.checkpoint, checkpoint);
    assert.equal(found.digest, digest);
    assert.equal(found.objectId, objectId);
    assert.deepEqual(eventCalls, [null, "older-page"]);
  } finally {
    globalThis.fetch = async () => {
      throw new Error("locate test must not call the network");
    };
  }
});

function json(payload) {
  return { json: async () => payload };
}
