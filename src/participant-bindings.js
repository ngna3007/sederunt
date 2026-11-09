export function createParticipantBindings(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const rows = new Map();
  async function call(name, body) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(10000), headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Participant identity could not be checked.");
    return response.json();
  }
  const durable = base && key && env.SEDERUNT_AUTH_FAKE !== "1";
  return {
    async record({ tenantId, roomId, memberId, email }) {
      if (!tenantId || !roomId || !memberId || !email) return;
      const value = { tenantId, roomId, memberId, email: email.trim().toLowerCase() };
      if (durable) await call("record_verified_participant", { p_tenant: tenantId, p_room: roomId, p_member: memberId, p_email: value.email });
      else rows.set(JSON.stringify([tenantId, roomId, memberId]), value);
    },
    async forUser(tenantId, userId, email) {
      if (!tenantId || !email) return [];
      if (durable) return (await call("verified_participants_for_user", { p_tenant: tenantId, p_user: userId })) || [];
      return [...rows.values()].filter((row) => row.tenantId === tenantId && row.email === email.trim().toLowerCase());
    },
    async forRoom(tenantId, roomId) {
      if (!tenantId || !roomId) return [];
      if (durable) return (await call("verified_participants_for_room", { p_tenant: tenantId, p_room: roomId })) || [];
      return [...rows.values()].filter((row) => row.tenantId === tenantId && row.roomId === roomId);
    },
  };
}
