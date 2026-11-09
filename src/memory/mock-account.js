import { MemWalMock } from "@mysten-incubation/memwal";

/**
 * Two MemWal accounts for tests. The company key is not a delegate of the
 * personal account. The same idempotency key returns the first blob id.
 * Removing a delegate fails the next write and leaves the other delegate able to read.
 *
 * @param {{ accountId: string, delegates: string[] }} config
 */
export function mockAccount({ accountId, delegates }) {
  const mock = MemWalMock.create({ namespace: "sederunt", owner: accountId });
  const allowed = new Set(delegates);
  const seen = new Map();
  const documents = [];
  return {
    accountId,
    async remember(input) {
      const key = heldDelegate(input?.delegateKey, allowed);
      if (!allowed.has(key)) throw new Error("This account refused the key");
      const idempotencyKey = typeof input?.idempotencyKey === "string" ? input.idempotencyKey : "";
      if (idempotencyKey && seen.has(idempotencyKey)) {
        return { blobId: seen.get(idempotencyKey), accountId };
      }
      const saved = await mock.rememberAndWait(String(input?.text ?? ""), "sederunt", {
        idempotencyKey: idempotencyKey || undefined,
      });
      if (idempotencyKey) seen.set(idempotencyKey, saved.blob_id);
      documents.push({
        account: input?.account ?? "company",
        kind: input?.kind ?? "decision",
        blobId: saved.blob_id,
        decision: input?.decision ?? null,
        actionItem: input?.actionItem ?? null,
        preference: input?.preference ?? null,
        roomSetting: input?.roomSetting ?? null,
        expiry: input?.expiry ?? null,
        room: input?.room ?? null,
        access: input?.access ?? null,
      });
      return { blobId: saved.blob_id, accountId };
    },
    async index() {
      return documents.map((item) => ({
        account: item.account,
        kind: item.kind,
        blobId: item.blobId,
        decision: item.decision,
        actionItem: item.actionItem ?? null,
        preference: item.preference ?? null,
        roomSetting: item.roomSetting ?? null,
        expiry: item.expiry ?? null,
        room: item.room ?? null,
        access: item.access ?? null,
      }));
    },
    removeDelegate(key) {
      allowed.delete(key);
    },
    async recall(query, key) {
      const held = heldDelegate(key, allowed);
      if (!allowed.has(held)) return [];
      const result = await mock.recall({ query: query || "decision", topK: 10 });
      return result.results ?? [];
    },
  };
}

function heldDelegate(key, allowed) {
  if (typeof key === "string" && key) return key;
  if (allowed.size === 1) return [...allowed][0];
  return "";
}
