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
export async function rememberCompany({ text, kind, knowableAtCheckpoint, decision, preference, roomSetting, expiry, room, access, hearing, learned, minutes, actionItem, account, tenantId, client, env = process.env, idempotencyKey, tatum }) {
  const key = env.COMPANY_MEMWAL_KEY;
  const accountId = env.COMPANY_MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) {
    throw new Error("Company MemWal credentials are not set");
  }
  const memwal = client ?? liveClient(env);
  const saved = await memwal.rememberAndWait(decisionPayload({ text, kind, decision, preference, roomSetting, expiry, room, access, hearing, learned, minutes, actionItem, account, tenantId }), NAMESPACE, {
    timeoutMs: 45000,
    idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
  });
  return finishRecord({
    account: account ?? "company",
    accountId,
    kind,
    saved,
    knowableAtCheckpoint,
    tatum,
  });
}

/**
 * Decisions previously stored by rememberCompany. Each row carries the document.
 * A fake client stays in the test. The live client is used only when none is passed.
 */
export async function recallHitCount({ client, env = process.env } = {}) {
  if (!env.COMPANY_MEMWAL_KEY || !env.COMPANY_MEMWAL_ACCOUNT_ID) return 0;
  const memwal = client ?? liveClient(env);
  const result = await memwal.recall({ query: "sederunt", topK: 5, namespace: NAMESPACE });
  return Array.isArray(result?.results) ? result.results.length : 0;
}


/**
 * Semantic recall for a natural-language question (Walrus Memory chatbot ask path).
 * Returns parsed decision documents, newest-among-matches left to the caller to filter.
 */
export async function recallCompany({ query, topK = 10, tenantId, allowUnscoped = false, client, env = process.env } = {}) {
  const key = env.COMPANY_MEMWAL_KEY;
  const accountId = env.COMPANY_MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) return [];
  const q = String(query ?? "").trim() || DECISION_MARK;
  const memwal = client ?? liveClient(env);
  const result = await memwal.recall({
    query: q.slice(0, 16384),
    topK: Math.max(1, Math.min(Number(topK) || 10, 100)),
    namespace: NAMESPACE,
  });
  const hits = Array.isArray(result?.results) ? result.results : [];
  const rows = [];
  for (const hit of hits) {
    const parsed = readDecisionPayload(hit?.text);
    if (!parsed) continue;
    if (!tenantOwns(parsed, tenantId, { allowUnscoped })) continue;
    rows.push(rowFromParsed(parsed, hit));
  }
  return rows;
}

export async function indexCompany({ client, env = process.env, tenantId, allowUnscoped = false } = {}) {
  const key = env.COMPANY_MEMWAL_KEY;
  const accountId = env.COMPANY_MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) return [];
  const memwal = client ?? liveClient(env);
  // MemWal has no full list API — a single recall(mark) only returns the topK
  // nearest to the mark string, so recent keeps fall off the console board.
  // Union several query seeds so Decisions / Ask visible cover live demo content.
  const queries = [
    DECISION_MARK,
    "please keep decision",
    "remember this",
    "Northline office launch billing",
    "District 7 Building floors move-in",
    "meeting room hearing",
  ];
  const byKey = new Map();
  const batches = await Promise.all(queries.map(async (query) => {
    try {
      const result = await memwal.recall({ query, topK: 50, namespace: NAMESPACE });
      return Array.isArray(result?.results) ? result.results : [];
    } catch {
      return [];
    }
  }));
  for (const hits of batches) {
    for (const hit of hits) {
      const parsed = readDecisionPayload(hit?.text);
      if (!parsed) continue;
      if (!tenantOwns(parsed, tenantId, { allowUnscoped })) continue;
      const blobId = typeof hit?.blob_id === "string" ? hit.blob_id : "";
      const decisionId = typeof parsed.decision?.id === "string" ? parsed.decision.id : "";
      const mapKey = blobId || decisionId || `${parsed.kind}:${String(parsed.decision?.text || parsed.text || "").slice(0, 80)}`;
      if (!mapKey || byKey.has(mapKey)) continue;
      byKey.set(mapKey, rowFromParsed(parsed, hit));
    }
  }
  return [...byKey.values()];
}

function decisionPayload(input) {
  const tenantId = normalizeTenantId(input?.tenantId);
  return JSON.stringify({
    mark: DECISION_MARK,
    text: typeof input?.text === "string" ? input.text : "",
    kind: input?.kind ?? "decision",
    account: input?.account ?? "company",
    tenantId,
    decision: input?.decision ?? null,
    preference: input?.preference ?? null,
    roomSetting: input?.roomSetting ?? null,
    expiry: input?.expiry ?? null,
    room: input?.room ?? null,
    access: input?.access ?? null,
    hearing: input?.hearing ?? null,
    activity: input?.activity ?? null,
    learned: input?.learned ?? null,
    minutes: input?.minutes ?? null,
    actionItem: input?.actionItem ?? null,
  });
}

/**
 * Workspace ownership for company memory. A missing tenantId on a stored
 * document is legacy/unscoped and is never visible to a real workspace id.
 * An empty requested tenant fails closed unless allowUnscoped is set (local
 * demos without identity). Production must never set allowUnscoped.
 */
export function tenantOwns(parsed, tenantId, options = {}) {
  const want = normalizeTenantId(tenantId);
  const have = normalizeTenantId(parsed?.tenantId);
  if (want) return want === have;
  if (options.allowUnscoped === true) return !have;
  return false;
}

export function normalizeTenantId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function rowFromParsed(parsed, hit) {
  const blobId = typeof hit?.blob_id === "string" ? hit.blob_id : null;
  return {
    account: parsed.account ?? "company",
    kind: parsed.kind ?? "decision",
    tenantId: normalizeTenantId(parsed.tenantId),
    blobId,
    distance: typeof hit?.distance === "number" ? hit.distance : null,
    decision: parsed.decision ?? null,
    preference: parsed.preference ?? null,
    roomSetting: parsed.roomSetting ?? null,
    expiry: parsed.expiry ?? null,
    room: parsed.room ?? null,
    access: parsed.access ?? null,
    hearing: parsed.hearing ?? null,
    activity: parsed.activity ?? null,
    learned: parsed.learned ?? null,
    minutes: parsed.minutes ?? null,
    actionItem: parsed.actionItem ?? null,
  };
}

function readDecisionPayload(text) {
  if (typeof text !== "string" || !text.includes(DECISION_MARK)) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.mark !== DECISION_MARK) return null;
    if (!parsed.decision && !parsed.preference && !parsed.roomSetting && !parsed.expiry && !parsed.room && !parsed.access && !parsed.hearing && !parsed.activity && !parsed.learned && !parsed.minutes && !parsed.actionItem) return null;
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

async function safeLocate(blobId, saved, tatum) {
  if (!tatum || typeof tatum.getObject !== "function") {
    return { objectId: null, checkpoint: null, digest: null, locateError: "Tatum key not set" };
  }
  try {
    return await locateMemory(blobId, {
      tatum,
      owner: typeof saved?.owner === "string" ? saved.owner : "",
      objectId: typeof saved?.object_id === "string" ? saved.object_id : "",
    });
  } catch (error) {
    return {
      objectId: null,
      checkpoint: null,
      digest: null,
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
  const saved = await memwal.rememberAndWait(text, NAMESPACE, { timeoutMs: 45000 });
  return finishRecord({
    account: "personal",
    accountId,
    kind,
    saved,
    knowableAtCheckpoint,
  });
}

async function finishRecord({ account, accountId, kind, saved, knowableAtCheckpoint, tatum }) {
  const located = await safeLocate(saved.blob_id, saved, tatum);
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
    digest: located.digest || null,
    checkpoint: located.checkpoint,
    owner: typeof saved?.owner === "string" ? saved.owner : null,
    expiryEpoch: observedEpoch(saved),
    explorerUrl: objectId ? `https://suiscan.xyz/mainnet/object/${objectId}` : null,
    locateError: located.locateError || null,
  };
}

function observedEpoch(saved) {
  const value = saved?.expiryEpoch ?? saved?.expiry_epoch ?? saved?.end_epoch;
  return Number.isInteger(value) && value >= 0 ? value : null;
}
