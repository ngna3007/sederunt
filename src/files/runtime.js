import { sealPackageId } from "./config.js";
import { createMemoryCleaner, createRelayerMemoryClient, memoryAccountFromEnv } from "./memory.js";
import { seedDemoFiles, demoUserId } from "./demo.js";
import { createLiveSeal } from "./seal.js";
import { createFileService } from "./service.js";
import { createFileStore } from "./store.js";
import { createLiveWalrus, createMemoryWalrus } from "./walrus.js";

/**
 * Wires a store, a Walrus client, and the envelope secret.
 * Tests pass their own store and storage. The demo page uses an in-memory
 * Walrus. A funded service key uses testnet. With neither, uploads pause.
 */
export function createFileRuntime(options = {}) {
  const env = options.env || {};
  const clock = options.clock || (() => new Date());
  const store = options.store || createFileStore({ clock });
  const demo = options.demo === true || env.FILES_DEMO === "1";
  if (demo && options.store == null) seedDemoFiles(store, clock());
  const storage = options.storage !== undefined
    ? options.storage
    : (env.WALRUS_SERVICE_KEY && !demo ? createLiveWalrus(env) : (demo ? createMemoryWalrus() : null));
  const account = options.account || memoryAccountFromEnv(env);
  const memory = options.memory || createMemoryCleaner({
    account,
    client: options.memoryClient || (account.configured ? createRelayerMemoryClient() : null),
  });
  const seal = options.seal !== undefined
    ? options.seal
    : (sealPackageId(env) && env.WALRUS_SERVICE_KEY ? createLiveSeal(env) : null);
  const serverSecret = options.serverSecret || env.FILES_WRAP_KEY || env.WALRUS_SERVICE_KEY || (demo ? "demo-wrap" : "");
  const service = options.service || createFileService({
    store,
    storage,
    seal,
    memory,
    env,
    serverSecret,
  });
  return {
    env,
    store,
    storage,
    memory,
    service,
    demo,
    clock,
    viewer(req, url) {
      if (options.trustUserHeader) {
        const id = headerValue(req.headers["x-file-user"]);
        if (id) return { userId: id, name: store.viewerName(id) };
      }
      if (typeof options.viewer === "function") return options.viewer(req, url);
      if (demo) {
        const as = url.searchParams.get("as") || "owner";
        const userId = demoUserId(as);
        if (userId) return { userId, name: store.viewerName(userId) };
      }
      return null;
    },
  };
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}
