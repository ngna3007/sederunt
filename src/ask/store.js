/**
 * Durable Ask AI stream state.
 *
 * Backends, first match wins:
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN)
 *                          Upstash over HTTPS (free database, local and dev). Plain fetch to
 *                          the Upstash REST API, so no extra client and no open socket.
 *   REDIS_URL (or KV_URL)  any Redis over redis:// or rediss://, e.g. Vercel Marketplace
 *                          Redis (free Essentials) in production.
 * With neither, an in-process store keeps the same shape so tests run; it does not
 * survive a restart, so resume after reload only holds within one process.
 *
 * Keys (prefix ASK_REDIS_PREFIX, default "sederunt:ask"):
 *   {p}:quota:{user}:{day} INCR counter, prompts used that day. The day is the calendar day in
 *                          ASK_QUOTA_TIMEZONE (default Asia/Saigon); the key expires an hour
 *                          after that day ends, so the limit resets daily.
 *   {p}:user:{user}       LIST of ask ids, newest first, trimmed to 20
 *   {p}:meta:{id}         HASH id, user, question, status, source, sources, result, createdAt, updatedAt
 *   {p}:chunks:{id}       LIST of text deltas in order; a reader resumes from an index
 * Stream keys expire after ASK_TTL_SECONDS (default 7 days).
 */

const DEFAULT_TTL = 7 * 24 * 60 * 60;
const KEEP_PER_USER = 20;
/** A stream that has not moved for this long is treated as stopped. */
export const STALE_MS = 90_000;

export function askLimit(env = process.env) {
  const raw = Number.parseInt(String(env.ASK_PROMPT_LIMIT ?? ""), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

/**
 * The quota day for `now`: its date in ASK_QUOTA_TIMEZONE, seconds until it ends,
 * and when it resets (ISO).
 */
export function quotaDay(env = process.env, now = Date.now()) {
  const timeZone = String(env.ASK_QUOTA_TIMEZONE || "").trim() || "Asia/Saigon";
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  }
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || "00";
  const elapsed = Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second"));
  const left = Math.max(1, 86400 - elapsed);
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    secondsLeft: left,
    resetAt: new Date(Math.floor(now / 1000) * 1000 + left * 1000).toISOString(),
    timeZone,
  };
}

function ttlSeconds(env) {
  const raw = Number.parseInt(String(env.ASK_TTL_SECONDS ?? ""), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL;
}

function newId() {
  return `ask_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Upstash / Vercel KV REST credentials, when set. */
export function restConfig(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

/** Which backend createAskStore picks: "redis" (REDIS_URL), "rest" (Upstash REST) or "memory". */
export function askBackend(env = process.env) {
  if (restConfig(env)) return "rest";
  if (String(env.REDIS_URL || env.KV_URL || "").trim()) return "redis";
  return "memory";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ client?: any, fetchImpl?: typeof fetch, now?: () => number }} [options] client: a connected node-redis client (tests)
 */
export function createAskStore(env = process.env, options = {}) {
  const clock = typeof options.now === "function" ? options.now : Date.now;
  if (options.client) return commandStore(env, "redis", nodeRedisRunner(async () => options.client), clock);
  const backend = askBackend(env);
  if (backend === "redis") {
    const url = String(env.REDIS_URL || env.KV_URL || "").trim();
    let pending = null;
    const connect = async () => {
      if (!pending) {
        pending = import("redis").then(async ({ createClient }) => {
          const client = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: (tries) => Math.min(tries * 200, 2000) } });
          client.on("error", () => {});
          await client.connect();
          return client;
        }).catch((error) => {
          pending = null;
          throw error;
        });
      }
      return pending;
    };
    return commandStore(env, "redis", nodeRedisRunner(connect), clock);
  }
  if (backend === "rest") return commandStore(env, "rest", restRunner(restConfig(env), options.fetchImpl || fetch), clock);
  return memoryStore(env, clock);
}

/** run(commands) executes the commands atomically and returns their results in order. */
function nodeRedisRunner(connect) {
  const run = async (commands) => {
    const client = await connect();
    if (commands.length === 1) return [await client.sendCommand(commands[0].map(String))];
    const multi = client.multi();
    for (const command of commands) multi.addCommand(command.map(String));
    return multi.exec();
  };
  run.close = async () => {
    const client = await connect().catch(() => null);
    if (client?.isOpen) await client.quit().catch(() => {});
  };
  return run;
}

function restRunner(config, fetchImpl) {
  return async (commands) => {
    const response = await fetchImpl(`${config.url}/${commands.length === 1 ? "pipeline" : "multi-exec"}`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands.map((command) => command.map(String))),
    });
    if (!response.ok) throw new Error(`redis rest ${response.status}`);
    const rows = await response.json();
    return (Array.isArray(rows) ? rows : []).map((row) => {
      if (row && row.error) throw new Error("redis rest command failed");
      return row ? row.result : null;
    });
  };
}

function pairs(value) {
  if (!value) return {};
  if (!Array.isArray(value)) return typeof value === "object" ? value : {};
  const out = {};
  for (let i = 0; i + 1 < value.length; i += 2) out[String(value[i])] = value[i + 1] == null ? "" : String(value[i + 1]);
  return out;
}

function commandStore(env, kind, run, clock = Date.now) {
  const prefix = String(env.ASK_REDIS_PREFIX || "sederunt:ask").trim() || "sederunt:ask";
  const ttl = ttlSeconds(env);
  const key = (...parts) => [prefix, ...parts].join(":");
  const one = async (...command) => (await run([command]))[0];
  return {
    kind,
    async close() {
      if (typeof run.close === "function") await run.close();
    },
    async quota(user, limit) {
      const today = quotaDay(env, clock());
      const used = Math.min(limit, Number(await one("GET", key("quota", user, today.day))) || 0);
      return { used, limit, remaining: Math.max(0, limit - used), resetAt: today.resetAt };
    },
    async claim(user, limit) {
      const today = quotaDay(env, clock());
      const quotaKey = key("quota", user, today.day);
      const [count] = await run([["INCR", quotaKey], ["EXPIRE", quotaKey, today.secondsLeft + 3600]]);
      const used = Number(count);
      if (used > limit) {
        await one("DECR", quotaKey);
        return { ok: false, used: limit, limit, remaining: 0, resetAt: today.resetAt };
      }
      return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetAt: today.resetAt };
    },
    async refund(user) {
      const quotaKey = key("quota", user, quotaDay(env, clock()).day);
      const left = Number(await one("DECR", quotaKey));
      if (left < 0) await one("SET", quotaKey, "0", "EX", 90000);
    },
    async create(user, question) {
      const id = newId();
      const now = String(Date.now());
      await run([
        ["HSET", key("meta", id), "id", id, "user", user, "question", question, "status", "streaming", "createdAt", now, "updatedAt", now],
        ["EXPIRE", key("meta", id), ttl],
        ["LPUSH", key("user", user), id],
        ["LTRIM", key("user", user), 0, KEEP_PER_USER - 1],
        ["EXPIRE", key("user", user), ttl],
      ]);
      return id;
    },
    async append(id, text) {
      if (!text) return;
      await run([
        ["RPUSH", key("chunks", id), text],
        ["EXPIRE", key("chunks", id), ttl],
        ["HSET", key("meta", id), "updatedAt", String(Date.now())],
      ]);
    },
    async finish(id, fields = {}) {
      const update = ["status", fields.status || "done", "updatedAt", String(Date.now())];
      if (fields.source) update.push("source", fields.source);
      if (fields.sources) update.push("sources", JSON.stringify(fields.sources));
      if (fields.result) update.push("result", JSON.stringify(fields.result));
      await one("HSET", key("meta", id), ...update);
    },
    async meta(id) {
      return shapeMeta(pairs(await one("HGETALL", key("meta", id))));
    },
    async chunks(id, from = 0) {
      const rows = await one("LRANGE", key("chunks", id), Math.max(0, from), -1);
      return Array.isArray(rows) ? rows.map(String) : [];
    },
    async list(user) {
      const rows = await one("LRANGE", key("user", user), 0, KEEP_PER_USER - 1);
      return Array.isArray(rows) ? rows.map(String) : [];
    },
    /** Quota and the newest-first ask ids in one round trip. */
    async overview(user, limit) {
      const today = quotaDay(env, clock());
      const [count, rows] = await run([["GET", key("quota", user, today.day)], ["LRANGE", key("user", user), 0, KEEP_PER_USER - 1]]);
      const used = Math.min(limit, Number(count) || 0);
      return {
        quota: { used, limit, remaining: Math.max(0, limit - used), resetAt: today.resetAt },
        ids: Array.isArray(rows) ? rows.map(String) : [],
      };
    },
    /** Meta and chunks (from an index) for several asks in one round trip. */
    async reads(ids, from = 0) {
      if (!ids.length) return [];
      const commands = [];
      for (const id of ids) commands.push(["HGETALL", key("meta", id)], ["LRANGE", key("chunks", id), Math.max(0, from), -1]);
      const rows = await run(commands);
      return ids.map((id, i) => ({
        meta: shapeMeta(pairs(rows[i * 2])),
        chunks: Array.isArray(rows[i * 2 + 1]) ? rows[i * 2 + 1].map(String) : [],
      }));
    },
  };
}

function shapeMeta(raw) {
  if (!raw || !raw.id) return null;
  const parse = (value, fallback) => {
    if (typeof value !== "string" || !value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  return {
    id: raw.id,
    user: raw.user || "",
    question: raw.question || "",
    status: raw.status || "streaming",
    source: raw.source || "",
    sources: parse(raw.sources, []),
    result: parse(raw.result, null),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

/** A stream left "streaming" by a process that went away reads as stopped. */
export function settledStatus(meta, now = Date.now()) {
  if (!meta) return "missing";
  if (meta.status !== "streaming") return meta.status;
  return now - (meta.updatedAt || meta.createdAt) > STALE_MS ? "stopped" : "streaming";
}

function memoryStore(env, clock = Date.now) {
  const quotas = new Map();
  const metas = new Map();
  const chunkMap = new Map();
  const users = new Map();
  return {
    kind: "memory",
    async close() {},
    async quota(user, limit) {
      const today = quotaDay(env, clock());
      const used = Math.min(limit, quotas.get(`${user}:${today.day}`) || 0);
      return { used, limit, remaining: Math.max(0, limit - used), resetAt: today.resetAt };
    },
    async claim(user, limit) {
      const today = quotaDay(env, clock());
      const slot = `${user}:${today.day}`;
      const used = (quotas.get(slot) || 0) + 1;
      if (used > limit) return { ok: false, used: limit, limit, remaining: 0, resetAt: today.resetAt };
      quotas.set(slot, used);
      return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetAt: today.resetAt };
    },
    async refund(user) {
      const slot = `${user}:${quotaDay(env, clock()).day}`;
      quotas.set(slot, Math.max(0, (quotas.get(slot) || 0) - 1));
    },
    async create(user, question) {
      const id = newId();
      const now = Date.now();
      metas.set(id, { id, user, question, status: "streaming", createdAt: String(now), updatedAt: String(now) });
      chunkMap.set(id, []);
      const list = [id, ...(users.get(user) || [])].slice(0, KEEP_PER_USER);
      users.set(user, list);
      return id;
    },
    async append(id, text) {
      if (!text) return;
      const list = chunkMap.get(id) || [];
      list.push(text);
      chunkMap.set(id, list);
      const meta = metas.get(id);
      if (meta) meta.updatedAt = String(Date.now());
    },
    async finish(id, fields = {}) {
      const meta = metas.get(id);
      if (!meta) return;
      meta.status = fields.status || "done";
      meta.updatedAt = String(Date.now());
      if (fields.source) meta.source = fields.source;
      if (fields.sources) meta.sources = JSON.stringify(fields.sources);
      if (fields.result) meta.result = JSON.stringify(fields.result);
    },
    async meta(id) {
      return shapeMeta(metas.get(id) || null);
    },
    async chunks(id, from = 0) {
      return (chunkMap.get(id) || []).slice(Math.max(0, from));
    },
    async list(user) {
      return users.get(user) || [];
    },
    async overview(user, limit) {
      return { quota: await this.quota(user, limit), ids: await this.list(user) };
    },
    async reads(ids, from = 0) {
      return Promise.all(ids.map(async (id) => ({ meta: await this.meta(id), chunks: await this.chunks(id, from) })));
    },
  };
}
