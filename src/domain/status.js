/** Status words the screen may show. The model is not an input. */

export const STATUS_WORDS = Object.freeze([
  "recorded",
  "filed",
  "updated",
  "current",
  "clashing",
  "replaced",
  "unknown",
]);

/**
 * Status of a note or ticket from the object fields and the connector id
 * already in hand. A ticket is filed or updated only when that id is present.
 *
 * @param {{ kind: "note" | "ticket" | "decision", edit?: "create" | "update" }} item
 * @param {string | null | undefined} connectorId
 * @returns {"recorded" | "filed" | "updated"}
 */
export function itemStatus(item, connectorId) {
  if (item.kind === "ticket") {
    const id = typeof connectorId === "string" ? connectorId.trim() : "";
    if (!id) return "recorded";
    return item.edit === "update" ? "updated" : "filed";
  }
  return "recorded";
}
