/**
 * Application HTTP routes for createApp.
 * Each entry is [name, handler]; the handler returns true when it answered.
 */
import { handleCalendarEvent } from "../calendar/route.js";
import { handleConnectorRoutes } from "../connectors/route.js";
import { handleNodeForms } from "../mcp-forms/http.js";
import { calendarTimeZone } from "../calendar/mcp.js";
import { handleLinearOAuth } from "../linear/oauth.js";
import { renderCameraPage } from "../meeting/camera.js";
import { handleMeetingAgent, keptAfterCue } from "../meeting/agent-http.js";
import { isBareKeepCue } from "../meeting/voice-write.js";
import { loadSpikeShapes, measureSpeechProbe, pushSpikeShape, readSpikeShapes, saveSpikeShape, spikeAuthorized, spikeEnabled, transcriptEventShape } from "../meeting/spike.js";
import { bindAgentSeat, bindMeetingEar, finishAgentSeat, rememberAgentMember, rememberAgentSpeaker, rememberKeepCue, rememberMeetingHost, rememberMeetingPerson, takeKeepCue, validMeetingEar } from "../meeting/seat.js";
import { meetingCallUpdate, meetingEnded, recallParticipantChange, recallTranscriptDelivery, verifyRecallRequest } from "../meeting/recall.js";
import { claimMeetingEvent, claimMeetingEventLocal, meetingEventKey, releaseMeetingEvent, releaseMeetingEventLocal } from "../meeting/events.js";
import { keepRoomTranscript, rememberMeetingLine } from "../meeting/speech-gate.js";
import { parseFollowupValue } from "../meeting/followups.js";
import { followupInteractionFields } from "../meeting/live-followups.js";
import { bindToolMember, handleMcpRequest, memberRefusal, mcpJsonRpc } from "../mcp.js";
import { renderConsolePage } from "../console-page.js";
import { handleSlackOAuth } from "../slack/oauth.js";
import { installationFetch, slackConnection, slackEventTenant, tenantSlackClient } from "../slack/tenant-slack.js";
import { slackOAuthConfigured } from "../slack/installations.js";
import { renderSignInPage } from "../console-sign-in.js";
import { CONSOLE_SESSION_MS, clearedSessionCookie, consoleSecret, guardConsole, passphraseMatches, safeConsoleNext, sealSession, sessionCookie, sessionSecret } from "../console-auth.js";
import { identityConfigured } from "../identity/client.js";
import { resolveSignInProviders } from "../identity/shared.js";
import { clearOAuthCookie } from "../identity/pending.js";
import { handleAuthRoute } from "../identity/routes.js";
import { assignEffectiveHearing, effectiveHearing, saveMeetingGuest } from "../bot/meeting-guest.js";
import { authorizeBotWrite, canEditBot, handleBotSettings, readBot } from "../console/bot-settings.js";
import { handleToolPref, loadAccountProfile, loadToolAsk } from "../console-account.js";
import { handleConsoleInvites, handleInvite, handleJoinLink, handleSpaceSwitch, handleWelcome, loadChecklist, loadSpaceView, welcomePath } from "../console-flow.js";
import { roleLabel } from "../identity/onboarding.js";
import { handleFileRequest } from "../files/routes.js";
import { hideDeletedSlackMessages, ingestSlackFile } from "../files/slack.js";
import { slackReadPrincipal } from "../slack/identity-link.js";
import { isMeetingQuestion } from "../slack/meeting-digest.js";
import { answerSlackQuestion, claimSlackAsk, findReplyFile, invitedFileRows, postSlackReply, prepareSlackCaption } from "../slack/reply.js";
import { slackBotUserIds, slackDelivery, slackEventHasFiles, verifySlackRequest } from "../slack/sign.js";
import { companyBoard, downloadFile, endMeeting, handleUtterance, noteMeetingCall, readProofs, replayFailure, roomLedger, saveHearing, searchPublishedActivity, undoRecorded } from "../typed-path.js";
import { consolePrincipal } from "../console-principal.js";
import { canReadInSession, canReadOpenedMeeting, meetingRoomReaders, readPrincipalId, readableSession } from "../domain/read-access.js";
import { redact } from "../domain/redact.js";
import { askLimit } from "../ask/store.js";
import { openRouterConfig } from "../openrouter.js";
import { requiresDurableBind } from "../tenant-bind.js";
import { handleStaticRoutes } from "./static.js";
import { send, redirect } from "./send.js";


export function createAppRouteTable(ctx) {
  const {
    workspace, env, identity, options, filesRuntime, handleAdmin, recover, deps,
    prepareWorkspace, sessionFor, depsFor, resolveCompanyId, resolvePersonTenantId,
    resolveBoundTenant, sendCompanyDenied, handleAsk, chatReply, readJson, readPosted,
    readPostedAll, readBody, readRequest, calendarForRequest, doorsForRequest,
    activitySameOrigin, chainReport, consolePayload, consoleSection, consoleBoardMember,
    pageLinear, pageSlack, calendarGranted, currentBot, roomMedia, persistMeetingFollowups,
    kickMemoryRetries, headerValue, doorReport, deliveryFrom, calendarMeetings,
    appConfig, chatAnswer, hearingTenantId, isExplicitKeep, keptFileNames,
    keptNotice, linearInstallReady, meetingPlatform, readableFileRows,
    rejectTypedFollowup, replyDeletionFailed, roomActivityFor, settleFileJobs,
    slackAskerLink, slackBytes, slackMeetingMemories, slackOneToOne, slackPeople,
    slackScopeId, snapshotDecisionFiles, storedFileBytes, walrusFileReader, within,
    withinMs, withinOrNull, bindSlackChannelOnce, mcpCallContext, scheduleRecovery,
    MEDIA_INDEX_WAIT_MS, MEDIA_STEP_MS, MEDIA_KEEP_BUDGET_MS,
    PAGE_DOOR_WAIT_MS, BOARD_SIDE_WAIT_MS, BOARD_INDEX_WAIT_MS, SLACK_NOT_SHARED,
  } = ctx;

  return [
    ['api-recovery-drain', async (req, res, url) => {
      if (!((req.method === "POST" || req.method === "GET") && url.pathname === "/api/recovery/drain")) return false;
      await (async () => {
        const secret = req.method === "GET" ? env.CRON_SECRET : env.SEDERUNT_RECOVERY_SECRET;
        const authorization = headerValue(req.headers.authorization);
        if (!secret || !passphraseMatches(authorization, `Bearer ${secret}`)) {
          send(res, 401, "application/json", JSON.stringify({ error: "Unauthorized." }));
          return;
        }
        const body = req.method === "GET" ? {} : await readJson(req);
        const limit = body.limit ?? 10;
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
          send(res, 400, "application/json", JSON.stringify({ error: "Limit must be between 1 and 10." }));
          return;
        }
        send(res, 200, "application/json", JSON.stringify(await recover(limit)));
        return;
    
      })();
      return true;
    }],
    ["admin", async (req, res, url) => handleAdmin(req, res, url, { send, redirect })],
    ["files", async (req, res, url) => (filesRuntime ? handleFileRequest(req, res, url, filesRuntime, { send }) : false)],
    ["forms", async (req, res, url) => handleNodeForms(req, res, { forms: workspace.forms, env, url })],
    ["static", async (req, res, url) => handleStaticRoutes(req, res, url)],
    ['console-auth', async (req, res, url) => {
      if (!(url.pathname === "/console/auth" || url.pathname.startsWith("/console/auth/"))) return false;
      await (async () => {
        await handleAuthRoute({ req, res, url, env, identity, send, redirect, googleGrants: workspace.googleGrants, calendarSave: workspace.calendarSave, fetchImpl: options.fetch || globalThis.fetch });
        return;
    
      })();
      return true;
    }],
    ['slackOAuth', async (req, res, url) => await handleSlackOAuth(req, res, url, {
      env,
      installations: workspace.slackInstallations,
      fetchImpl: options.slackOAuthFetch || options.fetch || globalThis.fetch,
      activeTenant: async (request) => {
        const gate = guardConsole(request, env);
        if (!identity || gate.session?.kind !== "oauth") return { unauthorized: true };
        const view = await loadSpaceView(identity, gate.session);
        return { userId: String(gate.session.userId || ""), tenantId: view?.activeId || "", role: view?.activeRole || "" };
      },
      roleIn: async (request, tenantId) => {
        const gate = guardConsole(request, env);
        if (!identity || gate.session?.kind !== "oauth") return "";
        try {
          const tenants = await identity.myTenants(gate.session.accessToken);
          const hit = (tenants || []).find((item) => item?.id === tenantId);
          return hit?.role || "";
        } catch {
          return "";
        }
      },
    })],
    ['linearOAuth', async (req, res, url) => await handleLinearOAuth(req, res, url, {
      env,
      installations: workspace.linearInstallations,
      fetchImpl: options.linearOAuthFetch || options.fetch || globalThis.fetch,
      activeTenant: async (request) => {
        const gate = guardConsole(request, env);
        if (!identity || gate.session?.kind !== "oauth") return { unauthorized: true };
        const view = await loadSpaceView(identity, gate.session);
        return { userId: String(gate.session.userId || ""), tenantId: view?.activeId || "", role: view?.activeRole || "" };
      },
      roleIn: async (request, tenantId) => {
        const gate = guardConsole(request, env);
        if (!identity || gate.session?.kind !== "oauth") return "";
        try {
          const tenants = await identity.myTenants(gate.session.accessToken);
          const hit = (tenants || []).find((item) => item?.id === tenantId);
          return hit?.role || "";
        } catch {
          return "";
        }
      },
    })],
    ['console-sign-in', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/console/sign-in")) return false;
      await (async () => {
        if (!consoleSecret(env) && !identity) {
          redirect(res, "/console");
          return;
        }
        const gate = guardConsole(req, env);
        if (gate.session) {
          redirect(res, safeConsoleNext(url.searchParams.get("next") || "/console"));
          return;
        }
        const reason = url.searchParams.get("reason") || req.authFailure || "";
        const providers = identity ? await resolveSignInProviders(identity) : { google: false, github: false };
        send(res, 200, "text/html; charset=utf-8", renderSignInPage({
          configured: Boolean(consoleSecret(env)),
          oauth: Boolean(identity),
          memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
          reason: reason === "expired" || reason === "invalid" || reason === "mismatch" || reason === "missing-pass" ? reason : "",
          name: url.searchParams.get("name") || "",
          next: safeConsoleNext(url.searchParams.get("next") || "/console"),
          providers,
        }));
        return;
    
      })();
      return true;
    }],
    ['console-sign-in-2', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/console/sign-in")) return false;
      await (async () => {
        if (identity) {
          send(res, 403, "text/html; charset=utf-8", renderSignInPage({ oauth: true, configured: false, providers: { google: true, github: false }, notice: "Continue with Google to sign in." }));
          return;
        }
        const body = await readPosted(req);
        const next = safeConsoleNext(typeof body.next === "string" ? body.next : "/console");
        const secret = consoleSecret(env);
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
        const providers = identity ? await resolveSignInProviders(identity) : { google: false, github: false };
        if (!secret) {
          send(res, 200, "text/html; charset=utf-8", renderSignInPage({
            configured: false,
            oauth: Boolean(identity),
            memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
            name,
            next,
            providers,
          }));
          return;
        }
        const given = typeof body.passphrase === "string" ? body.passphrase : "";
        if (!given) {
          send(res, 400, "text/html; charset=utf-8", renderSignInPage({
            configured: true,
            oauth: Boolean(identity),
            memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
            reason: "missing-pass",
            name,
            next,
            providers,
          }));
          return;
        }
        if (!passphraseMatches(given, secret)) {
          send(res, 401, "text/html; charset=utf-8", renderSignInPage({
            configured: true,
            oauth: Boolean(identity),
            memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
            reason: "mismatch",
            name,
            next,
            providers,
          }));
          return;
        }
        const token = sealSession({
          memberId: String(env.SEDERUNT_MEMBER || "").trim(),
          name,
          exp: Date.now() + CONSOLE_SESSION_MS,
        }, secret);
        redirect(res, next, { "set-cookie": sessionCookie(token, req, Math.floor(CONSOLE_SESSION_MS / 1000)) });
        return;
    
      })();
      return true;
    }],
    ['console-profile', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/console/profile")) return false;
      await (async () => {
        const secret = consoleSecret(env);
        const gate = guardConsole(req, env);
        const body = await readJson(req);
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
        const oauth = gate.session?.kind === "oauth";
        if ((!secret && !oauth) || !gate.session) {
          send(res, 409, "application/json; charset=utf-8", JSON.stringify({ error: "Sign-in is not set up." }));
          return;
        }
        if (!name) {
          send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Enter a display name." }));
          return;
        }
        const token = sealSession(oauth ? {
          ...gate.session,
          name,
          exp: Date.now() + CONSOLE_SESSION_MS,
        } : {
          memberId: gate.session.memberId || String(env.SEDERUNT_MEMBER || "").trim(),
          name,
          exp: Date.now() + CONSOLE_SESSION_MS,
        }, oauth ? sessionSecret(env) : secret);
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ name }), {
          "set-cookie": sessionCookie(token, req, Math.floor(CONSOLE_SESSION_MS / 1000)),
        });
        return;
    
      })();
      return true;
    }],
    ['console-sign-out', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/console/sign-out")) return false;
      await (async () => {
        redirect(res, "/console/sign-in", { "set-cookie": [clearedSessionCookie(req), clearOAuthCookie(req)] });
        return;
    
      })();
      return true;
    }],
    ['console-room-media', async (req, res, url) => {
      if (!(req.method === "GET" && /^\/console\/rooms\/[^/]+\/media$/.test(url.pathname))) return false;
      await (async () => {
        const mediaStartedAt = Date.now();
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in." }));
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/console/rooms/".length, -"/media".length));
        const resolved = await resolveCompanyId(workspace, req, url.searchParams.get("company") || "");
        if (resolved.denied || resolved.unauthorized) { sendCompanyDenied(res, send, resolved); return; }
        // A cold instance rebuilds the company index from Walrus Memory first. Wait a
        // bounded time; past it the page asks again instead of the request dying at 60 s.
        const current = await prepareWorkspace(workspace, resolved.companyId, false, workspace.mediaIndexWaitMs || MEDIA_INDEX_WAIT_MS);
        if (workspace.companyLoaded && !current.readReport) {
          send(res, 503, "application/json; charset=utf-8", JSON.stringify({ state: "loading", retryMs: 2000 }), { "retry-after": "2" });
          return;
        }
        const hearingTenant = (typeof resolved.companyId === "string" && resolved.companyId.trim()) || "local";
        // Preparing the room reads the guest again. A failed follow-up read keeps the recording closed.
        try {
          await withinMs(readBot(workspace.botPreferences, hearingTenant), MEDIA_STEP_MS);
        } catch {
          const denied = new Error("The hearing record could not be read.");
          denied.status = 503;
          throw denied;
        }
        const principal = await consolePrincipal(workspace, req, resolved.companyId);
        const roomDecisions = (current.decisions || []).filter((row) => row.roomId === id && !row.deleted);
        const opened = (current.rooms || []).find((item) => item.id === id);
        if (roomDecisions.length) {
          const readers = meetingRoomReaders(current);
          if (!roomDecisions.every((row) => canReadInSession(principal, row, readers))) {
            send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "That room is not available." }));
            return;
          }
        } else if (!canReadOpenedMeeting(principal, opened)) {
          send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "That room is not available." }));
          return;
        }
        // Background saves stop before the 60 s function limit counted from the
        // request start (b38fa40d timed out: a 55 s keep began ~20 s in).
        const media = await withinOrNull(roomMedia({ ...workspace, session: current, mediaTenantId: resolved.companyId, sessionReady: true, keepUntil: mediaStartedAt + MEDIA_KEEP_BUDGET_MS }, id), MEDIA_STEP_MS * 2);
        if (!media) {
          send(res, 503, "application/json; charset=utf-8", JSON.stringify({ state: "loading", retryMs: 15000 }), { "retry-after": "15" });
          return;
        }
        // Activity rows for this room from the Redis mirror, so a meeting that just
        // ended shows what Adam did even when this instance's index predates it.
        const body = { ...media, activity: await within(roomActivityFor(workspace, current, resolved.companyId, id), MEDIA_STEP_MS, []) };
        const secret = typeof env.RECALL_API_KEY === "string" ? env.RECALL_API_KEY : "";
        const raw = secret.length >= 12 ? JSON.stringify(body).split(secret).join("") : JSON.stringify(body);
        send(res, 200, "application/json; charset=utf-8", raw);
        return;
    
      })();
      return true;
    }],
    ['console-room-name', async (req, res, url) => {
      if (!(req.method === "POST" && /^\/console\/rooms\/[^/]+\/name$/.test(url.pathname))) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in." }));
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/console/rooms/".length, -"/name".length));
        const posted = await readJson(req);
        const name = typeof posted.name === "string" ? posted.name.trim().slice(0, 80) : "";
        if (!name || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
          send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Enter a room name." }));
          return;
        }
        const current = await prepareWorkspace(workspace, "");
        current.roomNames ??= {};
        current.roomNames[id] = name;
        const opened = (current.rooms || []).find((item) => item.id === id);
        if (opened) opened.name = name;
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ id, name }));
        return;
    
      })();
      return true;
    }],
    ['api-bot', async (req, res, url) => {
      if (!(url.pathname === "/api/bot")) return false;
      await (async () => {
        await handleBotSettings({
          req, res, url, env, identity, send, readJson, store: workspace.botPreferences,
        });
        return;
    
      })();
      return true;
    }],
    ['api-activity', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/api/activity")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (!gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ ok: false, reason: "sign-in" }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId, false, 2000);
        const groups = searchPublishedActivity(current, current.rooms || [], {
          query: url.searchParams.get("q") || "",
          roomId: url.searchParams.get("room") || "",
          kind: url.searchParams.get("kind") || "",
        }, { timeZone: calendarTimeZone(env), slackChannel: appConfig(env).slackChannel });
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, groups }));
        return;
    
      })();
      return true;
    }],
    ['api-activity-2', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/activity")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (!gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ ok: false, reason: "sign-in" }));
          return;
        }
        if (!activitySameOrigin(req)) {
          send(res, 403, "application/json; charset=utf-8", JSON.stringify({ ok: false, reason: "origin" }));
          return;
        }
        const body = await readJson(req);
        if (body.op !== "undo" && body.op !== "retry") {
          send(res, 400, "application/json; charset=utf-8", JSON.stringify({ ok: false, reason: "op" }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId, false, 2000);
        const id = typeof body.id === "string" ? body.id : "";
        const actor = gate.session.name?.trim() || "Someone";
        const deps = depsFor(workspace, companyId);
        const result = body.op === "undo"
          ? await undoRecorded(current, deps, id, actor)
          : await replayFailure(current, deps, id);
        const status = result.ok ? 200 : result.reason === "missing" || result.reason === "not-action" ? 404 : 409;
        send(res, status, "application/json; charset=utf-8", JSON.stringify(result));
        return;
    
      })();
      return true;
    }],
    ['console-welcome', async (req, res, url) => {
      if (!((req.method === "GET" || req.method === "POST") && url.pathname === "/console/welcome")) return false;
      await (async () => {
        const [resolved, personSpace] = await Promise.all([
          resolveCompanyId(workspace, req, ""),
          resolvePersonTenantId(workspace, req, ""),
        ]);
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const personId = String(guardConsole(req, env).session?.userId || "").trim();
        const grantTenant = personSpace.tenantId || companyId;
        const [calendar, doors] = await Promise.all([
          calendarForRequest(workspace, { companyId: grantTenant, personId, req }),
          doorsForRequest(workspace, { companyId: grantTenant, personId, req }),
        ]);
        await handleWelcome({
          req, res, url, env, identity, send, redirect,
          readPosted: readPostedAll,
          botPreferences: workspace.botPreferences,
          calendar: calendar.adapter,
          doors,
          slack: workspace.deps.slack,
          slackChannel: workspace.deps.app?.slackChannel || "",
          slackInstall: slackOAuthConfigured(env),
          slackConnection: (tenantId) => slackConnection(workspace, tenantId),
          googleGrants: workspace.googleGrants,
          tenantId: companyId,
          personId,
          tenantBind: workspace.tenantBind,
        });
        return;
    
      })();
      return true;
    }],
    ['console-space', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/console/space")) return false;
      await (async () => {
        await handleSpaceSwitch({ req, res, url, env, identity, send, redirect, readPosted });
        return;
    
      })();
      return true;
    }],
    ['console-tool-prefs', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/console/tool-prefs")) return false;
      await (async () => {
        await handleToolPref({ req, res, url, env, identity, send, readPosted });
        return;
    
      })();
      return true;
    }],
    ['connectorRoutes', async (req, res, url) => await handleConnectorRoutes({
      req,
      res,
      url,
      env,
      send,
      readJson,
      workspace,
      identity,
      sameOrigin: activitySameOrigin,
    })],
    ['route', async (req, res, url) => {
      const eventPath = /^\/console\/calendar\/events\/([^/]+)$/.exec(url.pathname);
      if (!(eventPath && (req.method === "GET" || req.method === "POST"))) return false;
      await (async () => {
        let eventId = eventPath[1];
        try { eventId = decodeURIComponent(eventId); } catch { eventId = eventPath[1]; }
        const gate = guardConsole(req, env);
        const resolved = await resolvePersonTenantId(workspace, req, "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const personId = String(gate.session?.userId || gate.session?.memberId || "").trim();
        const calendar = await calendarForRequest(workspace, { companyId: resolved.tenantId, personId, req });
        await handleCalendarEvent({
          req,
          res,
          env,
          send,
          readJson,
          calendar: calendar.adapter,
          connected: calendar.connected === true,
          sameOrigin: activitySameOrigin,
          id: eventId,
        });
        return;
    
      })();
      return true;
    }],
    ['route-2', async (req, res, url) => {
      const joinPath = /^\/console\/join\/([^/]+)$/.exec(url.pathname);
      if (!(joinPath && (req.method === "GET" || req.method === "POST"))) return false;
      await (async () => {
        let token = joinPath[1];
        try { token = decodeURIComponent(token); } catch { token = joinPath[1]; }
        await handleJoinLink({ req, res, url, env, identity, send, redirect, token });
        return;
    
      })();
      return true;
    }],
    ['console-invite', async (req, res, url) => {
      const invitePath = /^\/console\/invite\/([^/]+)$/.exec(url.pathname);
      if (!(invitePath && (req.method === "GET" || req.method === "POST"))) return false;
      await (async () => {
        let token = invitePath[1];
        try { token = decodeURIComponent(token); } catch { token = invitePath[1]; }
        await handleInvite({ req, res, url, env, identity, send, redirect, token });
        return;
    
      })();
      return true;
    }],
    ['console-ask', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/console/ask")) return false;
      await (async () => {
        redirect(res, "/console/chat");
        return;
    
      })();
      return true;
    }],
    ['console', async (req, res, url) => {
      if (!(req.method === "GET" && (url.pathname === "/console" || url.pathname.startsWith("/console/")))) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          const next = encodeURIComponent(safeConsoleNext(url.pathname + (url.search || "")));
          const reason = gate.reason === "expired" || gate.reason === "invalid" ? `&reason=${gate.reason}` : "";
          redirect(res, `/console/sign-in?next=${next}${reason}`);
          return;
        }
        const doors = doorReport(env, workspace.linearReady === true);
        const roomPath = /^\/console\/rooms\/([^/]+)$/.exec(url.pathname);
        const consolePage = url.pathname === "/console"
          || url.pathname === "/console/rooms"
          || url.pathname === "/console/history"
          || url.pathname === "/console/decisions"
          || url.pathname === "/console/chat"
          || url.pathname === "/console/people"
          || url.pathname === "/console/account"
          || url.pathname === "/console/status"
          || url.pathname === "/console/setup"
          || url.pathname === "/console/connectors"
          || url.pathname === "/console/files";
        let status = roomPath || consolePage ? 200 : 404;
        if (roomPath) {
          const current = workspace.session?.readReport ? workspace.session : await prepareWorkspace(workspace, "", false, 0);
          const readable = current.readReport?.ok === true;
          const id = decodeURIComponent(roomPath[1]);
          const known = (current.rooms || []).some((room) => room.id === id)
            || (current.decisions || []).some((decision) => decision.roomId === id)
            || (current.activity || []).some((row) => row.origin?.roomId === id);
          if (readable && !known) status = 404;
        }
        const oauth = identity && gate.session?.kind === "oauth";
        const spaces = oauth ? await loadSpaceView(identity, gate.session) : null;
        if (url.pathname === "/console") {
          const welcome = welcomePath(spaces);
          if (welcome) {
            redirect(res, welcome);
            return;
          }
        }
        const connectedDoors = oauth ? doorReport(env, workspace.linearReady === true) : null;
        const personId = String(gate.session?.userId || "").trim();
        const botTenant = oauth ? (spaces?.activeId || "") : "local";
        const hearingCompany = spaces?.activeId && spaces.activeKind !== "personal" ? spaces.activeId : "";
        const hearingSession = sessionFor(workspace, hearingCompany);
        const warmUser = oauth && gate.session?.accessToken && typeof identity.getUser === "function"
          ? identity.getUser(gate.session.accessToken).catch(() => null)
          : null;
        const knownStats = oauth && url.pathname === "/console" && spaces?.activeId && typeof identity.workspaceStats === "function"
          ? identity.workspaceStats(gate.session.accessToken, spaces.activeId).catch(() => null)
          : Promise.resolve(undefined);
        const [slackClaim, calendarOn, accountProfile, botView, hearing, stats, linearGrant] = await Promise.all([
          within(pageSlack(workspace, env, spaces, connectedDoors), PAGE_DOOR_WAIT_MS, {
            linked: connectedDoors?.slack === true,
            teamName: "",
          }),
          connectedDoors
            ? within(calendarGranted(workspace, spaces?.activeId || "", personId), PAGE_DOOR_WAIT_MS, false)
            : Promise.resolve(false),
          oauth ? loadAccountProfile(identity, gate.session, spaces) : Promise.resolve(null),
          readBot(workspace.botPreferences, botTenant),
          within(
            botTenant
              ? assignEffectiveHearing(workspace, hearingSession, botTenant)
              : effectiveHearing(workspace, botTenant, hearingSession),
            PAGE_DOOR_WAIT_MS,
            null,
          ),
          Promise.all([knownStats, warmUser]).then(([rows]) => rows),
          within(pageLinear(workspace, spaces?.activeId || ""), PAGE_DOOR_WAIT_MS, null),
        ]);
        if (connectedDoors && linearGrant) connectedDoors.linear = true;
        if (connectedDoors && workspace.tenantBind && env.SEDERUNT_TOOLS_FAKE !== "1") {
          connectedDoors.slack = slackClaim.linked === true;
        }
        if (connectedDoors) connectedDoors.calendar = calendarOn === true;
        const toolAsk = oauth ? await loadToolAsk(identity, gate.session, connectedDoors || {}, env) : null;
        const checklist = oauth && url.pathname === "/console"
          ? await loadChecklist(identity, gate.session, spaces, toolAsk, stats)
          : null;
        const bot = {
          ...botView,
          canEdit: canEditBot({
            signedIn: Boolean(gate.session),
            oauth,
            role: oauth ? (spaces?.activeRole || "") : "",
            authRequired: gate.required,
          }),
        };
        send(res, status, "text/html; charset=utf-8", renderConsolePage({
          meeting: doors.meeting,
          meetingSetup: !env.SEDERUNT_PUBLIC_ORIGIN
            ? "Set SEDERUNT_PUBLIC_ORIGIN to a public https address, then restart."
            : !env.RECALL_API_KEY
              ? "Set RECALL_API_KEY, then restart."
              : !env.RECALL_WEBHOOK_SECRET
                ? "Set RECALL_WEBHOOK_SECRET to the Recall workspace verification secret, then restart."
                : "Check that SEDERUNT_PUBLIC_ORIGIN is a public https address, then restart.",
          calendarConnected: (connectedDoors || doors).calendar === true,
          linearConnected: (connectedDoors || doors).linear === true,
          linearInstall: linearInstallReady(env, identity, workspace.linearInstallations),
          linearResult: url.searchParams.get("linear") || "",
          linearWorkspace: linearGrant?.workspaceName
            || ((connectedDoors || doors).linear === true ? String(env.LINEAR_WORKSPACE || "").trim() : ""),
          slackConnected: (connectedDoors || doors).slack === true,
          slackReady: slackOAuthConfigured(env) && spaces?.activeId
            ? Boolean(env.SLACK_SIGNING_SECRET && (connectedDoors || doors).slack === true)
            : Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_BOT_TOKEN),
          slackInstall: slackOAuthConfigured(env) && Boolean(identity),
          slackResult: url.searchParams.get("slack") || "",
          slackWorkspace: slackOAuthConfigured(env) && spaces?.activeId && (connectedDoors || doors).slack === true
            ? (slackClaim.teamName || "")
            : "",
          signedIn: Boolean(gate.session),
          signInOff: !consoleSecret(env) && !identity,
          accountMember: gate.session?.kind === "oauth" ? "" : (gate.session?.memberId || String(env.SEDERUNT_MEMBER || "").trim()),
          accountName: accountProfile?.name || gate.session?.name?.trim() || String(env.SEDERUNT_MEMBER || "").trim(),
          accountLine: spaces?.oauth
            ? (roleLabel(spaces.activeRole) || "Owner")
            : (gate.session ? "Owner" : "Sign-in is not set up"),
          accountExpiry: gate.session?.exp || 0,
          calendarTimeZone: calendarTimeZone(env),
          askLimit: askLimit(env),
          spaces,
          checklist,
          accountProfile,
          toolAsk,
          bot,
          hearing,
          section: consoleSection(url.pathname),
        }));
        return;
    
      })();
      return true;
    }],
    ['meeting', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/meeting")) return false;
      await (async () => {
        const spike = url.searchParams.get("spike") === "1" && spikeEnabled(env);
        send(res, 200, "text/html; charset=utf-8", renderCameraPage(url.searchParams.get("name") || "", { spike }));
        return;
    
      })();
      return true;
    }],
    ['api-meeting-agent-prefix', async (req, res, url) => {
      if (!(url.pathname.startsWith("/api/meeting/agent/"))) return false;
      let answered = true;
      await (async () => {
        if (url.pathname === "/api/meeting/agent/log") kickMemoryRetries(workspace);
        const handled = await handleMeetingAgent({
          req,
          res,
          url,
          env,
          workspace,
          sessionFor: (tenantId) => sessionFor(workspace, tenantId),
          depsFor: (tenantId) => ({
            ...depsFor(workspace, tenantId),
            // With sign-in on, in-call calendar writes use only the speaker's own
            // Google grant in this tenant, never the process-wide calendar.
            ...(identityConfigured(env) ? {
              calendarForPerson: async (personId) => {
                const opened = await calendarForRequest(workspace, { companyId: tenantId, personId });
                return opened.personGrant ? opened.adapter : null;
              },
            } : {}),
          }),
          headerValue,
          readJson,
          send,
          now: workspace.now,
        });
        if (handled) return;
    
        answered = false;
      })();
      return answered;
    }],
    ['api-meeting-spike-tts', async (req, res, url) => {
      if (!(url.pathname === "/api/meeting/spike/tts" || url.pathname === "/api/meeting/spike/transcript")) return false;
      await (async () => {
        if (!spikeEnabled(env)) {
          send(res, 404, "text/plain; charset=utf-8", "");
          return;
        }
        const ear = headerValue(req.headers["x-meeting-ear"]);
        if (req.method === "POST" && url.pathname === "/api/meeting/spike/transcript") {
          if (!validMeetingEar(ear)) {
            send(res, 401, "text/plain; charset=utf-8", "");
            return;
          }
          let message = null;
          try {
            const raw = await readBody(req);
            if (raw.length > 60000) {
              send(res, 413, "text/plain; charset=utf-8", "");
              return;
            }
            message = raw.trim() ? JSON.parse(raw) : {};
          } catch {
            send(res, 400, "text/plain; charset=utf-8", "");
            return;
          }
          const shape = transcriptEventShape(message, Date.now());
          pushSpikeShape(workspace, ear, shape);
          await saveSpikeShape(env, workspace.fetchImpl, ear, shape);
          send(res, 204, "text/plain; charset=utf-8", "");
          return;
        }
        if (!spikeAuthorized(env, headerValue(req.headers["x-sederunt-spike"]))) {
          send(res, 404, "text/plain; charset=utf-8", "");
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/meeting/spike/transcript") {
          if (!validMeetingEar(ear)) {
            send(res, 401, "text/plain; charset=utf-8", "");
            return;
          }
          const local = readSpikeShapes(workspace, ear);
          const remote = local.length ? [] : await loadSpikeShapes(env, workspace.fetchImpl, ear);
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ events: local.length ? local : remote }));
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/meeting/spike/tts") {
          const { key } = openRouterConfig(env);
          const report = await measureSpeechProbe({ fetchImpl: workspace.fetchImpl, key });
          const body = JSON.stringify(report);
          if (key && body.includes(key)) {
            send(res, 500, "application/json; charset=utf-8", JSON.stringify({ error: "redacted" }));
            return;
          }
          send(res, 200, "application/json; charset=utf-8", body);
          return;
        }
        send(res, 404, "text/plain; charset=utf-8", "");
        return;
    
      })();
      return true;
    }],
    ['api-hearing', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/hearing")) return false;
      await (async () => {
        const authz = await authorizeBotWrite({ req, env, identity });
        if (!authz.ok) {
          const error = authz.status === 401
            ? "Sign in again."
            : "Only an owner or admin can change the meeting guest.";
          send(res, authz.status, "application/json; charset=utf-8", JSON.stringify({ ok: false, error }));
          return;
        }
        let body = {};
        try {
          body = await readJson(req);
        } catch {
          send(res, 400, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "The guest was not saved." }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, typeof body.company === "string" ? body.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const tenantId = authz.tenantId;
        if (!tenantId) {
          send(res, 403, "application/json; charset=utf-8", JSON.stringify({
            ok: false,
            error: "Only an owner or admin can change the meeting guest.",
          }));
          return;
        }
        const triggers = typeof body.triggers === "string"
          ? body.triggers.split(/\n+/)
          : body.triggers;
        let hearing;
        try {
          hearing = await saveMeetingGuest(workspace.botPreferences, tenantId, {
            name: body.name,
            triggers,
          });
        } catch {
          send(res, 503, "application/json; charset=utf-8", JSON.stringify({ ok: false }));
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId, false, 0, tenantId);
        const savedAt = new Date().toISOString();
        current.hearing = { ...hearing, savedAt, tenantId };
        try {
          const remembered = await saveHearing(current, depsFor(workspace, companyId), hearing);
          current.hearing = { ...remembered, tenantId };
        } catch {
          current.hearing = { ...hearing, savedAt, tenantId };
        }
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ hearing }));
        return;
    
      })();
      return true;
    }],
    ['room', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/room")) return false;
      await (async () => {
        res.writeHead(302, { location: "/console", "cache-control": "no-store" });
        res.end();
        return;
    
      })();
      return true;
    }],
    ['api-console-invites', async (req, res, url) => {
      if (!((req.method === "GET" || req.method === "POST") && url.pathname === "/api/console/invites")) return false;
      await (async () => {
        await handleConsoleInvites({ req, res, env, identity, send, readJson });
        return;
    
      })();
      return true;
    }],
    ['api-console', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/api/console")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in again.", reason: gate.reason || "missing" }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, url.searchParams.get("company") || "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const hearingTenant = await hearingTenantId(workspace, req);
        const personId = String(gate.session?.userId || "").trim();
        const meetingsPromise = within(
          calendarMeetings(workspace, { companyId, personId, req }),
          BOARD_SIDE_WAIT_MS,
          [],
        );
        const current = await prepareWorkspace(workspace, companyId, false, BOARD_INDEX_WAIT_MS, hearingTenant);
        // A ready index can wait briefly for the calendar. A cold index must not.
        const meetings = current.readReport ? await meetingsPromise : await within(meetingsPromise, 150, []);
        const workspaceKind = url.searchParams.get("workspace") || "";
        const memberId = consoleBoardMember(gate.session, env, workspaceKind, url.searchParams.get("member") || "");
        const stamped = workspace.botPreferences?.durable === true && current.hearing?.tenantId === hearingTenant
          ? current.hearing
          : null;
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
          workspace,
          current,
          memberId,
          workspaceKind,
          { req, companyId, hearing: stamped, hearingTenant, meetings, meetingsKnown: true },
        )));
        return;
    
      })();
      return true;
    }],
    ['api-console-read', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/console/read")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in again.", reason: gate.reason || "missing" }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, url.searchParams.get("company") || "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const hearingTenant = await hearingTenantId(workspace, req);
        const current = await prepareWorkspace(workspace, companyId, true, 0, hearingTenant);
        const workspaceKind = url.searchParams.get("workspace") || "";
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
          workspace,
          current,
          consoleBoardMember(gate.session, env, workspaceKind, ""),
          workspaceKind,
          { req, companyId },
        )));
        return;
    
      })();
      return true;
    }],
    ['api-ready', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/api/ready")) return false;
      await (async () => {
        const report = doorReport(env, workspace.linearReady === true);
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(report));
        return;
    
      })();
      return true;
    }],
    ['api-room', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname === "/api/room")) return false;
      await (async () => {
        const requested = url.searchParams.get("room") || "desk";
        const roomId = /^[A-Za-z0-9_-]{1,64}$/.test(requested) ? requested : "desk";
        const resolved = await resolveCompanyId(workspace, req, url.searchParams.get("company") || "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const current = await prepareWorkspace(workspace, resolved.companyId);
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(roomLedger(current, roomId, await consolePrincipal(workspace, req, resolved.companyId))));
        return;
    
      })();
      return true;
    }],
    ['api-join', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/join")) return false;
      await (async () => {
        const body = await readJson(req);
        const meetingUrl = typeof body.url === "string" ? body.url.trim() : "";
        let join = "not-configured";
        if (!doorReport(env, workspace.linearReady === true).walk) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ join }));
          return;
        }
        const resolved = await resolveCompanyId(workspace, req, typeof body.company === "string" ? body.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const joinCompanyId = resolved.companyId;
        // OAuth with remote bind store: refuse empty-tenant sends (unbound callbacks).
        if (identityConfigured(env) && !joinCompanyId) {
          send(res, 409, "application/json; charset=utf-8", JSON.stringify({ join: "failed", reason: "no-workspace" }));
          return;
        }
        if (identityConfigured(env) && requiresDurableBind(env) && !workspace.tenantBind) {
          send(res, 503, "application/json; charset=utf-8", JSON.stringify({ join: "failed", reason: "bind-unavailable" }));
          return;
        }
        if (!workspace.joinInFlight) workspace.joinInFlight = new Map();
        const pending = workspace.joinInFlight;
        const flightKey = `${joinCompanyId}\0${meetingUrl}`;
        const prior = pending.get(flightKey);
        if (prior) {
          const reused = await prior;
          send(res, 200, "application/json; charset=utf-8", JSON.stringify(reused));
          return;
        }
        const work = (async () => {
          let botId = "";
          let startedAt = "";
          let sentBy = "";
          let status = "not-configured";
          if (deps.meeting?.join) {
            try {
              const hearingTenant = await hearingTenantId(workspace, req);
              const ready = await prepareWorkspace(workspace, joinCompanyId, false, 0, hearingTenant);
              const hearing = await effectiveHearing(workspace, hearingTenant, ready);
              const guest = hearing.name;
              const bot = await currentBot(workspace, req);
              const sent = await deps.meeting.join({ url: meetingUrl, name: guest, botName: bot.name });
              botId = typeof sent?.id === "string" ? sent.id : "";
              startedAt = typeof sent?.startedAt === "string" ? sent.startedAt : (typeof sent?.started_at === "string" ? sent.started_at : "");
              if (botId && typeof sent?.ear === "string") {
                const joiner = guardConsole(req, env).session;
                sentBy = joiner?.kind === "oauth" ? String(joiner.userId || joiner.memberId || "").trim() : "";
                await bindMeetingEar(workspace, sent.ear, botId, env, workspace.fetchImpl).catch(() => {});
                await bindAgentSeat(workspace, {
                  ear: sent.ear,
                  botId,
                  tenantId: joinCompanyId || "",
                  roomId: botId,
                  botName: guest,
                  userId: sentBy,
                }, env, workspace.fetchImpl).catch(() => {});
              }
              if (!botId) {
                status = "failed";
              } else if (joinCompanyId && workspace.tenantBind) {
                const bound = await workspace.tenantBind.bind("bot", botId, joinCompanyId, {
                  requireRemote: requiresDurableBind(env),
                });
                if (!bound?.ok || (requiresDurableBind(env) && !bound.durable)) {
                  status = "failed";
                  let left = false;
                  if (typeof deps.meeting?.leave === "function") {
                    try {
                      const cleaned = await deps.meeting.leave(botId);
                      left = cleaned?.ok === true;
                    } catch {
                      left = false;
                    }
                  }
                  return {
                    join: status,
                    reason: bound?.conflict ? "bind-conflict" : "bind-failed",
                    botId,
                    left,
                  };
                }
                status = "sent";
              } else {
                status = "sent";
              }
              if (status === "sent" && !startedAt) startedAt = new Date().toISOString();
            } catch (error) {
              const message = error instanceof Error ? error.message : "";
              status = message === "Meeting join is not configured" ? "not-configured" : "failed";
            }
          }
          if (status === "sent" && workspace.companyLoaded) {
            const platform = meetingPlatform(meetingUrl);
            if (platform) {
              try {
                const hearingTenant = await hearingTenantId(workspace, req);
                const current = await prepareWorkspace(workspace, joinCompanyId || "", false, 0, hearingTenant);
                await handleUtterance({
                  session: current,
                  openedRoom: {
                    platform,
                    id: botId,
                    ...(startedAt ? { startedAt } : {}),
                    ...(sentBy ? { memberIds: [sentBy] } : {}),
                  },
                }, depsFor(workspace, joinCompanyId || ""));
              } catch {
                // The door already sent the bot. A missed record does not change that word.
              }
            }
          }
          return { join: status };
        })();
        pending.set(flightKey, work);
        try {
          const result = await work;
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({
            join: result.join,
            reason: result.reason || undefined,
            left: result.left === true ? true : undefined,
          }));
        } finally {
          setTimeout(() => {
            if (pending.get(flightKey) === work) pending.delete(flightKey);
          }, 15_000);
        }
        return;
    
      })();
      return true;
    }],
    ['api-recall', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/recall")) return false;
      await (async () => {
        const raw = await readBody(req);
        const accepted = verifyRecallRequest({
          secret: env.RECALL_WEBHOOK_SECRET || "",
          headers: req.headers,
          payload: raw,
        });
        if (!accepted) {
          send(res, 401, "text/plain; charset=utf-8", "rejected");
          return;
        }
        let recallWork = null;
        try {
          const payload = JSON.parse(raw || "{}");
          const person = recallParticipantChange(payload);
          const delivery = recallTranscriptDelivery(payload);
          const progress = meetingCallUpdate(payload);
          const ended = meetingEnded(payload);
          let transcriptCompany = "";
          let ownedTranscript = false;
          let eventKey = "";
          if (delivery) {
            const botId = typeof delivery.room?.id === "string" ? delivery.room.id : "";
            transcriptCompany = await resolveBoundTenant(workspace, { botId });
            // Race: join bound after Recall fires — ask provider to retry; never ingest unbound.
            if (!transcriptCompany && identityConfigured(env) && requiresDurableBind(env)) {
              send(res, 503, "text/plain; charset=utf-8", "bind-pending");
              return;
            }
            const participant = payload?.data?.data?.participant || payload?.data?.participant;
            // Display names and unverified mailbox claims never establish attendance identity.
            if (!delivery.partial && participant?.email_verified === true && typeof participant.email === "string" && delivery.memberId) {
              try {
                await workspace.participantBindings.record({ tenantId: transcriptCompany, roomId: delivery.room.id, memberId: delivery.memberId, email: participant.email });
              } catch (error) {
                // A changed mailbox is permanent. An outage must be retried, so the words are not acknowledged yet.
                if (error?.code !== "participant-identity") {
                  send(res, 503, "text/plain; charset=utf-8", "participant-pending");
                  return;
                }
              }
            }
            eventKey = meetingEventKey(botId, delivery, headerValue(req.headers["webhook-id"]));
            ownedTranscript = claimMeetingEventLocal(sessionFor(workspace, transcriptCompany), eventKey);
          }
          let progressCompany = "";
          const progressOpen = Boolean(progress?.roomId && progress.call !== "done" && progress.call !== "call_ended");
          if (progressOpen) {
            progressCompany = await resolveBoundTenant(workspace, { botId: progress.roomId });
            if (!progressCompany && identityConfigured(env) && requiresDurableBind(env)) {
              send(res, 503, "text/plain; charset=utf-8", "bind-pending");
              return;
            }
          }
          let endedCompany = "";
          if (ended?.roomId) {
            endedCompany = await resolveBoundTenant(workspace, { botId: ended.roomId });
            if (!endedCompany && identityConfigured(env) && requiresDurableBind(env)) {
              send(res, 503, "text/plain; charset=utf-8", "bind-pending");
              return;
            }
            if (endedCompany && !workspace.followups) { const error = new Error("Finalization unavailable"); error.code = "followup-persist"; throw error; }
            if (endedCompany && workspace.followups) await persistMeetingFollowups(workspace, endedCompany, ended.roomId);
          }
          // Signature and tenant checks are done. The index and the saved line
          // follow the ack. waitUntil keeps that work alive on Vercel.
          // A throw before the save releases the claim so a retry can still record.
          // Facts a Walrus 429 queued earlier are written while the meeting runs.
          kickMemoryRetries(workspace);
          recallWork = (async () => {
            const tasks = [];
            if (person) {
              tasks.push(rememberMeetingPerson(workspace, person.botId, person, env, workspace.fetchImpl).catch(() => {}));
            }
            if (delivery && ownedTranscript) {
              tasks.push((async () => {
                const botId = typeof delivery.room?.id === "string" ? delivery.room.id : "";
                const companyId = transcriptCompany;
                let current = sessionFor(workspace, companyId);
                const claimedSession = current;
                let won = false;
                let saved = false;
                try {
                  won = eventKey
                    ? await claimMeetingEvent(env, eventKey, workspace.fetchImpl)
                    : true;
                  if (!won) return;
                  const participant = payload?.data?.data?.participant || payload?.data?.participant;
                  const speakerName = typeof participant?.name === "string" ? participant.name : "";
                  const heardDelivery = speakerName ? { ...delivery, speakerName } : delivery;
                  if (!delivery.partial && botId && delivery.memberId) {
                    await rememberAgentMember(workspace, botId, {
                      participantId: delivery.memberId,
                      name: speakerName,
                      memberId: delivery.memberId,
                    }, env, workspace.fetchImpl).catch(() => {});
                    if (speakerName) {
                      await rememberAgentSpeaker(workspace, botId, delivery.memberId, speakerName, env, workspace.fetchImpl).catch(() => {});
                    }
                  }
                  if (!delivery.partial && botId) {
                    rememberMeetingLine(current, botId, { speaker: speakerName || "Someone", text: delivery.text });
                  }
                  if (delivery.partial) {
                    saved = true;
                    return;
                  }
                  if (participant?.is_host === true && botId && delivery.memberId) {
                    // The signed webhook names the host; an in-call Calendar create may use it.
                    await rememberMeetingHost(workspace, botId, delivery.memberId, env, workspace.fetchImpl).catch(() => {});
                  }
                  // Recall can split "Heads up, <fact>" into two finals. The cue alone is not
                  // stored; the speaker's next line is kept as the heads-up fact.
                  const bareCue = Boolean(botId && delivery.memberId) && isBareKeepCue(delivery.text);
                  let lineDelivery = heardDelivery;
                  if (bareCue) {
                    await rememberKeepCue(workspace, botId, "line", delivery.memberId, env, workspace.fetchImpl).catch(() => {});
                  } else if (botId && delivery.memberId
                    && await takeKeepCue(workspace, botId, "line", delivery.memberId, env, workspace.fetchImpl).catch(() => false)
                    && keptAfterCue(delivery.text)) {
                    lineDelivery = { ...heardDelivery, text: `Heads up, ${delivery.text}` };
                  }
                  if (!bareCue) {
                    if (!current.readReport?.ok) current = await prepareWorkspace(workspace, companyId);
                    await handleUtterance({ ...lineDelivery, session: current }, depsFor(workspace, companyId));
                  }
                  saved = true;
                  if (delivery.room?.id) {
                    await noteMeetingCall(current, depsFor(workspace, companyId), delivery.room.id, "in_call_recording").catch(() => {});
                    keepRoomTranscript(current, delivery.room.id, { speaker: speakerName || "Someone", text: delivery.text });
                  }
                  if (companyId && workspace.followups && workspace.followupStore) {
                    const outcomes = await workspace.followupStore.list(companyId, { kind: "outcome", meetingId: delivery.room.id, limit: 1 });
                    if (outcomes.length) await persistMeetingFollowups(workspace, companyId, delivery.room.id);
                  }
                } catch (error) {
                  if (won && !saved) {
                    releaseMeetingEventLocal(claimedSession, eventKey);
                    await releaseMeetingEvent(env, eventKey, workspace.fetchImpl);
                  }
                  throw error;
                }
              })());
            }
            if (progressOpen) {
              tasks.push((async () => {
                const progressSession = await prepareWorkspace(workspace, progressCompany);
                await noteMeetingCall(progressSession, depsFor(workspace, progressCompany), progress.roomId, progress.call).catch(() => {});
              })());
            }
            if (ended?.roomId) {
              tasks.push((async () => {
                await finishAgentSeat(workspace, ended.roomId, env, workspace.fetchImpl).catch(() => {});
                const current = await prepareWorkspace(workspace, endedCompany);
                const endedCall = progress?.roomId === ended.roomId && progress.call ? progress.call : "done";
                await noteMeetingCall(current, depsFor(workspace, endedCompany), ended.roomId, endedCall).catch(() => {});
                try {
                  await endMeeting(current, depsFor(workspace, endedCompany), ended.roomId);
                } catch {
                  // The finalization job is already saved. Memory minutes can be retried.
                }
              })());
            }
            await Promise.all(tasks);
          })();
        } catch (error) {
          if (error?.code === "followup-persist") {
            send(res, 503, "text/plain; charset=utf-8", "finalization-pending");
            return;
          }
          // A signed callback is still accepted when the transcript has no words.
        }
        if (env.VERCEL) {
          let held = false;
          if (recallWork) {
            try {
              const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
              if (typeof ctx?.waitUntil === "function") {
                const { waitUntil } = await import("@vercel/functions");
                if (typeof waitUntil === "function") {
                  waitUntil(recallWork);
                  held = true;
                }
              }
            } catch {
              // Outside a Vercel request the import cannot hold the invocation.
            }
          }
          send(res, 204, "text/plain; charset=utf-8", "");
          if (recallWork && !held) recallWork.catch(() => {});
          scheduleRecovery();
          return;
        }
        try {
          if (recallWork) await recallWork;
        } catch (error) {
          if (error?.code === "followup-persist") {
            send(res, 503, "text/plain; charset=utf-8", "finalization-pending");
            return;
          }
        }
        send(res, 204, "text/plain; charset=utf-8", "");
        scheduleRecovery();
        return;
    
      })();
      return true;
    }],
    ['api-slack-interactivity', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/slack/interactivity")) return false;
      await (async () => {
        const raw = await readBody(req);
        if (!env.SLACK_SIGNING_SECRET) {
          send(res, 503, "text/plain; charset=utf-8", "Slack is not set up.");
          return;
        }
        const accepted = verifySlackRequest({
          secret: env.SLACK_SIGNING_SECRET,
          timestamp: headerValue(req.headers["x-slack-request-timestamp"]),
          signature: headerValue(req.headers["x-slack-signature"]),
          payload: raw,
        });
        if (!accepted) {
          send(res, 401, "text/plain; charset=utf-8", "rejected");
          return;
        }
        let payload;
        try {
          payload = JSON.parse(new URLSearchParams(raw).get("payload") || "");
        } catch {
          send(res, 400, "text/plain; charset=utf-8", "Invalid request.");
          return;
        }
        const teamId = String(payload?.team?.id || payload?.team_id || "");
        const slackRoute = await slackEventTenant(workspace, { teamId });
        if (!workspace.followups || !workspace.followupStore || !slackRoute.tenantId || (slackRoute.teamId && slackRoute.teamId !== teamId)) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "forbidden_or_stale" }));
          return;
        }
        const hinted = parseFollowupValue(payload?.actions?.[0]?.value || payload?.view?.private_metadata || "");
        const stored = hinted ? await workspace.followupStore.get(slackRoute.tenantId, hinted.id) : null;
        const fields = followupInteractionFields(payload, stored?.data);
        if (!fields || fields.teamId !== teamId) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "invalid" }));
          return;
        }
        const result = await workspace.followups.interact({ tenantId: slackRoute.tenantId, ...fields, deferExecution: fields.verb === "approve" });
        if (result?.modal) {
          try {
            await Promise.race([
              tenantSlackClient(workspace, slackRoute.tenantId).openModal({ triggerId: payload.trigger_id, view: result.modal }),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Modal timed out")), 2000)),
            ]);
          } catch {
            await workspace.followups.interact({ tenantId: slackRoute.tenantId, ...fields, verb: "cancel" }).catch(() => {});
            send(res, 503, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "modal-failed" }));
            return;
          }
        }
        if (payload.type === "view_submission" && result?.error === "invalid_edit") {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ response_action: "errors", errors: { change: "Enter a valid change before saving." } }));
          return;
        }
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          ok: result?.ok === true,
          error: result?.error || "",
          ran: result?.ran === true,
          status: result?.status || "",
        }));
        if (result?.ok) scheduleRecovery();
        return;
    
      })();
      return true;
    }],
    ['api-typed', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/typed")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) { sendCompanyDenied(res, send, { unauthorized: true }); return; }
        const delivery = await readRequest(req);
        if (rejectTypedFollowup(delivery, res)) return;
        const configured = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
        const caller = guardConsole(req, env).session;
        if (caller?.kind === "oauth") {
          const own = String(caller.userId || caller.memberId || "");
          if ((delivery.memberId && delivery.memberId !== own) || delivery.room?.id || delivery.participants?.length || delivery.intent === "delete") {
            send(res, 403, "application/json; charset=utf-8", JSON.stringify({ error: "Use the meeting or channel for a room request." }));
            return;
          }
          delivery.memberId = own;
        } else if (caller) {
          if ((delivery.memberId && delivery.memberId !== caller.memberId) || delivery.room?.id || delivery.participants?.length) { sendCompanyDenied(res, send, {}); return; }
          delivery.memberId = caller.memberId;
        } else if (!delivery.memberId && configured) delivery.memberId = configured;
        const resolved = await resolveCompanyId(workspace, req, typeof delivery.company === "string" ? delivery.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const hearingTenant = await hearingTenantId(workspace, req);
        const current = await prepareWorkspace(workspace, companyId, false, 0, hearingTenant);
        const utterance = { ...delivery, session: current };
        if (caller?.kind === "oauth") utterance.principal = await consolePrincipal(workspace, req, companyId);
        const result = await handleUtterance(utterance, depsFor(workspace, companyId));
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
        return;
    
      })();
      return true;
    }],
    ['api-proof', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/proof")) return false;
      await (async () => {
        const body = await readJson(req);
        const id = typeof body.id === "string" ? body.id : "";
        const resolved = await resolveCompanyId(workspace, req, typeof body.company === "string" ? body.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId);
        const memberId = await consolePrincipal(workspace, req, companyId);
        const visible = companyBoard(current, memberId);
        const row = (visible.decisions ?? []).find((item) => item.id === id) || null;
        if (!row) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({
            id,
            status: "unknown",
            reason: "That decision is not in this workspace.",
            chain: chainReport(workspace.deps?.tatum),
          }));
          return;
        }
        // Verify again is one decision the person asked for, so it may take the
        // few throttled gateway calls a first locate needs.
        // Verify again asks for a fresh read; a pending panel's follow-up
        // joins the read already running.
        await readProofs(current, { decisions: [row] }, workspace.deps?.tatum, { timeoutMs: 6000, fresh: body.fresh === true });
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          id,
          status: row.proofStatus || "unknown",
          reason: row.proofReason || "The chain proof is incomplete.",
          proof: row.proof || null,
          checkpoint: row.checkpoint ?? null,
          chain: chainReport(workspace.deps?.tatum),
        }));
        return;
    
      })();
      return true;
    }],
    ['api-ask', async (req, res, url) => {
      if (!(url.pathname === "/api/ask" || /^\/api\/ask\/[A-Za-z0-9_]+\/stream$/.test(url.pathname))) return false;
      await (async () => {
        await handleAsk(workspace, req, res, url);
        return;
    
      })();
      return true;
    }],
    ['api-chat', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/chat")) return false;
      await (async () => {
        const body = await readJson(req);
        const reply = await chatReply(workspace, body, "", req);
        if (reply?.denied) {
          sendCompanyDenied(res, send, reply);
          return;
        }
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(reply));
        return;
    
      })();
      return true;
    }],
    ['api-slack', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/slack")) return false;
      await (async () => {
        const raw = await readBody(req);
        if (!env.SLACK_SIGNING_SECRET) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: "not-set-up" }));
          return;
        }
        const accepted = verifySlackRequest({
          secret: env.SLACK_SIGNING_SECRET,
          timestamp: headerValue(req.headers["x-slack-request-timestamp"]),
          signature: headerValue(req.headers["x-slack-signature"]),
          payload: raw,
        });
        if (!accepted) {
          send(res, 401, "text/plain; charset=utf-8", "rejected");
          return;
        }
        const parsed = JSON.parse(raw || "{}");
        if (parsed.type === "url_verification" && typeof parsed.challenge === "string") {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ challenge: parsed.challenge }));
          return;
        }
        const event = parsed.event && typeof parsed.event === "object" ? parsed.event : parsed;
        const slackTeam = typeof parsed.team_id === "string" && parsed.team_id.trim()
          ? parsed.team_id.trim()
          : (typeof event.team === "string" ? event.team.trim() : "");
        const slackChannel = typeof event.channel === "string" ? event.channel.trim() : "";
        // Only matching bot/app lifecycle events can remove the observed generation.
        if (slackOAuthConfigured(env) && slackTeam && (event.type === "app_uninstalled" || event.type === "tokens_revoked")) {
          let removed = 0;
          try {
            const install = await workspace.slackInstallations.byTeam(slackTeam);
            const appId = String(parsed.api_app_id || "");
            const eventTime = Number(parsed.event_time) * 1000;
            const botRevoked = event.type === "tokens_revoked" && Array.isArray(event.tokens?.bot)
              && event.tokens.bot.includes(install?.botUserId);
            if (install && appId && install.appId === appId && Number.isFinite(eventTime) && eventTime > 0
              && (event.type === "app_uninstalled" || botRevoked)) {
              removed = await workspace.slackInstallations.revoke({ teamId: slackTeam, appId,
                generation: install.generation, eventTime, botUserId: botRevoked ? install.botUserId : null });
            }
          } catch {
            send(res, 503, "application/json; charset=utf-8", JSON.stringify({ slack: "retry" }));
            return;
          }
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: removed ? "uninstalled" : "ignored" }));
          return;
        }
        const legacyCompanyId = await resolveBoundTenant(workspace, { teamId: slackTeam, channelId: slackChannel });
        // The team's own installation picks the tenant and the token; a team with
        // no installation or claim is not ingested anywhere when OAuth is on.
        const slackRoute = await slackEventTenant(workspace, { teamId: slackTeam, legacyTenantId: legacyCompanyId });
        if (slackOAuthConfigured(env) && !slackRoute.tenantId) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: "not-linked" }));
          return;
        }
        const companyId = slackRoute.tenantId || legacyCompanyId;
        const slackToken = slackRoute.token || "";
        const deps = { ...workspace.deps, slack: { ...workspace.deps.slack,
          fetch: installationFetch(workspace, companyId, slackRoute, workspace.deps.slack?.fetch || globalThis.fetch) } };
        const slackEnv = {
          ...env,
          SLACK_BOT_TOKEN: slackToken,
          SLACK_BOT_USER_ID: slackRoute.botUserId || (slackRoute.source === "install" ? "" : env.SLACK_BOT_USER_ID),
        };
        // The bot was added to a channel: bind it to this tenant's Files space now,
        // so the first file posted there reaches Walrus. Other joins are ignored.
        if (event.type === "member_joined_channel") {
          const joined = typeof event.user === "string" ? event.user.trim().toUpperCase() : "";
          const isBot = Boolean(joined) && slackBotUserIds(parsed, slackEnv).some((id) => id.toUpperCase() === joined);
          let bound = null;
          if (isBot && companyId) {
            try {
              bound = await bindSlackChannelOnce(workspace, filesRuntime, {
                tenantId: companyId, teamId: slackTeam, channel: slackChannel, token: slackToken, fetchImpl: deps.slack?.fetch,
              });
            } catch {
              bound = null;
            }
          }
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: bound ? "bound" : "ignored" }));
          return;
        }
        const subtype = typeof event.subtype === "string" ? event.subtype : "";
        const changedFiles = subtype === "message_changed" && slackEventHasFiles(event);
        const noise = subtype
          && subtype !== "file_share"
          && subtype !== "message_deleted"
          && subtype !== "huddle"
          && !changedFiles;
        if (event.bot_id || subtype === "bot_message" || (noise && event.type !== "huddle")) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: "ignored" }));
          return;
        }
        // Slack retries an event_callback that is still open after three seconds.
        // Memory and Console can take longer than that. Ack first on the live
        // token path, then finish the work. Tests inject deps.slack and read the body.
        let acked = false;
        const replyHttp = (status, contentType, body) => {
          if (acked) return;
          acked = true;
          send(res, status, contentType, body);
        };
        // defaultDeps always builds a Slack client, so do not key off deps.slack.
        // Tests pass options.deps and read the response body; production acks first.
        // Only early-ack asks (DMs / @mentions). Channel keeps must finish the Kept
        // post before the response ends - waitUntil alone was freezing mid-keep.
        const canLiveAck = parsed.type === "event_callback" && Boolean(slackToken) && options.deps == null;
        const peek = slackDelivery(event, { botUserIds: slackBotUserIds(parsed, slackEnv) });
        const liveAck = canLiveAck && peek.ask === true;
        const slackWork = (async () => {
        const current = await prepareWorkspace(workspace, companyId);
        const botName = (await currentBot(workspace, req)).name;
        try {
          const delivery = slackDelivery(event, { botUserIds: slackBotUserIds(parsed, slackEnv) });
          if (filesRuntime && delivery.intent === "delete") {
            await hideDeletedSlackMessages(filesRuntime, delivery.forgetIds, { externalWorkspaceId: slackScopeId(parsed.team_id), externalChannelId: slackScopeId(delivery.room?.id) });
          }
          // A DM, or a channel @mention, recalls. Other channel lines are stored.
          const question = delivery.ask === true;
          const huddle = delivery.room?.kind === "huddle" || delivery.room?.source === "slack-huddle";
          const hasFiles = (Array.isArray(delivery.files) && delivery.files.length > 0) || Boolean(delivery.file);
          // The Slack person as a verified member of this tenant, when their Slack email says so.
          const asker = (question || hasFiles) && delivery.intent !== "delete" && !huddle
            ? await slackAskerLink(workspace, filesRuntime, { tenantId: companyId, teamId: slackTeam, slackUserId: delivery.memberId, token: slackToken, fetchImpl: deps.slack?.fetch })
            : null;
          // The Meet-room view answers only in a one-to-one DM: a channel or group DM
          // reply is read by everyone there, so it keeps the Slack-id-only view.
          const principal = question && !slackOneToOne(event) ? null : slackReadPrincipal(asker);
          let incoming = [];
          let storedFiles = [];
          let downloadFailed = false;
          let ingestedFiles = 0;
          if (!question && delivery.intent !== "delete" && !huddle) {
            const channel = delivery.room?.askChannel || "";
            const people = await slackPeople(slackEnv, deps, channel, options.deps?.slack);
            const memberIds = people;
            if (!memberIds.length) {
              if (slackToken && channel) {
                await postSlackReply({
                  token: slackToken,
                  fetchImpl: deps.slack?.fetch,
                  channel,
                  text: "I could not see who is in this channel, so nothing was kept.",
                  username: botName,
                });
              }
              replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
                body: "The channel has not sent who is there.",
                decisions: current.decisions.filter((item) => !item.deleted).length,
              }));
              return;
            }
            if (!memberIds.includes(delivery.memberId)) {
              replyHttp(200, "application/json; charset=utf-8", JSON.stringify({ body: "not-invited" }));
              return;
            }
            // First keep in a channel the bot is in binds it (member_joined_channel may not be subscribed).
            if (filesRuntime && hasFiles) {
              try {
                await withinMs(bindSlackChannelOnce(workspace, filesRuntime, {
                  tenantId: companyId, teamId: slackTeam, channel, token: slackToken, fetchImpl: deps.slack?.fetch,
                }), 4_000);
              } catch {
                // Unbound: the file is still kept by name and resent from Slack.
              }
            }
            delivery.participants = memberIds;
            delivery.room.memberIds = memberIds;
            incoming = Array.isArray(delivery.files) && delivery.files.length
              ? delivery.files
              : (delivery.file ? [delivery.file] : []);
            const downloaded = await Promise.all(incoming.map(async (item) => {
              try {
                return await withinMs(slackBytes(slackEnv, deps, item), 12_000);
              } catch {
                return null;
              }
            }));
            for (let i = 0; i < incoming.length; i += 1) {
              const item = incoming[i];
              const loaded = downloaded[i];
              if (!loaded?.bytes) continue;
              const slackFileId = loaded.id || item?.id || "";
              storedFiles.push({ ...loaded, id: slackFileId });
              if (filesRuntime) {
                try {
                  const ingested = await withinMs(ingestSlackFile(filesRuntime, {
                    externalWorkspaceId: slackScopeId(parsed.team_id) || slackTeam,
                    externalChannelId: channel,
                    slackUserId: delivery.memberId,
                    slackName: delivery.memberId,
                    slackFileId,
                    name: loaded.name,
                    mimeType: loaded.mimeType || "application/octet-stream",
                    bytes: loaded.bytes,
                    externalMessageId: delivery.deliveryId,
                  }), 4_000);
                  if (ingested && ingested.skipped === false) ingestedFiles += 1;
                  if (typeof deps.log === "function") deps.log({ kind: "slack-file-ingest", skipped: ingested?.skipped !== false, reason: ingested?.reason || "" });
                } catch {
                  // The Slack reply still goes out. A stashed upload retries from the worker.
                }
              }
            }
            if (incoming.length && !storedFiles.length) downloadFailed = true;
            // Durable uploads are queued; run the worker now so the Walrus copy exists before anyone asks.
            if (ingestedFiles) await settleFileJobs(filesRuntime);
            if (storedFiles.length) {
              delivery.file = storedFiles[0];
              delivery.files = storedFiles;
            }
          }
          const doorDeps = depsFor(workspace, companyId);
          const keptBefore = current.decisions.length;
          const filesBefore = snapshotDecisionFiles(current.decisions);
          // Where the message arrived decides ask or keep: a DM or @mention asks,
          // any other channel line is kept. Its words are never pattern-matched for this.
          const intent = delivery.intent === "delete" ? "delete" : (question ? "recall" : (huddle ? undefined : "keep"));
          const result = await handleUtterance({
            ...delivery,
            intent,
            ...(question && principal ? { readPrincipal: principal } : {}),
            session: current,
          }, doorDeps);
          // "Kept <file>" when this utterance recorded a new decision with files,
          // or attached more files to a same-text decision that was already kept.
          // An explicit keep that names or attaches files also acks when only
          // the text landed (or when every download failed) so the channel is
          // never left silent after a new decision.
          const keptNames = keptFileNames(current.decisions, keptBefore, filesBefore);
          const keptFile = keptNames.length > 0;
          const storedNew = current.decisions.length > keptBefore || keptFile;
          const explicitKeep = isExplicitKeep(delivery.text, incoming.length);
          if (replyDeletionFailed(result, replyHttp)) return;
          const repeat = result?.allow === "duplicate-delivery" || result?.outcome === "duplicate-delivery" || result?.outcome === "duplicate";
          const allowed = result?.allow !== "not-invited" && result?.allow !== "missing-member";
          if (typeof deps.log === "function") {
            deps.log({
              kind: "slack-keep",
              subtype,
              deliveryId: delivery.deliveryId || "",
              incoming: incoming.length,
              stored: storedFiles.length,
              outcome: result?.outcome || result?.allow || "",
              keptNames,
              explicitKeep,
              storedNew,
              downloadFailed,
              hasMember: Boolean(delivery.memberId),
              participantCount: Array.isArray(delivery.participants) ? delivery.participants.length : 0,
              speakerInvited: Boolean(delivery.memberId) && Array.isArray(delivery.participants) && delivery.participants.includes(delivery.memberId),
              roomId: delivery.room?.id || "",
            });
          }
          if (!question && !repeat && allowed && slackToken) {
            const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
            let notice = "";
            if (keptFile) notice = keptNotice(keptNames);
            else if (explicitKeep && storedNew) notice = downloadFailed ? "Kept. The files did not arrive." : "Kept.";
            else if (downloadFailed) notice = "The file did not arrive.";
            if (channel && notice) {
              const keepClaim = delivery.deliveryId || (typeof event.ts === "string" ? event.ts : "");
              const wonKeep = await claimSlackAsk(env, keepClaim, deps.slack?.fetch || deps.fetch, "keep");
              if (wonKeep) {
                await postSlackReply({
                  token: slackToken,
                  fetchImpl: deps.slack?.fetch,
                  channel,
                  text: notice,
                  username: botName,
                });
              }
            }
          }
          // A linked asker's question about a meeting ("the Meet we just had") reads their own
          // recent meetings. Only in a 1:1 DM (principal is null elsewhere).
          const meetingRows = question && principal && !repeat && isMeetingQuestion(delivery.text)
            ? (await withinOrNull(slackMeetingMemories(workspace, current, companyId, principal).catch(() => null), 6_000)) || []
            : [];
          if (question && !repeat && result?.allow === "not-invited" && !meetingRows.length && slackToken) {
            // Never silent, never a hint of what is kept or where.
            const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
            const claimId = delivery.deliveryId || (typeof event.ts === "string" ? event.ts : "");
            if (channel && await claimSlackAsk(env, claimId, deps.slack?.fetch || deps.fetch)) {
              await postSlackReply({
                token: slackToken,
                fetchImpl: deps.slack?.fetch,
                channel,
                text: SLACK_NOT_SHARED,
                thread: typeof event.thread_ts === "string" ? event.thread_ts : "",
                username: botName,
              });
            }
          }
          if (question && result?.body && !repeat && (result.allow !== "not-invited" || meetingRows.length) && result.allow !== "missing-member") {
            const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
            const answer = await answerSlackQuestion(result.allow === "not-invited" ? [] : result.visible, delivery.text, {
              env,
              fetchImpl: deps.slack?.fetch || deps.fetch,
              botName,
              maxMemories: 20,
              token: slackToken,
              channel,
              excludeTs: typeof event.ts === "string" ? event.ts : "",
              memberId: delivery.memberId,
              meetings: meetingRows,
              // MemWal.recall(query) ranks memories before the model reads them.
              recall: doorDeps.memory?.recall
                ? async (query) => doorDeps.memory.recall(query)
                : undefined,
            });
            // Keep the model's Slack reply. result.learned is Ask AI / chat shaping
            // (shapeAnswer sentence dump) and must not overwrite Adam's text here.
            // Question-named files win over the model's attach. Search the session
            // file records (not only visible rows, which hide names when a proof
            // fails) so "District 7 floor brief" pins northline-d7-floor-brief.txt
            // instead of a leftover floor-plan.txt.
            const catalog = [
              ...(principal ? readableFileRows(current, principal) : invitedFileRows(current.decisions, delivery.memberId)),
              ...(Array.isArray(result.visible) ? result.visible : []),
            ];
            const named = findReplyFile(catalog, delivery.text);
            if (named?.name) {
              answer.file = named.name;
              answer.fileMeta = named;
            }
            answer.text = prepareSlackCaption(answer.text, answer.file);
            const hint = named?.name ? named : answer.fileMeta;
            const walrus = principal && filesRuntime ? walrusFileReader(filesRuntime, principal.memberId, companyId, deps.log) : null;
            const bytes = answer.file ? await storedFileBytes(current, answer.file, depsFor(workspace, companyId), slackEnv, hint, { walrus }) : null;
            const reply = {
              channel,
              text: answer.text,
              file: answer.file && bytes != null ? { name: answer.file, bytes } : undefined,
              thread: typeof event.thread_ts === "string" ? event.thread_ts : "",
              username: botName,
            };
            // One post only. createSlackClient always has postMessage, so posting
            // through both that client and postSlackReply duplicated every DM answer.
            // claimSlackAsk stops a Slack retry on another isolate from posting again.
            const claimId = delivery.deliveryId || (typeof event.ts === "string" ? event.ts : "");
            const won = await claimSlackAsk(env, claimId, deps.slack?.fetch || deps.fetch);
            if (!won) {
              replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
                body: chatAnswer(result.body),
                decisions: current.decisions.filter((item) => item.account !== "personal" && item.kind !== "note" && !item.deleted).length,
                posted: false,
                duplicate: true,
              }));
              return;
            }
            if (slackToken) {
              await postSlackReply({
                token: slackToken,
                fetchImpl: deps.slack?.fetch,
                channel: reply.channel,
                text: reply.text,
                thread: reply.thread,
                file: reply.file,
                username: reply.username,
              });
            } else if (typeof deps.slack?.postMessage === "function") {
              await deps.slack.postMessage(reply);
            }
          }
          replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
            body: question ? chatAnswer(result.body) : result.body,
            decisions: current.decisions.filter((item) => item.account !== "personal" && item.kind !== "note" && !item.deleted).length,
            posted: question === true && !repeat,
          }));
        } catch {
          const channel = typeof event?.channel === "string" ? event.channel : "";
          if (slackToken && channel) {
            try {
              await postSlackReply({
                token: slackToken,
                fetchImpl: deps.slack?.fetch,
                channel,
                text: "I could not keep that message.",
                username: "Adam",
              });
            } catch { /* already failing */ }
          }
          replyHttp(500, "text/plain; charset=utf-8", "slack event failed");
        }
        })();
        if (liveAck) {
          let deferred = false;
          try {
            const { waitUntil } = await import("@vercel/functions");
            if (typeof waitUntil === "function") {
              waitUntil(slackWork);
              deferred = true;
            }
          } catch {
            // Local Node has no request context. Awaiting slackWork still finishes the reply.
          }
          replyHttp(200, "application/json; charset=utf-8", JSON.stringify({ slack: "accepted" }));
          // Do not await after a real waitUntil handoff — keeping the invocation open
          // past the 3s Slack retry window re-delivers the same DM and double-posts.
          if (deferred) return;
        }
        await slackWork;
        return;
    
      })();
      return true;
    }],
    ['api-download', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/download")) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) { sendCompanyDenied(res, send, { unauthorized: true }); return; }
        if (!activitySameOrigin(req)) { sendCompanyDenied(res, send, {}); return; }
        const body = await readJson(req);
        const resolved = await resolveCompanyId(workspace, req, typeof body.company === "string" ? body.company : "");
        if (resolved.denied || resolved.unauthorized) { sendCompanyDenied(res, send, resolved); return; }
        const current = await prepareWorkspace(workspace, resolved.companyId);
        const principal = await consolePrincipal(workspace, req, resolved.companyId);
        const memberId = readPrincipalId(principal);
        const visible = readableSession(current, principal);
        visible.decisions = visible.decisions.map((row) => ({ ...row, inviteMemberIds: [memberId] }));
        const saved = await downloadFile({ memberId, name: typeof body.name === "string" ? body.name : "", session: visible }, depsFor(workspace, resolved.companyId));
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ name: saved.name, bytes: saved.bytes == null ? null : String(saved.bytes), allow: saved.allow }));
        return;
    
      })();
      return true;
    }],
    ['object-prefix', async (req, res, url) => {
      if (!(req.method === "GET" && url.pathname.startsWith("/object/"))) return false;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) { sendCompanyDenied(res, send, { unauthorized: true }); return; }
        const id = decodeURIComponent(url.pathname.slice("/object/".length));
        if (!id || id.includes("/") || id.includes("..")) { send(res, 404, "text/plain; charset=utf-8", "Not found"); return; }
        const resolved = await resolveCompanyId(workspace, req, url.searchParams.get("company") || "");
        if (resolved.denied || resolved.unauthorized) { sendCompanyDenied(res, send, resolved); return; }
        const current = await prepareWorkspace(workspace, resolved.companyId);
        const principal = await consolePrincipal(workspace, req, resolved.companyId);
        const readers = meetingRoomReaders(current);
        if (!current.decisions.some((row) => row.objectId === id && canReadInSession(principal, row, readers))) {
          send(res, 404, "text/plain; charset=utf-8", "Not found"); return;
        }
        try {
          const object = await depsFor(workspace, resolved.companyId).tatum.getObject(id);
          const lines = [];
          if (typeof object?.text === "string" && object.text.trim()) lines.push(redact(object.text));
          if (object?.checkpoint != null) lines.push(`checkpoint ${object.checkpoint}`);
          if (Number.isSafeInteger(object?.version)) lines.push(`version ${object.version}`);
          send(res, 200, "text/plain; charset=utf-8", lines.join("\n") || "unknown");
        } catch { send(res, 200, "text/plain; charset=utf-8", "unknown"); }
        return;
    
      })();
      return true;
    }],
    ['mcp', async (req, res, url) => {
      if (!((url.pathname === "/mcp" || url.pathname === "/api/mcp") && req.method === "POST")) return false;
      let answered = true;
      await (async () => {
        const gate = guardConsole(req, env);
        if (gate.required && !gate.session) {
          sendCompanyDenied(res, send, { unauthorized: true });
          return;
        }
        if (!activitySameOrigin(req)) {
          send(res, 403, "text/plain; charset=utf-8", "That request was refused.");
          return;
        }
    
        answered = false;
      })();
      return answered;
    }],
    ['mcp-2', async (req, res, url) => {
      if (!(url.pathname === "/mcp")) return false;
      await (async () => {
        if (req.method !== "POST") {
          res.writeHead(405, { allow: "POST", "content-type": "text/plain; charset=utf-8" });
          res.end("Method Not Allowed");
          return;
        }
        const raw = await readBody(req);
        let message;
        try {
          message = JSON.parse(raw || "");
        } catch {
          send(res, 400, "application/json; charset=utf-8", JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "parse error" },
          }));
          return;
        }
        const args = message?.params?.arguments ?? {};
        const resolved = await resolveCompanyId(workspace, req, typeof args.company === "string" ? args.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId);
        const caller = guardConsole(req, env).session;
        const memberId = caller?.userId || caller?.memberId || env.SEDERUNT_MEMBER;
        const bound = bindToolMember(message, memberId);
        if (bound.refusal) {
          const refusal = memberRefusal(bound.refusal);
          const outcome = {
            status: 200,
            body: {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [{ type: "text", text: JSON.stringify(refusal) }],
                structuredContent: refusal,
              },
            },
          };
          send(res, outcome.status, "application/json; charset=utf-8", JSON.stringify(outcome.body));
          return;
        }
        if (bound.message?.method === "tools/call" && !String(bound.message.params?.name || "").includes("__")) {
          const supplied = bound.message.params.arguments;
          if (caller?.kind === "oauth" && (supplied.room || supplied.participants || supplied.door || supplied.followup || supplied.intent || supplied.readPrincipal)) {
            sendCompanyDenied(res, send, {});
            return;
          }
          bound.message.params.arguments = { ...deliveryFrom(supplied), workspace: supplied.workspace,
            readPrincipal: await consolePrincipal(workspace, req, companyId, supplied.workspace) };
        }
        const outcome = await mcpJsonRpc(bound.message, current, depsFor(workspace, companyId), await mcpCallContext(req));
        if (outcome.status === 202) {
          res.writeHead(202);
          res.end();
          return;
        }
        const accept = headerValue(req.headers.accept);
        const body = JSON.stringify(outcome.body);
        if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
          res.writeHead(outcome.status, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(`event: message\ndata: ${body}\n\n`);
          return;
        }
        send(res, outcome.status, "application/json; charset=utf-8", body);
        return;
    
      })();
      return true;
    }],
    ['api-mcp', async (req, res, url) => {
      if (!(req.method === "POST" && url.pathname === "/api/mcp")) return false;
      await (async () => {
        const message = await readJson(req);
        const name = message?.name ?? message?.params?.name;
        const args = message?.arguments ?? message?.params?.arguments ?? {};
        const resolved = await resolveCompanyId(workspace, req, typeof args.company === "string" ? args.company : "");
        if (resolved.denied || resolved.unauthorized) {
          sendCompanyDenied(res, send, resolved);
          return;
        }
        const companyId = resolved.companyId;
        const current = await prepareWorkspace(workspace, companyId);
        const caller = guardConsole(req, env).session;
        const memberId = caller?.userId || caller?.memberId || env.SEDERUNT_MEMBER;
        const bound = bindToolMember({ method: "tools/call", params: { arguments: args } }, memberId);
        if (bound.refusal) {
          send(res, 200, "application/json; charset=utf-8", JSON.stringify(memberRefusal(bound.refusal)));
          return;
        }
        const custom = typeof name === "string" && name.includes("__");
        if (!custom && caller?.kind === "oauth" && (args.room || args.participants || args.door || args.followup || args.intent || args.readPrincipal)) {
          sendCompanyDenied(res, send, {});
          return;
        }
        const result = await handleMcpRequest({
          name,
          arguments: custom
            ? { ...bound.message.params.arguments, session: current }
            : { ...deliveryFrom(bound.message.params.arguments), workspace: args.workspace,
              readPrincipal: await consolePrincipal(workspace, req, companyId, args.workspace), session: current },
          _meta: message?._meta || message?.params?._meta,
        }, depsFor(workspace, companyId), await mcpCallContext(req));
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
        return;
    
      })();
      return true;
    }],
  ];
}
