import { createHash, randomBytes } from "node:crypto";

/** RFC 7636 verifier. 32 bytes, base64url, no padding. */
export function createCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

/** S256 challenge. GoTrue expects the method name `s256`. */
export function codeChallengeFor(verifier) {
  return createHash("sha256").update(String(verifier)).digest("base64url");
}
