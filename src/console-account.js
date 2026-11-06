import { guardConsole } from "./console-auth.js";
import { renderFlowMessage } from "./console-welcome.js";
import { identityMessage, roleLabel } from "./identity/onboarding.js";

const TOOLS = ["calendar", "linear", "slack"];

/**
 * Profile fields safe to put on the Account page. No token and no user id.
 *
 * @param {object | null} identity
 * @param {object | null | undefined} session
 * @param {object | null} spaces
 */
export async function loadAccountProfile(identity, session, spaces) {
  if (!identity || session?.kind !== "oauth") return null;
  let profile = null;
  try {
    profile = await identity.profile(session.accessToken);
  } catch {
    profile = null;
  }
  const name = clip(profile?.display_name || session.name, 120);
  const email = clip(profile?.email || session.email, 320);
  const provider = session.provider === "github" ? "github" : session.provider === "google" ? "google" : "";
  return {
    oauth: true,
    name,
    email,
    avatar: safeAvatar(profile?.avatar_url, session.userId),
    provider,
    providerLabel: provider === "github" ? "Signed in with GitHub" : provider === "google" ? "Signed in with Google" : "Signed in",
    spaceName: clip(spaces?.activeName || "", 120),
    spaceRole: roleLabel(spaces?.activeRole || ""),
  };
}

/**
 * Whether Calendar, Linear, and Slack should be asked on first use.
 * A connected tool is not asked. "connect" and Slack "never" stay quiet.
 *
 * @param {object | null} identity
 * @param {object | null | undefined} session
 * @param {{ calendar?: boolean, linear?: boolean, slack?: boolean }} connected
 */
export async function loadToolAsk(identity, session, connected = {}, env = {}) {
  if (!identity || session?.kind !== "oauth") return null;
  let prefs = {};
  let user = null;
  try {
    user = await identity.getUser(session.accessToken);
    prefs = cleanPrefs(user?.user_metadata?.sederunt_tool_prefs);
  } catch {
    prefs = {};
  }
  const live = toolsConnected(env, connected, user);
  return {
    oauth: true,
    connected: live,
    prefs,
    autoJoin: user?.user_metadata?.sederunt_auto_join === true,
  };
}

/**
 * The harness may pretend a tool is connected so the first-run journey can be
 * walked and photographed without Google or Slack. Only with fake sign-in on.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function fakeToolsOn(env = {}) {
  return env.SEDERUNT_AUTH_FAKE === "1" && env.SEDERUNT_TOOLS_FAKE === "1";
}

/**
 * Connected tools: the server's own connections, plus harness pretend ones.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ calendar?: boolean, linear?: boolean, slack?: boolean }} connected
 * @param {{ user_metadata?: Record<string, unknown> } | null | undefined} user
 */
export function toolsConnected(env, connected = {}, user = null) {
  const fake = fakeToolsOn(env) && user?.user_metadata?.sederunt_fake_tools && typeof user.user_metadata.sederunt_fake_tools === "object"
    ? user.user_metadata.sederunt_fake_tools
    : {};
  return {
    calendar: connected.calendar === true || fake.calendar === true,
    linear: connected.linear === true || fake.linear === true,
    slack: connected.slack === true || fake.slack === true,
  };
}

/**
 * Save one tool choice. Home's lazy asks, Setup, and welcome all call this.
 *
 * @param {object} identity
 * @param {{ accessToken: string }} session
 * @param {string} tool
 * @param {string} choice
 */
export async function saveToolChoice(identity, session, tool, choice) {
  if (!TOOLS.includes(tool) || (choice !== "later" && choice !== "connect" && !(tool === "slack" && choice === "never"))) {
    throw new Error("That choice is not available.");
  }
  const user = await identity.getUser(session.accessToken);
  const prefs = cleanPrefs(user?.user_metadata?.sederunt_tool_prefs);
  prefs[tool] = choice;
  await identity.updateUser(session.accessToken, { sederunt_tool_prefs: prefs });
  return prefs;
}

/**
 * Save one tool choice on the auth user. The page shows the sentence, not JSON.
 *
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   readPosted: Function,
 * }} ctx
 */
export async function handleToolPref(ctx) {
  const { req, res, send, identity, env } = ctx;
  if (req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  const gate = guardConsole(req, env);
  const session = gate.session?.kind === "oauth" ? gate.session : null;
  if (!identity || !session) {
    send(res, 401, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "Sign in again." }));
    return;
  }
  let body = {};
  try {
    body = await ctx.readPosted(req);
  } catch {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Tools", "That could not be saved. Try again."));
    return;
  }
  const tool = String(body.tool || "");
  const choice = String(body.choice || "");
  if (!TOOLS.includes(tool) || (choice !== "later" && choice !== "connect" && !(tool === "slack" && choice === "never"))) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Tools", "That choice is not available."));
    return;
  }
  try {
    const prefs = await saveToolChoice(identity, session, tool, choice);
    send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, prefs }));
  } catch (error) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Tools", identityMessage(error)));
  }
}

function cleanPrefs(raw) {
  const prefs = {};
  if (!raw || typeof raw !== "object") return prefs;
  for (const tool of TOOLS) {
    const value = raw[tool];
    if (value === "later" || value === "connect" || (tool === "slack" && value === "never")) prefs[tool] = value;
  }
  return prefs;
}

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeAvatar(value, userId) {
  const url = String(value || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(url) || url.length > 500) return "";
  if (userId && url.includes(String(userId))) return "";
  if (/token|bearer|secret/i.test(url)) return "";
  return url;
}
