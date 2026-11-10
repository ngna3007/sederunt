/**
 * Binds a meeting page ear to its bot, and keeps the agent seat.
 * Vercel isolates do not share memory, so the ear also goes through Redis.
 */

import { timingSafeEqual } from "node:crypto";

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
    workspace.meetingVoice = { ears: new Map() };
  }
  const bag = workspace.meetingVoice;
  if (!(bag.ears instanceof Map)) bag.ears = new Map();
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

const SPEAKER_SECONDS = 120;
const TURN_SECONDS = 30;
const SEEN_SECONDS = 600;

function seatBag(workspace) {
  const bag = bagOf(workspace);
  if (!bag) return null;
  if (!(bag.seats instanceof Map)) bag.seats = new Map();
  if (!(bag.seatByBot instanceof Map)) bag.seatByBot = new Map();
  return bag;
}

function earMatches(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function seatFrom(input) {
  const ear = String(input?.ear || "");
  const botId = cleanBotId(input?.botId);
  if (!validMeetingEar(ear) || !botId) return null;
  const botName = String(input?.botName || "Adam").trim().slice(0, 40) || "Adam";
  return {
    ear,
    botId,
    tenantId: String(input?.tenantId || ""),
    roomId: cleanBotId(input?.roomId) || botId,
    botName,
    participantId: input?.participantId == null || input.participantId === "" ? null : String(input.participantId).slice(0, 40),
    ended: input?.ended === true,
  };
}

function namesMatch(left, right) {
  const a = String(left || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const b = String(right || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return Boolean(a) && a === b;
}

/** Remember which bot, tenant, and room this page ear may speak for. */
export function rememberAgentSeat(workspace, input) {
  const bag = seatBag(workspace);
  const seat = seatFrom(input);
  if (!bag || !seat) return false;
  bag.seats.set(seat.ear, seat);
  bag.seatByBot.set(seat.botId, seat.ear);
  return true;
}

export function agentSeatForBot(workspace, botId) {
  const bag = seatBag(workspace);
  const id = cleanBotId(botId);
  if (!bag || !id) return null;
  const ear = bag.seatByBot.get(id);
  return ear ? bag.seats.get(ear) || null : null;
}

export async function bindAgentSeat(workspace, input, env = process.env, fetchImpl = fetch) {
  const seat = seatFrom(input);
  if (!rememberAgentSeat(workspace, seat)) return false;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:seat:${seat.ear}`, JSON.stringify(seat), "EX", String(EAR_SECONDS)]);
  return true;
}

/**
 * The ear is the only credential. A bad shape is unauthorized.
 * A well-formed ear for an unknown or ended bot is forbidden.
 * The compare does not throw when the stored ear is absent.
 */
export async function resolveAgentSeat(workspace, ear, env = process.env, fetchImpl = fetch) {
  const token = String(ear || "");
  if (!validMeetingEar(token)) return { ok: false, status: 401 };
  const bag = seatBag(workspace);
  let seat = bag?.seats.get(token) || null;
  if (!seat && redisConfigured(env)) {
    const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:seat:${token}`]);
    if (typeof loaded.result === "string" && loaded.result.startsWith("{")) {
      try {
        const parsed = JSON.parse(loaded.result);
        if (rememberAgentSeat(workspace, { ...parsed, ear: token })) seat = bag.seats.get(token) || null;
      } catch {
        seat = null;
      }
    }
  }
  const stored = seat?.ear || "0".repeat(token.length);
  const match = earMatches(token, stored);
  if (!seat || !match || seat.ended) return { ok: false, status: 403 };
  if (!seat.participantId && redisConfigured(env)) {
    const speaker = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:speaker:${seat.botId}`]);
    if (typeof speaker.result === "string" && speaker.result.trim()) seat.participantId = speaker.result.trim();
  }
  return { ok: true, seat };
}

export function endAgentSeat(workspace, botId) {
  const seat = agentSeatForBot(workspace, botId);
  if (!seat) return false;
  seat.ended = true;
  return true;
}

export async function finishAgentSeat(workspace, botId, env = process.env, fetchImpl = fetch) {
  const seat = agentSeatForBot(workspace, botId);
  if (!endAgentSeat(workspace, botId) || !seat) return false;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:seat:${seat.ear}`, JSON.stringify(seat), "EX", String(EAR_SECONDS)]);
  return true;
}

/** A verified participant on this bot, from a final transcript. */
export function noteAgentMember(workspace, botId, row) {
  const bag = seatBag(workspace);
  const id = cleanBotId(botId);
  const participantId = String(row?.participantId || "").trim().slice(0, 40);
  const memberId = String(row?.memberId || participantId).trim().slice(0, 80);
  if (!bag || !id || !participantId || !memberId) return false;
  if (!(bag.members instanceof Map)) bag.members = new Map();
  bag.members.set(`${id}:${participantId}`, {
    participantId,
    name: String(row?.name || "").slice(0, 80),
    memberId,
  });
  return true;
}

export async function rememberAgentMember(workspace, botId, row, env = process.env, fetchImpl = fetch) {
  if (!noteAgentMember(workspace, botId, row)) return false;
  const id = cleanBotId(botId);
  const participantId = String(row.participantId).trim();
  await redisCommand(env, fetchImpl, [
    "SET",
    `sederunt:voice:member:${id}:${participantId}`,
    JSON.stringify({ name: String(row?.name || ""), memberId: String(row?.memberId || participantId) }),
    "EX",
    String(EAR_SECONDS),
  ]);
  return true;
}

/** The member recorded for this participant. A mismatched name is not that member. */
export async function agentMember(workspace, botId, query = {}, env = process.env, fetchImpl = fetch) {
  const bag = seatBag(workspace);
  const id = cleanBotId(botId);
  const participantId = String(query.participantId || "").trim();
  if (!bag || !id || !participantId) return null;
  if (!(bag.members instanceof Map)) bag.members = new Map();
  let row = bag.members.get(`${id}:${participantId}`) || null;
  if (!row && redisConfigured(env)) {
    const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:member:${id}:${participantId}`]);
    if (typeof loaded.result === "string" && loaded.result.startsWith("{")) {
      try {
        const parsed = JSON.parse(loaded.result);
        if (noteAgentMember(workspace, id, { participantId, name: parsed.name, memberId: parsed.memberId })) {
          row = bag.members.get(`${id}:${participantId}`) || null;
        }
      } catch {
        row = null;
      }
    }
  }
  if (!row) return null;
  if (query.name && row.name && !namesMatch(query.name, row.name)) return null;
  return row;
}

/** The bot's own participant, from a final whose speaker is the bot. */
export function noteAgentSpeaker(workspace, botId, participantId, speakerName = "") {
  const seat = agentSeatForBot(workspace, botId);
  const id = String(participantId || "").trim().slice(0, 40);
  if (!seat || !id) return false;
  if (speakerName && !namesMatch(speakerName, seat.botName)) return false;
  seat.participantId = id;
  return true;
}

export async function rememberAgentSpeaker(workspace, botId, participantId, speakerName, env = process.env, fetchImpl = fetch) {
  if (!noteAgentSpeaker(workspace, botId, participantId, speakerName)) return false;
  const id = cleanBotId(botId);
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:speaker:${id}`, String(participantId).trim(), "EX", String(SPEAKER_SECONDS)]);
  return true;
}

export async function holdAgentTurn(env, fetchImpl, botId, turnId) {
  const id = cleanBotId(botId);
  const token = String(turnId || "").slice(0, 80);
  if (!id || !token) return false;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:turn:${id}`, token, "EX", String(TURN_SECONDS)]);
  return true;
}

export async function agentTurnCurrent(env, fetchImpl, botId) {
  const id = cleanBotId(botId);
  if (!id || !redisConfigured(env)) return "";
  const loaded = await redisCommand(env, fetchImpl, ["GET", `sederunt:voice:turn:${id}`]);
  return typeof loaded.result === "string" ? loaded.result : "";
}

export async function releaseAgentTurn(env, fetchImpl, botId, turnId) {
  const id = cleanBotId(botId);
  if (!id) return false;
  await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:turn:${id}`, `cancel:${String(turnId || "").slice(0, 80)}`, "EX", String(TURN_SECONDS)]);
  return true;
}

/** True when this turn id is the first claim. No Redis means the caller decides locally. */
export async function rememberAgentTurn(env, fetchImpl, botId, turnId) {
  const id = cleanBotId(botId);
  const token = String(turnId || "").slice(0, 80);
  if (!id || !token) return false;
  const saved = await redisCommand(env, fetchImpl, ["SET", `sederunt:voice:seen:${id}:${token}`, "1", "EX", String(SEEN_SECONDS), "NX"]);
  if (!saved.ok) return true;
  return saved.result != null;
}
