/**
 * Workspace meeting guest. One bot_preferences row per tenant, user_id null,
 * key meeting_guest. The value is JSON { name, triggers } of at most 500
 * characters. A saved row wins. Otherwise a legacy session hearing that was
 * actually saved wins. Otherwise the guest name is the workspace bot name
 * (Adam until someone renames it) and there are no extra triggers.
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
 * A durable row replaces whatever semantic recall restored. A legacy hearing
 * with savedAt is left in place. The default name is stamped without savedAt
 * so it is not mistaken for a saved guest on another tenant.
 *
 * @param {{ botPreferences?: { list: Function } } | null | undefined} workspace
 * @param {{ hearing?: object } | null | undefined} current
 * @param {string} tenantId
 */
export async function assignEffectiveHearing(workspace, current, tenantId) {
  const id = cleanTenant(tenantId);
  const resolved = await resolveHearing(workspace, id, current);
  if (!current) return resolved.hearing;
  if (resolved.source === "durable") {
    current.hearing = { ...resolved.hearing, savedAt: new Date().toISOString(), tenantId: id };
    return resolved.hearing;
  }
  if (resolved.source === "legacy") return resolved.hearing;
  if (!current.hearing?.savedAt) current.hearing = { ...resolved.hearing, tenantId: id };
  return resolved.hearing;
}

async function resolveHearing(workspace, tenantId, current) {
  const id = cleanTenant(tenantId);
  let botName = DEFAULT_BOT_NAME;
  let stored = null;
  const store = workspace?.botPreferences;
  if (store) {
    const loaded = await loadPreferences(store, { tenantId: id, userId: null });
    botName = resolveBotIdentity(loaded.workspace).name;
    stored = unpackMeetingGuest(loaded.workspace?.[MEETING_GUEST_KEY]);
  }
  if (stored) return { hearing: stored, source: "durable" };
  const legacy = legacyHearing(current, id);
  if (legacy) return { hearing: legacy, source: "legacy" };
  return { hearing: normalizeHearing({ name: botName, triggers: [] }), source: "default" };
}

function legacyHearing(current, tenantId) {
  const hearing = current?.hearing;
  if (!hearing || typeof hearing !== "object" || !hearing.savedAt) return null;
  if (hearing.tenantId && hearing.tenantId !== tenantId) return null;
  return normalizeHearing(hearing);
}

function cleanTenant(tenantId) {
  const id = typeof tenantId === "string" ? tenantId.trim() : "";
  return id || "local";
}
