import { createHash } from "node:crypto";

const tenantPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function actionClaimKey({ tenantId, roomId, sourceId, action }) {
  if (typeof tenantId !== "string" || !tenantPattern.test(tenantId)) throw new Error("Action claim requires a tenant.");
  for (const value of [roomId, sourceId, action]) {
    if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("Action claim requires a room, source and action.");
  }
  return createHash("sha256").update(JSON.stringify([roomId, sourceId, action])).digest("hex");
}

export function createMemoryActionClaims() {
  const claims = new Set();
  return {
    durable: false,
    async claim(scope) {
      const key = `${scope.tenantId.toLowerCase()}:${actionClaimKey(scope)}`;
      if (claims.has(key)) return false;
      claims.add(key);
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
      const claimKey = actionClaimKey(scope);
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
      const claimKey = actionClaimKey(scope);
      return insert.run(scope.tenantId.toLowerCase(), claimKey).changes === 1;
    },
    close() { db.close(); },
  };
}
