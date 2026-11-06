import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/client";

const PAGE = 2;

function toolCatalog(mode) {
  const changed = mode === "changed";
  return [
    {
      name: "lookup_customer",
      description: changed ? "Lookup a customer record (updated)." : "Look up a customer by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      annotations: { readOnlyHint: true },
    },
    {
      name: "create_note",
      description: "Create a note.",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
      name: "delete_note",
      description: "Delete a note.",
      inputSchema: { type: "object", properties: { id: { type: "string" } } },
      annotations: { destructiveHint: true },
    },
    {
      name: "ping_status",
      description: changed ? "Status ping (updated)." : "Ping the demo server.",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

function stableArgs(value) {
  if (Array.isArray(value)) return value.map(stableArgs);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableArgs(value[key]);
    return out;
  }
  return value;
}

function bearer(header) {
  const text = Array.isArray(header) ? header[0] : header;
  if (typeof text !== "string") return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(text.trim());
  return match ? match[1] : "";
}

function authorized(req, expected) {
  if (!expected) return true;
  const presented = bearer(req.headers.authorization);
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body, extra = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  });
  res.end(payload);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Loopback Streamable HTTP (or legacy SSE) MCP server for tests and the demo hint.
 *
 * @param {{ port?: number, token?: string, protocol?: "streamable_http" | "sse", mode?: string }} [options]
 */
export function startFakeMcpServer(options = {}) {
  const protocol = options.protocol === "sse" ? "sse" : "streamable_http";
  let mode = options.mode === "hang" || options.mode === "changed" ? options.mode : "ok";
  const expected = typeof options.token === "string" ? options.token : "";
  const calls = [];
  const sseClients = new Set();
  const sessionId = randomUUID();

  function answer(message) {
    const method = message?.method;
    const name = message?.params?.name;
    calls.push({ method: String(method || ""), name: typeof name === "string" ? name : "" });
    if (method === "initialize") {
      const offered = message?.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(offered) ? offered : LATEST_PROTOCOL_VERSION;
      return rpcResult(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "Demo tools", version: "0.0.1" },
      });
    }
    if (method === "ping") return rpcResult(message.id, {});
    if (method === "tools/list") {
      const tools = toolCatalog(mode);
      const cursor = String(message?.params?.cursor || "");
      const start = cursor === "2" ? PAGE : 0;
      const slice = tools.slice(start, start + PAGE);
      const result = { tools: slice };
      if (start === 0 && tools.length > PAGE) result.nextCursor = "2";
      return rpcResult(message.id, result);
    }
    if (method === "tools/call") {
      const args = stableArgs(message?.params?.arguments || {});
      const result = {
        content: [{ type: "text", text: `${name}:${JSON.stringify(args)}` }],
        isError: false,
      };
      if (name === "lookup_customer") result.structuredContent = { id: String(args.id || ""), note: "demo" };
      return rpcResult(message.id, result);
    }
    return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method" } };
  }

  function pushSse(payload) {
    const frame = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try { client.write(frame); } catch { sseClients.delete(client); }
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (mode === "hang") return;
    if (!authorized(req, expected)) {
      res.writeHead(401, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("unauthorized");
      return;
    }
    if (req.method === "DELETE") {
      res.writeHead(405, { allow: "GET, POST", "content-type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/mcp" || url.pathname === "/sse")) {
      if (protocol !== "sse") {
        res.writeHead(405, { allow: "POST, DELETE", "content-type": "text/plain; charset=utf-8" });
        res.end("Method Not Allowed");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      const port = server.address().port;
      res.write(`event: endpoint\ndata: http://127.0.0.1:${port}/messages\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/mcp" && protocol === "sse") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    if (req.method !== "POST" || (url.pathname !== "/mcp" && url.pathname !== "/messages")) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    let message;
    try {
      message = JSON.parse(await readBody(req) || "");
    } catch {
      json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      return;
    }
    if (message.id == null) {
      calls.push({ method: String(message.method || ""), name: "" });
      res.writeHead(202, { "content-type": "text/plain; charset=utf-8" });
      res.end("");
      return;
    }
    const body = answer(message);
    if (url.pathname === "/messages") {
      pushSse(body);
      res.writeHead(202, { "content-type": "text/plain; charset=utf-8" });
      res.end("");
      return;
    }
    const headers = message.method === "initialize" ? { "mcp-session-id": sessionId } : {};
    json(res, 200, body, headers);
  });

  const port = Number(options.port) > 0 ? Number(options.port) : 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const bound = server.address().port;
      resolve({
        port: bound,
        url: `http://127.0.0.1:${bound}/mcp`,
        calls,
        setMode(next) {
          mode = next === "hang" || next === "changed" ? next : "ok";
        },
        close() {
          for (const client of sseClients) {
            try { client.end(); } catch { /* already gone */ }
          }
          sseClients.clear();
          return new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          });
        },
      });
    });
  });
}
