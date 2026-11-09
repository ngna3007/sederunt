import { createHmac, randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(deriveKey);
const SESSION_MS = 2 * 60 * 60 * 1000;
const COOKIE = "sederunt_admin";

export function adminConfigured(env) {
  return Boolean(env.SEDERUNT_ADMIN_USERNAME && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.SEDERUNT_ADMIN_PASSWORD_HASH || "") && String(env.SEDERUNT_ADMIN_SESSION_SECRET || "").length >= 32);
}

export async function hashAdminPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyAdminPassword(username, password, env) {
  if (!adminConfigured(env) || typeof password !== "string" || password.length > 256) return false;
  const [, salt, expected] = env.SEDERUNT_ADMIN_PASSWORD_HASH.split(":");
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && username === env.SEDERUNT_ADMIN_USERNAME;
}

export function sealAdminToken(value, env) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", env.SEDERUNT_ADMIN_SESSION_SECRET).update(body).digest("base64url")}`;
}

export function openAdminToken(token, env, now = Date.now()) {
  if (!adminConfigured(env) || typeof token !== "string" || token.length > 24000) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", env.SEDERUNT_ADMIN_SESSION_SECRET).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    return Number.isFinite(value.exp) && value.exp > now ? value : null;
  } catch { return null; }
}

export function adminSession(req, env) {
  const token = String(req.headers.cookie || "").split(";").map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const session = openAdminToken(token, env);
  return session?.kind === "admin" && session.username === env.SEDERUNT_ADMIN_USERNAME ? session : null;
}

export function newAdminSession(env) {
  return { kind: "admin", username: env.SEDERUNT_ADMIN_USERNAME, csrf: randomBytes(32).toString("base64url"), exp: Date.now() + SESSION_MS };
}

export function adminCookie(token, req, clear = false) {
  const secure = req.socket?.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function adminSameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  try {
    const origin = new URL(String(req.headers.origin || ""));
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const protocol = req.socket?.encrypted ? "https" : String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    return origin.host === host && origin.protocol === `${protocol}:`;
  } catch { return false; }
}
