import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DEFAULT_BOT_NAME, normalizeBotName } from "../bot/identity.js";
import { addressesHearing, normalizeHearing } from "../hearing.js";
import { spikeCameraOrigin, spikeEnabled } from "./spike.js";

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

/** True only when the Recall key and a public https camera page are both present. */
export function meetingDoorReady(env = process.env) {
  const key = typeof env.RECALL_API_KEY === "string" && env.RECALL_API_KEY;
  return Boolean(key && env.RECALL_WEBHOOK_SECRET && cameraPage(env.SEDERUNT_PUBLIC_ORIGIN));
}

/**
 * Recall.ai in ap-northeast-1. Join posts one bot only when the
 * key, an https meeting url, and a public https origin are all present.
 * The webpage is the camera: Output Media cannot send audio without that video.
 * The page url carries an unguessable ear. Localhost is refused before any request.
 * The key is never put in the error.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fetch?: typeof fetch }} [options]
 */
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
      const botName = normalizeBotName(input?.botName) || DEFAULT_BOT_NAME;
      const ear = randomBytes(24).toString("hex");
      const cameraUrl = cameraPage(spikeCameraOrigin(env), guest, ear, spikeEnabled(env));
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
            bot_name: botName,
            output_media: {
              camera: {
                kind: "webpage",
                config: { url: cameraUrl },
              },
            },
            variant: {
              zoom: "web_4_core",
              google_meet: "web_4_core",
              microsoft_teams: "web_4_core",
            },
            recording_config: {
              video_mixed_mp4: {},
              include_bot_in_recording: { audio: true },
              transcript: {
                provider: { recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" } },
                diarization: { use_separate_streams_when_available: true },
              },
              realtime_endpoints: [{
                type: "webhook",
                url: `${new URL(cameraUrl).origin}/api/recall`,
                events: [
                  "transcript.data",
                  "transcript.partial_data",
                  "participant_events.join",
                  "participant_events.leave",
                  "participant_events.update",
                ],
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
      return { id, ear };
    },
    /**
     * Documented Recall remove-from-call:
     * POST /api/v1/bot/{id}/leave_call/ (ap-northeast-1 same host as create).
     * Used when durable tenant bind fails after join so the bot does not keep listening.
     */
    async leave(botId) {
      calls.push("leave");
      const key = typeof env.RECALL_API_KEY === "string" ? env.RECALL_API_KEY : "";
      const id = typeof botId === "string" ? botId.trim() : "";
      if (!key || !id) return { ok: false, reason: "missing" };
      let response;
      try {
        response = await fetchImpl(`${BOT_URL}${encodeURIComponent(id)}/leave_call/`, {
          method: "POST",
          headers: {
            authorization: `Token ${key}`,
            accept: "application/json",
          },
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response.ok || response.status === 200) return { ok: true };
      // Already left / unknown — treat as cleaned enough for fail-closed bind.
      if (response.status === 404 || response.status === 400) return { ok: true, reason: "absent" };
      return { ok: false, reason: `http-${response.status}` };
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
 * A meeting is over when Recall says the bot left or finished, and names that bot.
 * The host can end the call at any time. That arrives as `bot.call_ended`, then `bot.done`.
 * A bare `{ event: "bot.done" }` has no room, so it is not an ending.
 *
 * @param {unknown} payload
 */
export function meetingEnded(payload) {
  const update = meetingCallUpdate(payload);
  if (!update) return null;
  if (update.call !== "call_ended" && update.call !== "done") return null;
  return { roomId: update.roomId };
}

/** Recall bot phases, earliest to latest. A later phase does not move backward. */
export const MEETING_CALLS = Object.freeze([
  "joining_call",
  "in_waiting_room",
  "in_call_not_recording",
  "in_call_recording",
  "fatal",
  "call_ended",
  "done",
]);

export function meetingCallRank(code) {
  const rank = MEETING_CALLS.indexOf(code);
  return rank < 0 ? 0 : rank + 1;
}

/**
 * The latest known Recall phase for one bot.
 * A finished recording with no status list is done.
 * A recording still processing after the call is call_ended.
 *
 * @param {unknown} bot
 */
export function meetingCallCode(bot) {
  if (!bot || typeof bot !== "object") return "";
  const changes = Array.isArray(bot.status_changes) ? bot.status_changes : [];
  let code = "";
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const next = changes[index] && typeof changes[index].code === "string" ? changes[index].code : "";
    if (meetingCallRank(next)) {
      code = next;
      break;
    }
  }
  if (!code) {
    const direct = typeof bot.status === "string"
      ? bot.status
      : (bot.status && typeof bot.status.code === "string" ? bot.status.code : "");
    if (meetingCallRank(direct)) code = direct;
  }
  const recordings = Array.isArray(bot.recordings) ? bot.recordings : [];
  const recording = recordings[0] && typeof recordings[0] === "object" ? recordings[0] : null;
  const recorded = statusCode(recording);
  // A finished file means the call is over, even if the last live phase is still listed.
  if (recorded === "done" && code !== "fatal") return "done";
  if (!code && recorded === "processing") return "call_ended";
  return code;
}

/**
 * A signed Recall bot event that names a phase.
 * `bot.done` with no status word is done.
 *
 * @param {unknown} payload
 */
export function meetingCallUpdate(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const event = typeof root.event === "string" ? root.event : "";
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const inner = data.data && typeof data.data === "object" ? data.data : {};
  const raw = typeof data.status === "string" ? data.status : (data.status && typeof data.status.code === "string" ? data.status.code : "");
  const nested = typeof inner.code === "string" ? inner.code : "";
  const fromEvent = event.startsWith("bot.") ? event.slice(4) : "";
  const code = meetingCallRank(raw) ? raw : (meetingCallRank(nested) ? nested : (meetingCallRank(fromEvent) ? fromEvent : ""));
  if (!code && event !== "bot.done") return null;
  const botId = data.bot?.id || data.bot_id || root.bot?.id || "";
  if (typeof botId !== "string" || !botId.trim()) return null;
  return { roomId: botId.trim(), call: code || "done" };
}

/**
 * Spoken lines from a Recall transcript download.
 * Each line is one participant turn: speaker, text, and seconds from the start.
 *
 * @param {unknown} payload
 */
export function transcriptLines(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && (payload.utterances || payload.transcript || payload.lines)) || [];
  if (!Array.isArray(rows)) return [];
  const lines = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const participant = row.participant && typeof row.participant === "object" ? row.participant : {};
    const speaker = typeof participant.name === "string" && participant.name.trim()
      ? participant.name.trim()
      : (typeof row.speaker === "string" && row.speaker.trim() ? row.speaker.trim() : "Speaker");
    const words = Array.isArray(row.words) ? row.words : [];
    let text = "";
    let start = NaN;
    let end = NaN;
    if (words.length) {
      text = words.map((word) => (typeof word?.text === "string" ? word.text : "")).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      start = relativeStamp(words[0]?.start_timestamp ?? words[0]?.start);
      const last = words[words.length - 1];
      end = relativeStamp(last?.end_timestamp ?? last?.end ?? last?.start_timestamp ?? last?.start);
    } else if (typeof row.text === "string") {
      text = row.text.replace(/\s+/g, " ").trim();
      start = relativeStamp(row.start);
      end = relativeStamp(row.end);
    }
    if (!text) continue;
    const began = Number.isFinite(start) ? start : 0;
    lines.push({
      speaker: speaker.slice(0, 80),
      text: text.slice(0, 2000),
      start: began,
      end: Number.isFinite(end) && end >= began ? end : began + 0.4,
    });
    if (lines.length >= 400) break;
  }
  return lines;
}

function relativeStamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof value.relative === "number" && Number.isFinite(value.relative)) return value.relative;
  return NaN;
}

/**
 * A join, leave, or name change. Absent when the payload is not a participant event.
 *
 * @param {unknown} payload
 * @returns {{ botId: string, participantId: string, name: string, present: boolean } | null}
 */
export function recallParticipantChange(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const event = typeof root.event === "string" ? root.event : "";
  const present = event === "participant_events.join" || event === "participant_events.update"
    ? true
    : (event === "participant_events.leave" ? false : null);
  if (present === null) return null;
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const inner = data.data && typeof data.data === "object" ? data.data : data;
  const participant = inner.participant && typeof inner.participant === "object" ? inner.participant : null;
  const participantId = participant?.id == null ? "" : String(participant.id).trim();
  const botId = typeof data.bot?.id === "string" ? data.bot.id.trim() : "";
  if (!participantId || !botId) return null;
  return {
    botId,
    participantId,
    name: typeof participant.name === "string" ? participant.name : "",
    present,
  };
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
    : "";
  const botId = typeof data.bot?.id === "string" && data.bot.id
    ? data.bot.id
    : (typeof data.bot_id === "string" && data.bot_id ? data.bot_id : "meeting");
  const deliveryId = transcriptChunkId(data, inner, words, text);
  const event = typeof root.event === "string" ? root.event : "";
  return {
    text,
    memberId,
    door: "meeting",
    addressed: addressesHearing(text),
    deliveryId,
    utteranceId: utteranceKey(data, words),
    partial: event === "transcript.partial_data",
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

function utteranceKey(data, words) {
  const transcriptId = typeof data?.transcript?.id === "string" ? data.transcript.id.trim() : "";
  const stamp = wordStamp(words[0]);
  // The transcript id alone covers the whole recording. A missing stamp must not claim it.
  if (!transcriptId || !stamp) return "";
  return `${transcriptId}:${stamp}`;
}

/**
 * Recall reuses one transcript.id for every streaming chunk in a recording.
 * A keep must key the chunk (utterance id, first-word stamp, or text), or the
 * second spoken sentence is dropped as a duplicate of the first.
 */
function transcriptChunkId(data, inner, words, text) {
  const innerId = typeof inner?.id === "string" && inner.id.trim() ? inner.id.trim() : "";
  if (innerId) return innerId;
  const transcriptId = typeof data?.transcript?.id === "string" && data.transcript.id.trim()
    ? data.transcript.id.trim()
    : "";
  const stamp = wordStamp(words[0]);
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return [transcriptId, stamp, digest].filter(Boolean).join(":");
}

function wordStamp(word) {
  if (!word || typeof word === "string") return "";
  const start = word.start_timestamp ?? word.start_time ?? word.start ?? "";
  if (typeof start === "number") return String(start);
  if (typeof start === "string") return start.trim();
  if (start && typeof start === "object") {
    if (typeof start.relative === "number") return String(start.relative);
    if (typeof start.relative === "string" && start.relative.trim()) return start.relative.trim();
    if (typeof start.absolute === "string" && start.absolute.trim()) return start.absolute.trim();
  }
  return "";
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
    call: "",
    endedNote: "",
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
    call: meetingCallCode(root),
    endedNote: callEndedNote(root),
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

function callEndedNote(bot) {
  const changes = Array.isArray(bot.status_changes) ? bot.status_changes : [];
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const row = changes[index];
    if (!row || typeof row !== "object") continue;
    if (row.code === "call_ended" && row.sub_code === "timeout_exceeded_everyone_left") {
      return "Everyone left, so the guest left.";
    }
  }
  return "";
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

function cameraPage(origin, name, ear, spike = false) {
  const url = httpsUrl(origin);
  if (!url) return "";
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")) return "";
  const guest = normalizeHearing({ name }).name;
  const page = new URL("/meeting", new URL(url).origin);
  page.searchParams.set("name", guest);
  if (typeof ear === "string" && /^[a-f0-9]{32,64}$/.test(ear)) page.searchParams.set("ear", ear);
  if (spike) page.searchParams.set("spike", "1");
  return page.toString();
}
