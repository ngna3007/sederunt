const MCP_URL = "https://mcp.linear.app/mcp";

/**
 * Linear boundary. Talks to the remote MCP the product spec names.
 * The token stays in memory for the process. It is never written to a response.
 *
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @param {{ team?: string, workspace?: string }} [options]
 */
export function createLinearClient(token, fetchImpl = globalThis.fetch, options = {}) {
  const team = String(options.team || "ROW").trim() || "ROW";
  const workspace = String(options.workspace || "").trim();
  const project = String(options.project || "Sederunt").trim() || "Sederunt";
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
    const response = await fetchImpl(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });
    const returnedSession = response.headers.get("mcp-session-id");
    if (returnedSession) sessionId = returnedSession;
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Linear MCP ${method} failed with HTTP ${response.status}`);
    }
    if (notify || !text.trim()) return null;
    const payload = parseRpc(text);
    if (payload.error) {
      // A JSON-RPC error (for example invalid params) is a refusal: nothing was saved.
      throw Object.assign(new Error(`Linear MCP ${method} failed: ${payload.error.message || "error"}`), { rejected: true });
    }
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

  function ensureStarted() {
    if (!started) started = start();
    return started;
  }

  async function callTool(name, args) {
    await ensureStarted();
    const result = await rpc("tools/call", { name, arguments: args });
    if (result?.isError) {
      const message = toolText(result) || "Linear tool failed";
      // Linear answered with a tool error: the call was refused, nothing was saved.
      throw Object.assign(new Error(message), { rejected: true });
    }
    return result;
  }

  async function saveIdentified(name, args, id) {
    const result = await callTool(name, args);
    const parsed = parseToolJson(result);
    const identifier = findIdentifier(parsed) || findIdentifier(result) || rowId(id);
    if (!identifier) throw new Error("Linear save returned no issue id.");
    return { id: identifier, identifier };
  }

  async function issueLabels(id) {
    const result = await callTool("get_issue", { id });
    const parsed = parseToolJson(result);
    const raw = parsed?.labels || parsed?.issue?.labels || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((label) => (typeof label === "string" ? label : label?.name || "")).filter(Boolean);
  }

  return {
    async readOpenTripTickets() {
      const trip = issuesFrom(await callTool("list_issues", { team, query: "trip", limit: 25 }));
      const open = issuesFrom(await callTool("list_issues", { team, limit: 25 }));
      return { team, trip, open };
    },
    async createIssue({ title, description }) {
      // save_issue takes title, team, project, description (Linear MCP schema).
      // It has no idempotency argument: the action claim keeps a filing to one call.
      const args = {
        title,
        team,
        project,
        description: typeof description === "string" && description.trim() ? description.trim() : "Filed from a room.",
      };
      let result;
      try {
        result = await callTool("save_issue", args);
      } catch (error) {
        // A workspace without the "Sederunt" project rejects the save. Linear
        // created nothing, so file once more into the team alone.
        if (!error?.rejected || !/project/i.test(String(error.message || ""))) throw error;
        const { project: _dropped, ...teamOnly } = args;
        result = await callTool("save_issue", teamOnly);
      }
      const parsed = parseToolJson(result);
      const identifier = findIdentifier(parsed) || findIdentifier(result) || identifierInText(toolText(result), team);
      if (!identifier) {
        const fields = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 8).join(",") : typeof parsed;
        throw Object.assign(new Error(`Linear create returned no issue id (fields: ${fields}).`), { reason: "no-id" });
      }
      const url = findUrl(parsed) || findUrl(result) || urlInText(toolText(result), identifier) || issueUrl(workspace, identifier);
      return { id: identifier, identifier, url };
    },
    async assignIssue({ id, assignee }) {
      const saved = await saveIdentified("save_issue", { id, assignee }, id);
      return saved;
    },
    async updateIssue({ id, state }) {
      return saveIdentified("save_issue", { id, state }, id);
    },
    async addLabel({ id, label }) {
      const current = await issueLabels(id);
      const labels = current.includes(label) ? current : [...current, label];
      return saveIdentified("save_issue", { id, labels }, id);
    },
    async removeLabel({ id, label }) {
      const current = await issueLabels(id);
      const labels = current.filter((name) => name.toLowerCase() !== String(label || "").toLowerCase());
      return saveIdentified("save_issue", { id, labels }, id);
    },
    async unassignIssue({ id }) {
      return saveIdentified("save_issue", { id, assignee: null }, id);
    },
    async findIssuesByTitle(title) {
      const found = issuesFrom(await callTool("list_issues", { team, query: title, limit: 20 }));
      return found.filter((issue) => (issue.title || "") === title);
    },
    async getIssue(id) {
      const result = await callTool("get_issue", { id });
      const parsed = parseToolJson(result);
      return {
        identifier: rowId(parsed?.id) || rowId(parsed?.identifier) || id,
        title: parsed?.title || "",
        status: typeof parsed?.status === "string" ? parsed.status : parsed?.status?.name || "",
        url: parsed?.url || "",
      };
    },
  };
}

function parseRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (data.length === 0) throw new Error("Linear MCP returned an empty body");
  return JSON.parse(data[data.length - 1]);
}

function toolText(result) {
  const blocks = result?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function parseToolJson(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = toolText(result);
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function issuesFrom(result) {
  const parsed = parseToolJson(result);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed?.issues || parsed?.nodes || parsed?.data || [];
  if (!Array.isArray(list)) return [];
  return list.map((issue) => ({
    identifier: issue.identifier || issue.id,
    id: issue.identifier || issue.id,
    title: issue.title || "",
    status: issue.status || issue.state?.name || "",
  }));
}

function issueUrl(workspace, identifier) {
  if (!workspace || !identifier) return "";
  return `https://linear.app/${encodeURIComponent(workspace)}/issue/${identifier}`;
}

function rowId(value) {
  if (typeof value !== "string") return "";
  const text = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]+-\d+$/.test(text) ? text : "";
}

function findUrl(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.url === "string" && value.url.startsWith("https://")) return value.url.split("?")[0];
  const nested = value.issue || value.data;
  if (nested && nested !== value) return findUrl(nested);
  return "";
}

function findIdentifier(value) {
  if (!value || typeof value !== "object") return "";
  const direct = rowId(value.identifier) || rowId(value.id);
  if (direct) return direct;
  const nested = value.issue || value.data || value.issueCreate;
  if (nested && nested !== value) {
    const found = findIdentifier(nested);
    if (found) return found;
  }
  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      const found = findIdentifier(parseMaybe(block?.text));
      if (found) return found;
    }
  }
  return "";
}

function identifierInText(text, team) {
  if (typeof text !== "string" || !text) return "";
  const url = text.match(/https:\/\/linear\.app\/[^\s/]+\/issue\/([A-Za-z][A-Za-z0-9]+-\d+)/);
  if (url) return rowId(url[1]);
  const key = String(team || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]+$/.test(key)) return "";
  const named = text.match(new RegExp(`\\b${key}-\\d+\\b`));
  return named ? rowId(named[0]) : "";
}

function urlInText(text, identifier) {
  if (typeof text !== "string" || !identifier) return "";
  const found = text.match(/https:\/\/linear\.app\/[^\s/]+\/issue\/[A-Za-z][A-Za-z0-9]+-\d+[^\s)"'\]]*/);
  if (!found || rowId(found[0].split("/issue/")[1].split("/")[0]) !== identifier) return "";
  return found[0].split("?")[0];
}

function parseMaybe(text) {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
