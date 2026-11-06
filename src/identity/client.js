import { createFakeIdentity } from "./fake.js";
import { identityConfigured } from "./shared.js";
import { createSupabaseIdentity } from "./supabase.js";

export { IdentityError, displayNameFromUser, identityConfigured } from "./shared.js";

/**
 * One identity interface, two backends. Fake mode never calls fetch.
 * When both are set, fake wins so a test cannot reach the network by accident.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetch?: typeof fetch, cacheMs?: number }} [options]
 */
export function createIdentity(env = {}, options = {}) {
  if (String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1") return createFakeIdentity(env);
  if (!identityConfigured(env)) {
    throw new Error("Identity is not configured.");
  }
  return createSupabaseIdentity(env, options);
}
