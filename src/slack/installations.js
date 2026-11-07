import { openSecret, sealSecret } from "../connectors/secrets.js";

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
export function createMemoryInstallationStore(env = process.env) {
  const rows = new Map(); // tenantId -> row (sealed token)
  const seal = (token) => (env.MCP_SECRETS_KEY_V1 ? sealSecret(token, env) : { plain: token });
  const open = (sealed) => (sealed?.plain != null ? sealed.plain : openSecret(sealed, env));
  return {
    durable: false,
    async get(tenantId) {
      return publicRow(rows.get(String(tenantId || "").trim()));
    },
    async tokenFor(tenantId) {
      const row = rows.get(String(tenantId || "").trim());
      return row ? { ...publicRow(row), token: open(row.sealed) } : null;
    },
    async byTeam(teamId) {
      const team = cleanTeam(teamId);
      if (!team) return null;
      for (const row of rows.values()) {
        if (row.teamId === team) return { ...publicRow(row), token: open(row.sealed) };
      }
      return null;
    },
    async save(input) {
      const { tenantId, teamId, token } = validate(input);
      for (const row of rows.values()) {
        if (row.teamId === teamId && row.tenantId !== tenantId) throw installationError("conflict", "Slack is already linked to another workspace.");
      }
      const current = rows.get(tenantId);
      if (current && current.teamId !== teamId && input.replace !== true) {
        throw installationError("different-team", "This workspace is already linked to a different Slack workspace.");
      }
      const row = {
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
      return publicRow(row);
    },
    async removeTeam(teamId) {
      const team = cleanTeam(teamId);
      let removed = 0;
      for (const [key, row] of rows) {
        if (row.teamId === team) { rows.delete(key); removed += 1; }
      }
      return removed;
    },
    async remove(tenantId) {
      return rows.delete(String(tenantId || "").trim());
    },
  };
}

/**
 * Supabase-backed store over public.slack_installations (proposed migration
 * 20261107190000_slack_installations.sql). Service role only; RLS has no policies.
 */
export function createSupabaseInstallationStore({ url, key, env = process.env, fetchImpl = globalThis.fetch }) {
  const rest = `${String(url).replace(/\/$/, "")}/rest/v1/slack_installations`;
  async function call(method, query, body) {
    const endpoint = new URL(rest);
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
      headers.prefer = query?.on_conflict ? "return=representation,resolution=merge-duplicates" : "return=representation";
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
  };
  const withToken = (row) => row && {
    ...publicRow(fromRow(row)),
    token: openSecret({ ciphertext: unhex(row.ciphertext), nonce: unhex(row.nonce), keyVersion: row.key_version }, env),
  };
  const PUBLIC = "tenant_id,team_id,team_name,bot_user_id,app_id,channel_id,channel_name,scopes,installed_by,updated_at";
  return {
    durable: true,
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
      const owner = await call("GET", { select: "tenant_id", team_id: `eq.${teamId}` });
      if (owner?.[0] && owner[0].tenant_id !== tenantId) throw installationError("conflict", "Slack is already linked to another workspace.");
      const current = await call("GET", { select: "team_id", tenant_id: `eq.${tenantId}` });
      if (current?.[0] && current[0].team_id !== teamId && input.replace !== true) {
        throw installationError("different-team", "This workspace is already linked to a different Slack workspace.");
      }
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
      // tenant_id is the primary key; team_id is unique. A concurrent claim of
      // the same team by another tenant fails on the unique index (409).
      const rows = await call("POST", { on_conflict: "tenant_id" }, body);
      return publicRow(fromRow(Array.isArray(rows) ? rows[0] : rows));
    },
    async removeTeam(teamId) {
      const team = cleanTeam(teamId);
      if (!team) return 0;
      const rows = await call("DELETE", { team_id: `eq.${team}` }, undefined);
      return Array.isArray(rows) ? rows.length : 0;
    },
    async remove(tenantId) {
      const id = String(tenantId || "").trim();
      if (!UUID.test(id)) return false;
      await call("DELETE", { tenant_id: `eq.${id}` });
      return true;
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
  if (options.memory || String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1" || !url || !key || !env.MCP_SECRETS_KEY_V1) {
    return createMemoryInstallationStore(env);
  }
  return createSupabaseInstallationStore({ url, key, env, fetchImpl: options.fetch || globalThis.fetch });
}
