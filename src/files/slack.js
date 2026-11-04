/**
 * Slack file_share and message_deleted, using the same delivery the server
 * already parsed. A channel that is not bound is skipped, not invented.
 */
export async function ingestSlackFile(runtime, input) {
  const channel = runtime.store.channelByExternal("slack", input.externalChannelId || "");
  if (!channel) return { skipped: true, reason: "Slack channel is not bound to a Sederunt channel" };
  const linked = runtime.store.userByExternal("slack", input.slackUserId || "") || {};
  let actorUserId = linked.userId || null;
  let ownerGuestId = linked.guestId || null;
  if (!actorUserId && !ownerGuestId) {
    const guest = runtime.store.ensureGuest({
      tenantId: channel.tenantId,
      externalUserId: input.slackUserId || "slack",
      name: input.slackName || input.slackUserId || "Slack",
    });
    ownerGuestId = guest.id;
    runtime.store.linkExternalUser({ provider: "slack", externalUserId: input.slackUserId || guest.id, guestId: guest.id });
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
    ownerName: input.slackName || "",
  });
  return { skipped: false, file: saved };
}

export function hideDeletedSlackMessages(runtime, externalIds) {
  const ids = [...new Set((externalIds || []).filter((id) => typeof id === "string" && id))];
  let hidden = 0;
  for (const id of ids) hidden += runtime.store.markExternalMessageDeleted(id);
  return { hidden };
}
