/**
 * Slack file_share and message_deleted, using the same delivery the server
 * already parsed. A channel that is not bound is skipped, not invented.
 */
export async function ingestSlackFile(runtime, input) {
  const channel = await runtime.store.channelByExternal("slack", input.externalChannelId || "", { externalWorkspaceId: input.externalWorkspaceId });
  if (!channel) return { skipped: true, reason: "Slack channel is not bound to a Sederunt channel" };
  const linked = await runtime.store.userByExternal("slack", input.slackUserId || "", { tenantId: channel.tenantId, externalWorkspaceId: input.externalWorkspaceId }) || {};
  let actorUserId = linked.userId || null;
  let ownerGuestId = linked.guestId || null;
  if (!actorUserId && !ownerGuestId && runtime.store.durable) return { skipped: true, reason: "Slack user is not linked to a verified workspace member" };
  if (!actorUserId && !ownerGuestId) {
    const guest = await runtime.store.ensureGuest({
      tenantId: channel.tenantId,
      externalUserId: input.slackUserId || "slack",
      name: input.slackName || input.slackUserId || "Slack",
    });
    ownerGuestId = guest.id;
    await runtime.store.linkExternalUser({ provider: "slack", externalUserId: input.slackUserId || guest.id, guestId: guest.id });
  }
  const bytes = Buffer.isBuffer(input.bytes) || input.bytes instanceof Uint8Array
    ? input.bytes
    : Buffer.from(String(input.bytes || ""));
  const saved = await runtime.service.upload({
    actorUserId,
    ownerGuestId: actorUserId ? null : ownerGuestId,
    trusted: !actorUserId,
    channelId: channel.id,
    name: input.name,
    mimeType: input.mimeType || "application/octet-stream",
    bytes,
    externalMessageId: input.externalMessageId || null,
    externalWorkspaceId: input.externalWorkspaceId || null,
    externalChannelId: input.externalChannelId || null,
    slackFileId: input.slackFileId || null,
    ownerName: input.slackName || "",
  });
  return { skipped: false, file: saved };
}

export async function hideDeletedSlackMessages(runtime, externalIds, scope) {
  const ids = [...new Set((externalIds || []).filter((id) => typeof id === "string" && id))];
  let hidden = 0;
  for (const id of ids) hidden += await runtime.store.markExternalMessageDeleted(id, scope);
  return { hidden };
}
