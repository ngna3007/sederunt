import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { connectorError } from "./errors.js";

/**
 * 32-byte AES key from MCP_SECRETS_KEY_V1 (64 hex chars, or base64 of 32 bytes).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Buffer}
 */
export function secretsKey(env = process.env) {
  const raw = String(env.MCP_SECRETS_KEY_V1 || "").trim();
  if (!raw) throw connectorError("secrets-key");
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    key = Buffer.from(padded, "base64");
  }
  if (key.length !== 32) throw connectorError("secrets-key");
  return key;
}

/**
 * @param {string} plaintext
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function sealSecret(plaintext, env = process.env) {
  const key = secretsKey(env);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const ciphertext = Buffer.concat([body, cipher.getAuthTag()]);
  return { ciphertext, nonce, keyVersion: 1 };
}

/**
 * @param {{ ciphertext: Buffer, nonce: Buffer, keyVersion?: number }} record
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function openSecret(record, env = process.env) {
  const key = secretsKey(env);
  const blob = Buffer.isBuffer(record.ciphertext) ? record.ciphertext : Buffer.from(record.ciphertext);
  const nonce = Buffer.isBuffer(record.nonce) ? record.nonce : Buffer.from(record.nonce);
  if (blob.length < 17 || nonce.length !== 12) throw connectorError("secrets-key");
  const tag = blob.subarray(blob.length - 16);
  const data = blob.subarray(0, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * @param {{ token?: string, headerName?: string }} secret
 */
export function encodeSecret(secret) {
  return JSON.stringify({
    token: String(secret.token || ""),
    headerName: String(secret.headerName || "Authorization"),
  });
}

/**
 * @param {string} plaintext
 */
export function decodeSecret(plaintext) {
  const parsed = JSON.parse(plaintext);
  return {
    token: typeof parsed.token === "string" ? parsed.token : "",
    headerName: typeof parsed.headerName === "string" && parsed.headerName ? parsed.headerName : "Authorization",
  };
}
