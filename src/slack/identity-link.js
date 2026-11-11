import { normalizeEmail } from "./match.js";

/**
 * Slack user -> Sederunt member of the tenant that owns the Slack team.
 *
 * A DM or @mention arrives with a Slack user id. Meet-room memory lists
 * Sederunt user ids, so an unlinked Slack asker reads nothing from a meeting
 * they ran. The link is made only from facts Slack and the database both
 * verify: users.info returns the profile email (users:read.email), Slack does
 * not report it unconfirmed, the user is a full member (not a bot, not a guest),
 * and that email belongs to exactly one confirmed account with a membership in
 * the SAME tenant. The database function re-checks every one of those and that
 * the team belongs to the tenant, then upserts identities (provider slack).
 */

const USERS_INFO_URL = "https://slack.com/api/users.info";
const SLACK_USER_ID = /^[UW][A-Z0-9]{2,}$/;
const POSITIVE_MS = 5 * 60 * 1000;
const NEGATIVE_MS = 60 * 1000;

/**
 * The verified profile email Slack reports for a person, or why there is none.
 *
 * @param {{ token: string, slackUserId: string, teamId?: string, fetchImpl?: typeof fetch }} input
 * @returns {Promise<{ email: string, displayName: string, reason: string }>}
 */
export async function slackUserEmail({ token, slackUserId, teamId = "", fetchImpl = globalThis.fetch }) {
  const none = (reason) => ({ email: "", displayName: "", reason });
  if (!token || !SLACK_USER_ID.test(String(slackUserId || ""))) return none("no-user");
  const url = new URL(USERS_INFO_URL);
  url.searchParams.set("user", slackUserId);
  const response = await fetchImpl(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  const user = body?.ok === true && body.user && typeof body.user === "object" ? body.user : null;
  if (!user || user.id !== slackUserId) return none("lookup-failed");
  if (user.deleted === true) return none("deleted");
  if (user.is_bot === true || user.is_app_user === true || user.id === "USLACKBOT") return none("bot");
  if (user.is_restricted === true || user.is_ultra_restricted === true) return none("guest");
  // A Slack Connect person from another organization: their org, not this
  // tenant's, controls that email, so it proves nothing here.
  if (user.is_stranger === true || (teamId && user.team_id !== teamId)) return none("external");
  // Only an email Slack reports; a field Slack marks unconfirmed is not proof.
  if (user.is_email_confirmed === false) return none("unconfirmed");
  const email = normalizeEmail(user.profile?.email);
  if (!email.includes("@")) return none("no-email");
  const displayName = String(user.profile?.display_name || user.profile?.real_name || user.real_name || "").slice(0, 120);
  return { email, displayName, reason: "" };
}

/**
 * Database boundary. `link` returns the Sederunt user id it linked, or "".
 * The service role calls one SECURITY DEFINER function that re-verifies the
 * tenant/team, the confirmed email and the membership.
 *
 * @returns {{ link: (input: { tenantId: string, teamId: string, slackUserId: string, email: string, displayName?: string }) => Promise<string> } | null}
 */
export function createSlackIdentityStore(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key || env.SEDERUNT_AUTH_FAKE === "1") return null;
  return {
    async link({ tenantId, teamId, slackUserId, email, displayName = "" }) {
      const response = await fetchImpl(`${base}/rest/v1/rpc/slack_identity_link`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ p_tenant: tenantId, p_team: teamId, p_slack_user: slackUserId, p_email: email || "", p_display: displayName || null }),
      });
      if (!response.ok) throw new Error("Slack identity could not be linked.");
      const value = await response.json();
      return typeof value === "string" ? value : "";
    },
  };
}

/**
 * In-memory stand-in with the same rules as the database function. Used by
 * local runs and tests; `members` is the verified account list per tenant.
 *
 * @param {{ members?: Array<{ tenantId: string, userId: string, email: string, confirmed?: boolean }>, teams?: Record<string, string> }} [options]
 */
export function createMemorySlackIdentityStore({ members = [], teams = {} } = {}) {
  const identities = new Map();
  return {
    identities,
    members,
    teams,
    async link({ tenantId, teamId, slackUserId, email }) {
      const key = `slack|${teamId}|${slackUserId}`;
      if (!tenantId || !teamId || teams[teamId] !== tenantId || !SLACK_USER_ID.test(slackUserId)) return "";
      const wanted = normalizeEmail(email);
      const hits = wanted.includes("@")
        ? [...new Set(members.filter((row) => row.tenantId === tenantId && row.confirmed !== false && normalizeEmail(row.email) === wanted).map((row) => row.userId))]
        : [];
      if (hits.length !== 1) {
        identities.delete(key);
        return "";
      }
      const existing = identities.get(key);
      const linkedAt = existing?.userId === hits[0] ? existing.linkedAt : new Date().toISOString();
      identities.set(key, { provider: "slack", teamId, slackUserId, userId: hits[0], email: wanted, linkedAt });
      return hits[0];
    },
  };
}

/**
 * Cached resolver. A hit is kept five minutes, a miss one minute, so a busy
 * channel does not call users.info on every line and a fix to someone's
 * account is picked up quickly. Keys carry tenant and team: nothing crosses.
 *
 * @param {{ store: { link: Function } | null, now?: () => number, positiveMs?: number, negativeMs?: number }} options
 */
export function createSlackMemberResolver({ store, now = Date.now, positiveMs = POSITIVE_MS, negativeMs = NEGATIVE_MS } = {}) {
  const cache = new Map();
  const pending = new Map();
  return {
    cache,
    /**
     * @param {{ tenantId: string, teamId: string, slackUserId: string, token: string, fetchImpl?: typeof fetch }} input
     * @returns {Promise<{ memberId: string, slackUserId: string, teamId: string, tenantId: string } | null>}
     */
    async resolve({ tenantId, teamId, slackUserId, token, fetchImpl }) {
      if (!store || !tenantId || !teamId || !token || !SLACK_USER_ID.test(String(slackUserId || ""))) return null;
      const key = `${tenantId}|${teamId}|${slackUserId}`;
      const cached = cache.get(key);
      if (cached && cached.until > now()) return cached.value;
      if (pending.has(key)) return pending.get(key);
      const work = (async () => {
        try {
          const person = await slackUserEmail({ token, slackUserId, teamId, fetchImpl });
          // Still call the store with no email: it drops a stale link for this Slack user.
          const memberId = person.reason === "lookup-failed"
            ? ""
            : await store.link({ tenantId, teamId, slackUserId, email: person.email, displayName: person.displayName });
          const value = memberId ? { memberId, slackUserId, teamId, tenantId } : null;
          // A Slack/API failure is not cached as "not a member".
          if (person.reason !== "lookup-failed") cache.set(key, { value, until: now() + (value ? positiveMs : negativeMs) });
          return value;
        } finally {
          pending.delete(key);
        }
      })();
      pending.set(key, work);
      return work;
    },
  };
}

/** Read principal for a linked Slack asker: their Sederunt id plus their Slack id for Slack-kept records. */
export function slackReadPrincipal(link) {
  if (!link?.memberId || !link.slackUserId) return null;
  return { memberId: link.memberId, identities: [{ memberId: link.slackUserId, provider: "slack" }] };
}

/**
 * Whether a Slack conversation may be bound to the tenant-wide Files space.
 * Only a public, live, non-DM channel the bot can read: a private channel's
 * files must not become visible to every workspace member.
 *
 * @returns {Promise<{ ok: boolean, name: string, reason: string }>}
 */
export async function slackChannelBindable({ token, channel, fetchImpl = globalThis.fetch }) {
  if (!token || !/^[CG][A-Z0-9]{2,}$/.test(String(channel || ""))) return { ok: false, name: "", reason: "not-a-channel" };
  const url = new URL("https://slack.com/api/conversations.info");
  url.searchParams.set("channel", channel);
  const response = await fetchImpl(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  const info = body?.ok === true && body.channel && typeof body.channel === "object" ? body.channel : null;
  if (!info || info.id !== channel) return { ok: false, name: "", reason: "lookup-failed" };
  if (info.is_im === true || info.is_mpim === true) return { ok: false, name: "", reason: "direct" };
  if (info.is_archived === true) return { ok: false, name: "", reason: "archived" };
  if (info.is_private === true || info.is_group === true) return { ok: false, name: "", reason: "private" };
  if (info.is_member === false) return { ok: false, name: "", reason: "bot-not-member" };
  return { ok: true, name: String(info.name || ""), reason: "" };
}
