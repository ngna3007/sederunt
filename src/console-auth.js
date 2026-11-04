import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { identityConfigured } from "./identity/shared.js";

/** Cookie that proves a console sign-in, either the passphrase or OAuth. */
export const CONSOLE_COOKIE = "sederunt_session";

/** How long a console sign-in stays valid. */
export const CONSOLE_SESSION_MS = 12 * 60 * 60 * 1000;

const PASSPHRASE_KEY = "sederunt-console-passphrase";

/**
 * Passphrase sign-in. Webhooks and MCP do not read it. OAuth uses sessionSecret.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function consoleSecret(env = {}) {
  const secret = typeof env.SEDERUNT_CONSOLE_SECRET === "string" ? env.SEDERUNT_CONSOLE_SECRET.trim() : "";
  return secret;
}

let processSessionKey = "";
let processSessionWarned = false;

/**
 * Seals the OAuth cookie. The passphrase secret is the fallback so a process
 * that already has one key does not grow a second. With neither set, the key
 * lives only in this process and a restart drops every session.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function sessionSecret(env = {}) {
  const configured = typeof env.SEDERUNT_SESSION_SECRET === "string" ? env.SEDERUNT_SESSION_SECRET.trim() : "";
  if (configured) return configured;
  const passphrase = consoleSecret(env);
  if (passphrase) return passphrase;
  if (!processSessionKey) processSessionKey = randomBytes(32).toString("base64url");
  if (!processSessionWarned) {
    processSessionWarned = true;
    console.warn("SEDERUNT_SESSION_SECRET is not set. Using a random per-process key. Sessions will not survive a restart.");
  }
  return processSessionKey;
}

/** @param {object} payload @param {string} secret */
export function sealPayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {{ ok: true, payload: object } | { ok: false, reason: "missing" | "invalid" }}
 */
export function openPayload(token, secret) {
  if (!token || !secret) return { ok: false, reason: "missing" };
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, reason: "invalid" };
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "invalid" };
  }
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
  if (fields.kind === "oauth") {
    payload.kind = "oauth";
    payload.userId = typeof fields.userId === "string" ? fields.userId : payload.memberId;
    payload.email = typeof fields.email === "string" ? fields.email.slice(0, 320) : "";
    payload.accessToken = typeof fields.accessToken === "string" ? fields.accessToken : "";
    payload.refreshToken = typeof fields.refreshToken === "string" ? fields.refreshToken : "";
    payload.accessExp = typeof fields.accessExp === "number" ? fields.accessExp : payload.exp;
  }
  return sealPayload(payload, secret);
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [now]
 * @returns {{ ok: true, memberId: string, name: string, exp: number } | { ok: false, reason: "missing" | "invalid" | "expired" }}
 */
export function openSession(token, secret, now = Date.now()) {
  const opened = openPayload(token, secret);
  if (!opened.ok) return opened;
  const payload = opened.payload;
  if (typeof payload.exp !== "number") return { ok: false, reason: "invalid" };
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  const session = {
    ok: true,
    memberId: typeof payload.memberId === "string" ? payload.memberId : "",
    name: typeof payload.name === "string" ? payload.name : "",
    exp: payload.exp,
  };
  if (payload.kind === "oauth") {
    session.kind = "oauth";
    session.userId = typeof payload.userId === "string" ? payload.userId : session.memberId;
    session.email = typeof payload.email === "string" ? payload.email : "";
    session.accessToken = typeof payload.accessToken === "string" ? payload.accessToken : "";
    session.refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : "";
    session.accessExp = typeof payload.accessExp === "number" ? payload.accessExp : 0;
  }
  return session;
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
  if (value.startsWith("/console/sign-in") || value.startsWith("/console/sign-out") || value.startsWith("/console/auth")) return "/console";
  return value;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {number} [now]
 */
export function guardConsole(req, env, now = Date.now()) {
  if (req?.authFailure) return { required: true, session: null, reason: req.authFailure };
  const passSecret = consoleSecret(env);
  const identityOn = identityConfigured(env);
  if (!passSecret && !identityOn) return { required: false, session: null, reason: "" };
  const token = readCookie(req.headers?.cookie, CONSOLE_COOKIE);
  if (!token) return { required: true, session: null, reason: "missing" };
  const key = sessionSecret(env);
  let opened = openSession(token, key, now);
  if (!opened.ok && passSecret && passSecret !== key) opened = openSession(token, passSecret, now);
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
