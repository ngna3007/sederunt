const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value || "").trim());
function secretsKeyBytes(value) {
  const raw = String(value || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}
const text = (env, name) => String(env[name] || "").trim();
const forbiddenModes = [
  "SEDERUNT_AUTH_FAKE", "SEDERUNT_AUTH_OPEN", "SEDERUNT_ALLOW_OPEN_AUTH", "SEDERUNT_TOOLS_FAKE",
  "SEDERUNT_MCP_FAKE", "SEDERUNT_FORMS_FAKE", "SEDERUNT_CALENDAR_FAKE", "FILES_DEMO",
];

export function isProduction(env = {}) {
  return text(env, "NODE_ENV") === "production" || text(env, "VERCEL_ENV") === "production";
}

/** Returns configuration names and reasons only; values never enter diagnostics. */
export function productionConfigIssues(env = {}, { force = false } = {}) {
  if (!force && !isProduction(env)) return [];
  const issues = [];
  const requireValue = (name) => { if (!text(env, name)) issues.push(`${name}: required`); };
  const requireSecret = (name) => {
    const value = text(env, name);
    if (value.length < 32 || new Set(value).size < 12 || /change.?me|placeholder|example|your.?secret/i.test(value)) issues.push(`${name}: supply a stable, randomly generated secret of at least 32 characters`);
  };
  const httpsOrigin = (name) => {
    try {
      const url = new URL(text(env, name));
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error();
    } catch { issues.push(`${name}: use a public HTTPS origin`); }
  };
  for (const name of forbiddenModes) if (truthy(env[name])) issues.push(`${name}: disabled in production`);
  if (text(env, "SEDERUNT_CONSOLE_SECRET")) issues.push("SEDERUNT_CONSOLE_SECRET: member passphrase sign-in is disabled in production");
  httpsOrigin("SUPABASE_URL");
  httpsOrigin("SEDERUNT_PUBLIC_ORIGIN");
  requireValue("SUPABASE_PUBLISHABLE_KEY");
  const key = text(env, "SUPABASE_SERVICE_ROLE_KEY") || text(env, "SUPABASE_SECRET_KEY");
  if (!key || key.startsWith("sb_publishable_")) issues.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY: server-only durable store key required");
  requireSecret("SEDERUNT_SESSION_SECRET");
  requireSecret("SEDERUNT_RECOVERY_SECRET");
  if (text(env, "VERCEL")) requireSecret("CRON_SECRET");
  if (text(env, "SEDERUNT_SESSION_SECRET") && text(env, "SEDERUNT_SESSION_SECRET") === text(env, "SEDERUNT_RECOVERY_SECRET")) issues.push("SEDERUNT_RECOVERY_SECRET: use a different secret from the session signing key");
  const redis = text(env, "REDIS_URL") || text(env, "KV_URL");
  const rest = text(env, "UPSTASH_REDIS_REST_URL") || text(env, "KV_REST_API_URL");
  const restToken = text(env, "UPSTASH_REDIS_REST_TOKEN") || text(env, "KV_REST_API_TOKEN");
  if (!redis && !(rest && restToken)) issues.push("REDIS_URL or complete Redis REST credentials: durable Ask quota/history and identity bindings required");
  if (redis) {
    try { if (!["redis:", "rediss:"].includes(new URL(redis).protocol)) throw new Error(); }
    catch { issues.push("REDIS_URL or KV_URL: invalid Redis URL"); }
  }
  if (rest || restToken) {
    if (!rest || !restToken) issues.push("Redis REST URL and token: configure both values");
    else {
      try { if (new URL(rest).protocol !== "https:") throw new Error(); }
      catch { issues.push("Redis REST URL: HTTPS required"); }
    }
  }
  const sealed = secretsKeyBytes(text(env, "MCP_SECRETS_KEY_V1"));
  if (sealed.length !== 32) issues.push("MCP_SECRETS_KEY_V1: a 32-byte key is required, as 64 hex characters or base64");
  return issues;
}

export function assertProductionConfig(env = {}, options = {}) {
  const issues = productionConfigIssues(env, options);
  if (issues.length) throw new Error(`Production configuration is incomplete:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
}

/** Read-only operator check; no OAuth consent, schema change or provider toggle. */
export async function verifyGoogleSignIn(env, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const url = `${text(env, "SUPABASE_URL").replace(/\/$/, "")}/auth/v1/settings`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { apikey: text(env, "SUPABASE_PUBLISHABLE_KEY") }, signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error();
    const settings = await response.json();
    if (settings?.external?.google !== true) throw new Error();
  } catch { throw new Error("Supabase Google sign-in could not be verified. Check provider settings and connectivity."); }
}
