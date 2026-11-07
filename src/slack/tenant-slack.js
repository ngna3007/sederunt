import { slackClaimState } from "./claim.js";
import { installationError, slackOAuthConfigured } from "./installations.js";
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
  if (slackOAuthConfigured(env) && !workspace.slackInstallations) throw installationError("unavailable");
  if (slackOAuthConfigured(env) && workspace.slackInstallations) {
    const install = await workspace.slackInstallations.tokenFor(tenant);
    if (install?.token) {
      return {
        linked: true,
        source: "install",
        generation: install.generation,
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
  // Redis ownership is not sufficient: the live tenant must have durable,
  // explicitly enrolled legacy eligibility, never a superseded/disconnected row.
  if (slackOAuthConfigured(env)) {
    if (await workspace.tenantBind.resolve("slack", claim.teamId) !== tenant) return none;
    if (!workspace.slackInstallations?.legacyEligible) throw installationError("unavailable");
    if (!await workspace.slackInstallations.legacyEligible({ tenantId: tenant, teamId: claim.teamId, enroll: true })) return none;
  }
  // A team that has its own OAuth installation belongs to that tenant only.
  if (slackOAuthConfigured(env) && workspace.slackInstallations && claim.teamId) {
    const owned = await workspace.slackInstallations.byTeam(claim.teamId);
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
  if (slackOAuthConfigured(env) && !workspace.slackInstallations) throw installationError("unavailable");
  if (slackOAuthConfigured(env) && workspace.slackInstallations && teamId) {
    const install = await workspace.slackInstallations.byTeam(teamId);
    if (install?.token) {
      return { tenantId: install.tenantId, token: install.token, botUserId: install.botUserId || "", source: "install", teamId: install.teamId, generation: install.generation };
    }
  }
  if (legacyTenantId) {
    const legacy = await slackConnection(workspace, legacyTenantId);
    if (legacy.linked && legacy.source === "legacy" && (!teamId || !legacy.teamId || legacy.teamId === teamId)) {
      return { tenantId: legacyTenantId, token: legacy.token, botUserId: "", source: "legacy", teamId: legacy.teamId };
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
  const client = () => {
    return slackConnection(workspace, tenantId).then((conn) => {
      if (!conn.linked) return null;
      return createSlackClient({
        ...workspace.env,
        SLACK_BOT_TOKEN: conn.token,
        SLACK_DEFAULT_CHANNEL: conn.channelId || "",
      }, installationFetch(workspace, tenantId, conn, fetchImpl || workspace.deps?.slack?.fetch || workspace.deps?.fetch || globalThis.fetch));
    });
  };
  const empty = { resolveChannel: "", channelLabel: "", authTest: { ok: false, teamId: "", teamName: "" } };
  const methods = {
    tenantScoped: true,
    fetch: fetchImpl || workspace.deps?.slack?.fetch || workspace.deps?.fetch || globalThis.fetch,
    /** The channel picked at install (or the legacy default) for this tenant only. */
    async defaultChannel() {
      const conn = await slackConnection(workspace, tenantId);
      return conn.linked ? conn.channelId || "" : "";
    },
  };
  for (const name of ["postMessage", "resolveChannel", "channelLabel", "authTest", "members", "downloadFile", "channelReady"]) {
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

/** Revalidate every network hop of an operation, not just a retained client.
 * A replaced/revoked generation aborts downloads/uploads before the next hop.
 * An already-sent request cannot be recalled; Slack enforces its token access.
 */
export function installationFetch(workspace, tenantId, expected, fetchImpl = globalThis.fetch) {
  if (expected.source === "legacy" && slackOAuthConfigured(workspace.env || {})) {
    return async (...args) => {
      if (!await workspace.slackInstallations.legacyEligible({ tenantId, teamId: expected.teamId })) throw installationError("stale");
      return fetchImpl(...args);
    };
  }
  if (expected.source !== "install") return fetchImpl;
  return async (...args) => {
    const current = await workspace.slackInstallations.tokenFor(tenantId);
    if (!current || current.generation !== expected.generation || current.teamId !== expected.teamId || current.token !== expected.token) {
      const error = new Error("Slack connection changed. Retry with the current workspace.");
      error.reason = "stale";
      throw error;
    }
    return fetchImpl(...args);
  };
}
