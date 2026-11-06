/**
 * A read ignores the write preference. A write or a delete runs unless the
 * live preference is ask. A missing preference runs. An ask preference still
 * runs when this action id was confirmed.
 *
 * @param {{
 *   action: "read" | "write" | "delete",
 *   tool: string,
 *   preference?: "ask" | "do" | null,
 *   confirmed?: boolean,
 *   actionId?: string | null,
 *   confirmActionId?: string | null,
 * }} input
 */
export function authorize(input) {
  if (input.action === "read") return { allowed: true, reason: "read" };
  if (input.action !== "write" && input.action !== "delete") {
    return { allowed: false, reason: "ask" };
  }
  const confirmed = input.confirmed === true
    && input.actionId
    && input.actionId === input.confirmActionId;
  if (input.preference === "ask" && !confirmed) return { allowed: false, reason: "ask" };
  if (confirmed && input.preference === "ask") return { allowed: true, reason: "confirmed" };
  return { allowed: true, reason: "do" };
}
