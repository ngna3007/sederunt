/**
 * Durable botId / Slack team+channel → tenant bindings for company memory.
 * Uses the same Redis/Upstash credentials as Ask when configured so another
 * isolate can resolve a join/Recall/Slack callback. Bindings are authorization
 * for provider callbacks only — never a substitute for membership checks.
 *
 * Ownership is first-writer-wins (SET NX). Same-tenant refresh renews TTL.
 * A different tenant conflict fails closed without overwriting.
 */

import { askBackend, restConfig } from "./ask/store.js";

const PREFIX = "sederunt:tenant-bind";
const DEFAULT_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

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
 * True when callbacks may land on another isolate — local Map alone is not enough.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function requiresDurableBind(env = process.env) {
  return askBackend(env) !== "memory";
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   memory?: Map<string, string>,
 *   ttlSec?: number,
 *   /** test double for remote SET/GET *\/
 *   remote?: {
 *     get: (key: string) => Promise<string>,
 *     setNx: (key: string, value: string, ttlSec: number) => Promise<"ok" | "conflict" | "error">,
 *     expire: (key: string, ttlSec: number) => Promise<boolean>,
 *   },
 * }} [options]
 */
export function createTenantBind(env = process.env, options = {}) {
  const memory = options.memory || new Map();
  const ttlSec = Number.isFinite(options.ttlSec) ? Math.max(60, Number(options.ttlSec)) : DEFAULT_TTL_SEC;
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
   * @returns {Promise<"ok" | "conflict" | "error">}
   */
  async function setNxRemote(key, tenantId) {
    if (injected) return injected.setNx(key, tenantId, ttlSec);
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return "error";
      // Upstash REST: SET key value NX EX ttl — pipeline keeps protocol honest.
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
      if (row?.error) return "error";
      // NX miss returns null/empty result; hit returns "OK".
      if (row?.result === "OK" || row?.result === true) return "ok";
      if (row?.result == null || row?.result === "") return "conflict";
      return "ok";
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
    return "ok"; // memory-only: caller applies Map NX
  }

  async function expireRemote(key) {
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

  return {
    memory,
    backend,
    requiresDurable: backend !== "memory",
    /**
     * Claim ownership. First writer wins. Same tenant refreshes TTL only.
     * @param {"bot" | "slack"} kind
     * @param {string} id team, team:channel, or bot id
     * @param {string} tenantId
     * @param {{ requireRemote?: boolean }} [opts]
     * @returns {Promise<{ ok: boolean, durable: boolean, conflict?: boolean, created?: boolean, owner?: string, reason?: string }>}
     */
    async bind(kind, id, tenantId, opts = {}) {
      const key = bindKey(kind, id);
      const tenant = String(tenantId || "").trim();
      if (!key || !tenant) return { ok: false, durable: false, reason: "missing" };
      const requireRemote = opts.requireRemote === true || backend !== "memory";

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
        // Same-owner refresh — never overwrite with a different value.
        if (backend !== "memory" || injected) {
          const renewed = await expireRemote(key);
          if (requireRemote && !renewed) return { ok: false, durable: false, reason: "remote-expire", owner };
        }
        memory.set(key, tenant);
        return { ok: true, durable: requireRemote || backend !== "memory", created: false, owner: tenant };
      }

      // First writer.
      if (backend === "memory" && !injected) {
        if (memory.has(key) && memory.get(key) !== tenant) {
          return { ok: false, durable: false, conflict: true, owner: memory.get(key) };
        }
        memory.set(key, tenant);
        return { ok: true, durable: false, created: true };
      }

      const set = await setNxRemote(key, tenant);
      if (set === "error") {
        return { ok: false, durable: false, reason: "remote-write" };
      }
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
          // Fall through to local only when remote is optional.
          if (backend !== "memory" || injected) {
            const local = memory.get(key);
            return local || "";
          }
        }
      }
      return memory.get(key) || "";
    },
  };
}
