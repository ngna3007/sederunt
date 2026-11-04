import {
  CONSOLE_COOKIE,
  clearedSessionCookie,
  guardConsole,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "../console-auth.js";
import { displayNameFromUser } from "./shared.js";

const REFRESH_SKEW_MS = 30 * 1000;

/**
 * Renew an OAuth access token that is expired or about to expire, then
 * replace the sealed cookie. A failed refresh signs the request out.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {object | null} identity
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {number} [now]
 * @returns {Promise<string>} Set-Cookie value, or "" when nothing changed
 */
export async function refreshOAuthSession(req, identity, env, now = Date.now()) {
  if (!identity) return "";
  const gate = guardConsole(req, env, now);
  if (gate.session?.kind !== "oauth") return "";
  if (typeof gate.session.accessExp === "number" && gate.session.accessExp - REFRESH_SKEW_MS > now) return "";
  try {
    const tokens = await identity.refresh(gate.session.refreshToken);
    const user = await identity.getUser(tokens.accessToken);
    if (!user?.id) throw new Error("unverified");
    let name = displayNameFromUser(user).slice(0, 80);
    try {
      const profile = await identity.profile(tokens.accessToken);
      if (profile?.display_name) name = String(profile.display_name).trim().slice(0, 80);
    } catch {
      // The verified user record is enough when the profile read fails.
    }
    const sealed = sealSession({
      kind: "oauth",
      memberId: user.id,
      userId: user.id,
      name,
      email: String(user.email || gate.session.email || "").toLowerCase(),
      exp: gate.session.exp,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || gate.session.refreshToken,
      accessExp: tokens.expiresAt,
      tenantId: gate.session.tenantId || "",
      onboarded: gate.session.onboarded === true,
    }, sessionSecret(env));
    req.headers.cookie = replaceCookie(req.headers.cookie, CONSOLE_COOKIE, sealed);
    const maxAge = Math.max(0, Math.floor((gate.session.exp - now) / 1000));
    return sessionCookie(sealed, req, maxAge);
  } catch {
    req.authFailure = "expired";
    req.headers.cookie = replaceCookie(req.headers.cookie, CONSOLE_COOKIE, "");
    return clearedSessionCookie(req);
  }
}

/**
 * Attach a refreshed session cookie to whatever response the route writes,
 * unless that route already replaced the session cookie.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {string} cookie
 */
export function rememberRefreshCookie(res, cookie) {
  if (!cookie) return;
  const writeHead = res.writeHead;
  let applied = false;
  res.writeHead = function patchedWriteHead(status, headers, ...rest) {
    if (applied) return writeHead.call(this, status, headers, ...rest);
    if (typeof headers === "string") {
      const nextHeaders = rest[0];
      if (nextHeaders && typeof nextHeaders === "object" && !Array.isArray(nextHeaders)) {
        applied = true;
        rest[0] = mergeCookie(nextHeaders, cookie);
        return writeHead.call(this, status, headers, ...rest);
      }
      applied = true;
      return writeHead.call(this, status, headers, mergeCookie({}, cookie));
    }
    if (headers == null || typeof headers !== "object" || Array.isArray(headers)) {
      applied = true;
      return writeHead.call(this, status, mergeCookie({}, cookie));
    }
    applied = true;
    return writeHead.call(this, status, mergeCookie(headers, cookie), ...rest);
  };
}

function mergeCookie(headers, cookie) {
  const next = { ...headers };
  const existing = next["set-cookie"] ?? next["Set-Cookie"];
  const list = existing == null ? [] : Array.isArray(existing) ? [...existing] : [existing];
  const replacesSession = list.some((item) => String(item).toLowerCase().includes("sederunt_session="));
  if (!replacesSession) next["set-cookie"] = list.length ? [...list, cookie] : cookie;
  return next;
}

function replaceCookie(header, name, value) {
  const parts = String(header || "").split(";").map((part) => part.trim()).filter((part) => part.includes("="));
  const kept = parts.filter((part) => part.slice(0, part.indexOf("=")) !== name);
  if (value) kept.push(`${name}=${encodeURIComponent(value)}`);
  return kept.join("; ");
}
