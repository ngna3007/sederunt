import { createHmac, timingSafeEqual } from "node:crypto";
import { slackQuestion } from "./reply.js";

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
 * A channel event becomes one gate delivery. A huddle stays a huddle.
 * A delete names the message to forget. Slack's message_deleted event
 * carries deleted_ts and not the old text. That value is the stored message ts.
 */
export function slackDelivery(event) {
  const deleted = event?.subtype === "message_deleted" || typeof event?.deleted_ts === "string";
  const previous = deleted && event?.previous_message && typeof event.previous_message === "object"
    ? event.previous_message
    : null;
  const huddle = event?.type === "huddle" || event?.subtype === "huddle" || event?.channel_type === "huddle";
  const memberId = typeof (previous?.user || event?.user) === "string" ? (previous?.user || event.user) : "";
  const channel = typeof event?.channel === "string" ? event.channel : "";
  const text = stripMention(typeof (previous?.text ?? event?.text) === "string" ? (previous?.text ?? event.text) : "");
  const question = !deleted && slackQuestion(text);
  const file = attachedFile(event) || attachedFile(previous);
  const storedId = firstId(event?.ts, event?.client_msg_id);
  const forgetIds = deleted
    ? uniqueIds([event?.deleted_ts, previous?.ts, previous?.client_msg_id])
    : [];
  return {
    text,
    memberId,
    door: "channel",
    intent: deleted ? "delete" : undefined,
    forgetId: forgetIds[0] || "",
    forgetIds,
    // The delete event's own id must not equal the stored message ts, or the
    // gate treats the delete as a duplicate of the message it should forget.
    deliveryId: deleted ? `delete:${forgetIds[0] || storedId}` : storedId,
    participants: [],
    file,
    room: {
      // A question recalls every room this person was in. The reply still posts to askChannel.
      // Who is in the channel comes from Slack, not from fields on this event.
      id: question ? "" : channel,
      askChannel: channel,
      botPresent: true,
      source: huddle ? "slack-huddle" : "slack",
      kind: huddle ? "huddle" : "channel",
      memberIds: [],
    },
  };
}

function stripMention(text) {
  return String(text ?? "").replace(/^(?:<@[A-Z0-9]+>\s*)+/i, "").trim();
}

function firstId(...values) {
  return uniqueIds(values)[0] || "";
}

function uniqueIds(values) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function attachedFile(event) {
  const files = Array.isArray(event?.files) ? event.files : [];
  const file = files.find((item) => item && typeof item.name === "string" && item.name.trim());
  if (!file) return undefined;
  const url = typeof file.url_private_download === "string" && file.url_private_download
    ? file.url_private_download
    : (typeof file.url_private === "string" ? file.url_private : "");
  return {
    name: file.name.trim(),
    id: typeof file.id === "string" ? file.id : "",
    url,
  };
}
