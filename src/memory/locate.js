import { blobIdBytes, decodeBlobContent } from "./blob.js";

export const WALRUS_BLOB_TYPE = "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob";
const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

export { blobIdDecimal } from "./blob.js";

/**
 * Resolve a Walrus blob id to its Blob object, the certifying transaction,
 * and that transaction's checkpoint. ListOwnedObjects needs the owner address
 * returned by remember. A stored object id skips the list and is one GetObject.
 * There is no whole-chain scan. A miss returns nulls and a locateError.
 *
 * @param {string} blobId
 * @param {{ tatum?: object, owner?: string, objectId?: string }} [options]
 */
export async function locateMemory(blobId, options = {}) {
  if (!blobId) return { objectId: null, checkpoint: null, digest: null };
  const idBytes = blobIdBytes(blobId);
  if (!idBytes) {
    return { objectId: null, checkpoint: null, digest: null, blobId, locateError: "The blob id is not 32 bytes." };
  }
  const tatum = options.tatum;
  if (!tatum || typeof tatum.getObject !== "function") {
    return { objectId: null, checkpoint: null, digest: null, blobId, locateError: "Tatum key not set" };
  }
  if (typeof options.objectId === "string" && OBJECT_ID.test(options.objectId)) {
    return readKnown(tatum, options.objectId, blobId, idBytes);
  }
  if (!OBJECT_ID.test(options.owner || "") || typeof tatum.listOwnedObjects !== "function") {
    return {
      objectId: null,
      checkpoint: null,
      digest: null,
      blobId,
      locateError: "The blob owner is required to list owned objects.",
    };
  }
  let cursor = undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listed = await tatum.listOwnedObjects({
      owner: options.owner,
      type: WALRUS_BLOB_TYPE,
      cursor,
      limit: PAGE_SIZE,
    });
    const objects = Array.isArray(listed?.objects) ? listed.objects : [];
    const match = objects.find((object) => contentMatches(object?.content, idBytes));
    if (match?.objectId) return readKnown(tatum, match.objectId, blobId, idBytes, match.previousTransaction);
    if (!listed?.hasNextPage || !listed.cursor || listed.cursor === cursor) break;
    cursor = listed.cursor;
  }
  return {
    objectId: null,
    checkpoint: null,
    digest: null,
    blobId,
    locateError: "No owned Blob matched this blob id.",
  };
}

async function readKnown(tatum, objectId, blobId, idBytes, knownTx) {
  const object = await tatum.getObject(objectId);
  const content = object?.content ?? null;
  if (content && !contentMatches(content, idBytes)) {
    return {
      objectId: null,
      checkpoint: null,
      digest: null,
      blobId,
      locateError: "The object blob id does not match.",
    };
  }
  let digest = object?.certifyingDigest || object?.previousTransaction || knownTx || null;
  let checkpoint = Number.isInteger(object?.checkpoint) ? object.checkpoint : null;
  let checkpointTime = object?.checkpointTime || null;
  if (digest && checkpoint == null && typeof tatum.getTransaction === "function") {
    try {
      const tx = await tatum.getTransaction(digest);
      digest = tx?.digest || digest;
      checkpoint = Number.isInteger(tx?.checkpoint) ? tx.checkpoint : null;
      if (tx?.timestampMs != null) checkpointTime = new Date(tx.timestampMs).toISOString();
    } catch {
      checkpoint = null;
    }
  }
  return {
    objectId: object?.objectId || objectId,
    digest,
    checkpoint,
    checkpointTime,
    blobId,
    objectType: object?.objectType || null,
    content,
    ownerAddress: object?.ownerAddress || null,
  };
}

function contentMatches(content, idBytes) {
  if (!content) return false;
  const decoded = decodeBlobContent(content);
  return Boolean(decoded.blobIdBytes && decoded.blobIdBytes.equals(idBytes));
}
