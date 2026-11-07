/**
 * Bot preferences for one tenant. A row with no user id is workspace-wide.
 * A row with a user id belongs to that person. The applied set is the
 * workspace map with that person's keys on top.
 *
 * The store is the persistence boundary. `createMemoryPreferenceStore` is
 * the in-process stand-in. `createBotPreferenceStore` selects that stand-in
 * or Supabase. Both implement list, upsert, and remove. RLS on
 * `bot_preferences` is the real gate for a signed-in caller; the service
 * role used by the server bypasses it, and the console handler is the gate.
 */

export function createMemoryPreferenceStore() {
  const rows = [];
  return {
    async list({ tenantId }) {
      return rows.filter((row) => row.tenantId === tenantId).map((row) => ({ ...row }));
    },
    async upsert({ tenantId, userId = null, key, value }) {
      const owner = userId || null;
      const found = rows.find((row) => row.tenantId === tenantId && (row.userId || null) === owner && row.key === key);
      if (found) {
        found.value = value;
        return { ...found };
      }
      const row = { tenantId, userId: owner, key, value };
      rows.push(row);
      return { ...row };
    },
    async remove({ tenantId, userId = null, key }) {
      const owner = userId || null;
      const index = rows.findIndex((row) => row.tenantId === tenantId && (row.userId || null) === owner && row.key === key);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}

/**
 * "remember this: tone is terse" or "remember this for the workspace: language is Vietnamese".
 * Returns null when the utterance is not a preference.
 */
export function preferenceFromUtterance(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/remember this\b[:\s-]*(.*)$/i);
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return null;
  const scope = /for (the workspace|everyone|the team)/i.test(raw) ? "workspace" : "user";
  const pair = body.replace(/^for (the workspace|everyone|the team)[:\s-]*/i, "").trim();
  const split = pair.match(/^([a-z][a-z0-9 _-]{0,40}?)\s*(?:is|are|:)\s*(.+)$/i);
  if (!split) return { scope, key: "note", value: pair };
  return { scope, key: split[1].trim().toLowerCase().replace(/\s+/g, "_"), value: split[2].trim() };
}

export async function rememberPreference(store, { tenantId, userId, scope = "user", key, value }) {
  const cleanKey = String(key || "").trim();
  const cleanValue = String(value || "").trim();
  if (!tenantId || !cleanKey || !cleanValue) throw new Error("missing preference");
  if (scope === "workspace") return store.upsert({ tenantId, userId: null, key: cleanKey, value: cleanValue });
  if (!userId) throw new Error("user preference needs a user");
  return store.upsert({ tenantId, userId, key: cleanKey, value: cleanValue });
}

export async function forgetPreference(store, { tenantId, userId, scope = "user", key }) {
  const owner = scope === "workspace" ? null : userId;
  if (scope !== "workspace" && !owner) throw new Error("user preference needs a user");
  return store.remove({ tenantId, userId: owner, key });
}

export async function loadPreferences(store, { tenantId, userId }) {
  const rows = await store.list({ tenantId });
  const workspace = {};
  const user = {};
  for (const row of rows) {
    if (!row.userId) workspace[row.key] = row.value;
    else if (userId && row.userId === userId) user[row.key] = row.value;
  }
  return { workspace, user, applied: { ...workspace, ...user } };
}
