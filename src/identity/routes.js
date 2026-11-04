import {
  CONSOLE_SESSION_MS,
  consoleSecret,
  safeConsoleNext,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "../console-auth.js";
import { renderSignInPage } from "../console-sign-in.js";
import {
  OAUTH_PENDING_MS,
  clearOAuthCookie,
  oauthPendingCookie,
  readPending,
  sealPending,
} from "./pending.js";
import { codeChallengeFor, createCodeVerifier } from "./pkce.js";
import { displayNameFromUser, identityConfigured } from "./shared.js";

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
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
      notice: "Sign-in couldn't be checked. Try again.",
    }));
    return;
  }
  if (!enabled) {
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
      notice: providerNotice(provider),
      next: safeConsoleNext(url.searchParams.get("next") || "/console"),
    }));
    return;
  }
  const verifier = createCodeVerifier();
  const challenge = codeChallengeFor(verifier);
  const next = safeConsoleNext(url.searchParams.get("next") || "/console");
  const sealed = sealPending({ verifier, challenge, next, provider }, sessionSecret(env));
  const cookie = oauthPendingCookie(sealed, req, Math.floor(OAUTH_PENDING_MS / 1000));
  const location = identity.authorizeUrl({
    provider,
    redirectTo: `${requestOrigin(req, env)}/console/auth/callback`,
    codeChallenge: challenge,
  });
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
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
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
    send(res, 200, "text/html; charset=utf-8", page(ctx, { notice: providerNotice(provider) }));
    return;
  }
  let code = "";
  try {
    code = identity.issueConsentCode({ provider, codeChallenge: pending.challenge });
  } catch {
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
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
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
      notice: oauthErrorNotice(error, url.searchParams.get("error_description")),
    }), { "set-cookie": clearOAuthCookie(req) });
    return;
  }
  const code = url.searchParams.get("code") || "";
  const pending = readPending(req, sessionSecret(env));
  if (!pending.ok || !code) {
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
      notice: "Sign-in didn't complete. Try again.",
    }), { "set-cookie": clearOAuthCookie(req) });
    return;
  }
  try {
    const tokens = await identity.exchangeCode({ code, codeVerifier: pending.verifier });
    const user = await identity.getUser(tokens.accessToken);
    if (!user?.id) throw new Error("unverified");
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
    }, sessionSecret(env));
    redirect(res, safeConsoleNext(pending.next), {
      "set-cookie": [
        sessionCookie(sealed, req, Math.floor(CONSOLE_SESSION_MS / 1000)),
        clearOAuthCookie(req),
      ],
    });
  } catch {
    send(res, 200, "text/html; charset=utf-8", page(ctx, {
      notice: "Sign-in didn't complete. Try again.",
    }), { "set-cookie": clearOAuthCookie(req) });
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

function page(ctx, extras) {
  const { env, identity, url } = ctx;
  const reason = extras.reason || "";
  return renderSignInPage({
    configured: Boolean(consoleSecret(env)),
    oauth: Boolean(identity) || identityConfigured(env),
    memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
    reason,
    notice: extras.notice || "",
    name: extras.name || "",
    next: extras.next || safeConsoleNext(url.searchParams.get("next") || "/console"),
  });
}

function requestOrigin(req, env) {
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
