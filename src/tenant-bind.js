/**
 * Durable botId / Slack team(+channel) → tenant bindings for company memory.
 * Uses the same Redis/Upstash credentials as Ask when configured so another
 * isolate can resolve a join/Recall/Slack callback.
 *
 * Ownership is first-writer-wins (SET NX). Same-tenant refresh renews TTL.
 * A different tenant conflict fails closed without overwriting.
 * Slack connection keys are long-lived; meeting bot keys keep a short TTL.
 */

import { askBackend, restConfig } from "./ask/store.js";

const PREFIX = "sederunt:tenant-bind";
const BOT_TTL_SEC = 60 * 60 * 24 * 14; // 14 days — ephemeral meeting bots
const SLACK_TTL_SEC = 60 * 60 * 24 * 365; // 1 year — connection ownership; refreshed on claim

/**
 * @param {"bot" | "slack"} kind
 * @param {string} id
 */
export function bindKey(kind, id) {
  const clean = String(id || "").trim();
  if (!clean) return "";
  if (kind === "bot") return `${PREFIX}:bot:${clean}`;
  if (kind === "slack") return `${PREFIX}:slack:${clean}`;
  return "";
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function requiresDurableBind(env = process.env) {
  return askBackend(env) !== "memory";
}

/**
 * @param {"bot" | "slack"} kind
 * @param {number} defaultTtl
 */
function ttlFor(kind, defaultTtl) {
  if (kind === "slack") return SLACK_TTL_SEC;
  if (kind === "bot") return BOT_TTL_SEC;
  return defaultTtl;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   memory?: Map<string, string>,
 *   ttlSec?: number,
 *   remote?: {
 *     get: (key: string) => Promise<string>,
 *     setNx: (key: string, value: string, ttlSec: number) => Promise<"ok" | "conflict" | "error">,
 *     expire: (key: string, ttlSec: number) => Promise<boolean>,
 *     compareAndDelete?: (key: string, value: string) => Promise<boolean>,
 *   },
 * }} [options]
 */
export function createTenantBind(env = process.env, options = {}) {
  const memory = options.memory || new Map();
  const defaultTtl = Number.isFinite(options.ttlSec) ? Math.max(60, Number(options.ttlSec)) : BOT_TTL_SEC;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const backend = askBackend(env);
  const injected = options.remote || null;

  async function readRemote(key) {
    if (injected) return String(await injected.get(key) || "");
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) throw new Error("tenant-bind rest not configured");
      const response = await fetchImpl(`${config.url}/get/${encodeURIComponent(key)}`, {
        headers: { authorization: `Bearer ${config.token}` },
      });
      if (!response.ok) throw new Error(`tenant-bind get ${response.status}`);
      const body = await response.json();
      return typeof body?.result === "string" ? body.result : "";
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) throw new Error("tenant-bind redis not configured");
      const { createClient } = await import("redis");
      const client = createClient({ url, socket: { connectTimeout: 3000 } });
      client.on("error", () => {});
      await client.connect();
      try {
        const value = await client.get(key);
        return typeof value === "string" ? value : "";
      } finally {
        await client.quit().catch(() => {});
      }
    }
    return "";
  }

  /**
   * Strict protocol: only Redis "OK" counts as NX success. Null/empty = conflict.
   * Any other non-null result is treated as error (never silently ok).
   * @returns {Promise<"ok" | "conflict" | "error">}
   */
  async function setNxRemote(key, tenantId, ttlSec) {
    if (injected) return injected.setNx(key, tenantId, ttlSec);
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return "error";
      const response = await fetchImpl(`${config.url}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([["SET", key, tenantId, "NX", "EX", String(ttlSec)]]),
      });
      if (!response.ok) return "error";
      const rows = await response.json().catch(() => null);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || row.error) return "error";
      if (row.result === "OK") return "ok";
      if (row.result == null || row.result === "") return "conflict";
      // Unexpected payload (e.g. true/"1") — fail closed, do not accept as success.
      return "error";
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) return "error";
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url, socket: { connectTimeout: 3000 } });
        client.on("error", () => {});
        await client.connect();
        try {
          const result = await client.set(key, tenantId, { NX: true, EX: ttlSec });
          return result === "OK" ? "ok" : "conflict";
        } finally {
          await client.quit().catch(() => {});
        }
      } catch {
        return "error";
      }
    }
    return "ok";
  }

  async function expireRemote(key, ttlSec) {
    if (injected) return injected.expire(key, ttlSec);
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return false;
      const response = await fetchImpl(`${config.url}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([["EXPIRE", key, String(ttlSec)]]),
      });
      if (!response.ok) return false;
      const rows = await response.json().catch(() => null);
      const row = Array.isArray(rows) ? rows[0] : null;
      return !row?.error;
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) return false;
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url, socket: { connectTimeout: 3000 } });
        client.on("error", () => {});
        await client.connect();
        try {
          await client.expire(key, ttlSec);
          return true;
        } finally {
          await client.quit().catch(() => {});
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Delete only when the stored value still equals tenantId (never clobber another owner).
   */
  async function compareAndDeleteRemote(key, tenantId) {
    if (injected) {
      if (typeof injected.compareAndDelete === "function") {
        return injected.compareAndDelete(key, tenantId);
      }
      // Without an atomic compare-and-delete, refuse rather than risk deleting another owner.
      return false;
    }
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return false;
      // Lua: delete iff value matches — atomic vs a concurrent NX claim.
      const response = await fetchImpl(`${config.url}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([[
          "EVAL",
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
          "1",
          key,
          tenantId,
        ]]),
      });
      if (!response.ok) return false;
      const rows = await response.json().catch(() => null);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.error) return false;
      return Number(row?.result) > 0;
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) return false;
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url, socket: { connectTimeout: 3000 } });
        client.on("error", () => {});
        await client.connect();
        try {
          const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
          const result = await client.eval(script, { keys: [key], arguments: [tenantId] });
          return Number(result) > 0;
        } finally {
          await client.quit().catch(() => {});
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  return {
    memory,
    backend,
    requiresDurable: backend !== "memory",
    /**
     * @param {"bot" | "slack"} kind
     * @param {string} id
     * @param {string} tenantId
     * @param {{ requireRemote?: boolean }} [opts]
     */
    async bind(kind, id, tenantId, opts = {}) {
      const key = bindKey(kind, id);
      const tenant = String(tenantId || "").trim();
      if (!key || !tenant) return { ok: false, durable: false, reason: "missing" };
      const requireRemote = opts.requireRemote === true || backend !== "memory";
      const ttlSec = ttlFor(kind, defaultTtl);

      let remoteOwner = "";
      if (backend !== "memory" || injected) {
        try {
          remoteOwner = await readRemote(key);
        } catch {
          if (requireRemote) return { ok: false, durable: false, reason: "remote-read" };
        }
      }
      const localOwner = memory.get(key) || "";
      const owner = remoteOwner || localOwner;

      if (owner && owner !== tenant) {
        return { ok: false, durable: Boolean(remoteOwner), conflict: true, owner };
      }

      if (owner === tenant) {
        if (backend !== "memory" || injected) {
          const renewed = await expireRemote(key, ttlSec);
          if (requireRemote && !renewed) return { ok: false, durable: false, reason: "remote-expire", owner };
        }
        memory.set(key, tenant);
        return { ok: true, durable: requireRemote || backend !== "memory", created: false, owner: tenant };
      }

      if (backend === "memory" && !injected) {
        if (memory.has(key) && memory.get(key) !== tenant) {
          return { ok: false, durable: false, conflict: true, owner: memory.get(key) };
        }
        memory.set(key, tenant);
        return { ok: true, durable: false, created: true };
      }

      const set = await setNxRemote(key, tenant, ttlSec);
      if (set === "error") return { ok: false, durable: false, reason: "remote-write" };
      if (set === "conflict") {
        let won = "";
        try { won = await readRemote(key); } catch { /* ignore */ }
        if (won === tenant) {
          memory.set(key, tenant);
          return { ok: true, durable: true, created: false, owner: tenant };
        }
        return { ok: false, durable: true, conflict: true, owner: won || owner };
      }
      memory.set(key, tenant);
      return { ok: true, durable: true, created: true };
    },

    /**
     * Release a key only if we still own it. Safe rollback after a partial claim.
     * @param {"bot" | "slack"} kind
     * @param {string} id
     * @param {string} tenantId
     */
    async release(kind, id, tenantId) {
      const key = bindKey(kind, id);
      const tenant = String(tenantId || "").trim();
      if (!key || !tenant) return { ok: false, reason: "missing" };
      if (backend === "memory" && !injected) {
        if (memory.get(key) !== tenant) return { ok: false, reason: "not-owner", owner: memory.get(key) || "" };
        memory.delete(key);
        return { ok: true };
      }
      const deleted = await compareAndDeleteRemote(key, tenant);
      if (deleted) {
        if (memory.get(key) === tenant) memory.delete(key);
        return { ok: true };
      }
      const owner = memory.get(key) || "";
      try {
        const remote = await readRemote(key);
        if (remote && remote !== tenant) return { ok: false, reason: "not-owner", owner: remote };
      } catch { /* ignore */ }
      if (owner === tenant) memory.delete(key);
      return { ok: false, reason: "not-owner", owner };
    },

    /**
     * @param {"bot" | "slack"} kind
     * @param {string} id
     */
    async resolve(kind, id) {
      const key = bindKey(kind, id);
      if (!key) return "";
      if (backend !== "memory" || injected) {
        try {
          const remote = await readRemote(key);
          if (remote) {
            memory.set(key, remote);
            return remote;
          }
        } catch {
          if (backend !== "memory" || injected) {
            return memory.get(key) || "";
          }
        }
      }
      return memory.get(key) || "";
    },
  };
}
