/**
 * Workspace meeting guest. One bot_preferences row per tenant, user_id null,
 * key meeting_guest. The value is JSON { name, triggers } of at most 500
 * characters.
 *
 * When the preference store is durable (Supabase configured), that row is
 * the only settings source: the row, or else the workspace bot name (Adam
 * until someone renames it) and no extra triggers. A hearing recalled from
 * semantic memory is not a source in that mode, so one tenant cannot inherit
 * another's guest.
 *
 * Semantic memory remains a source only for pure memory / no-store mode
 * (sign-in faked, Supabase unset, or options.memory): a session hearing with
 * savedAt for this same tenant, then the default bot name. That path is
 * back-compat for a process that has nowhere else to keep the guest.
 */

import { normalizeHearing } from "../hearing.js";
import { DEFAULT_BOT_NAME, resolveBotIdentity } from "./identity.js";
import { loadPreferences } from "./preferences.js";

export const MEETING_GUEST_KEY = "meeting_guest";
const MAX_VALUE = 500;

/**
 * Drop triggers from the end until the JSON fits the preference value limit.
 *
 * @param {{ name?: string, triggers?: string[] } | null | undefined} hearing
 */
export function fitMeetingGuest(hearing) {
  const normalized = normalizeHearing(hearing);
  const triggers = normalized.triggers.slice();
  const encode = (list) => JSON.stringify({ name: normalized.name, triggers: list });
  while (triggers.length > 0 && encode(triggers).length > MAX_VALUE) triggers.pop();
  const fitted = { name: normalized.name, triggers };
  if (encode(triggers).length > MAX_VALUE) return { name: normalized.name, triggers: [] };
  return fitted;
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ name: string, triggers: string[] } | null}
 */
export function unpackMeetingGuest(raw) {
  if (raw == null || !String(raw).trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (typeof parsed.name !== "string" && !Array.isArray(parsed.triggers)) return null;
  return normalizeHearing({ name: parsed.name, triggers: parsed.triggers });
}

/**
 * @param {{ upsert?: Function } | null | undefined} store
 * @param {string} tenantId
 * @param {{ name?: string, triggers?: string[] }} hearing
 */
export async function saveMeetingGuest(store, tenantId, hearing) {
  const fitted = fitMeetingGuest(hearing);
  const id = cleanTenant(tenantId);
  if (!store || !id) return fitted;
  await store.upsert({
    tenantId: id,
    userId: null,
    key: MEETING_GUEST_KEY,
    value: JSON.stringify(fitted),
  });
  return fitted;
}

/**
 * Effective guest for this tenant. Does not write the session.
 *
 * @param {{ botPreferences?: { list: Function } } | null | undefined} workspace
 * @param {string} tenantId
 * @param {{ hearing?: { name?: string, triggers?: string[], savedAt?: string, tenantId?: string } } | null | undefined} current
 */
export async function effectiveHearing(workspace, tenantId, current) {
  return (await resolveHearing(workspace, tenantId, current)).hearing;
}

/**
 * Copy the effective guest onto the session after the workspace is prepared.
 * A durable store always stamps the canonical guest (row, or the default bot
 * name) and drops a recalled hearing. Memory mode still leaves a legacy
 * hearing that belongs to this tenant. The default name is stamped without
 * savedAt so it is not mistaken for a saved guest on another tenant.
 * An empty tenant fails closed: no "local" and no other tenant's guest.
 *
 * @param {{ botPreferences?: { list: Function, durable?: boolean } } | null | undefined} workspace
 * @param {{ hearing?: object } | null | undefined} current
 * @param {string} tenantId
 */
export async function assignEffectiveHearing(workspace, current, tenantId) {
  const id = cleanTenant(tenantId);
  const resolved = await resolveHearing(workspace, id, current);
  if (!current) return resolved.hearing;
  if (!id) {
    if (storeIsDurable(workspace)) current.hearing = undefined;
    return resolved.hearing;
  }
  if (resolved.source === "legacy") return resolved.hearing;
  const foreign = current.hearing?.tenantId && current.hearing.tenantId !== id;
  const stamp = { ...resolved.hearing, tenantId: id };
  if (resolved.source === "durable") stamp.savedAt = new Date().toISOString();
  if (resolved.source === "durable" || storeIsDurable(workspace) || foreign || !current.hearing?.savedAt) {
    current.hearing = stamp;
  }
  return resolved.hearing;
}

async function resolveHearing(workspace, tenantId, current) {
  const id = cleanTenant(tenantId);
  let botName = DEFAULT_BOT_NAME;
  let stored = null;
  const store = workspace?.botPreferences;
  if (store && id) {
    const loaded = await loadPreferences(store, { tenantId: id, userId: null });
    botName = resolveBotIdentity(loaded.workspace).name;
    stored = unpackMeetingGuest(loaded.workspace?.[MEETING_GUEST_KEY]);
  }
  if (stored) return { hearing: stored, source: "durable" };
  // No durable store: a same-tenant hearing recalled from semantic memory
  // still applies. A configured store never reads that as settings.
  if (id && !storeIsDurable(workspace)) {
    const legacy = legacyHearing(current, id);
    if (legacy) return { hearing: legacy, source: "legacy" };
  }
  return { hearing: normalizeHearing({ name: botName, triggers: [] }), source: "default" };
}

function storeIsDurable(workspace) {
  return workspace?.botPreferences?.durable === true;
}

function legacyHearing(current, tenantId) {
  const hearing = current?.hearing;
  if (!hearing || typeof hearing !== "object" || !hearing.savedAt) return null;
  if (hearing.tenantId && hearing.tenantId !== tenantId) return null;
  return normalizeHearing(hearing);
}

function cleanTenant(tenantId) {
  return typeof tenantId === "string" ? tenantId.trim() : "";
}
