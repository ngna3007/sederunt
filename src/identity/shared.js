/**
 * Shared identity contracts. Kept free of the backends so console auth can
 * ask whether sign-in is configured without loading either implementation.
 */

export class IdentityError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}

/**
 * Supabase or the in-process fake. A publishable key without a URL does not count.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function identityConfigured(env = {}) {
  if (String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1") return true;
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  return Boolean(url && key);
}

/**
 * Same order as the signup trigger: full_name, name, then the mailbox local part.
 *
 * @param {{ email?: string, user_metadata?: Record<string, unknown> } | null | undefined} user
 */
export function displayNameFromUser(user) {
  const meta = user && typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};
  const named = String(meta.full_name || meta.name || "").trim();
  if (named) return named.slice(0, 120);
  const local = String(user?.email || "").split("@")[0] || "";
  return local.slice(0, 120);
}

/** The provider comes from the verified user record, never the email domain. */
export function providerFromUser(user) {
  return user?.app_metadata?.provider === "google" ? "google" : "";
}

/**
 * Google is the only member web provider. Settings failure does not enable it.
 *
 * @param {{ providerEnabled?: (name: string) => Promise<boolean> } | null | undefined} identity
 * @returns {Promise<{ google: boolean, github: boolean }>}
 */
export async function resolveSignInProviders(identity) {
  const providers = { google: false, github: false };
  if (!identity || typeof identity.providerEnabled !== "function") {
    return providers;
  }
  try {
    providers.google = await identity.providerEnabled("google") === true;
  } catch {
    providers.google = false;
  }
  return providers;
}
