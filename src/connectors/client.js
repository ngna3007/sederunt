import { Client, InMemoryTransport, SSEClientTransport, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { calendarFakeEnabled } from "../calendar/fake.js";
import { runWithFormsContext } from "../mcp-forms/context.js";
import { createFormsMcpServer } from "../mcp-forms/server.js";
import { isGoogleCalendarPreset } from "./builtin-calendar.js";
import { isBuiltinGoogleForms } from "./builtin-forms.js";
import { connectorError, connectorMessage, readableUpstreamMessage } from "./errors.js";
import { guardConnectorUrl } from "./url-guard.js";
import { pinnedFetch } from "./pinned-fetch.js";

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_PAGES = 64;
const MAX_HOPS = 3;

/**
 * @param {{ url: string, transport?: string, auth?: { token?: string, headerName?: string }, token?: string, headerName?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number, lookup?: Function, fetch?: typeof fetch }} input
 */
export async function testConnection(input) {
  const started = Date.now();
  const timeoutMs = positiveTimeout(input?.timeoutMs);
  try {
    if (isBuiltinGoogleForms(input)) {
      let payload;
      await withTimeout(timeoutMs, async () => {
        payload = await withBuiltinClient(input, timeoutMs, async ({ client, transport }) => ({
          serverInfo: readServerInfo(client),
          protocolVersion: transport.protocolVersion || null,
          tools: await listPages(client, timeoutMs),
        }));
      });
      return {
        ok: true,
        serverInfo: payload.serverInfo,
        protocolVersion: payload.protocolVersion,
        tools: payload.tools,
        latencyMs: Date.now() - started,
        code: "",
        message: "",
      };
    }
    if (useFakeCalendar(input)) {
      let payload;
      await withTimeout(timeoutMs, async () => {
        payload = await withCalendarClient(input, timeoutMs, async ({ client, transport }) => ({
          serverInfo: readServerInfo(client),
          protocolVersion: transport.protocolVersion || null,
          tools: await listPages(client, timeoutMs),
        }));
      });
      return {
        ok: true,
        serverInfo: payload.serverInfo,
        protocolVersion: payload.protocolVersion,
        tools: payload.tools,
        latencyMs: Date.now() - started,
        code: "",
        message: "",
      };
    }
    const url = await guardConnectorUrl(input?.url, guardOptions(input));
    const auth = authFrom(input);
    const tools = [];
    let serverInfo = null;
    let protocolVersion = null;
    const preferSse = input?.transport === "sse";
    let upstream = "";
    const run = async (signal) => {
      if (!preferSse) {
        try {
          const opened = await openClient(url, auth, input, signal, "streamable_http", timeoutMs);
          try {
            serverInfo = readServerInfo(opened.client);
            protocolVersion = opened.transport.protocolVersion || null;
            tools.push(...await listPages(opened.client, timeoutMs));
            return;
          } finally {
            await opened.client.close().catch(() => {});
          }
        } catch (error) {
          upstream = rememberUpstream(error, upstream);
          if (classify(error) !== "protocol") throw error;
        }
      }
      let opened;
      try {
        opened = await openClient(url, auth, input, signal, "sse", timeoutMs);
      } catch (error) {
        upstream = rememberUpstream(error, upstream);
        throw carryUpstream(error, upstream);
      }
      try {
        serverInfo = readServerInfo(opened.client);
        protocolVersion = opened.transport.protocolVersion || null;
        tools.push(...await listPages(opened.client, timeoutMs));
      } catch (error) {
        upstream = rememberUpstream(error, upstream);
        throw carryUpstream(error, upstream);
      } finally {
        await opened.client.close().catch(() => {});
      }
    };
    await withTimeout(timeoutMs, run);
    return {
      ok: true,
      serverInfo,
      protocolVersion,
      tools,
      latencyMs: Date.now() - started,
      code: "",
      message: "",
    };
  } catch (error) {
    const code = classify(error);
    return {
      ok: false,
      serverInfo: null,
      protocolVersion: null,
      tools: [],
      latencyMs: Date.now() - started,
      code,
      message: failureMessage(code, error),
    };
  }
}

/**
 * @param {{ url: string, token?: string, headerName?: string, authType?: string }} connector
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 * @param {{ env?: NodeJS.ProcessEnv, timeoutMs?: number, lookup?: Function, fetch?: typeof fetch, transport?: string }} [options]
 */
/**
 * Tool definitions for a connector. The built-in Forms preset is read in-process.
 *
 * @param {{ url?: string, preset?: string, forms?: object, origin?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number, token?: string, fetch?: typeof fetch, lookup?: Function }} input
 */
export async function listTools(input) {
  const timeoutMs = positiveTimeout(input?.timeoutMs);
  if (isBuiltinGoogleForms(input)) {
    let tools = [];
    await withTimeout(timeoutMs, async () => {
      tools = await withBuiltinClient(input, timeoutMs, ({ client }) => listPages(client, timeoutMs));
    });
    return tools;
  }
  if (useFakeCalendar(input)) {
    let tools = [];
    await withTimeout(timeoutMs, async () => {
      tools = await withCalendarClient(input, timeoutMs, ({ client }) => listPages(client, timeoutMs));
    });
    return tools;
  }
  const tested = await testConnection(input);
  if (!tested.ok) throw connectorError(tested.code || "protocol");
  return tested.tools;
}

export async function callTool(connector, name, args = {}, options = {}) {
  const timeoutMs = positiveTimeout(options.timeoutMs);
  const target = {
    url: connector?.url,
    preset: connector?.preset || options.preset,
    token: connector?.token || options.token || "",
    forms: options.forms || connector?.forms,
    calendarMcp: options.calendarMcp || connector?.calendarMcp,
    origin: options.origin || connector?.origin,
    env: options.env,
  };
  try {
    if (isBuiltinGoogleForms(target)) {
      let result = null;
      await withTimeout(timeoutMs, async () => {
        result = await withBuiltinClient(target, timeoutMs, ({ client }) => client.callTool({
          name,
          arguments: args && typeof args === "object" ? args : {},
        }, { timeout: timeoutMs }));
      });
      return describedCall(result);
    }
    if (useFakeCalendar(target)) {
      let result = null;
      await withTimeout(timeoutMs, async () => {
        result = await withCalendarClient(target, timeoutMs, ({ client }) => client.callTool({
          name,
          arguments: args && typeof args === "object" ? args : {},
        }, { timeout: timeoutMs }));
      });
      return describedCall(result);
    }
    const url = await guardConnectorUrl(connector?.url, guardOptions({ ...connector, ...options, preset: target.preset }));
    const auth = authFrom({ ...connector, ...options, token: connector?.token || "" });
    let result = null;
    await withTimeout(timeoutMs, async (signal) => {
      const kinds = options.transport === "sse" ? ["sse"] : ["streamable_http", "sse"];
      let last;
      let upstream = "";
      for (const kind of kinds) {
        try {
          const opened = await openClient(url, auth, { ...options, env: options.env, preset: target.preset }, signal, kind, timeoutMs);
          try {
            result = await opened.client.callTool({ name, arguments: args && typeof args === "object" ? args : {} }, { timeout: timeoutMs });
            return;
          } finally {
            await opened.client.close().catch(() => {});
          }
        } catch (error) {
          last = error;
          upstream = rememberUpstream(error, upstream);
          if (classify(error) !== "protocol" || kind === "sse") throw carryUpstream(error, upstream);
        }
      }
      throw carryUpstream(last, upstream);
    });
    return describedCall(result);
  } catch (error) {
    const code = classify(error);
    const message = failureMessage(code, error);
    return {
      ok: false,
      text: message !== connectorMessage(code) ? message : "",
      isError: true,
      code,
      message,
    };
  }
}

function useFakeCalendar(input) {
  return isGoogleCalendarPreset(input) && calendarFakeEnabled(input?.env);
}

function guardOptions(input) {
  return {
    env: input?.env,
    lookup: input?.lookup,
    allowCalendarPreset: isGoogleCalendarPreset(input),
  };
}

function formsServiceOf(input) {
  if (input?.forms?.service && typeof input.forms.service.createForm === "function") return input.forms.service;
  if (typeof input?.forms?.createForm === "function") return input.forms;
  return null;
}

function tokenFrom(input) {
  if (typeof input?.auth?.token === "string" && input.auth.token) return input.auth.token;
  if (typeof input?.token === "string") return input.token;
  return "";
}

/**
 * The person's access token stays in the request context. This does not open a socket.
 *
 * @param {object} input
 * @param {number} timeoutMs
 * @param {(opened: { client: Client, transport: InMemoryTransport }) => Promise<unknown>} run
 */
/**
 * Fake Calendar MCP. This does not open a socket.
 *
 * @param {object} input
 * @param {number} timeoutMs
 * @param {(opened: { client: Client, transport: InMemoryTransport }) => Promise<unknown>} run
 */
async function withCalendarClient(input, timeoutMs, run) {
  const factory = input?.calendarMcp;
  if (!factory || typeof factory.server !== "function") throw connectorError("protocol");
  const server = factory.server();
  return withLinkedServer(server, timeoutMs, run);
}

async function withBuiltinClient(input, timeoutMs, run) {
  const service = formsServiceOf(input);
  if (!service) throw connectorError("protocol");
  const context = {
    token: tokenFrom(input),
    origin: typeof input?.origin === "string" && input.origin ? input.origin : "http://127.0.0.1",
  };
  const bound = {
    createForm: (args) => runWithFormsContext(context, () => service.createForm(args)),
    addQuestions: (args) => runWithFormsContext(context, () => service.addQuestions(args)),
    getForm: (args) => runWithFormsContext(context, () => service.getForm(args)),
    listResponses: (args) => runWithFormsContext(context, () => service.listResponses(args)),
    publishForm: (args) => runWithFormsContext(context, () => service.publishForm(args)),
  };
  const server = createFormsMcpServer(bound);
  return withLinkedServer(server, timeoutMs, run);
}

/**
 * @param {{ connect: Function, close: Function }} server
 * @param {number} timeoutMs
 * @param {(opened: { client: Client, transport: InMemoryTransport }) => Promise<unknown>} run
 */
async function withLinkedServer(server, timeoutMs, run) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "sederunt", version: "0.0.0" },
    { versionNegotiation: { mode: "legacy" } },
  );
  const pendingServer = server.connect(serverTransport);
  const pendingClient = client.connect(clientTransport, { timeout: timeoutMs });
  pendingServer.catch(() => {});
  pendingClient.catch(() => {});
  try {
    await Promise.all([pendingServer, pendingClient]);
    return await run({ client, transport: clientTransport });
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

function positiveTimeout(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  return DEFAULT_TIMEOUT_MS;
}

function authFrom(input) {
  const token = typeof input?.auth?.token === "string" ? input.auth.token : (typeof input?.token === "string" ? input.token : "");
  const headerName = String(input?.auth?.headerName || input?.headerName || "Authorization").trim() || "Authorization";
  if (!token) return { authProvider: null, requestInit: undefined };
  if (headerName.toLowerCase() === "authorization") {
    return { authProvider: { async token() { return token; } }, requestInit: undefined };
  }
  return { authProvider: null, requestInit: { headers: { [headerName]: token } } };
}

async function openClient(url, auth, input, signal, kind, timeoutMs) {
  const client = new Client(
    { name: "sederunt", version: "0.0.0" },
    { versionNegotiation: { mode: "legacy" } },
  );
  const fetchImpl = guardedFetch(input, signal);
  const transportOptions = { fetch: fetchImpl };
  if (auth.requestInit) transportOptions.requestInit = auth.requestInit;
  if (auth.authProvider) transportOptions.authProvider = auth.authProvider;
  const Transport = kind === "sse" ? SSEClientTransport : StreamableHTTPClientTransport;
  const transport = new Transport(url, transportOptions);
  const pending = client.connect(transport, { timeout: timeoutMs });
  pending.catch(() => {});
  try {
    await pending;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  return { client, transport };
}

async function listPages(client, timeoutMs) {
  const tools = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listed = await client.listTools({ cursor }, { timeout: timeoutMs });
    for (const tool of listed?.tools || []) {
      if (!tool?.name) continue;
      tools.push({
        name: String(tool.name),
        description: String(tool.description || ""),
        inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object" },
        annotations: tool.annotations && typeof tool.annotations === "object" ? tool.annotations : {},
      });
    }
    if (!listed?.nextCursor) break;
    cursor = String(listed.nextCursor);
  }
  return tools;
}

function readServerInfo(client) {
  const info = typeof client.getServerVersion === "function" ? client.getServerVersion() : null;
  if (!info || typeof info !== "object") return { name: "", version: "" };
  return { name: String(info.name || ""), version: String(info.version || "") };
}

function describedCall(result) {
  const text = toolText(result);
  const structured = result?.structuredContent && typeof result.structuredContent === "object"
    ? result.structuredContent
    : undefined;
  return {
    ok: result?.isError !== true,
    text,
    ...(structured ? { structuredContent: structured } : {}),
    isError: result?.isError === true,
    code: typeof structured?.code === "string" ? structured.code : "",
    message: typeof structured?.message === "string" ? structured.message : "",
  };
}

function toolText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  return blocks.map((block) => (typeof block?.text === "string" ? block.text : "")).filter(Boolean).join("\n");
}

async function withTimeout(timeoutMs, run) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(connectorError("timeout"));
    }, timeoutMs);
  });
  const work = run(controller.signal);
  work.catch(() => {});
  try {
    await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

function guardedFetch(input, timeoutSignal) {
  const environment = input?.env || process.env;
  const production = environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
  const injected = !production && input?.fetch;
  const base = injected || ((resource, init) => pinnedFetch(resource, init, guardOptions(input)));
  return async (resource, init = {}) => {
    let current = resource instanceof URL ? new URL(resource.href) : new URL(String(resource?.url || resource));
    let method = init.method || "GET";
    let body = init.body;
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      if (injected) await guardConnectorUrl(current.href, guardOptions(input));
      const signals = [timeoutSignal, init.signal].filter(Boolean);
      const signal = signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];
      const response = await base(current, { ...init, method, body, redirect: "manual", signal });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : "";
      if (!location) return response;
      await response.body?.cancel().catch(() => {});
      if (hop === MAX_HOPS) throw connectorError("blocked-url");
      const next = new URL(location, current);
      if (next.origin !== current.origin) throw connectorError("blocked-url");
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
      }
      current = next;
    }
    throw connectorError("blocked-url");
  };
}

function httpStatus(error) {
  return Number(error?.status || error?.data?.status || error?.cause?.status || error?.cause?.data?.status || 0);
}

function httpBody(error) {
  const direct = error?.data?.text ?? error?.cause?.data?.text;
  if (typeof direct === "string" && direct.trim()) return direct;
  const message = typeof error?.message === "string" ? error.message : "";
  const marker = "Error POSTing to endpoint: ";
  const index = message.lastIndexOf(marker);
  if (index < 0) return "";
  const rest = message.slice(index + marker.length).trim();
  if (!rest || rest === "null" || rest === "undefined") return "";
  return rest;
}

/**
 * Readable text from an HTTP 4xx MCP failure. 401 and 403 stay unauthorized.
 * @param {unknown} error
 */
function upstreamText(error) {
  if (typeof error?.exposedMessage === "string" && error.exposedMessage.trim()) {
    return readableUpstreamMessage(error.exposedMessage);
  }
  if (classify(error) !== "protocol") return "";
  const status = httpStatus(error);
  if (status === 401 || status === 403) return "";
  if (status && (status < 400 || status >= 500)) return "";
  return readableUpstreamMessage(httpBody(error));
}

function rememberUpstream(error, upstream) {
  if (upstream) return upstream;
  return upstreamText(error) || "";
}

function exposedProtocol(message) {
  const error = connectorError("protocol", message);
  error.exposedMessage = message;
  return error;
}

function carryUpstream(error, upstream) {
  if (!error) return error;
  if (!upstream || classify(error) !== "protocol") return error;
  return exposedProtocol(upstream);
}

function failureMessage(code, error) {
  if (code !== "protocol") return connectorMessage(code);
  return upstreamText(error) || connectorMessage(code);
}

function classify(error) {
  if (error instanceof UnauthorizedError || error?.name === "UnauthorizedError") return "unauthorized";
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "invalid-url" || code === "blocked-url" || code === "unauthorized" || code === "timeout" || code === "protocol" || code === "network" || code === "secrets-key") {
    return code;
  }
  const status = Number(error?.status || error?.data?.status || error?.cause?.status || 0);
  if (status === 401 || status === 403) return "unauthorized";
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || /Timeout/.test(String(error?.code || error?.name || ""))) return "timeout";
  const errno = error?.cause?.code || error?.code;
  if (errno === "ECONNREFUSED" || errno === "ENOTFOUND" || errno === "EAI_AGAIN" || errno === "ECONNRESET" || errno === "EHOSTUNREACH" || errno === "UND_ERR_CONNECT_TIMEOUT") {
    return "network";
  }
  if (typeof error?.message === "string" && error.message.startsWith("fetch failed")) return "network";
  if (status >= 400) return "protocol";
  return "protocol";
}
