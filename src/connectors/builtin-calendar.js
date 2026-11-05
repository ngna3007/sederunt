/** Fixed Google Calendar MCP endpoint. It is not a URL the person typed. */
export const GOOGLE_CALENDAR_MCP_URL = "https://calendarmcp.googleapis.com/mcp/v1";

export const GOOGLE_CALENDAR_PRESET = "google-calendar";

/**
 * @param {string | { preset?: string | null } | null | undefined} input
 */
export function isGoogleCalendarPreset(input) {
  if (!input || typeof input !== "object") return false;
  return input.preset === GOOGLE_CALENDAR_PRESET;
}

/**
 * The exact Calendar MCP URL. Anything else, including a lookalike host, is not this preset.
 *
 * @param {string} raw
 */
export function isCalendarMcpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && url.hostname === "calendarmcp.googleapis.com"
    && url.pathname === "/mcp/v1"
    && url.username === ""
    && url.password === ""
    && url.search === ""
    && url.hash === "";
}
