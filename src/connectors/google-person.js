import { openSecret, sealSecret } from "./secrets.js";
import { CALENDAR_SCOPES } from "../calendar/mcp.js";

/** Forms scopes requested with incremental Google consent. */
export const FORMS_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
]);

export { CALENDAR_SCOPES };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FRESH_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GRANT_ERROR = "The grant store could not be reached.";

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeScopes(value) {
  if (Array.isArray(value)) return value.map((scope) => String(scope || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  return [];
}

/**
 * @param {Buffer | Uint8Array | string} value
 */
function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  const text = String(value || "");
  const hex = text.startsWith("\\x") ? text.slice(2) : text;
  return Buffer.from(hex, "hex");
}

/**
 * @param {Buffer | Uint8Array} buffer
 */
function bytea(buffer) {
  return `\\x${Buffer.from(buffer).toString("hex")}`;
}

function cacheKey(tenantId, personId) {
  return `${tenantId}\0${personId}`;
}

function rowKey(tenantId, personId, provider) {
  return `${tenantId}\0${personId}\0${provider || "google"}`;
}

function memoryRows() {
  const map = new Map();
  return {
    kind: "memory",
    async get(tenantId, personId, provider = "google") {
      const row = map.get(rowKey(tenantId, personId, provider));
      if (!row) return null;
      return {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion,
        scopes: [...row.scopes],
      };
    },
    async put(row) {
      map.set(rowKey(row.tenantId, row.personId, row.provider), {
        ciphertext: Buffer.from(row.ciphertext),
        nonce: Buffer.from(row.nonce),
        keyVersion: row.keyVersion || 1,
        scopes: Array.isArray(row.scopes) ? [...row.scopes] : [],
      });
    },
    async delete(tenantId, personId, provider = "google") {
      map.delete(rowKey(tenantId, personId, provider));
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {typeof fetch} fetchImpl
 */
function supabaseRows(env, fetchImpl) {
  const config = supabaseConfig(env);
  const rest = `${config.url}/rest/v1/person_google_grants`;

  async function call(method, query, body) {
    const endpoint = new URL(rest);
    if (query) {
      for (const [name, value] of Object.entries(query)) endpoint.searchParams.set(name, String(value));
    }
    const headers = {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      accept: "application/json",
      "accept-profile": "public",
      "content-profile": "public",
    };
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      headers.prefer = method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal";
      payload = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(endpoint, { method, headers, body: payload, redirect: "manual" });
    } catch {
      throw new Error(GRANT_ERROR);
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) throw new Error(GRANT_ERROR);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(GRANT_ERROR);
    }
  }

  function filters(tenantId, personId, provider) {
    return {
      tenant_id: `eq.${tenantId}`,
      person_id: `eq.${personId}`,
      provider: `eq.${provider || "google"}`,
    };
  }

  return {
    kind: "supabase",
    async get(tenantId, personId, provider = "google") {
      const rows = await call("GET", {
        select: "ciphertext,nonce,key_version,scopes",
        ...filters(tenantId, personId, provider),
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return {
        ciphertext: asBuffer(row.ciphertext),
        nonce: asBuffer(row.nonce),
        keyVersion: Number(row.key_version) || 1,
        scopes: normalizeScopes(row.scopes),
      };
    },
    async put(row) {
      await call("POST", { on_conflict: "tenant_id,person_id,provider" }, {
        tenant_id: row.tenantId,
        person_id: row.personId,
        provider: row.provider || "google",
        ciphertext: bytea(row.ciphertext),
        nonce: bytea(row.nonce),
        key_version: row.keyVersion || 1,
        scopes: normalizeScopes(row.scopes),
      });
    },
    async delete(tenantId, personId, provider = "google") {
      await call("DELETE", filters(tenantId, personId, provider));
    },
  };
}

/**
 * @param {{ grantRows?: { get: Function, put: Function, delete: Function }, env?: NodeJS.ProcessEnv | Record<string, string | undefined>, fetchImpl?: typeof fetch }} options
 */
function rowsFor(options) {
  if (options.grantRows) return options.grantRows;
  const env = options.env || process.env;
  if (supabaseConfig(env)) return supabaseRows(env, options.fetchImpl || globalThis.fetch);
  return memoryRows();
}

/**
 * Per-person Google refresh grants, sealed with the connector secrets key.
 * Access tokens stay in memory on this store. The plaintext refresh token is not returned to the browser.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   grantRows?: { kind?: string, get: Function, put: Function, delete: Function },
 * }} [options]
 */
export function createPersonGoogleStore(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const rows = rowsFor({ ...options, env, fetchImpl });
  const cache = new Map();

  function clientId() {
    return String(env.GOOGLE_OAUTH_CLIENT_ID || env.CALENDAR_OAUTH_CLIENT_ID || "").trim();
  }

  function clientSecret() {
    return String(env.GOOGLE_OAUTH_CLIENT_SECRET || env.CALENDAR_OAUTH_CLIENT_SECRET || "").trim();
  }

  function acceptsTenant(tenantId) {
    if (!tenantId) return false;
    if (rows.kind === "supabase" && !UUID.test(tenantId)) return false;
    return true;
  }

  async function load(tenantId, personId) {
    const row = await rows.get(tenantId, personId, "google");
    if (!row) return null;
    const parsed = JSON.parse(openSecret({
      ciphertext: asBuffer(row.ciphertext),
      nonce: asBuffer(row.nonce),
      keyVersion: row.keyVersion,
    }, env));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : "",
      scopes: normalizeScopes(parsed.scopes),
    };
  }

  async function persist(tenantId, personId, refreshToken, scopes) {
    const sealed = sealSecret(JSON.stringify({ refreshToken, scopes }), env);
    await rows.put({
      tenantId,
      personId,
      provider: "google",
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      keyVersion: sealed.keyVersion,
      scopes,
    });
  }

  function described(record, requiredScopes = FORMS_SCOPES) {
    const scopes = record?.scopes || [];
    const required = Array.isArray(requiredScopes) && requiredScopes.length ? requiredScopes : FORMS_SCOPES;
    const hasRefresh = Boolean(record?.refreshToken);
    const granted = hasRefresh && required.every((scope) => scopes.includes(scope));
    return {
      granted,
      partial: hasRefresh && !granted,
      scopes: [...scopes],
    };
  }

  function mergeScopes(left, right) {
    const out = [];
    const seen = new Set();
    for (const scope of [...normalizeScopes(left), ...normalizeScopes(right)]) {
      if (seen.has(scope)) continue;
      seen.add(scope);
      out.push(scope);
    }
    return out;
  }

  /**
   * @param {string} refreshToken
   * @param {string[]} scopes
   */
  async function refresh(refreshToken, scopes) {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret || !refreshToken) return { accessToken: "", invalid: false };
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: id,
          client_secret: secret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: scopes.join(" "),
        }),
      });
    } catch {
      return { accessToken: "", invalid: false };
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.error === "invalid_grant") return { accessToken: "", invalid: true };
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    if (!response.ok || !accessToken) return { accessToken: "", invalid: false };
    const expiresIn = Number(payload.expires_in);
    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : refreshToken,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
      invalid: false,
    };
  }

  async function clear(tenantId, personId) {
    cache.delete(cacheKey(tenantId, personId));
    await rows.delete(tenantId, personId, "google");
  }

  return {
    scopes: FORMS_SCOPES,
    /**
     * @param {string} personId
     * @param {{ refreshToken?: string, accessToken?: string, expiresAt?: number, scopes?: string[] | string }} record
     * @param {{ tenantId?: string }} [saveOptions]
     */
    async save(personId, record, saveOptions = {}) {
      const id = String(personId || "").trim();
      const tenantId = String(saveOptions.tenantId || "").trim();
      const refreshToken = String(record?.refreshToken || "");
      if (!id || !refreshToken || !acceptsTenant(tenantId)) return false;
      const prior = await load(tenantId, id);
      const scopes = mergeScopes(prior?.scopes, record?.scopes);
      await persist(tenantId, id, refreshToken, scopes);
      const accessToken = String(record?.accessToken || "");
      const expiresAt = Number(record?.expiresAt) || 0;
      if (accessToken && expiresAt > Date.now() + FRESH_MS) {
        cache.set(cacheKey(tenantId, id), { accessToken, expiresAt });
      } else {
        cache.delete(cacheKey(tenantId, id));
      }
      return true;
    },
    /**
     * @param {string} personId
     * @param {{ tenantId?: string }} [describeOptions]
     */
    /**
     * Refresh token already sealed for this person, so a later consent that
     * omits provider_refresh_token can still update scopes.
     * @param {string} personId
     * @param {{ tenantId?: string }} [options]
     */
    async savedRefresh(personId, options = {}) {
      const id = String(personId || "").trim();
      const tenantId = String(options.tenantId || "").trim();
      if (!id || !acceptsTenant(tenantId)) return "";
      const record = await load(tenantId, id);
      return record?.refreshToken || "";
    },
    async describe(personId, describeOptions = {}) {
      const id = String(personId || "").trim();
      const tenantId = String(describeOptions.tenantId || "").trim();
      const required = describeOptions.scopes || FORMS_SCOPES;
      if (!id || !acceptsTenant(tenantId)) return { granted: false, partial: false, scopes: [] };
      const record = await load(tenantId, id);
      return described(record, required);
    },
    /**
     * @param {string} personId
     * @param {{ tenantId?: string }} [grantedOptions]
     */
    async granted(personId, grantedOptions = {}) {
      const status = await this.describe(personId, grantedOptions);
      return status.granted;
    },
    /**
     * @param {string} personId
     * @param {{ tenantId?: string, force?: boolean }} [tokenOptions]
     * @returns {Promise<{ accessToken: string, needsAccess: boolean }>}
     */
    async openAccess(personId, tokenOptions = {}) {
      const id = String(personId || "").trim();
      const tenantId = String(tokenOptions.tenantId || "").trim();
      const required = tokenOptions.scopes || FORMS_SCOPES;
      if (!id || !acceptsTenant(tenantId)) return { accessToken: "", needsAccess: true };
      const record = await load(tenantId, id);
      const status = described(record, required);
      if (!record?.refreshToken || !status.granted) return { accessToken: "", needsAccess: true };
      const cached = cache.get(cacheKey(tenantId, id));
      const fresh = tokenOptions.force !== true && cached?.accessToken && Number(cached.expiresAt) > Date.now() + FRESH_MS;
      if (fresh) return { accessToken: cached.accessToken, needsAccess: false };
      const next = await refresh(record.refreshToken, record.scopes);
      if (next.invalid) {
        await clear(tenantId, id);
        return { accessToken: "", needsAccess: true };
      }
      if (!next.accessToken) return { accessToken: "", needsAccess: false };
      if (next.refreshToken !== record.refreshToken) {
        await persist(tenantId, id, next.refreshToken, record.scopes);
      }
      cache.set(cacheKey(tenantId, id), { accessToken: next.accessToken, expiresAt: next.expiresAt });
      return { accessToken: next.accessToken, needsAccess: false };
    },
    /**
     * @param {string} personId
     * @param {{ tenantId?: string, force?: boolean }} [tokenOptions]
     */
    async accessToken(personId, tokenOptions = {}) {
      const opened = await this.openAccess(personId, tokenOptions);
      return opened.accessToken;
    },
  };
}
