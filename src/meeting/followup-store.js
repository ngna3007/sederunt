const KINDS = new Set(["outcome", "action", "delivery"]);
const STATUSES = new Set(["pending", "editing", "running", "done", "skipped", "failed", "outcome_unknown", "not_reached"]);
const copy = (value) => structuredClone(value);

export function assertFollowupRecord(record) {
  if (!record?.id || !record.tenantId || !record.meetingId || !KINDS.has(record.kind) || !STATUSES.has(record.status)) throw new Error("Invalid follow-up record.");
  if (JSON.stringify(record.data || {}).length > 512 * 1024) throw new Error("Follow-up record is too large.");
}

export function createMemoryFollowupStore({ clock = Date.now } = {}) {
  const records = new Map();
  const key = (tenantId, id) => `${tenantId}:${id}`;
  return {
    durable: false,
    async put(record) {
      assertFollowupRecord(record);
      const id = key(record.tenantId, record.id);
      if (records.has(id) && (records.get(id).meetingId !== record.meetingId || records.get(id).kind !== record.kind)) throw new Error("Follow-up identity conflict.");
      if (!records.has(id)) records.set(id, { ...copy(record), revision: 1, updatedAt: new Date(clock()).toISOString() });
      return copy(records.get(id));
    },
    async get(tenantId, id) { const row = records.get(key(tenantId, id)); return row ? copy(row) : null; },
    async change(record, { status = record.status, data = record.data } = {}) {
      const current = records.get(key(record.tenantId, record.id));
      if (!current || current.revision !== record.revision) return null;
      assertFollowupRecord({ ...current, status, data });
      const next = { ...current, status, data: copy(data), revision: current.revision + 1, updatedAt: new Date(clock()).toISOString() };
      records.set(key(record.tenantId, record.id), next);
      return copy(next);
    },
    async list(tenantId, { kind, statuses, needsSync, meetingId, limit = 50 } = {}) {
      const cap = Math.min(limit, 100);
      const rows = [];
      for (const row of records.values()) {
        if (tenantId && row.tenantId !== tenantId) continue;
        if (kind && row.kind !== kind) continue;
        if (statuses && !statuses.includes(row.status)) continue;
        if (needsSync && row.data.notificationsDirty !== true) continue;
        if (meetingId && row.meetingId !== meetingId) continue;
        rows.push(copy(row));
        if (rows.length >= cap) break;
      }
      return rows;
    },
  };
}

function shape(row) {
  if (!row?.id) return null;
  return { id: row.id, tenantId: row.tenant_id, meetingId: row.meeting_id, kind: row.kind, status: row.status, data: row.data, revision: Number(row.revision), updatedAt: row.updated_at };
}

export function createSupabaseFollowupStore(env, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) return null;
  const headers = { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" };
  async function call(path, body) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Follow-up persistence is unavailable.");
    const result = await response.json();
    return result;
  }
  return {
    durable: true,
    async put(record) {
      assertFollowupRecord(record);
      return shape(await call("rpc/meeting_followup_put", { p_tenant: record.tenantId, p_id: record.id, p_meeting: record.meetingId, p_kind: record.kind, p_status: record.status, p_data: record.data }));
    },
    async get(tenantId, id) {
      const rows = await call(`meeting_followups?tenant_id=eq.${encodeURIComponent(tenantId)}&id=eq.${encodeURIComponent(id)}&limit=1`);
      return shape(rows[0]);
    },
    async change(record, { status = record.status, data = record.data } = {}) {
      assertFollowupRecord({ ...record, status, data });
      return shape(await call("rpc/meeting_followup_change", { p_tenant: record.tenantId, p_id: record.id, p_revision: record.revision, p_status: status, p_data: data }));
    },
    async list(tenantId, { kind, statuses, needsSync, meetingId, limit = 50 } = {}) {
      const params = new URLSearchParams({ select: "*", order: "updated_at.asc,id.asc", limit: String(Math.min(100, limit)) });
      if (tenantId) params.set("tenant_id", `eq.${tenantId}`);
      if (kind) params.set("kind", `eq.${kind}`);
      if (needsSync) params.set("data->>notificationsDirty", "eq.true");
      if (statuses) params.set("status", `in.(${statuses.join(",")})`);
      if (meetingId) params.set("meeting_id", `eq.${meetingId}`);
      return (await call(`meeting_followups?${params}`)).map(shape);
    },
  };
}
