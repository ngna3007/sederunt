/**
 * Explicit authenticated workspace ↔ Slack team(+channel) ownership.
 * Team id comes from a verified auth.test of the bot token — never from a
 * deploy-global SLACK_TEAM_ID. Team key is authoritative; channel keys are
 * subordinate. Claims are team-first with owner-guarded rollback so a rejected
 * tenant never retains a leftover channel (or team) key.
 */

/**
 * @param {{
 *   tenantBind: { bind: Function, resolve?: Function, release?: Function },
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

  // Authoritative team ownership first — fail closed before any channel write.
  const teamResult = await bind.bind("slack", teamId, tenant, opts);
  if (!teamResult?.ok) {
    return {
      ok: false,
      reason: teamResult?.conflict ? "conflict" : (teamResult?.reason || "bind"),
      conflict: teamResult?.conflict === true,
      owner: teamResult?.owner || "",
      teamId,
      teamName,
      channelId,
      durable: teamResult?.durable === true,
      results: [{ id: teamId, result: teamResult }],
    };
  }

  const createdTeam = teamResult.created === true;
  /** @type {Array<{ id: string, result: any }>} */
  const results = [{ id: teamId, result: teamResult }];

  if (channelId) {
    const channelResult = await bind.bind("slack", `${teamId}:${channelId}`, tenant, opts);
    results.push({ id: `${teamId}:${channelId}`, result: channelResult });
    if (!channelResult?.ok) {
      // Roll back a team key we just created; never delete another owner's team.
      if (createdTeam && typeof bind.release === "function") {
        await bind.release("slack", teamId, tenant);
      }
      return {
        ok: false,
        reason: channelResult?.conflict ? "conflict" : (channelResult?.reason || "bind"),
        conflict: channelResult?.conflict === true,
        owner: channelResult?.owner || teamResult.owner || "",
        teamId,
        teamName,
        channelId,
        durable: false,
        results,
        rolledBackTeam: createdTeam,
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
 * Honest Slack connection state for a workspace: linked only when this tenant
 * owns the verified team (and channel when set) — not env door flags alone.
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
  const botConfigured = Boolean(
    input.slackConfigured === true
      || (input.slack && typeof input.slack.authTest === "function")
      || input.botTokenConfigured === true,
  );
  if (!teamId) {
    return { linked: false, teamId: "", channelId, configured: botConfigured };
  }

  const teamOwner = await bind.resolve("slack", teamId);
  if (channelId) {
    const channelOwner = await bind.resolve("slack", `${teamId}:${channelId}`);
    // Split-brain / leftover channel under a different team owner → fail closed.
    if (channelOwner && teamOwner && channelOwner !== teamOwner) {
      return {
        linked: false,
        teamId,
        channelId,
        configured: true,
        conflictOwner: teamOwner,
        splitBrain: true,
      };
    }
    if (channelOwner === tenant && (!teamOwner || teamOwner === tenant)) {
      return { linked: true, teamId, channelId, configured: true };
    }
    if (channelOwner && channelOwner !== tenant) {
      return { linked: false, teamId, channelId, configured: true, conflictOwner: channelOwner };
    }
  }
  if (teamOwner === tenant) return { linked: true, teamId, channelId, configured: true };
  if (teamOwner && teamOwner !== tenant) {
    return { linked: false, teamId, channelId, configured: true, conflictOwner: teamOwner };
  }
  return { linked: false, teamId, channelId, configured: true };
}
