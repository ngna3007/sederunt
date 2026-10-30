import { handleUtterance } from "./typed-path.js";

export const mcpTools = Object.freeze(["recall", "act"]);

const toolParameters = {
  type: "object",
  properties: {
    text: { type: "string" },
    memberId: { type: "string", description: "The person who was in the room" },
  },
  required: ["memberId", "text"],
};

/** Tool list shared by stdio and the HTTP MCP endpoint. */
export function mcpToolList() {
  return mcpTools.map((name) => ({
    name,
    description: name === "recall"
      ? "Answer a question about a room the caller was in. Same answer as the dashboard chat and the Slack bot."
      : "Submit one requested action, such as a Linear ticket. A write waits until Ask allows it.",
    inputSchema: toolParameters,
  }));
}

/**
 * One JSON-RPC method. Notifications return null. Unknown methods return null.
 * Tools are the same ones the stdio process serves.
 */
export async function dispatchMcp(message, session, deps) {
  const method = message?.method;
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "sederunt", version: "0.0.0" },
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: mcpToolList() };
  if (method === "tools/call") {
    const name = message?.params?.name;
    const args = message?.params?.arguments ?? {};
    const result = await handleMcpRequest({
      name,
      arguments: { ...args, session },
    }, deps);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }
  return null;
}

/** Streamable HTTP response for one JSON-RPC message. Agents that speak MCP can POST here. */
export async function mcpJsonRpc(message, session, deps) {
  if (!message || typeof message !== "object" || typeof message.method !== "string") {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } } };
  }
  if (message.id == null) return { status: 202, body: "" };
  try {
    const result = await dispatchMcp(message, session, deps);
    if (result == null) {
      return {
        status: 200,
        body: { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method" } },
      };
    }
    return { status: 200, body: { jsonrpc: "2.0", id: message.id, result } };
  } catch {
    return {
      status: 200,
      body: { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "request failed" } },
    };
  }
}

/** Invite check and the decision sentence. No write preference and no connector. */
export function recall(input, deps) {
  return handleUtterance({
    ...input,
    door: "mcp",
    intent: "recall",
    text: input?.text || "what was decided",
  }, deps);
}

/** One requested write, submitted to the gate. */
export function act(input, deps) {
  return handleUtterance({
    ...input,
    door: "mcp",
    intent: "act",
    text: input?.text ?? "",
  }, deps);
}

export async function handleMcpRequest(message, deps) {
  const name = message?.params?.name ?? message?.name;
  const args = message?.params?.arguments ?? message?.arguments ?? {};
  if (name === "recall") return recall(args, deps);
  if (name === "act") return act(args, deps);
  return {
    status: "recorded",
    kind: "note",
    body: "unknown tool",
    issueId: null,
    allow: "read",
    preference: null,
    link: null,
    entered: true,
    decisionId: null,
    actionId: null,
    checkpoint: null,
  };
}
