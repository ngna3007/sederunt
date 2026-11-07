import { createHash, randomUUID } from "node:crypto";
import { openSecret, sealSecret, secretsKey } from "../connectors/secrets.js";

/**
 * Per-tenant Slack app installations (Add to Slack, oauth.v2.access).
 *
 * One installation per tenant, and one tenant per Slack team. A team that is
 * already installed for another tenant is a conflict: it is never reassigned
 * silently. The bot token is sealed with AES-256-GCM (MCP_SECRETS_KEY_V1, the
 * same key as connector secrets) and is only opened server-side.
 *
 * Public rows never carry the token. `tokenFor` / `byTeam` return it only to
 * server code that talks to Slack.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM = /^[TE][A-Z0-9]{2,}$/;

export function installationError(reason, message) {
  const error = new Error(message || "The Slack installation could not be saved.");
  error.reason = reason;
  return error;
}

function cleanTeam(value) {
  const team = String(value || "").trim();
  return TEAM.test(team) ? team : "";
}

function publicRow(row) {
  if (!row) return null;
  return {
    tenantId: row.tenantId,
    teamId: row.teamId,
    teamName: row.teamName || "",
    botUserId: row.botUserId || "",
    appId: row.appId || "",
    channelId: row.channelId || "",
    channelName: row.channelName || "",
    scopes: Array.isArray(row.scopes) ? [...row.scopes] : [],
    installedBy: row.installedBy || "",
    updatedAt: row.updatedAt || "",
    generation: row.generation || "",
  };
}

function validate(input) {
  const tenantId = String(input?.tenantId || "").trim();
  const teamId = cleanTeam(input?.teamId);
  const token = String(input?.token || "").trim();
  if (!tenantId || !teamId || !/^xoxb-/.test(token)) throw installationError("invalid");
  return { tenantId, teamId, token };
}

/** In-process store for tests and local runs. Same contract as the Supabase store. */
export function createMemoryInstallationStore(env = process.env, { tenants } = {}) {
  const rows = new Map(); // tenantId -> row (sealed token)
  const consumed = new Map();
  const lifecycle = new Map();
  const live = (tenant) => !tenants || tenants.has(tenant);
  const seal = (token) => (env.MCP_SECRETS_KEY_V1 ? sealSecret(token, env) : { plain: token });
  const open = (sealed) => (sealed?.plain != null ? sealed.plain : openSecret(sealed, env));
  return {
    durable: false,
    encrypted: Boolean(env.MCP_SECRETS_KEY_V1),
    async consumeState(nonce, expiresAt) {
      const now = Date.now();
      for (const [key, exp] of consumed) if (exp <= now) consumed.delete(key);
      if (expiresAt <= now || consumed.has(nonce)) return false;
      consumed.set(nonce, expiresAt);
      return true;
    },
    async legacyEligible({ tenantId, teamId }) {
      const current = lifecycle.get(tenantId);
      return live(tenantId) && Boolean(current?.mode === "legacy" && current.teamId === teamId)
        && ![...rows.values()].some((r) => r.tenantId === tenantId || r.teamId === teamId);
    },
    // Explicit test/local backfill only. Production has no JS enrollment method;
    // operators use the separately privileged, approved SQL backfill RPC.
    async enrollLegacy({ tenantId, teamId }) {
      if (!live(tenantId) || !cleanTeam(teamId)) return false;
      const current = lifecycle.get(tenantId);
      if (current) return current.mode === "legacy" && current.teamId === teamId && ![...rows.values()].some((r) => r.tenantId === tenantId || r.teamId === teamId);
      if ([...rows.values()].some((r) => r.tenantId === tenantId || r.teamId === teamId)
        || [...lifecycle.values()].some((r) => r.mode === "legacy" && r.teamId === teamId)) return false;
      lifecycle.set(tenantId, { mode: "legacy", teamId });
      return true;
    },
    async get(tenantId) {
      if (!live(tenantId)) return null;
      return publicRow(rows.get(String(tenantId || "").trim()));
    },
    async tokenFor(tenantId) {
      if (!live(tenantId)) return null;
      const row = rows.get(String(tenantId || "").trim());
      return row ? { ...publicRow(row), token: open(row.sealed) } : null;
    },
    async byTeam(teamId) {
      const team = cleanTeam(teamId);
      if (!team) return null;
      for (const row of rows.values()) {
        if (row.teamId === team && live(row.tenantId)) return { ...publicRow(row), token: open(row.sealed) };
      }
      return null;
    },
    async save(input) {
      const { tenantId, teamId, token } = validate(input);
      if (!live(tenantId)) throw installationError("missing-tenant");
      for (const [owner, state] of lifecycle) {
        if (owner !== tenantId && state.mode === "legacy" && state.teamId === teamId) throw installationError("conflict");
      }
      for (const row of rows.values()) {
        if (row.teamId === teamId && row.tenantId !== tenantId) throw installationError("conflict", "Slack is already linked to another workspace.");
      }
      const current = rows.get(tenantId);
      if (current && current.teamId !== teamId && input.replace !== true) {
        throw installationError("different-team", "This workspace is already linked to a different Slack workspace.");
      }
      if ((current?.generation || null) !== (input.expectedGeneration || null)) throw installationError("stale", "Slack connection changed. Start again.");
      const row = {
        generation: randomUUID(),
        tenantId,
        teamId,
        teamName: String(input.teamName || ""),
        botUserId: String(input.botUserId || ""),
        appId: String(input.appId || ""),
        channelId: String(input.channelId || ""),
        channelName: String(input.channelName || ""),
        scopes: Array.isArray(input.scopes) ? input.scopes.map(String) : [],
        installedBy: String(input.installedBy || ""),
        updatedAt: new Date().toISOString(),
        sealed: seal(token),
      };
      rows.set(tenantId, row);
      lifecycle.set(tenantId, { mode: "oauth", teamId });
      return publicRow(row);
    },
    async revoke({ teamId, appId, generation, eventTime, botUserId }) {
      const row = [...rows.values()].find((row) => row.teamId === teamId);
      if (!row || !appId || row.appId !== appId || row.generation !== generation
        || !Number.isFinite(eventTime) || Date.parse(row.updatedAt) >= eventTime
        || (botUserId && row.botUserId !== botUserId)) return 0;
      rows.delete(row.tenantId);
      lifecycle.set(row.tenantId, { mode: "disconnected", teamId: row.teamId });
      return 1;
    },
    async remove(tenantId) {
      const tenant = String(tenantId || "").trim();
      const prior = lifecycle.get(tenant);
      if (prior) lifecycle.set(tenant, { ...prior, mode: "disconnected" });
      return rows.delete(tenant) || Boolean(prior);
    },
  };
}

/**
 * Supabase-backed store over public.slack_installations (proposed migration
 * 20261107190000_slack_installations.sql). Service role only; RLS has no policies.
 */
export function createSupabaseInstallationStore({ url, key, env = process.env, fetchImpl = globalThis.fetch }) {
  const rest = `${String(url).replace(/\/$/, "")}/rest/v1/slack_installations`;
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
      throw installationError("network", "The Slack installation store could not be reached.");
    }
    const text = await response.text();
    if (response.status === 409) throw installationError("conflict", "Slack is already linked to another workspace.");
    if (!response.ok) throw installationError("network", "The Slack installation store could not be reached.");
    return text ? JSON.parse(text) : null;
  }
  const hex = (buf) => `\\x${Buffer.from(buf).toString("hex")}`;
  const unhex = (value) => Buffer.from(String(value || "").replace(/^\\x/, ""), "hex");
  const fromRow = (row) => row && {
    tenantId: row.tenant_id,
    teamId: row.team_id,
    teamName: row.team_name || "",
    botUserId: row.bot_user_id || "",
    appId: row.app_id || "",
    channelId: row.channel_id || "",
    channelName: row.channel_name || "",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    installedBy: row.installed_by || "",
    updatedAt: row.updated_at || "",
    generation: row.generation || "",
  };
  const withToken = (row) => {
    if (!row) return null;
    if (!UUID.test(row.generation || "") || row.key_version !== 1) throw installationError("unavailable");
    return { ...publicRow(fromRow(row)),
      token: openSecret({ ciphertext: unhex(row.ciphertext), nonce: unhex(row.nonce), keyVersion: row.key_version }, env) };
  };
  const PUBLIC = "tenant_id,team_id,team_name,bot_user_id,app_id,channel_id,channel_name,scopes,installed_by,updated_at,generation";
  return {
    durable: true,
    encrypted: true,
    async legacyEligible({ tenantId, teamId }) {
      if (!UUID.test(tenantId || "") || !cleanTeam(teamId)) return false;
      return await call("POST", {}, { p_tenant_id: tenantId, p_team_id: teamId }, "slack_legacy_eligible") === true;
    },
    async consumeState(nonce, expiresAt) {
      return await call("POST", {}, {
        p_nonce_hash: createHash("sha256").update(nonce).digest("hex"),
        p_expires_at: new Date(expiresAt).toISOString(),
      }, "slack_oauth_consume") === true;
    },
    async get(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return null;
      const rows = await call("GET", { select: PUBLIC, tenant_id: `eq.${id}` });
      return publicRow(fromRow(rows?.[0]));
    },
    async tokenFor(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return null;
      const rows = await call("GET", { select: "*", tenant_id: `eq.${id}` });
      return withToken(rows?.[0]);
    },
    async byTeam(teamId) {
      const team = cleanTeam(teamId);
      if (!team) return null;
      const rows = await call("GET", { select: "*", team_id: `eq.${team}` });
      return withToken(rows?.[0]);
    },
    async save(input) {
      const { tenantId, teamId, token } = validate(input);
      if (!UUID.test(tenantId)) throw installationError("invalid");
      const sealed = sealSecret(token, env);
      const body = {
        tenant_id: tenantId,
        team_id: teamId,
        team_name: String(input.teamName || "").slice(0, 200),
        bot_user_id: String(input.botUserId || "").slice(0, 40),
        app_id: String(input.appId || "").slice(0, 40),
        channel_id: String(input.channelId || "").slice(0, 40),
        channel_name: String(input.channelName || "").slice(0, 200),
        scopes: Array.isArray(input.scopes) ? input.scopes.map(String) : [],
        installed_by: UUID.test(String(input.installedBy || "")) ? input.installedBy : null,
        ciphertext: hex(sealed.ciphertext),
        nonce: hex(sealed.nonce),
        key_version: sealed.keyVersion,
        updated_at: new Date().toISOString(),
      };
      const args = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "updated_at").map(([k,v]) => [`p_${k}`,v]));
      args.p_replace = input.replace === true;
      args.p_expected_generation = input.expectedGeneration || null;
      const result = await call("POST", {}, args, "slack_installation_save");
      if (!result || typeof result !== "object" || !result.generation) {
        throw installationError(typeof result === "string" ? result : "network");
      }
      return publicRow(fromRow(result));
    },
    async revoke({ teamId, appId, generation, eventTime, botUserId }) {
      if (!cleanTeam(teamId) || !appId || !UUID.test(generation || "") || !Number.isFinite(eventTime)) return 0;
      return await call("POST", {}, {
        p_team_id: teamId, p_app_id: appId, p_generation: generation,
        p_event_time: new Date(eventTime).toISOString(), p_bot_user_id: botUserId || null,
      }, "slack_installation_revoke");
    },
    async remove(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return false;
      const current = await call("GET", { select: "generation", tenant_id: `eq.${id}` });
      return await call("POST", {}, { p_tenant_id: id, p_expected_generation: current?.[0]?.generation || null }, "slack_installation_disconnect") === true;
    },
  };
}

/**
 * Installations are on only when the Slack app's OAuth client is configured.
 * Without SLACK_CLIENT_ID/SECRET the app keeps its previous single-bot behavior.
 */
export function slackOAuthConfigured(env = process.env) {
  return Boolean(String(env.SLACK_CLIENT_ID || "").trim() && String(env.SLACK_CLIENT_SECRET || "").trim());
}

export function createInstallationStore(env = process.env, options = {}) {
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const local = env.NODE_ENV !== "production" && !env.VERCEL_ENV && (options.memory || env.SEDERUNT_AUTH_FAKE === "1");
  if (local) return createMemoryInstallationStore(env);
  try {
    if (!url || !key) throw installationError("unavailable");
    secretsKey(env); // Validate the key before exposing OAuth, not after Slack consent.
    return createSupabaseInstallationStore({ url, key, env, fetchImpl: options.fetch || globalThis.fetch });
  } catch {
    const unavailable = async () => { throw installationError("unavailable", "Durable encrypted Slack storage is not configured."); };
    return { durable: false, encrypted: false, get: unavailable, tokenFor: unavailable, byTeam: unavailable, save: unavailable, revoke: unavailable, consumeState: unavailable, legacyEligible: unavailable };
  }
}
