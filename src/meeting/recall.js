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

/** Retrieve Bot for one id. The key stays on this request. */
export function recallBotUrl(id) {
  return `${BOT_URL}${encodeURIComponent(id)}/`;
}

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
              video_mixed_mp4: {},
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
/**
 * A meeting is over when Recall says the bot is done and names that bot.
 * A bare `{ event: "bot.done" }` has no room, so it is not an ending.
 *
 * @param {unknown} payload
 */
export function meetingEnded(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const event = typeof root.event === "string" ? root.event : "";
  if (event !== "bot.done" && event !== "bot.status_change") return null;
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const status = typeof data.status === "string" ? data.status : (data.status?.code || "");
  if (event === "bot.status_change" && status !== "done" && status !== "call_ended") return null;
  const botId = data.bot?.id || data.bot_id || root.bot?.id || "";
  if (typeof botId !== "string" || !botId.trim()) return null;
  return { roomId: botId.trim() };
}

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

/**
 * The console media card for one Retrieve Bot payload.
 * Download URLs are copied through. Nothing here reads an API key.
 *
 * @param {unknown} bot
 * @param {number} [now]
 */
export function mediaFromBot(bot, now = Date.now()) {
  const blank = {
    state: "none",
    title: "",
    videoUrl: "",
    transcriptUrl: "",
    participantsUrl: "",
    eventsUrl: "",
    timelineUrl: "",
    metadataUrl: "",
    startedAt: "",
    duration: 0,
    lines: [],
    segments: [],
    events: [],
  };
  if (!bot || typeof bot !== "object") return blank;
  const root = /** @type {Record<string, unknown>} */ (bot);
  const recordings = Array.isArray(root.recordings) ? root.recordings : [];
  const recording = recordings[0] && typeof recordings[0] === "object" ? recordings[0] : null;
  const shortcuts = recording && recording.media_shortcuts && typeof recording.media_shortcuts === "object"
    ? recording.media_shortcuts
    : {};
  const video = shortcutData(shortcuts.video_mixed);
  const transcript = shortcutData(shortcuts.transcript);
  const people = shortcutData(shortcuts.participant_events);
  const meta = shortcutData(shortcuts.meeting_metadata);
  const title = stringField(meta, "title") || stringField(root, "meeting_title");
  const started = stringField(recording, "started_at") || stringField(root, "join_at");
  const completed = stringField(recording, "completed_at");
  const duration = secondsBetween(started, completed);
  const urls = {
    title,
    videoUrl: stringField(video, "download_url"),
    transcriptUrl: stringField(transcript, "download_url"),
    participantsUrl: stringField(people, "participants_download_url"),
    eventsUrl: stringField(people, "participant_events_download_url"),
    timelineUrl: stringField(people, "speaker_timeline_download_url"),
    metadataUrl: stringField(meta, "download_url"),
    startedAt: started,
    duration,
    lines: Array.isArray(root.lines) ? root.lines : [],
    segments: Array.isArray(root.segments) ? root.segments : [],
    events: Array.isArray(root.events) ? root.events : [],
  };
  if (mediaExpired(recording, shortcuts, root, now)) return { ...blank, ...urls, state: "expired", videoUrl: "" };
  const code = statusCode(recording) || statusCode(shortcuts.video_mixed);
  if (!recordings.length) {
    const botCode = lastStatus(root);
    return { ...blank, ...urls, state: botCode && botCode !== "done" && botCode !== "fatal" ? "processing" : "none" };
  }
  if (!urls.videoUrl && code && code !== "done") return { ...blank, ...urls, state: "processing" };
  if (!urls.videoUrl && !urls.transcriptUrl && !urls.timelineUrl && !urls.participantsUrl) return { ...blank, ...urls, state: "none" };
  return { ...blank, ...urls, state: urls.videoUrl ? "ready" : "novideo" };
}

function shortcutData(node) {
  if (!node || typeof node !== "object") return {};
  const data = node.data;
  return data && typeof data === "object" ? data : {};
}

function stringField(node, key) {
  if (!node || typeof node !== "object") return "";
  const value = node[key];
  return typeof value === "string" ? value : "";
}

function statusCode(node) {
  if (!node || typeof node !== "object" || !node.status || typeof node.status !== "object") return "";
  return typeof node.status.code === "string" ? node.status.code : "";
}

function lastStatus(bot) {
  const changes = Array.isArray(bot.status_changes) ? bot.status_changes : [];
  const last = changes[changes.length - 1];
  return last && typeof last.code === "string" ? last.code : "";
}

function mediaExpired(recording, shortcuts, bot, now) {
  const blob = JSON.stringify({ recording, shortcuts, message: bot.message || bot.detail || "" });
  if (/media has already expired/i.test(blob)) return true;
  const stamps = [recording?.expires_at, shortcuts.video_mixed?.expires_at].filter((value) => typeof value === "string");
  return stamps.some((value) => {
    const time = Date.parse(value);
    return !Number.isNaN(time) && time <= now;
  });
}

function secondsBetween(start, end) {
  const a = Date.parse(start || "");
  const b = Date.parse(end || "");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 1000);
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
