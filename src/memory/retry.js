import { createHash, randomBytes } from "node:crypto";

// Walrus Memory refuses writes past 180 weighted requests a minute (HTTP 429,
// retry_after_seconds). A meeting fact refused that way was lost (dry run 2,
// Nov 11 09:41:04 UTC: "the design review moved to Thursday"). Writes now back
// off and try again; one still refused is queued in Redis and written later.

const QUEUE_KEY = "sederunt:memory-retry";
const DEAD_KEY = "sederunt:memory-retry:dead";
const LOCK_KEY = "sederunt:memory-retry:lock";
const MAX_ATTEMPTS = 40;
// Queued facts are meeting content: they do not sit in Redis for ever.
const QUEUE_TTL_S = 7 * 24 * 3600;
// Longer than one drain (40 s deadline plus a 20-45 s Walrus write), so two
// drains never hold the same row.
const LOCK_TTL_S = 120;

/** True for a Walrus rate-limit refusal. */
export function isRateLimited(error) {
  const text = error instanceof Error ? error.message : String(error || "");
  return /\(429\)|rate limit exceeded|too many requests/i.test(text);
}

/** The wait the refusal asked for, in ms (0 when it named none). */
export function retryAfterMs(error) {
  const text = error instanceof Error ? error.message : String(error || "");
  const match = /retry_after(?:_seconds)?\\?"?\s*[:=]\s*(\d+(?:\.\d+)?)/i.exec(text);
  return match ? Math.round(Number(match[1]) * 1000) : 0;
}

/** Room snapshots are rebuilt from Recall; every other kind is a fact to keep. */
export function durableKind(kind) {
  return typeof kind === "string" && kind !== "room";
}

/**
 * A stable idempotency key for a queued write that came without one, so a drain
 * that wrote the fact but died before removing it cannot write it twice.
 */
function queuedInput(tenantId, input) {
  if (!input || typeof input !== "object" || input.idempotencyKey) return input;
  const print = createHash("sha256").update(JSON.stringify([
    tenantId || "", input.account || "", input.kind || "", input.text || "", input.room?.id || input.roomId || "", input.at || "",
  ]), "utf8").digest("hex").slice(0, 32);
  return { ...input, idempotencyKey: `retry:${print}` };
}

function sleep(ms) {
  return new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); });
}

/**
 * Memory whose remember() retries a 429 with backoff inside `budgetMs`, then
 * queues a durable kind in Redis and reports it as queued.
 *
 * @param {object} memory
 * @param {{ tenantId?: string, redis?: (command: unknown[]) => Promise<any>, log?: (row: object) => void,
 *   budgetMs?: number, waits?: number[], wait?: (ms: number) => Promise<void> }} options
 */
export function withRateLimitRetry(memory, options = {}) {
  if (!memory || typeof memory.remember !== "function" || memory.rateLimitRetry) return memory;
  const budgetMs = Number.isFinite(options.budgetMs) ? options.budgetMs : 20_000;
  const waits = Array.isArray(options.waits) ? options.waits : [2_000, 6_000, 12_000];
  const wait = typeof options.wait === "function" ? options.wait : sleep;
  const log = typeof options.log === "function" ? options.log : (row) => console.info(JSON.stringify(row));
  const wrapped = Object.create(memory);
  wrapped.rateLimitRetry = true;
  wrapped.remember = async (input) => {
    const started = Date.now();
    let lastError = null;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await memory.remember(input);
      } catch (error) {
        if (!isRateLimited(error)) throw error;
        lastError = error;
        if (attempt >= waits.length) break;
        const asked = retryAfterMs(error);
        const pause = Math.round(Math.min(asked || waits[attempt], waits[attempt]) * (0.85 + Math.random() * 0.3));
        if (Date.now() - started + pause > budgetMs) break;
        try { log({ kind: "memory-rate-limited", kindName: input?.kind || "", attempt: attempt + 1, waitMs: pause }); } catch {}
        await wait(pause);
      }
    }
    if (durableKind(input?.kind) && typeof options.redis === "function") {
      const tenantId = options.tenantId || "";
      const row = JSON.stringify({ tenantId, input: queuedInput(tenantId, input), at: new Date().toISOString(), attempts: 0 });
      const pushed = await options.redis(["LPUSH", QUEUE_KEY, row]).catch(() => null);
      if (pushed?.ok) {
        await options.redis(["EXPIRE", QUEUE_KEY, String(QUEUE_TTL_S)]).catch(() => null);
        try { log({ kind: "memory-queued", kindName: input?.kind || "", reason: "rate-limited" }); } catch {}
        return { blobId: null, queued: true };
      }
    }
    throw lastError;
  };
  return wrapped;
}

/**
 * Write queued facts. One drain at a time across instances (a Redis lock with
 * its own token). A row is read, written, and only then removed, so a drain
 * that dies mid-write leaves it queued; its idempotency key makes the rewrite
 * a no-op. A rate-limited write stays where it is and stops this drain; any
 * other failure moves the row to the back of the line.
 *
 * @param {{ redis: (command: unknown[]) => Promise<any>, memoryFor: (tenantId: string) => any,
 *   log?: (row: object) => void, limit?: number, deadlineMs?: number }} options
 */
export async function drainMemoryRetries(options) {
  const redis = options.redis;
  const log = typeof options.log === "function" ? options.log : (row) => console.info(JSON.stringify(row));
  const limit = Number.isInteger(options.limit) ? options.limit : 5;
  const deadline = Date.now() + (Number.isFinite(options.deadlineMs) ? options.deadlineMs : 40_000);
  const token = randomBytes(12).toString("hex");
  const lock = await redis(["SET", LOCK_KEY, token, "NX", "EX", String(LOCK_TTL_S)]).catch(() => null);
  if (!lock?.ok || lock.result?.result == null) return { drained: 0, locked: true };
  let drained = 0;
  const drop = (raw) => redis(["LREM", QUEUE_KEY, "-1", raw]).catch(() => null);
  try {
    for (let index = 0; index < limit && Date.now() < deadline; index += 1) {
      const peeked = await redis(["LINDEX", QUEUE_KEY, "-1"]).catch(() => null);
      const raw = peeked?.ok ? peeked.result?.result : null;
      if (typeof raw !== "string" || !raw) break;
      let row;
      try { row = JSON.parse(raw); } catch { await drop(raw); continue; }
      const memory = options.memoryFor(String(row.tenantId || ""));
      try {
        if (!memory || typeof memory.remember !== "function") throw new Error("memory unavailable");
        const saved = await memory.remember(row.input);
        if (!saved || saved.ok === false) throw new Error("not saved");
        await drop(raw);
        drained += 1;
        log({ kind: "memory-retry-saved", kindName: row.input?.kind || "", attempts: (row.attempts || 0) + 1 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "");
        // Already written under this key (a drain that died after the write).
        if (/\(409\)/.test(message)) { await drop(raw); drained += 1; continue; }
        const next = JSON.stringify({ ...row, attempts: (row.attempts || 0) + 1 });
        if ((row.attempts || 0) + 1 >= MAX_ATTEMPTS) {
          await drop(raw);
          await redis(["LPUSH", DEAD_KEY, next]).catch(() => null);
          await redis(["EXPIRE", DEAD_KEY, String(QUEUE_TTL_S)]).catch(() => null);
          log({ kind: "memory-retry-dead", kindName: row.input?.kind || "", message: message.slice(0, 200) });
          continue;
        }
        if (isRateLimited(error)) {
          // Same place in line, one more attempt counted; try again next drain.
          await redis(["LSET", QUEUE_KEY, "-1", next]).catch(() => null);
          log({ kind: "memory-retry-later", kindName: row.input?.kind || "", attempts: (row.attempts || 0) + 1, message: message.slice(0, 200) });
          break;
        }
        await drop(raw);
        await redis(["LPUSH", QUEUE_KEY, next]).catch(() => null);
        log({ kind: "memory-retry-later", kindName: row.input?.kind || "", attempts: (row.attempts || 0) + 1, message: message.slice(0, 200) });
      }
    }
  } finally {
    // Only this drain's lock; one that expired and was taken by another drain is left.
    const held = await redis(["GET", LOCK_KEY]).catch(() => null);
    if (held?.ok && held.result?.result === token) await redis(["DEL", LOCK_KEY]).catch(() => null);
  }
  return { drained };
}
