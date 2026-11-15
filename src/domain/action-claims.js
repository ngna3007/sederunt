import { createHash } from "node:crypto";

const tenantPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireTenant(tenantId) {
  if (typeof tenantId !== "string" || !tenantPattern.test(tenantId)) throw new Error("Action claim requires a tenant.");
  return tenantId;
}

function requireClaimText(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("Action claim requires a room, source and action.");
  return value;
}

/** Sorted keys and trimmed strings, so the same arguments hash once. */
export function canonicalClaimArgs(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => canonicalClaimArgs(item));
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalClaimArgs(value[key]);
    return out;
  }
  return null;
}

function legacyClaimKey({ tenantId, roomId, sourceId, action }) {
  requireTenant(tenantId);
  requireClaimText(roomId);
  requireClaimText(sourceId);
  requireClaimText(action);
  return createHash("sha256").update(JSON.stringify([roomId, sourceId, action])).digest("hex");
}

function toolClaimKey({ tenantId, roomId, toolName, args }) {
  const tenant = requireTenant(tenantId).toLowerCase();
  const room = requireClaimText(roomId).trim();
  const tool = requireClaimText(toolName).trim();
  const body = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  return createHash("sha256").update(JSON.stringify([tenant, room, tool, canonicalClaimArgs(body)])).digest("hex");
}

function isToolClaim(scope) {
  return typeof scope?.toolName === "string" && scope.toolName.trim()
    && scope.args && typeof scope.args === "object" && !Array.isArray(scope.args);
}

function isLegacyClaim(scope) {
  return typeof scope?.sourceId === "string" && scope.sourceId.trim()
    && typeof scope?.action === "string" && scope.action.trim();
}

/**
 * Tool claims hash tenant, room, tool, and canonical args.
 * Callers that still pass source and action keep the previous digest.
 */
export function actionClaimKey(scope) {
  if (isToolClaim(scope)) return toolClaimKey(scope);
  return legacyClaimKey(scope);
}

function claimDigests(scope) {
  const keys = [];
  if (isToolClaim(scope)) keys.push(toolClaimKey(scope));
  if (isLegacyClaim(scope)) keys.push(legacyClaimKey(scope));
  if (!keys.length) keys.push(legacyClaimKey(scope));
  return keys;
}

export function createMemoryActionClaims() {
  const claims = new Set();
  return {
    durable: false,
    async claim(scope) {
      const keys = claimDigests(scope).map((digest) => `${scope.tenantId.toLowerCase()}:${digest}`);
      if (keys.some((key) => claims.has(key))) return false;
      claims.add(keys[0]);
      return true;
    },
    async release(scope) {
      const tenant = String(scope.tenantId || "").toLowerCase();
      for (const digest of claimDigests(scope)) claims.delete(`${tenant}:${digest}`);
      return true;
    },
  };
}

export function createActionClaims(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key) return null;
  return {
    durable: true,
    async claim(scope) {
      const digests = claimDigests(scope);
      const claimKey = digests[0];
      if (digests.length > 1) {
        const prior = await fetchImpl(`${base}/rest/v1/action_execution_claims?tenant_id=eq.${encodeURIComponent(scope.tenantId)}&claim_key=eq.${digests[1]}&select=claim_key`, {
          method: "GET", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
        });
        if (prior.ok) {
          const rows = await prior.json().catch(() => []);
          if (Array.isArray(rows) && rows.length) return false;
        }
      }
      const response = await fetchImpl(`${base}/rest/v1/rpc/claim_action_execution`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ p_tenant: scope.tenantId, p_key: claimKey }),
      });
      if (!response.ok) throw new Error("Action claim is unavailable.");
      const value = await response.json();
      if (typeof value !== "boolean") throw new Error("Action claim returned an invalid response.");
      return value;
    },
    async release(scope) {
      const tenant = encodeURIComponent(scope.tenantId);
      for (const digest of claimDigests(scope)) {
        const response = await fetchImpl(`${base}/rest/v1/action_execution_claims?tenant_id=eq.${tenant}&claim_key=eq.${digest}`, {
          method: "DELETE",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: { apikey: key, authorization: `Bearer ${key}`, prefer: "return=minimal" },
        });
        if (!response.ok) return false;
      }
      return true;
    },
  };
}

export async function createLocalActionClaims(file) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS action_claims (tenant_id TEXT NOT NULL, claim_key TEXT NOT NULL, PRIMARY KEY (tenant_id, claim_key))");
  const insert = db.prepare("INSERT OR IGNORE INTO action_claims (tenant_id, claim_key) VALUES (?, ?)");
  return {
    durable: true,
    async claim(scope) {
      const digests = claimDigests(scope);
      const tenant = scope.tenantId.toLowerCase();
      const seen = db.prepare("SELECT 1 AS hit FROM action_claims WHERE tenant_id = ? AND claim_key = ?");
      if (digests.some((digest) => seen.get(tenant, digest))) return false;
      return insert.run(tenant, digests[0]).changes === 1;
    },
    async release(scope) {
      const tenant = scope.tenantId.toLowerCase();
      const del = db.prepare("DELETE FROM action_claims WHERE tenant_id = ? AND claim_key = ?");
      for (const digest of claimDigests(scope)) del.run(tenant, digest);
      return true;
    },
    close() { db.close(); },
  };
}
