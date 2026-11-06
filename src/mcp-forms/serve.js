import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createFormsApp, handleNodeForms } from "./http.js";

/**
 * Standalone Forms MCP. `node src/mcp-forms/serve.js` listens on PORT (default 8787).
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   port?: number,
 *   host?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export function startFormsServer(options = {}) {
  const env = options.env || process.env;
  const forms = createFormsApp({ env, fetchImpl: options.fetchImpl });
  const host = options.host || "127.0.0.1";
  const port = options.port ?? Number(env.PORT || 8787);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      const handled = await handleNodeForms(req, res, { forms, env, url });
      if (!handled) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("Request failed");
      } else {
        res.end();
      }
    }
  });
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen(server);
    });
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  startFormsServer().then((server) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : "";
    process.stdout.write(`Google Forms MCP http://127.0.0.1:${port}/mcp/forms\n`);
  }).catch(() => {
    process.stderr.write("Forms MCP failed to start.\n");
    process.exitCode = 1;
  });
}
