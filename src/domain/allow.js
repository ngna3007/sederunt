/**
 * A read ignores the write preference. A write or a delete runs only when
 * the live preference is do, or when ask is confirmed for this action id.
 * A missing preference is ask.
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
  if (input.preference === "do") return { allowed: true, reason: "do" };
  const confirmed = input.confirmed === true
    && input.actionId
    && input.actionId === input.confirmActionId;
  if (confirmed) return { allowed: true, reason: "confirmed" };
  return { allowed: false, reason: "ask" };
}
