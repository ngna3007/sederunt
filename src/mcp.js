import { callCustomTool, listExposedTools } from "./connectors/expose.js";
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

const factOutput = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sourceId: { type: "string" },
        },
        required: ["text", "sourceId"],
      },
    },
  },
  required: ["facts"],
};

/** Tool list shared by stdio and the HTTP MCP endpoint. */
export function mcpToolList() {
  return [
    {
      name: "recall",
      description: "Use when someone asks what was decided or said in this room. Pass the question as text. Example: what did we decide about the launch. Returns at most three facts, each with a source id.",
      inputSchema: toolParameters,
      outputSchema: factOutput,
    },
    {
      name: "act",
      description: "Use when someone asks to file or change something, such as a Linear ticket. Pass the request as text. Example: create a Linear issue for the onboarding email. A write waits for approval and is not done yet.",
      inputSchema: toolParameters,
      outputSchema: factOutput,
    },
  ];
}

/**
 * One JSON-RPC method. Notifications return null. Unknown methods return null.
 * Tools are the same ones the stdio process serves.
 */
export async function dispatchMcp(message, session, deps, context) {
  const method = message?.method;
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "sederunt", version: "0.0.0" },
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") {
    const extra = await listExposedTools(deps?.connectors, context?.tenantId);
    return { tools: [...mcpToolList(), ...extra] };
  }
  if (method === "tools/call") {
    const name = message?.params?.name;
    const args = message?.params?.arguments ?? {};
    const result = await handleMcpRequest({
      name,
      arguments: { ...args, session },
      _meta: message?.params?._meta,
    }, deps, context);
    if (typeof name === "string" && name.includes("__")) return presentCustomToolResult(result);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: structuredFacts(result),
    };
  }
  return null;
}

/**
 * Custom connector tools keep the upstream structured result.
 * recall and act stay on the decision-record wrapper.
 *
 * @param {{
 *   ok?: boolean,
 *   held?: boolean,
 *   needsConfirmation?: boolean,
 *   unavailable?: boolean,
 *   actionId?: string,
 *   tool?: string,
 *   actionClass?: string,
 *   preference?: string,
 *   text?: string,
 *   code?: string,
 *   message?: string,
 *   structuredContent?: Record<string, unknown>,
 * }} result
 */
export function presentCustomToolResult(result) {
  if (result?.held === true) {
    const structuredContent = {
      held: true,
      needsConfirmation: true,
      actionId: result.actionId || "",
      tool: result.tool || "",
      actionClass: result.actionClass || "",
      preference: result.preference || "ask",
    };
    const text = result.text || `Needs confirmation before ${structuredContent.tool || "this tool"} runs.`;
    return {
      content: [{ type: "text", text }],
      structuredContent,
    };
  }
  if (result?.ok !== true) {
    const code = String(result?.code || (result?.unavailable ? "unavailable" : "protocol"));
    const message = String(result?.text || result?.message || "The tool call failed.");
    return {
      isError: true,
      content: [{ type: "text", text: message }],
      structuredContent: { code, message },
    };
  }
  const structured = result?.structuredContent;
  const fallback = structured && typeof structured === "object" ? JSON.stringify(structured) : "";
  const payload = {
    content: [{ type: "text", text: String(result?.text || fallback) }],
  };
  if (structured && typeof structured === "object") payload.structuredContent = structured;
  return payload;
}

/** Streamable HTTP response for one JSON-RPC message. Agents that speak MCP can POST here. */
export async function mcpJsonRpc(message, session, deps, context) {
  if (!message || typeof message !== "object" || typeof message.method !== "string") {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } } };
  }
  if (message.id == null) return { status: 202, body: "" };
  try {
    const result = await dispatchMcp(message, session, deps, context);
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

/**
 * The process is configured with one member id.
 * A tool argument may repeat that id. A different id is not the caller.
 */
export function bindToolMember(message, configured) {
  if (message?.method !== "tools/call") return { message, refusal: null };
  const args = message?.params?.arguments ?? {};
  const member = typeof configured === "string" ? configured.trim() : "";
  const claimed = typeof args.memberId === "string" ? args.memberId.trim() : "";
  if (!member) return { message, refusal: "missing-member" };
  if (claimed && claimed !== member) return { message, refusal: "not-invited" };
  return {
    message: {
      ...message,
      params: {
        ...message.params,
        arguments: { ...args, memberId: member },
      },
    },
    refusal: null,
  };
}

/**
 * At most three facts. Each fact is a sentence plus the decision id it came from.
 * The text content of the tool result stays the full record.
 *
 * @param {object | null | undefined} result
 */
export function structuredFacts(result) {
  const facts = [];
  const seen = new Set();
  const push = (text, sourceId) => {
    if (facts.length >= 3) return;
    const line = String(text || "").replace(/\s+/g, " ").trim();
    const id = String(sourceId || "").trim();
    if (!line || !id || seen.has(id)) return;
    seen.add(id);
    facts.push({ text: line.slice(0, 240), sourceId: id });
  };
  for (const row of Array.isArray(result?.visible) ? result.visible : []) {
    push(row?.text, row?.id || row?.sourceId);
  }
  if (!facts.length) {
    const line = String(result?.body || "").split("\n").map((part) => part.trim()).find(Boolean) || "";
    push(line, result?.decisionId || result?.actionId || "");
  }
  return { facts };
}

export function memberRefusal(reason) {
  return {
    status: "recorded",
    kind: "answer",
    body: `${reason}\nrecorded\npreference ask`,
    allow: reason,
    preference: "ask",
    issueId: null,
    entered: true,
    decisionId: null,
    actionId: null,
    checkpoint: null,
  };
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

export async function handleMcpRequest(message, deps, context) {
  const name = message?.params?.name ?? message?.name;
  const args = message?.params?.arguments ?? message?.arguments ?? {};
  if (name === "recall") return recall(args, deps);
  if (name === "act") return act(args, deps);
  if (typeof name === "string" && name.includes("__")) {
    return callCustomTool({
      store: deps?.connectors,
      tenantId: context?.tenantId || "",
      env: context?.env,
      session: args?.session,
      name,
      args,
      meta: message?._meta || message?.params?._meta || {},
      personId: context?.personId || "",
      googleGrants: context?.googleGrants,
      forms: context?.forms,
      calendarMcp: context?.calendarMcp,
      calendarSave: context?.calendarSave,
      fetch: context?.fetch,
      origin: context?.origin,
      signal: context?.signal,
      timeoutMs: context?.toolTimeoutMs,
      persistHold: context?.persistHold,
    });
  }
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
