import { MemWal } from "@mysten-incubation/memwal";
import { acceptCheckpoint } from "../domain/stamp.js";
import { locateMemory } from "./locate.js";

const NAMESPACE = "sederunt";

/**
 * Company account only. The caller passes the company delegate key.
 * The key is not returned and is not written into the memory text.
 */
export async function rememberCompany({ text, kind, knowableAtCheckpoint }) {
  const key = process.env.COMPANY_MEMWAL_KEY;
  const accountId = process.env.COMPANY_MEMWAL_ACCOUNT_ID;
  const serverUrl = process.env.COMPANY_MEMWAL_SERVER || "https://relayer.memory.walrus.xyz";
  if (!key || !accountId) {
    throw new Error("Company MemWal credentials are not set");
  }
  const memwal = MemWal.create({ key, accountId, serverUrl, namespace: NAMESPACE });
  const saved = await memwal.rememberAndWait(text, NAMESPACE, { timeoutMs: 90000 });
  return finishRecord({
    account: "company",
    accountId,
    kind,
    saved,
    knowableAtCheckpoint,
  });
}

async function safeLocate(blobId) {
  try {
    return await locateMemory(blobId);
  } catch (error) {
    return {
      objectId: null,
      checkpoint: null,
      locateError: error instanceof Error ? error.message : "locate failed",
    };
  }
}

export async function rememberPersonal({ text, kind, knowableAtCheckpoint }) {
  const key = process.env.PERSONAL_MEMWAL_KEY;
  const accountId = process.env.PERSONAL_MEMWAL_ACCOUNT_ID;
  const serverUrl = process.env.PERSONAL_MEMWAL_SERVER || "https://relayer.memory.walrus.xyz";
  if (!key || !accountId) {
    throw new Error("Personal MemWal credentials are not set");
  }
  const memwal = MemWal.create({ key, accountId, serverUrl, namespace: NAMESPACE });
  const saved = await memwal.rememberAndWait(text, NAMESPACE, { timeoutMs: 90000 });
  return finishRecord({
    account: "personal",
    accountId,
    kind,
    saved,
    knowableAtCheckpoint,
  });
}

async function finishRecord({ account, accountId, kind, saved, knowableAtCheckpoint }) {
  const located = await safeLocate(saved.blob_id);
  if (located.checkpoint != null && knowableAtCheckpoint != null) {
    const gate = acceptCheckpoint({
      checkpoint: located.checkpoint,
      knowableAtCheckpoint,
    });
    if (!gate.ok) {
      return {
        ok: false,
        reason: gate.reason,
        account,
        accountId,
        kind,
        blobId: saved.blob_id,
        namespace: saved.namespace,
        checkpoint: located.checkpoint,
        objectId: located.objectId,
      };
    }
  }
  const objectId = located.objectId;
  return {
    ok: true,
    account,
    accountId,
    kind,
    namespace: saved.namespace,
    blobId: saved.blob_id,
    objectId,
    checkpoint: located.checkpoint,
    explorerUrl: objectId ? `https://suiscan.xyz/mainnet/object/${objectId}` : null,
    locateError: located.locateError || null,
  };
}
