import { consoleReady } from "./config.js";
import { createConsoleFiles } from "./console-files.js";
import { seedDemoFiles, demoUserId } from "./demo.js";
import { createMemoryConsole } from "./memory-console.js";
import { createMemoryCleaner, createRelayerMemoryClient, memoryAccountFromEnv } from "./memory.js";
import { createFileService } from "./service.js";
import { createFileStore } from "./store.js";
import { createFileLinks } from "./links.js";
import { runFileWorker } from "./worker.js";

/**
 * Wires a store and a Console client.
 * Tests pass their own store and storage. The demo page uses an in-memory
 * Console. A configured API key uses Walrus Console. With neither, uploads pause.
 */
export function createFileRuntime(options = {}) {
  const env = options.env || {};
  const clock = options.clock || (() => new Date());
  const store = options.store || createFileStore({ clock });
  const demo = options.demo === true || env.FILES_DEMO === "1";
  if (demo && options.store == null) seedDemoFiles(store, clock());
  const storage = options.storage !== undefined
    ? options.storage
    : (demo
      ? createMemoryConsole()
      : (consoleReady(env) ? createConsoleFiles({
        env,
        store,
        fetch: options.fetch,
        wait: options.wait,
        encrypt: options.encrypt,
        decrypt: options.decrypt,
        sign: options.sign,
        resolveFolder: options.resolveFolder,
      }) : null));
  const account = options.account || memoryAccountFromEnv(env);
  const memory = options.memory || createMemoryCleaner({
    account,
    client: options.memoryClient || (account.configured ? createRelayerMemoryClient() : null),
  });
  const service = options.service || createFileService({ store, storage, memory });
  const links = options.links || createFileLinks({ secret: options.linkSecret || options.serverSecret, clock });
  let running = null;
  let again = false;
  let timer = null;
  const runtime = {
    env,
    store,
    storage,
    memory,
    service,
    demo,
    clock,
    links,
    /** Uploads return at once and the worker stores the bytes. */
    background: options.background === true,
    /** Run due jobs now. One pass at a time; a kick during a pass runs one more. */
    kick() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            again = false;
            await runFileWorker(runtime);
          } while (again);
        } catch {
          // A failed pass leaves its jobs queued with backoff.
        } finally {
          running = null;
        }
      })();
      return running;
    },
    /** Retry queued jobs every `ms` until `stop()`. The timer does not hold the process open. */
    startWorker(ms = 30_000) {
      if (timer) return;
      timer = setInterval(() => { runtime.kick(); }, ms);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
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
  return runtime;
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}
