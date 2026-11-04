/**
 * First-run space choice. Pure checks shared by the fake backend and Supabase.
 * Nothing here reads the network or the session cookie.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Welcome is for a signed-in person who still has only a Personal space
 * and has not finished or skipped the first-run question.
 *
 * @param {{ user_metadata?: Record<string, unknown> } | null | undefined} user
 * @param {Array<{ kind?: string }> | null | undefined} tenants
 */
export function needsOnboarding(user, tenants) {
  const meta = user && typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};
  if (meta.sederunt_onboarded === true) return false;
  const rows = Array.isArray(tenants) ? tenants : [];
  if (rows.some((row) => row && row.kind && row.kind !== "personal")) return false;
  return true;
}

/**
 * @param {unknown} value
 * @returns {{ name: string, error: string }}
 */
export function validateSpaceName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 120) {
    return { name: "", error: "Enter a name, from 1 to 120 characters." };
  }
  return { name, error: "" };
}

/**
 * Comma or newline separated. Empty is allowed. Duplicates are dropped.
 *
 * @param {unknown} value
 * @returns {{ emails: string[], error: string }}
 */
export function parseInviteEmails(value) {
  const parts = String(value || "").split(/[,;\n\r]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  const emails = [];
  const seen = new Set();
  for (const part of parts) {
    if (part.length > 320 || !EMAIL.test(part)) {
      return { emails: [], error: `"${part.slice(0, 80)}" is not a valid email.` };
    }
    if (seen.has(part)) continue;
    seen.add(part);
    emails.push(part);
  }
  if (emails.length > 50) return { emails: [], error: "Add at most 50 emails at a time." };
  return { emails, error: "" };
}

/**
 * Blank is allowed. A company may store one verified email domain.
 *
 * @param {unknown} value
 * @returns {{ domain: string, error: string }}
 */
export function validateDomain(value) {
  const domain = String(value || "").trim().toLowerCase();
  if (!domain) return { domain: "", error: "" };
  if (domain.length > 253 || !DOMAIN.test(domain)) {
    return { domain: "", error: "That email domain is not valid. Leave it blank to skip." };
  }
  return { domain, error: "" };
}

/**
 * A sentence for the page. Never the raw response body.
 *
 * @param {{ code?: string, message?: string } | null | undefined} error
 */
export function identityMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").replace(/\s+/g, " ").trim();
  if (code === "forbidden" || /row-level security|permission denied|insufficient_privilege/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (code === "conflict" || /already has an open invite|duplicate key/i.test(message)) {
    return "That email already has an open invite.";
  }
  if (/team or company/i.test(message)) return "Choose a team or a company.";
  if (code === "invalid_tenant" || /1 to 120/.test(message)) return "Enter a name, from 1 to 120 characters.";
  if (code === "invalid_invite" && /email/i.test(message)) return "One of those emails is not valid.";
  if (code === "invalid_invite" || /invalid or expired/i.test(message)) return "That invite is invalid or expired.";
  if (/different email/i.test(message)) return "That invite was sent to a different email.";
  if (code === "unauthorized" || code === "unverified") return "Sign in again.";
  if (code === "upstream" || /could not be reached|fetch failed|network/i.test(message)) {
    return "That could not be saved. Try again.";
  }
  if (message && message.length <= 140 && !/[{}[\]<>]/.test(message) && !/jwt|bearer|password|stack|token/i.test(message)) {
    return message;
  }
  return "That could not be saved. Try again.";
}

/**
 * Personal first, then the others by name.
 *
 * @param {Array<{ id?: string, kind?: string, name?: string, role?: string }>} rows
 */
export function sortSpaces(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aPersonal = a?.kind === "personal" ? 0 : 1;
    const bPersonal = b?.kind === "personal" ? 0 : 1;
    if (aPersonal !== bPersonal) return aPersonal - bPersonal;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

/**
 * @param {Array<{ id?: string, kind?: string }>} rows
 * @param {string} [tenantId]
 */
export function activeSpace(rows, tenantId) {
  const sorted = sortSpaces(rows);
  const wanted = tenantId ? sorted.find((row) => row.id === tenantId) : null;
  if (wanted) return wanted;
  return sorted.find((row) => row.kind === "personal") || sorted[0] || null;
}

/** @param {string} kind */
export function kindLabel(kind) {
  if (kind === "personal") return "Personal";
  if (kind === "team") return "Team";
  if (kind === "company") return "Company";
  return "Space";
}

/** @param {string} role */
export function roleLabel(role) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return "";
}
