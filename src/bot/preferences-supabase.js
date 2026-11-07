/**
 * Bot preference store. Memory when sign-in is faked, when the caller asks
 * for memory, or when Supabase is not configured. Otherwise the service role
 * talks to public.bot_preferences. A tenant id that is not a uuid (the local
 * console uses "local") stays in an in-process store and is never sent.
 *
 * Rows map to { tenantId, userId, key, value }. Failures throw a fixed
 * message. The preference key, the value, and the service key are not logged
 * and are not copied into the error.
 */

import { createMemoryPreferenceStore } from "./preferences.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORE_ERROR = "The preference store could not be reached.";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetch?: typeof fetch, memory?: boolean }} [options]
 */
export function createBotPreferenceStore(env = process.env, options = {}) {
  const authFake = String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1";
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (options.memory || authFake || !url || !key) return createMemoryPreferenceStore();
  return createSupabaseBotPreferenceStore({
    url,
    key,
    fetchImpl: options.fetch || globalThis.fetch,
  });
}

/**
 * @param {{ url: string, key: string, fetchImpl: typeof fetch }} options
 */
export function createSupabaseBotPreferenceStore({ url, key, fetchImpl }) {
  const rest = `${url}/rest/v1`;
  const memory = createMemoryPreferenceStore();

  function storeError(status) {
    const error = new Error(STORE_ERROR);
    if (status) error.status = status;
    return error;
  }

  async function call(path, { method = "GET", body, query } = {}) {
    const endpoint = new URL(`${rest}/${path}`);
    if (query) {
      for (const [name, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        endpoint.searchParams.set(name, String(value));
      }
    }
    const headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "accept-profile": "public",
      "content-profile": "public",
    };
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (method !== "GET" && method !== "HEAD") headers.prefer = "return=representation";
    let response;
    try {
      response = await fetchImpl(endpoint, { method, headers, body: payload, redirect: "manual" });
    } catch {
      throw storeError();
    }
    let text = "";
    try {
      text = await response.text();
    } catch {
      throw storeError();
    }
    if (response.status === 409) throw storeError(409);
    if (!response.ok) throw storeError();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw storeError();
    }
  }

  function filters(tenantId, userId, prefKey) {
    return {
      tenant_id: `eq.${tenantId}`,
      pref_key: `eq.${prefKey}`,
      user_id: userId ? `eq.${userId}` : "is.null",
    };
  }

  async function patchRow(tenantId, userId, prefKey, value) {
    const rows = await call("bot_preferences", {
      method: "PATCH",
      query: filters(tenantId, userId, prefKey),
      body: { pref_value: value },
    });
    return firstRow(rows);
  }

  return {
    async list({ tenantId }) {
      if (!isUuid(tenantId)) return memory.list({ tenantId });
      const rows = await call("bot_preferences", {
        query: {
          select: "tenant_id,user_id,pref_key,pref_value",
          tenant_id: `eq.${tenantId}`,
        },
      });
      return (Array.isArray(rows) ? rows : []).map(mapRow).filter(Boolean);
    },
    async upsert({ tenantId, userId = null, key: prefKey, value }) {
      const owner = userId || null;
      if (!isUuid(tenantId)) return memory.upsert({ tenantId, userId: owner, key: prefKey, value });
      const patched = await patchRow(tenantId, owner, prefKey, value);
      if (patched) return mapRow(patched);
      try {
        const created = await call("bot_preferences", {
          method: "POST",
          body: {
            tenant_id: tenantId,
            user_id: owner,
            pref_key: prefKey,
            pref_value: value,
          },
        });
        const row = firstRow(created);
        if (!row) throw storeError();
        return mapRow(row);
      } catch (error) {
        if (!error || error.status !== 409) throw error;
        const retried = await patchRow(tenantId, owner, prefKey, value);
        if (!retried) throw storeError();
        return mapRow(retried);
      }
    },
    async remove({ tenantId, userId = null, key: prefKey }) {
      const owner = userId || null;
      if (!isUuid(tenantId)) return memory.remove({ tenantId, userId: owner, key: prefKey });
      const rows = await call("bot_preferences", {
        method: "DELETE",
        query: filters(tenantId, owner, prefKey),
      });
      return Array.isArray(rows) && rows.length > 0;
    },
  };
}

function isUuid(value) {
  return UUID.test(String(value || "").trim());
}

function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}

function mapRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    tenantId: row.tenant_id,
    userId: row.user_id || null,
    key: row.pref_key,
    value: row.pref_value,
  };
}
