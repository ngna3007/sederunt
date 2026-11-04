import { openSecret, sealSecret } from "./secrets.js";

/** Forms scopes requested with incremental Google consent. */
export const FORMS_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
]);

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Per-person Google refresh tokens, sealed with the connector secrets key.
 * The plaintext token is not returned to the browser.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export function createPersonGoogleStore(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const grants = new Map();

  function clientId() {
    return String(env.GOOGLE_OAUTH_CLIENT_ID || env.CALENDAR_OAUTH_CLIENT_ID || "").trim();
  }

  function clientSecret() {
    return String(env.GOOGLE_OAUTH_CLIENT_SECRET || env.CALENDAR_OAUTH_CLIENT_SECRET || "").trim();
  }

  function read(personId) {
    const sealed = grants.get(personId);
    if (!sealed) return null;
    const parsed = JSON.parse(openSecret(sealed, env));
    return parsed && typeof parsed === "object" ? parsed : null;
  }

  function write(personId, record) {
    const scopes = FORMS_SCOPES.filter((scope) => (record.scopes || FORMS_SCOPES).includes(scope));
    grants.set(personId, sealSecret(JSON.stringify({
      refreshToken: String(record.refreshToken || ""),
      accessToken: String(record.accessToken || ""),
      expiresAt: Number(record.expiresAt) || 0,
      scopes,
    }), env));
  }

  async function refresh(refreshToken) {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret || !refreshToken) return null;
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: id,
          client_secret: secret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: FORMS_SCOPES.join(" "),
        }),
      });
    } catch {
      return null;
    }
    const payload = await response.json().catch(() => ({}));
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    if (!response.ok || !accessToken) return null;
    const expiresIn = Number(payload.expires_in);
    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : refreshToken,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
      scopes: FORMS_SCOPES,
    };
  }

  return {
    scopes: FORMS_SCOPES,
    /**
     * @param {string} personId
     * @param {{ refreshToken?: string, accessToken?: string, expiresAt?: number, scopes?: string[] }} record
     */
    async save(personId, record) {
      const id = String(personId || "").trim();
      if (!id || !record?.refreshToken) return false;
      write(id, record);
      return true;
    },
    async granted(personId) {
      const id = String(personId || "").trim();
      if (!id) return false;
      const row = read(id);
      if (!row?.refreshToken) return false;
      const scopes = Array.isArray(row.scopes) ? row.scopes : [];
      return FORMS_SCOPES.every((scope) => scopes.includes(scope));
    },
    /**
     * @param {string} personId
     * @param {{ force?: boolean }} [options]
     */
    async accessToken(personId, tokenOptions = {}) {
      const id = String(personId || "").trim();
      const row = id ? read(id) : null;
      if (!row?.refreshToken) return "";
      const fresh = tokenOptions.force !== true && row.accessToken && Number(row.expiresAt) > Date.now() + 60_000;
      if (fresh) return String(row.accessToken);
      const next = await refresh(row.refreshToken);
      if (!next) return "";
      write(id, next);
      return next.accessToken;
    },
  };
}
