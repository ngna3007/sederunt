import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Bearer token for https://mcp.linear.app/mcp. Never print the return value. */
export function loadLinearToken() {
  if (process.env.LINEAR_MCP_TOKEN) return process.env.LINEAR_MCP_TOKEN;
  const path =
    process.env.LINEAR_MCP_CREDENTIALS ||
    join(homedir(), ".grok", "mcp_credentials.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const entry = data["linear-rowan:https://mcp.linear.app/mcp"];
  const token = entry?.token_response?.access_token;
  if (!token) throw new Error("Linear token for team ROW is missing");
  return token;
}
