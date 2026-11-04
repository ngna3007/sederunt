import { Client, SSEClientTransport, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { connectorError, connectorMessage } from "./errors.js";
import { guardConnectorUrl } from "./url-guard.js";

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
    const url = await guardConnectorUrl(input?.url, { env: input?.env, lookup: input?.lookup });
    const auth = authFrom(input);
    const tools = [];
    let serverInfo = null;
    let protocolVersion = null;
    const preferSse = input?.transport === "sse";
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
          if (classify(error) !== "protocol") throw error;
        }
      }
      const opened = await openClient(url, auth, input, signal, "sse", timeoutMs);
      try {
        serverInfo = readServerInfo(opened.client);
        protocolVersion = opened.transport.protocolVersion || null;
        tools.push(...await listPages(opened.client, timeoutMs));
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
      message: connectorMessage(code),
    };
  }
}

/**
 * @param {{ url: string, token?: string, headerName?: string, authType?: string }} connector
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 * @param {{ env?: NodeJS.ProcessEnv, timeoutMs?: number, lookup?: Function, fetch?: typeof fetch, transport?: string }} [options]
 */
export async function callTool(connector, name, args = {}, options = {}) {
  const timeoutMs = positiveTimeout(options.timeoutMs);
  try {
    const url = await guardConnectorUrl(connector?.url, { env: options.env, lookup: options.lookup });
    const auth = authFrom({ ...connector, ...options, token: connector?.token || "" });
    let result = null;
    await withTimeout(timeoutMs, async (signal) => {
      const kinds = options.transport === "sse" ? ["sse"] : ["streamable_http", "sse"];
      let last;
      for (const kind of kinds) {
        try {
          const opened = await openClient(url, auth, { ...options, env: options.env }, signal, kind, timeoutMs);
          try {
            result = await opened.client.callTool({ name, arguments: args && typeof args === "object" ? args : {} }, { timeout: timeoutMs });
            return;
          } finally {
            await opened.client.close().catch(() => {});
          }
        } catch (error) {
          last = error;
          if (classify(error) !== "protocol" || kind === "sse") throw error;
        }
      }
      throw last;
    });
    const text = toolText(result);
    return { ok: result?.isError !== true, text, isError: result?.isError === true, code: "", message: "" };
  } catch (error) {
    const code = classify(error);
    return { ok: false, text: "", isError: true, code, message: connectorMessage(code) };
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
  const base = input?.fetch || globalThis.fetch;
  return async (resource, init = {}) => {
    let current = resource instanceof URL ? new URL(resource.href) : new URL(String(resource?.url || resource));
    let method = init.method || "GET";
    let body = init.body;
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      await guardConnectorUrl(current.href, { env: input?.env, lookup: input?.lookup });
      const signals = [timeoutSignal, init.signal].filter(Boolean);
      const signal = signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];
      const response = await base(current, { ...init, method, body, redirect: "manual", signal });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : "";
      if (!location) return response;
      if (hop === MAX_HOPS) throw connectorError("blocked-url");
      await response.arrayBuffer().catch(() => {});
      const next = new URL(location, current);
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
      }
      current = next;
    }
    throw connectorError("blocked-url");
  };
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
