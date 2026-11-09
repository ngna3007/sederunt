import { createHash } from "node:crypto";
import { IdentityError } from "./shared.js";

const SETTINGS_TTL_MS = 60 * 1000;
// One navigation fires the same membership read from several handlers.
// Keep the answer for a few seconds so the page and the board share it.
const READ_TTL_MS = 5000;

/**
 * GoTrue and PostgREST over REST. The token response is not trusted until
 * GET /auth/v1/user succeeds with the access token.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, cacheMs?: number }} [options]
 */
export function createSupabaseIdentity(env, options = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const fetchImpl = options.fetch || globalThis.fetch;
  const cacheMs = Number.isFinite(options.cacheMs) ? options.cacheMs : SETTINGS_TTL_MS;
  let external = null;
  let externalAt = 0;
  const userReads = new Map();
  const tenantReads = new Map();
  const statReads = new Map();

  function tokenKey(accessToken) {
    return createHash("sha256").update(String(accessToken || "")).digest("base64url");
  }

  function cached(map, key, load) {
    const now = Date.now();
    const hit = map.get(key);
    if (hit && hit.value !== undefined && now - hit.at < READ_TTL_MS) return Promise.resolve(hit.value);
    if (hit?.pending) return hit.pending;
    const pending = Promise.resolve().then(load).then((value) => {
      map.set(key, { at: Date.now(), value });
      if (map.size > 200) map.delete(map.keys().next().value);
      return value;
    }, (error) => {
      if (map.get(key)?.pending === pending) map.delete(key);
      throw error;
    });
    map.set(key, { at: 0, pending });
    return pending;
  }

  function forgetPrefix(map, prefix) {
    for (const key of map.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) map.delete(key);
    }
  }

  if (!base || !apiKey) {
    throw new IdentityError("not_configured", "Supabase URL and publishable key are required.");
  }

  function endpoint(path, query) {
    const url = new URL(`${base}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== "") url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async function call(path, { method = "GET", token = "", body = undefined, query = undefined, profile = false } = {}) {
    const headers = {
      apikey: apiKey,
      authorization: `Bearer ${token || apiKey}`,
      accept: "application/json",
    };
    if (profile) {
      headers["accept-profile"] = "public";
      headers["content-profile"] = "public";
    }
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      if (profile) headers.prefer = "return=representation";
      payload = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(endpoint(path, query), { method, headers, body: payload, redirect: "manual", signal: AbortSignal.timeout(15000) });
    } catch {
      throw new IdentityError("upstream", "Sign-in could not be reached.");
    }
    if (response.status >= 300 && response.status < 400) {
      throw new IdentityError("upstream", "Sign-in could not be reached.");
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 180) };
      }
    }
    if (!response.ok) {
      const message = data?.msg || data?.error_description || data?.message || data?.error_code || "Sign-in was rejected.";
      throw new IdentityError(response.status === 401 ? "unauthorized" : "upstream", String(message).slice(0, 180));
    }
    return data;
  }

  function tokensFrom(data, now = Date.now()) {
    const accessToken = typeof data?.access_token === "string" ? data.access_token : "";
    if (!accessToken) throw new IdentityError("exchange_failed", "Sign-in didn't return an access token.");
    const expiresIn = Number(data?.expires_in);
    const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    return {
      accessToken,
      refreshToken: typeof data?.refresh_token === "string" ? data.refresh_token : "",
      expiresIn: seconds,
      expiresAt: now + seconds * 1000,
      providerAccessToken: typeof data?.provider_token === "string" ? data.provider_token : "",
      providerRefreshToken: typeof data?.provider_refresh_token === "string" ? data.provider_refresh_token : "",
      scope: typeof data?.scope === "string" ? data.scope : "",
    };
  }

  return {
    async providerEnabled(provider) {
      const now = Date.now();
      if (!external || now - externalAt >= cacheMs) {
        const settings = await call("/auth/v1/settings");
        external = settings && typeof settings.external === "object" && settings.external ? settings.external : {};
        externalAt = now;
      }
      return external[provider] === true;
    },

    authorizeUrl({ provider, redirectTo, codeChallenge, scopes, queryParams }) {
      const query = {
        provider,
        redirect_to: redirectTo,
        code_challenge: codeChallenge,
        code_challenge_method: "s256",
        apikey: apiKey,
      };
      if (typeof scopes === "string" && scopes) query.scopes = scopes;
      if (queryParams && typeof queryParams === "object") {
        for (const [key, value] of Object.entries(queryParams)) {
          if (typeof value === "string" && value) query[key] = value;
        }
      }
      const url = endpoint("/auth/v1/authorize", query);
      return url.toString();
    },

    async exchangeCode({ code, codeVerifier }) {
      const data = await call("/auth/v1/token", {
        method: "POST",
        query: { grant_type: "pkce" },
        body: { auth_code: code, code_verifier: codeVerifier },
      });
      return tokensFrom(data);
    },

    async getUser(accessToken) {
      return cached(userReads, tokenKey(accessToken), async () => {
        const user = await call("/auth/v1/user", { token: accessToken });
        if (!user || typeof user.id !== "string" || !user.id) {
          throw new IdentityError("unverified", "Sign-in could not be verified.");
        }
        return user;
      });
    },

    async refresh(refreshToken) {
      const data = await call("/auth/v1/token", {
        method: "POST",
        query: { grant_type: "refresh_token" },
        body: { refresh_token: refreshToken },
      });
      return tokensFrom(data);
    },

    async profile(accessToken) {
      const user = await this.getUser(accessToken);
      const rows = await call(`/rest/v1/profiles?select=id,display_name,avatar_url,email,personal_tenant_id&id=eq.${encodeURIComponent(user.id)}`, {
        token: accessToken,
        profile: true,
      });
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },

    async myTenants(accessToken) {
      return cached(tenantReads, tokenKey(accessToken), async () => {
        const rows = await call("/rest/v1/my_tenants?select=id,kind,name,role,created_at", {
          token: accessToken,
          profile: true,
        });
        return Array.isArray(rows) ? rows : [];
      });
    },

    async createTenant(accessToken, kind, name) {
      const id = await call("/rest/v1/rpc/create_tenant", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_kind: kind, p_name: name },
      });
      if (typeof id !== "string" || !id) throw new IdentityError("invalid_tenant", "Tenant was not created.");
      tenantReads.delete(tokenKey(accessToken));
      return id;
    },

    async createInvite(accessToken, tenantId, email, role = "member") {
      const token = await call("/rest/v1/rpc/create_invite", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_tenant_id: tenantId, p_email: email, p_role: role },
      });
      if (typeof token !== "string" || !token) throw new IdentityError("invalid_invite", "Invite was not created.");
      statReads.delete(`${tokenKey(accessToken)}:${tenantId}`);
      return token;
    },

    async updateUser(accessToken, data) {
      const user = await call("/auth/v1/user", {
        method: "PUT",
        token: accessToken,
        body: { data },
      });
      if (!user || typeof user.id !== "string") throw new IdentityError("upstream", "Profile could not be saved.");
      userReads.set(tokenKey(accessToken), { at: Date.now(), value: user });
      return user;
    },

    async renameTenant(accessToken, tenantId, name) {
      await call(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        token: accessToken,
        profile: true,
        body: { name },
      });
      tenantReads.delete(tokenKey(accessToken));
    },

    async setAllowedDomain(accessToken, tenantId, domain) {
      await call(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        token: accessToken,
        profile: true,
        body: { allowed_domain: domain },
      });
      statReads.delete(`${tokenKey(accessToken)}:${tenantId}`);
    },

    async acceptInvite(accessToken, token) {
      const id = await call("/rest/v1/rpc/accept_invite", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_token: token },
      });
      if (typeof id !== "string" || !id) throw new IdentityError("invalid_invite", "Invite was not accepted.");
      tenantReads.delete(tokenKey(accessToken));
      forgetPrefix(statReads, tokenKey(accessToken));
      return id;
    },

    async workspaceJoinLink(accessToken, tenantId, reset = false) {
      const token = await call("/rest/v1/rpc/workspace_join_link", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_tenant_id: tenantId, p_reset: reset === true },
      });
      if (typeof token !== "string" || !token) throw new IdentityError("invalid_invite", "Invite link was not created.");
      if (reset === true) statReads.delete(`${tokenKey(accessToken)}:${tenantId}`);
      return token;
    },

    async acceptJoinLink(accessToken, token) {
      const id = await call("/rest/v1/rpc/accept_join_link", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_token: token },
      });
      if (typeof id !== "string" || !id) throw new IdentityError("invalid_invite", "Invite was not accepted.");
      tenantReads.delete(tokenKey(accessToken));
      forgetPrefix(statReads, tokenKey(accessToken));
      return id;
    },

    async joinableTenants(accessToken) {
      const rows = await call("/rest/v1/rpc/joinable_tenants", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: {},
      });
      return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === "string").map((row) => ({ id: row.id, name: String(row.name || "") })) : [];
    },

    async joinByDomain(accessToken, tenantId) {
      const id = await call("/rest/v1/rpc/join_by_domain", {
        method: "POST",
        token: accessToken,
        profile: true,
        body: { p_tenant_id: tenantId },
      });
      if (typeof id !== "string" || !id) throw new IdentityError("forbidden", "That workspace could not be joined.");
      tenantReads.delete(tokenKey(accessToken));
      return id;
    },

    async workspaceStats(accessToken, tenantId) {
      return cached(statReads, `${tokenKey(accessToken)}:${tenantId}`, async () => {
        const id = encodeURIComponent(tenantId);
        const [members, invites, tenant] = await Promise.all([
          call(`/rest/v1/memberships?select=user_id&tenant_id=eq.${id}`, { token: accessToken, profile: true }),
          call(`/rest/v1/invites?select=id&tenant_id=eq.${id}&accepted_at=is.null`, { token: accessToken, profile: true }),
          call(`/rest/v1/tenants?select=allowed_domain&id=eq.${id}`, { token: accessToken, profile: true }),
        ]);
        return {
          members: Array.isArray(members) ? members.length : 0,
          openInvites: Array.isArray(invites) ? invites.length : 0,
          allowedDomain: Array.isArray(tenant) && tenant[0]?.allowed_domain ? String(tenant[0].allowed_domain) : "",
        };
      });
    },
  };
}
