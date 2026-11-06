/** Stable connector URL for the in-process Google Forms preset. It is never fetched. */
export const BUILTIN_GOOGLE_FORMS_URL = "builtin:google-forms";

export const GOOGLE_FORMS_PRESET = "google-forms";

/**
 * The built-in Forms server. A preset row is in-process even when an older
 * install still stores this server's `/mcp/forms` URL.
 *
 * @param {string | { url?: string, preset?: string | null } | null | undefined} input
 */
export function isBuiltinGoogleForms(input) {
  if (typeof input === "string") return input === BUILTIN_GOOGLE_FORMS_URL;
  if (!input || typeof input !== "object") return false;
  if (input.preset === GOOGLE_FORMS_PRESET) return true;
  return String(input.url || "") === BUILTIN_GOOGLE_FORMS_URL;
}
