import { startFakeMcpServer } from "./fake-server.js";
import { loopbackFakeAllowed } from "./url-guard.js";

/**
 * One loopback fake MCP server for the add-connector hint. Started on first use.
 *
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, demo?: { url: string, close: Function } | null }} workspace
 */
export async function ensureDemoServer(workspace) {
  const env = workspace?.env || process.env;
  if (!loopbackFakeAllowed(env)) return null;
  if (workspace?.demo) return workspace.demo;
  const requested = Number(env.SEDERUNT_MCP_FAKE_PORT);
  const port = Number.isInteger(requested) && requested > 0 ? requested : 0;
  try {
    const demo = await startFakeMcpServer({ port });
    if (workspace) workspace.demo = demo;
    return demo;
  } catch {
    return null;
  }
}

/**
 * @param {{ demo?: { close: Function } | null }} workspace
 */
export async function stopDemoServer(workspace) {
  const demo = workspace?.demo;
  if (workspace) workspace.demo = null;
  if (!demo) return;
  await demo.close();
}
