import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { codeChallengeFor } from "./pkce.js";
import { IdentityError, displayNameFromUser } from "./shared.js";

const FIXTURES = {
  google: { email: "ada@example.com", full_name: "Ada Lovelace" },
  github: { email: "grace@example.com", full_name: "Grace Hopper" },
};

const ACCESS_MS = 60 * 60 * 1000;
const INVITE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * In-memory GoTrue and the tenancy RPCs. Google signs in as Ada Lovelace.
 * GitHub is off until toggled, so the sign-in page hides that button until it is on.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createFakeIdentity(env = {}) {
  const fixtures = {
    google: {
      email: String(env.SEDERUNT_AUTH_FAKE_EMAIL || "").trim().toLowerCase() || FIXTURES.google.email,
      full_name: String(env.SEDERUNT_AUTH_FAKE_NAME || "").trim() || FIXTURES.google.full_name,
    },
    github: FIXTURES.github,
  };
  const store = {
    providers: {
      google: true,
      github: String(env.SEDERUNT_AUTH_FAKE_GITHUB || "").trim() === "1",
    },
    users: new Map(),
    byProvider: new Map(),
    profiles: new Map(),
    tenants: new Map(),
    memberships: [],
    invites: [],
    joinLinks: new Map(),
    codes: new Map(),
    access: new Map(),
    refresh: new Map(),
  };

  function requireUser(accessToken, now = Date.now()) {
    const row = store.access.get(accessToken);
    if (!row || row.exp <= now) throw new IdentityError("unverified", "Sign in first.");
    const user = store.users.get(row.userId);
    if (!user) throw new IdentityError("unverified", "Sign in first.");
    return user;
  }

  function issueTokens(userId, now = Date.now()) {
    const accessToken = `fa.${randomBytes(16).toString("base64url")}`;
    const refreshToken = `fr.${randomBytes(16).toString("base64url")}`;
    const expiresAt = now + ACCESS_MS;
    store.access.set(accessToken, { userId, exp: expiresAt });
    store.refresh.set(refreshToken, userId);
    return { accessToken, refreshToken, expiresIn: ACCESS_MS / 1000, expiresAt };
  }

  function ensureUser(provider, now = Date.now()) {
    const existing = store.byProvider.get(provider);
    if (existing) return store.users.get(existing);
    const fixture = fixtures[provider];
    if (!fixture) throw new IdentityError("provider_disabled", "That sign-in provider is not available.");
    const id = randomUUID();
    const user = {
      id,
      email: fixture.email,
      email_confirmed_at: new Date(now).toISOString(),
      user_metadata: { full_name: fixture.full_name, name: fixture.full_name, avatar_url: "" },
      app_metadata: { provider },
    };
    const tenantId = randomUUID();
    const createdAt = new Date(now).toISOString();
    store.users.set(id, user);
    store.byProvider.set(provider, id);
    store.tenants.set(tenantId, {
      id: tenantId,
      kind: "personal",
      name: "Personal",
      personal_owner: id,
      created_by: id,
      created_at: createdAt,
    });
    store.memberships.push({ tenant_id: tenantId, user_id: id, role: "owner", created_at: createdAt });
    const named = displayNameFromUser(user);
    store.profiles.set(id, {
      id,
      display_name: named ? named.slice(0, 120) : null,
      avatar_url: null,
      email: user.email.toLowerCase(),
      personal_tenant_id: tenantId,
    });
    return user;
  }

  function roleOn(tenantId, userId) {
    return store.memberships.find((row) => row.tenant_id === tenantId && row.user_id === userId)?.role || "";
  }

  return {
    async providerEnabled(provider) {
      return store.providers[provider] === true;
    },

    setProviderEnabled(provider, enabled) {
      if (provider !== "google" && provider !== "github") return;
      store.providers[provider] = Boolean(enabled);
    },

    authorizeUrl({ provider, scopes, queryParams }) {
      const base = `/console/auth/fake/${provider}`;
      const params = new URLSearchParams();
      if (typeof scopes === "string" && scopes) params.set("scope", scopes);
      if (queryParams && typeof queryParams === "object") {
        for (const [key, value] of Object.entries(queryParams)) {
          if (typeof value === "string" && value) params.set(key, value);
        }
      }
      const query = params.toString();
      return query ? `${base}?${query}` : base;
    },

    issueConsentCode({ provider, codeChallenge, intent, scope }) {
      if (store.providers[provider] !== true) {
        throw new IdentityError("provider_disabled", "That sign-in provider is not turned on.");
      }
      if (typeof codeChallenge !== "string" || codeChallenge.length < 20) {
        throw new IdentityError("invalid_challenge", "Missing code challenge.");
      }
      const code = randomBytes(24).toString("base64url");
      store.codes.set(code, {
        provider,
        challenge: codeChallenge,
        intent: intent === "forms" || intent === "calendar" ? intent : "",
        scope: typeof scope === "string" ? scope : "",
      });
      return code;
    },

    async exchangeCode({ code, codeVerifier }) {
      const pending = store.codes.get(code);
      store.codes.delete(code);
      if (!pending) throw new IdentityError("exchange_failed", "Sign-in code was rejected.");
      const expected = codeChallengeFor(codeVerifier);
      const left = Buffer.from(expected);
      const right = Buffer.from(pending.challenge);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        throw new IdentityError("exchange_failed", "Sign-in code was rejected.");
      }
      const user = ensureUser(pending.provider);
      const tokens = issueTokens(user.id);
      if (pending.intent === "forms" || pending.intent === "calendar") {
        tokens.providerAccessToken = `fa.google.${user.id}`;
        tokens.providerRefreshToken = `fr.google.${user.id}`;
        const override = String(env.SEDERUNT_AUTH_FAKE_SCOPE || "").trim();
        tokens.scope = override || String(pending.scope || "");
      }
      return tokens;
    },

    async getUser(accessToken) {
      return requireUser(accessToken);
    },

    async refresh(refreshToken) {
      const userId = store.refresh.get(refreshToken);
      if (!userId) throw new IdentityError("invalid_grant", "Refresh was rejected.");
      store.refresh.delete(refreshToken);
      return issueTokens(userId);
    },

    async profile(accessToken) {
      const user = requireUser(accessToken);
      const row = store.profiles.get(user.id);
      return row ? { ...row } : null;
    },

    async myTenants(accessToken) {
      const user = requireUser(accessToken);
      return store.memberships
        .filter((row) => row.user_id === user.id)
        .map((row) => {
          const tenant = store.tenants.get(row.tenant_id);
          return {
            id: tenant.id,
            kind: tenant.kind,
            name: tenant.name,
            role: row.role,
            created_at: tenant.created_at,
          };
        });
    },

    async createTenant(accessToken, kind, name) {
      const user = requireUser(accessToken);
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (kind !== "team" && kind !== "company") {
        throw new IdentityError("invalid_tenant", "Tenant kind must be team or company.");
      }
      if (trimmed.length < 1 || trimmed.length > 120) {
        throw new IdentityError("invalid_tenant", "Tenant name must be 1 to 120 characters.");
      }
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      store.tenants.set(id, {
        id,
        kind,
        name: trimmed,
        personal_owner: null,
        created_by: user.id,
        created_at: createdAt,
      });
      store.memberships.push({ tenant_id: id, user_id: user.id, role: "owner", created_at: createdAt });
      return id;
    },

    async createInvite(accessToken, tenantId, email, role = "member") {
      const user = requireUser(accessToken);
      const tenant = store.tenants.get(tenantId);
      const membership = roleOn(tenantId, user.id);
      if (!tenant || (membership !== "owner" && membership !== "admin")) {
        throw new IdentityError("forbidden", "Only an owner or admin can invite.");
      }
      if (tenant.kind === "personal") {
        throw new IdentityError("forbidden", "A personal tenant has no invites.");
      }
      const granted = role || "member";
      if (granted !== "admin" && granted !== "member") {
        throw new IdentityError("invalid_invite", "Invite role must be admin or member.");
      }
      const normalized = String(email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
        throw new IdentityError("invalid_invite", "Invite email is not valid.");
      }
      const open = store.invites.find((row) => row.tenant_id === tenantId && row.email === normalized && !row.accepted_at);
      if (open) throw new IdentityError("conflict", "That email already has an open invite.");
      const token = randomBytes(24).toString("hex");
      store.invites.push({
        id: randomUUID(),
        tenant_id: tenantId,
        email: normalized,
        role: granted,
        token_hash: createHash("sha256").update(token).digest("hex"),
        invited_by: user.id,
        expires_at: new Date(Date.now() + INVITE_MS).toISOString(),
        accepted_at: null,
        accepted_by: null,
      });
      return token;
    },

    async updateUser(accessToken, data) {
      const user = requireUser(accessToken);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new IdentityError("upstream", "Profile could not be saved.");
      }
      const next = { ...(user.user_metadata || {}) };
      if ("sederunt_onboarded" in data) next.sederunt_onboarded = data.sederunt_onboarded === true;
      if ("sederunt_auto_join" in data) next.sederunt_auto_join = data.sederunt_auto_join === true;
      if ("sederunt_fake_tools" in data && data.sederunt_fake_tools && typeof data.sederunt_fake_tools === "object") {
        next.sederunt_fake_tools = { ...data.sederunt_fake_tools };
      }
      if ("sederunt_tool_prefs" in data && data.sederunt_tool_prefs && typeof data.sederunt_tool_prefs === "object") {
        next.sederunt_tool_prefs = { ...data.sederunt_tool_prefs };
      }
      user.user_metadata = next;
      return { ...user, user_metadata: { ...next } };
    },

    async renameTenant(accessToken, tenantId, name) {
      const user = requireUser(accessToken);
      const tenant = store.tenants.get(tenantId);
      const membership = roleOn(tenantId, user.id);
      if (!tenant || (membership !== "owner" && membership !== "admin")) {
        throw new IdentityError("forbidden", "Only an owner or admin can change the space.");
      }
      if (tenant.kind === "personal") {
        throw new IdentityError("invalid_tenant", "A personal tenant has no shared name.");
      }
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (trimmed.length < 1 || trimmed.length > 120) {
        throw new IdentityError("invalid_tenant", "Tenant name must be 1 to 120 characters.");
      }
      tenant.name = trimmed;
    },

    async setAllowedDomain(accessToken, tenantId, domain) {
      const user = requireUser(accessToken);
      const tenant = store.tenants.get(tenantId);
      const membership = roleOn(tenantId, user.id);
      if (!tenant || (membership !== "owner" && membership !== "admin")) {
        throw new IdentityError("forbidden", "Only an owner or admin can change the space.");
      }
      if (tenant.kind === "personal") {
        throw new IdentityError("invalid_tenant", "A personal tenant has no email domain.");
      }
      const normalized = String(domain || "").trim().toLowerCase();
      if (normalized && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
        throw new IdentityError("invalid_tenant", "That email domain is not valid.");
      }
      tenant.allowed_domain = normalized || null;
    },

    async acceptInvite(accessToken, token) {
      const user = requireUser(accessToken);
      if (!user.email_confirmed_at) throw new IdentityError("forbidden", "Confirm the email first.");
      const hash = createHash("sha256").update(String(token || "")).digest("hex");
      const invite = store.invites.find((row) => row.token_hash === hash);
      if (!invite || invite.accepted_at || Date.parse(invite.expires_at) <= Date.now()) {
        throw new IdentityError("invalid_invite", "Invite is invalid or expired.");
      }
      const email = String(user.email || "").toLowerCase();
      if (!email || email !== invite.email) {
        throw new IdentityError("forbidden", "Invite was sent to a different email.");
      }
      const tenant = store.tenants.get(invite.tenant_id);
      if (!tenant || tenant.kind === "personal") {
        throw new IdentityError("forbidden", "That tenant cannot take another member.");
      }
      const already = store.memberships.some((row) => row.tenant_id === invite.tenant_id && row.user_id === user.id);
      if (!already) {
        store.memberships.push({
          tenant_id: invite.tenant_id,
          user_id: user.id,
          role: invite.role,
          created_at: new Date().toISOString(),
        });
      }
      invite.accepted_at = new Date().toISOString();
      invite.accepted_by = user.id;
      return invite.tenant_id;
    },

    async workspaceJoinLink(accessToken, tenantId, reset = false) {
      const user = requireUser(accessToken);
      const tenant = store.tenants.get(tenantId);
      const membership = roleOn(tenantId, user.id);
      if (!tenant || tenant.kind === "personal" || (membership !== "owner" && membership !== "admin")) {
        throw new IdentityError("forbidden", "Only an owner or admin can share the workspace link.");
      }
      if (reset) store.joinLinks.delete(tenantId);
      if (!store.joinLinks.has(tenantId)) store.joinLinks.set(tenantId, randomBytes(24).toString("hex"));
      return store.joinLinks.get(tenantId);
    },

    async acceptJoinLink(accessToken, token) {
      const user = requireUser(accessToken);
      if (!user.email_confirmed_at) throw new IdentityError("forbidden", "Confirm the email first.");
      const entry = [...store.joinLinks.entries()].find(([, value]) => value === String(token || ""));
      if (!entry) throw new IdentityError("invalid_invite", "Invite is invalid or expired.");
      const [tenantId] = entry;
      if (!store.memberships.some((row) => row.tenant_id === tenantId && row.user_id === user.id)) {
        store.memberships.push({ tenant_id: tenantId, user_id: user.id, role: "member", created_at: new Date().toISOString() });
      }
      return tenantId;
    },

    async joinableTenants(accessToken) {
      const user = requireUser(accessToken);
      const domain = String(user.email || "").toLowerCase().split("@")[1] || "";
      if (!domain || !user.email_confirmed_at) return [];
      return [...store.tenants.values()]
        .filter((tenant) => tenant.kind !== "personal" && tenant.allowed_domain === domain)
        .filter((tenant) => !store.memberships.some((row) => row.tenant_id === tenant.id && row.user_id === user.id))
        .map((tenant) => ({ id: tenant.id, name: tenant.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async joinByDomain(accessToken, tenantId) {
      const user = requireUser(accessToken);
      const open = await this.joinableTenants(accessToken);
      if (!open.some((row) => row.id === tenantId)) {
        throw new IdentityError("forbidden", "That workspace is not open to your email domain.");
      }
      store.memberships.push({ tenant_id: tenantId, user_id: user.id, role: "member", created_at: new Date().toISOString() });
      return tenantId;
    },

    async workspaceStats(accessToken, tenantId) {
      const user = requireUser(accessToken);
      const tenant = store.tenants.get(tenantId);
      if (!tenant || !roleOn(tenantId, user.id)) throw new IdentityError("forbidden", "That workspace is not on this account.");
      return {
        members: store.memberships.filter((row) => row.tenant_id === tenantId).length,
        openInvites: store.invites.filter((row) => row.tenant_id === tenantId && !row.accepted_at).length,
        allowedDomain: tenant.allowed_domain || "",
      };
    },
  };
}
