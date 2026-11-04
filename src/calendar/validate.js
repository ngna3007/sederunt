/**
 * Typed calendar failures. `code` is one of:
 * invalid-email, invalid-description, too-many, organizer,
 * not-found, read-only, forbidden, not-connected, network.
 */
export class CalendarError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "CalendarError";
    this.code = code;
  }
}

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** A trimmed address with one @ and a dotted domain. */
export function validEmail(value) {
  const email = String(value || "").trim();
  if (!email || email.length > 254) return "";
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "";
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return "";
  if (!EMAIL.test(email)) return "";
  return email;
}

/**
 * Check a description and guest list against the event already stored.
 * Emails are trimmed, checked, and deduped without regard to case.
 * The organizer stays on the list. At most 100 guests. Description ≤ 8000.
 *
 * @param {{ description?: unknown, attendees?: unknown, sendUpdates?: unknown, current?: { attendees?: Array<{ email?: string, name?: string, responseStatus?: string, organizer?: boolean }> } }} input
 */
export function validateEventUpdate(input = {}) {
  const description = input.description == null ? "" : input.description;
  if (typeof description !== "string") {
    throw new CalendarError("invalid-description", "Description must be text.");
  }
  if (description.length > 8000) {
    throw new CalendarError("invalid-description", "Description must be 8000 characters or fewer.");
  }
  if (input.sendUpdates !== "all" && input.sendUpdates !== "none") {
    throw new CalendarError("invalid-description", "Choose whether to notify guests.");
  }
  if (!Array.isArray(input.attendees)) {
    throw new CalendarError("invalid-email", "Enter a valid email address.");
  }
  const seen = new Set();
  const next = [];
  for (const item of input.attendees) {
    const raw = typeof item === "string" ? item : item?.email;
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) continue;
    const email = validEmail(trimmed);
    if (!email) {
      const shown = trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
      throw new CalendarError("invalid-email", `“${shown}” is not a valid email address.`);
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const prior = (input.current?.attendees || []).find((guest) => String(guest?.email || "").toLowerCase() === key);
    const guest = { email };
    const name = prior?.name || (item && typeof item === "object" ? item.name : "");
    if (name) guest.name = String(name).slice(0, 120);
    if (prior?.responseStatus) guest.responseStatus = String(prior.responseStatus);
    if (prior?.organizer) guest.organizer = true;
    next.push(guest);
  }
  if (next.length > 100) {
    throw new CalendarError("too-many", "A meeting can have at most 100 guests.");
  }
  for (const guest of input.current?.attendees || []) {
    if (!guest?.organizer) continue;
    const email = String(guest.email || "").trim().toLowerCase();
    if (email && !seen.has(email)) {
      throw new CalendarError("organizer", "The organizer cannot be removed.");
    }
  }
  return { description, attendees: next, sendUpdates: input.sendUpdates };
}

/**
 * Google Calendar MCP `update_event` arguments for a checked update.
 * Omitted fields stay unchanged on Google's side, so only what changed is
 * sent: `description` when it differs, `addedAttendees` and
 * `removedAttendeeEmails` from a case-insensitive diff against the stored
 * guests. The organizer is never removed. `sendUpdates` maps to
 * `notificationLevel` (all → ALL, none → NONE). Returns null when nothing
 * changed, so no write (and no guest email) goes out.
 *
 * @param {{ id: string, description?: string, attendees?: Array<{ email?: string, organizer?: boolean }> }} current
 * @param {{ description: string, attendees: Array<{ email: string, name?: string }>, sendUpdates: "all" | "none" }} next
 */
export function eventUpdateArgs(current, next) {
  const key = (guest) => String(guest?.email || "").trim().toLowerCase();
  const stored = (current?.attendees || []).filter((guest) => key(guest));
  const have = new Set(stored.map(key));
  const want = new Set(next.attendees.map(key));
  const addedAttendees = next.attendees
    .filter((guest) => !have.has(key(guest)))
    .map((guest) => (guest.name ? { email: guest.email, displayName: guest.name } : { email: guest.email }));
  const removedAttendeeEmails = stored
    .filter((guest) => !guest.organizer && !want.has(key(guest)))
    .map((guest) => String(guest.email).trim());
  const args = { eventId: current.id };
  if ((current?.description || "") !== next.description) args.description = next.description;
  if (addedAttendees.length) args.addedAttendees = addedAttendees;
  if (removedAttendeeEmails.length) args.removedAttendeeEmails = removedAttendeeEmails;
  if (Object.keys(args).length === 1) return null;
  args.notificationLevel = next.sendUpdates === "none" ? "NONE" : "ALL";
  return args;
}

/**
 * @param {unknown} error
 */
export function asCalendarError(error) {
  if (error instanceof CalendarError) return error;
  const status = Number(error?.status) || 0;
  if (status === 404) return new CalendarError("not-found", "That meeting was not found.");
  if (status === 401) return new CalendarError("not-connected", "Calendar is not connected.");
  if (status === 403) return new CalendarError("forbidden", "Calendar refused that change.");
  return new CalendarError("network", "Calendar could not be reached. Try again.");
}

/**
 * @param {string} code
 */
export function calendarStatus(code) {
  if (code === "invalid-email" || code === "invalid-description" || code === "too-many" || code === "organizer") return 400;
  if (code === "not-found") return 404;
  if (code === "read-only" || code === "forbidden") return 403;
  if (code === "not-connected") return 409;
  return 502;
}
