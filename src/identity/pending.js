import { openPayload, readCookie, sealPayload } from "../console-auth.js";

/** Short-lived cookie holding the PKCE verifier and the post-login path. */
export const OAUTH_COOKIE = "sederunt_oauth";

/** @param {unknown} value */
function oauthIntent(value) {
  return value === "forms" || value === "calendar" ? value : "";
}

export const OAUTH_PENDING_MS = 10 * 60 * 1000;

/**
 * @param {{ verifier: string, challenge: string, next: string, provider: string, intent?: string }} fields
 * @param {string} secret
 * @param {number} [now]
 */
export function sealPending(fields, secret, now = Date.now()) {
  return sealPayload({
    verifier: fields.verifier,
    challenge: fields.challenge,
    next: fields.next,
    provider: fields.provider,
    intent: oauthIntent(fields.intent),
    exp: now + OAUTH_PENDING_MS,
  }, secret);
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [now]
 */
export function openPending(token, secret, now = Date.now()) {
  const opened = openPayload(token, secret);
  if (!opened.ok) return opened;
  const payload = opened.payload;
  if (typeof payload.exp !== "number" || typeof payload.verifier !== "string" || typeof payload.challenge !== "string") {
    return { ok: false, reason: "invalid" };
  }
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    verifier: payload.verifier,
    challenge: payload.challenge,
    next: typeof payload.next === "string" ? payload.next : "/console",
    provider: typeof payload.provider === "string" ? payload.provider : "",
    intent: oauthIntent(payload.intent),
    exp: payload.exp,
  };
}

/**
 * @param {string} token
 * @param {import("node:http").IncomingMessage} req
 * @param {number} maxAgeSeconds
 */
export function oauthPendingCookie(token, req, maxAgeSeconds) {
  const forwarded = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = proto === "https" || req.socket?.encrypted === true;
  const parts = [
    `${OAUTH_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/console/auth",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** @param {import("node:http").IncomingMessage} req */
export function clearOAuthCookie(req) {
  return oauthPendingCookie("", req, 0);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {string} secret
 * @param {number} [now]
 */
export function readPending(req, secret, now = Date.now()) {
  return openPending(readCookie(req.headers?.cookie, OAUTH_COOKIE), secret, now);
}
