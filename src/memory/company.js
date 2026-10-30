import { MemWal } from "@mysten-incubation/memwal";
import { acceptCheckpoint } from "../domain/stamp.js";
import { locateMemory } from "./locate.js";

const NAMESPACE = "sederunt";
const DECISION_MARK = "sederunt-decision";

/**
 * Company account only. The caller passes the company delegate key.
 * The key is not returned and is not written into the memory text.
 * The stored text is the memory document, so a later index can rebuild a
 * decision, a tool preference, a room voice and clash, an opened meeting room,
 * an observed epoch, or who asked when no sentence was returned.
 * An epoch on the job is recorded. This process does not extend the blob.
 * Pass `client` to use a fake relayer. Without one, the live client is used.
 */
export async function rememberCompany({ text, kind, knowableAtCheckpoint, decision, preference, roomSetting, expiry, room, access, account, client, env = process.env, idempotencyKey }) {
  const key = env.COMPANY_MEMWAL_KEY;
  const accountId = env.COMPANY_MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) {
    throw new Error("Company MemWal credentials are not set");
  }
  const memwal = client ?? liveClient(env);
  const saved = await memwal.rememberAndWait(decisionPayload({ text, kind, decision, preference, roomSetting, expiry, room, access, account }), NAMESPACE, {
    timeoutMs: 90000,
    idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
  });
  return finishRecord({
    account: account ?? "company",
    accountId,
    kind,
    saved,
    knowableAtCheckpoint,
  });
}

/**
 * Decisions previously stored by rememberCompany. Each row carries the document.
 * A fake client stays in the test. The live client is used only when none is passed.
 */
export async function indexCompany({ client, env = process.env } = {}) {
  const key = env.COMPANY_MEMWAL_KEY;
  const accountId = env.COMPANY_MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) return [];
  const memwal = client ?? liveClient(env);
  const result = await memwal.recall({ query: DECISION_MARK, topK: 50, namespace: NAMESPACE });
  const hits = Array.isArray(result?.results) ? result.results : [];
  const rows = [];
  for (const hit of hits) {
    const parsed = readDecisionPayload(hit?.text);
    if (!parsed) continue;
    rows.push({
      account: parsed.account ?? "company",
      kind: parsed.kind ?? "decision",
      blobId: typeof hit?.blob_id === "string" ? hit.blob_id : null,
      decision: parsed.decision ?? null,
      preference: parsed.preference ?? null,
      roomSetting: parsed.roomSetting ?? null,
      expiry: parsed.expiry ?? null,
      room: parsed.room ?? null,
      access: parsed.access ?? null,
    });
  }
  return rows;
}

function decisionPayload(input) {
  return JSON.stringify({
    mark: DECISION_MARK,
    text: typeof input?.text === "string" ? input.text : "",
    kind: input?.kind ?? "decision",
    account: input?.account ?? "company",
    decision: input?.decision ?? null,
    preference: input?.preference ?? null,
    roomSetting: input?.roomSetting ?? null,
    expiry: input?.expiry ?? null,
    room: input?.room ?? null,
    access: input?.access ?? null,
  });
}

function readDecisionPayload(text) {
  if (typeof text !== "string" || !text.includes(DECISION_MARK)) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.mark !== DECISION_MARK) return null;
    if (!parsed.decision && !parsed.preference && !parsed.roomSetting && !parsed.expiry && !parsed.room && !parsed.access) return null;
    return parsed;
  } catch {
    return null;
  }
}

function liveClient(env) {
  const serverUrl = env.COMPANY_MEMWAL_SERVER || "https://relayer.memory.walrus.xyz";
  return MemWal.create({
    key: env.COMPANY_MEMWAL_KEY,
    accountId: env.COMPANY_MEMWAL_ACCOUNT_ID,
    serverUrl,
    namespace: NAMESPACE,
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
        expiryEpoch: observedEpoch(saved),
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
    expiryEpoch: observedEpoch(saved),
    explorerUrl: objectId ? `https://suiscan.xyz/mainnet/object/${objectId}` : null,
    locateError: located.locateError || null,
  };
}

function observedEpoch(saved) {
  const value = saved?.expiryEpoch ?? saved?.expiry_epoch ?? saved?.end_epoch;
  return Number.isInteger(value) && value >= 0 ? value : null;
}
