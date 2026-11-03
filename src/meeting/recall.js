import { createHmac, timingSafeEqual } from "node:crypto";
import { addressesHearing, normalizeHearing } from "../hearing.js";

/**
 * Recall signs the raw body as id.timestamp.payload with the workspace secret.
 * A missing or wrong signature is a rejection. The secret is never put in the error.
 *
 * @param {{ secret?: string, headers?: Record<string, string | string[] | undefined>, payload?: string }} input
 */
export function verifyRecallRequest(input) {
  const headers = input?.headers ?? {};
  const id = header(headers, "webhook-id") || header(headers, "svix-id");
  const timestamp = header(headers, "webhook-timestamp") || header(headers, "svix-timestamp");
  const signature = header(headers, "webhook-signature") || header(headers, "svix-signature");
  const secret = typeof input?.secret === "string" ? input.secret : "";
  if (!secret || !id || !timestamp || !signature) return false;
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(encoded, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input?.payload ?? ""}`).digest();
  for (const part of signature.split(" ")) {
    const split = part.indexOf(",");
    if (split < 0 || part.slice(0, split) !== "v1") continue;
    const got = Buffer.from(part.slice(split + 1), "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

function header(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

const BOT_URL = "https://ap-northeast-1.recall.ai/api/v1/bot/";

/**
 * Recall.ai Output Media in ap-northeast-1. Join posts one bot only when the
 * key, an https meeting url, and a public https origin are all present.
 * Localhost is refused before any request. The key is never put in the error.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fetch?: typeof fetch }} [options]
 */
/** True only when the Recall key and a public https camera page are both present. */
export function meetingDoorReady(env = process.env) {
  const key = typeof env.RECALL_API_KEY === "string" && env.RECALL_API_KEY;
  return Boolean(key && env.RECALL_WEBHOOK_SECRET && cameraPage(env.SEDERUNT_PUBLIC_ORIGIN));
}

export function createMeetingAdapter(env = process.env, options = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const calls = [];
  return {
    calls,
    async join(input) {
      calls.push("join");
      const key = typeof env.RECALL_API_KEY === "string" ? env.RECALL_API_KEY : "";
      const meetingUrl = httpsUrl(input?.url);
      const guest = normalizeHearing({ name: input?.name }).name;
      const cameraUrl = cameraPage(env.SEDERUNT_PUBLIC_ORIGIN, guest);
      if (!key || !env.RECALL_WEBHOOK_SECRET || !meetingUrl || !cameraUrl) throw new Error("Meeting join is not configured");
      let response;
      try {
        response = await fetchImpl(BOT_URL, {
          method: "POST",
          headers: {
            authorization: `Token ${key}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            meeting_url: meetingUrl,
            bot_name: guest,
            output_media: {
              camera: { kind: "webpage", config: { url: cameraUrl } },
            },
            recording_config: {
              transcript: {
                provider: { recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" } },
                diarization: { use_separate_streams_when_available: true },
              },
              realtime_endpoints: [{
                type: "webhook",
                url: `${new URL(cameraUrl).origin}/api/recall`,
                events: ["transcript.data"],
              }],
            },
          }),
        });
      } catch {
        throw new Error("Meeting join failed");
      }
      const text = await response.text();
      if (!response.ok) throw new Error("Meeting join failed");
      let id = "";
      try {
        const parsed = JSON.parse(text);
        id = typeof parsed.id === "string" ? parsed.id : "";
      } catch {
        id = "";
      }
      if (!id || text.includes(key)) throw new Error("Meeting join failed");
      return { id };
    },
  };
}

/**
 * A Recall transcript event becomes one meeting delivery.
 * Talk that does not address the guest is still returned, so the gate can drop it.
 * A payload with no words is not a delivery.
 *
 * @param {unknown} payload
 */
export function recallTranscriptDelivery(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const inner = data.data && typeof data.data === "object" ? data.data : data;
  const words = Array.isArray(inner.words) ? inner.words : [];
  const text = words.map((word) => {
    if (typeof word === "string") return word;
    return typeof word?.text === "string" ? word.text : "";
  }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const participant = inner.participant && typeof inner.participant === "object" ? inner.participant : {};
  const memberId = participant.id != null && String(participant.id).trim()
    ? String(participant.id).trim()
    : (typeof participant.name === "string" ? participant.name.trim() : "");
  const botId = typeof data.bot?.id === "string" && data.bot.id
    ? data.bot.id
    : (typeof data.bot_id === "string" && data.bot_id ? data.bot_id : "meeting");
  const deliveryId = typeof data.transcript?.id === "string" && data.transcript.id
    ? data.transcript.id
    : (typeof inner.id === "string" ? inner.id : "");
  return {
    text,
    memberId,
    door: "meeting",
    addressed: addressesHearing(text),
    deliveryId,
    participants: memberId ? [memberId] : [],
    room: {
      id: String(botId),
      botPresent: true,
      source: "recall",
      kind: "meeting",
      memberIds: memberId ? [memberId] : [],
    },
  };
}

function httpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cameraPage(origin, name) {
  const url = httpsUrl(origin);
  if (!url) return "";
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")) return "";
  const guest = normalizeHearing({ name }).name;
  return `${new URL(url).origin}/meeting?name=${encodeURIComponent(guest)}`;
}
