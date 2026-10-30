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

/** A channel event becomes one gate delivery. A huddle stays a huddle. A delete names the message to forget. */
export function slackDelivery(event) {
  const deleted = event?.subtype === "message_deleted" || typeof event?.deleted_ts === "string";
  const previous = deleted && event?.previous_message && typeof event.previous_message === "object"
    ? event.previous_message
    : null;
  const huddle = event?.type === "huddle" || event?.subtype === "huddle" || event?.channel_type === "huddle";
  const memberId = typeof (previous?.user || event?.user) === "string" ? (previous?.user || event.user) : "";
  const channel = typeof event?.channel === "string" ? event.channel : "";
  const members = Array.isArray(event?.members)
    ? event.members.map(String).filter(Boolean)
    : [memberId].filter(Boolean);
  const text = typeof (previous?.text ?? event?.text) === "string" ? (previous?.text ?? event.text) : "";
  const question = !deleted && slackQuestion(text);
  const file = attachedFile(event) || attachedFile(previous);
  return {
    text,
    memberId,
    door: "channel",
    intent: deleted ? "delete" : undefined,
    forgetId: deleted
      ? (typeof previous?.client_msg_id === "string" ? previous.client_msg_id : (typeof previous?.ts === "string" ? previous.ts : ""))
      : "",
    deliveryId: deleted
      ? (typeof event?.deleted_ts === "string" ? event.deleted_ts : `delete:${typeof previous?.client_msg_id === "string" ? previous.client_msg_id : ""}`)
      : (typeof event?.client_msg_id === "string"
        ? event.client_msg_id
        : (typeof event?.ts === "string" ? event.ts : "")),
    participants: members,
    file,
    room: {
      // A question recalls every room this person was in. The reply still posts to askChannel.
      id: question ? "" : channel,
      askChannel: channel,
      botPresent: true,
      source: huddle ? "slack-huddle" : "slack",
      kind: huddle ? "huddle" : "channel",
      memberIds: members,
    },
  };
}

function attachedFile(event) {
  const files = Array.isArray(event?.files) ? event.files : [];
  const file = files.find((item) => item && typeof item.name === "string" && item.name.trim());
  if (!file) return undefined;
  return {
    name: file.name.trim(),
    bytes: file.bytes == null ? undefined : file.bytes,
  };
}
