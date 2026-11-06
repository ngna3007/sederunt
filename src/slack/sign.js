import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack signing check. The secret stays with the caller and is not returned. */
export function verifySlackRequest({ secret, timestamp, signature, payload }) {
  if (typeof secret !== "string" || !secret) return false;
  if (typeof timestamp !== "string" || !timestamp) return false;
  if (typeof signature !== "string" || !signature) return false;
  const digest = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Bot user ids that count as an @mention. Live events name the bot on
 * authorizations. SLACK_BOT_USER_ID covers a payload that omits that list.
 *
 * @param {object} [payload]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function slackBotUserIds(payload, env = {}) {
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = trimmed.toUpperCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    ids.push(trimmed);
  };
  add(env?.SLACK_BOT_USER_ID);
  const auths = Array.isArray(payload?.authorizations) ? payload.authorizations : [];
  for (const auth of auths) {
    if (!auth || typeof auth !== "object" || auth.is_bot === false) continue;
    add(auth.user_id);
  }
  return ids;
}

/**
 * A channel event becomes one gate delivery. A huddle stays a huddle.
 * A delete names the message to forget. Slack's message_deleted event
 * carries deleted_ts and not the old text. That value is the stored message ts.
 *
 * A direct message (channel_type im or mpim, or a channel id that starts
 * with D) is always an ask. A channel message is an ask only when it
 * @mentions the bot. Every other channel message is stored.
 *
 * @param {object} event
 * @param {{ botUserIds?: string[] }} [options]
 */
export function slackDelivery(event, options = {}) {
  const deleted = event?.subtype === "message_deleted" || typeof event?.deleted_ts === "string";
  const previous = deleted && event?.previous_message && typeof event.previous_message === "object"
    ? event.previous_message
    : null;
  // File uploads often land as message_changed with the real text/files on .message.
  const nested = !deleted && event?.message && typeof event.message === "object" ? event.message : null;
  const body = deleted ? (previous || event) : (nested || event);
  const huddle = event?.type === "huddle" || event?.subtype === "huddle" || event?.channel_type === "huddle";
  const memberId = typeof body?.user === "string" ? body.user : (typeof event?.user === "string" ? event.user : "");
  const channel = typeof event?.channel === "string" ? event.channel : "";
  const raw = typeof body?.text === "string" ? body.text : "";
  const botUserIds = Array.isArray(options?.botUserIds) ? options.botUserIds : [];
  const ask = !deleted && !huddle && slackAsks(nested || event, botUserIds);
  const text = cleanText(raw, botUserIds);
  const files = attachedFiles(body, event, previous);
  const file = files[0];
  const storedId = firstId(event?.ts, event?.client_msg_id);
  const forgetIds = deleted
    ? uniqueIds([event?.deleted_ts, previous?.ts, previous?.client_msg_id])
    : [];
  return {
    text,
    memberId,
    door: "channel",
    ask,
    intent: deleted ? "delete" : undefined,
    forgetId: forgetIds[0] || "",
    forgetIds,
    // The delete event's own id must not equal the stored message ts, or the
    // gate treats the delete as a duplicate of the message it should forget.
    deliveryId: deleted ? `delete:${forgetIds[0] || storedId}` : storedId,
    participants: [],
    file,
    files,
    room: {
      // An ask recalls every room this person was in. The reply still posts to askChannel.
      // Who is in the channel comes from Slack, not from fields on this event.
      id: ask ? "" : channel,
      askChannel: channel,
      botPresent: true,
      source: huddle ? "slack-huddle" : "slack",
      kind: huddle ? "huddle" : "channel",
      memberIds: [],
    },
  };
}

function slackAsks(event, botUserIds) {
  if (isDirectMessage(event)) return true;
  if (event?.type === "app_mention") return true;
  return mentionsBot(event, botUserIds);
}

function isDirectMessage(event) {
  const kind = typeof event?.channel_type === "string" ? event.channel_type.toLowerCase() : "";
  if (kind === "im" || kind === "mpim") return true;
  const channel = typeof event?.channel === "string" ? event.channel : "";
  return channel.startsWith("D");
}

function mentionsBot(event, botUserIds) {
  const wanted = new Set(botUserIds.map(normalizeId).filter(Boolean));
  if (wanted.size === 0) return false;
  for (const id of mentionIds(typeof event?.text === "string" ? event.text : "")) {
    if (wanted.has(id)) return true;
  }
  return false;
}

function mentionIds(text) {
  const ids = [];
  const re = /<@([A-Z0-9]+)(?:\|[^>\n]*)?>/gi;
  for (const match of String(text).matchAll(re)) ids.push(normalizeId(match[1]));
  return ids;
}

function normalizeId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function cleanText(text, botUserIds) {
  return stripKnownMentions(stripMention(text), botUserIds);
}

function stripMention(text) {
  return String(text ?? "").replace(/^(?:<@[A-Z0-9]+(?:\|[^>\n]*)?>\s*)+/i, "").trim();
}

function stripKnownMentions(text, botUserIds) {
  const ids = new Set(botUserIds.map(normalizeId).filter(Boolean));
  if (ids.size === 0) return text;
  return text
    .replace(/<@([A-Z0-9]+)(?:\|[^>\n]*)?>/gi, (whole, id) => (ids.has(normalizeId(id)) ? "" : whole))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function firstId(...values) {
  return uniqueIds(values)[0] || "";
}

function uniqueIds(values) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function attachedFiles(...events) {
  const out = [];
  const seen = new Set();
  for (const event of events) {
    const files = Array.isArray(event?.files) ? event.files : [];
    for (const file of files) {
      if (!file || typeof file.name !== "string" || !file.name.trim()) continue;
      const name = file.name.trim();
      const id = typeof file.id === "string" ? file.id : "";
      const key = id || name;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = typeof file.url_private_download === "string" && file.url_private_download
        ? file.url_private_download
        : (typeof file.url_private === "string" ? file.url_private : "");
      out.push({ name, id, url });
    }
  }
  return out;
}
