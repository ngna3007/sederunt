import { redact } from "../domain/redact.js";

/** Tool failure whose message is safe to return. It never carries a token. */
export class FormsToolError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "FormsToolError";
  }
}

/**
 * Drop bearer values, Google access tokens, and the caller's token.
 *
 * @param {unknown} value
 * @param {string} [token]
 */
export function redactFormsText(value, token = "") {
  let text = String(value ?? "");
  if (token) text = text.split(token).join("");
  text = text.replace(/\bya29\.[A-Za-z0-9._\-]+/g, "");
  text = text.replace(/\bBearer\s+\S+/gi, "");
  text = redact(text);
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @param {unknown} data
 */
function reasonFrom(data) {
  const details = data && typeof data === "object" ? data.error?.details : null;
  if (!Array.isArray(details)) return "";
  for (const detail of details) {
    const reason = detail && typeof detail.reason === "string" ? detail.reason : "";
    if (/^[A-Z0-9_]{1,80}$/.test(reason)) return reason;
  }
  return "";
}

/**
 * Map a Google Forms HTTP error onto a tool error. The text is already redacted.
 *
 * @param {number} status
 * @param {unknown} data
 * @param {string} [token]
 */
export function mapGoogleError(status, data, token = "") {
  if (status === 401) return "unauthorized: Google needs you to sign in again.";
  if (status === 403) {
    const reason = reasonFrom(data);
    if (reason === "SERVICE_DISABLED") {
      return "forbidden: The Forms API is not enabled for this account (SERVICE_DISABLED).";
    }
    if (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") {
      return "forbidden: This Google account is missing the Forms scope (ACCESS_TOKEN_SCOPE_INSUFFICIENT).";
    }
    if (reason) return `forbidden: Google refused this request (${reason}).`;
    return "forbidden: Google refused this request.";
  }
  if (status === 404) return "not-found: That form was not found.";
  if (status === 400) {
    const raw = data && typeof data === "object" ? data.error?.message : "";
    const detail = redactFormsText(raw, token).slice(0, 300);
    return detail ? `invalid-argument: ${detail}` : "invalid-argument: Google rejected the request.";
  }
  return "invalid-argument: Google Forms could not be reached.";
}

/**
 * @param {string} message
 */
export function formsError(message) {
  return new FormsToolError(message);
}
