/**
 * Invitee email → Slack user. Lookup uses users.lookupByEmail, which needs
 * the users:read.email scope. An admin override already in the store wins
 * and is not refreshed. A miss is delivery "email".
 *
 * `store` is the cache boundary (get, upsertLookup, setOverride). The
 * service role writes lookup rows; the console writes overrides.
 */

const LOOKUP_URL = "https://slack.com/api/users.lookupByEmail";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function createMemoryMatchStore() {
  const rows = new Map();
  const keyOf = ({ tenantId, workspaceId, email }) => `${tenantId}|${workspaceId || ""}|${normalizeEmail(email)}`;
  return {
    async get(input) {
      const row = rows.get(keyOf(input));
      return row ? { ...row } : null;
    },
    async upsertLookup(input) {
      const key = keyOf(input);
      const existing = rows.get(key);
      if (existing?.source === "override") return { ...existing };
      const slackUserId = input.slackUserId || null;
      const row = {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId || "",
        email: normalizeEmail(input.email),
        slackUserId,
        source: slackUserId ? "lookup" : "none",
        overriddenBy: null,
        checkedAt: input.checkedAt || new Date().toISOString(),
        delivery: slackUserId ? "slack" : "email",
      };
      rows.set(key, row);
      return { ...row };
    },
    async setOverride(input) {
      const slackUserId = input.slackUserId || null;
      const row = {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId || "",
        email: normalizeEmail(input.email),
        slackUserId,
        source: "override",
        overriddenBy: input.overriddenBy || null,
        checkedAt: input.checkedAt || new Date().toISOString(),
        delivery: slackUserId ? "slack" : "email",
      };
      rows.set(keyOf(row), row);
      return { ...row };
    },
  };
}

function deliveryOf(row) {
  return row.slackUserId ? "slack" : "email";
}

/**
 * @param {{ email: string, token: string, fetchImpl: typeof fetch, sleep?: (ms: number) => Promise<void>, retries?: number }} input
 */
export async function lookupByEmail({ email, token, fetchImpl, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), retries = 2 }) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@") || !normalized.split("@")[1]) {
    return { ok: false, code: "invalid_email", email: normalized, slackUserId: null };
  }
  let attempt = 0;
  while (attempt <= retries) {
    const response = await fetchImpl(LOOKUP_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email: normalized }).toString(),
    });
    const status = Number(response?.status || 0);
    let body = {};
    try {
      body = typeof response?.json === "function" ? await response.json() : {};
    } catch {
      body = {};
    }
    const retryAfter = header(response, "retry-after");
    if (status === 429 || body?.error === "ratelimited") {
      if (attempt >= retries) {
        return { ok: false, code: "ratelimited", email: normalized, retryAfter: retryAfter || "" };
      }
      const seconds = Number(retryAfter);
      await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      attempt += 1;
      continue;
    }
    if (body?.ok === true && body.user?.id) {
      return { ok: true, code: "", email: normalized, slackUserId: body.user.id, source: "lookup" };
    }
    if (body?.error === "users_not_found") {
      return { ok: true, code: "users_not_found", email: normalized, slackUserId: null, source: "none" };
    }
    if (body?.error === "missing_scope") {
      return { ok: false, code: "missing_scope", email: normalized, needed: "users:read.email", slackUserId: null };
    }
    return { ok: false, code: body?.error || (status ? `http_${status}` : "failed"), email: normalized, slackUserId: null };
  }
  return { ok: false, code: "ratelimited", email: normalized, slackUserId: null };
}

/**
 * @param {{ invitees: string[], token: string, fetchImpl: typeof fetch, store: { get: Function, upsertLookup: Function }, tenantId: string, workspaceId: string, sleep?: Function, retries?: number }} input
 */
export async function matchInvitees(input) {
  const matches = [];
  for (const invitee of input.invitees || []) {
    const email = normalizeEmail(invitee);
    if (!email) continue;
    const cached = await input.store.get({ tenantId: input.tenantId, workspaceId: input.workspaceId, email });
    if (cached) {
      matches.push({ ...cached, email, delivery: deliveryOf(cached) });
      continue;
    }
    const looked = await lookupByEmail({
      email,
      token: input.token,
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      retries: input.retries,
    });
    if (!looked.ok) {
      return { ok: false, code: looked.code, needed: looked.needed || "", retryAfter: looked.retryAfter || "", matches };
    }
    const saved = await input.store.upsertLookup({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      email,
      slackUserId: looked.slackUserId,
    });
    matches.push({ ...saved, delivery: deliveryOf(saved) });
  }
  return { ok: true, code: "", matches };
}

function header(response, name) {
  const headers = response?.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || headers.get(name.toLowerCase()) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
}
