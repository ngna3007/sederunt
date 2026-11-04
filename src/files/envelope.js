import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("SDRF");
const VERSION = 1;
const MODE_SEAL = 1;
const MODE_WRAP = 2;

/**
 * Envelope for one file.
 * The bytes are AES-256-GCM. Only the AES key is Seal-encrypted, or, when
 * Seal is not published, wrapped under a key derived from the server secret.
 * The AES key is not returned and is not written to Postgres. It lives only
 * inside this header, which travels with the Walrus blob.
 *
 * Mode 1 is Seal (testnet key servers, `move/sederunt_files`). Mode 2 wraps
 * the AES key with the server secret when no Seal client is passed (demo,
 * tests, or Seal not configured). The AES key is never stored.
 *
 * @param {Uint8Array} plain
 * @param {{ seal?: { encryptKey: Function, decryptKey: Function } | null, serverSecret?: string, aad?: Buffer }} options
 */
export async function sealEnvelope(plain, options = {}) {
  const bytes = Buffer.from(plain);
  const dataKey = randomBytes(32);
  const ciphertext = aesEncrypt(bytes, dataKey, options.aad);
  const seal = options.seal;
  if (seal) {
    const wrapped = await seal.encryptKey(dataKey);
    const header = encodeSealHeader(wrapped);
    dataKey.fill(0);
    return { bytes: pack(MODE_SEAL, header, ciphertext), mode: "seal" };
  }
  const secret = options.serverSecret;
  if (!secret) throw new Error("File encryption is not configured");
  const header = wrapKey(dataKey, secret);
  dataKey.fill(0);
  return { bytes: pack(MODE_WRAP, header, ciphertext), mode: "server-wrap" };
}

/** @param {Uint8Array} packed */
export async function openEnvelope(packed, options = {}) {
  const parsed = unpack(Buffer.from(packed));
  let dataKey;
  if (parsed.mode === MODE_SEAL) {
    if (!options.seal) throw new Error("Seal is not configured");
    const header = decodeSealHeader(parsed.header);
    dataKey = Buffer.from(await options.seal.decryptKey(header));
  } else if (parsed.mode === MODE_WRAP) {
    if (!options.serverSecret) throw new Error("File encryption is not configured");
    dataKey = unwrapKey(parsed.header, options.serverSecret);
  } else {
    throw new Error("File envelope is not readable");
  }
  try {
    return aesDecrypt(parsed.ciphertext, dataKey, options.aad);
  } finally {
    dataKey.fill(0);
  }
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

/**
 * Test double. Hides the AES key under a hash of the seal id so the header
 * is not the raw key. Not Seal.
 */
export function createLoopbackSeal() {
  return {
    async encryptKey(key) {
      const sealId = randomBytes(16);
      const packageId = "0xloop";
      const serviceObjectId = "0xservice";
      return {
        sealId,
        packageId,
        serviceObjectId,
        encryptedObject: mask(Buffer.from(key), sealId),
      };
    },
    async decryptKey({ sealId, encryptedObject }) {
      return mask(Buffer.from(encryptedObject), Buffer.from(sealId));
    },
  };
}

function pack(mode, header, ciphertext) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length, 0);
  return Buffer.concat([MAGIC, Buffer.from([VERSION, mode]), length, header, ciphertext]);
}

function unpack(buf) {
  if (buf.length < 10 || !buf.subarray(0, 4).equals(MAGIC) || buf[4] !== VERSION) {
    throw new Error("File envelope is not readable");
  }
  const mode = buf[5];
  const headerLen = buf.readUInt32BE(6);
  const headerStart = 10;
  const headerEnd = headerStart + headerLen;
  if (headerEnd > buf.length) throw new Error("File envelope is not readable");
  return { mode, header: buf.subarray(headerStart, headerEnd), ciphertext: buf.subarray(headerEnd) };
}

function encodeSealHeader(wrapped) {
  const sealId = Buffer.from(wrapped.sealId);
  const encrypted = Buffer.from(wrapped.encryptedObject);
  const packageId = Buffer.from(String(wrapped.packageId || ""));
  const serviceObjectId = Buffer.from(String(wrapped.serviceObjectId || ""));
  if (sealId.length > 65535 || packageId.length > 255 || serviceObjectId.length > 255) {
    throw new Error("Seal header is too large");
  }
  const encLen = Buffer.alloc(4);
  encLen.writeUInt32BE(encrypted.length, 0);
  const sealLen = Buffer.alloc(2);
  sealLen.writeUInt16BE(sealId.length, 0);
  return Buffer.concat([
    Buffer.from([packageId.length]),
    packageId,
    Buffer.from([serviceObjectId.length]),
    serviceObjectId,
    sealLen,
    sealId,
    encLen,
    encrypted,
  ]);
}

function decodeSealHeader(header) {
  let offset = 0;
  const packageLen = header[offset];
  offset += 1;
  const packageId = header.subarray(offset, offset + packageLen).toString("utf8");
  offset += packageLen;
  const objectLen = header[offset];
  offset += 1;
  const serviceObjectId = header.subarray(offset, offset + objectLen).toString("utf8");
  offset += objectLen;
  const sealLen = header.readUInt16BE(offset);
  offset += 2;
  const sealId = header.subarray(offset, offset + sealLen);
  offset += sealLen;
  const encLen = header.readUInt32BE(offset);
  offset += 4;
  const encryptedObject = header.subarray(offset, offset + encLen);
  return { packageId, serviceObjectId, sealId, encryptedObject };
}

function wrapKey(dataKey, secret) {
  const kek = deriveKek(secret);
  try {
    return aesEncrypt(dataKey, kek);
  } finally {
    kek.fill(0);
  }
}

function unwrapKey(header, secret) {
  const kek = deriveKek(secret);
  try {
    return aesDecrypt(header, kek);
  } finally {
    kek.fill(0);
  }
}

function deriveKek(secret) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(String(secret)), Buffer.from("sederunt-files"), Buffer.from("aes-key-wrap-v1"), 32));
}

function aesEncrypt(plain, key, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

function aesDecrypt(packed, key, aad) {
  if (packed.length < 12 + 16) throw new Error("File envelope is not readable");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(packed.length - 16);
  const body = packed.subarray(12, packed.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

function mask(bytes, sealId) {
  const pad = createHash("sha256").update(Buffer.from(sealId)).digest();
  const out = Buffer.from(bytes);
  for (let i = 0; i < out.length; i += 1) out[i] ^= pad[i % pad.length];
  return out;
}
