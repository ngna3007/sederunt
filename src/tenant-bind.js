/**
 * Durable botId / Slack team → tenant bindings for company memory.
 * Uses in-process Map always; mirrors to Redis/Upstash when configured
 * (same credentials as Ask), so another isolate can resolve a join/Recall.
 * No schema migration. Bindings are authorization for provider callbacks only —
 * never a substitute for membership checks on console routes.
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
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetchImpl?: typeof fetch, memory?: Map<string, string>, ttlSec?: number }} [options]
 */
export function createTenantBind(env = process.env, options = {}) {
  const memory = options.memory || new Map();
  const ttlSec = Number.isFinite(options.ttlSec) ? Math.max(60, Number(options.ttlSec)) : DEFAULT_TTL_SEC;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const backend = askBackend(env);

  async function writeRemote(key, tenantId) {
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return;
      await fetchImpl(`${config.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(tenantId)}?EX=${ttlSec}`, {
        headers: { authorization: `Bearer ${config.token}` },
      }).catch(() => null);
      return;
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) return;
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url, socket: { connectTimeout: 3000 } });
        client.on("error", () => {});
        await client.connect();
        try {
          await client.set(key, tenantId, { EX: ttlSec });
        } finally {
          await client.quit().catch(() => {});
        }
      } catch {
        // Local map still holds the bind for this isolate.
      }
    }
  }

  async function readRemote(key) {
    if (backend === "rest") {
      const config = restConfig(env);
      if (!config) return "";
      try {
        const response = await fetchImpl(`${config.url}/get/${encodeURIComponent(key)}`, {
          headers: { authorization: `Bearer ${config.token}` },
        });
        if (!response.ok) return "";
        const body = await response.json().catch(() => null);
        return typeof body?.result === "string" ? body.result : "";
      } catch {
        return "";
      }
    }
    if (backend === "redis") {
      const url = String(env.REDIS_URL || env.KV_URL || "").trim();
      if (!url) return "";
      try {
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
      } catch {
        return "";
      }
    }
    return "";
  }

  return {
    memory,
    /**
     * @param {"bot" | "slack"} kind
     * @param {string} id
     * @param {string} tenantId
     */
    async bind(kind, id, tenantId) {
      const key = bindKey(kind, id);
      const tenant = String(tenantId || "").trim();
      if (!key || !tenant) return false;
      memory.set(key, tenant);
      await writeRemote(key, tenant);
      return true;
    },
    /**
     * @param {"bot" | "slack"} kind
     * @param {string} id
     */
    async resolve(kind, id) {
      const key = bindKey(kind, id);
      if (!key) return "";
      const local = memory.get(key);
      if (local) return local;
      const remote = await readRemote(key);
      if (remote) memory.set(key, remote);
      return remote || "";
    },
  };
}
