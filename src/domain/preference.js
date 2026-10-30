/**
 * The live preference is the one without replacedBy. A room override wins
 * over the account default. A missing document means ask. When more than
 * one live document matches, the highest id wins, so a restart that still
 * holds the older copy does not put that copy back in force.
 *
 * @param {Array<{ id?: string, tool: string, value?: string, roomId?: string, replacedBy?: string | null }>} preferences
 * @param {string} tool
 * @param {string | null | undefined} roomId
 * @returns {"ask" | "do"}
 */
export function resolvePreference(preferences, tool, roomId) {
  const live = (preferences ?? []).filter((pref) => pref.tool === tool && !pref.replacedBy);
  if (roomId) {
    const override = newestPreference(live.filter((pref) => pref.roomId === roomId));
    if (override?.value === "do" || override?.value === "ask") return override.value;
  }
  const account = newestPreference(live.filter((pref) => !pref.roomId));
  return account?.value === "do" ? "do" : "ask";
}

function preferenceRank(pref) {
  const match = /-(\d+)$/.exec(String(pref?.id ?? ""));
  return match ? Number(match[1]) : 0;
}

function newestPreference(list) {
  let chosen = null;
  for (const pref of list) {
    if (!chosen || preferenceRank(pref) >= preferenceRank(chosen)) chosen = pref;
  }
  return chosen;
}
