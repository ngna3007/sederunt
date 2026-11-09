import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { assertProductionConfig, isProduction, productionConfigIssues, verifyGoogleSignIn } from "../src/production-config.js";

function configured() {
  return { NODE_ENV: "production", SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", SUPABASE_SECRET_KEY: "sb_secret_fixture", SEDERUNT_PUBLIC_ORIGIN: "https://app.example.test",
    SEDERUNT_SESSION_SECRET: randomBytes(32).toString("base64url"), SEDERUNT_RECOVERY_SECRET: randomBytes(32).toString("base64url"), REDIS_URL: "rediss://cache.example.test:6379", MCP_SECRETS_KEY_V1: randomBytes(32).toString("base64") };
}

test("production requires stable auth, durable stores and recovery without requiring disabled integrations", () => {
  assert.equal(isProduction({ VERCEL_ENV: "production" }), true);
  assert.equal(isProduction({ NODE_ENV: "development" }), false);
  assert.deepEqual(productionConfigIssues({}), []);
  assert.ok(productionConfigIssues({}, { force: true }).length >= 7);
  assert.doesNotThrow(() => assertProductionConfig(configured()));
  for (const field of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEDERUNT_SESSION_SECRET", "SEDERUNT_RECOVERY_SECRET", "SEDERUNT_PUBLIC_ORIGIN", "REDIS_URL", "MCP_SECRETS_KEY_V1"]) {
    const env = configured(); delete env[field];
    assert.ok(productionConfigIssues(env).some((issue) => issue.includes(field === "SUPABASE_SECRET_KEY" ? "SUPABASE_SECRET_KEY" : field)));
  }
  const alias = configured(); delete alias.SUPABASE_SECRET_KEY; alias.SUPABASE_SERVICE_ROLE_KEY = "service-role-fixture";
  assert.deepEqual(productionConfigIssues(alias), []);
});

test("production rejects fake/open modes, passphrases, weak secrets and unsafe origins without revealing values", () => {
  for (const mode of ["SEDERUNT_AUTH_FAKE", "SEDERUNT_AUTH_OPEN", "SEDERUNT_ALLOW_OPEN_AUTH", "SEDERUNT_TOOLS_FAKE", "SEDERUNT_MCP_FAKE", "SEDERUNT_FORMS_FAKE", "SEDERUNT_CALENDAR_FAKE", "FILES_DEMO"]) {
    assert.throws(() => assertProductionConfig({ ...configured(), [mode]: "true" }), new RegExp(mode));
    assert.doesNotThrow(() => assertProductionConfig({ ...configured(), [mode]: "false" }));
  }
  assert.throws(() => assertProductionConfig({ ...configured(), SEDERUNT_CONSOLE_SECRET: "sensitive-value" }), (e) => !e.message.includes("sensitive-value"));
  for (const value of ["", "short", "a".repeat(64), "change-me-please-this-is-a-placeholder-secret"]) {
    assert.throws(() => assertProductionConfig({ ...configured(), SEDERUNT_SESSION_SECRET: value }), /SESSION_SECRET/);
  }
  for (const value of ["http://app.example.test", "https://u:p@app.example.test", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://app.example.test/path", "https://app.example.test/?secret=foo", "https://app.example.test/#fragment", "invalid"]) {
    assert.throws(() => assertProductionConfig({ ...configured(), SEDERUNT_PUBLIC_ORIGIN: value }), /PUBLIC_ORIGIN/);
  }
  const env = configured(); env.SEDERUNT_RECOVERY_SECRET = env.SEDERUNT_SESSION_SECRET;
  assert.throws(() => assertProductionConfig(env), /different secret/);
  assert.throws(() => assertProductionConfig({ ...configured(), SUPABASE_SECRET_KEY: "sb_publishable_wrong" }), /server-only/);
});

test("durable Redis configuration checks the chosen transport and paired REST credentials", () => {
  const env = configured(); delete env.REDIS_URL;
  env.UPSTASH_REDIS_REST_URL = "https://cache.example.test"; env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  assert.doesNotThrow(() => assertProductionConfig(env));
  const alias = { ...env, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: env.UPSTASH_REDIS_REST_URL, KV_REST_API_TOKEN: env.UPSTASH_REDIS_REST_TOKEN };
  assert.doesNotThrow(() => assertProductionConfig(alias));
  for (const changes of [ { REDIS_URL: "invalid" }, { REDIS_URL: "https://cache.example.test" }, { UPSTASH_REDIS_REST_URL: "http://cache.example.test" }, { UPSTASH_REDIS_REST_TOKEN: "" }, { UPSTASH_REDIS_REST_URL: "" }, { MCP_SECRETS_KEY_V1: "invalid" } ]) {
    assert.throws(() => assertProductionConfig({ ...env, ...changes }));
  }
});

test("Google readiness requires an enabled provider and never exposes remote response bodies", async () => {
  const env = configured();
  await verifyGoogleSignIn(env, { fetch: async (url, options) => {
    assert.equal(url, "https://fixture.supabase.co/auth/v1/settings");
    assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.redirect, "error");
    return new Response('{"external":{"google":true}}');
  } });
  for (const fetch of [ async () => new Response('{"external":{"google":false}}'), async () => new Response("sensitive-response", { status: 401 }), async () => new Response("bad-json"), async () => { throw new Error("sensitive-value"); } ]) {
    await assert.rejects(() => verifyGoogleSignIn(env, { fetch }), (e) => /could not be verified/.test(e.message) && !e.message.includes("sensitive"));
  }
});
