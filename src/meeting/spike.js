import { timingSafeEqual } from "node:crypto";

/** Thirteen words. The same sentence is used for every voice sample. */
export const SPIKE_SENTENCE = "We will keep the launch on Thursday and finish the booth plan today.";

export const SPIKE_VOICES = [
  { model: "mistralai/voxtral-mini-tts-2603", voice: "en_paul_neutral" },
  { model: "elevenlabs/eleven-flash-v2.5", voice: "sarah" },
  { model: "deepgram/aura-2", voice: "aura-2-thalia-en" },
];

const SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";
const LOG_LIMIT = 40;
const LOG_SECONDS = 1800;

function spikeNonce(env) {
  const value = typeof env?.SEDERUNT_SPIKE_NONCE === "string" ? env.SEDERUNT_SPIKE_NONCE.trim() : "";
  if (value.length < 16 || value.length > 128) return "";
  return value;
}

/** Preview spike only. A short or missing nonce leaves the meeting path unchanged. */
export function spikeEnabled(env) {
  return env?.SEDERUNT_MEETING_SPIKE === "1" && spikeNonce(env).length > 0;
}

/** Constant-time check. A mismatch is the same as the spike being off. */
export function spikeAuthorized(env, header) {
  const nonce = spikeNonce(env);
  const given = typeof header === "string" ? header.trim() : "";
  if (!spikeEnabled(env) || !given) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(nonce);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Where a spiked bot loads its page. The public origin stays in use until
 * the spike is on, so a production join never follows the preview host.
 */
export function spikeCameraOrigin(env) {
  const published = typeof env?.SEDERUNT_PUBLIC_ORIGIN === "string" ? env.SEDERUNT_PUBLIC_ORIGIN : "";
  if (!spikeEnabled(env)) return published;
  const host = typeof env?.VERCEL_URL === "string" ? env.VERCEL_URL.trim() : "";
  if (/^[a-z0-9.-]+$/i.test(host) && host.includes(".")) return `https://${host}`;
  return published;
}

function safeToken(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9._-]{1,80}$/i.test(text) ? text : "";
}

function stampNumber(stamp, key) {
  if (typeof stamp === "number" && Number.isFinite(stamp)) return stamp;
  const value = stamp && typeof stamp === "object" ? stamp[key] : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function utteranceOf(message) {
  const root = message && typeof message === "object" ? message : {};
  const data = root.data && typeof root.data === "object" ? root.data : null;
  const nested = data?.data && typeof data.data === "object" ? data.data : null;
  if (nested && (nested.words || nested.participant)) return nested;
  if (data && (data.words || data.participant)) return data;
  const transcript = root.transcript && typeof root.transcript === "object" ? root.transcript : null;
  if (transcript && (transcript.words || transcript.participant)) return transcript;
  return root;
}

/**
 * Field names and clocks only. Spoken text, names, and emails are not copied.
 *
 * @param {unknown} message
 * @param {number} [receivedAt]
 */
export function transcriptEventShape(message, receivedAt = Date.now()) {
  const root = message && typeof message === "object" ? message : {};
  const utterance = utteranceOf(root);
  const words = Array.isArray(utterance.words) ? utterance.words : [];
  const first = words[0] && typeof words[0] === "object" ? words[0] : null;
  const last = words.length && typeof words[words.length - 1] === "object" ? words[words.length - 1] : null;
  const participant = utterance.participant && typeof utterance.participant === "object" ? utterance.participant : null;
  const event = safeToken(root.event) || (root.transcript ? "in-page" : "");
  return {
    receivedAt,
    topKeys: Object.keys(root).slice(0, 20),
    event,
    partial: event.includes("partial") || root.partial === true || utterance.partial === true,
    wordCount: words.length,
    wordKeys: first ? Object.keys(first).slice(0, 12) : [],
    textPresent: words.some((word) => typeof word?.text === "string" && word.text.trim().length > 0),
    startRelative: stampNumber(first?.start_timestamp, "relative"),
    endRelative: stampNumber(last?.end_timestamp, "relative"),
    participantKeys: participant ? Object.keys(participant).slice(0, 12) : [],
    participantIdType: participant && Object.prototype.hasOwnProperty.call(participant, "id") ? typeof participant.id : "missing",
    namePresent: typeof participant?.name === "string" && participant.name.trim().length > 0,
    emailPresent: typeof participant?.email === "string" && participant.email.includes("@"),
    isHost: participant?.is_host === true,
    platform: safeToken(participant?.platform),
    closeCode: Number.isInteger(root.code) ? root.code : null,
  };
}

function restConfig(env) {
  const url = String(env?.UPSTASH_REDIS_REST_URL || env?.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env?.UPSTASH_REDIS_REST_TOKEN || env?.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

export function pushSpikeShape(workspace, ear, shape) {
  if (!workspace || typeof workspace !== "object" || !ear) return;
  if (!(workspace.meetingSpike instanceof Map)) workspace.meetingSpike = new Map();
  const rows = workspace.meetingSpike.get(ear) || [];
  rows.unshift(shape);
  workspace.meetingSpike.set(ear, rows.slice(0, LOG_LIMIT));
}

export function readSpikeShapes(workspace, ear) {
  const rows = workspace?.meetingSpike?.get(ear);
  return Array.isArray(rows) ? rows.slice() : [];
}

async function redisExec(env, fetchImpl, commands) {
  const rest = restConfig(env);
  if (rest && typeof fetchImpl === "function") {
    const pipeline = commands.length > 1;
    const response = await fetchImpl(pipeline ? `${rest.url}/pipeline` : rest.url, {
      method: "POST",
      headers: { authorization: `Bearer ${rest.token}`, "content-type": "application/json" },
      body: JSON.stringify(pipeline ? commands : commands[0]),
    });
    if (!response?.ok) return null;
    const parsed = typeof response.json === "function" ? await response.json().catch(() => null) : null;
    if (pipeline) return Array.isArray(parsed) ? parsed.map((row) => row?.result) : null;
    return parsed?.result ?? null;
  }
  const redisUrl = String(env?.REDIS_URL || env?.KV_URL || "").trim();
  if (!redisUrl) return null;
  const { createClient } = await import("redis");
  const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
  client.on("error", () => {});
  await client.connect();
  try {
    const results = [];
    for (const command of commands) {
      results.push(await client.sendCommand(command.map((part) => String(part))));
    }
    return commands.length > 1 ? results : results[0];
  } finally {
    await client.quit().catch(() => {});
  }
}

function shapesFromList(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const row of list) {
    if (typeof row !== "string") continue;
    try {
      const shape = JSON.parse(row);
      if (shape && typeof shape === "object") rows.push(shape);
    } catch {
      // A bad row is skipped. The rest of the log still reads.
    }
  }
  return rows;
}

export async function saveSpikeShape(env, fetchImpl, ear, shape) {
  const key = `sederunt:spike:tx:${ear}`;
  await redisExec(env, fetchImpl, [
    ["LPUSH", key, JSON.stringify(shape)],
    ["LTRIM", key, "0", String(LOG_LIMIT - 1)],
    ["EXPIRE", key, String(LOG_SECONDS)],
  ]).catch(() => {});
}

export async function loadSpikeShapes(env, fetchImpl, ear) {
  try {
    const list = await redisExec(env, fetchImpl, [["LRANGE", `sederunt:spike:tx:${ear}`, "0", String(LOG_LIMIT - 1)]]);
    return shapesFromList(list);
  } catch {
    return [];
  }
}

async function measureOne(fetchImpl, key, voice, sentence) {
  const started = Date.now();
  let response;
  try {
    response = await fetchImpl(SPEECH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://sederunt.app",
        "X-Title": "Sederunt",
      },
      body: JSON.stringify({
        model: voice.model,
        input: sentence,
        voice: voice.voice,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { ttfbMs: null, totalMs: Date.now() - started, bytes: 0, chunks: 0, firstChunk: 0, status: 0, error: "network" };
  }
  const status = response?.status || 0;
  if (!response?.ok || typeof response.body?.getReader !== "function") {
    if (typeof response?.arrayBuffer === "function") await response.arrayBuffer().catch(() => {});
    else if (typeof response?.text === "function") await response.text().catch(() => {});
    return { ttfbMs: null, totalMs: Date.now() - started, bytes: 0, chunks: 0, firstChunk: 0, status };
  }
  const reader = response.body.getReader();
  let bytes = 0;
  let chunks = 0;
  let ttfbMs = null;
  let firstChunk = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next?.done) break;
      const size = next?.value?.byteLength || next?.value?.length || 0;
      if (!size) continue;
      chunks += 1;
      if (ttfbMs == null) {
        ttfbMs = Date.now() - started;
        firstChunk = size;
      }
      bytes += size;
    }
  } catch {
    return { ttfbMs, totalMs: Date.now() - started, bytes, chunks, firstChunk, status, error: "read" };
  }
  return { ttfbMs, totalMs: Date.now() - started, bytes, chunks, firstChunk, status };
}

/**
 * Two tries of each voice. The audio is counted and dropped.
 * The key is never copied into the report.
 */
export async function measureSpeechProbe(input = {}) {
  const key = typeof input.key === "string" ? input.key : "";
  const sentence = typeof input.sentence === "string" && input.sentence.trim() ? input.sentence.trim() : SPIKE_SENTENCE;
  if (!key || typeof input.fetchImpl !== "function") return { error: "no-key", sentenceWords: sentence.split(/\s+/).length, samples: [] };
  const samples = [];
  for (const voice of SPIKE_VOICES) {
    const tries = [];
    for (let index = 0; index < 2; index += 1) {
      tries.push(await measureOne(input.fetchImpl, key, voice, sentence));
    }
    samples.push({ model: voice.model, voice: voice.voice, tries });
  }
  return { sentenceWords: sentence.split(/\s+/).length, samples };
}
