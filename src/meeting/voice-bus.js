/**
 * Hands a spoken clip from the transcript webhook to the meeting page.
 * Vercel isolates do not share memory, so the ear and the queue also go
 * through Redis. The ear only yields the next clip. One take consumes it.
 * A bot with no ear returns false so Output Audio can still play.
 */

const CLIP_BYTES = 700000;
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
  if (!(bag.staged instanceof Map)) bag.staged = new Map();
  if (!(bag.pending instanceof Map)) bag.pending = new Map();
  if (!(bag.played instanceof Map)) bag.played = new Map();
  if (!(bag.clipGeneration instanceof Map)) bag.clipGeneration = new Map();
  if (!(bag.closedAt instanceof Map)) bag.closedAt = new Map();
  if (!(bag.holds instanceof Set)) bag.holds = new Set();
  if (!(bag.holdAt instanceof Map)) bag.holdAt = new Map();
  if (!(bag.stoppedAt instanceof Map)) bag.stoppedAt = new Map();
  if (!(bag.chains instanceof Map)) bag.chains = new Map();
  if (!(bag.polls instanceof Map)) bag.polls = new Map();
  if (!(bag.takenAt instanceof Map)) bag.takenAt = new Map();
  return bag;
}

// The stop and the next clip for one bot share this chain, so a slow delete cannot land after the replacement is queued.
function chainBot(bag, botId, task) {
  const previous = bag.chains.get(botId) || Promise.resolve();
  const run = previous.then(() => task(), () => task());
  bag.chains.set(botId, run.then(() => {}, () => {}));
  return run;
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
  bag.queues.set(ear, [encoded]);
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
  return typeof encoded === "string" ? encoded : null;
}

function decodeQueued(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  if (encoded.startsWith("{")) {
    try {
      const parsed = JSON.parse(encoded);
      const audio = decodeClip(parsed?.a);
      if (!audio) return null;
      const floor = parsed?.f;
      const at = Number(floor?.at);
      return {
        audio,
        floor: floor?.botId && floor.roomId && floor.speaker
          ? { botId: String(floor.botId), roomId: String(floor.roomId), speaker: String(floor.speaker), at: Number.isFinite(at) ? at : 0 }
          : null,
      };
    } catch {
      // A raw clip from an older queue has no floor.
    }
  }
  const audio = decodeClip(encoded);
  return audio ? { audio, floor: null } : null;
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
 * Hand the latest mp3 to the bot's page.
 * A clip the page has not taken yet is replaced, so an unheard reply does not play first.
 * False means this bot has no page ear, so the caller may use Output Audio.
 * True means the page is the speaker, even when Redis did not accept the clip.
 * Queuing is not playback. The floor stays closed until takeMeetingClip yields the clip.
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
  return chainBot(bag, id, async () => {
    let ear = bag.ears.get(id) || "";
    if (!validMeetingEar(ear) && redisConfigured(env)) {
      const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:bot:${id}`]);
      ear = typeof loaded.result === "string" ? loaded.result : "";
      if (validMeetingEar(ear)) bag.ears.set(id, ear);
    }
    if (!validMeetingEar(ear)) return false;
    const encoded = bytes.toString("base64");
    const key = `sederunt:voice:q:${ear}`;
    const staged = bag.staged.get(id) || null;
    const floor = staged?.roomId && staged.speaker
      ? { botId: id, roomId: staged.roomId, speaker: staged.speaker, at: Date.now() }
      : null;
    // The speaker rides inside the clip. A later offer cannot relabel a clip already taken.
    const payload = JSON.stringify({ a: encoded, f: floor });
    const pushed = await redisCall(env, fetchImpl, [
      ["DEL", key],
      ["RPUSH", key, payload],
      ["EXPIRE", key, String(QUEUE_SECONDS)],
    ]);
    if (pushed.ok) return true;
    pushMemory(bag, ear, payload);
    return true;
  });
}

/**
 * Remember who may take the floor when the page takes the next clip.
 * A later call replaces the previous one, so a replaced clip cannot open the floor.
 *
 * @param {object} workspace
 * @param {string} botId
 * @param {{ roomId?: string, speaker?: string } | null | undefined} floor
 */
export function stageMeetingFloor(workspace, botId, floor) {
  const bag = bagOf(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id || !floor?.roomId || !floor?.speaker) return;
  const generation = (bag.clipGeneration.get(id) || 0) + 1;
  bag.clipGeneration.set(id, generation);
  bag.staged.set(id, { generation, roomId: floor.roomId, speaker: floor.speaker });
}

/**
 * The floor for a clip the page has already taken. Null until that take.
 *
 * @param {object} workspace
 * @param {string} botId
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ roomId: string, speaker: string, until: number } | null>}
 */
export async function playedMeetingFloor(workspace, botId, env = process.env, fetchImpl = fetch) {
  const bag = bagOf(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id) return null;
  const closed = await readClosed(bag, id, env, fetchImpl);
  let remote = null;
  if (redisConfigured(env)) {
    const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:floor:${id}`]);
    if (got.ok && typeof got.result === "string") {
      try {
        remote = JSON.parse(got.result);
      } catch {
        remote = null;
      }
    }
  }
  const fresh = (row) => Boolean(row?.roomId && row.speaker && row.until > Date.now() && (Number(row.at) || 0) > closed);
  const local = bag.played.get(id);
  const candidates = [local, remote].filter(fresh);
  if (!candidates.length) {
    bag.played.delete(id);
    return null;
  }
  candidates.sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0));
  const winner = candidates[candidates.length - 1];
  bag.played.set(id, winner);
  return winner;
}

/** The close time recorded by the last playedMeetingFloor read for this bot. */
export function meetingFloorClosedAt(workspace, botId) {
  const bag = bagOf(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id) return 0;
  return Number(bag.closedAt.get(id)) || 0;
}

/**
 * Forget a played floor. A later take of an older clip must not open it again.
 *
 * @param {object} workspace
 * @param {string} botId
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function clearPlayedFloor(workspace, botId, env = process.env, fetchImpl = fetch) {
  const bag = bagOf(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id) return;
  const at = Date.now();
  bag.played.delete(id);
  bag.closedAt.set(id, at);
  if (!redisConfigured(env)) return;
  await redisCall(env, fetchImpl, [
    ["DEL", `sederunt:voice:floor:${id}`],
    ["SET", `sederunt:voice:closed:${id}`, String(at), "EX", "120"],
  ]);
}

async function readClosed(bag, botId, env, fetchImpl) {
  let closed = Number(bag.closedAt.get(botId)) || 0;
  if (!redisConfigured(env)) return closed;
  const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:closed:${botId}`]);
  const remote = got.ok ? Number(got.result) : 0;
  if (remote > closed) {
    closed = remote;
    bag.closedAt.set(botId, closed);
  }
  return closed;
}

/**
 * Drop a clip the page has not taken and ask the page to stop the one it is playing.
 * On this process that delete finishes before a later clip for the same bot is written.
 * A pure backchannel does not call this.
 *
 * @param {object} workspace
 * @param {string} botId
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function requestMeetingHold(workspace, botId, env = process.env, fetchImpl = fetch) {
  const bag = bagOf(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id) return false;
  return chainBot(bag, id, async () => {
    let ear = bag.ears.get(id) || "";
    if (!validMeetingEar(ear) && redisConfigured(env)) {
      const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:bot:${id}`]);
      ear = typeof loaded.result === "string" ? loaded.result : "";
      if (validMeetingEar(ear)) bag.ears.set(id, ear);
    }
    if (!validMeetingEar(ear)) return false;
    const at = Date.now();
    const stopped = Math.max(at, holdStamp(bag.stoppedAt.get(ear)));
    bag.queues.delete(ear);
    bag.pending.delete(ear);
    bag.holds.add(ear);
    bag.holdAt.set(ear, at);
    bag.stoppedAt.set(ear, stopped);
    if (redisConfigured(env)) {
      await redisCall(env, fetchImpl, [
        ["DEL", `sederunt:voice:q:${ear}`],
        ["DEL", `sederunt:voice:pending:${ear}`],
        ["SET", `sederunt:voice:hold:${ear}`, String(at), "EX", "30"],
        ["SET", `sederunt:voice:stopped:${ear}`, String(stopped), "EX", "120"],
      ]);
    }
    return true;
  });
}

/**
 * True once, when a newer line asked the page to stop. The caller consumes it.
 *
 * @param {object} workspace
 * @param {string} ear
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function meetingHoldRequested(workspace, ear, env = process.env, fetchImpl = fetch) {
  return (await consumeMeetingHold(workspace, ear, env, fetchImpl)).held;
}

/** A hold stamp is the server clock. The old "1" marker has no time. */
function holdStamp(value) {
  const at = Number(value);
  return Number.isSafeInteger(at) && at > 1_000_000_000_000 ? at : 0;
}

async function peekMeetingHold(bag, ear, env, fetchImpl) {
  if (!redisConfigured(env)) return holdStamp(bag.holdAt.get(ear));
  const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:hold:${ear}`]);
  const remote = got.ok ? holdStamp(got.result) : 0;
  return Math.max(holdStamp(bag.holdAt.get(ear)), remote);
}

async function consumeMeetingHold(workspace, ear, env, fetchImpl) {
  const token = String(ear || "");
  const bag = bagOf(workspace);
  if (!validMeetingEar(token) || !bag) return { held: false, at: 0 };
  let remoteHeld = false;
  let remoteAt = 0;
  if (redisConfigured(env)) {
    const got = await redisCall(env, fetchImpl, [
      ["GET", `sederunt:voice:hold:${token}`],
      ["DEL", `sederunt:voice:hold:${token}`],
    ]);
    const value = got.ok ? got.result?.[0]?.result : null;
    remoteHeld = value != null && value !== "";
    remoteAt = holdStamp(value);
  }
  const localHeld = bag.holds.delete(token);
  const localAt = holdStamp(bag.holdAt.get(token));
  bag.holdAt.delete(token);
  return { held: localHeld || remoteHeld, at: Math.max(localAt, remoteAt) };
}

async function restoreMeetingHold(bag, ear, at, env, fetchImpl) {
  const stamp = holdStamp(at) || Date.now();
  const current = holdStamp(bag.holdAt.get(ear));
  bag.holds.add(ear);
  if (!current || stamp >= current) bag.holdAt.set(ear, stamp);
  if (!redisConfigured(env)) return;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:hold:${ear}`, String(stamp), "EX", "30", "NX"]);
}

/** The latest stop time. Consuming the one-shot hold does not clear it. */
async function readStopped(bag, ear, env, fetchImpl) {
  let stopped = holdStamp(bag.stoppedAt.get(ear));
  if (!redisConfigured(env)) return stopped;
  const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:stopped:${ear}`]);
  const remote = got.ok ? holdStamp(got.result) : 0;
  if (remote > stopped) {
    stopped = remote;
    bag.stoppedAt.set(ear, remote);
  }
  return stopped;
}

/**
 * Take the next clip for this ear. A second call does not return it again.
 * A poll older than one already served does not keep a clip queued after that,
 * and it does not open the floor for a clip it will not play.
 * A clip queued before a hold that is already visible is dropped the same way.
 * That hold stays set so the caller can still stop the page.
 * A clip queued before the latest stop time is dropped even after that one-shot hold was consumed.
 * A clip whose floor is older than one already opened is not returned and does not replace that floor.
 *
 * @param {object} workspace
 * @param {string} ear
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [poll] Page poll ticket. Zero skips the ordering check.
 * @returns {Promise<Buffer | null>}
 */
export async function takeMeetingClip(workspace, ear, env = process.env, fetchImpl = fetch, poll = 0) {
  const claimed = await claimMeetingClip(workspace, ear, env, fetchImpl, poll);
  if (!claimed.item) return null;
  const holdAt = await peekMeetingHold(claimed.bag, claimed.token, env, fetchImpl);
  const stoppedAt = await readStopped(claimed.bag, claimed.token, env, fetchImpl);
  if (claimed.at && (holdAt > claimed.at || stoppedAt > claimed.at)) return null;
  const opened = await promoteTaken(workspace, claimed.item.floor, env, fetchImpl);
  if (!opened) return null;
  claimed.bag.takenAt.set(claimed.token, claimed.at || Date.now());
  return claimed.item.audio;
}

/**
 * One page poll. The hold is read after the clip is popped and before its floor opens.
 * A clip queued before that hold is dropped and the page is told to stop.
 * A clip queued at the same time or later is the replacement: it plays, and the hold is consumed without a stop.
 * If a newer poll has already been served by the time that hold is visible, this poll does not consume it and does not send the stop.
 * If this poll deletes a hold and only then loses to a newer poll, it puts that hold back and does not send the stop.
 * The stop time stays after that one-shot hold is gone, so a clip queued earlier still does not play.
 * A floor opened for a newer clip stays. This poll does not play the older clip over it.
 *
 * @param {object} workspace
 * @param {string} ear
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @param {number | string} [poll]
 * @returns {Promise<{ audio: Buffer | null, stop: boolean, at: number }>}
 */
export async function takeMeetingVoice(workspace, ear, env = process.env, fetchImpl = fetch, poll = 0) {
  const claimed = await claimMeetingClip(workspace, ear, env, fetchImpl, poll);
  if (!claimed.answer) return { audio: null, stop: false, at: 0 };
  const ticket = pollTicket(poll);
  await peekMeetingHold(claimed.bag, claimed.token, env, fetchImpl);
  if (ticket) {
    const served = await readPoll(claimed.bag, claimed.token, env, fetchImpl);
    if (served.n && ticket < served.n) {
      if (claimed.raw && (!claimed.at || claimed.at >= served.at)) {
        await restoreClip(claimed.bag, claimed.token, claimed.raw, claimed.redis, env, fetchImpl);
      }
      return { audio: null, stop: false, at: 0 };
    }
  }
  const hold = await consumeMeetingHold(workspace, ear, env, fetchImpl);
  if (ticket) {
    const served = await readPoll(claimed.bag, claimed.token, env, fetchImpl);
    if (served.n && ticket < served.n) {
      if (hold.held) await restoreMeetingHold(claimed.bag, claimed.token, hold.at, env, fetchImpl);
      if (claimed.raw && (!claimed.at || claimed.at >= served.at)) {
        await restoreClip(claimed.bag, claimed.token, claimed.raw, claimed.redis, env, fetchImpl);
      }
      return { audio: null, stop: false, at: 0 };
    }
  }
  const stoppedAt = await readStopped(claimed.bag, claimed.token, env, fetchImpl);
  if (!claimed.item || (claimed.at && (hold.at > claimed.at || stoppedAt > claimed.at))) {
    return { audio: null, stop: hold.held, at: hold.at || Date.now() };
  }
  const opened = await promoteTaken(workspace, claimed.item.floor, env, fetchImpl);
  if (!opened) return { audio: null, stop: false, at: 0 };
  claimed.bag.takenAt.set(claimed.token, claimed.at || Date.now());
  return { audio: claimed.item.audio, stop: false, at: claimed.at || Date.now() };
}

async function claimMeetingClip(workspace, ear, env, fetchImpl, poll) {
  const token = String(ear || "");
  const bag = bagOf(workspace);
  const ticket = pollTicket(poll);
  const missed = { answer: false, item: null };
  if (!validMeetingEar(token) || !bag) return missed;
  bag.takenAt.delete(token);
  const served = await readPoll(bag, token, env, fetchImpl);
  if (ticket && served.n && ticket < served.n) return missed;
  const popped = await popClip(bag, token, env, fetchImpl);
  const again = await readPoll(bag, token, env, fetchImpl);
  if (ticket && again.n && ticket < again.n) {
    if (popped && queuedAt(popped.raw) >= again.at) await restoreClip(bag, token, popped.raw, popped.redis, env, fetchImpl);
    return missed;
  }
  if (ticket) await writePoll(bag, token, ticket, Date.now(), env, fetchImpl);
  if (!popped) return { answer: true, item: null, token, bag, at: 0, raw: null, redis: false };
  const item = decodeQueued(popped.raw);
  const at = queuedAt(popped.raw);
  if (!item) return { answer: true, item: null, token, bag, at: 0, raw: null, redis: false };
  return { answer: true, token, bag, item, at, raw: popped.raw, redis: popped.redis };
}

/** Server time of the clip just taken for this ear. Zero when that take returned nothing. */
export function meetingClipTakenAt(workspace, ear) {
  const bag = bagOf(workspace);
  return Number(bag?.takenAt.get(String(ear || ""))) || 0;
}

const POLL_MARK_MS = 120_000;

function pollTicket(value) {
  const ticket = Number(value);
  if (!Number.isSafeInteger(ticket) || ticket < 1) return 0;
  return ticket;
}

function livePoll(mark, now) {
  if (!mark?.n || !mark.at || now - mark.at >= POLL_MARK_MS) return { n: 0, at: 0 };
  return mark;
}

function parsePoll(value) {
  const [nRaw, atRaw] = String(value || "").split(":");
  const n = Number(nRaw);
  const at = Number(atRaw);
  if (!Number.isInteger(n) || n < 1) return { n: 0, at: 0 };
  return { n, at: Number.isFinite(at) ? at : 0 };
}

async function readPoll(bag, ear, env, fetchImpl) {
  const now = Date.now();
  const local = livePoll(bag.polls.get(ear), now);
  if (!local.n) bag.polls.delete(ear);
  if (!redisConfigured(env)) return local;
  const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:poll:${ear}`]);
  const remote = got.ok ? livePoll(parsePoll(got.result), now) : { n: 0, at: 0 };
  const mark = remote.n >= local.n ? remote : local;
  if (mark.n) bag.polls.set(ear, mark);
  else bag.polls.delete(ear);
  return mark;
}

async function writePoll(bag, ear, ticket, at, env, fetchImpl) {
  const current = livePoll(bag.polls.get(ear), Date.now());
  if (!current.n) bag.polls.delete(ear);
  if (current.n > ticket) return current;
  const mark = { n: ticket, at };
  bag.polls.set(ear, mark);
  if (redisConfigured(env)) {
    await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:poll:${ear}`, `${ticket}:${at}`, "EX", "120"]);
  }
  return mark;
}

function queuedAt(raw) {
  if (typeof raw !== "string" || !raw.startsWith("{")) return 0;
  try {
    return Number(JSON.parse(raw)?.f?.at) || 0;
  } catch {
    return 0;
  }
}

async function popClip(bag, ear, env, fetchImpl) {
  if (redisConfigured(env)) {
    const popped = await redisCommand(env, fetchImpl, ["LPOP", `sederunt:voice:q:${ear}`]);
    if (popped.ok && typeof popped.result === "string") return { raw: popped.result, redis: true };
  }
  const raw = shiftMemory(bag, ear);
  return raw ? { raw, redis: false } : null;
}

async function restoreClip(bag, ear, raw, fromRedis, env, fetchImpl) {
  if (fromRedis && redisConfigured(env)) {
    const pushed = await redisCommand(env, fetchImpl, ["LPUSH", `sederunt:voice:q:${ear}`, raw]);
    if (pushed.ok) return;
  }
  const queue = bag.queues.get(ear) || [];
  queue.unshift(raw);
  bag.queues.set(ear, queue);
}

function openedFloorAt(row) {
  const at = Number(row?.at) || 0;
  if (!row?.roomId || !row.speaker || !at || !(row.until > Date.now())) return 0;
  return at;
}

async function playedFloorAt(bag, botId, env, fetchImpl) {
  let remote = null;
  if (redisConfigured(env)) {
    const got = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:floor:${botId}`]);
    if (got.ok && typeof got.result === "string") {
      try {
        remote = JSON.parse(got.result);
      } catch {
        remote = null;
      }
    }
  }
  return Math.max(openedFloorAt(bag.played.get(botId)), openedFloorAt(remote));
}

/** Open this clip's floor. False means a newer floor is already open, so the clip must not play. */
async function promoteTaken(workspace, floor, env, fetchImpl) {
  const bag = bagOf(workspace);
  if (!bag || !floor?.botId || !floor.roomId || !floor.speaker) return true;
  const at = Number(floor.at) || 0;
  const closed = await readClosed(bag, floor.botId, env, fetchImpl);
  if (closed >= at) return true;
  if (await playedFloorAt(bag, floor.botId, env, fetchImpl) > at) return false;
  const record = {
    roomId: floor.roomId,
    speaker: floor.speaker,
    until: Date.now() + 90_000,
    at: at || Date.now(),
  };
  if (await playedFloorAt(bag, floor.botId, env, fetchImpl) > at) return false;
  if (openedFloorAt(bag.played.get(floor.botId)) > at) return false;
  bag.played.set(floor.botId, record);
  if (!redisConfigured(env)) return true;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:floor:${floor.botId}`, JSON.stringify(record), "EX", "90"]);
  const latest = bag.played.get(floor.botId);
  if (latest && latest !== record && openedFloorAt(latest) > at) {
    await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:floor:${floor.botId}`, JSON.stringify(latest), "EX", "90"]);
  }
  return true;
}
