import { createHash, randomUUID } from "node:crypto";
import { openSecret, sealSecret, secretsKey } from "../connectors/secrets.js";

/**
 * One Linear MCP grant per Sederunt tenant.
 * The access token and refresh token are sealed together (AES-256-GCM,
 * MCP_SECRETS_KEY_V1). Public reads never receive them.
 * One Linear workspace belongs to one tenant. A second tenant is a conflict.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const WORKSPACE_KEY = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const TEAM_KEY = /^[A-Za-z0-9]{1,20}$/;

export function linearInstallError(reason, message) {
  const error = new Error(message || "The Linear connection could not be saved.");
  error.reason = reason;
  return error;
}

function publicRow(row) {
  if (!row) return null;
  return {
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    workspaceKey: row.workspaceKey,
    workspaceName: row.workspaceName || "",
    teamKey: row.teamKey,
    scopes: Array.isArray(row.scopes) ? [...row.scopes] : [],
    installedBy: row.installedBy || "",
    expiresAt: row.expiresAt || "",
    updatedAt: row.updatedAt || "",
    generation: row.generation || "",
  };
}

function cleanGrant(input) {
  const tenantId = String(input?.tenantId || "").trim();
  const workspaceId = String(input?.workspaceId || "").trim();
  const workspaceKey = String(input?.workspaceKey || "").trim().toLowerCase();
  const teamKey = String(input?.teamKey || "").trim();
  const accessToken = String(input?.accessToken || "").trim();
  const refreshToken = String(input?.refreshToken || "").trim();
  const expiresAt = Number(input?.expiresAt);
  const scopes = Array.isArray(input?.scopes) ? input.scopes.map((scope) => String(scope).trim()).filter(Boolean) : [];
  if (!UUID.test(tenantId) || !WORKSPACE_ID.test(workspaceId) || !WORKSPACE_KEY.test(workspaceKey) || !TEAM_KEY.test(teamKey)) {
    throw linearInstallError("invalid");
  }
  if (!accessToken || !refreshToken || accessToken.length > 8000 || refreshToken.length > 8000) throw linearInstallError("invalid");
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) throw linearInstallError("invalid");
  if (!scopes.includes("read") || !scopes.includes("write")) throw linearInstallError("invalid");
  return {
    tenantId,
    workspaceId,
    workspaceKey,
    workspaceName: String(input?.workspaceName || "").replace(/[\u0000-\u001f]/g, "").slice(0, 200),
    teamKey,
    scopes,
    accessToken,
    refreshToken,
    expiresAt,
  };
}

function pack(grant) {
  return JSON.stringify({
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: grant.expiresAt,
  });
}

function unpack(plaintext) {
  const parsed = JSON.parse(String(plaintext || ""));
  const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : "";
  const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : "";
  const expiresAt = Number(parsed.expiresAt);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) throw linearInstallError("unavailable");
  return { accessToken, refreshToken, expiresAt };
}

/** In-process store for tests and local runs. */
export function createMemoryLinearInstallationStore(env = process.env, { tenants } = {}) {
  const rows = new Map();
  const consumed = new Map();
  const live = (tenant) => !tenants || tenants.has(tenant);
  const seal = (plaintext) => (env.MCP_SECRETS_KEY_V1 ? sealSecret(plaintext, env) : { plain: plaintext });
  const open = (sealed) => (sealed?.plain != null ? sealed.plain : openSecret(sealed, env));
  return {
    durable: false,
    encrypted: Boolean(env.MCP_SECRETS_KEY_V1),
    async consumeState(nonce, expiresAt) {
      const now = Date.now();
      for (const [key, exp] of consumed) if (exp <= now) consumed.delete(key);
      if (!nonce || expiresAt <= now || consumed.has(nonce)) return false;
      consumed.set(nonce, expiresAt);
      return true;
    },
    async get(tenantId) {
      const row = rows.get(String(tenantId || "").trim());
      return row && live(row.tenantId) ? publicRow(row) : null;
    },
    async open(tenantId) {
      const row = rows.get(String(tenantId || "").trim());
      if (!row || !live(row.tenantId)) return null;
      const grant = unpack(open(row.sealed));
      return { ...publicRow(row), ...grant };
    },
    async save(input) {
      const grant = cleanGrant(input);
      if (!live(grant.tenantId)) throw linearInstallError("missing-tenant");
      for (const row of rows.values()) {
        if (row.workspaceId === grant.workspaceId && row.tenantId !== grant.tenantId) throw linearInstallError("conflict");
      }
      const current = rows.get(grant.tenantId) || null;
      if ((current?.generation || null) !== (input.expectedGeneration || null)) throw linearInstallError("stale");
      if (current && current.workspaceId !== grant.workspaceId && input.replace !== true) throw linearInstallError("different");
      const next = {
        ...grant,
        installedBy: UUID.test(String(input.installedBy || "")) ? input.installedBy : "",
        updatedAt: new Date().toISOString(),
        generation: randomUUID(),
        sealed: seal(pack(grant)),
      };
      rows.set(grant.tenantId, next);
      return publicRow(next);
    },
  };
}

/**
 * Supabase store over public.linear_installations. Service role only.
 */
export function createSupabaseLinearInstallationStore({ url, key, env = process.env, fetchImpl = globalThis.fetch }) {
  const rest = `${String(url).replace(/\/$/, "")}/rest/v1/linear_installations`;
  async function call(method, query, body, rpc = "") {
    const endpoint = new URL(rpc ? `${String(url).replace(/\/$/, "")}/rest/v1/rpc/${rpc}` : rest);
    for (const [name, value] of Object.entries(query || {})) endpoint.searchParams.set(name, String(value));
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
      headers.prefer = "return=representation";
      payload = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(endpoint, { method, headers, body: payload, redirect: "manual" });
    } catch {
      throw linearInstallError("network");
    }
    const text = await response.text();
    if (!response.ok) throw linearInstallError("network");
    return text ? JSON.parse(text) : null;
  }
  const hex = (buf) => `\\x${Buffer.from(buf).toString("hex")}`;
  const unhex = (value) => Buffer.from(String(value || "").replace(/^\\x/, ""), "hex");
  const fromRow = (row) => row && {
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    workspaceKey: row.workspace_key,
    workspaceName: row.workspace_name || "",
    teamKey: row.team_key,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    installedBy: row.installed_by || "",
    expiresAt: row.expires_at || "",
    updatedAt: row.updated_at || "",
    generation: row.generation || "",
  };
  const openRow = (row) => {
    if (!row) return null;
    if (!UUID.test(row.generation || "") || row.key_version !== 1) throw linearInstallError("unavailable");
    const grant = unpack(openSecret({ ciphertext: unhex(row.ciphertext), nonce: unhex(row.nonce), keyVersion: row.key_version }, env));
    return { ...publicRow(fromRow(row)), ...grant };
  };
  const PUBLIC = "tenant_id,workspace_id,workspace_key,workspace_name,team_key,scopes,installed_by,expires_at,updated_at,generation";
  return {
    durable: true,
    encrypted: true,
    async consumeState(nonce, expiresAt) {
      return await call("POST", {}, {
        p_nonce_hash: createHash("sha256").update(String(nonce || "")).digest("hex"),
        p_expires_at: new Date(expiresAt).toISOString(),
      }, "linear_oauth_consume") === true;
    },
    async get(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return null;
      const rows = await call("GET", { select: PUBLIC, tenant_id: `eq.${id}` });
      return publicRow(fromRow(rows?.[0]));
    },
    async open(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return null;
      const rows = await call("GET", { select: "*", tenant_id: `eq.${id}` });
      return openRow(rows?.[0]);
    },
    async save(input) {
      const grant = cleanGrant(input);
      const sealed = sealSecret(pack(grant), env);
      const saved = await call("POST", {}, {
        p_tenant_id: grant.tenantId,
        p_workspace_id: grant.workspaceId,
        p_workspace_key: grant.workspaceKey,
        p_workspace_name: grant.workspaceName,
        p_team_key: grant.teamKey,
        p_scopes: grant.scopes,
        p_installed_by: UUID.test(String(input.installedBy || "")) ? input.installedBy : null,
        p_ciphertext: hex(sealed.ciphertext),
        p_nonce: hex(sealed.nonce),
        p_key_version: sealed.keyVersion,
        p_expires_at: new Date(grant.expiresAt).toISOString(),
        p_replace: input.replace === true,
        p_expected_generation: input.expectedGeneration || null,
      }, "linear_installation_save");
      if (!saved || typeof saved !== "object" || !saved.generation) {
        throw linearInstallError(typeof saved === "string" ? saved : "network");
      }
      return publicRow(fromRow(saved));
    },
  };
}

export function createLinearInstallationStore(env = process.env, options = {}) {
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const local = env.NODE_ENV !== "production" && !env.VERCEL_ENV && (options.memory || env.SEDERUNT_AUTH_FAKE === "1");
  if (local) return createMemoryLinearInstallationStore(env);
  try {
    if (!url || !key) throw linearInstallError("unavailable");
    secretsKey(env);
    return createSupabaseLinearInstallationStore({ url, key, env, fetchImpl: options.fetch || globalThis.fetch });
  } catch {
    const unavailable = async () => { throw linearInstallError("unavailable", "Durable encrypted Linear storage is not configured."); };
    return { durable: false, encrypted: false, get: unavailable, open: unavailable, save: unavailable, consumeState: unavailable };
  }
}
