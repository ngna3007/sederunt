import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie that proves the operator passed the console passphrase. */
export const CONSOLE_COOKIE = "sederunt_session";

/** How long a console sign-in stays valid. */
export const CONSOLE_SESSION_MS = 12 * 60 * 60 * 1000;

const PASSPHRASE_KEY = "sederunt-console-passphrase";

/**
 * The console has no user directory. Sign-in is on only when this process
 * was given a passphrase. Webhooks and MCP do not read it.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function consoleSecret(env = {}) {
  const secret = typeof env.SEDERUNT_CONSOLE_SECRET === "string" ? env.SEDERUNT_CONSOLE_SECRET.trim() : "";
  return secret;
}

/**
 * Constant-time passphrase check. A length difference is not a timing leak.
 *
 * @param {string} given
 * @param {string} secret
 */
export function passphraseMatches(given, secret) {
  const left = createHmac("sha256", PASSPHRASE_KEY).update(String(given)).digest();
  const right = createHmac("sha256", PASSPHRASE_KEY).update(String(secret)).digest();
  return timingSafeEqual(left, right);
}

/**
 * Signed cookie body. The member id is the process member, not a name the
 * form invented. `name` is only the label shown in the console.
 *
 * @param {{ memberId?: string, name?: string, exp?: number }} fields
 * @param {string} secret
 */
export function sealSession(fields, secret) {
  const payload = {
    memberId: typeof fields.memberId === "string" ? fields.memberId : "",
    name: typeof fields.name === "string" ? fields.name.slice(0, 80) : "",
    exp: typeof fields.exp === "number" ? fields.exp : Date.now() + CONSOLE_SESSION_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [now]
 * @returns {{ ok: true, memberId: string, name: string, exp: number } | { ok: false, reason: "missing" | "invalid" | "expired" }}
 */
export function openSession(token, secret, now = Date.now()) {
  if (!token || !secret) return { ok: false, reason: "missing" };
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, reason: "invalid" };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!payload || typeof payload.exp !== "number") return { ok: false, reason: "invalid" };
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    memberId: typeof payload.memberId === "string" ? payload.memberId : "",
    name: typeof payload.name === "string" ? payload.name : "",
    exp: payload.exp,
  };
}

/** @param {string | undefined} header */
export function readCookie(header, name) {
  const source = typeof header === "string" ? header : "";
  for (const part of source.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return "";
}

/**
 * Only a console path may be the page after sign-in.
 * Anything else goes to the console home.
 *
 * @param {string} value
 */
export function safeConsoleNext(value) {
  if (typeof value !== "string") return "/console";
  if (!value.startsWith("/console")) return "/console";
  if (value.startsWith("//") || value.includes("\\") || value.includes("\n") || value.includes("\r")) return "/console";
  if (value.startsWith("/console/sign-in") || value.startsWith("/console/sign-out")) return "/console";
  return value;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {number} [now]
 */
export function guardConsole(req, env, now = Date.now()) {
  const secret = consoleSecret(env);
  if (!secret) return { required: false, session: null, reason: "" };
  const token = readCookie(req.headers?.cookie, CONSOLE_COOKIE);
  if (!token) return { required: true, session: null, reason: "missing" };
  const opened = openSession(token, secret, now);
  if (!opened.ok) return { required: true, session: null, reason: opened.reason };
  return { required: true, session: opened, reason: "" };
}

/**
 * @param {string} token
 * @param {import("node:http").IncomingMessage} req
 * @param {number} maxAgeSeconds
 */
export function sessionCookie(token, req, maxAgeSeconds) {
  const forwarded = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = proto === "https" || req.socket?.encrypted === true;
  const parts = [
    `${CONSOLE_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Cookie that removes the console session. */
export function clearedSessionCookie(req) {
  return sessionCookie("", req, 0);
}
