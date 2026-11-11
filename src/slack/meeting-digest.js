import { canReadInSession, meetingRoomReaders, readPrincipalId } from "../domain/read-access.js";
import { checkInvite } from "../domain/invite.js";

// Demo step 4 (Nov 11, 6:39 PM ICT): "What happened in the Google Meet we just
// had?" got "Nothing is stored that you can read about that." The asker was
// linked and was the Meet room's only stored member, but the Slack ask prompt
// listed only bare decision sentences ("the design review moved to thursday")
// with no meeting, time, Linear issue, Calendar event or transcript, and the
// MemWal hits (all room documents) never matched a decision row. A question
// about a meeting needs the asker's own recent meetings, not a sentence search.

// "meet" alone is usually the verb ("meet the deadline", "when do we meet"), and
// "minutes" a duration ("in 5 minutes"): only the noun forms count.
const MEETING_WORDS = /\b(?:meetings?|(?:google|the|that|this|our|a|last|today'?s|yesterday'?s)\s+meet|zoom|ms\s+teams|teams\s+(?:call|meeting)|calls?|huddles?|stand-?ups?|recap|(?:meeting|the)\s+minutes)\b/i;
const DISCUSSED = /\bwe\s+(?:just\s+)?(?:discuss(?:ed)?|talk(?:ed)?\s+about|cover(?:ed)?|decide[d]?|agree[d]?)\b/i;

const DEFAULT_LIMIT = 3;
const TRANSCRIPT_LINES = 60;
const TRANSCRIPT_CHARS = 4_000;
const LINE_CHARS = 300;

/** Whether a Slack question is about a meeting or call (the one we just had, the last one, today's). */
export function isMeetingQuestion(text) {
  const asked = String(text ?? "");
  return MEETING_WORDS.test(asked) || DISCUSSED.test(asked);
}

/**
 * Meeting rooms the principal is a stored member of, newest first.
 * Only an explicit member id on the room counts: a room with no stored members,
 * or one that lists only Slack or Recall ids, is never opened here.
 *
 * @param {{ rooms?: any[] }} session
 * @param {string | { memberId?: string }} principal
 */
export function accessibleMeetings(session, principal, limit = DEFAULT_LIMIT) {
  const memberId = readPrincipalId(principal);
  if (!memberId) return [];
  const seen = new Set();
  const rooms = [];
  for (const room of session?.rooms || []) {
    if (!room || room.kind !== "meeting" || typeof room.id !== "string" || !room.id || seen.has(room.id)) continue;
    if (room.deleted === true) continue;
    const ids = (Array.isArray(room.memberIds) ? room.memberIds : []).filter((id) => typeof id === "string" && id.trim());
    if (!ids.length || !checkInvite(memberId, ids).ok) continue;
    seen.add(room.id);
    rooms.push(room);
  }
  rooms.sort((a, b) => startMs(b) - startMs(a));
  return rooms.slice(0, Math.max(0, limit));
}

/**
 * One prompt memory per recent meeting the principal attended: when it was,
 * its decisions, its activity (Linear issues, Calendar events, ...) and the end
 * of its transcript. Records are filtered with the same read check as recall.
 *
 * @param {any} session
 * @param {string | { memberId?: string, identities?: any[] }} principal
 * @param {{ rooms?: any[], activity?: Map<string, any[]>, timeZone?: string, now?: number, limit?: number }} [options]
 * @returns {{ id: string, kind: "meeting", roomId: string, text: string, fileNames: [] }[]}
 */
export function meetingDigestRows(session, principal, options = {}) {
  const rooms = Array.isArray(options.rooms) ? options.rooms : accessibleMeetings(session, principal, options.limit);
  const memberId = readPrincipalId(principal);
  if (!memberId || !rooms.length) return [];
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const readers = meetingRoomReaders(session);
  const rows = [];
  rooms.forEach((room, index) => {
    // Never trust a caller-supplied room list: membership is re-checked here.
    const ids = Array.isArray(room?.memberIds) ? room.memberIds : [];
    if (room?.kind !== "meeting" || !checkInvite(memberId, ids).ok) return;
    const parts = [];
    parts.push(`${index === 0 ? "Most recent meeting" : `Earlier meeting ${index + 1}`} (${meetingLabel(room)}): ${whenLabel(room, options.timeZone, now)}.`);
    const decisions = (session?.decisions || [])
      .filter((decision) => decision && !decision.deleted && decision.roomId === room.id && canReadInSession(principal, decision, readers))
      .map((decision) => clip(String(decision.text || ""), LINE_CHARS))
      .filter(Boolean);
    const uniqueDecisions = [...new Set(decisions.map((text) => text.toLowerCase()))].map((key) => decisions.find((text) => text.toLowerCase() === key));
    if (uniqueDecisions.length) parts.push(`Decisions: ${uniqueDecisions.join("; ")}.`);
    const activity = activityLines(session, principal, room, options.activity?.get(room.id) || [], readers);
    if (activity.length) parts.push(`Activity: ${activity.join("; ")}.`);
    const transcript = transcriptText(room.lines);
    if (transcript) parts.push(`Transcript: ${transcript}`);
    rows.push({ id: `meeting:${room.id}`, kind: "meeting", roomId: room.id, text: parts.join(" "), fileNames: [] });
  });
  return rows;
}

function activityLines(session, principal, room, published, readers) {
  const lines = [];
  const mentioned = (needle) => needle && lines.some((line) => line.toLowerCase().includes(String(needle).toLowerCase()));
  for (const row of published) {
    if (!row || row.origin?.roomId !== room.id) continue;
    if (row.kind === "resolve" || row.kind === "supersede" || row.superseded === true) continue;
    const sentence = clip(String(row.sentence || ""), LINE_CHARS);
    if (!sentence) continue;
    const undone = row.outcome === "undone" ? " (undone)" : "";
    const failed = row.kind === "failure" && !row.resolved ? " (failed)" : "";
    if (!mentioned(sentence)) lines.push(`${sentence}${undone}${failed}`);
  }
  // Actions kept on the room (filed issues, scheduled events) when the activity mirror has expired.
  for (const action of session?.actions || []) {
    if (!action || action.roomId !== room.id || action.deleted === true) continue;
    const invite = Array.isArray(action.inviteMemberIds) && action.inviteMemberIds.length ? action.inviteMemberIds : [action.memberId];
    if (!canReadInSession(principal, { ...action, inviteMemberIds: invite }, readers)) continue;
    const ref = typeof action.connectorId === "string" ? action.connectorId.trim() : "";
    if (!ref || mentioned(ref)) continue;
    const title = clip(String(action.params?.title || action.params?.summary || action.statement || ""), LINE_CHARS);
    lines.push(`${toolLabel(action.tool)} ${ref}${title ? ` "${title}"` : ""}`);
  }
  return lines;
}

function transcriptText(lines) {
  const list = (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const text = clip(String(line?.text || "").replace(/\s+/g, " ").trim(), LINE_CHARS);
      if (!text) return "";
      const speaker = String(line?.speaker || "").trim() || "Someone";
      const at = offsetLabel(line?.start);
      return `${at ? `(${at}) ` : ""}${speaker}: ${text}`;
    })
    .filter(Boolean);
  if (!list.length) return "";
  const kept = [];
  let size = 0;
  for (let i = list.length - 1; i >= 0 && kept.length < TRANSCRIPT_LINES; i -= 1) {
    if (size + list[i].length > TRANSCRIPT_CHARS) break;
    kept.unshift(list[i]);
    size += list[i].length + 3;
  }
  const omitted = list.length - kept.length;
  return `${omitted > 0 ? "(earlier lines omitted) " : ""}${kept.join(" | ")}`;
}

/** Transcript time from the start of the call, like 01:05, for minutes citations. */
function offsetLabel(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "";
  const total = Math.floor(value);
  const pad = (n) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}` : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function meetingLabel(room) {
  const raw = String(room.platform || "").trim();
  const named = { google_meet: "Google Meet", zoom: "Zoom", microsoft_teams: "Microsoft Teams", teams: "Microsoft Teams" }[raw.toLowerCase()];
  return named || raw || "meeting";
}

function whenLabel(room, timeZone, now) {
  const start = startMs(room);
  if (!start) return "start time unknown";
  const zone = validZone(timeZone) ? timeZone : "UTC";
  const stamp = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(start));
  const minutes = Number(room.duration) > 0 ? Math.max(1, Math.round(Number(room.duration) / 60)) : 0;
  const end = minutes ? start + Number(room.duration) * 1000 : start;
  const ago = relative(now - end);
  const live = room.call && !/done|ended|left|fatal/i.test(String(room.call)) && !minutes;
  return `started ${stamp} (${zone})${minutes ? `, lasted ${minutes} min` : ""}${live ? ", may still be in progress" : (ago ? `, ${minutes ? "ended" : "started"} ${ago}` : "")}`;
}

function relative(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function validZone(zone) {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function startMs(room) {
  const ms = Date.parse(String(room?.startedAt || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function toolLabel(tool) {
  const name = String(tool || "").trim().toLowerCase();
  if (name === "linear") return "Linear issue";
  if (name === "calendar") return "Calendar event";
  return name ? `${name} item` : "item";
}

function clip(text, max) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
