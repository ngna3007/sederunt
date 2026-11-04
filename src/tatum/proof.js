import { blobIdBytes, decodeBlobContent } from "../memory/blob.js";

/**
 * A memory is verified when the Blob exists, its blob id matches, it is
 * certified, the owner matches when one was expected, and the certifying
 * checkpoint and time are known. A mismatch is unverified. A missing read
 * is unknown. The owner address is not part of the result.
 *
 * @param {{ object?: object, blobId?: string, owner?: string }} input
 */
export function verifyMemory(input = {}) {
  const object = input.object;
  const blobId = typeof input.blobId === "string" && input.blobId ? input.blobId : null;
  const base = {
    blobId,
    objectId: typeof object?.objectId === "string" ? object.objectId : null,
    digest: object?.certifyingDigest || object?.previousTransaction || null,
    checkpoint: Number.isInteger(object?.checkpoint) ? object.checkpoint : null,
    checkpointTime: typeof object?.checkpointTime === "string" ? object.checkpointTime : null,
  };
  if (!object?.objectId) {
    return { ...base, status: "unknown", reason: "The chain proof is incomplete." };
  }
  const decoded = object.content ? decodeBlobContent(object.content) : { blobIdBytes: null, certified: null };
  const hard = [];
  const soft = [];
  if (blobId) {
    const expected = blobIdBytes(blobId);
    if (!expected || !decoded.blobIdBytes) soft.push("The blob id could not be read.");
    else if (!decoded.blobIdBytes.equals(expected)) hard.push("The blob id does not match.");
  }
  if (decoded.certified === false) hard.push("The blob is not certified.");
  else if (decoded.certified == null) soft.push("Certification could not be read.");
  if (input.owner && object.ownerAddress && object.ownerAddress.toLowerCase() !== String(input.owner).toLowerCase()) {
    hard.push("The owner does not match.");
  }
  if (!Number.isInteger(object.checkpoint)) soft.push("The certifying checkpoint is unknown.");
  if (!object.checkpointTime) soft.push("The checkpoint time is unknown.");
  if (hard.length) return { ...base, status: "unverified", reason: hard[0] };
  if (soft.length) return { ...base, status: "unknown", reason: soft[0] };
  return { ...base, status: "verified", reason: "The blob is certified on Sui." };
}

export function suiscanLinks(proof) {
  const links = {};
  if (typeof proof?.objectId === "string" && proof.objectId) {
    links.object = `https://suiscan.xyz/mainnet/object/${proof.objectId}`;
  }
  if (typeof proof?.digest === "string" && proof.digest) {
    links.tx = `https://suiscan.xyz/mainnet/tx/${proof.digest}`;
  }
  if (Number.isInteger(proof?.checkpoint)) {
    links.checkpoint = `https://suiscan.xyz/mainnet/checkpoint/${proof.checkpoint}`;
  }
  return links;
}

/** Fields the console may show. No owner address. */
export function publicProof(proof) {
  if (!proof || typeof proof !== "object") {
    return { status: "unknown", reason: "The chain proof is incomplete.", links: {} };
  }
  const view = {
    status: proof.status === "verified" || proof.status === "unverified" ? proof.status : "unknown",
    reason: typeof proof.reason === "string" ? proof.reason : "The chain proof is incomplete.",
    blobId: typeof proof.blobId === "string" ? proof.blobId : null,
    objectId: typeof proof.objectId === "string" ? proof.objectId : null,
    digest: typeof proof.digest === "string" ? proof.digest : null,
    checkpoint: Number.isInteger(proof.checkpoint) ? proof.checkpoint : null,
    checkpointTime: typeof proof.checkpointTime === "string" ? proof.checkpointTime : null,
  };
  view.links = suiscanLinks(view);
  return view;
}
