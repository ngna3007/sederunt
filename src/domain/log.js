import { redact } from "./redact.js";

/**
 * One stdout event. The sentence, the private note, and secret values are
 * not fields. redact still runs so a request id cannot carry one through.
 *
 * @param {{ requestId?: string, route?: string, tool?: string }} trace
 * @param {{
 *   kind?: string,
 *   status?: string,
 *   preference?: string | null,
 *   tool?: string,
 *   outcome?: string,
 *   blobId?: string | null,
 *   keyPresent?: boolean,
 * }} fields
 */
export function gateEvent(trace, fields) {
  const event = {
    time: new Date().toISOString(),
    requestId: trace?.requestId || "none",
    route: trace?.route || "typed",
    kind: fields.kind ?? "note",
    status: fields.status ?? "recorded",
    preference: fields.preference ?? null,
    tool: fields.tool || trace?.tool || "",
    outcome: fields.outcome || fields.status || "recorded",
    keyPresent: fields.keyPresent === true,
  };
  if (typeof fields.blobId === "string" && fields.blobId) event.blobId = fields.blobId;
  try {
    return JSON.parse(redact(JSON.stringify(event)));
  } catch {
    return event;
  }
}
