export function createAdminStore(env, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key) return null;
  async function rpc(name, body) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(response.status === 409 ? "The account changed. Refresh the preview and try again." : "Admin database request failed. Check the migration and server credentials.");
      error.status = response.status === 409 ? 409 : 503;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    accounts(query, offset) { return rpc("admin_accounts", { p_query: query, p_offset: offset }); },
    plan(userId) { return rpc("admin_account_plan", { p_user_id: userId }); },
    restart(userId, plan, actor) { return rpc("admin_restart_demo", { p_user_id: userId, p_expected: plan, p_actor: actor }); },
    audit(actor, userId, action) { return rpc("admin_record_action", { p_actor: actor, p_user_id: userId, p_action: action }); },
    loginAttempt() { return rpc("admin_login_attempt", {}); },
    issuePreview(nonce) { return rpc("admin_issue_preview", { p_nonce: nonce }); },
    consumePreview(nonce) { return rpc("admin_consume_preview", { p_nonce: nonce }); },
    retiredForUser(userId) { return rpc("admin_retired_for_user", { p_user_id: userId }); },
    async tenantRetired(tenantId) {
      const response = await fetchImpl(`${base}/rest/v1/tenants?select=id&id=eq.${encodeURIComponent(tenantId)}`, {
        redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!response.ok) throw new Error("Workspace existence could not be checked.");
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Workspace existence could not be checked.");
      return rows.length === 0;
    },
  };
}
