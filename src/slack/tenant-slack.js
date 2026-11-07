import { slackClaimState } from "./claim.js";
import { slackOAuthConfigured } from "./installations.js";
import { createSlackClient } from "./post.js";

/**
 * Which Slack workspace (and bot token) belongs to a Sederunt tenant.
 *
 * With the Slack OAuth client configured, a tenant's own installation wins.
 * The deployment SLACK_BOT_TOKEN is used for a tenant only when that tenant
 * already holds the verified legacy claim of the token's team (explicit owner
 * Connect, first writer wins) — a fresh tenant never inherits it.
 * Without the OAuth client, behavior is the previous single-bot claim model.
 *
 * Switching the active tenant therefore switches the Slack workspace with no
 * consent, env edit, or redeploy: the lookup is keyed on the tenant.
 *
 * @returns {Promise<{ linked: boolean, source: "install"|"legacy"|"", token: string, teamId: string, teamName: string, channelId: string, conflictOwner?: string }>}
 */
export async function slackConnection(workspace, tenantId) {
  const tenant = String(tenantId || "").trim();
  const env = workspace.env || {};
  const none = { linked: false, source: "", token: "", teamId: "", teamName: "", channelId: "" };
  if (!tenant) return none;
  if (slackOAuthConfigured(env) && workspace.slackInstallations) {
    const install = await workspace.slackInstallations.tokenFor(tenant).catch(() => null);
    if (install?.token) {
      return {
        linked: true,
        source: "install",
        token: install.token,
        teamId: install.teamId,
        teamName: install.teamName || "",
        channelId: install.channelId || "",
      };
    }
  }
  if (!workspace.tenantBind || !env.SLACK_BOT_TOKEN) return none;
  const claim = await slackClaimState({
    tenantBind: workspace.tenantBind,
    slack: workspace.deps?.slack,
    channelId: workspace.deps?.app?.slackChannel || "",
    slackConfigured: true,
  }, tenant).catch(() => ({ linked: false }));
  if (claim.linked !== true) return { ...none, conflictOwner: claim.conflictOwner || "" };
  // A team that has its own OAuth installation belongs to that tenant only.
  if (slackOAuthConfigured(env) && workspace.slackInstallations && claim.teamId) {
    const owned = await workspace.slackInstallations.byTeam(claim.teamId).catch(() => null);
    if (owned && owned.tenantId !== tenant) return none;
  }
  return {
    linked: true,
    source: "legacy",
    token: env.SLACK_BOT_TOKEN,
    teamId: claim.teamId || "",
    teamName: "",
    channelId: claim.channelId || workspace.deps?.app?.slackChannel || "",
  };
}

/**
 * Tenant for an incoming Slack event: the team's installation first, then the
 * legacy claim resolver. Returns the token to answer with (never another tenant's).
 */
export async function slackEventTenant(workspace, { teamId = "", legacyTenantId = "" } = {}) {
  const env = workspace.env || {};
  if (slackOAuthConfigured(env) && workspace.slackInstallations && teamId) {
    const install = await workspace.slackInstallations.byTeam(teamId).catch(() => null);
    if (install?.token) {
      return { tenantId: install.tenantId, token: install.token, botUserId: install.botUserId || "", source: "install" };
    }
  }
  if (legacyTenantId) {
    const legacy = await slackConnection(workspace, legacyTenantId);
    if (legacy.linked && legacy.source === "legacy" && (!teamId || !legacy.teamId || legacy.teamId === teamId)) {
      return { tenantId: legacyTenantId, token: legacy.token, botUserId: "", source: "legacy" };
    }
    if (!slackOAuthConfigured(env)) {
      return { tenantId: legacyTenantId, token: env.SLACK_BOT_TOKEN || "", botUserId: "", source: "legacy" };
    }
    return { tenantId: "", token: "", botUserId: "", source: "" };
  }
  // No installation and no claim. Without OAuth this is the old single-bot path.
  if (!slackOAuthConfigured(env)) return { tenantId: "", token: env.SLACK_BOT_TOKEN || "", botUserId: "", source: "" };
  return { tenantId: "", token: "", botUserId: "", source: "" };
}

/**
 * A Slack client bound to one tenant. Methods resolve the tenant's token on each
 * call, so a tenant with no installation gets no-op/empty answers, never the
 * deployment bot. Used for depsFor(...).slack.
 */
export function tenantSlackClient(workspace, tenantId, fetchImpl) {
  const fallback = workspace.deps?.slack;
  if (!slackOAuthConfigured(workspace.env || {})) return fallback;
  let pending = null;
  const client = () => {
    pending ??= slackConnection(workspace, tenantId).then((conn) => {
      if (!conn.linked) return null;
      if (conn.source === "legacy") return fallback;
      return createSlackClient({
        ...workspace.env,
        SLACK_BOT_TOKEN: conn.token,
        SLACK_DEFAULT_CHANNEL: conn.channelId || "",
      }, fetchImpl || workspace.deps?.fetch || globalThis.fetch);
    });
    return pending;
  };
  const empty = { resolveChannel: "", channelLabel: "", authTest: { ok: false, teamId: "", teamName: "" } };
  const methods = {
    fetch: fetchImpl || workspace.deps?.fetch || globalThis.fetch,
    /** The channel picked at install (or the legacy default) for this tenant only. */
    async defaultChannel() {
      const conn = await slackConnection(workspace, tenantId);
      return conn.linked ? conn.channelId || "" : "";
    },
  };
  for (const name of ["postMessage", "resolveChannel", "channelLabel", "authTest", "members", "downloadFile"]) {
    methods[name] = async (...args) => {
      const real = await client();
      if (!real || typeof real[name] !== "function") {
        if (name === "postMessage") {
          const error = new Error("unsupported");
          error.reason = "unsupported";
          throw error;
        }
        return empty[name] ?? null;
      }
      return real[name](...args);
    };
  }
  return methods;
}
