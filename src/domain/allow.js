/**
 * Read needs no allow. A write or a delete runs only when a standing allow
 * covers that tool, or a spoken yes covers this proposal and this tool.
 * A spoken yes for a different proposal does not travel.
 *
 * @param {{
 *   action: "read" | "write" | "delete",
 *   tool: string,
 *   proposalId?: string | null,
 *   standingAllows?: Array<{ tool: string }>,
 *   spokenYes?: { proposalId: string, tool: string } | null,
 * }} input
 */
export function authorize(input) {
  if (input.action === "read") {
    return { allowed: true, reason: "read" };
  }
  if (input.action !== "write" && input.action !== "delete") {
    return { allowed: false, reason: "missing-allow" };
  }
  const standing = input.standingAllows ?? [];
  if (standing.some((allow) => allow.tool === input.tool)) {
    return { allowed: true, reason: "standing" };
  }
  const yes = input.spokenYes;
  if (
    yes &&
    yes.proposalId &&
    yes.proposalId === input.proposalId &&
    yes.tool === input.tool
  ) {
    return { allowed: true, reason: "spoken-yes" };
  }
  return { allowed: false, reason: "missing-allow" };
}
