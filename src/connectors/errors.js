import { redact } from "../domain/redact.js";

/** Typed connector failures. Fixed messages are the default. A readable 4xx body is trimmed and stripped of tokens before it is shown. */

export const CONNECTOR_MESSAGES = Object.freeze({
  "invalid-url": "Enter a valid server URL.",
  "blocked-url": "That server address is not allowed.",
  unauthorized: "The server refused the token.",
  timeout: "The server did not answer in time.",
  protocol: "The server did not speak MCP.",
  network: "The server could not be reached.",
  "secrets-key": "Connector secrets are not configured.",
});

const MESSAGE_CAP = 300;
const HEADER_LINE = /\b(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-goog-api-key|x-secret|[A-Za-z0-9-]*(?:token|secret|api-key)[A-Za-z0-9-]*)\s*:\s*\S+/gi;

/**
 * @param {string} code
 * @param {string} [message]
 */
export function connectorError(code, message) {
  const error = new Error(message || CONNECTOR_MESSAGES[code] || CONNECTOR_MESSAGES.protocol);
  error.code = code;
  return error;
}

/**
 * @param {string} code
 */
export function connectorMessage(code) {
  return CONNECTOR_MESSAGES[code] || CONNECTOR_MESSAGES.protocol;
}

/**
 * Message stored after a failed test. A sanitized upstream message wins.
 * Otherwise the fixed message for the code is used.
 *
 * @param {{ code?: string, message?: string } | null | undefined} result
 */
export function connectorResultMessage(result) {
  const message = typeof result?.message === "string" ? result.message.trim() : "";
  if (message) return message.slice(0, MESSAGE_CAP);
  return connectorMessage(result?.code || "protocol");
}

/**
 * Text worth showing from an HTTP 4xx body.
 * JSON-RPC `result.content` (when `isError`) or `error.message`, plain text,
 * or JSON `{ error | message }` qualify. Anything else is unreadable.
 * The result is trimmed to 300 characters and does not carry tokens or headers.
 *
 * @param {unknown} body
 * @returns {string}
 */
export function readableUpstreamMessage(body) {
  const raw = String(body ?? "").replace(/^\uFEFF/, "").trim();
  if (!raw) return "";
  const extracted = extractReadable(raw);
  if (!extracted) return "";
  return clipUpstream(extracted);
}

/**
 * @param {string} raw
 */
function extractReadable(raw) {
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return messageFromJson(JSON.parse(raw));
    } catch {
      return "";
    }
  }
  if (raw.startsWith("<") || /^<!doctype/i.test(raw) || raw.includes("\u0000")) return "";
  return raw;
}

/**
 * @param {unknown} value
 */
function messageFromJson(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = messageFromJson(item);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  const result = value.result;
  if (result && typeof result === "object" && result.isError === true) {
    const text = contentText(result);
    if (text) return text;
  }
  const error = value.error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  if (typeof error === "string" && error.trim()) return error;
  return "";
}

/**
 * @param {{ content?: unknown }} result
 */
function contentText(result) {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks.map((block) => (typeof block?.text === "string" ? block.text : "")).filter(Boolean).join("\n").trim();
}

/**
 * @param {string} text
 */
function clipUpstream(text) {
  let out = String(text || "");
  out = out.replace(HEADER_LINE, " ");
  out = out.replace(/\bya29\.[A-Za-z0-9._\-]+/g, "");
  out = out.replace(/\b1\/\/[A-Za-z0-9._\-]+/g, "");
  out = redact(out);
  out = out.replace(/\s+/g, " ").trim();
  if (!out || !/[A-Za-z0-9]/.test(out)) return "";
  if (out.length > MESSAGE_CAP) out = out.slice(0, MESSAGE_CAP).trim();
  return out;
}
