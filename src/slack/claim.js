/**
 * Explicit authenticated workspace ↔ Slack team(+channel) ownership.
 * Team id comes from a verified auth.test of the bot token — never from a
 * deploy-global SLACK_TEAM_ID. First-writer-wins via tenant-bind NX.
 */

/**
 * @param {{
 *   tenantBind: { bind: Function, resolve?: Function },
 *   slack?: { authTest?: Function },
 *   channelId?: string,
 *   teamId?: string,
 *   teamName?: string,
 *   requireRemote?: boolean,
 * }} input
 * @param {string} tenantId
 */
export async function claimWorkspaceSlack(input, tenantId) {
  const tenant = String(tenantId || "").trim();
  const bind = input?.tenantBind;
  if (!tenant || !bind || typeof bind.bind !== "function") {
    return { ok: false, reason: "missing", durable: false };
  }

  let teamId = String(input.teamId || "").trim();
  let teamName = String(input.teamName || "").trim();
  if (!teamId && input.slack && typeof input.slack.authTest === "function") {
    const verified = await input.slack.authTest();
    if (!verified?.ok || !verified.teamId) {
      return { ok: false, reason: "unverified", durable: false };
    }
    teamId = verified.teamId;
    teamName = verified.teamName || teamName;
  }
  if (!teamId) return { ok: false, reason: "unverified", durable: false };

  const channelId = String(input.channelId || "").trim();
  const requireRemote = input.requireRemote === true;
  const opts = requireRemote ? { requireRemote: true } : {};

  // Prefer team:channel ownership; also claim team-level for DMs / missing channel.
  const keys = channelId ? [`${teamId}:${channelId}`, teamId] : [teamId];
  /** @type {Array<{ id: string, result: any }>} */
  const results = [];
  for (const id of keys) {
    const result = await bind.bind("slack", id, tenant, opts);
    results.push({ id, result });
    if (!result?.ok) {
      return {
        ok: false,
        reason: result?.conflict ? "conflict" : (result?.reason || "bind"),
        conflict: result?.conflict === true,
        owner: result?.owner || "",
        teamId,
        teamName,
        channelId,
        durable: result?.durable === true,
        results,
      };
    }
  }
  return {
    ok: true,
    teamId,
    teamName,
    channelId,
    durable: results.every((row) => row.result?.durable === true),
    results,
  };
}

/**
 * Honest Slack connection state for a workspace: linked only when a durable
 * (or local-demo) bind exists for the verified team / channel — not env flags.
 */
export async function slackClaimState(input, tenantId) {
  const tenant = String(tenantId || "").trim();
  const bind = input?.tenantBind;
  if (!tenant || !bind || typeof bind.resolve !== "function") {
    return { linked: false, teamId: "", channelId: "", configured: false };
  }
  let teamId = String(input.teamId || "").trim();
  if (!teamId && input.slack && typeof input.slack.authTest === "function") {
    const verified = await input.slack.authTest().catch(() => null);
    teamId = verified?.ok ? String(verified.teamId || "").trim() : "";
  }
  const channelId = String(input.channelId || "").trim();
  if (!teamId) return { linked: false, teamId: "", channelId, configured: Boolean(input.slack) };
  if (channelId) {
    const owner = await bind.resolve("slack", `${teamId}:${channelId}`);
    if (owner === tenant) return { linked: true, teamId, channelId, configured: true };
    if (owner && owner !== tenant) return { linked: false, teamId, channelId, configured: true, conflictOwner: owner };
  }
  const teamOwner = await bind.resolve("slack", teamId);
  if (teamOwner === tenant) return { linked: true, teamId, channelId, configured: true };
  if (teamOwner && teamOwner !== tenant) {
    return { linked: false, teamId, channelId, configured: true, conflictOwner: teamOwner };
  }
  return { linked: false, teamId, channelId, configured: true };
}
