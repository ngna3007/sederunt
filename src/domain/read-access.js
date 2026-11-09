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

export function readableSession(session, principal) {
  const decisions = (session.decisions || []).filter((record) => canReadRecord(principal, record));
  const roomIds = new Set(decisions.map((record) => record.roomId));
  const actions = (session.actions || []).filter((action) => canReadRecord(principal, {
    ...action, inviteMemberIds: action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId],
  }));
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
