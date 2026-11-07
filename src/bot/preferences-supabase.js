/**
 * Bot preference store. Memory when sign-in is faked, when the caller asks
 * for memory, or when Supabase is not configured. Otherwise the service role
 * talks to public.bot_preferences. A non-uuid tenant is the non-oauth local
 * console ("local"): it stays in an in-process store and is never sent.
 * OAuth callers must pass a uuid; this module does not substitute "local".
 *
 * Real mode does not catch a REST error and answer from memory. Failures
 * throw a fixed message. The preference key, the value, and the service key
 * are not logged and are not copied into the error.
 *
 * Rows are checked before any request: tenant uuid (or local non-uuid),
 * user id uuid or null, key lowercase and 1-80 characters, value 1-500
 * characters. Prod has no bot_name or wake_phrases value checks and no key
 * enum; those limits are the table checks that are applied.
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
  const columns = "tenant_id,user_id,pref_key,pref_value";

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
    if (!response.ok) throw storeError(response.status || 0);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw storeError();
    }
  }

  function filters(tenantId, userId, prefKey) {
    return {
      select: columns,
      tenant_id: `eq.${tenantId}`,
      pref_key: `eq.${prefKey}`,
      user_id: userId ? `eq.${userId}` : "is.null",
    };
  }

  function ownerOf(userId) {
    if (userId == null || userId === "") return null;
    const id = String(userId).trim();
    if (!isUuid(id)) throw storeError();
    return id;
  }

  function keyOf(prefKey) {
    const text = typeof prefKey === "string" ? prefKey : "";
    if (text.length < 1 || text.length > 80 || text !== text.toLowerCase()) throw storeError();
    return text;
  }

  function valueOf(value) {
    const text = typeof value === "string" ? value : "";
    if (text.length < 1 || text.length > 500) throw storeError();
    return text;
  }

  /**
   * Uuid goes to REST. Any other non-empty id is the local console and stays
   * in memory. Empty is rejected. Nothing here turns a failed REST call into
   * a memory read or write.
   */
  function placement(tenantId) {
    const id = typeof tenantId === "string" ? tenantId.trim() : "";
    if (!id) throw storeError();
    if (isUuid(id)) return { local: false, id };
    return { local: true, id };
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
    durable: true,
    async list({ tenantId }) {
      const placed = placement(tenantId);
      if (placed.local) return memory.list({ tenantId: placed.id });
      const rows = await call("bot_preferences", {
        query: {
          select: columns,
          tenant_id: `eq.${placed.id}`,
        },
      });
      return (Array.isArray(rows) ? rows : []).map(mapRow).filter(Boolean);
    },
    async upsert({ tenantId, userId = null, key: prefKey, value }) {
      const placed = placement(tenantId);
      const owner = ownerOf(userId);
      const cleanKey = keyOf(prefKey);
      const cleanValue = valueOf(value);
      if (placed.local) {
        return memory.upsert({ tenantId: placed.id, userId: owner, key: cleanKey, value: cleanValue });
      }
      const patched = await patchRow(placed.id, owner, cleanKey, cleanValue);
      if (patched) return mapRow(patched);
      try {
        const created = await call("bot_preferences", {
          method: "POST",
          query: { select: columns },
          body: {
            tenant_id: placed.id,
            user_id: owner,
            pref_key: cleanKey,
            pref_value: cleanValue,
          },
        });
        const row = firstRow(created);
        if (!row) throw storeError();
        return mapRow(row);
      } catch (error) {
        if (!error || error.status !== 409) throw error;
        const retried = await patchRow(placed.id, owner, cleanKey, cleanValue);
        if (!retried) throw storeError();
        return mapRow(retried);
      }
    },
    async remove({ tenantId, userId = null, key: prefKey }) {
      const placed = placement(tenantId);
      const owner = ownerOf(userId);
      const cleanKey = keyOf(prefKey);
      if (placed.local) return memory.remove({ tenantId: placed.id, userId: owner, key: cleanKey });
      const rows = await call("bot_preferences", {
        method: "DELETE",
        query: filters(placed.id, owner, cleanKey),
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
