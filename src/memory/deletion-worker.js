import { deletionMatches, decisionDeletionScope } from "./deletions.js";

export async function drainDeletions({ store, resolveDecisions, writeTombstone, limit = 10, leaseSeconds = 60 }) {
  const intents = await store.claim({ limit, leaseSeconds });
  const result = { claimed: intents.length, completed: 0, failed: 0, lostLease: 0 };
  for (const intent of intents) {
    try {
      const decisions = await resolveDecisions(intent);
      if (!Array.isArray(decisions)) throw new Error("Deletion records unavailable");
      for (const decision of decisions) {
        if (!deletionMatches(intent, decisionDeletionScope(intent.tenantId, decision))) continue;
        const receipt = await writeTombstone({ intent, decision });
        if (receipt == null) throw new Error("Deletion write was not acknowledged");
      }
      if (await store.complete(intent)) result.completed++; else result.lostLease++;
    } catch {
      if (await store.fail(intent)) result.failed++; else result.lostLease++;
    }
  }
  return result;
}
