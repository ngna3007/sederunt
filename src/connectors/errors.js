/** Typed connector failures. Messages are fixed so an upstream body never leaks. */

export const CONNECTOR_MESSAGES = Object.freeze({
  "invalid-url": "Enter a valid server URL.",
  "blocked-url": "That server address is not allowed.",
  unauthorized: "The server refused the token.",
  timeout: "The server did not answer in time.",
  protocol: "The server did not speak MCP.",
  network: "The server could not be reached.",
  "secrets-key": "Connector secrets are not configured.",
});

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
