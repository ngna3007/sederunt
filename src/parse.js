const TRIP_READ = /what tickets are open for the trip\??/i;
const FILE_TICKET = /file the venue ticket/i;
const YES = /^yes[.!]?$/i;
const PRIVATE_NOTE = /^(?:private note|private)\s*:\s*/i;

/**
 * @param {string} text
 */
export function parseUtterance(text) {
  const trimmed = String(text ?? "").trim();
  if (YES.test(trimmed)) return { type: "yes" };
  if (TRIP_READ.test(trimmed)) {
    return { type: "read", tool: "linear.list_issues" };
  }
  if (FILE_TICKET.test(trimmed)) {
    return { type: "write", tool: "linear.create_issue", title: trimmed };
  }
  return {
    type: "note",
    private: PRIVATE_NOTE.test(trimmed),
    text: trimmed,
  };
}
