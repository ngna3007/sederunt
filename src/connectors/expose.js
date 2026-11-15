import { logAction, logFailure, logRequest, logResult } from "../activity.js";
import { loadSpaceView } from "../console-flow.js";
import { authorize } from "../domain/allow.js";
import { resolvePreference } from "../domain/preference.js";
import { redact } from "../domain/redact.js";
import { CALENDAR_SCOPES, calendarAccessToken } from "../calendar/mcp.js";
import { calendarFakeEnabled } from "../calendar/fake.js";
import { formsFakeEnabled } from "../mcp-forms/api.js";
import { callTool } from "./client.js";

const SECRET_FIELD = /token|secret|password|authorization|api[_-]?key|cookie|bearer/i;
const RAW_ID = /^(?:U[A-Z0-9_]{4,}|0x[0-9a-fA-F]{6,}|[0-9a-f]{16,})$/;
const TEXT_CAP = 8000;
const TOOL_LIST_MS = 10 * 60 * 1000;
const exposedCache = new Map();

/**
 * @param {string} name
 */
export function splitExposedName(name) {
  const text = String(name || "");
  const index = text.indexOf("__");
  if (index <= 0) return null;
  const slug = text.slice(0, index);
  const tool = text.slice(index + 2);
  if (!slug || !tool || tool.includes("__")) return { slug, tool };
  return { slug, tool };
}

/**
 * Enabled, unchanged tools on connected connectors, named `<slug>__<tool>`.
 *
 * @param {{ list: Function } | null | undefined} store
 * @param {string} tenantId
 */
export async function listExposedTools(store, tenantId, options = {}) {
  if (!store || !tenantId) return [];
  const connectors = await store.list(tenantId);
  const fingerprint = exposedFingerprint(connectors);
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const hit = exposedCache.get(tenantId);
  if (hit && hit.fingerprint === fingerprint && clock() - hit.at < TOOL_LIST_MS) return hit.tools;
  const tools = shapeExposedTools(connectors);
  exposedCache.set(tenantId, { at: Date.now(), fingerprint, tools });
  return tools;
}

/** Drop one tenant's tool list, or every list when the id is omitted. */
export function dropExposedTools(tenantId) {
  if (tenantId) exposedCache.delete(tenantId);
  else exposedCache.clear();
}

function exposedFingerprint(connectors) {
  return JSON.stringify((connectors || []).map((connector) => ({
    id: connector?.id || "",
    slug: connector?.slug || "",
    status: connector?.status || "",
    enabled: connector?.enabled !== false,
    tools: (connector?.tools || []).map((tool) => ({
      name: tool?.name || "",
      enabled: tool?.enabled === true,
      changed: tool?.changed === true,
      description: String(tool?.description || ""),
    })),
  })));
}

function shapeExposedTools(connectors) {
  const tools = [];
  for (const connector of connectors) {
    if (!connector || connector.status !== "connected" || connector.enabled === false) continue;
    for (const tool of connector.tools || []) {
      if (tool.enabled !== true || tool.changed === true) continue;
      tools.push({
        name: `${connector.slug}__${tool.name}`,
        description: String(tool.description || ""),
        inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object" },
        actionClass: typeof tool.actionClass === "string" ? tool.actionClass : "",
      });
    }
  }
  return tools;
}

/**
 * @param {{
 *   store?: { list: Function, openToken?: Function },
 *   tenantId?: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   session?: { preferences?: unknown[], actions?: unknown[], activity?: unknown[] },
 *   name?: string,
 *   args?: Record<string, unknown>,
 *   meta?: { confirmActionId?: string, confirmed?: boolean },
 * }} input
 */
export async function callCustomTool(input) {
  const name = String(input?.name || "");
  const split = splitExposedName(name);
  const store = input?.store;
  const tenantId = input?.tenantId || "";
  if (!split || !store || !tenantId) return unavailable(name);
  const connectors = await store.list(tenantId);
  const connector = connectors.find((item) => item.slug === split.slug);
  const tool = connector?.tools?.find((item) => item.name === split.tool);
  if (!connector || connector.status !== "connected" || connector.enabled === false || !tool || tool.enabled !== true || tool.changed === true) {
    return unavailable(name);
  }
  const preference = input.runNow === true && tool.actionClass !== "delete"
    ? "do"
    : (input.runNow === true && (input.confirmed === true || input.meta?.confirmed === true)
      ? "do"
      : preferenceFor(tool, connector.slug, input.session));
  const confirmId = confirmIdFrom(input);
  let confirmedId = "";
  if (confirmId && tool.actionClass !== "read") {
    const taken = takeConfirmation(input.session, name, confirmId);
    if (!taken) return failed(name, "That confirmation is no longer available.", "confirm");
    confirmedId = taken;
  }
  const decision = authorize({
    action: tool.actionClass === "delete" || tool.actionClass === "read" ? tool.actionClass : "write",
    tool: `mcp:${connector.slug}:${tool.name}`,
    preference,
    confirmed: Boolean(confirmedId),
    actionId: confirmedId,
    confirmActionId: confirmedId,
  });
  const summary = argumentSummary(input.args);
  if (!decision.allowed) {
    const actionId = hold(input.session, name);
    const heldAction = (input.session?.actions || []).find((row) => row?.id === actionId);
    if (heldAction && !(heldAction.revision >= 1) && typeof input.persistHold === "function") {
      await input.persistHold(heldAction);
    }
    safeLog(() => logRequest(input.session, activityInput({
      id: actionId,
      verb: "call",
      connector,
      tool,
      summary,
    })));
    return {
      held: true,
      needsConfirmation: true,
      preference: "ask",
      actionId,
      tool: name,
      actionClass: tool.actionClass,
      text: `Needs confirmation before ${name} runs.`,
    };
  }
  if (typeof connector.invoke === "function") {
    try {
      const invoked = await connector.invoke(tool.name, input.args || {});
      const row = invoked && typeof invoked === "object" ? invoked : { text: String(invoked ?? "") };
      return {
        ok: row.ok !== false,
        held: false,
        needsConfirmation: false,
        text: String(row.text || row.title || row.summary || "").slice(0, TEXT_CAP),
        tool: name,
        ...(row.id || row.identifier ? { id: row.id || row.identifier } : {}),
        ...(row.title || row.summary ? { title: row.title || row.summary } : {}),
        ...(row.url || row.link ? { url: row.url || row.link } : {}),
        ...(row.structuredContent ? { structuredContent: row.structuredContent } : row),
      };
    } catch (error) {
      const detail = String(error instanceof Error ? error.message : error || "The tool call failed.").slice(0, 240);
      return failed(name, detail || "The tool call failed.", "invoke");
    }
  }
  const calendarPreset = connector.preset === "google-calendar";
  const fakeCalendar = calendarPreset && calendarFakeEnabled(input.env);
  const fakeForms = !calendarPreset && connector.authType === "google_oauth" && formsFakeEnabled(input.env);
  let token = "";
  let headerName = connector.headerName || "Authorization";
  try {
    if (connector.authType === "google_oauth") {
      if (calendarPreset) {
        if (!fakeCalendar) {
          const opened = await takeCalendarAccess(input);
          token = opened.accessToken;
          if (!token) {
            if (opened.needsAccess) return failed(name, "Google needs you to sign in again.", "needs_access");
            return failed(name, "unauthorized: Google needs you to sign in again.", "unauthorized");
          }
        }
      } else if (!fakeForms) {
        const opened = await takeAccess(input);
        token = opened.accessToken;
        if (!token) {
          if (opened.needsAccess) return failed(name, "Google needs you to sign in again.", "needs_access");
          return failed(name, "unauthorized: Google needs you to sign in again.", "unauthorized");
        }
      }
      headerName = "Authorization";
    } else if (connector.hasToken && store.openToken) {
      const secret = await store.openToken(tenantId, connector.id);
      token = secret?.token || "";
      headerName = secret?.headerName || headerName;
    }
  } catch (error) {
    safeLog(() => logFailure(input.session, activityInput({
      id: nextId(input.session, "mcp-fail"),
      verb: "call",
      connector,
      tool,
      summary,
      error: error?.message || "Connector secrets are not configured.",
    })));
    return failed(name, error?.message || "Connector secrets are not configured.", error?.code || "secrets-key");
  }
  const invoke = (bearer) => callTool({
    url: connector.url,
    preset: connector.preset,
    token: bearer,
    headerName,
    transport: connector.transport,
    forms: input.forms,
    calendarMcp: input.calendarMcp,
    origin: input.origin,
  }, tool.name, cleanArgs(input.args), {
    env: input.env,
    timeoutMs: toolTimeout(input.timeoutMs),
    fetch: input.fetch,
    calendarMcp: input.calendarMcp,
    signal: input.signal,
    poolKey: poolKeyFor(tenantId, connector),
  });
  let bearer = token;
  let called = await invoke(bearer);
  if (!fakeForms && !fakeCalendar && connector.authType === "google_oauth" && unauthorizedTool(called)) {
    try {
      const refreshed = calendarPreset ? await takeCalendarAccess(input, true) : await takeAccess(input, true);
      if (!refreshed.accessToken && refreshed.needsAccess) {
        return failed(name, "Google needs you to sign in again.", "needs_access");
      }
      if (refreshed.accessToken) {
        bearer = refreshed.accessToken;
        called = await invoke(bearer);
      }
    } catch {
      // Keep the first unauthorized result. Do not surface a token.
    }
  }
  if (!called.ok) {
    const detail = redactToolText(called.text || called.message || "The tool call failed.", token, bearer);
    safeLog(() => logFailure(input.session, activityInput({
      id: nextId(input.session, "mcp-fail"),
      verb: tool.actionClass === "read" ? "read" : "call",
      connector,
      tool,
      summary,
      error: detail || "The tool call failed.",
    })));
    return failed(name, detail || "The tool call failed.", called.code || "protocol");
  }
  const text = redactToolText(called.text || "", token, bearer).slice(0, TEXT_CAP);
  const structuredContent = redactStructured(called.structuredContent, token, bearer);
  const verb = tool.actionClass === "read" ? "read" : "call";
  const id = nextId(input.session, "mcp-call");
  safeLog(() => {
    logAction(input.session, activityInput({ id, verb, connector, tool, summary }));
    logResult(input.session, activityInput({ id: `${id}:result`, requestId: id, verb, connector, tool, summary }));
  });
  return {
    ok: true,
    held: false,
    needsConfirmation: false,
    text,
    tool: name,
    ...(structuredContent ? { structuredContent } : {}),
  };
}

/**
 * @param {{ session?: { tenantId?: string, kind?: string }, required?: boolean }} gate
 * @param {object | null} identity
 * @param {{ soleTenantId?: Function }} store
 */
export async function resolveMcpSpace(gate, identity, store) {
  // OAuth with identity always uses membership (company over personal). Fail closed.
  if (identity && gate?.session?.kind === "oauth") {
    const view = await loadSpaceView(identity, gate.session);
    return view?.activeId || "";
  }
  if (gate?.session?.tenantId) return gate.session.tenantId;
  if (gate && gate.required === false) return "local";
  return store?.soleTenantId?.() || "";
}

function preferenceFor(tool, slug, session) {
  if (tool.actionClass === "read") return "do";
  if (tool.actionClass === "delete") return "ask";
  const prefs = session?.preferences || [];
  const key = `mcp:${slug}:${tool.name}`;
  const mcpLive = prefs.filter((pref) => pref?.tool === key && !pref.replacedBy);
  if (mcpLive.length) return resolvePreference(prefs, key, null);
  const consoleKey = consoleToolKey(slug);
  const consoleLive = consoleKey
    ? prefs.filter((pref) => pref?.tool === consoleKey && !pref.replacedBy)
    : [];
  if (consoleLive.length) return resolvePreference(prefs, consoleKey, null);
  return "ask";
}

function consoleToolKey(slug) {
  const name = String(slug || "").toLowerCase();
  if (name === "linear" || name.startsWith("linear-")) return "linear";
  if (name === "slack" || name.startsWith("slack-")) return "slack";
  if (name === "calendar" || name === "google-calendar" || name.startsWith("calendar-")) return "calendar";
  if (name === "forms" || name === "google-forms" || name.startsWith("forms-")) return "forms";
  return "";
}

function confirmIdFrom(input) {
  const fromArgs = typeof input.args?._confirm === "string" ? input.args._confirm.trim() : "";
  if (fromArgs) return fromArgs;
  if (input.meta?.confirmed === true && typeof input.meta.confirmActionId === "string") {
    return input.meta.confirmActionId.trim();
  }
  return "";
}

function takeConfirmation(session, toolName, confirmId) {
  if (!confirmId) return "";
  const found = (session?.actions || []).find((action) => action?.id === confirmId && action?.tool === toolName && action.consumed !== true);
  if (!found) return "";
  found.consumed = true;
  return found.id;
}

/**
 * The calendar-edit access token. It is not logged or returned to the client.
 *
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, fetch?: typeof fetch, calendarSave?: Function }} input
 * @param {boolean} [force]
 */
async function takeCalendarAccess(input, force = false) {
  const grants = input.googleGrants;
  const personId = input.personId;
  const tenantId = input.tenantId || "";
  if (personId && tenantId && grants && typeof grants.openAccess === "function") {
    const opened = await grants.openAccess(personId, {
      tenantId,
      force,
      scopes: CALENDAR_SCOPES,
    });
    return {
      accessToken: typeof opened?.accessToken === "string" ? opened.accessToken : "",
      needsAccess: opened?.needsAccess === true,
    };
  }
  // OAuth person consoles never fall back to deployment calendar credentials.
  if (personId && tenantId) {
    return { accessToken: "", needsAccess: true };
  }
  const accessToken = await calendarAccessToken(input.env, {
    fetch: input.fetch,
    save: input.calendarSave,
    force,
  });
  return { accessToken, needsAccess: !accessToken };
}

/**
 * @param {{ personId?: string, tenantId?: string, googleGrants?: { openAccess?: Function, accessToken?: Function } }} input
 * @param {boolean} [force]
 */
async function takeAccess(input, force = false) {
  const grants = input.googleGrants;
  const personId = input.personId;
  const tenantId = input.tenantId || "";
  if (grants && typeof grants.openAccess === "function") {
    const opened = await grants.openAccess(personId, { tenantId, force });
    return {
      accessToken: typeof opened?.accessToken === "string" ? opened.accessToken : "",
      needsAccess: opened?.needsAccess === true,
    };
  }
  const token = await grants?.accessToken(personId, { tenantId, force }) || "";
  return { accessToken: token, needsAccess: !token };
}

function unauthorizedTool(called) {
  return called?.isError === true && /^unauthorized\b/i.test(String(called.text || ""));
}

/**
 * Drop bearer values from a structured tool result. The shape stays otherwise.
 *
 * @param {unknown} value
 * @param {...string} tokens
 */
export function redactStructured(value, ...tokens) {
  if (!value || typeof value !== "object") return undefined;
  let raw = JSON.stringify(value);
  let cleaned = raw;
  for (const token of tokens) {
    if (token) cleaned = cleaned.split(token).join("");
  }
  cleaned = cleaned.replace(/\bya29\.[A-Za-z0-9._\-]+/g, "");
  cleaned = cleaned.replace(/\bBearer\s+/gi, "");
  if (cleaned === raw) return value;
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function redactToolText(text, ...tokens) {
  let out = String(text || "");
  for (const token of tokens) {
    if (token) out = out.split(token).join("");
  }
  return redact(out);
}

function hold(session, toolName) {
  if (!session) return "mcp-hold-1";
  session.actions = Array.isArray(session.actions) ? session.actions : [];
  const staged = session.actions.find((row) => row
    && row.state === "paused"
    && row.roomId
    && row.memberId
    && (row.tool === toolName || row.callName === toolName));
  if (staged) return staged.id;
  const id = `mcp-hold-${session.actions.length + 1}`;
  session.actions.push({
    id,
    tool: toolName,
    callName: toolName,
    preference: "ask",
    state: "paused",
    roomId: "",
    memberId: "",
    statement: "",
    params: {},
    inviteMemberIds: [],
    connectorId: null,
    missingFact: "",
  });
  return id;
}

function nextId(session, prefix) {
  if (!session) return `${prefix}-1`;
  session.mcpSeq = (session.mcpSeq || 0) + 1;
  return `${prefix}-${session.mcpSeq}`;
}

function unavailable(name) {
  return {
    ok: false,
    held: false,
    needsConfirmation: false,
    unavailable: true,
    tool: name,
    text: "That tool is not available.",
  };
}

function failed(name, text, code) {
  return {
    ok: false,
    held: false,
    needsConfirmation: false,
    unavailable: false,
    tool: name,
    text,
    code: code || "",
  };
}

function poolKeyFor(tenantId, connector) {
  const id = connector?.id || connector?.slug || "";
  if (!tenantId || !id) return "";
  return `${tenantId}:${id}`;
}

function toolTimeout(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  return 10000;
}

function cleanArgs(args) {
  const out = {};
  if (!args || typeof args !== "object") return out;
  for (const [key, value] of Object.entries(args)) {
    if (key === "session" || key === "memberId" || key === "company" || key === "_meta" || key === "confirmActionId" || key === "confirmed" || key === "_confirm") continue;
    if (value && typeof value === "object" && (Array.isArray(value.rooms) || Array.isArray(value.decisions) || Array.isArray(value.activity))) continue;
    out[key] = value;
  }
  return out;
}

function argumentSummary(args) {
  const source = cleanArgs(args);
  const changes = [];
  for (const field of Object.keys(source)) {
    if (changes.length >= 6) break;
    const raw = source[field];
    const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
    let shown = "set";
    if (!SECRET_FIELD.test(field) && text && !RAW_ID.test(text) && redact(text) === text) shown = text.slice(0, 80);
    changes.push({ field: field.slice(0, 40), from: "", to: shown });
  }
  return changes;
}

function activityInput({ id, requestId, verb, connector, tool, summary, error }) {
  return {
    id,
    requestId: requestId || id,
    actor: { type: "sederunt", name: "Sederunt", via: "MCP" },
    verb,
    tool: { name: String(tool?.name || ""), server: String(connector?.slug || "") },
    target: { system: String(connector?.slug || ""), type: "tool", title: String(tool?.name || "").slice(0, 80) },
    changes: summary || [],
    undo: { available: false, until: "" },
    error,
  };
}

function safeLog(run) {
  try {
    run();
  } catch {
    // A refused activity row never fails the tool call.
  }
}
