/**
 * Hands a spoken clip from the transcript webhook to the meeting page.
 * Vercel isolates do not share memory, so the ear and the queue also go
 * through Redis. The ear only yields the next clip. One take consumes it.
 * A bot with no ear returns false so Output Audio can still play.
 */

const CLIP_BYTES = 700000;
const QUEUE_CAP = 4;
const QUEUE_SECONDS = 120;
const EAR_SECONDS = 6 * 60 * 60;
const EAR_PATTERN = /^[a-f0-9]{32,64}$/;

export function validMeetingEar(value) {
  return typeof value === "string" && EAR_PATTERN.test(value);
}

function cleanBotId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 80 || /\s/.test(id)) return "";
  return id;
}

function bagOf(workspace) {
  if (!workspace || typeof workspace !== "object") return null;
  if (!workspace.meetingVoice || typeof workspace.meetingVoice !== "object") {
    workspace.meetingVoice = { ears: new Map(), queues: new Map() };
  }
  const bag = workspace.meetingVoice;
  if (!(bag.ears instanceof Map)) bag.ears = new Map();
  if (!(bag.queues instanceof Map)) bag.queues = new Map();
  return bag;
}

function restConfig(env) {
  const url = String(env?.UPSTASH_REDIS_REST_URL || env?.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env?.UPSTASH_REDIS_REST_TOKEN || env?.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

function redisConfigured(env) {
  if (restConfig(env)) return true;
  return Boolean(String(env?.REDIS_URL || env?.KV_URL || "").trim());
}

async function redisCall(env, fetchImpl, body) {
  const rest = restConfig(env);
  if (rest) {
    const target = Array.isArray(body[0]) ? `${rest.url}/pipeline` : rest.url;
    try {
      const response = await fetchImpl(target, {
        method: "POST",
        headers: {
          authorization: `Bearer ${rest.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { ok: false };
      const parsed = await response.json().catch(() => null);
      if (Array.isArray(parsed)) {
        if (parsed.some((row) => row && typeof row.error === "string")) return { ok: false };
        return { ok: true, result: parsed };
      }
      if (parsed && typeof parsed.error === "string") return { ok: false };
      return { ok: true, result: parsed };
    } catch {
      return { ok: false };
    }
  }
  const redisUrl = String(env?.REDIS_URL || env?.KV_URL || "").trim();
  if (!redisUrl) return { ok: false, absent: true };
  const commands = Array.isArray(body[0]) ? body : [body];
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
    client.on("error", () => {});
    await client.connect();
    try {
      const results = [];
      for (const command of commands) {
        results.push(await client.sendCommand(command.map((part) => String(part))));
      }
      if (Array.isArray(body[0])) return { ok: true, result: results.map((result) => ({ result })) };
      return { ok: true, result: { result: results[0] } };
    } finally {
      await client.quit().catch(() => {});
    }
  } catch {
    return { ok: false };
  }
}

async function redisCommand(env, fetchImpl, command) {
  const called = await redisCall(env, fetchImpl, command);
  if (!called.ok) return called;
  return { ok: true, result: called.result?.result };
}

function pushMemory(bag, ear, encoded) {
  const queue = bag.queues.get(ear) || [];
  queue.push(encoded);
  while (queue.length > QUEUE_CAP) queue.shift();
  bag.queues.set(ear, queue);
}

function decodeClip(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  const audio = Buffer.from(encoded, "base64");
  if (!audio.length || audio.length > CLIP_BYTES) return null;
  return audio;
}

function shiftMemory(bag, ear) {
  const queue = bag.queues.get(ear);
  if (!queue?.length) return null;
  const encoded = queue.shift();
  if (!queue.length) bag.queues.delete(ear);
  return decodeClip(encoded);
}

/**
 * Remember which page ear belongs to this bot.
 * The page url already carries the ear. Redis lets another isolate find it.
 *
 * @param {object} workspace
 * @param {string} ear
 * @param {string} botId
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function bindMeetingEar(workspace, ear, botId, env = process.env, fetchImpl = fetch) {
  const token = String(ear || "");
  const id = cleanBotId(botId);
  const bag = bagOf(workspace);
  if (!validMeetingEar(token) || !id || !bag) return false;
  bag.ears.set(id, token);
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:bot:${id}`, token, "EX", String(EAR_SECONDS)]);
  return true;
}

/**
 * Queue one mp3 for the bot's page.
 * False means this bot has no page ear, so the caller may use Output Audio.
 * True means the page is the speaker, even when Redis did not accept the clip.
 *
 * @param {object} workspace
 * @param {string} botId
 * @param {Buffer | Uint8Array} audio
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function offerMeetingClip(workspace, botId, audio, env = process.env, fetchImpl = fetch) {
  const id = cleanBotId(botId);
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
  const bag = bagOf(workspace);
  if (!id || !bag || bytes.length === 0 || bytes.length > CLIP_BYTES) return false;
  let ear = bag.ears.get(id) || "";
  if (!validMeetingEar(ear) && redisConfigured(env)) {
    const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:bot:${id}`]);
    ear = typeof loaded.result === "string" ? loaded.result : "";
    if (validMeetingEar(ear)) bag.ears.set(id, ear);
  }
  if (!validMeetingEar(ear)) return false;
  const encoded = bytes.toString("base64");
  const key = `sederunt:voice:q:${ear}`;
  const pushed = await redisCall(env, fetchImpl, [
    ["RPUSH", key, encoded],
    ["LTRIM", key, "-4", "-1"],
    ["EXPIRE", key, String(QUEUE_SECONDS)],
  ]);
  if (pushed.ok) return true;
  pushMemory(bag, ear, encoded);
  return true;
}

/**
 * Take the next clip for this ear. A second call does not return it again.
 *
 * @param {object} workspace
 * @param {string} ear
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Buffer | null>}
 */
export async function takeMeetingClip(workspace, ear, env = process.env, fetchImpl = fetch) {
  const token = String(ear || "");
  const bag = bagOf(workspace);
  if (!validMeetingEar(token) || !bag) return null;
  if (redisConfigured(env)) {
    const popped = await redisCommand(env, fetchImpl, ["LPOP", `sederunt:voice:q:${token}`]);
    if (popped.ok) {
      const audio = decodeClip(popped.result);
      if (audio) return audio;
    }
  }
  return shiftMemory(bag, token);
}
