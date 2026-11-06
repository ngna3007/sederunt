import {
  CONSOLE_SESSION_MS,
  guardConsole,
  safeConsoleNext,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "./console-auth.js";
import { fakeToolsOn, saveToolChoice, toolsConnected } from "./console-account.js";
import { calendarTimeZone } from "./calendar/mcp.js";
import { renderFlowMessage, renderInvitePage, renderWelcomePage } from "./console-welcome.js";
import { requestOrigin } from "./identity/routes.js";
import {
  DEFAULT_BOT_NAME,
  defaultWakePhrases,
  saveBotIdentity,
  validateBotName,
} from "./bot/identity.js";
import {
  activeSpace,
  identityMessage,
  needsOnboarding,
  parseInviteEmails,
  roleLabel,
  sortSpaces,
  suggestedWorkspaceName,
  validateSpaceName,
  visibleSpaces,
  workDomain,
} from "./identity/onboarding.js";
import { claimWorkspaceSlack, slackClaimState } from "./slack/claim.js";
import { requiresDurableBind } from "./tenant-bind.js";

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Send an OAuth user with no workspace from Home to the welcome steps.
 * Passphrase sessions stay on Home.
 * A failed identity read stays on Home rather than a raw error page.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {object | null} identity
 */
export async function welcomeLocation(req, env, identity) {
  const session = oauthSession(req, env);
  if (!identity || !session) return "";
  try {
    const tenants = await identity.myTenants(session.accessToken);
    if (!needsOnboarding(null, tenants)) return "";
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
  const { req, res, url, send, redirect, identity, env } = ctx;
  const session = oauthSession(req, env);
  const manage = url.searchParams.get("mode") === "manage";
  if (!identity) {
    redirect(res, "/console");
    return;
  }
  if (!session) {
    redirect(res, `/console/sign-in?next=${encodeURIComponent(`/console/welcome${url.search || ""}`)}`);
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  let tenants = [];
  try {
    tenants = sortSpaces(await identity.myTenants(session.accessToken));
  } catch (error) {
    sendWelcome(ctx, 200, { step: "workspace", email: session.email, name: "", error: identityMessage(error) });
    return;
  }
  const shared = tenants.filter((row) => row?.kind !== "personal");
  const active = shared.find((row) => row.id === session.tenantId) || shared[0] || null;
  if (req.method === "GET") {
    const asked = url.searchParams.get("step") || "";
    if (!active || asked === "workspace") {
      await renderWorkspaceStep(ctx, session, active && asked === "workspace" ? { renaming: active } : {});
      return;
    }
    if (asked === "calendar" || asked === "chat" || asked === "team") {
      await renderStep(ctx, session, active, asked, { manage, asked: url.searchParams.get("asked") === "1" });
      return;
    }
    redirect(res, "/console");
    return;
  }
  let body = {};
  try {
    body = await ctx.readPosted(req);
  } catch {
    sendWelcome(ctx, 400, { step: "workspace", email: session.email, error: "That could not be saved. Try again." });
    return;
  }
  const action = one(body.action);
  if (typeof body.join === "string" && body.join) {
    await joinWorkspace(ctx, session, body.join);
    return;
  }
  if (action === "rename" && active) {
    await renameWorkspace(ctx, session, active, body);
    return;
  }
  if (action === "create" || !active) {
    await createWorkspace(ctx, session, body);
    return;
  }
  if (action === "calendar") {
    await chooseTool(ctx, session, active, "calendar", body);
    return;
  }
  if (action === "chat") {
    await chooseTool(ctx, session, active, "slack", body);
    return;
  }
  if (action === "invite" || action === "skip") {
    await sendInvites(ctx, session, active, body, action === "skip", manage);
    return;
  }
  redirect(res, "/console");
}

function one(value) {
  return Array.isArray(value) ? String(value[value.length - 1] || "") : String(value || "");
}

function many(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  return value === undefined ? [] : [String(value)];
}

function sendWelcome(ctx, status, state, headers = {}) {
  ctx.send(ctx.res, status, "text/html; charset=utf-8", renderWelcomePage({ fakeTools: fakeToolsOn(ctx.env), ...state }), headers);
}

async function renderWorkspaceStep(ctx, session, extra) {
  const renaming = extra.renaming || null;
  let joinable = [];
  if (!renaming && typeof ctx.identity.joinableTenants === "function") {
    try {
      joinable = await ctx.identity.joinableTenants(session.accessToken);
    } catch {
      joinable = [];
    }
  }
  sendWelcome(ctx, extra.status || 200, {
    step: "workspace",
    renaming: Boolean(renaming),
    email: session.email,
    name: typeof extra.name === "string" ? extra.name : (renaming?.name || suggestedWorkspaceName({ name: session.name, email: session.email })),
    botName: typeof extra.botName === "string" ? extra.botName : DEFAULT_BOT_NAME,
    botInvalid: extra.botInvalid === true,
    joinable,
    error: extra.error || "",
  });
}

async function renderStep(ctx, session, active, step, extra = {}) {
  const { identity, env } = ctx;
  let user = null;
  try {
    user = await identity.getUser(session.accessToken);
  } catch {
    user = null;
  }
  const doors = ctx.doors || {};
  const live = toolsConnected(env, doors, user);
  const meta = user?.user_metadata || {};
  const prefs = meta.sederunt_tool_prefs && typeof meta.sederunt_tool_prefs === "object" ? meta.sederunt_tool_prefs : {};
  if (step === "calendar") {
    const meetings = live.calendar ? await upcomingMeetings(ctx, doors.calendar !== true) : { rows: [], unavailable: false };
    sendWelcome(ctx, 200, {
      step,
      error: extra.error || "",
      notice: extra.asked || (!live.calendar && prefs.calendar === "connect")
        ? "Google Calendar connects for the whole workspace in Setup → Tools. Your choice is saved, so Home will remind you."
        : "",
      calendar: {
        connected: live.calendar,
        meetings: meetings.rows,
        unavailable: meetings.unavailable,
        autoJoin: meta.sederunt_auto_join !== false,
        asked: !live.calendar && prefs.calendar === "connect",
      },
    });
    return;
  }
  if (step === "chat") {
    // Honest connection status: verified ownership for this tenant, not env door flags alone.
    // Fake-tools demo still uses live.slack so the photographed journey stays green.
    let slackLinked = live.slack;
    let conflictOwner = "";
    if (!fakeToolsOn(env) && active?.id && ctx.tenantBind) {
      const claim = await slackClaimState({
        tenantBind: ctx.tenantBind,
        slack: ctx.slack,
        channelId: ctx.slackChannel || "",
        slackConfigured: doors.slack === true,
      }, active.id);
      slackLinked = claim.linked === true;
      conflictOwner = claim.conflictOwner || "";
    }
    const noticeParts = [];
    if (extra.asked || (!slackLinked && prefs.slack === "connect")) {
      noticeParts.push("Slack connects for the whole workspace in Setup → Tools. Your choice is saved, so Home will remind you.");
    }
    if (conflictOwner) {
      noticeParts.push("This Slack workspace is already linked to another Sederunt workspace.");
    }
    sendWelcome(ctx, 200, {
      step,
      error: extra.error || "",
      notice: noticeParts.join(" "),
      chat: {
        slack: slackLinked,
        channel: slackLinked ? await slackChannelLabel(ctx, ctx.slackChannel || (doors.slack ? "" : "sederunt")) : "",
        asked: !slackLinked && prefs.slack === "connect",
      },
    });
    return;
  }
  const canManage = active.role === "owner" || active.role === "admin";
  if (!canManage) {
    sendWelcome(ctx, 200, {
      step: "team",
      manage: extra.manage,
      error: "Only an owner or admin can invite people to this workspace.",
      team: { workspaceName: active.name, invites: [] },
    });
    return;
  }
  let link = "";
  let allowedDomain = "";
  if (typeof identity.workspaceJoinLink === "function") {
    try {
      link = `${requestOrigin(ctx.req, env)}/console/join/${await identity.workspaceJoinLink(session.accessToken, active.id)}`;
    } catch {
      link = "";
    }
  }
  if (typeof identity.workspaceStats === "function") {
    try {
      allowedDomain = (await identity.workspaceStats(session.accessToken, active.id)).allowedDomain || "";
    } catch {
      allowedDomain = "";
    }
  }
  const domain = workDomain(session.email);
  sendWelcome(ctx, extra.status || 200, {
    step: "team",
    manage: extra.manage,
    error: extra.error || "",
    inviteError: extra.inviteError || "",
    team: {
      workspaceName: active.name,
      domain,
      domainOn: Boolean(domain && allowedDomain === domain),
      link,
      invites: extra.invites || [],
    },
  });
}

const FAKE_MEETINGS = [
  { offset: 60, title: "Weekly product sync" },
  { offset: 150, title: "Design review: onboarding" },
  { offset: 24 * 60, title: "Customer call with Northwind" },
];

function zoneDay(ms, zone) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone }).format(new Date(ms));
}

/** "Today", "Tomorrow", or a short weekday, in the calendar's zone. */
function meetingDay(ms, zone, now) {
  const day = zoneDay(ms, zone);
  if (day === zoneDay(now, zone)) return "Today";
  if (day === zoneDay(now + 86_400_000, zone)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(new Date(ms));
}

function meetingClock(ms, zone) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(ms));
}

function meetingRow(start, title, zone, now) {
  return { when: meetingDay(start, zone, now), time: meetingClock(start, zone), title: String(title).trim().slice(0, 120) };
}

/** Pretend meetings for the harness, with times that are always ahead of now. */
function fakeMeetings(zone, now) {
  const base = Math.ceil(now / 1_800_000) * 1_800_000;
  return FAKE_MEETINGS.map((row) => meetingRow(base + row.offset * 60_000, row.title, zone, now));
}

export async function upcomingMeetings(ctx, pretend) {
  const zone = calendarTimeZone(ctx.env);
  const now = Date.now();
  if (pretend) return { rows: fakeMeetings(zone, now), unavailable: false };
  const calendar = ctx.calendar;
  if (!calendar) return { rows: [], unavailable: true };
  // Adapters that list events with start times show them; older ones only name the day's titles.
  if (typeof calendar.listUpcoming === "function") {
    try {
      const listed = await calendar.listUpcoming();
      if (Array.isArray(listed)) {
        const rows = listed
          .map((event) => ({ event, start: Date.parse(event?.start || ""), end: Date.parse(event?.end || "") }))
          .filter((row) => row.event && typeof row.event.title === "string" && row.event.title.trim() && Number.isFinite(row.start))
          .filter((row) => (Number.isFinite(row.end) ? row.end : row.start) > now)
          .sort((x, y) => x.start - y.start)
          .slice(0, 4)
          .map((row) => meetingRow(row.start, row.event.title, zone, now));
        return { rows, unavailable: false };
      }
      if (listed?.unavailable) return { rows: [], unavailable: true };
    } catch {
      /* fall back to the day read below */
    }
  }
  if (typeof calendar.readDay !== "function") return { rows: [], unavailable: true };
  const day = (offset) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: zone })
    .format(new Date(now + offset * 86_400_000)).toLowerCase();
  const rows = [];
  let unavailable = false;
  for (const [offset, when] of [[0, "Today"], [1, "Tomorrow"]]) {
    try {
      const read = await calendar.readDay(day(offset));
      if (read?.unavailable) unavailable = true;
      for (const title of Array.isArray(read?.events) ? read.events : []) {
        if (typeof title === "string" && title.trim()) rows.push({ when, time: "", title: title.trim().slice(0, 120) });
      }
    } catch {
      unavailable = true;
    }
  }
  return { rows: rows.slice(0, 4), unavailable: unavailable && rows.length === 0 };
}

const CHANNEL_ID = /^[CDGW][A-Z0-9]{2,}$/;

/** A Slack channel id is shown only after it resolves to a name. */
async function slackChannelLabel(ctx, raw) {
  const value = String(raw || "").replace(/^#/, "").trim();
  if (!value) return "";
  if (ctx.slack && typeof ctx.slack.channelLabel === "function") {
    try {
      const named = await ctx.slack.channelLabel(value);
      if (named) return String(named).replace(/^#/, "").trim();
    } catch {
      // A failed lookup must not fall back to the raw id.
    }
  }
  if (CHANNEL_ID.test(value)) return "";
  return value;
}

async function renameWorkspace(ctx, session, active, body) {
  const { res, redirect, identity } = ctx;
  const named = validateSpaceName(one(body.name));
  if (named.error) {
    await renderWorkspaceStep(ctx, session, { status: 400, name: one(body.name), error: named.error, renaming: active });
    return;
  }
  if (active.role !== "owner" && active.role !== "admin") {
    await renderWorkspaceStep(ctx, session, { status: 400, name: named.name, error: "Only an owner or admin can rename this workspace.", renaming: active });
    return;
  }
  if (named.name !== active.name) {
    if (typeof identity.renameTenant !== "function") {
      await renderWorkspaceStep(ctx, session, { status: 400, name: named.name, error: "This workspace could not be renamed.", renaming: active });
      return;
    }
    try {
      await identity.renameTenant(session.accessToken, active.id, named.name);
    } catch (error) {
      await renderWorkspaceStep(ctx, session, { status: 400, name: named.name, error: identityMessage(error), renaming: active });
      return;
    }
  }
  redirect(res, "/console/welcome?step=calendar");
}

async function createWorkspace(ctx, session, body) {
  const { req, res, redirect, identity, env } = ctx;
  const typedName = one(body.name);
  const typedBot = one(body.bot_name).trim();
  const named = validateSpaceName(typedName);
  const botNamed = validateBotName(typedBot || DEFAULT_BOT_NAME);
  if (named.error) {
    await renderWorkspaceStep(ctx, session, {
      status: 400,
      name: typedName,
      botName: typedBot || DEFAULT_BOT_NAME,
      error: named.error,
    });
    return;
  }
  if (!botNamed.ok) {
    await renderWorkspaceStep(ctx, session, {
      status: 400,
      name: named.name,
      botName: typedBot,
      botInvalid: true,
      error: botNamed.error,
    });
    return;
  }
  try {
    const tenantId = await identity.createTenant(session.accessToken, "company", named.name);
    try {
      await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
    } catch {
      // The workspace exists, which is what Home checks.
    }
    if (botNamed.name !== DEFAULT_BOT_NAME && ctx.botPreferences) {
      try {
        await saveBotIdentity(ctx.botPreferences, {
          tenantId,
          name: botNamed.name,
          phrases: defaultWakePhrases(botNamed.name),
        });
      } catch {
        // The workspace exists. The name can be set on Account.
      }
    }
    const cookie = resealOAuth(req, env, session, { onboarded: true, tenantId });
    const from = one(body.from);
    redirect(res, from === "switcher" ? "/console/welcome?step=team&mode=manage" : "/console/welcome?step=calendar", { "set-cookie": cookie });
  } catch (error) {
    await renderWorkspaceStep(ctx, session, {
      status: 400,
      name: named.name,
      botName: botNamed.name,
      error: identityMessage(error),
    });
  }
}

async function joinWorkspace(ctx, session, tenantId) {
  const { req, res, redirect, identity, env } = ctx;
  if (!TENANT_ID.test(tenantId) || typeof identity.joinByDomain !== "function") {
    await renderWorkspaceStep(ctx, session, { status: 400, error: "That workspace is not open to your email domain." });
    return;
  }
  try {
    await identity.joinByDomain(session.accessToken, tenantId);
    try {
      await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
    } catch {
      // Membership is what Home checks.
    }
    const cookie = resealOAuth(req, env, session, { onboarded: true, tenantId });
    redirect(res, "/console/welcome?step=calendar", { "set-cookie": cookie });
  } catch (error) {
    await renderWorkspaceStep(ctx, session, { status: 400, error: identityMessage(error) });
  }
}

async function chooseTool(ctx, session, active, tool, body) {
  const { res, redirect, identity, env } = ctx;
  const choice = one(body.choice);
  const here = tool === "calendar" ? "calendar" : "chat";
  const next = tool === "calendar" ? "/console/welcome?step=chat" : "/console/welcome?step=team";
  try {
    if (choice === "later") {
      await saveToolChoice(identity, session, tool, "later");
      redirect(res, next);
      return;
    }
    if (choice === "connect") {
      // Shared Slack install (auth.test → deployment bot team): only owner/admin may claim.
      // Fake-tools demo still goes through this handler so the HTTP path is gated too.
      if (tool === "slack") {
        const role = String(active?.role || "");
        if (role !== "owner" && role !== "admin") {
          await renderStep(ctx, session, active, here, {
            error: "Only an owner or admin can connect Slack for this workspace.",
          });
          return;
        }
      }
      await saveToolChoice(identity, session, tool, "connect");
      if (fakeToolsOn(env)) {
        const user = await identity.getUser(session.accessToken);
        const fake = { ...(user?.user_metadata?.sederunt_fake_tools || {}), [tool]: true };
        await identity.updateUser(session.accessToken, { sederunt_fake_tools: fake });
        redirect(res, `/console/welcome?step=${here}`);
        return;
      }
      // Explicit Slack claim: verified auth.test team (+ default channel) → active tenant.
      // First-writer-wins; never bind from console browsing or a deploy SLACK_TEAM_ID.
      if (tool === "slack" && active?.id && ctx.tenantBind) {
        const claimed = await claimWorkspaceSlack({
          tenantBind: ctx.tenantBind,
          slack: ctx.slack,
          channelId: ctx.slackChannel || "",
          requireRemote: requiresDurableBind(env),
        }, active.id);
        if (!claimed.ok) {
          const error = claimed.conflict
            ? "Slack is already linked to another workspace."
            : "Slack could not be linked for this workspace. Check the bot token and try again.";
          await renderStep(ctx, session, active, here, { error });
          return;
        }
        redirect(res, `/console/welcome?step=${here}`);
        return;
      }
      redirect(res, `/console/welcome?step=${here}&asked=1`);
      return;
    }
    if (tool === "calendar") {
      await identity.updateUser(session.accessToken, { sederunt_auto_join: body.auto_join === "on" || body.auto_join === "true" });
    }
    redirect(res, next);
  } catch (error) {
    await renderStep(ctx, session, active, here, { error: identityMessage(error) });
  }
}

async function sendInvites(ctx, session, active, body, skip, manage) {
  const { req, res, redirect, identity, env } = ctx;
  const done = manage ? "/console/people" : "/console";
  const emails = many(body.emails);
  const roles = many(body.roles);
  const wanted = [];
  const seen = new Set();
  let inviteError = "";
  if (!skip) {
    emails.forEach((value, index) => {
      if (!value.trim()) return;
      const parsed = parseInviteEmails(value);
      if (parsed.error) {
        inviteError = inviteError || parsed.error;
        return;
      }
      const role = roles[index] === "admin" ? "admin" : "member";
      for (const email of parsed.emails) {
        if (seen.has(email)) continue;
        seen.add(email);
        wanted.push({ email, role });
      }
    });
    if (wanted.length > 50) inviteError = "Invite up to 50 people at a time.";
    if (wanted.some((row) => row.email === String(session.email || "").toLowerCase())) {
      inviteError = "You're already in this workspace. Remove your own address.";
    }
    if (inviteError) {
      await renderStep(ctx, session, active, "team", { status: 400, manage, inviteError, invites: wanted });
      return;
    }
  }
  try {
    const domain = workDomain(session.email);
    if (body.domain_present && domain && typeof identity.setAllowedDomain === "function") {
      const on = body.domain_join === "on" || body.domain_join === "true";
      const stats = typeof identity.workspaceStats === "function"
        ? await identity.workspaceStats(session.accessToken, active.id).catch(() => null)
        : null;
      const was = stats ? stats.allowedDomain === domain : false;
      if (on !== was) await identity.setAllowedDomain(session.accessToken, active.id, on ? domain : null);
    }
  } catch (error) {
    await renderStep(ctx, session, active, "team", { status: 400, manage, error: identityMessage(error), invites: wanted });
    return;
  }
  if (skip || wanted.length === 0) {
    redirect(res, done);
    return;
  }
  const origin = requestOrigin(req, env);
  const made = [];
  const failed = [];
  for (const row of wanted) {
    try {
      const token = await identity.createInvite(session.accessToken, active.id, row.email, row.role);
      made.push({ ...row, href: `${origin}/console/invite/${token}` });
    } catch (error) {
      failed.push(`${row.email}: ${identityMessage(error)}`);
    }
  }
  if (!made.length) {
    await renderStep(ctx, session, active, "team", { status: 400, manage, inviteError: failed[0] || "Those invites could not be created.", invites: wanted });
    return;
  }
  sendWelcome(ctx, 200, {
    step: "sent",
    manage,
    error: failed.length ? `Not invited: ${failed.join("; ")}` : "",
    sent: { workspaceName: active.name, invites: made },
  });
}

/**
 * The reusable workspace link. Anyone signed in joins as a Member.
 *
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   identity: object | null,
 *   send: Function,
 *   redirect: Function,
 *   token: string,
 * }} ctx
 */
export async function handleJoinLink(ctx) {
  const { req, res, send, redirect, token, identity, env } = ctx;
  if (!identity || typeof identity.acceptJoinLink !== "function") {
    redirect(res, "/console");
    return;
  }
  const session = oauthSession(req, env);
  if (!session) {
    redirect(res, `/console/sign-in?next=${encodeURIComponent(safeConsoleNext(`/console/join/${token}`))}`);
    return;
  }
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) {
    send(res, 400, "text/html; charset=utf-8", renderInvitePage({ join: true, error: "That link is invalid or was reset." }));
    return;
  }
  if (req.method === "GET") {
    send(res, 200, "text/html; charset=utf-8", renderInvitePage({ join: true }));
    return;
  }
  try {
    const tenantId = await identity.acceptJoinLink(session.accessToken, token);
    try {
      await identity.updateUser(session.accessToken, { sederunt_onboarded: true });
    } catch {
      // Membership is what Home checks.
    }
    const cookie = resealOAuth(req, env, session, { onboarded: true, tenantId: String(tenantId || "") });
    redirect(res, "/console", { "set-cookie": cookie });
  } catch (error) {
    send(res, 400, "text/html; charset=utf-8", renderInvitePage({ join: true, error: identityMessage(error) }));
  }
}

/**
 * Home's getting-started card. Every item reads real state.
 *
 * @param {object | null} identity
 * @param {object | null | undefined} session
 * @param {{ activeId?: string, activeRole?: string } | null} spaces
 * @param {{ connected?: { calendar?: boolean, slack?: boolean }, prefs?: Record<string, string> } | null} toolAsk
 */
export async function loadChecklist(identity, session, spaces, toolAsk) {
  if (!identity || session?.kind !== "oauth" || !spaces?.activeId) return null;
  const admin = spaces.activeRole === "owner" || spaces.activeRole === "admin";
  let team = false;
  if (typeof identity.workspaceStats === "function") {
    try {
      const stats = await identity.workspaceStats(session.accessToken, spaces.activeId);
      team = stats.members > 1 || stats.openInvites > 0;
    } catch {
      team = false;
    }
  }
  return {
    tenantId: spaces.activeId,
    calendar: toolAsk?.connected?.calendar === true,
    chat: toolAsk?.connected?.slack === true,
    team,
    canInvite: admin,
  };
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
      items: visibleSpaces(tenants).map(spaceItem),
      error: "",
    };
  } catch {
    return {
      oauth: true,
      activeId: "",
      activeKind: "company",
      activeName: "Workspace",
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
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a workspace", "That could not be saved. Try again."));
    return;
  }
  const tenant = String(body.tenant || "");
  if (!TENANT_ID.test(tenant)) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a workspace", "That workspace is not on this account."));
    return;
  }
  try {
    const tenants = await identity.myTenants(session.accessToken);
    const match = (Array.isArray(tenants) ? tenants : []).find((row) => row?.id === tenant);
    if (!match) {
      send(res, 404, "text/html; charset=utf-8", renderFlowMessage("Choose a workspace", "That workspace is not on this account."));
      return;
    }
    const cookie = resealOAuth(req, env, session, { tenantId: tenant });
    redirect(res, "/console", { "set-cookie": cookie });
  } catch (error) {
    send(res, 400, "text/html; charset=utf-8", renderFlowMessage("Choose a workspace", identityMessage(error)));
  }
}

function spaceKind(kind) {
  if (kind === "personal" || kind === "team" || kind === "company") return kind;
  return "personal";
}

function spaceName(row) {
  const name = String(row?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return name || "Workspace";
}

function spaceItem(row) {
  const kind = spaceKind(row?.kind);
  const name = spaceName(row);
  const role = roleLabel(row?.role || "");
  const letter = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "W";
  return {
    id: String(row?.id || ""),
    kind,
    name,
    role: typeof row?.role === "string" ? row.role : "",
    hint: role,
    mark: letter,
  };
}
