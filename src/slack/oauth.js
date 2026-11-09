import { randomBytes, timingSafeEqual } from "node:crypto";
import { openPayload, readCookie, sealPayload, sessionSecret } from "../console-auth.js";
import { slackOAuthConfigured } from "./installations.js";

/**
 * Add to Slack (OAuth v2) for one Sederunt workspace (tenant).
 *
 *   GET /console/slack/install?next=/console/setup
 *     owner/admin of the active workspace -> slack.com/oauth/v2/authorize
 *   GET /console/slack/callback?code=...&state=...
 *     same signed-in person, still owner/admin, state matches the cookie,
 *     oauth.v2.access -> sealed bot token saved for that tenant only.
 *
 * Bot scopes match the Web API methods Sederunt calls (auth.test,
 * chat.postMessage + username, chat.getPermalink, conversations.history/
 * list/members, users.lookupByEmail, files) and the events it reads.
 */
export const SLACK_INSTALL_PATH = "/console/slack/install";
export const SLACK_CALLBACK_PATH = "/console/slack/callback";
export const SLACK_STATE_COOKIE = "sederunt_slack_oauth";
export const SLACK_BOT_SCOPES = Object.freeze([
  "app_mentions:read",
  "channels:history",
  "channels:read",
  "chat:write",
  "chat:write.customize",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "im:history",
  // Channel picker on the consent screen: the channel Sederunt posts kept work to.
  // Only channel_id/name are kept; the webhook URL in the response is discarded.
  "incoming-webhook",
  "users:read",
  "users:read.email",
]);
/** Scopes without which Sederunt cannot keep or answer: a narrower grant is "partial". */
export const SLACK_REQUIRED_SCOPES = SLACK_BOT_SCOPES;
const STATE_MS = 10 * 60 * 1000;

function safeNext(value) {
  const next = String(value || "");
  return next.startsWith("/console") && !next.startsWith("//") && !next.includes("\\") ? next : "/console/setup";
}

function withResult(next, result) {
  const url = new URL(next, "http://x");
  url.searchParams.set("slack", result);
  return `${url.pathname}${url.search}`;
}

function cookie(req, value, maxAge) {
  const forwarded = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const parts = [`${SLACK_STATE_COOKIE}=${encodeURIComponent(value)}`, "HttpOnly", "Path=/console/slack", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (proto === "https" || req.socket?.encrypted === true) parts.push("Secure");
  return parts.join("; ");
}

export function slackRedirectUri(env = process.env) {
  const origin = String(env.SEDERUNT_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
  return origin ? `${origin}${SLACK_CALLBACK_PATH}` : "";
}

function sameNonce(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{
 *   env: Record<string,string|undefined>,
 *   installations: any,
 *   fetchImpl?: typeof fetch,
 *   activeTenant: (req: any) => Promise<{ unauthorized?: boolean, userId?: string, tenantId?: string, role?: string }>,
 *   roleIn: (req: any, tenantId: string) => Promise<string>,
 *   now?: number,
 * }} ctx
 * @returns {Promise<boolean>} handled
 */
export async function handleSlackOAuth(req, res, url, ctx) {
  if (req.method !== "GET" || (url.pathname !== SLACK_INSTALL_PATH && url.pathname !== SLACK_CALLBACK_PATH)) return false;
  const env = ctx.env;
  const now = ctx.now ?? Date.now();
  const redirect = (location, extraCookie) => {
    const headers = { location, "cache-control": "no-store" };
    if (extraCookie) headers["set-cookie"] = extraCookie;
    res.writeHead(303, headers);
    res.end();
  };
  const fail = (status, text) => {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(text);
  };
  const secret = sessionSecret(env);
  const redirectUri = slackRedirectUri(env);
  if (!slackOAuthConfigured(env) || !secret || !redirectUri) {
    fail(503, "Slack install is not set up on this deployment.");
    return true;
  }
  const local = env.NODE_ENV !== "production" && !env.VERCEL_ENV && env.SEDERUNT_AUTH_FAKE === "1";
  if (!ctx.installations?.consumeState || (!local && (ctx.installations.durable !== true || ctx.installations.encrypted !== true))) {
    fail(503, "Durable encrypted Slack storage is not configured.");
    return true;
  }
  const admin = (role) => role === "owner" || role === "admin";

  if (url.pathname === SLACK_INSTALL_PATH) {
    const next = safeNext(url.searchParams.get("next"));
    const who = await ctx.activeTenant(req);
    if (who.unauthorized || !who.userId) {
      redirect(`/console/sign-in?next=${encodeURIComponent(next)}`);
      return true;
    }
    if (!who.tenantId || !admin(who.role)) {
      redirect(withResult(next, "forbidden"));
      return true;
    }
    const nonce = randomBytes(24).toString("base64url");
    // "Change Slack workspace" is an explicit owner/admin choice, never implied by a new install.
    const replace = url.searchParams.get("change") === "1";
    let current;
    try { current = await ctx.installations.get(who.tenantId); }
    catch { fail(503, "Slack connection storage is unavailable. Try again."); return true; }
    const sealed = sealPayload({ expectedGeneration: current?.generation || null, nonce, userId: who.userId, tenantId: who.tenantId, next, replace, exp: now + STATE_MS }, secret);
    const authorize = new URL("https://slack.com/oauth/v2/authorize");
    authorize.searchParams.set("client_id", String(env.SLACK_CLIENT_ID).trim());
    authorize.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", nonce);
    redirect(authorize.toString(), cookie(req, sealed, STATE_MS / 1000));
    return true;
  }

  // Callback. The cookie is single-use: always cleared.
  const clear = cookie(req, "", 0);
  const opened = openPayload(readCookie(req.headers?.cookie, SLACK_STATE_COOKIE), secret);
  const pending = opened.ok ? opened.payload : null;
  const state = url.searchParams.get("state") || "";
  if (!pending || typeof pending.exp !== "number" || pending.exp <= now || !sameNonce(pending.nonce, state)) {
    redirect(withResult(safeNext(pending?.next), "expired"), clear);
    return true;
  }
  try {
    if (!await ctx.installations.consumeState(state, pending.exp)) {
      redirect(withResult(safeNext(pending.next), "expired"), clear);
      return true;
    }
  } catch {
    fail(503, "Slack connection storage is unavailable. Try again.");
    return true;
  }
  const next = safeNext(pending.next);
  if (url.searchParams.get("error")) {
    redirect(withResult(next, "declined"), clear);
    return true;
  }
  const who = await ctx.activeTenant(req);
  if (who.unauthorized || who.userId !== pending.userId) {
    redirect(withResult(next, "expired"), clear);
    return true;
  }
  // Re-check membership on the tenant the install started for (not whatever is active now).
  if (!admin(await ctx.roleIn(req, pending.tenantId))) {
    redirect(withResult(next, "forbidden"), clear);
    return true;
  }
  const code = url.searchParams.get("code") || "";
  if (!code) {
    redirect(withResult(next, "declined"), clear);
    return true;
  }
  let body;
  try {
    const response = await (ctx.fetchImpl || fetch)("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: String(env.SLACK_CLIENT_ID).trim(),
        client_secret: String(env.SLACK_CLIENT_SECRET).trim(),
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    body = response.ok ? await response.json() : null;
  } catch {
    body = null;
  }
  if (!body || body.ok !== true || body.token_type !== "bot" || !/^xoxb-/.test(String(body.access_token || ""))) {
    redirect(withResult(next, "failed"), clear);
    return true;
  }
  if (body.is_enterprise_install === true || !body.team?.id) {
    redirect(withResult(next, "unsupported"), clear);
    return true;
  }
  if (!/^A[A-Z0-9]+$/.test(String(body.app_id || "")) || !/^[UW][A-Z0-9]+$/.test(String(body.bot_user_id || ""))
    || (env.SLACK_APP_ID && env.SLACK_APP_ID !== body.app_id)) {
    redirect(withResult(next, "failed"), clear);
    return true;
  }
  const scopes = String(body.scope || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (SLACK_REQUIRED_SCOPES.some((scope) => !scopes.includes(scope))) {
    redirect(withResult(next, "partial"), clear);
    return true;
  }
  try {
    await ctx.installations.save({
      tenantId: pending.tenantId,
      teamId: body.team.id,
      teamName: body.team.name || "",
      botUserId: body.bot_user_id || "",
      appId: body.app_id || "",
      scopes,
      channelId: String(body.incoming_webhook?.channel_id || ""),
      channelName: String(body.incoming_webhook?.channel || "").replace(/^#/, ""),
      token: body.access_token,
      installedBy: pending.userId,
      replace: pending.replace === true,
      expectedGeneration: pending.expectedGeneration || null,
    });
  } catch (error) {
    const reason = error?.reason === "conflict" ? "conflict" : error?.reason === "different-team" ? "different-team" : error?.reason === "stale" ? "stale" : "failed";
    redirect(withResult(next, reason), clear);
    return true;
  }
  redirect(withResult(next, "connected"), clear);
  return true;
}
