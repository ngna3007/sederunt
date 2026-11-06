import { openSecret, sealSecret } from "../connectors/secrets.js";

/**
 * Child Console keys for one isolated workspace.
 * Ciphertext uses the same AES-256-GCM helper and `MCP_SECRETS_KEY_V1` as
 * `mcp_connector_secrets`. The plaintext is `{ apiKey, serviceKey }`.
 *
 * @param {{ apiKey?: string, serviceKey?: string }} secret
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function sealConsoleCredential(secret, env) {
  return sealSecret(JSON.stringify({
    apiKey: String(secret?.apiKey || ""),
    serviceKey: String(secret?.serviceKey || ""),
  }), env);
}

/**
 * @param {{ ciphertext: Buffer, nonce: Buffer, keyVersion?: number }} record
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {{ apiKey: string, serviceKey: string }}
 */
export function openConsoleCredential(record, env) {
  let parsed;
  try {
    parsed = JSON.parse(openSecret(record, env));
  } catch {
    throw credentialUnreadable();
  }
  if (!parsed || typeof parsed !== "object" || !parsed.apiKey || !parsed.serviceKey) {
    throw credentialUnreadable();
  }
  return { apiKey: String(parsed.apiKey), serviceKey: String(parsed.serviceKey) };
}

export function credentialUnreadable() {
  const error = new Error("Console credential is unreadable");
  error.code = "credential_unreadable";
  return error;
}
