/**
 * Clash is a pure function of the decision objects.
 * Newest does not win. Every decision stays in the result.
 *
 * A decision with no predecessor, and no live contradiction, is current.
 * Two decisions that contradict each other, and are not replaced, are both clashing.
 * A decision with replacedBy set is replaced and stays visible.
 *
 * @param {Array<{
 *   id: string,
 *   area?: string,
 *   contradicts?: string[],
 *   predecessorId?: string | null,
 *   replacedBy?: string | null,
 *   replaces?: string | null,
 *   checkpoint?: number,
 * }>} decisions
 */
export function clashStatuses(decisions) {
  const ids = new Set(decisions.map((decision) => decision.id));
  const replaced = new Set(
    decisions.filter((decision) => decision.replacedBy).map((decision) => decision.id),
  );
  const clashing = new Set();
  for (const decision of decisions) {
    if (replaced.has(decision.id)) continue;
    for (const otherId of decision.contradicts ?? []) {
      if (!ids.has(otherId) || replaced.has(otherId)) continue;
      clashing.add(decision.id);
      clashing.add(otherId);
    }
  }
  return decisions.map((decision) => {
    let status = "recorded";
    if (decision.replacedBy) status = "replaced";
    else if (clashing.has(decision.id)) status = "clashing";
    else if (!decision.predecessorId) status = "current";
    else if (decision.replaces && replaced.has(decision.replaces)) status = "current";
    return {
      id: decision.id,
      area: decision.area ?? "",
      status,
    };
  });
}
