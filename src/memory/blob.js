/** Walrus blob ids are base64url of 32 bytes. The Blob object stores that id as a little-endian u256. */
export function blobIdBytes(blobId) {
  if (typeof blobId !== "string" || !blobId) return null;
  const pad = "=".repeat((4 - (blobId.length % 4)) % 4);
  let bytes;
  try {
    bytes = Buffer.from(blobId + pad, "base64url");
  } catch {
    return null;
  }
  return bytes.length === 32 ? bytes : null;
}

export function blobIdDecimal(blobId) {
  const bytes = blobIdBytes(blobId);
  if (!bytes) return "";
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index]);
  }
  return value.toString(10);
}

/**
 * Move Blob BCS, as published by the Walrus blob type:
 * UID (32), registered_epoch u32, blob_id u256, size u64, encoding u8,
 * then Option<u32> certified_epoch. A short buffer leaves certification unknown.
 */
export function decodeBlobContent(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (bytes.length < 68) return { blobIdBytes: null, certified: null };
  const id = Buffer.from(bytes.subarray(36, 68));
  if (bytes.length < 78) return { blobIdBytes: id, certified: null };
  const tag = bytes[77];
  if (tag === 0) return { blobIdBytes: id, certified: false };
  if (tag === 1) {
    const certifiedEpoch = bytes.length >= 82 ? bytes.readUInt32LE(78) : null;
    return { blobIdBytes: id, certified: true, certifiedEpoch };
  }
  return { blobIdBytes: id, certified: null };
}

export function encodeBlobContent({ blobId, certified = true, registeredEpoch = 1, size = 12 } = {}) {
  const id = blobIdBytes(blobId);
  if (!id) throw new Error("blob id must be 32 bytes");
  const extra = certified ? 4 : 0;
  const bytes = Buffer.alloc(78 + extra);
  bytes.writeUInt32LE(registeredEpoch, 32);
  id.copy(bytes, 36);
  bytes.writeBigUInt64LE(BigInt(size), 68);
  bytes[76] = 1;
  bytes[77] = certified ? 1 : 0;
  if (certified) bytes.writeUInt32LE(registeredEpoch, 78);
  return bytes;
}
