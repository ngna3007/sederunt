const MCP_URL = "https://mcp.linear.app/mcp";

/**
 * Workspace and team the Linear MCP grant can see.
 * get_workspace returns { id, name, url }. The url is https://linear.app/{key}.
 * list_teams returns { teams: [{ key, name }] }.
 *
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [preferredTeam] team key to keep when the grant can see it
 */
export async function readLinearAccount(token, fetchImpl = globalThis.fetch, preferredTeam = "") {
  const rpc = mcpSession(token, fetchImpl);
  const workspace = await rpc("get_workspace", {});
  const listed = await rpc("list_teams", { limit: 50 });
  const account = linearAccountFrom(workspace, listed, preferredTeam);
  if (!account.workspaceId || !account.workspaceKey || !account.teamKey) {
    throw Object.assign(new Error("Linear did not name a workspace."), { reason: "failed" });
  }
  return account;
}

/**
 * @param {unknown} workspaceResult
 * @param {unknown} teamsResult
 * @param {string} [preferredTeam]
 */
export function linearAccountFrom(workspaceResult, teamsResult, preferredTeam = "") {
  const workspace = asRecord(workspaceResult);
  const nested = asRecord(workspace.workspace);
  const url = stringOf(workspace.url) || stringOf(nested.url);
  const workspaceKey = urlKey(url) || slug(stringOf(workspace.urlKey) || stringOf(nested.urlKey));
  const workspaceId = stringOf(workspace.id) || stringOf(nested.id);
  const workspaceName = (stringOf(workspace.name) || stringOf(nested.name) || workspaceKey).slice(0, 200);
  const teams = teamKeys(teamsResult);
  const preferred = String(preferredTeam || "").trim();
  const teamKey = (preferred && teams.includes(preferred) ? preferred : teams[0]) || "";
  return {
    workspaceId: idOf(workspaceId),
    workspaceKey,
    workspaceName,
    teamKey,
  };
}

function mcpSession(token, fetchImpl) {
  let sessionId = "";
  let nextId = 1;
  let started = null;
  async function rpc(method, params, { notify = false } = {}) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const message = notify
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: nextId++, method, params };
    const response = await fetchImpl(MCP_URL, { method: "POST", headers, body: JSON.stringify(message) });
    const returned = response.headers.get("mcp-session-id");
    if (returned) sessionId = returned;
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error("Linear MCP failed."), { reason: "failed" });
    if (notify || !text.trim()) return null;
    const payload = parseRpc(text);
    if (payload.error) throw Object.assign(new Error("Linear MCP failed."), { reason: "failed" });
    return payload.result;
  }
  async function start() {
    await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "sederunt", version: "0.1.0" },
    });
    await rpc("notifications/initialized", {}, { notify: true });
  }
  return async function callTool(name, args) {
    if (!started) started = start();
    await started;
    const result = await rpc("tools/call", { name, arguments: args });
    if (result?.isError) throw Object.assign(new Error("Linear MCP failed."), { reason: "failed" });
    return toolJson(result);
  };
}

function toolJson(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
  if (!text) return result;
  try { return JSON.parse(text); } catch { return result; }
}

function parseRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const data = trimmed.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
  if (!data.length) throw Object.assign(new Error("Linear MCP failed."), { reason: "failed" });
  return JSON.parse(data[data.length - 1]);
}

function teamKeys(result) {
  const body = asRecord(result);
  const list = Array.isArray(result) ? result : body.teams || body.nodes || [];
  if (!Array.isArray(list)) return [];
  return list.map((team) => stringOf(asRecord(team).key)).filter((key) => /^[A-Za-z0-9]{1,20}$/.test(key));
}

function urlKey(value) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "linear.app" && parsed.hostname !== "www.linear.app") return "";
    return slug(parsed.pathname.split("/").filter(Boolean)[0] || "");
  } catch {
    return "";
  }
}

function slug(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(text) ? text : "";
}

function idOf(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(text) ? text : "";
}

function stringOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}
