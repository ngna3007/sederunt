import {
  CONSOLE_SESSION_MS,
  consoleSecret,
  guardConsole,
  safeConsoleNext,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "../console-auth.js";
import { renderSignInPage } from "../console-sign-in.js";
import { activeSpace } from "./onboarding.js";
import {
  OAUTH_PENDING_MS,
  clearOAuthCookie,
  oauthPendingCookie,
  readPending,
  sealPending,
} from "./pending.js";
import { codeChallengeFor, createCodeVerifier } from "./pkce.js";
import { displayNameFromUser, identityConfigured, providerFromUser, resolveSignInProviders } from "./shared.js";
import { CALENDAR_SCOPES, applyCalendarConnection } from "../calendar/mcp.js";
import { FORMS_SCOPES } from "../connectors/google-person.js";

const PROVIDERS = new Set(["google", "github"]);

/**
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   url: URL,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   redirect: Function,
 * }} ctx
 */
export async function handleAuthRoute(ctx) {
  const { req, res, url, send } = ctx;
  const provider = /^\/console\/auth\/(google|github)$/.exec(url.pathname);
  if (req.method === "GET" && provider) {
    await startProvider(ctx, provider[1]);
    return;
  }
  const fake = /^\/console\/auth\/fake\/(google|github)$/.exec(url.pathname);
  if (req.method === "GET" && fake) {
    await fakeConsent(ctx, fake[1]);
    return;
  }
  if (req.method === "GET" && url.pathname === "/console/auth/callback") {
    await finishCallback(ctx);
    return;
  }
  send(res, 404, "text/plain; charset=utf-8", "Not found");
}

async function startProvider(ctx, provider) {
  const { req, res, url, env, identity, send, redirect } = ctx;
  if (!identity || !PROVIDERS.has(provider)) {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  let enabled = false;
  try {
    enabled = await identity.providerEnabled(provider);
  } catch {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: "Sign-in couldn't be checked. Try again.",
    }));
    return;
  }
  if (!enabled) {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: providerNotice(provider),
      next: safeConsoleNext(url.searchParams.get("next") || "/console"),
    }));
    return;
  }
  const verifier = createCodeVerifier();
  const challenge = codeChallengeFor(verifier);
  const next = safeConsoleNext(url.searchParams.get("next") || "/console");
  const intent = googleIntent(provider, url.searchParams.get("intent"));
  const sealed = sealPending({ verifier, challenge, next, provider, intent }, sessionSecret(env));
  const cookie = oauthPendingCookie(sealed, req, Math.floor(OAUTH_PENDING_MS / 1000));
  const authorizeInput = {
    provider,
    redirectTo: `${requestOrigin(req, env)}/console/auth/callback`,
    codeChallenge: challenge,
  };
  if (intent === "forms" || intent === "calendar") {
    authorizeInput.scopes = (intent === "calendar" ? CALENDAR_SCOPES : FORMS_SCOPES).join(" ");
    authorizeInput.queryParams = {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    };
  }
  const location = identity.authorizeUrl(authorizeInput);
  redirect(res, location, { "set-cookie": cookie });
}

async function fakeConsent(ctx, provider) {
  const { req, res, env, identity, send, redirect } = ctx;
  if (!identity || typeof identity.issueConsentCode !== "function") {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  const pending = readPending(req, sessionSecret(env));
  if (!pending.ok || pending.provider !== provider) {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: "Sign-in expired. Start again.",
    }), { "set-cookie": clearOAuthCookie(req) });
    return;
  }
  let enabled = false;
  try {
    enabled = await identity.providerEnabled(provider);
  } catch {
    enabled = false;
  }
  if (!enabled) {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, { notice: providerNotice(provider) }));
    return;
  }
  let code = "";
  try {
    code = identity.issueConsentCode({
      provider,
      codeChallenge: pending.challenge,
      intent: pending.intent,
      scope: ctx.url.searchParams.get("scope") || "",
    });
  } catch {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: "Sign-in didn't complete. Try again.",
    }));
    return;
  }
  redirect(res, `/console/auth/callback?code=${encodeURIComponent(code)}`);
}

async function finishCallback(ctx) {
  const { req, res, url, env, identity, send, redirect } = ctx;
  if (!identity) {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  const error = url.searchParams.get("error");
  if (error) {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: oauthErrorNotice(error, url.searchParams.get("error_description")),
    }), { "set-cookie": clearOAuthCookie(req) });
    return;
  }
  const code = url.searchParams.get("code") || "";
  const pending = readPending(req, sessionSecret(env));
  if (!pending.ok || !code) {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: "Sign-in didn't complete. Try again.",
    }), { "set-cookie": clearOAuthCookie(req) });
    return;
  }
  try {
    const tokens = await identity.exchangeCode({ code, codeVerifier: pending.verifier });
    if ((pending.intent === "forms" || pending.intent === "calendar") && pending.provider === "google") {
      const scopes = await providerScopesForGrant(tokens, pending.intent, ctx.fetchImpl);
      tokens.scope = scopes.join(" ");
    }
    const user = await identity.getUser(tokens.accessToken);
    if (!user?.id) throw new Error("unverified");
    let grantTenant = "";
    if ((pending.intent === "forms" || pending.intent === "calendar") && pending.provider === "google" && ctx.googleGrants) {
      try {
        grantTenant = await formsTenantId(ctx, tokens.accessToken);
        let refresh = tokens.providerRefreshToken || "";
        if (!refresh && typeof ctx.googleGrants.savedRefresh === "function") {
          refresh = await ctx.googleGrants.savedRefresh(user.id, { tenantId: grantTenant });
        }
        if (refresh) {
          await ctx.googleGrants.save(user.id, {
            refreshToken: refresh,
            accessToken: tokens.providerAccessToken || "",
            expiresAt: tokens.expiresAt,
            scopes: grantedScopeList(tokens.scope),
          }, { tenantId: grantTenant });
        }
      } catch {
        // Sign-in still completes. The connector card stays on Connect until a grant is stored.
      }
    }
    if (pending.intent === "calendar" && pending.provider === "google") {
      try {
        // Local/non-oauth demos may still mirror into process env. OAuth console
        // Connected/read uses person_google_grants and ignores these when identity is on.
        applyCalendarConnection(env, {
          accessToken: tokens.providerAccessToken || "",
          refreshToken: tokens.providerRefreshToken || "",
          expiresAt: tokens.expiresAt,
          scopes: grantedScopeList(tokens.scope),
        }, ctx.calendarSave);
      } catch {
        // Person grant above is the source of truth for OAuth tenants.
      }
    }
    const formsTenant = grantTenant;
    let name = displayNameFromUser(user).slice(0, 80);
    try {
      const profile = await identity.profile(tokens.accessToken);
      if (profile?.display_name) name = String(profile.display_name).trim().slice(0, 80);
    } catch {
      // Display name from the verified user is enough.
    }
    const exp = Date.now() + CONSOLE_SESSION_MS;
    const sealed = sealSession({
      kind: "oauth",
      memberId: user.id,
      userId: user.id,
      name,
      email: String(user.email || "").toLowerCase(),
      exp,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExp: tokens.expiresAt,
      provider: providerFromUser(user),
      ...(formsTenant ? { tenantId: formsTenant } : {}),
    }, sessionSecret(env));
    redirect(res, safeConsoleNext(pending.next), {
      "set-cookie": [
        sessionCookie(sealed, req, Math.floor(CONSOLE_SESSION_MS / 1000)),
        clearOAuthCookie(req),
      ],
    });
  } catch {
    send(res, 200, "text/html; charset=utf-8", await page(ctx, {
      notice: "Sign-in didn't complete. Try again.",
    }), { "set-cookie": clearOAuthCookie(req) });
  }
}

/**
 * The space the Forms grant belongs to. Matches the console's active space,
 * including a tenant already chosen on the session.
 *
 * @param {{ req: import("node:http").IncomingMessage, env: NodeJS.ProcessEnv | Record<string, string | undefined>, identity: { myTenants?: Function } }} ctx
 * @param {string} accessToken
 */
async function formsTenantId(ctx, accessToken) {
  const gate = guardConsole(ctx.req, ctx.env);
  const hinted = typeof gate.session?.tenantId === "string" ? gate.session.tenantId : "";
  if (ctx.identity && typeof ctx.identity.myTenants === "function" && accessToken) {
    try {
      const tenants = await ctx.identity.myTenants(accessToken);
      const active = activeSpace(Array.isArray(tenants) ? tenants : [], hinted);
      if (active?.id) return String(active.id);
    } catch {
      // The hinted space is the fallback when the tenant list cannot be read.
    }
  }
  return hinted;
}

/**
 * @param {string} provider
 * @param {string | null} raw
 */
function googleIntent(provider, raw) {
  if (provider !== "google") return "";
  if (raw === "forms" || raw === "calendar") return raw;
  return "";
}

/**
 * Scopes Google actually returned. An empty list is a declined consent,
 * not a grant of every requested scope.
 *
 * @param {unknown} scope
 */
function grantedScopeList(scope) {
  if (Array.isArray(scope)) return scope.map((item) => String(item || "").trim()).filter(Boolean);
  return String(scope || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

/**
 * Scopes to seal for a Google connector grant.
 * Supabase's token response has provider tokens and no scope field, so an empty
 * list is not proof the person declined. Ask Google tokeninfo for the access
 * token's scopes. A failed lookup keeps the list we already have.
 *
 * @param {{ scope?: string, providerAccessToken?: string }} tokens
 * @param {string} intent
 * @param {typeof fetch | undefined} fetchImpl
 * @returns {Promise<string[]>}
 */
export async function providerScopesForGrant(tokens, intent, fetchImpl) {
  const required = intent === "calendar" ? CALENDAR_SCOPES : intent === "forms" ? FORMS_SCOPES : [];
  const current = grantedScopeList(tokens?.scope);
  if (!required.length || required.every((scope) => current.includes(scope))) return current;
  const access = typeof tokens?.providerAccessToken === "string" ? tokens.providerAccessToken : "";
  if (!access || typeof fetchImpl !== "function") return current;
  try {
    const response = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access)}`);
    if (!response?.ok) return current;
    const body = typeof response.json === "function" ? await response.json() : null;
    const listed = grantedScopeList(body?.scope);
    return listed.length ? listed : current;
  } catch {
    return current;
  }
}

function providerNotice(provider) {
  if (provider === "github") return "GitHub sign-in isn't turned on yet. Use Google or ask your admin.";
  return "Google sign-in isn't turned on yet. Use GitHub or ask your admin.";
}

export function oauthErrorNotice(error, description) {
  const code = String(error || "").trim();
  if (code === "access_denied") return "Sign-in was cancelled. Try again when you want to continue.";
  const detail = String(description || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  if (detail) return detail;
  return "Sign-in didn't complete. Try again.";
}

async function page(ctx, extras) {
  const { env, identity, url } = ctx;
  const reason = extras.reason || "";
  const oauth = Boolean(identity) || identityConfigured(env);
  const providers = oauth ? await resolveSignInProviders(identity) : { google: false, github: false };
  return renderSignInPage({
    configured: Boolean(consoleSecret(env)),
    oauth,
    memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
    reason,
    notice: extras.notice || "",
    name: extras.name || "",
    next: extras.next || safeConsoleNext(url.searchParams.get("next") || "/console"),
    providers,
  });
}

export function requestOrigin(req, env) {
  const configured = String(env.SEDERUNT_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const forwarded = req.headers?.["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const proto = String(protoHeader || "").split(",")[0].trim() || (req.socket?.encrypted ? "https" : "http");
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const host = String(hostHeader || req.headers?.host || "127.0.0.1").split(",")[0].trim();
  return `${proto}://${host}`;
}
