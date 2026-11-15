/**
 * First-run space choice. Pure checks shared by the fake backend and Supabase.
 * Nothing here reads the network or the session cookie.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/** Mailbox providers. A workspace is never named after one or auto-joined by one. */
export const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com",
  "hey.com", "fastmail.com", "tutanota.com", "example.com", "example.org", "example.net",
]);

/**
 * Every person works in one workspace. Welcome runs until they own or
 * belong to one that is not the hidden personal tenant.
 *
 * @param {unknown} _user
 * @param {Array<{ kind?: string }> | null | undefined} tenants
 */
export function needsOnboarding(_user, tenants) {
  const rows = Array.isArray(tenants) ? tenants : [];
  return !rows.some((row) => row && row.kind && row.kind !== "personal");
}

/**
 * The part after @, lowercased, or "" for a public mailbox provider.
 *
 * @param {unknown} email
 */
export function workDomain(email) {
  const at = String(email || "").trim().toLowerCase().split("@");
  if (at.length !== 2 || !DOMAIN.test(at[1])) return "";
  return PUBLIC_DOMAINS.has(at[1]) ? "" : at[1];
}

/**
 * "Acme" for rowan@acme.com, else "Rowan's workspace".
 *
 * @param {{ name?: string, email?: string }} who
 */
export function suggestedWorkspaceName(who = {}) {
  const domain = workDomain(who.email);
  if (domain) {
    const parts = domain.split(".");
    const root = parts.length > 2 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2])
      ? parts[parts.length - 3]
      : parts[parts.length - 2];
    const word = String(root || "").replace(/[-_]+/g, " ").trim();
    if (word) return word.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
  }
  const first = String(who.name || "").trim().split(/\s+/)[0]
    || String(who.email || "").split("@")[0].split(/[._+-]/)[0];
  const clean = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  return clean ? `${clean}'s workspace`.slice(0, 120) : "My workspace";
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
 * Comma, semicolon, space or newline separated. Empty is allowed. Duplicates are dropped.
 *
 * @param {unknown} value
 * @returns {{ emails: string[], error: string }}
 */
export function parseInviteEmails(value) {
  const parts = String(value || "").split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
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
  if (code === "duplicate_workspace") return "You already have a workspace with this name.";
  if (code === "conflict" || /already has an open invite|duplicate key/i.test(message)) {
    return "That email already has an open invite.";
  }
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
 * Workspaces by name. The hidden personal tenant sorts last.
 *
 * @param {Array<{ id?: string, kind?: string, name?: string, role?: string }>} rows
 */
export function sortSpaces(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aPersonal = a?.kind === "personal" ? 1 : 0;
    const bPersonal = b?.kind === "personal" ? 1 : 0;
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
  if (wanted && (wanted.kind !== "personal" || !sorted.some((row) => row.kind !== "personal"))) return wanted;
  return sorted.find((row) => row.kind !== "personal") || sorted[0] || null;
}

/**
 * The switcher lists workspaces. The personal tenant shows only when it is
 * the one space left, and it is called a workspace too.
 *
 * @param {Array<{ kind?: string }>} rows
 */
export function visibleSpaces(rows) {
  const sorted = sortSpaces(rows);
  const shared = sorted.filter((row) => row?.kind !== "personal");
  return shared.length ? shared : sorted;
}

/** @param {string} role */
export function roleLabel(role) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return "";
}
