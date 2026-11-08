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

export function readableSession(session, principal) {
  const decisions = (session.decisions || []).filter((record) => canReadRecord(principal, record));
  const roomIds = new Set(decisions.map((record) => record.roomId));
  const actions = (session.actions || []).filter((action) => canReadRecord(principal, {
    ...action, inviteMemberIds: action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId],
  }));
  return {
    ...session, decisions, actions,
    rooms: (session.rooms || []).filter((room) => roomIds.has(room.id)
      || checkInvite(readPrincipalId(principal), room.memberIds).ok),
    learned: (session.learned || []).filter((record) => roomIds.has(record.roomId)),
    activity: (session.activity || []).filter((row) => roomIds.has(row.origin?.roomId)),
    accesses: (session.accesses || []).filter((row) => roomIds.has(row.roomId)),
  };
}
