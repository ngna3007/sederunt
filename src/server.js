import { createServer } from "node:http";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { redact } from "./domain/redact.js";
import { createCalendarAdapter } from "./calendar/mcp.js";
import { createConsoleAdapter } from "./console/upload.js";
import { createLinearClient } from "./linear/mcp.js";
import { loadLinearToken } from "./linear/token.js";
import { CAMERA_PAGE } from "./meeting/camera.js";
import { createMeetingAdapter, meetingDoorReady, recallTranscriptDelivery, verifyRecallRequest } from "./meeting/recall.js";
import { createTatumReader } from "./tatum/get-object.js";
import { handleMcpRequest, mcpJsonRpc } from "./mcp.js";
import { renderConsolePage } from "./console-page.js";
import { renderLanding } from "./landing.js";
import { loadLocalEnv } from "./local-env.js";
import { looksLikeOpenQuestion } from "./parse.js";
import { createSession } from "./session.js";
import { postSlackReply, slackAnswer, slackQuestion } from "./slack/reply.js";
import { slackDelivery, verifySlackRequest } from "./slack/sign.js";
import { companyBoard, downloadFile, handleUtterance, personalBoard, readProofs, rebuildCompanyIndex, roomLedger } from "./typed-path.js";

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
    },
    calendar: options.calendar ?? createCalendarAdapter(),
    tatum: options.tatum ?? createTatumReader(),
    console: options.console ?? createConsoleAdapter(),
    meeting: options.meeting ?? createMeetingAdapter(),
    memory: options.memory === undefined ? memoryAdapter(env, options.memwal) : options.memory,
  };
  if (options.liveLinear === true) {
    deps.linear = liveLinear(deps.linear, options.loadToken);
  }
  return deps;
}

function liveLinear(stub, loadToken = loadLinearToken) {
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
  };
  function pendingClient() {
    if (!pending) {
      pending = Promise.resolve().then(() => {
        try {
          const token = loadToken();
          if (!token) return stub;
          return createLinearClient(token);
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
  return {
    meeting: meetingDoorReady(env),
    calendar: Boolean(env.CALENDAR_MCP_TOKEN || env.CALENDAR_OAUTH_REFRESH_TOKEN),
    linear: linearReady === true,
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
    if (req.method === "GET" && url.pathname === "/console") {
      const doors = doorReport(env, false);
      send(res, 200, "text/html; charset=utf-8", renderConsolePage({
        meeting: doors.meeting,
        slackReady: Boolean(env.SLACK_SIGNING_SECRET),
      }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/meeting") {
      send(res, 200, "text/html; charset=utf-8", CAMERA_PAGE);
      return;
    }
    if (req.method === "GET" && url.pathname === "/room") {
      res.writeHead(302, { location: "/console", "cache-control": "no-store" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/console") {
      const companyId = url.searchParams.get("company") || "";
      const current = await prepareWorkspace(workspace, companyId);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        url.searchParams.get("member") || "",
        url.searchParams.get("workspace") || "",
      )));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/console/read") {
      const companyId = url.searchParams.get("company") || "";
      const current = await prepareWorkspace(workspace, companyId, true);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(await consolePayload(
        workspace,
        current,
        "",
        url.searchParams.get("workspace") || "",
      )));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/ready") {
      const report = doorReport(process.env, linearReady());
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
      if (!meetingDoorReady(env)) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ join }));
        return;
      }
      if (deps.meeting?.join) {
        try {
          await deps.meeting.join({ url: meetingUrl });
          join = "sent";
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
              openedRoom: { platform },
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
      const result = await handleUtterance({
        text,
        intent: "recall",
        door: "mcp",
        memberId: typeof body.memberId === "string" ? body.memberId : "",
        workspace: scope,
        session: current,
      }, depsFor(workspace, companyId));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        body: result.body,
        decisions: current.decisions.length,
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
      const current = await prepareWorkspace(workspace, companyId);
      const event = parsed.event && typeof parsed.event === "object" ? parsed.event : parsed;
      if (event.bot_id || event.subtype === "bot_message") {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ slack: "ignored" }));
        return;
      }
      const delivery = slackDelivery(event);
      const question = delivery.intent !== "delete" && slackQuestion(delivery.text);
      const result = await handleUtterance({
        ...delivery,
        intent: delivery.intent === "delete" ? "delete" : (question ? "recall" : undefined),
        session: current,
      }, depsFor(workspace, companyId));
      if (question && result?.body && result.allow !== "not-invited" && result.allow !== "missing-member") {
        const channel = delivery.room?.askChannel || (typeof event.channel === "string" ? event.channel : "");
        const answer = slackAnswer(result.visible, delivery.text, result.body);
        const reply = {
          channel,
          text: answer.text,
          file: answer.file,
          thread: typeof event.thread_ts === "string" ? event.thread_ts : "",
        };
        if (typeof deps.slack?.postMessage === "function") await deps.slack.postMessage(reply);
        else await postSlackReply({ token: env.SLACK_BOT_TOKEN, ...reply });
      }
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        body: result.body,
        decisions: current.decisions.filter((item) => item.account !== "personal" && item.kind !== "note" && !item.deleted).length,
        posted: question === true,
      }));
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
      const outcome = await mcpJsonRpc(message, current, depsFor(workspace, companyId));
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
      const result = await handleMcpRequest({
        name,
        arguments: { ...deliveryFrom(args), session: current },
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

if (isDirectRun()) {
  loadLocalEnv();
  const server = createApp({ liveLinear: true, calendar: createCalendarAdapter(process.env, { save: saveCalendarEnv }) });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Sederunt typed path http://127.0.0.1:${port}`);
    console.log('POST /api/typed {"text":"..."}');
    console.log("A Linear create waits until that tool's preference allows it.");
  });
}

function loadedCompany(options, deps, env, companies) {
  if (typeof options.companyLoaded === "boolean") return options.companyLoaded;
  if (companies && Object.keys(companies).length > 0) return true;
  if (deps.memory) return true;
  return Boolean(env.COMPANY_MEMWAL_KEY);
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

async function prepareWorkspace(workspace, companyId, retry = false) {
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
  await workspace.loads.get(id);
  return current;
}

async function consolePayload(workspace, current, memberId, kind = "company") {
  const open = kind === "personal" ? "personal" : "company";
  const doors = doorReport(workspace.env, workspace.linearReady === true);
  const slack = workspace.env.SLACK_SIGNING_SECRET ? "ready" : "not-set-up";
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
    };
  }
  const report = current.readReport ?? { ok: true, empty: true };
  const board = open === "personal" ? personalBoard(current, memberId) : companyBoard(current, memberId);
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
    access: board.access,
    counts: board.counts,
  };
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function send(res, status, type, body) {
  const headers = { "content-type": type };
  if (type.startsWith("text/html") || type.startsWith("application/json")) headers["cache-control"] = "no-store";
  res.writeHead(status, headers);
  res.end(body);
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
