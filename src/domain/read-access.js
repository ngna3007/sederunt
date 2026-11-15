import { checkInvite } from "./invite.js";

export function canReadRecord(principal, record) {
  if (!record || record.deleted === true) return false;
  if (typeof principal === "string") return checkInvite(principal, record.inviteMemberIds).ok;
  if (!principal?.memberId) return false;
  if (checkInvite(principal.memberId, record.inviteMemberIds).ok) return true;
  if (record.account === "personal") return false;
  return (principal.identities || []).some((identity) =>
    (!identity.roomId || identity.roomId === record.roomId)
    && (identity.provider !== "slack" || /^[CGD][A-Z0-9]{8,}$/.test(record.roomId || ""))
    && checkInvite(identity.memberId, record.inviteMemberIds).ok);
}

export function readPrincipalId(principal) {
  return typeof principal === "string" ? principal.trim() : String(principal?.memberId || "").trim();
}

/**
 * A meeting the bot opened for this company, before anyone is listed on it.
 * Once member ids are stored, only those people can open it.
 *
 * @param {string | { memberId?: string, identities?: { memberId?: string, roomId?: string }[] }} principal
 * @param {{ id?: string, kind?: string, botPresent?: boolean, memberIds?: string[] } | null | undefined} room
 */
export function canReadOpenedMeeting(principal, room) {
  if (!room || room.kind !== "meeting" || room.botPresent !== true) return false;
  if (!readPrincipalId(principal)) return false;
  const ids = Array.isArray(room.memberIds) ? room.memberIds.filter((id) => typeof id === "string" && id) : [];
  if (!ids.length) return true;
  if (checkInvite(readPrincipalId(principal), ids).ok) return true;
  if (typeof principal !== "object" || !principal) return false;
  return (principal.identities || []).some((identity) =>
    (!identity.roomId || identity.roomId === room.id)
    && checkInvite(identity.memberId, ids).ok);
}

/**
 * Member ids on each meeting room the bot opened for this company. The join
 * stores who sent the bot; Recall names only participant ids ("100"), and
 * Google Meet gives no verified mailbox to bind them. The person who sent the
 * bot reads that meeting's company records (demo take-1, Nov 11: the kept
 * fact was stored for participant "100" only, so Home showed 0 decisions and
 * the room's media answered 404).
 *
 * @param {{ rooms?: Array<{ id?: string, kind?: string, memberIds?: string[] }> } | null | undefined} session
 * @returns {Map<string, string[]>}
 */
export function meetingRoomReaders(session) {
  const readers = new Map();
  for (const room of session?.rooms || []) {
    if (!room || room.kind !== "meeting" || typeof room.id !== "string" || !room.id) continue;
    const ids = (Array.isArray(room.memberIds) ? room.memberIds : []).filter((id) => typeof id === "string" && id.trim());
    if (!ids.length) continue;
    const known = readers.get(room.id) || [];
    for (const id of ids) if (!known.includes(id)) known.push(id);
    readers.set(room.id, known);
  }
  return readers;
}

/**
 * The record as its meeting room's members read it: a company record in a
 * meeting room is also invited to the room's stored members. Nothing is
 * written; a personal record is unchanged.
 *
 * @template {{ roomId?: string, account?: string, inviteMemberIds?: string[] }} T
 * @param {T} record
 * @param {Map<string, string[]>} readers
 * @returns {T}
 */
export function withMeetingReaders(record, readers) {
  // Personal records and notes are never widened, whatever room they were kept in.
  if (!record || record.account === "personal" || record.kind === "note" || record.private === true || !readers?.size) return record;
  const extra = readers.get(typeof record.roomId === "string" ? record.roomId : "");
  if (!extra?.length) return record;
  const invited = Array.isArray(record.inviteMemberIds) ? record.inviteMemberIds : [];
  if (!invited.length || extra.every((id) => invited.includes(id))) return record;
  return { ...record, inviteMemberIds: [...invited, ...extra.filter((id) => !invited.includes(id))] };
}

/** canReadRecord with the record's meeting room members also invited. */
export function canReadInSession(principal, record, readers) {
  return canReadRecord(principal, withMeetingReaders(record, readers));
}

export function readableSession(session, principal) {
  const readers = meetingRoomReaders(session);
  const decisions = (session.decisions || []).filter((record) => canReadInSession(principal, record, readers));
  const roomIds = new Set(decisions.map((record) => record.roomId));
  const actions = (session.actions || []).filter((action) => canReadInSession(principal, {
    ...action, inviteMemberIds: action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId],
  }, readers));
  return {
    ...session, decisions, actions,
    rooms: (session.rooms || []).filter((room) => roomIds.has(room.id)
      || checkInvite(readPrincipalId(principal), room.memberIds).ok
      || canReadOpenedMeeting(principal, room)),
    learned: (session.learned || []).filter((record) => {
      if (!record.sourceDecisionId || !canReadRecord(principal, record)) return false;
      return decisions.some((decision) => decision.id === record.sourceDecisionId && decision.roomId === record.roomId);
    }),
    activity: (session.activity || []).filter((row) => roomIds.has(row.origin?.roomId)),
    accesses: (session.accesses || []).filter((row) => roomIds.has(row.roomId)),
  };
}
