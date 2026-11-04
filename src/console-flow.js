import {
  CONSOLE_SESSION_MS,
  guardConsole,
  safeConsoleNext,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "./console-auth.js";
import { renderFlowMessage, renderInvitePage, renderWelcomePage } from "./console-welcome.js";
import { requestOrigin } from "./identity/routes.js";
import {
  activeSpace,
  identityMessage,
  kindLabel,
  needsOnboarding,
  parseInviteEmails,
  roleLabel,
  sortSpaces,
  validateDomain,
  validateSpaceName,
} from "./identity/onboarding.js";

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Send a first-run OAuth user from Home to the welcome question.
 * Passphrase sessions and a finished onboarding stay on Home.
 * A failed identity read stays on Home rather than a raw error page.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {object | null} identity
 */
export async function welcomeLocation(req, env, identity) {
  const session = oauthSession(req, env);
  if (!identity || !session || session.onboarded === true) return "";
  try {
    const user = await identity.getUser(session.accessToken);
    const tenants = await identity.myTenants(session.accessToken);
    if (!needsOnboarding(user, tenants)) return "";
    return "/console/welcome";
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   url: URL,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   redirect: Function,
 *   readPosted: Function,
 * }} ctx
 */
export async function handleWelcome(ctx) {
  const { req, res, url, send, redirect } = ctx;
  const session = oauthSession(req, ctx.env);
  if (!ctx.identity) {
    redirect(res, "/console");
    return;
  }
  if (!session) {
    redirect(res, `/console/sign-in?next=${encodeURIComponent("/console/welcome")}`);
    return;
  }
  if (req.method === "GET" && url.searchParams.get("action") === "skip") {
    await finishPersonal(ctx, session);
    return;
  }
  if (req.method === "GET") {
    const kind = url.searchParams.get("kind");
    if (kind === "team" || kind === "company") {
      send(res, 200, "text/html; charset=utf-8", renderWelcomePage({ step: "name", kind }));
      return;
    }
    send(res, 200, "text/html; charset=utf-8", renderWelcomePage({ step: "choose" }));
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  let body = {};
  try {
    body = await ctx.readPosted(req);
  } catch {
    send(res, 400, "text/html; charset=utf-8", renderWelcomePage({
      step: "choose",
      error: "That could not be saved. Try again.",
    }));
    return;
  }
  const action = String(body.action || "");
  const kind = body.kind === "company" || body.kind === "team" || body.kind === "personal" ? body.kind : "";
  if (action === "skip" || kind === "personal") {
    await finishPersonal(ctx, session);
    return;
  }
  if ((kind === "team" || kind === "company") && action !== "create") {
    send(res, 200, "text/html; charset=utf-8", renderWelcomePage({ step: "name", kind }));
    return;
  }
  if (action === "create" && (kind === "team" || kind === "company")) {
    await createSpace(ctx, session, body, kind);
    return;
  }
  send(res, 400, "text/html; charset=utf-8", renderWelcomePage({
    step: "choose",
    error: "Choose Just me, a team, or a company.",
  }));
}

/**
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   url: URL,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   redirect: Function,
 *   token: string,
 * }} ctx
 */
export async function handleInvite(ctx) {
  const { req, res, send, redirect, token } = ctx;
  if (!ctx.identity) {
    redirect(res, "/console");
    return;
  }
  const next = safeConsoleNext(`/console/invite/${token}`);
  const session = oauthSession(req, ctx.env);
  if (!session) {
    redirect(res, `/console/sign-in?next=${encodeURIComponent(next)}`);
    return;
  }
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(token)) {
    send(res, 400, "text/html; charset=utf-8", renderInvitePage({ error: "That invite is invalid or expired." }));
    return;
  }
  if (req.method === "GET") {
    send(res, 200, "text/html; charset=utf-8", renderInvitePage());
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  try {
    const tenantId = await ctx.identity.acceptInvite(session.accessToken, token);
    const cookie = resealOAuth(req, ctx.env, session, { tenantId: String(tenantId || "") });
    redirect(res, "/console", { "set-cookie": cookie });
  } catch (error) {
    send(res, 400, "text/html; charset=utf-8", renderInvitePage({ error: identityMessage(error) }));
  }
}

/**
 * Replace the sealed OAuth cookie, keeping the access token and the expiry.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {object} session
 * @param {{ tenantId?: string, onboarded?: boolean, name?: string }} [patch]
 */
export function resealOAuth(req, env, session, patch = {}) {
  const tenantId = typeof patch.tenantId === "string" ? patch.tenantId : (session.tenantId || "");
  const sealed = sealSession({
    kind: "oauth",
    memberId: session.memberId,
    userId: session.userId,
    name: typeof patch.name === "string" ? patch.name : session.name,
    email: session.email,
    exp: session.exp,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExp: session.accessExp,
    tenantId,
    onboarded: patch.onboarded === true || session.onboarded === true,
    provider: session.provider === "github" ? "github" : session.provider === "google" ? "google" : "",
  }, sessionSecret(env));
  const maxAge = Math.max(0, Math.floor((Number(session.exp) - Date.now()) / 1000)) || Math.floor(CONSOLE_SESSION_MS / 1000);
  return sessionCookie(sealed, req, maxAge);
}

async function finishPersonal(ctx, session) {
  const { req, res, send, redirect, identity, env } = ctx;
  try {
    const tenants = await identity.myTenants(session.accessToken);
    const personal = activeSpace(tenants, "");
    const tenantId = personal?.kind === "personal" ? personal.id : "";
    await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
    const cookie = resealOAuth(req, env, session, { onboarded: true, tenantId: tenantId || "" });
    redirect(res, "/console", { "set-cookie": cookie });
  } catch (error) {
    send(res, 200, "text/html; charset=utf-8", renderWelcomePage({
      step: "choose",
      error: identityMessage(error),
    }));
  }
}

async function createSpace(ctx, session, body, kind) {
  const { req, res, send, identity, env } = ctx;
  const named = validateSpaceName(body.name);
  const mailed = parseInviteEmails(body.emails);
  const domained = kind === "company" ? validateDomain(body.domain) : { domain: "", error: "" };
  const error = named.error || mailed.error || domained.error;
  if (error) {
    send(res, 400, "text/html; charset=utf-8", renderWelcomePage({
      step: "name",
      kind,
      name: String(body.name || ""),
      emails: String(body.emails || ""),
      domain: String(body.domain || ""),
      error,
    }));
    return;
  }
  let tenantId = "";
  const invites = [];
  try {
    tenantId = await identity.createTenant(session.accessToken, kind, named.name);
    if (domained.domain && typeof identity.setAllowedDomain === "function") {
      await identity.setAllowedDomain(session.accessToken, tenantId, domained.domain);
    }
    const origin = requestOrigin(req, env);
    for (const email of mailed.emails) {
      const token = await identity.createInvite(session.accessToken, tenantId, email, "member");
      invites.push({ email, href: `${origin}/console/invite/${token}` });
    }
    await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
    const cookie = resealOAuth(req, env, session, { onboarded: true, tenantId });
    send(res, 200, "text/html; charset=utf-8", renderWelcomePage({
      step: "ready",
      spaceName: named.name,
      invites,
    }), { "set-cookie": cookie });
  } catch (error) {
    const status = tenantId ? 200 : 400;
    if (tenantId) {
      try {
        await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
      } catch {
        // The space exists. The page still explains what failed.
      }
    }
    const cookie = tenantId ? resealOAuth(req, env, session, { onboarded: true, tenantId }) : "";
    const page = renderWelcomePage(tenantId ? {
      step: "ready",
      spaceName: named.name,
      invites,
      error: identityMessage(error),
    } : {
      step: "name",
      kind,
      name: named.name,
      emails: String(body.emails || ""),
      domain: String(body.domain || ""),
      error: identityMessage(error),
    });
    send(res, status, "text/html; charset=utf-8", page, cookie ? { "set-cookie": cookie } : {});
  }
}

function oauthSession(req, env) {
  const gate = guardConsole(req, env);
  if (gate.session?.kind !== "oauth") return null;
  return gate.session;
}

/**
 * Spaces for the sidebar. Null keeps the Company / Personal switcher.
 * Nothing here is a token or a user id.
 *
 * @param {object | null} identity
 * @param {object | null | undefined} session
 */
export async function loadSpaceView(identity, session) {
  if (!identity || session?.kind !== "oauth") return null;
  try {
    const tenants = sortSpaces(await identity.myTenants(session.accessToken));
    const active = activeSpace(tenants, session.tenantId || "");
    return {
      oauth: true,
      activeId: active?.id || "",
      activeKind: spaceKind(active?.kind),
      activeName: spaceName(active),
      activeRole: active?.role || "",
      items: tenants.map(spaceItem),
      error: "",
    };
  } catch {
    return {
      oauth: true,
      activeId: "",
      activeKind: "personal",
      activeName: "Personal",
      activeRole: "",
      items: [],
      error: "Spaces could not be loaded.",
    };
  }
}

/**
 * Store the active space on the session and return Home.
 *
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   redirect: Function,
 *   readPosted: Function,
 * }} ctx
 */
export async function handleSpaceSwitch(ctx) {
  const { req, res, send, redirect, identity, env } = ctx;
  if (req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  const session = oauthSession(req, env);
  if (!identity || !session) {
    redirect(res, `/console/sign-in?next=${encodeURIComponent("/console")}`);
    return;
  }
  let body = {};
  try {
    body = await ctx.readPosted(req);
  } catch {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a space", "That could not be saved. Try again."));
    return;
  }
  const tenant = String(body.tenant || "");
  if (!TENANT_ID.test(tenant)) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a space", "That space is not on this account."));
    return;
  }
  try {
    const tenants = await identity.myTenants(session.accessToken);
    const match = (Array.isArray(tenants) ? tenants : []).find((row) => row?.id === tenant);
    if (!match) {
      send(res, 404, "text/html; charset=utf-8", renderFlowMessage("Choose a space", "That space is not on this account."));
      return;
    }
    const cookie = resealOAuth(req, env, session, { tenantId: tenant });
    redirect(res, "/console", { "set-cookie": cookie });
  } catch (error) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a space", identityMessage(error)));
  }
}

function spaceKind(kind) {
  if (kind === "personal" || kind === "team" || kind === "company") return kind;
  return "personal";
}

function spaceName(row) {
  const name = String(row?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return name || kindLabel(spaceKind(row?.kind));
}

function spaceItem(row) {
  const kind = spaceKind(row?.kind);
  const name = spaceName(row);
  const role = roleLabel(row?.role || "");
  const letter = kind === "personal"
    ? "P"
    : (name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "S");
  return {
    id: String(row?.id || ""),
    kind,
    name,
    role: typeof row?.role === "string" ? row.role : "",
    hint: [kindLabel(kind), role].filter(Boolean).join(" · "),
    mark: letter,
  };
}
