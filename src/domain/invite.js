/**
 * No member id is missing-member. An id absent from the stored invite set
 * is not-invited. The sentence stays with the caller.
 *
 * @param {string | null | undefined} memberId
 * @param {string[] | null | undefined} inviteMemberIds
 */
export function checkInvite(memberId, inviteMemberIds) {
  if (typeof memberId !== "string" || memberId.trim() === "") {
    return { ok: false, reason: "missing-member" };
  }
  const ids = Array.isArray(inviteMemberIds) ? inviteMemberIds : [];
  if (!ids.includes(memberId)) return { ok: false, reason: "not-invited" };
  return { ok: true, reason: "invited" };
}
