import { createHash, randomUUID } from "node:crypto";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function identifier(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("Deletion scope is invalid");
  return value;
}
export function deletionTargets({ tenantId, roomId, sourceIds = [], decisionIds = [] }) {
  if (!uuid.test(tenantId) || !Array.isArray(sourceIds) || !Array.isArray(decisionIds)) throw new Error("Deletion scope is invalid");
  identifier(roomId);
  const targets = [...sourceIds.map((id) => ["source", identifier(id)]), ...decisionIds.map((id) => ["decision", identifier(id)])];
  if (!targets.length || targets.length > 100) throw new Error("Deletion needs between one and 100 targets");
  return [...new Map(targets.map(([kind, id]) => {
    const target = { tenantId: tenantId.toLowerCase(), roomKey: digest(["room", roomId]), targetKind: kind, targetKey: digest([kind, id]) };
    return [digest(target), target];
  })).values()];
}
export function deletionMatches(intent, { tenantId, roomId, sourceIds = [], decisionIds = [] }) {
  if (intent.tenantId !== tenantId?.toLowerCase() || intent.roomKey !== digest(["room", roomId])) return false;
  const ids = intent.targetKind === "source" ? sourceIds : decisionIds;
  return ids.some((id) => typeof id === "string" && intent.targetKey === digest([intent.targetKind, id]));
}
export function decisionDeletionScope(tenantId, decision) {
  return { tenantId, roomId: decision?.roomId, sourceIds: [decision?.sourceDeliveryId].filter(Boolean), decisionIds: [decision?.id].filter(Boolean) };
}
export async function filterDeletedDecisions(store, tenantId, decisions) {
  const intents = await store.list(tenantId);
  return decisions.filter((decision) => !decision.deleted && !intents.some((intent) => deletionMatches(intent, decisionDeletionScope(tenantId, decision))));
}
export function withDeletionOverlay(memory, store, tenantId) {
  const wrap = (method) => async (...args) => {
    const rows = await memory[method](...args);
    const intents = await store.list(tenantId);
    return rows.filter((row) => {
      const action = row.actionItem?.actionRecord;
      const activity = row.activity;
      const record = row.decision || (action && { id: action.id, roomId: action.roomId, sourceDeliveryId: action.deliveryId })
        || (activity?.origin?.sourceDeliveryId && { id: activity.requestId, roomId: activity.origin.roomId, sourceDeliveryId: activity.origin.sourceDeliveryId });
      return !record || (!record.deleted && !intents.some((intent) => deletionMatches(intent, decisionDeletionScope(tenantId, record))));
    });
  };
  return { ...memory, ...(typeof memory.index === "function" ? { index: wrap("index") } : {}), ...(typeof memory.recall === "function" ? { recall: wrap("recall") } : {}) };
}
const fromRow = (row) => ({ id: row.id, tenantId: row.tenant_id, roomKey: row.room_key, targetKind: row.target_kind, targetKey: row.target_key, state: row.state, attempts: row.attempts, leaseToken: row.lease_token, leaseUntil: row.lease_until, nextAttemptAt: row.next_attempt_at });
export function createDeletionStore(env, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  async function rpc(name, body) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/memory_deletion_${name}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Deletion database is unavailable");
    return response.json();
  }
  return {
    async request(scope) { return (await rpc("request", { p_targets: deletionTargets(scope) })).map(fromRow); },
    async list(tenantId) { if (!uuid.test(tenantId)) throw new Error("Deletion scope is invalid"); return (await rpc("list", { p_tenant_id: tenantId })).map(fromRow); },
    async claim({ limit = 10, leaseSeconds = 60 } = {}) { return (await rpc("claim", { p_limit: limit, p_lease_seconds: leaseSeconds })).map(fromRow); },
    complete(intent) { return rpc("finish", { p_id: intent.id, p_token: intent.leaseToken, p_success: true }); },
    fail(intent) { return rpc("finish", { p_id: intent.id, p_token: intent.leaseToken, p_success: false }); },
  };
}

// The local adapter uses the same durable intent/lease contract without a hosted database.
export async function createLocalDeletionStore(file) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS deletions (id TEXT PRIMARY KEY, target TEXT UNIQUE, row TEXT NOT NULL)");
  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const rows = () => db.prepare("SELECT row FROM deletions").all().map((entry) => JSON.parse(entry.row));
  const save = (row) => db.prepare("UPDATE deletions SET row=? WHERE id=?").run(JSON.stringify(row), row.id);
  function finish(intent, success) {
    return transaction(() => {
      const row = rows().find((entry) => entry.id === intent.id);
      if (!row || row.state !== "running" || row.leaseToken !== intent.leaseToken || row.leaseUntil <= Date.now()) return false;
      row.state = success ? "done" : "failed";
      row.nextAttemptAt = Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(row.attempts, 12));
      row.leaseToken = null; row.leaseUntil = null; save(row); return true;
    });
  }
  return {
    async request(scope) { const targets = deletionTargets(scope); return transaction(() => targets.map((target) => {
      const targetKey = digest(target);
      const existing = db.prepare("SELECT row FROM deletions WHERE target=?").get(targetKey);
      if (existing) return JSON.parse(existing.row);
      const row = { ...target, id: randomUUID(), state: "pending", attempts: 0, leaseToken: null, leaseUntil: null, nextAttemptAt: 0 };
      db.prepare("INSERT INTO deletions VALUES (?,?,?)").run(row.id, targetKey, JSON.stringify(row)); return row;
    })); },
    async list(tenantId) { if (!uuid.test(tenantId)) throw new Error("Deletion scope is invalid"); return rows().filter((row) => row.tenantId === tenantId.toLowerCase()); },
    async claim({ limit = 10, leaseSeconds = 60 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) throw new Error("Invalid deletion claim bounds");
      return transaction(() => rows().filter((row) => row.state !== "done" && (row.state === "running" ? row.leaseUntil <= Date.now() : row.nextAttemptAt <= Date.now())).slice(0, limit).map((row) => {
        row.state = "running"; row.attempts++; row.leaseToken = randomUUID(); row.leaseUntil = Date.now() + leaseSeconds * 1000; save(row); return row;
      }));
    },
    async complete(intent) { return finish(intent, true); },
    async fail(intent) { return finish(intent, false); },
    close() { db.close(); },
  };
}
