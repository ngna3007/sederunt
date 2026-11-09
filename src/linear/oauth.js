import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { openPayload, readCookie, sealPayload, sessionSecret } from "../console-auth.js";
import { readLinearAccount } from "./account.js";
import { createLinearClient } from "./mcp.js";

/**
 * Linear MCP OAuth for one Sederunt tenant.
 *
 *   GET /console/linear/client.json
 *     public client metadata. Linear fetches this. It holds no secret.
 *   GET /console/linear/install?change=1&next=/console/setup
 *     owner/admin -> https://mcp.linear.app/authorize
 *     prompt=consent is what makes Linear ask which workspace.
 *   GET /console/linear/callback
 *     same person, still owner/admin, code exchanged, grant sealed for that tenant.
 *
 * A Linear session is bound to one workspace. Reusing the process token cannot switch it.
 */
export const LINEAR_INSTALL_PATH = "/console/linear/install";
export const LINEAR_CALLBACK_PATH = "/console/linear/callback";
export const LINEAR_CLIENT_PATH = "/console/linear/client.json";
export const LINEAR_STATE_COOKIE = "sederunt_linear_oauth";
export const LINEAR_AUTHORIZE_URL = "https://mcp.linear.app/authorize";
export const LINEAR_TOKEN_URL = "https://mcp.linear.app/token";
export const LINEAR_RESOURCE = "https://mcp.linear.app/mcp";
const STATE_MS = 10 * 60 * 1000;
const REFRESH_EARLY_MS = 60 * 1000;

function safeNext(value) {
  const next = String(value || "");
  return next.startsWith("/console") && !next.startsWith("//") && !next.includes("\\") ? next : "/console/setup";
}

function withResult(next, result) {
  const url = new URL(next, "http://x");
  url.searchParams.set("linear", result);
  return `${url.pathname}${url.search}`;
}

function cookie(req, value, maxAge) {
  const forwarded = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const parts = [`${LINEAR_STATE_COOKIE}=${encodeURIComponent(value)}`, "HttpOnly", "Path=/console/linear", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (proto === "https" || req.socket?.encrypted === true) parts.push("Secure");
  return parts.join("; ");
}

export function linearPublicOrigin(env = process.env) {
  const origin = String(env.SEDERUNT_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
  return origin.startsWith("https://") ? origin : "";
}

export function linearClientMetadata(env = process.env) {
  const origin = linearPublicOrigin(env);
  if (!origin) return null;
  const clientId = `${origin}${LINEAR_CLIENT_PATH}`;
  return {
    client_id: clientId,
    client_name: "Sederunt",
    client_uri: origin,
    redirect_uris: [`${origin}${LINEAR_CALLBACK_PATH}`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "read write",
  };
}

export function linearAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(LINEAR_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read write");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("resource", LINEAR_RESOURCE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function sameNonce(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function scopesOf(value) {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || "");
  return raw.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
}

function storageReady(env, installations) {
  const local = env.NODE_ENV !== "production" && !env.VERCEL_ENV && env.SEDERUNT_AUTH_FAKE === "1";
  if (!installations?.consumeState || !installations?.save || !installations?.open) return false;
  if (local) return true;
  return installations.durable === true && installations.encrypted === true;
}

/**
 * Load the tenant grant, refreshing it when the access token is near expiry.
 * Returns null when this tenant has not connected Linear. Throws when the saved
 * grant cannot be refreshed, so the caller does not fall back to another workspace.
 *
 * @returns {Promise<{ accessToken: string, workspaceKey: string, teamKey: string, generation: string } | null>}
 */
export async function freshLinearAccess(installations, tenantId, env, fetchImpl = globalThis.fetch, now = Date.now()) {
  let row;
  try {
    row = await installations.open(tenantId);
  } catch (error) {
    // A missing table or a store outage keeps the process token. A saved grant
    // that fails to refresh still throws, so a call cannot file into the wrong workspace.
    if (error?.reason === "network" || error?.reason === "unavailable") return null;
    throw error;
  }
  if (!row?.accessToken) return null;
  if (Number(row.expiresAt) > now + REFRESH_EARLY_MS) {
    return { accessToken: row.accessToken, workspaceKey: row.workspaceKey, teamKey: row.teamKey, generation: row.generation };
  }
  const metadata = linearClientMetadata(env);
  if (!metadata) throw Object.assign(new Error("Linear needs to be connected again."), { reason: "failed" });
  let body = null;
  try {
    const response = await fetchImpl(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
        client_id: metadata.client_id,
        resource: LINEAR_RESOURCE,
      }).toString(),
    });
    body = response.ok ? await response.json() : null;
  } catch {
    body = null;
  }
  const accessToken = String(body?.access_token || "");
  const refreshToken = String(body?.refresh_token || "");
  const expiresIn = Number(body?.expires_in);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw Object.assign(new Error("Linear needs to be connected again."), { reason: "failed" });
  }
  try {
    await installations.save({
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      workspaceKey: row.workspaceKey,
      workspaceName: row.workspaceName,
      teamKey: row.teamKey,
      scopes: row.scopes,
      installedBy: row.installedBy,
      accessToken,
      refreshToken,
      expiresAt: now + expiresIn * 1000,
      replace: true,
      expectedGeneration: row.generation,
    });
  } catch (error) {
    if (error?.reason !== "stale") throw error;
    const again = await installations.open(tenantId);
    if (!again?.accessToken) throw error;
    return { accessToken: again.accessToken, workspaceKey: again.workspaceKey, teamKey: again.teamKey, generation: again.generation };
  }
  return { accessToken, workspaceKey: row.workspaceKey, teamKey: row.teamKey, generation: row.generation };
}

/**
 * Linear client for one tenant. A saved grant wins over the process token.
 * No saved grant keeps the process client.
 */
export function tenantLinearClient(workspace, tenantId) {
  const fallback = workspace.deps.linear;
  const store = workspace.linearInstallations;
  if (!tenantId || !store?.open) return fallback;
  let cached = null;
  async function client() {
    const grant = await freshLinearAccess(store, tenantId, workspace.env, workspace.fetchImpl);
    if (!grant) return fallback;
    if (!workspace.linearProfiles) workspace.linearProfiles = new Map();
    workspace.linearProfiles.set(tenantId, { workspaceKey: grant.workspaceKey, teamKey: grant.teamKey });
    if (cached && cached.generation === grant.generation && cached.accessToken === grant.accessToken) return cached.client;
    cached = {
      generation: grant.generation,
      accessToken: grant.accessToken,
      client: createLinearClient(grant.accessToken, workspace.fetchImpl, { team: grant.teamKey, workspace: grant.workspaceKey }),
    };
    return cached.client;
  }
  const forward = (method) => async (input) => (await client())[method](input);
  return {
    readOpenTripTickets: forward("readOpenTripTickets"),
    createIssue: forward("createIssue"),
    assignIssue: forward("assignIssue"),
    updateIssue: forward("updateIssue"),
    addLabel: forward("addLabel"),
    removeLabel: forward("removeLabel"),
    unassignIssue: forward("unassignIssue"),
    findIssuesByTitle: forward("findIssuesByTitle"),
    getIssue: forward("getIssue"),
  };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{
 *   env: Record<string, string|undefined>,
 *   installations: any,
 *   fetchImpl?: typeof fetch,
 *   activeTenant: (req: any) => Promise<{ unauthorized?: boolean, userId?: string, tenantId?: string, role?: string }>,
 *   roleIn: (req: any, tenantId: string) => Promise<string>,
 *   now?: number,
 * }} ctx
 * @returns {Promise<boolean>}
 */
export async function handleLinearOAuth(req, res, url, ctx) {
  const metadata = linearClientMetadata(ctx.env);
  if (req.method === "GET" && url.pathname === LINEAR_CLIENT_PATH) {
    if (!metadata) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Not found");
      return true;
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" });
    res.end(JSON.stringify(metadata));
    return true;
  }
  if (req.method !== "GET" || (url.pathname !== LINEAR_INSTALL_PATH && url.pathname !== LINEAR_CALLBACK_PATH)) return false;
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
  if (!metadata || !secret || !storageReady(env, ctx.installations)) {
    fail(503, "Linear workspace change is not set up on this deployment.");
    return true;
  }
  const admin = (role) => role === "owner" || role === "admin";
  const redirectUri = metadata.redirect_uris[0];

  if (url.pathname === LINEAR_INSTALL_PATH) {
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
    const { verifier, challenge } = pkce();
    const replace = url.searchParams.get("change") === "1";
    let current;
    try { current = await ctx.installations.get(who.tenantId); }
    catch { fail(503, "Linear connection storage is unavailable. Try again."); return true; }
    const sealed = sealPayload({
      expectedGeneration: current?.generation || null,
      nonce,
      verifier,
      userId: who.userId,
      tenantId: who.tenantId,
      next,
      replace,
      exp: now + STATE_MS,
    }, secret);
    const authorize = linearAuthorizeUrl({ clientId: metadata.client_id, redirectUri, state: nonce, challenge });
    redirect(authorize.toString(), cookie(req, sealed, STATE_MS / 1000));
    return true;
  }

  const clear = cookie(req, "", 0);
  const opened = openPayload(readCookie(req.headers?.cookie, LINEAR_STATE_COOKIE), secret);
  const pending = opened.ok ? opened.payload : null;
  const state = url.searchParams.get("state") || "";
  const iss = url.searchParams.get("iss");
  if (!pending || typeof pending.exp !== "number" || pending.exp <= now || !sameNonce(pending.nonce, state) || (iss && iss !== "https://mcp.linear.app")) {
    redirect(withResult(safeNext(pending?.next), "expired"), clear);
    return true;
  }
  try {
    if (!await ctx.installations.consumeState(state, pending.exp)) {
      redirect(withResult(safeNext(pending.next), "expired"), clear);
      return true;
    }
  } catch {
    fail(503, "Linear connection storage is unavailable. Try again.");
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
  if (!admin(await ctx.roleIn(req, pending.tenantId))) {
    redirect(withResult(next, "forbidden"), clear);
    return true;
  }
  const code = url.searchParams.get("code") || "";
  if (!code || !pending.verifier) {
    redirect(withResult(next, "declined"), clear);
    return true;
  }
  let tokenBody = null;
  try {
    const response = await (ctx.fetchImpl || fetch)(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: metadata.client_id,
        code_verifier: pending.verifier,
        resource: LINEAR_RESOURCE,
      }).toString(),
    });
    tokenBody = response.ok ? await response.json() : null;
  } catch {
    tokenBody = null;
  }
  const accessToken = String(tokenBody?.access_token || "");
  const refreshToken = String(tokenBody?.refresh_token || "");
  const expiresIn = Number(tokenBody?.expires_in);
  const scopes = scopesOf(tokenBody?.scope);
  const tokenType = String(tokenBody?.token_type || "").toLowerCase();
  if (!accessToken || !refreshToken || tokenType !== "bearer" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    redirect(withResult(next, "failed"), clear);
    return true;
  }
  if (!scopes.includes("read") || !scopes.includes("write")) {
    redirect(withResult(next, "partial"), clear);
    return true;
  }
  let account;
  try {
    account = await readLinearAccount(accessToken, ctx.fetchImpl || fetch, String(env.LINEAR_TEAM || "").trim());
  } catch {
    redirect(withResult(next, "failed"), clear);
    return true;
  }
  try {
    await ctx.installations.save({
      tenantId: pending.tenantId,
      workspaceId: account.workspaceId,
      workspaceKey: account.workspaceKey,
      workspaceName: account.workspaceName,
      teamKey: account.teamKey,
      scopes,
      accessToken,
      refreshToken,
      expiresAt: now + expiresIn * 1000,
      installedBy: pending.userId,
      replace: pending.replace === true,
      expectedGeneration: pending.expectedGeneration || null,
    });
  } catch (error) {
    const reason = error?.reason === "conflict" ? "conflict"
      : error?.reason === "different" ? "different"
        : error?.reason === "stale" ? "stale" : "failed";
    redirect(withResult(next, reason), clear);
    return true;
  }
  redirect(withResult(next, "connected"), clear);
  return true;
}
