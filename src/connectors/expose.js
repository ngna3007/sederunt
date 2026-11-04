import { logAction, logFailure, logRequest, logResult } from "../activity.js";
import { loadSpaceView } from "../console-flow.js";
import { authorize } from "../domain/allow.js";
import { resolvePreference } from "../domain/preference.js";
import { redact } from "../domain/redact.js";
import { formsFakeEnabled } from "../mcp-forms/api.js";
import { callTool } from "./client.js";

const SECRET_FIELD = /token|secret|password|authorization|api[_-]?key|cookie|bearer/i;
const RAW_ID = /^(?:U[A-Z0-9_]{4,}|0x[0-9a-fA-F]{6,}|[0-9a-f]{16,})$/;
const TEXT_CAP = 8000;

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
export async function listExposedTools(store, tenantId) {
  if (!store || !tenantId) return [];
  const connectors = await store.list(tenantId);
  const tools = [];
  for (const connector of connectors) {
    if (!connector || connector.status !== "connected" || connector.enabled === false) continue;
    for (const tool of connector.tools || []) {
      if (tool.enabled !== true || tool.changed === true) continue;
      tools.push({
        name: `${connector.slug}__${tool.name}`,
        description: String(tool.description || ""),
        inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object" },
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
  const preference = preferenceFor(tool, connector.slug, input.session);
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
  const fakeForms = connector.authType === "google_oauth" && formsFakeEnabled(input.env);
  let token = "";
  let headerName = connector.headerName || "Authorization";
  try {
    if (connector.authType === "google_oauth") {
      if (!fakeForms) {
        token = await input.googleGrants?.accessToken(input.personId) || "";
        if (!token) return failed(name, "unauthorized: Google needs you to sign in again.", "unauthorized");
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
    origin: input.origin,
  }, tool.name, cleanArgs(input.args), { env: input.env, timeoutMs: 10000 });
  let bearer = token;
  let called = await invoke(bearer);
  if (!fakeForms && connector.authType === "google_oauth" && unauthorizedTool(called)) {
    try {
      const refreshed = await input.googleGrants?.accessToken(input.personId, { force: true }) || "";
      if (refreshed) {
        bearer = refreshed;
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
  const verb = tool.actionClass === "read" ? "read" : "call";
  const id = nextId(input.session, "mcp-call");
  safeLog(() => {
    logAction(input.session, activityInput({ id, verb, connector, tool, summary }));
    logResult(input.session, activityInput({ id: `${id}:result`, requestId: id, verb, connector, tool, summary }));
  });
  return { ok: true, held: false, needsConfirmation: false, text, tool: name };
}

/**
 * @param {{ session?: { tenantId?: string, kind?: string }, required?: boolean }} gate
 * @param {object | null} identity
 * @param {{ soleTenantId?: Function }} store
 */
export async function resolveMcpSpace(gate, identity, store) {
  if (gate?.session?.tenantId) return gate.session.tenantId;
  if (identity && gate?.session?.kind === "oauth") {
    const view = await loadSpaceView(identity, gate.session);
    if (view?.activeId) return view.activeId;
  }
  if (gate && gate.required === false) return "local";
  return store?.soleTenantId?.() || "";
}

function preferenceFor(tool, slug, session) {
  if (tool.actionClass === "read") return "do";
  if (tool.actionClass === "delete") return "ask";
  const key = `mcp:${slug}:${tool.name}`;
  const live = (session?.preferences || []).filter((pref) => pref?.tool === key && !pref.replacedBy);
  if (!live.length) return "ask";
  return resolvePreference(session.preferences, key, null);
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

function unauthorizedTool(called) {
  return called?.isError === true && /^unauthorized\b/i.test(String(called.text || ""));
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
  const id = `mcp-hold-${session.actions.length + 1}`;
  session.actions.push({ id, tool: toolName, preference: "ask" });
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
