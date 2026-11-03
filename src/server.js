import { createServer } from "node:http";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { redact } from "./domain/redact.js";
import { calendarTimeZone, createCalendarAdapter } from "./calendar/mcp.js";
import { createConsoleAdapter } from "./console/upload.js";
import { createLinearClient } from "./linear/mcp.js";
import { loadLinearToken } from "./linear/token.js";
import { renderCameraPage } from "./meeting/camera.js";
import { normalizeHearing } from "./hearing.js";
import { createMeetingAdapter, mediaFromBot, meetingDoorReady, recallBotUrl, recallTranscriptDelivery, verifyRecallRequest } from "./meeting/recall.js";
import { createTatumReader } from "./tatum/get-object.js";
import { bindToolMember, handleMcpRequest, memberRefusal, mcpJsonRpc } from "./mcp.js";
import { renderConsolePage } from "./console-page.js";
import { roomsMatching } from "./room-match.js";
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
} from "./console-auth.js";
import { renderLanding } from "./landing.js";
import { loadCompanyEnv, loadLocalEnv } from "./local-env.js";
import { looksLikeOpenQuestion } from "./parse.js";
import { createSession } from "./session.js";
import { postSlackReply, slackAnswer, slackChannelMembers, slackFileBytes, slackQuestion } from "./slack/reply.js";
import { slackDelivery, verifySlackRequest } from "./slack/sign.js";
import { companyBoard, downloadFile, handleUtterance, personalBoard, readProofs, rebuildCompanyIndex, replayFailure, roomLedger, saveHearing, searchPublishedActivity, undoRecorded } from "./typed-path.js";

const port = Number(process.env.PORT || 8787);

function memoryAdapter(env = process.env, client) {
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
      return publicMemory(await rememberCompany({ ...input, client, env }));
    },
    async index() {
      const { indexCompany } = await import("./memory/company.js");
      return indexCompany({ client, env });
    },
  };
}

function publicMemory(saved) {
  return {
    ok: Boolean(saved?.ok),
    blobId: saved?.blobId ?? null,
    kind: saved?.kind ?? null,
    expiryEpoch: Number.isInteger(saved?.expiryEpoch) && saved.expiryEpoch >= 0 ? saved.expiryEpoch : null,
  };
}

/** Origin, calendar zone, and the Linear team, from the app env rather than a later process.env read. */
export function appConfig(env = {}) {
  const origin = String(env.SEDERUNT_PUBLIC_ORIGIN || "").replace(/\/$/, "");
  const linearTeam = String(env.LINEAR_TEAM || "ROW").trim() || "ROW";
  const linearWorkspace = String(env.LINEAR_WORKSPACE || "").trim();
  return { origin, timeZone: calendarTimeZone(env), linearTeam, linearWorkspace };
}

/** Adapters that do not open a socket. A live Linear client is used only after a token load that the caller opts into. */
export function defaultDeps(options = {}) {
  const env = options.env ?? process.env;
  const linearCalls = [];
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
    slack: options.slack ?? {
      async postMessage({ channel, text, thread } = {}) {
        const token = typeof env.SLACK_BOT_TOKEN === "string" ? env.SLACK_BOT_TOKEN.trim() : "";
        if (!token || !channel || !text) {
          const error = new Error("unsupported");
          error.reason = "unsupported";
          throw error;
        }
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ channel, text, thread_ts: thread || undefined }),
        });
        return response.json();
      },
    },
    tatum: options.tatum ?? createTatumReader(),
    console: options.console ?? createConsoleAdapter(),
    meeting: options.meeting ?? createMeetingAdapter(env),
    memory: options.memory === undefined ? memoryAdapter(env, options.memwal) : options.memory,
  };
  if (options.liveLinear === true) {
    deps.linear = liveLinear(deps.linear, options.loadToken, env);
  }
  deps.app = appConfig(env);
  return deps;
}

function liveLinear(stub, loadToken = loadLinearToken, env = {}) {
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
          const config = appConfig(env);
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
    calendar: Boolean(env.CALENDAR_MCP_TOKEN || env.CALENDAR_OAUTH_REFRESH_TOKEN),
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
  deps.app = appConfig(env);
  if (!options.deps && isDirectRun()) {
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
  };
  return createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
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
    if (req.method === "GET" && url.pathname === "/console/sign-in") {
      if (!consoleSecret(env)) {
        redirect(res, "/console");
        return;
      }
      const gate = guardConsole(req, env);
      if (gate.session) {
        redirect(res, safeConsoleNext(url.searchParams.get("next") || "/console"));
        return;
      }
      const reason = url.searchParams.get("reason") || "";
      send(res, 200, "text/html; charset=utf-8", renderSignInPage({
        configured: Boolean(consoleSecret(env)),
        memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
        reason: reason === "expired" || reason === "invalid" || reason === "mismatch" || reason === "missing-pass" ? reason : "",
        name: url.searchParams.get("name") || "",
        next: safeConsoleNext(url.searchParams.get("next") || "/console"),
      }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/console/sign-in") {
      const body = await readPosted(req);
      const next = safeConsoleNext(typeof body.next === "string" ? body.next : "/console");
      const secret = consoleSecret(env);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!secret) {
        send(res, 200, "text/html; charset=utf-8", renderSignInPage({
          configured: false,
          memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
          name,
          next,
        }));
        return;
      }
      const given = typeof body.passphrase === "string" ? body.passphrase : "";
      if (!given) {
        send(res, 400, "text/html; charset=utf-8", renderSignInPage({
          configured: true,
          memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
          reason: "missing-pass",
          name,
          next,
        }));
        return;
      }
      if (!passphraseMatches(given, secret)) {
        send(res, 401, "text/html; charset=utf-8", renderSignInPage({
          configured: true,
          memberSet: Boolean(String(env.SEDERUNT_MEMBER || "").trim()),
          reason: "mismatch",
          name,
          next,
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
      if (!secret || !gate.session) {
        send(res, 409, "application/json; charset=utf-8", JSON.stringify({ error: "Sign-in is not set up." }));
        return;
      }
      if (!name) {
        send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Enter a display name." }));
        return;
      }
      const token = sealSession({
        memberId: gate.session.memberId || String(env.SEDERUNT_MEMBER || "").trim(),
        name,
        exp: Date.now() + CONSOLE_SESSION_MS,
      }, secret);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ name }), {
        "set-cookie": sessionCookie(token, req, Math.floor(CONSOLE_SESSION_MS / 1000)),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/console/sign-out") {
      redirect(res, "/console/sign-in", { "set-cookie": clearedSessionCookie(req) });
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
      }, { timeZone: calendarTimeZone(env) });
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
    if (req.method === "GET" && (url.pathname === "/console" || url.pathname.startsWith("/console/"))) {
      const gate = guardConsole(req, env);
      if (gate.required && !gate.session) {
        const next = encodeURIComponent(safeConsoleNext(url.pathname + (url.search || "")));
        const reason = gate.reason === "expired" || gate.reason === "invalid" ? `&reason=${gate.reason}` : "";
        redirect(res, `/console/sign-in?next=${next}${reason}`);
        return;
      }
      const doors = doorReport(env, false);
      const roomPath = /^\/console\/rooms\/([^/]+)$/.exec(url.pathname);
      const consolePage = url.pathname === "/console"
        || url.pathname === "/console/rooms"
        || url.pathname === "/console/history"
        || url.pathname === "/console/decisions"
        || url.pathname === "/console/chat"
        || url.pathname === "/console/people"
        || url.pathname === "/console/account"
        || url.pathname === "/console/status";
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
      send(res, status, "text/html; charset=utf-8", renderConsolePage({
        meeting: doors.meeting,
        meetingSetup: !env.SEDERUNT_PUBLIC_ORIGIN
          ? "Set SEDERUNT_PUBLIC_ORIGIN to a public https address, then restart."
          : !env.RECALL_API_KEY
            ? "Set RECALL_API_KEY, then restart."
            : !env.RECALL_WEBHOOK_SECRET
              ? "Set RECALL_WEBHOOK_SECRET to the Recall workspace verification secret, then restart."
              : "Check that SEDERUNT_PUBLIC_ORIGIN is a public https address, then restart.",
        slackReady: Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_BOT_TOKEN),
        signedIn: Boolean(gate.session),
        accountMember: String(env.SEDERUNT_MEMBER || "").trim(),
        accountName: gate.session?.name?.trim() || String(env.SEDERUNT_MEMBER || "").trim(),
        accountLine: gate.session ? "Owner" : "Sign-in is not set up",
        accountExpiry: gate.session?.exp || 0,
        calendarTimeZone: calendarTimeZone(env),
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
      const requested = (url.searchParams.get("member") || "").trim();
      const configured = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
      const memberId = gate.session ? (gate.session.memberId || configured) : (requested || configured);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        memberId,
        url.searchParams.get("workspace") || "",
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
      const configured = typeof env.SEDERUNT_MEMBER === "string" ? env.SEDERUNT_MEMBER.trim() : "";
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        gate.session ? (gate.session.memberId || configured) : configured,
        url.searchParams.get("workspace") || "",
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
      const meetingUrl = typeof body.url === "string" ? body.url : "";
      let join = "not-configured";
      if (!doorReport(env, workspace.linearReady === true).walk) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ join }));
        return;
      }
      let botId = "";
      if (deps.meeting?.join) {
        try {
          const ready = await prepareWorkspace(workspace, "");
          const guest = normalizeHearing(ready?.hearing).name;
          const sent = await deps.meeting.join({ url: meetingUrl, name: guest });
          join = "sent";
          botId = typeof sent?.id === "string" ? sent.id : "";
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          join = message === "Meeting join is not configured" ? "not-configured" : "failed";
        }
      }
      if (join === "sent" && workspace.companyLoaded) {
        const platform = meetingPlatform(meetingUrl);
        if (platform) {
          try {
            const current = await prepareWorkspace(workspace, "");
            await handleUtterance({
              session: current,
              openedRoom: { platform, id: botId },
            }, depsFor(workspace, ""));
          } catch {
            // The door already sent the bot. A missed record does not change that word.
          }
        }
      }
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ join }));
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
          const delivery = recallTranscriptDelivery(JSON.parse(raw || "{}"));
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
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJson(req);
      const companyId = typeof body.company === "string" ? body.company : "";
      const current = await prepareWorkspace(workspace, companyId);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const requested = typeof body.workspace === "string" ? body.workspace : "";
      const scope = requested === "personal" || requested === "company" ? requested : "";
      const before = current.decisions.length;
      if (!text) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          body: "The question is missing.",
          decisions: before,
          stored: false,
        }));
        return;
      }
      const recall = /what was decided|what happened/i.test(text) || looksLikeOpenQuestion(text);
      if (!recall) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          body: "A decision is kept from a room.",
          decisions: before,
          stored: false,
        }));
        return;
      }
      const bound = bindMember(env, body.memberId);
      if (!bound.ok) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          body: memberRefusal(bound.reason).body,
          decisions: before,
          stored: false,
        }));
        return;
      }
      const namedRooms = roomsMatching(text, current.rooms || []);
      if (namedRooms.length > 1) {
        const parts = [];
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
          matched += current.decisions.filter((decision) => decision.roomId === id && !decision.deleted).length;
        }
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          body: chatAnswer(parts.filter(Boolean).join("\n")),
          decisions: matched,
          stored: false,
        }));
        return;
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
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        body: chatAnswer(result.body),
        decisions: matched,
        stored: false,
      }));
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
      const noise = subtype && subtype !== "file_share" && subtype !== "message_deleted" && subtype !== "huddle";
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
      const liveAck = parsed.type === "event_callback" && Boolean(env.SLACK_BOT_TOKEN) && !deps.slack;
      const slackWork = (async () => {
      const current = await prepareWorkspace(workspace, companyId);
      try {
        const delivery = slackDelivery(event);
        const question = delivery.intent !== "delete" && slackQuestion(delivery.text);
        const huddle = delivery.room?.kind === "huddle" || delivery.room?.source === "slack-huddle";
        let storedFile = null;
        if (!question && delivery.intent !== "delete" && !huddle) {
          const channel = delivery.room?.askChannel || "";
          const people = await slackPeople(env, deps, channel);
          if (!people.length) {
            replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
              body: "The channel has not sent who is there.",
              decisions: current.decisions.filter((item) => !item.deleted).length,
            }));
            return;
          }
          delivery.participants = people;
          delivery.room.memberIds = people;
          if (delivery.file) {
            const loaded = await slackBytes(env, deps, delivery.file);
            storedFile = loaded;
            if (!loaded?.bytes) {
              if (env.SLACK_BOT_TOKEN && channel) {
                await postSlackReply({
                  token: env.SLACK_BOT_TOKEN,
                  fetchImpl: deps.slack?.fetch,
                  channel,
                  text: "The file did not arrive.",
                });
              }
              replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
                body: "The file did not arrive.",
                decisions: current.decisions.filter((item) => !item.deleted).length,
              }));
              return;
            }
            delivery.file = loaded;
          }
        }
        const result = await handleUtterance({
          ...delivery,
          intent: delivery.intent === "delete" ? "delete" : (question ? "recall" : undefined),
          session: current,
        }, depsFor(workspace, companyId));
        const repeat = result?.allow === "duplicate-delivery" || result?.outcome === "duplicate-delivery" || result?.outcome === "duplicate";
        if (!question && storedFile?.name && !repeat && result?.allow !== "not-invited" && result?.allow !== "missing-member" && env.SLACK_BOT_TOKEN) {
          const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
          if (channel) {
            await postSlackReply({
              token: env.SLACK_BOT_TOKEN,
              fetchImpl: deps.slack?.fetch,
              channel,
              text: `Kept ${storedFile.name}.`,
            });
          }
        }
        if (question && result?.body && !repeat && result.allow !== "not-invited" && result.allow !== "missing-member") {
          const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
          const answer = slackAnswer(result.visible, delivery.text);
          const bytes = answer.file ? await consoleFileBytes(current, answer.file, deps) : null;
          const reply = {
            channel,
            text: answer.text,
            file: answer.file && bytes != null ? { name: answer.file, bytes } : undefined,
            thread: typeof event.thread_ts === "string" ? event.thread_ts : "",
          };
          if (typeof deps.slack?.postMessage === "function") await deps.slack.postMessage(reply);
          if (env.SLACK_BOT_TOKEN) {
            await postSlackReply({
              token: env.SLACK_BOT_TOKEN,
              fetchImpl: deps.slack?.fetch,
              channel: reply.channel,
              text: reply.text,
              thread: reply.thread,
              file: reply.file,
            });
          }
        }
        replyHttp(200, "application/json; charset=utf-8", JSON.stringify({
          body: question ? chatAnswer(result.body) : result.body,
          decisions: current.decisions.filter((item) => item.account !== "personal" && item.kind !== "note" && !item.deleted).length,
          posted: question === true && !repeat,
        }));
      } catch {
        replyHttp(500, "text/plain; charset=utf-8", "slack event failed");
      }
      })();
      if (liveAck) {
        try {
          const { waitUntil } = await import("@vercel/functions");
          if (typeof waitUntil === "function") waitUntil(slackWork);
        } catch {
          // Local Node has no request context. Awaiting slackWork still finishes the reply.
        }
        replyHttp(200, "application/json; charset=utf-8", JSON.stringify({ slack: "accepted" }));
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
      const outcome = await mcpJsonRpc(bound.message, current, depsFor(workspace, companyId));
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
      const result = await handleMcpRequest({
        name,
        arguments: { ...deliveryFrom(bound.message.params.arguments), session: current },
      }, depsFor(workspace, companyId));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    send(res, 500, "text/plain; charset=utf-8", redact(message));
  }
  });
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

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

let publicServer;
if (isDirectRun() || process.env.VERCEL) {
  loadLocalEnv();
  loadCompanyEnv();
  publicServer = createApp({ liveLinear: true, calendar: createCalendarAdapter(process.env, { save: saveCalendarEnv }) });
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

function chatAnswer(body) {
  return String(body || "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("preference ") && !trimmed.startsWith("checkpoint ");
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

async function prepareWorkspace(workspace, companyId, retry = false, waitMs = 0) {
  const current = sessionFor(workspace, companyId);
  if (!workspace.companyLoaded) {
    current.readReport = { ok: true, empty: true, blocked: true };
    return current;
  }
  const id = companyKey(workspace, companyId);
  if (retry) workspace.loads.delete(id);
  if (!workspace.loads.has(id)) {
    const pending = rebuildCompanyIndex(current, depsFor(workspace, companyId)).then((report) => {
      current.readReport = report;
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
      preferences: { linear: "ask", calendar: "ask" },
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
      preferences: { linear: "ask", calendar: "ask" },
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
  const board = open === "personal" ? personalBoard(current, memberId) : companyBoard(current, memberId, { timeZone: calendarTimeZone(workspace.env) });
  if (!report.ok) {
    return {
      companyLoaded: true,
      workspace: open,
      read: "failed",
      message: "The account could not be read. Read the account again.",
      doors,
      preferences: { linear: "ask", calendar: "ask" },
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
  await readProofs(current, board, workspace.deps?.tatum);
  return {
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
  };
}

function bindMember(env, supplied) {
  const bound = bindToolMember(
    { method: "tools/call", params: { arguments: { memberId: supplied } } },
    env.SEDERUNT_MEMBER,
  );
  if (bound.refusal) return { ok: false, reason: bound.refusal };
  return { ok: true, memberId: bound.message.params.arguments.memberId };
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

async function slackBytes(env, deps, file) {
  if (env.SLACK_BOT_TOKEN) return slackFileBytes({ token: env.SLACK_BOT_TOKEN, file, fetchImpl: deps.slack?.fetch });
  if (typeof deps.slack?.downloadFile === "function") return deps.slack.downloadFile(file);
  return null;
}

async function consoleFileBytes(session, name, deps) {
  const decision = (session?.decisions ?? []).find((item) =>
    !item.deleted && item.fileNames?.some((file) => file?.name === name));
  const file = decision?.fileNames?.find((item) => item?.name === name);
  if (!file || typeof deps.console?.download !== "function") return null;
  try {
    const bytes = await deps.console.download({ id: file.consoleFileId, name: file.name });
    return bytes == null || bytes === "" ? null : String(bytes);
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
