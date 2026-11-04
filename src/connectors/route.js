import { connectorMessage } from "./errors.js";
import { testConnection } from "./client.js";
import { loadSpaceView } from "../console-flow.js";
import { guardConsole } from "../console-auth.js";
import { validToolName } from "./tools.js";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Console JSON for custom MCP connectors. HTML GET falls through.
 *
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   url: URL,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   send: Function,
 *   readJson: Function,
 *   workspace: { deps: { connectors?: object } },
 *   identity: object | null,
 *   sameOrigin: Function,
 * }} ctx
 * @returns {Promise<boolean>}
 */
export async function handleConnectorRoutes(ctx) {
  const { req, url } = ctx;
  if (!url.pathname.startsWith("/console/connectors")) return false;
  const accept = headerValue(req.headers.accept);
  const wantsJson = accept.includes("application/json") && !accept.includes("text/html");
  if (req.method === "GET" && url.pathname === "/console/connectors" && !wantsJson) return false;

  const gate = guardConsole(req, ctx.env);
  if (gate.required && !gate.session) {
    sendJson(ctx, 401, { ok: false, error: "sign-in", message: "Sign in to manage connectors." });
    return true;
  }
  if (req.method !== "GET" && !ctx.sameOrigin(req)) {
    sendJson(ctx, 403, { ok: false, error: "origin", message: "That request was refused." });
    return true;
  }
  const tenantId = await spaceId(gate, ctx.identity);
  if (!tenantId) {
    sendJson(ctx, 409, { ok: false, error: "space", message: "Choose a space first." });
    return true;
  }
  const store = ctx.workspace?.deps?.connectors;
  if (!store) {
    sendJson(ctx, 500, { ok: false, message: "Connectors are not available." });
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === "/console/connectors") {
      const connectors = await store.list(tenantId);
      sendJson(ctx, 200, { ok: true, connectors, demoUrl: "" });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/console/connectors/probe") {
      const body = await readBody(ctx);
      const test = await testConnection(authInput(body, ctx.env));
      sendJson(ctx, 200, publicTest(test));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/console/connectors") {
      const body = await readBody(ctx);
      const connector = await store.create(tenantId, {
        name: body.name,
        url: body.url,
        token: body.token,
        headerName: body.headerName,
      });
      const test = await testConnection(authInput({ ...body, url: connector.url }, ctx.env));
      const saved = await store.recordTest(tenantId, connector.id, test);
      sendJson(ctx, 200, { ok: true, connector: saved, test: publicTest(test) });
      return true;
    }
    const toolPath = /^\/console\/connectors\/([^/]+)\/tools\/([^/]+)$/.exec(url.pathname);
    if (req.method === "POST" && toolPath) {
      const id = toolPath[1];
      let name = toolPath[2];
      try { name = decodeURIComponent(name); } catch { name = toolPath[2]; }
      if (!ID.test(id) || !validToolName(name)) {
        sendJson(ctx, 404, { ok: false, message: "That tool was not found." });
        return true;
      }
      const body = await readBody(ctx);
      const saved = await store.setToolEnabled(tenantId, id, name, body.enabled === true);
      if (!saved) {
        sendJson(ctx, 404, { ok: false, message: "That tool was not found." });
        return true;
      }
      sendJson(ctx, 200, { ok: true, connector: saved });
      return true;
    }
    const sub = /^\/console\/connectors\/([^/]+)\/(test|remove|token)$/.exec(url.pathname);
    if (req.method === "POST" && sub) {
      const id = sub[1];
      if (!ID.test(id)) {
        sendJson(ctx, 404, { ok: false, message: "That connector was not found." });
        return true;
      }
      if (sub[2] === "remove") {
        const removed = await store.remove(tenantId, id);
        sendJson(ctx, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: "That connector was not found." });
        return true;
      }
      if (sub[2] === "token") {
        const body = await readBody(ctx);
        const saved = await store.replaceToken(tenantId, id, { token: body.token, headerName: body.headerName });
        if (!saved) {
          sendJson(ctx, 404, { ok: false, message: "That connector was not found." });
          return true;
        }
        sendJson(ctx, 200, { ok: true, connector: saved });
        return true;
      }
      const current = await store.get(tenantId, id);
      if (!current) {
        sendJson(ctx, 404, { ok: false, message: "That connector was not found." });
        return true;
      }
      const secret = await store.openToken(tenantId, id);
      const test = await testConnection({
        url: current.url,
        auth: secret ? { token: secret.token, headerName: secret.headerName } : {},
        env: ctx.env,
      });
      const saved = await store.recordTest(tenantId, id, test);
      sendJson(ctx, 200, { ok: true, connector: saved, test: publicTest(test) });
      return true;
    }
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "invalid-url";
    sendJson(ctx, 400, { ok: false, code, message: error?.message || connectorMessage(code) });
    return true;
  }
  sendJson(ctx, 404, { ok: false, message: "Not found." });
  return true;
}

async function spaceId(gate, identity) {
  if (gate.session?.tenantId) return gate.session.tenantId;
  if (identity && gate.session?.kind === "oauth") {
    const view = await loadSpaceView(identity, gate.session);
    if (view?.activeId) return view.activeId;
  }
  if (!gate.required) return "local";
  return "";
}

async function readBody(ctx) {
  try {
    const body = await ctx.readJson(ctx.req);
    return body && typeof body === "object" ? body : {};
  } catch {
    const error = new Error("That could not be saved.");
    error.code = "invalid-url";
    throw error;
  }
}

function authInput(body, env) {
  const token = typeof body?.token === "string" ? body.token : "";
  const headerName = typeof body?.headerName === "string" && body.headerName.trim() ? body.headerName.trim() : "Authorization";
  return {
    url: typeof body?.url === "string" ? body.url : "",
    auth: token ? { token, headerName } : {},
    env,
  };
}

function publicTest(test) {
  const tools = Array.isArray(test?.tools) ? test.tools : [];
  return {
    ok: test?.ok === true,
    code: test?.code || "",
    message: test?.ok === true ? "" : (test?.message || connectorMessage(test?.code || "protocol")),
    serverInfo: test?.serverInfo ? { name: String(test.serverInfo.name || ""), version: String(test.serverInfo.version || "") } : null,
    protocolVersion: test?.protocolVersion || "",
    toolCount: tools.length,
    toolNames: tools.map((tool) => String(tool?.name || "")).filter(Boolean),
  };
}

function sendJson(ctx, status, body) {
  ctx.send(ctx.res, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}
