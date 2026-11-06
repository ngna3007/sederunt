import { createServer } from "node:http";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { redact } from "./domain/redact.js";
import { handleCalendarEvent } from "./calendar/route.js";
import { handleConnectorRoutes } from "./connectors/route.js";
import { createFormsApp, handleNodeForms } from "./mcp-forms/http.js";
import { createFakeCalendarMcp } from "./connectors/calendar-fake.js";
import { createConnectorStore } from "./connectors/store.js";
import { createPersonGoogleStore } from "./connectors/google-person.js";
import { calendarPresentedConnected, calendarTimeZone, createCalendarAdapter } from "./calendar/mcp.js";
import { createConsoleAdapter } from "./console/upload.js";
import { createLinearClient } from "./linear/mcp.js";
import { loadLinearToken } from "./linear/token.js";
import { renderCameraPage } from "./meeting/camera.js";
import { normalizeHearing } from "./hearing.js";
import { createMeetingAdapter, mediaFromBot, meetingDoorReady, meetingEnded, recallBotUrl, recallTranscriptDelivery, verifyRecallRequest } from "./meeting/recall.js";
import { createTatumReader } from "./tatum/get-object.js";
import { resolveMcpSpace } from "./connectors/expose.js";
import { stopDemoServer } from "./connectors/demo.js";
import { bindToolMember, handleMcpRequest, memberRefusal, mcpJsonRpc } from "./mcp.js";
import { renderConsolePage } from "./console-page.js";
import { contentWords, decisionRoomIds, roomsMatching } from "./room-match.js";
import { createSlackClient } from "./slack/post.js";
import { renderSignInPage } from "./console-sign-in.js";
import {
  CONSOLE_SESSION_MS,
  clearedSessionCookie,
  consoleSecret,
  guardConsole,
  passphraseMatches,
  safeConsoleNext,
  sealSession,
  sessionCookie,
  sessionSecret,
} from "./console-auth.js";
import { createIdentity, identityConfigured } from "./identity/client.js";
import { resolveSignInProviders } from "./identity/shared.js";
import { clearOAuthCookie } from "./identity/pending.js";
import { handleAuthRoute, requestOrigin } from "./identity/routes.js";
import { refreshOAuthSession, rememberRefreshCookie } from "./identity/session.js";
import { createMemoryPreferenceStore } from "./bot/preferences.js";
import { canEditBot, handleBotSettings, readBot } from "./console/bot-settings.js";
import { handleToolPref, loadAccountProfile, loadToolAsk } from "./console-account.js";
import { handleInvite, handleJoinLink, handleSpaceSwitch, handleWelcome, loadChecklist, loadSpaceView, welcomeLocation } from "./console-flow.js";
import { roleLabel } from "./identity/onboarding.js";
import { renderLanding } from "./landing.js";
import { handleFileRequest } from "./files/routes.js";
import { createFileRuntime } from "./files/runtime.js";
import { createFileStore } from "./files/store.js";
import { createSessionFiles } from "./files/session.js";
import { hideDeletedSlackMessages, ingestSlackFile } from "./files/slack.js";
import { loadCompanyEnv, loadLocalEnv } from "./local-env.js";
import { looksLikeOpenQuestion } from "./parse.js";
import { createSession } from "./session.js";
import { createAskStore, askLimit, settledStatus } from "./ask/store.js";
import { ASK_UNAVAILABLE, askSpendsQuota, humanAskText, runAsk } from "./ask/run.js";
import { openRouterConfig } from "./openrouter.js";
import { answerSlackQuestion, claimSlackAsk, postSlackReply, replyFile, slackChannelMembers, slackFileBytes } from "./slack/reply.js";
import { slackBotUserIds, slackDelivery, slackEventHasFiles, verifySlackRequest } from "./slack/sign.js";
import { companyBoard, downloadFile, endMeeting, handleUtterance, hydrateSlackChannels, personalBoard, readProofs, rebuildCompanyIndex, replayFailure, roomLedger, saveHearing, searchPublishedActivity, undoRecorded, warmProofs } from "./typed-path.js";
import { wireCalls } from "./tatum/client.js";

const port = Number(process.env.PORT || 8787);

function memoryAdapter(env = process.env, client, tatum) {
  const company = env.COMPANY_MEMWAL_KEY;
  const personal = env.PERSONAL_MEMWAL_KEY;
  if (!company && !personal) return null;
  return {
    async remember(input) {
      if (input.account === "personal") {
        if (!personal) throw new Error("This process holds no personal delegate");
        const { rememberPersonal } = await import("./memory/company.js");
        return publicMemory(await rememberPersonal(input));
      }
      if (!company || input.account !== "company") {
        throw new Error("This process holds only the company delegate");
      }
      const { rememberCompany } = await import("./memory/company.js");
      return publicMemory(await rememberCompany({ ...input, client, env, tatum }));
    },
    async index() {
      const { indexCompany } = await import("./memory/company.js");
      return indexCompany({ client, env });
    },
    /** Semantic ask path: query Walrus Memory before an LLM answer (withMemWal shape). */
    async recall(query) {
      const { recallCompany } = await import("./memory/company.js");
      return recallCompany({ query, topK: 10, client, env });
    },
  };
}

function publicMemory(saved) {
  const owner = typeof saved?.owner === "string" && /^0x[0-9a-fA-F]{64}$/.test(saved.owner) ? saved.owner : null;
  return {
    ok: Boolean(saved?.ok),
    blobId: saved?.blobId ?? null,
    kind: saved?.kind ?? null,
    expiryEpoch: Number.isInteger(saved?.expiryEpoch) && saved.expiryEpoch >= 0 ? saved.expiryEpoch : null,
    objectId: typeof saved?.objectId === "string" ? saved.objectId : null,
    digest: typeof saved?.digest === "string" ? saved.digest : null,
    checkpoint: Number.isInteger(saved?.checkpoint) ? saved.checkpoint : null,
    owner,
  };
}

/** Origin, calendar zone, and the Linear team, from the app env rather than a later process.env read. */
export function appConfig(env = {}) {
  const origin = String(env.SEDERUNT_PUBLIC_ORIGIN || "").replace(/\/$/, "");
  const linearTeam = String(env.LINEAR_TEAM || "ROW").trim() || "ROW";
  const linearWorkspace = String(env.LINEAR_WORKSPACE || "").trim();
  const slackChannel = String(env.SLACK_DEFAULT_CHANNEL || "").trim();
  return { origin, timeZone: calendarTimeZone(env), linearTeam, linearWorkspace, slackChannel };
}

/** Adapters that do not open a socket. A live Linear client is used only after a token load that the caller opts into. */
export function defaultDeps(options = {}) {
  const env = options.env ?? process.env;
  const config = appConfig(env);
  const fetchImpl = options.fetch || globalThis.fetch;
  const linearCalls = [];
  const tatum = options.tatum ?? createTatumReader(env);
  const deps = {
    linear: options.linear ?? {
      calls: linearCalls,
      async readOpenTripTickets() {
        linearCalls.push("read");
        return { team: "ROW", trip: [], open: [] };
      },
      async createIssue() {
        linearCalls.push("create");
        return { identifier: "", id: "" };
      },
      async assignIssue() {
        linearCalls.push("assign");
        return { identifier: "", id: "" };
      },
      async updateIssue({ id } = {}) {
        linearCalls.push("update");
        return { identifier: id || "", id: id || "" };
      },
      async addLabel({ id } = {}) {
        linearCalls.push("label");
        return { identifier: id || "", id: id || "" };
      },
      async removeLabel({ id } = {}) {
        linearCalls.push("unlabel");
        return { identifier: id || "", id: id || "" };
      },
      async unassignIssue({ id } = {}) {
        linearCalls.push("unassign");
        return { identifier: id || "", id: id || "" };
      },
    },
    calendar: options.calendar ?? createCalendarAdapter(env),
    slack: options.slack ?? createSlackClient(env, fetchImpl),
    tatum,
    console: options.console ?? createConsoleAdapter(),
    meeting: options.meeting ?? createMeetingAdapter(env),
    memory: options.memory === undefined ? memoryAdapter(env, options.memwal, tatum) : options.memory,
  };
  if (options.liveLinear === true) {
    deps.linear = liveLinear(deps.linear, options.loadToken, config);
  }
  deps.app = config;
  return deps;
}

function liveLinear(stub, loadToken = loadLinearToken, config = {}) {
  let pending;
  return {
    calls: stub.calls,
    async readOpenTripTickets() {
      const client = await pendingClient();
      return client.readOpenTripTickets();
    },
    async createIssue(input) {
      const client = await pendingClient();
      return client.createIssue(input);
    },
    async assignIssue(input) {
      const client = await pendingClient();
      return client.assignIssue(input);
    },
    async updateIssue(input) {
      const client = await pendingClient();
      return client.updateIssue(input);
    },
    async addLabel(input) {
      const client = await pendingClient();
      return client.addLabel(input);
    },
    async removeLabel(input) {
      const client = await pendingClient();
      return client.removeLabel(input);
    },
    async unassignIssue(input) {
      const client = await pendingClient();
      return client.unassignIssue(input);
    },
  };
  function pendingClient() {
    if (!pending) {
      pending = Promise.resolve().then(() => {
        try {
          const token = loadToken();
          if (!token) return stub;
          return createLinearClient(token, globalThis.fetch, { team: config.linearTeam, workspace: config.linearWorkspace });
        } catch {
          return stub;
        }
      });
    }
    return pending;
  }
}

/** Door flags for the room. The values are booleans, and the secrets stay out. */
export function doorReport(env = process.env, linearReady = false) {
  const meeting = meetingDoorReady(env);
  const slack = Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_BOT_TOKEN);
  const member = Boolean(String(env.SEDERUNT_MEMBER || "").trim());
  const consoleReady = Boolean(env.CONSOLE_API_KEY && env.CONSOLE_SERVICE_PRIVATE_KEY && env.CONSOLE_FOLDER_ID);
  const company = Boolean(env.COMPANY_MEMWAL_KEY && env.COMPANY_MEMWAL_ACCOUNT_ID);
  const linear = linearReady === true;
  return {
    meeting,
    calendar: calendarPresentedConnected(env),
    linear,
    slack,
    member,
    console: consoleReady,
    company,
    walk: meeting && slack && member && consoleReady && company && linear,
  };
}

function meetingPlatform(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (host === "meet.google.com") return "Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host === "teams.microsoft.com" || host === "teams.live.com") return "Teams";
  if (host === "webex.com" || host.endsWith(".webex.com")) return "Webex";
  return "";
}

function linearReady() {
  try {
    return Boolean(loadLinearToken());
  } catch {
    return false;
  }
}

export function deliveryFrom(source) {
  const body = source && typeof source === "object" ? source : { text: String(source ?? "") };
  const room = body.room && typeof body.room === "object" ? body.room : undefined;
  const participants = Array.isArray(body.participants)
    ? body.participants.filter((id) => typeof id === "string")
    : undefined;
  const decision = body.decision && typeof body.decision === "object"
    ? {
        area: typeof body.decision.area === "string" ? body.decision.area : "",
        contradicts: Array.isArray(body.decision.contradicts) ? body.decision.contradicts : [],
        replaces: typeof body.decision.replaces === "string" ? body.decision.replaces : undefined,
      }
    : undefined;
  return {
    text: typeof body.text === "string" ? body.text : "",
    memberId: typeof body.memberId === "string" ? body.memberId : undefined,
    room,
    door: typeof body.door === "string" ? body.door : undefined,
    deliveryId: typeof body.deliveryId === "string" ? body.deliveryId : undefined,
    participants,
    addressed: body.addressed === true ? true : undefined,
    decision,
    join: body.join,
    checkpoint: Number.isInteger(body.checkpoint) ? body.checkpoint : undefined,
    knowableAtCheckpoint: Number.isInteger(body.knowableAtCheckpoint) ? body.knowableAtCheckpoint : undefined,
    file: fileFrom(body.file),
  };
}

function fileFrom(file) {
  if (!file || typeof file !== "object" || typeof file.name !== "string") return undefined;
  return {
    name: file.name,
    bytes: typeof file.bytes === "string" ? file.bytes : undefined,
  };
}

export function createApp(options = {}) {
  const session = options.session ?? createSession();
  const env = options.env ?? process.env;
  const botPreferences = options.botPreferences ?? createMemoryPreferenceStore();
  const deps = options.deps ?? defaultDeps({
    liveLinear: options.liveLinear === true,
    loadToken: options.loadToken,
    calendar: options.calendar,
    tatum: options.tatum,
    console: options.console,
    meeting: options.meeting,
    env,
    memwal: options.memwal,
  });
  if (!deps.app) deps.app = appConfig(env);
  deps.connectors = options.connectors || deps.connectors || createConnectorStore(env);
  if (!options.deps && (isDirectRun() || process.env.VERCEL)) {
    deps.log = (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    };
  }
  const companies = options.companies && typeof options.companies === "object" ? options.companies : null;
  const sessions = new Map();
  const loads = new Map();
  const workspace = {
    env,
    companies,
    sessions,
    loads,
    session,
    deps,
    companyLoaded: loadedCompany(options, deps, env, companies),
    linearReady: options.linearReady === true || (options.env ? false : linearReady()),
    recall: options.recall || null,
    botPreferences,
    identity: null,
    ask: options.askStore || createAskStore(env),
    openrouterFetch: options.openrouterFetch || null,
  };
  if (proofWarmOn(env) && workspace.companyLoaded && deps.tatum) {
    // Read the company proofs once at start so the first room load is
    // already verified. Sequential, through the reader's shared throttle.
    workspace.warm = Promise.resolve()
      .then(() => prepareWorkspace(workspace, ""))
      .then((current) => warmProofs(current, deps.tatum))
      .then((report) => {
        if (typeof deps.log === "function") deps.log({ kind: "proof-warm", ...report });
        return report;
      }, () => null);
  }
  const identity = options.identity ?? (identityConfigured(env) ? createIdentity(env) : null);
  workspace.identity = identity;
  workspace.forms = createFormsApp({ env, fetchImpl: options.fetch });
  workspace.googleGrants = options.googleGrants || createPersonGoogleStore({ env, fetchImpl: options.fetch });
  workspace.calendarMcp = createFakeCalendarMcp();
  workspace.calendarSave = typeof options.calendarSave === "function" ? options.calendarSave : null;
  async function mcpCallContext(req) {
    const gate = guardConsole(req, env);
    const tenantId = await resolveMcpSpace(gate, identity, workspace.deps.connectors);
    const personId = String(gate.session?.userId || gate.session?.memberId || env.SEDERUNT_MEMBER || "").trim();
    return {
      tenantId,
      env,
      personId,
      googleGrants: workspace.googleGrants,
      forms: workspace.forms,
      calendarMcp: workspace.calendarMcp,
      calendarSave: workspace.calendarSave,
      fetch: options.fetch,
      origin: requestOrigin(req, env),
    };
  }
  const filesRuntime = options.files === false
    ? null
    : (options.files || (attachFiles(options, env) ? liveFiles(env, identity) : null));
  const server = createServer(async (req, res) => {
  try {
    if (identity) rememberRefreshCookie(res, await refreshOAuthSession(req, identity, env));
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (filesRuntime && await handleFileRequest(req, res, url, filesRuntime, { send })) return;
    if (await handleNodeForms(req, res, { forms: workspace.forms, env, url })) return;
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      if (await sendMedia(res, url.pathname)) return;
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/clips/")) {
      if (await sendClip(req, res, url.pathname)) return;
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")) {
      const icon = await readFile(resolve("public/favicon.svg"));
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      res.end(icon);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/models/")) {
      const name = url.pathname.slice("/models/".length);
      if (!/^CEREBRIUM_[A-Za-z0-9_]+\.glb$/.test(name)) {
        send(res, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }
      const file = resolve("public/models", name);
      send(res, 200, "model/gltf-binary", await readFile(file));
      return;
    }
    if (req.method === "GET" && url.pathname === "/hold.js") {
      send(res, 200, "text/javascript; charset=utf-8", await readFile(new URL("./hold.js", import.meta.url), "utf8"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/prototype/hero") {
      send(res, 200, "text/html; charset=utf-8", await readFile(resolve("prototype/hero-drafts.html"), "utf8"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, "text/html; charset=utf-8", renderLanding());
      return;
    }
    if (req.method === "GET" && url.pathname === "/console.css") {
      send(res, 200, "text/css; charset=utf-8", await readFile(new URL("./console.css", import.meta.url), "utf8"));
      return;
    }
    if (req.method === "GET" && (url.pathname === "/fonts/Geist-Variable.woff2" || url.pathname === "/fonts/GeistMono-Variable.woff2")) {
      const file = url.pathname.endsWith("GeistMono-Variable.woff2")
        ? "geist-mono/GeistMono-Variable.woff2"
        : "geist-sans/Geist-Variable.woff2";
      const bytes = await readFile(resolve("node_modules/geist/dist/fonts", file));
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=86400" });
      res.end(bytes);
      return;
    }
    if (url.pathname === "/console/auth" || url.pathname.startsWith("/console/auth/")) {
      await handleAuthRoute({ req, res, url, env, identity, send, redirect, googleGrants: workspace.googleGrants, calendarSave: workspace.calendarSave, fetchImpl: options.fetch || globalThis.fetch });
      return;
    }
    if (req.method === "GET" && url.pathname === "/console/sign-in") {
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
    }
    if (req.method === "POST" && url.pathname === "/console/sign-in") {
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
    }
    if (req.method === "POST" && url.pathname === "/console/profile") {
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
    }
    if (req.method === "POST" && url.pathname === "/console/sign-out") {
      redirect(res, "/console/sign-in", { "set-cookie": [clearedSessionCookie(req), clearOAuthCookie(req)] });
      return;
    }
    if (req.method === "GET" && /^\/console\/rooms\/[^/]+\/media$/.test(url.pathname)) {
      const gate = guardConsole(req, env);
      if (gate.required && !gate.session) {
        send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in." }));
        return;
      }
      const id = decodeURIComponent(url.pathname.slice("/console/rooms/".length, -"/media".length));
      const body = await roomMedia(workspace, id);
      const secret = typeof env.RECALL_API_KEY === "string" ? env.RECALL_API_KEY : "";
      const raw = secret.length >= 12 ? JSON.stringify(body).split(secret).join("") : JSON.stringify(body);
      send(res, 200, "application/json; charset=utf-8", raw);
      return;
    }
    if (req.method === "POST" && /^\/console\/rooms\/[^/]+\/name$/.test(url.pathname)) {
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
    }
    if (req.method === "GET" && (url.pathname === "/console/activity.js" || url.pathname === "/console/activity-feed.js")) {
      const source = await readFile(resolve("src/activity-feed.js"));
      send(res, 200, "text/javascript; charset=utf-8", source);
      return;
    }
    if (req.method === "GET" && url.pathname === "/console/room-match.js") {
      const source = await readFile(resolve("src/room-match.js"));
      send(res, 200, "text/javascript; charset=utf-8", source);
      return;
    }
    if (req.method === "GET" && url.pathname === "/console/bot-identity.js") {
      const source = await readFile(resolve("src/bot/identity.js"));
      send(res, 200, "text/javascript; charset=utf-8", source);
      return;
    }
    if (req.method === "GET" && url.pathname === "/console/bot-card.js") {
      const source = await readFile(resolve("src/console/bot-card.js"));
      send(res, 200, "text/javascript; charset=utf-8", source);
      return;
    }
    if (url.pathname === "/api/bot") {
      await handleBotSettings({
        req, res, url, env, identity, send, readJson, store: workspace.botPreferences,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/activity") {
      const gate = guardConsole(req, env);
      if (!gate.session) {
        send(res, 401, "application/json; charset=utf-8", JSON.stringify({ ok: false, reason: "sign-in" }));
        return;
      }
      const current = await prepareWorkspace(workspace, "", false, 2000);
      const groups = searchPublishedActivity(current, current.rooms || [], {
        query: url.searchParams.get("q") || "",
        roomId: url.searchParams.get("room") || "",
        kind: url.searchParams.get("kind") || "",
      }, { timeZone: calendarTimeZone(env), slackChannel: appConfig(env).slackChannel });
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, groups }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/activity") {
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
      const current = await prepareWorkspace(workspace, "", false, 2000);
      const id = typeof body.id === "string" ? body.id : "";
      const actor = gate.session.name?.trim() || "Someone";
      const deps = depsFor(workspace, "");
      const result = body.op === "undo"
        ? await undoRecorded(current, deps, id, actor)
        : await replayFailure(current, deps, id);
      const status = result.ok ? 200 : result.reason === "missing" || result.reason === "not-action" ? 404 : 409;
      send(res, status, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/console/welcome") {
      await handleWelcome({
        req, res, url, env, identity, send, redirect,
        readPosted: readPostedAll,
        botPreferences: workspace.botPreferences,
        calendar: workspace.deps.calendar,
        doors: doorReport(env, workspace.linearReady === true),
        slack: workspace.deps.slack,
        slackChannel: workspace.deps.app?.slackChannel || "",
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/console/space") {
      await handleSpaceSwitch({ req, res, url, env, identity, send, redirect, readPosted });
      return;
    }
    if (req.method === "POST" && url.pathname === "/console/tool-prefs") {
      await handleToolPref({ req, res, url, env, identity, send, readPosted });
      return;
    }
    if (await handleConnectorRoutes({
      req,
      res,
      url,
      env,
      send,
      readJson,
      workspace,
      identity,
      sameOrigin: activitySameOrigin,
    })) return;
    const eventPath = /^\/console\/calendar\/events\/([^/]+)$/.exec(url.pathname);
    if (eventPath && (req.method === "GET" || req.method === "POST")) {
      let eventId = eventPath[1];
      try { eventId = decodeURIComponent(eventId); } catch { eventId = eventPath[1]; }
      await handleCalendarEvent({
        req,
        res,
        env,
        send,
        readJson,
        calendar: deps.calendar,
        sameOrigin: activitySameOrigin,
        id: eventId,
      });
      return;
    }
    const joinPath = /^\/console\/join\/([^/]+)$/.exec(url.pathname);
    if (joinPath && (req.method === "GET" || req.method === "POST")) {
      let token = joinPath[1];
      try { token = decodeURIComponent(token); } catch { token = joinPath[1]; }
      await handleJoinLink({ req, res, url, env, identity, send, redirect, token });
      return;
    }
    const invitePath = /^\/console\/invite\/([^/]+)$/.exec(url.pathname);
    if (invitePath && (req.method === "GET" || req.method === "POST")) {
      let token = invitePath[1];
      try { token = decodeURIComponent(token); } catch { token = invitePath[1]; }
      await handleInvite({ req, res, url, env, identity, send, redirect, token });
      return;
    }
    if (req.method === "GET" && url.pathname === "/console/ask") {
      redirect(res, "/console/chat");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/console" || url.pathname.startsWith("/console/"))) {
      const gate = guardConsole(req, env);
      if (gate.required && !gate.session) {
        const next = encodeURIComponent(safeConsoleNext(url.pathname + (url.search || "")));
        const reason = gate.reason === "expired" || gate.reason === "invalid" ? `&reason=${gate.reason}` : "";
        redirect(res, `/console/sign-in?next=${next}${reason}`);
        return;
      }
      if (req.method === "GET" && url.pathname === "/console") {
        const welcome = await welcomeLocation(req, env, identity);
        if (welcome) {
          redirect(res, welcome);
          return;
        }
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
      const connectedDoors = oauth ? doorReport(env, workspace.linearReady === true) : null;
      const accountProfile = oauth ? await loadAccountProfile(identity, gate.session, spaces) : null;
      const toolAsk = oauth ? await loadToolAsk(identity, gate.session, connectedDoors || {}, env) : null;
      const checklist = oauth && url.pathname === "/console" ? await loadChecklist(identity, gate.session, spaces, toolAsk) : null;
      const botTenant = spaces?.activeId || "local";
      const botView = await readBot(workspace.botPreferences, botTenant);
      const bot = {
        ...botView,
        canEdit: canEditBot({
          signedIn: Boolean(gate.session),
          oauth: Boolean(spaces?.oauth),
          role: spaces?.activeRole || "",
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
        calendarConnected: doors.calendar === true,
        linearConnected: doors.linear === true,
        slackConnected: doors.slack === true,
        slackReady: Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_BOT_TOKEN),
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
      }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/meeting") {
      send(res, 200, "text/html; charset=utf-8", renderCameraPage(url.searchParams.get("name") || ""));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/hearing") {
      const body = await readJson(req);
      const companyId = typeof body.company === "string" ? body.company : "";
      const current = await prepareWorkspace(workspace, companyId);
      const triggers = typeof body.triggers === "string"
        ? body.triggers.split(/\n+/)
        : body.triggers;
      const hearing = await saveHearing(current, depsFor(workspace, companyId), {
        name: body.name,
        triggers,
      });
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ hearing: normalizeHearing(hearing) }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/room") {
      res.writeHead(302, { location: "/console", "cache-control": "no-store" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/console") {
      const gate = guardConsole(req, env);
      if (gate.required && !gate.session) {
        send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in again.", reason: gate.reason || "missing" }));
        return;
      }
      const companyId = url.searchParams.get("company") || "";
      const current = await prepareWorkspace(workspace, companyId, false, 2000);
      const workspaceKind = url.searchParams.get("workspace") || "";
      const memberId = consoleBoardMember(gate.session, env, workspaceKind, url.searchParams.get("member") || "");
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        memberId,
        workspaceKind,
      )));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/console/read") {
      const gate = guardConsole(req, env);
      if (gate.required && !gate.session) {
        send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in again.", reason: gate.reason || "missing" }));
        return;
      }
      const companyId = url.searchParams.get("company") || "";
      const current = await prepareWorkspace(workspace, companyId, true);
      const workspaceKind = url.searchParams.get("workspace") || "";
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        consoleBoardMember(gate.session, env, workspaceKind, ""),
        workspaceKind,
      )));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/ready") {
      const report = doorReport(env, workspace.linearReady === true);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(report));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/room") {
      const requested = url.searchParams.get("room") || "desk";
      const roomId = /^[A-Za-z0-9_-]{1,64}$/.test(requested) ? requested : "desk";
      const current = await prepareWorkspace(workspace, url.searchParams.get("company") || "");
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(roomLedger(current, roomId)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = await readJson(req);
      const meetingUrl = typeof body.url === "string" ? body.url.trim() : "";
      let join = "not-configured";
      if (!doorReport(env, workspace.linearReady === true).walk) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ join }));
        return;
      }
      if (!workspace.joinInFlight) workspace.joinInFlight = new Map();
      const pending = workspace.joinInFlight;
      const prior = pending.get(meetingUrl);
      if (prior) {
        const reused = await prior;
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(reused));
        return;
      }
      const work = (async () => {
        let botId = "";
        let startedAt = "";
        let status = "not-configured";
        if (deps.meeting?.join) {
          try {
            const ready = await prepareWorkspace(workspace, "");
            const guest = normalizeHearing(ready?.hearing).name;
            const bot = await currentBot(workspace, req);
            const sent = await deps.meeting.join({ url: meetingUrl, name: guest, botName: bot.name });
            status = "sent";
            botId = typeof sent?.id === "string" ? sent.id : "";
            startedAt = typeof sent?.startedAt === "string" ? sent.startedAt : (typeof sent?.started_at === "string" ? sent.started_at : "");
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            status = message === "Meeting join is not configured" ? "not-configured" : "failed";
          }
        }
        if (status === "sent" && workspace.companyLoaded) {
          const platform = meetingPlatform(meetingUrl);
          if (platform) {
            try {
              const current = await prepareWorkspace(workspace, "");
              await handleUtterance({
                session: current,
                openedRoom: { platform, id: botId, ...(startedAt ? { startedAt } : {}) },
              }, depsFor(workspace, ""));
            } catch {
              // The door already sent the bot. A missed record does not change that word.
            }
          }
        }
        return { join: status };
      })();
      pending.set(meetingUrl, work);
      try {
        const result = await work;
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
      } finally {
        // Keep the promise briefly so a double-click shares one bot, then clear.
        setTimeout(() => {
          if (pending.get(meetingUrl) === work) pending.delete(meetingUrl);
        }, 15_000);
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/recall") {
      const raw = await readBody(req);
      const accepted = verifyRecallRequest({
        secret: env.RECALL_WEBHOOK_SECRET || "",
        headers: req.headers,
        payload: raw,
      });
      if (accepted) {
        try {
          const payload = JSON.parse(raw || "{}");
          const delivery = recallTranscriptDelivery(payload);
          if (delivery) {
            const configured = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
            if (configured) {
              const people = [...new Set([...(delivery.participants ?? []), configured].filter(Boolean))];
              delivery.participants = people;
              delivery.room.memberIds = people;
            }
            const current = await prepareWorkspace(workspace, "");
            await handleUtterance({ ...delivery, session: current }, depsFor(workspace, ""));
          }
          const ended = meetingEnded(payload);
          if (ended?.roomId) {
            const current = await prepareWorkspace(workspace, "");
            await endMeeting(current, depsFor(workspace, ""), ended.roomId);
          }
        } catch {
          // A signed callback is still accepted when the transcript has no words.
        }
      }
      send(res, accepted ? 204 : 401, "text/plain; charset=utf-8", accepted ? "" : "rejected");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/typed") {
      const delivery = await readRequest(req);
      const configured = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
      if (!delivery.memberId && configured) delivery.memberId = configured;
      const current = await prepareWorkspace(workspace, delivery.company || "");
      const result = await handleUtterance({ ...delivery, session: current }, depsFor(workspace, delivery.company || ""));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/proof") {
      const body = await readJson(req);
      const id = typeof body.id === "string" ? body.id : "";
      const companyId = typeof body.company === "string" ? body.company : "";
      const current = await prepareWorkspace(workspace, companyId);
      const memberId = consoleBoardMember(null, env, "company", typeof body.memberId === "string" ? body.memberId : "");
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
    }
    if (url.pathname === "/api/ask" || /^\/api\/ask\/[A-Za-z0-9_]+\/stream$/.test(url.pathname)) {
      await handleAsk(workspace, req, res, url);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJson(req);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await chatReply(workspace, body)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/slack") {
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
      const companyId = typeof parsed.company === "string" ? parsed.company : "";
      const event = parsed.event && typeof parsed.event === "object" ? parsed.event : parsed;
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
      const canLiveAck = parsed.type === "event_callback" && Boolean(env.SLACK_BOT_TOKEN) && options.deps == null;
      const peek = slackDelivery(event, { botUserIds: slackBotUserIds(parsed, env) });
      const liveAck = canLiveAck && peek.ask === true;
      const slackWork = (async () => {
      const current = await prepareWorkspace(workspace, companyId);
      const botName = (await currentBot(workspace, req)).name;
      try {
        const delivery = slackDelivery(event, { botUserIds: slackBotUserIds(parsed, env) });
        if (filesRuntime && delivery.intent === "delete") {
          try { hideDeletedSlackMessages(filesRuntime, delivery.forgetIds); } catch { /* the event still acks */ }
        }
        // A DM, or a channel @mention, recalls. Other channel lines are stored.
        const question = delivery.ask === true;
        const huddle = delivery.room?.kind === "huddle" || delivery.room?.source === "slack-huddle";
        let storedFile = null;
        let incoming = [];
        let storedFiles = [];
        let downloadFailed = false;
        if (!question && delivery.intent !== "delete" && !huddle) {
          const channel = delivery.room?.askChannel || "";
          const people = await slackPeople(env, deps, channel);
          // conversations.members sometimes returns empty (rate limit / scope blip).
          // Falling back to the speaker keeps the channel file instead of going silent.
          const memberIds = people.length
            ? people
            : (delivery.memberId ? [delivery.memberId] : []);
          if (!memberIds.length) {
            if (env.SLACK_BOT_TOKEN && channel) {
              await postSlackReply({
                token: env.SLACK_BOT_TOKEN,
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
          delivery.participants = memberIds;
          delivery.room.memberIds = memberIds;
          incoming = Array.isArray(delivery.files) && delivery.files.length
            ? delivery.files
            : (delivery.file ? [delivery.file] : []);
          const downloaded = await Promise.all(incoming.map(async (item) => {
            try {
              return await withinMs(slackBytes(env, deps, item), 12_000);
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
                await withinMs(ingestSlackFile(filesRuntime, {
                  externalChannelId: channel,
                  slackUserId: delivery.memberId,
                  slackName: delivery.memberId,
                  slackFileId,
                  name: loaded.name,
                  mimeType: loaded.mimeType || "application/octet-stream",
                  bytes: loaded.bytes,
                  externalMessageId: delivery.deliveryId,
                }), 4_000);
              } catch {
                // The Slack reply still goes out. A stashed upload retries from the worker.
              }
            }
          }
          if (incoming.length && !storedFiles.length) downloadFailed = true;
          if (storedFiles.length) {
            storedFile = storedFiles[0];
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
          });
        }
        if (!question && !repeat && allowed && env.SLACK_BOT_TOKEN) {
          const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
          let notice = "";
          if (keptFile) notice = keptNotice(keptNames);
          else if (explicitKeep && storedNew) notice = downloadFailed ? "Kept. The files did not arrive." : "Kept.";
          else if (downloadFailed) notice = "The file did not arrive.";
          if (channel && notice) {
            await postSlackReply({
              token: env.SLACK_BOT_TOKEN,
              fetchImpl: deps.slack?.fetch,
              channel,
              text: notice,
              username: botName,
            });
          }
        }
        if (question && result?.body && !repeat && result.allow !== "not-invited" && result.allow !== "missing-member") {
          const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
          const answer = await answerSlackQuestion(result.visible, delivery.text, {
            env,
            fetchImpl: deps.slack?.fetch || deps.fetch,
            botName,
            maxMemories: 20,
            token: env.SLACK_BOT_TOKEN,
            channel,
            excludeTs: typeof event.ts === "string" ? event.ts : "",
            // MemWal.recall(query) ranks memories before the model reads them.
            recall: doorDeps.memory?.recall
              ? async (query) => doorDeps.memory.recall(query)
              : undefined,
          });
          // Keep the model's Slack reply. result.learned is Ask AI / chat shaping
          // (shapeAnswer sentence dump) and must not overwrite Adam's text here.
          // Question-named files win over the model's attach (floor-plan.txt
          // must not beat northline-d7-floor-brief.txt on "floor brief").
          const named = replyFile(result.visible, delivery.text);
          if (named) answer.file = named;
          const bytes = answer.file ? await storedFileBytes(current, answer.file, deps, env) : null;
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
          if (env.SLACK_BOT_TOKEN) {
            await postSlackReply({
              token: env.SLACK_BOT_TOKEN,
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
        if (env.SLACK_BOT_TOKEN && channel) {
          try {
            await postSlackReply({
              token: env.SLACK_BOT_TOKEN,
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
    }
    if (req.method === "POST" && url.pathname === "/api/download") {
      const body = await readJson(req);
      const saved = await downloadFile({
        ...deliveryFrom(body),
        name: typeof body.name === "string" ? body.name : "",
        session,
      }, deps);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        name: saved.name,
        bytes: saved.bytes == null ? null : String(saved.bytes),
        allow: saved.allow,
      }));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/object/")) {
      const id = decodeURIComponent(url.pathname.slice("/object/".length));
      if (!id || id.includes("/") || id.includes("..")) {
        send(res, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }
      try {
        const object = await deps.tatum.getObject(id);
        const lines = [];
        if (typeof object?.text === "string" && object.text.trim()) lines.push(redact(object.text));
        if (object?.checkpoint != null) lines.push(`checkpoint ${object.checkpoint}`);
        if (Number.isSafeInteger(object?.version)) lines.push(`version ${object.version}`);
        send(res, 200, "text/plain; charset=utf-8", lines.join("\n") || "unknown");
      } catch {
        send(res, 200, "text/plain; charset=utf-8", "unknown");
      }
      return;
    }
    if (url.pathname === "/mcp") {
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
      const companyId = typeof args.company === "string" ? args.company : "";
      const current = await prepareWorkspace(workspace, companyId);
      const bound = bindToolMember(message, env.SEDERUNT_MEMBER);
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
    }
    if (req.method === "POST" && url.pathname === "/api/mcp") {
      const message = await readJson(req);
      const name = message?.name ?? message?.params?.name;
      const args = message?.arguments ?? message?.params?.arguments ?? {};
      const companyId = typeof args.company === "string" ? args.company : "";
      const current = await prepareWorkspace(workspace, companyId);
      const bound = bindToolMember({ method: "tools/call", params: { arguments: args } }, env.SEDERUNT_MEMBER);
      if (bound.refusal) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(memberRefusal(bound.refusal)));
        return;
      }
      const custom = typeof name === "string" && name.includes("__");
      const result = await handleMcpRequest({
        name,
        arguments: custom
          ? { ...args, session: current }
          : { ...deliveryFrom(bound.message.params.arguments), session: current },
        _meta: message?._meta || message?.params?._meta,
      }, depsFor(workspace, companyId), await mcpCallContext(req));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    send(res, 500, "text/plain; charset=utf-8", redact(message));
  }
  });
  const closeServer = server.close.bind(server);
  server.close = function closeWithDemo(callback) {
    return stopDemoServer(workspace).then(() => new Promise((resolve, reject) => {
      closeServer((error) => {
        if (typeof callback === "function") callback(error);
        if (error) reject(error);
        else resolve();
      });
    }));
  };
  /** The start-up proof warm, when it runs. Resolves to its report or null. */
  server.proofWarm = workspace.warm || null;
  return server;
}

function saveCalendarEnv(env) {
  const file = resolve(".local/calendar-oauth.env");
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const updates = [
    ["CALENDAR_MCP_TOKEN", env.CALENDAR_MCP_TOKEN],
    ["CALENDAR_OAUTH_EXPIRES_AT", env.CALENDAR_OAUTH_EXPIRES_AT],
    ["CALENDAR_OAUTH_REFRESH_TOKEN", env.CALENDAR_OAUTH_REFRESH_TOKEN],
  ];
  for (const [key, value] of updates) {
    if (typeof value !== "string" || !value) continue;
    const lines = text.split("\n");
    let found = false;
    text = lines.map((line) => {
      if (!line.startsWith(`${key}=`)) return line;
      found = true;
      return `${key}=${value}`;
    }).join("\n");
    if (!found) text = `${text.replace(/\n?$/, "\n")}${key}=${value}\n`;
  }
  try {
    writeFileSync(file, text, { mode: 0o600 });
    chmodSync(file, 0o600);
  } catch {
    return;
  }
}

/**
 * The demo keeps its seeded memory. A configured Console serves the signed-in
 * workspace: uploads return at once and a background pass stores the bytes.
 */
function liveFiles(env, identity) {
  if (env.FILES_DEMO === "1") return createFileRuntime({ env, demo: true });
  const store = createFileStore();
  let session = null;
  const background = !process.env.VERCEL;
  const runtime = createFileRuntime({
    env,
    store,
    background,
    linkSecret: `files:${sessionSecret(env)}`,
    viewer: (req) => session.viewer(req),
  });
  session = createSessionFiles({ env, identity, store, storage: runtime.storage });
  if (background && runtime.storage) runtime.startWorker(30_000);
  return runtime;
}

function attachFiles(options, env) {
  const explicit = options.env;
  if (explicit && filesConfigured(explicit)) return true;
  // Serverless entry is not argv[1] === server.js, so isDirectRun() is false on Vercel.
  if (process.env.VERCEL && filesConfigured(env)) return true;
  return isDirectRun() && filesConfigured(env);
}

function filesConfigured(env) {
  return env.FILES_DEMO === "1" || Boolean(env.CONSOLE_API_KEY && env.CONSOLE_SERVICE_PRIVATE_KEY);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

let publicServer;
if (isDirectRun() || process.env.VERCEL) {
  loadLocalEnv();
  loadCompanyEnv();
  publicServer = createApp({
    liveLinear: true,
    calendar: createCalendarAdapter(process.env, { save: saveCalendarEnv }),
    calendarSave: saveCalendarEnv,
  });
}
if (isDirectRun() && !process.env.VERCEL && publicServer) {
  publicServer.listen(port, "127.0.0.1", () => {
    console.log(`Sederunt typed path http://127.0.0.1:${port}`);
    console.log('POST /api/typed {"text":"..."}');
    console.log("A Linear create waits until that tool's preference allows it.");
  });
}

export default publicServer;

function loadedCompany(options, deps, env, companies) {
  if (typeof options.companyLoaded === "boolean") return options.companyLoaded;
  if (companies && Object.keys(companies).length > 0) return true;
  if (deps.memory) return true;
  return Boolean(env.COMPANY_MEMWAL_KEY);
}

function displayActor(env) {
  const name = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
  return name || "Someone";
}

const ASK_MAX_CHARS = 2000;
const ASK_POLL_MS = 150;
const ASK_STREAM_MS = 50_000;

function askUser(gate, env) {
  const raw = String(gate.session?.userId || gate.session?.memberId || env.SEDERUNT_MEMBER || "local");
  return raw.replace(/[^A-Za-z0-9_.@-]/g, "_").slice(0, 120) || "local";
}

function askView({ meta, chunks }) {
  if (!meta) return null;
  return {
    id: meta.id,
    question: meta.question,
    text: chunks.join(""),
    count: chunks.length,
    status: settledStatus(meta),
    source: meta.source,
    sources: meta.sources,
    result: meta.result,
    createdAt: meta.createdAt,
    user: meta.user,
  };
}

async function askViews(store, ids) {
  return (await store.reads(ids, 0)).map(askView);
}

/**
 * Ask AI on the web. Durable streams live in the ask store (Redis in deploys), so a
 * reloaded page reads what was already written and keeps following the same answer.
 * Each signed-in person gets askLimit(env) prompts (5 by default), counted server-side.
 */
async function handleAsk(workspace, req, res, url) {
  const env = workspace.env;
  const json = (code, body) => send(res, code, "application/json; charset=utf-8", JSON.stringify(body));
  const gate = guardConsole(req, env);
  if (gate.required && !gate.session) {
    json(401, { error: "Sign in." });
    return;
  }
  const store = workspace.ask;
  const user = askUser(gate, env);
  const limit = askLimit(env);
  const live = openRouterConfig(env).enabled;
  try {
    if (req.method === "GET" && url.pathname === "/api/ask") {
      const { quota, ids } = await store.overview(user, limit);
      const asks = [];
      for (const view of await askViews(store, ids.slice().reverse())) {
        if (view && view.user === user) {
          delete view.user;
          asks.push(view);
        }
      }
      json(200, { ...quota, live, asks });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ask") {
      if (!activitySameOrigin(req)) {
        json(403, { error: "Ask from the console." });
        return;
      }
      const body = await readJson(req);
      const question = typeof body.text === "string" ? body.text.trim() : "";
      if (!question) {
        json(400, { error: "Type a question first." });
        return;
      }
      if (question.length > ASK_MAX_CHARS) {
        json(400, { error: `Keep the question under ${ASK_MAX_CHARS} characters.` });
        return;
      }
      const claimed = await store.claim(user, limit);
      if (!claimed.ok) {
        json(429, { error: "limit", limit, used: claimed.used, remaining: 0 });
        return;
      }
      let id = "";
      try {
        id = await store.create(user, question);
      } catch (error) {
        await store.refund(user).catch(() => {});
        throw error;
      }
      // Reserve a slot on the way in, then give it back unless the answer is real text.
      let refunded = false;
      const askStore = {
        ...store,
        async finish(askId, fields = {}) {
          let next = fields;
          const status = fields.status || "done";
          // The model can stream the failure sentence on a 200. That is not a kept answer.
          if (askId === id && fields.source === "openrouter") {
            const text = humanAskText((await store.chunks(askId, 0).catch(() => [])).join(""));
            if (text === ASK_UNAVAILABLE) {
              next = { ...fields, source: "unavailable", result: fields.result || { body: ASK_UNAVAILABLE } };
            }
          }
          if (askId === id && !refunded && !askSpendsQuota(next.source, next.status || status)) {
            refunded = true;
            await store.refund(user).catch(() => {});
          }
          return store.finish(askId, next);
        },
      };
      const companyId = typeof body.company === "string" ? body.company : "";
      const scope = body.workspace === "personal" ? "personal" : "company";
      const work = (async () => {
        const previous = [];
        const priorIds = (await store.list(user).catch(() => [])).filter((prior) => prior !== id).slice(0, 3).reverse();
        for (const view of await askViews(store, priorIds).catch(() => [])) {
          if (view && view.user === user && view.status === "done" && view.text && askSpendsQuota(view.source, view.status)) {
            previous.push({ question: view.question, answer: view.text });
          }
        }
        const current = await prepareWorkspace(workspace, companyId);
        const memberId = consoleBoardMember(gate.session, env, scope, "");
        const visible = (scope === "personal" ? personalBoard(current, memberId) : companyBoard(current, memberId)).decisions || [];
        const doorDeps = depsFor(workspace, companyId);
        const bot = await currentBot(workspace, req).catch(() => null);
        return runAsk({
          store: askStore,
          id,
          question,
          visible,
          history: previous,
          env,
          fetchImpl: workspace.openrouterFetch || undefined,
          botName: bot?.name || "",
          // withMemWal ask path: MemWal.recall(query) before generate.
          recall: doorDeps.memory?.recall ? async (query) => doorDeps.memory.recall(query) : undefined,
          // The signed-in board member, not a client-supplied id and not only SEDERUNT_MEMBER.
          retrieval: () => chatReply(workspace, { text: question, workspace: scope, company: companyId }, memberId),
        });
      })().catch(() => askStore.finish(id, { status: "error" }).catch(() => {}));
      if (env.VERCEL) {
        try {
          const { waitUntil } = await import("@vercel/functions");
          if (typeof waitUntil === "function") waitUntil(work);
        } catch {
          // Local runs keep the promise alive on their own.
        }
      }
      json(200, { id, limit, used: claimed.used, remaining: claimed.remaining, live });
      return;
    }
    const streamMatch = /^\/api\/ask\/([A-Za-z0-9_]+)\/stream$/.exec(url.pathname);
    if (req.method === "GET" && streamMatch) {
      const id = streamMatch[1];
      const first = await store.meta(id);
      if (!first || first.user !== user) {
        json(404, { error: "That answer is gone." });
        return;
      }
      let from = Math.max(0, Number.parseInt(url.searchParams.get("from") || "0", 10) || 0);
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      let closed = false;
      req.on("close", () => { closed = true; });
      const write = (event, data) => { if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const started = Date.now();
      let beat = Date.now();
      while (!closed) {
        const [{ meta, chunks }] = await store.reads([id], from);
        const status = settledStatus(meta);
        for (const text of chunks) {
          write("chunk", { i: from, t: text });
          from += 1;
        }
        if (status !== "streaming") {
          const quota = await store.quota(user, limit).catch(() => null);
          write("done", { status, source: meta?.source || "", sources: meta?.sources || [], result: meta?.result || null, count: from, quota });
          break;
        }
        if (Date.now() - started > ASK_STREAM_MS) {
          write("again", { from });
          break;
        }
        if (Date.now() - beat > 10_000) {
          if (!closed) res.write(": keep-alive\n\n");
          beat = Date.now();
        }
        await new Promise((done) => setTimeout(done, ASK_POLL_MS));
      }
      res.end();
      return;
    }
    json(405, { error: "Not allowed." });
  } catch {
    if (!res.headersSent) json(503, { error: "Ask AI is busy. Try again in a minute." });
    else res.end();
  }
}

/**
 * The kept-decision answer that /api/chat returns, also the Ask AI fallback.
 * trustedMember is the console board member. A body field cannot set it:
 * /api/chat forwards the JSON body, and a caller must not pick their own invite.
 */
async function chatReply(workspace, body, trustedMember = "") {
  const env = workspace.env;
  const companyId = typeof body.company === "string" ? body.company : "";
  const current = await prepareWorkspace(workspace, companyId);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const requested = typeof body.workspace === "string" ? body.workspace : "";
  const scope = requested === "personal" || requested === "company" ? requested : "";
  const before = current.decisions.length;
  if (!text) {
    return {
      body: "The question is missing.",
      decisions: before,
      stored: false,
    };
  }
  const recall = /what was decided|what happened/i.test(text) || looksLikeOpenQuestion(text);
  if (!recall) {
    return {
      body: "A decision is kept from a room.",
      decisions: before,
      stored: false,
    };
  }
  const trusted = typeof trustedMember === "string" ? trustedMember.trim() : "";
  const bound = trusted ? { ok: true, memberId: trusted } : bindMember(env, body.memberId);
  if (!bound.ok) {
    return {
      body: memberRefusal(bound.reason).body,
      decisions: before,
      stored: false,
    };
  }
  let namedRooms = roomsMatching(text, current.rooms || []);
  if (!namedRooms.length && contentWords(text).length) {
    namedRooms = decisionRoomIds(text, current.decisions || []);
    if (!namedRooms.length) {
      return {
        body: "Nothing stored matches that.",
        decisions: 0,
        stored: false,
      };
    }
  }
  if (namedRooms.length > 1) {
    const parts = [];
    const why = [];
    let learned = "";
    let matched = 0;
    for (const id of namedRooms) {
      const part = await handleUtterance({
        text,
        intent: "recall",
        door: "mcp",
        memberId: bound.memberId,
        workspace: scope,
        room: { id },
        session: current,
      }, depsFor(workspace, companyId));
      parts.push(part.body);
      if (part.learned) learned = part.learned;
      if (Array.isArray(part.why)) why.push(...part.why);
      matched += current.decisions.filter((decision) => decision.roomId === id && !decision.deleted).length;
    }
    return chatJson({
      body: parts.filter(Boolean).join("\n"),
      learned,
      why,
    }, {
      decisions: matched,
      stored: false,
    });
  }
  const namedRoom = namedRooms[0] || "";
  const result = await handleUtterance({
    text,
    intent: "recall",
    door: "mcp",
    memberId: bound.memberId,
    workspace: scope,
    room: namedRoom ? { id: namedRoom } : undefined,
    session: current,
  }, depsFor(workspace, companyId));
  const matched = namedRoom
    ? current.decisions.filter((decision) => decision.roomId === namedRoom && !decision.deleted).length
    : current.decisions.filter((decision) => !decision.deleted).length;
  return chatJson(result, {
    decisions: matched,
    stored: false,
  });
}

function chatJson(result, extra) {
  const payload = {
    body: chatAnswer(result?.body),
    ...extra,
  };
  if (typeof result?.learned === "string" && result.learned) payload.learned = result.learned;
  if (Array.isArray(result?.why) && result.why.length) payload.why = result.why;
  return payload;
}

function chatAnswer(body) {
  return String(body || "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !/^(?:preference|checkpoint) [a-z0-9-]+$/i.test(trimmed);
    })
    .join("\n");
}

function activitySameOrigin(req) {
  const type = headerValue(req.headers["content-type"]).toLowerCase();
  if (!type.includes("application/json")) return false;
  const site = headerValue(req.headers["sec-fetch-site"]).toLowerCase();
  if (site === "cross-site") return false;
  const origin = headerValue(req.headers.origin);
  if (!origin) return true;
  const host = headerValue(req.headers["x-forwarded-host"]) || headerValue(req.headers.host);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function companyKey(workspace, companyId) {
  if (!workspace.companies) return "company";
  if (companyId && workspace.companies[companyId]) return companyId;
  return Object.keys(workspace.companies)[0];
}

function sessionFor(workspace, companyId) {
  if (!workspace.companies) return workspace.session;
  const id = companyKey(workspace, companyId);
  if (!workspace.sessions.has(id)) workspace.sessions.set(id, createSession());
  return workspace.sessions.get(id);
}

function depsFor(workspace, companyId) {
  if (!workspace.companies) return workspace.deps;
  return { ...workspace.deps, memory: workspace.companies[companyKey(workspace, companyId)] };
}

async function currentBot(workspace, req) {
  const gate = guardConsole(req, workspace.env);
  let tenantId = "local";
  if (workspace.identity && gate.session?.kind === "oauth") {
    const spaces = await loadSpaceView(workspace.identity, gate.session);
    if (spaces?.activeId) tenantId = spaces.activeId;
  }
  return readBot(workspace.botPreferences, tenantId);
}

const BOARD_PROOF_WAIT_MS = 400;

/**
 * Warm the proof cache at start when a real Tatum key is set, unless
 * SEDERUNT_WARM_PROOFS=0. SEDERUNT_WARM_PROOFS=1 turns it on without a key.
 *
 * @param {Record<string, string | undefined>} env
 */
export function proofWarmOn(env) {
  const flag = String(env?.SEDERUNT_WARM_PROOFS ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return Boolean(env?.TATUM_API_KEY || env?.TATUM_MAINNET_API_KEY);
}

async function prepareWorkspace(workspace, companyId, retry = false, waitMs = 0) {
  const current = sessionFor(workspace, companyId);
  if (!workspace.companyLoaded) {
    current.readReport = { ok: true, empty: true, blocked: true };
    return current;
  }
  const id = companyKey(workspace, companyId);
  if (retry) workspace.loads.delete(id);
  // A failed or rejected index must not stick for the life of the instance.
  if (current.readReport && current.readReport.ok === false) workspace.loads.delete(id);
  if (!workspace.loads.has(id)) {
    current.readReport = undefined;
    const pending = rebuildCompanyIndex(current, depsFor(workspace, companyId)).then((report) => {
      current.readReport = report;
      if (!report?.ok) workspace.loads.delete(id);
      return report;
    }).catch(() => {
      const report = { ok: false, empty: false };
      current.readReport = report;
      workspace.loads.delete(id);
      return report;
    });
    workspace.loads.set(id, pending);
  }
  const pending = workspace.loads.get(id);
  if (!waitMs) {
    await pending;
    return current;
  }
  await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(resolve, waitMs)),
  ]);
  return current;
}

/**
 * Who the company board is read as. An OAuth user id is not a meeting
 * participant, so a company board uses SEDERUNT_MEMBER when it is set.
 * A personal board stays on the signed-in user. A passphrase session keeps
 * its own member id, and an unsigned read can still ask with ?member=.
 */
export function consoleBoardMember(session, env, workspace, requested = "") {
  const configured = typeof env?.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
  const asked = String(requested || "").trim();
  const signed = session ? (String(session.memberId || "").trim() || configured) : (asked || configured);
  if (session?.kind === "oauth" && workspace !== "personal" && configured) return configured;
  return signed;
}

async function consolePayload(workspace, current, memberId, kind = "company") {
  const open = kind === "personal" ? "personal" : "company";
  const doors = doorReport(workspace.env, workspace.linearReady === true);
  const slack = doors.slack ? "ready" : "not-set-up";
  if (!workspace.companyLoaded) {
    return {
      companyLoaded: false,
      workspace: open,
      read: "blocked",
      message: "The company account is not loaded. Add the delegate outside this page, then restart.",
      doors,
      preferences: { linear: "ask", calendar: "ask", slack: "ask" },
      slack,
      decisions: [],
      rooms: [],
      people: [],
      waiting: [],
      access: [],
      counts: { kept: 0, waiting: 0, sent: 0, failed: 0 },
      hearing: normalizeHearing(null),
    };
  }
  if (!current.readReport) {
    return {
      companyLoaded: true,
      reading: true,
      workspace: open,
      read: "reading",
      message: "",
      doors,
      preferences: { linear: "ask", calendar: "ask", slack: "ask" },
      slack,
      decisions: [],
      rooms: [],
      people: [],
      waiting: [],
      access: [],
      counts: { kept: 0, waiting: 0, sent: 0, failed: 0 },
      hearing: normalizeHearing(current.hearing),
    };
  }
  const report = current.readReport;
  const config = appConfig(workspace.env);
  if (open !== "personal") await hydrateSlackChannels(current, workspace.deps);
  const board = open === "personal" ? personalBoard(current, memberId) : companyBoard(current, memberId, { timeZone: config.timeZone, slackChannel: config.slackChannel });
  if (!report.ok) {
    return {
      companyLoaded: true,
      workspace: open,
      read: "failed",
      message: "The account could not be read. Read the account again.",
      doors,
      preferences: { linear: "ask", calendar: "ask", slack: "ask" },
      slack,
      decisions: [],
      rooms: [],
      people: [],
      waiting: [],
      access: [],
      counts: { kept: 0, waiting: 0, sent: 0, failed: 0 },
      hearing: normalizeHearing(current.hearing),
    };
  }
  const empty = report.empty && board.decisions.length === 0;
  // The board does not wait on a cold chain read. A proof still being read
  // comes back pending and the page follows it up through /api/proof.
  await readProofs(current, board, workspace.deps?.tatum, { timeoutMs: BOARD_PROOF_WAIT_MS });
  const payload = {
    companyLoaded: true,
    workspace: open,
    read: empty ? "empty" : "ok",
    message: empty ? "No decision is stored yet." : "",
    doors,
    preferences: board.preferences,
    slack,
    decisions: board.decisions,
    rooms: board.rooms,
    people: board.people,
    waiting: board.waiting,
    activity: board.activity ?? [],
    tickets: board.tickets ?? [],
    access: board.access,
    counts: board.counts,
    hearing: normalizeHearing(current.hearing),
    meetings: await calendarMeetings(workspace),
    chain: chainReport(workspace.deps?.tatum),
  };
  return payload;
}

function chainReport(tatum) {
  const log = Array.isArray(tatum?.log) ? tatum.log : [];
  const wire = log.filter((entry) => entry && entry.outcome !== "cached");
  const last = wire.length ? wire[wire.length - 1] : null;
  const calls = typeof tatum?.wireCalls === "function" ? tatum.wireCalls() : (wire.length || wireCalls(log));
  return {
    calls,
    lastMs: Number.isFinite(last?.ms) ? last.ms : null,
    checkpoint: Number.isInteger(tatum?.latestCheckpoint) ? tatum.latestCheckpoint : null,
    transport: "tatum-grpc",
  };
}

async function calendarMeetings(workspace) {
  const list = workspace.deps?.calendar?.listUpcoming;
  if (typeof list !== "function") return [];
  try {
    const rows = await list.call(workspace.deps.calendar);
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 20).map((event) => ({
      id: String(event?.id || "").slice(0, 256),
      title: String(event?.title || "Meeting").slice(0, 200),
      start: String(event?.start || ""),
      end: String(event?.end || ""),
      readOnly: event?.readOnly === true,
    })).filter((event) => /^[A-Za-z0-9_.:@-]{1,256}$/.test(event.id));
  } catch {
    return [];
  }
}

function bindMember(env, supplied) {
  const bound = bindToolMember(
    { method: "tools/call", params: { arguments: { memberId: supplied } } },
    env.SEDERUNT_MEMBER,
  );
  if (bound.refusal) return { ok: false, reason: bound.refusal };
  return { ok: true, memberId: bound.message.params.arguments.memberId };
}

async function persistRecordingStart(workspace, current, id, startedAt) {
  if (!startedAt) return;
  const room = (current?.rooms || []).find((item) => item.id === id);
  if (!room || /slack/i.test(room.platform || "")) return;
  if (typeof room.startedAt === "string" && room.startedAt) return;
  room.startedAt = startedAt;
  const memory = workspace.deps?.memory;
  if (typeof memory?.remember !== "function") return;
  try {
    await memory.remember({
      account: "company",
      kind: "room",
      text: `${room.id} meeting`,
      idempotencyKey: `${room.id}:started`,
      room: { id: room.id, kind: "meeting", platform: room.platform || "", startedAt },
    });
  } catch {
    // The start is already on the room for this process.
  }
}

async function roomMedia(workspace, id) {
  const empty = {
    state: "none",
    title: "",
    videoUrl: "",
    transcriptUrl: "",
    participantsUrl: "",
    eventsUrl: "",
    timelineUrl: "",
    metadataUrl: "",
    startedAt: "",
    duration: 0,
    lines: [],
    segments: [],
    events: [],
  };
  let current = workspace.session || { rooms: [] };
  try {
    current = await prepareWorkspace(workspace, "", false, 2000);
  } catch {
    current = workspace.session || { rooms: [] };
  }
  const room = (current.rooms || []).find((item) => item.id === id);
  const platform = typeof room?.platform === "string" ? room.platform : "";
  if (/slack/i.test(platform)) {
    const raw = String(room?.channel || room?.name || "").trim();
    const title = !raw ? "" : raw.startsWith("#") ? raw : `#${raw}`;
    return { ...empty, state: "channel", title };
  }
  workspace.mediaCache ??= new Map();
  workspace.mediaFlight ??= new Map();
  const hit = workspace.mediaCache.get(id);
  if (hit && hit.until > Date.now()) return hit.body;
  if (workspace.mediaFlight.has(id)) return workspace.mediaFlight.get(id);
  const flight = loadRoomMedia(workspace, id, current, empty);
  workspace.mediaFlight.set(id, flight);
  try {
    return await flight;
  } finally {
    workspace.mediaFlight.delete(id);
  }
}

async function loadRoomMedia(workspace, id, current, empty) {
  let bot = null;
  const reader = workspace.recall?.readBot || workspace.deps?.recall?.readBot;
  const key = typeof workspace.env.RECALL_API_KEY === "string" ? workspace.env.RECALL_API_KEY : "";
  try {
    if (typeof reader === "function") bot = await reader(id);
    else if (key && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      const response = await fetch(recallBotUrl(id), {
        headers: { authorization: `Token ${key}`, accept: "application/json" },
      });
      const text = await response.text();
      if (key && text.split(key).length > 1 && text.includes("\"authorization\"")) return empty;
      if (/media has already expired/i.test(text)) return { ...empty, state: "expired" };
      if (response.ok) bot = JSON.parse(text);
    }
  } catch {
    bot = null;
  }
  const body = mediaFromBot(bot);
  if (body.startedAt) await persistRecordingStart(workspace, current, id, body.startedAt);
  const room = (current.rooms || []).find((item) => item.id === id);
  if (body.title) {
    current.roomNames ??= {};
    if (!current.roomNames[id]) current.roomNames[id] = body.title;
    if (room && !room.name) room.name = body.title;
  }
  if (body.state !== "expired") {
    workspace.mediaCache.set(id, { until: Date.now() + (body.state === "processing" ? 15000 : 4 * 60 * 1000), body });
  }
  return body;
}

async function slackPeople(env, deps, channel) {
  if (env.SLACK_BOT_TOKEN) {
    return slackChannelMembers({ token: env.SLACK_BOT_TOKEN, channel, fetchImpl: deps.slack?.fetch });
  }
  if (typeof deps.slack?.members === "function") {
    const people = await deps.slack.members(channel);
    return Array.isArray(people) ? people.map(String).filter(Boolean) : [];
  }
  return [];
}

function fileMarks(fileNames) {
  const marks = [];
  if (!Array.isArray(fileNames)) return marks;
  for (const file of fileNames) {
    const name = typeof file?.name === "string" ? file.name.trim() : "";
    if (!name) continue;
    const slackFileId = typeof file?.slackFileId === "string" ? file.slackFileId : "";
    marks.push(`${name.toLowerCase()}::${slackFileId}`);
  }
  return marks;
}

function snapshotDecisionFiles(decisions) {
  const snap = new Map();
  for (const item of decisions ?? []) {
    if (!item?.id || item.deleted) continue;
    snap.set(item.id, new Set(fileMarks(item.fileNames)));
  }
  return snap;
}

function collectDecisionFileNames(item) {
  const names = [];
  const seen = new Set();
  if (item?.deleted || !Array.isArray(item.fileNames)) return names;
  for (const file of item.fileNames) {
    const name = typeof file?.name === "string" ? file.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function keptFileNames(decisions, beforeCount, beforeSnap) {
  const names = [];
  const seen = new Set();
  const push = (item) => {
    for (const name of collectDecisionFileNames(item)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  };
  const list = decisions ?? [];
  for (const item of list.slice(beforeCount)) push(item);
  for (const item of list) {
    if (!item?.id || item.deleted) continue;
    const prev = beforeSnap.get(item.id);
    if (!prev) continue;
    if (fileMarks(item.fileNames).some((mark) => !prev.has(mark))) push(item);
  }
  return names;
}

function keptNotice(names) {
  if (names.length === 1) return `Kept ${names[0]}.`;
  if (names.length === 2) return `Kept ${names[0]} and ${names[1]}.`;
  return `Kept ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}.`;
}

const NAMED_FILE = /\b[\w.-]+\.(?:pdf|png|docx|txt|pptx)\b/i;

function isExplicitKeep(text, fileCount) {
  if (fileCount > 0) return true;
  const line = String(text || "");
  if (/\bplease keep\b/i.test(line)) return true;
  return NAMED_FILE.test(line) && /\bkeep\b/i.test(line);
}

async function slackBytes(env, deps, file) {
  if (env.SLACK_BOT_TOKEN) return slackFileBytes({ token: env.SLACK_BOT_TOKEN, file, fetchImpl: deps.slack?.fetch });
  if (typeof deps.slack?.downloadFile === "function") return deps.slack.downloadFile(file);
  return null;
}

function withinMs(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Console copy first; when it is missing (upload failed or timed out), the
// bytes are fetched again from Slack by the stored Slack file id.
export async function storedFileBytes(session, name, deps, env = {}) {
  const decision = (session?.decisions ?? []).find((item) =>
    !item.deleted && item.fileNames?.some((file) => file?.name === name));
  const file = decision?.fileNames?.find((item) => item?.name === name);
  if (!file) return null;
  if (file.consoleFileId && typeof deps.console?.download === "function") {
    try {
      const bytes = await deps.console.download({
        id: file.consoleFileId,
        name: file.name,
        folderId: typeof file.folderId === "string" ? file.folderId : "",
      });
      if (bytes != null && bytes !== "") return String(bytes);
    } catch {
      // Fall through to Slack.
    }
  }
  if (!file.slackFileId) return null;
  try {
    const loaded = await slackBytes(env, deps, { id: file.slackFileId, name: file.name });
    return loaded?.bytes != null && loaded.bytes !== "" ? String(loaded.bytes) : null;
  } catch {
    return null;
  }
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function send(res, status, type, body, extra = {}) {
  const headers = { "content-type": type, ...extra };
  if (type.startsWith("text/html") || type.startsWith("application/json")) headers["cache-control"] = "no-store";
  res.writeHead(status, headers);
  res.end(body);
}

function redirect(res, location, extra = {}) {
  res.writeHead(302, { location, "cache-control": "no-store", ...extra });
  res.end();
}

const mediaRoot = resolve("public/media");
const mediaTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const clipRoot = resolve("public/clips");

async function sendMedia(res, pathname) {
  const name = pathname.slice("/media/".length);
  const type = mediaTypes[extname(name).toLowerCase()];
  if (!type || !/^[a-z0-9.-]+$/i.test(name)) return false;
  const file = resolve(mediaRoot, name);
  if (!file.startsWith(`${mediaRoot}/`)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=3600" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function sendClip(req, res, pathname) {
  const name = pathname.slice("/clips/".length);
  if (extname(name).toLowerCase() !== ".mp4" || !/^[a-z0-9.-]+$/i.test(name)) return false;
  const file = resolve(clipRoot, name);
  if (!file.startsWith(`${clipRoot}/`)) return false;
  let body;
  try {
    body = await readFile(file);
  } catch {
    return false;
  }
  const total = body.length;
  const headers = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { ...headers, "content-length": total });
    res.end(body);
    return true;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${total}` });
    res.end();
    return true;
  }
  const start = match[1] === "" ? 0 : Number(match[1]);
  const end = match[2] === "" ? total - 1 : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) {
    res.writeHead(416, { "content-range": `bytes */${total}` });
    res.end();
    return true;
  }
  const last = Math.min(end, total - 1);
  res.writeHead(206, {
    ...headers,
    "content-range": `bytes ${start}-${last}/${total}`,
    "content-length": last - start + 1,
  });
  res.end(body.subarray(start, last + 1));
  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function readPosted(req) {
  const raw = await readBody(req);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

/** Form fields where a repeated name (emails, roles) becomes an array. */
async function readPostedAll(req) {
  const raw = await readBody(req);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  }
  const out = {};
  for (const [key, value] of new URLSearchParams(raw).entries()) {
    if (!(key in out)) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  return out;
}

async function readRequest(req) {
  const raw = await readBody(req);
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) {
    const parsed = JSON.parse(raw || "{}");
    const company = typeof parsed.company === "string" ? parsed.company : "";
    return { ...deliveryFrom(parsed), company };
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    let room;
    const roomRaw = params.get("room");
    if (roomRaw) {
      try {
        room = JSON.parse(roomRaw);
      } catch {
        room = undefined;
      }
    }
    const people = params.get("participants");
    return deliveryFrom({
      text: params.get("text") ?? "",
      memberId: params.get("memberId") ?? undefined,
      deliveryId: params.get("deliveryId") ?? undefined,
      door: params.get("door") ?? undefined,
      room,
      participants: people ? people.split(",").map((id) => id.trim()).filter(Boolean) : undefined,
    });
  }
  return deliveryFrom({ text: raw });
}
