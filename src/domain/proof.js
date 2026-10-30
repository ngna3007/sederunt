import { redact } from "./redact.js";

/**
 * The proof fragment. Checkpoint and preference only.
 * Account ids and keys on the item are not copied into the markup.
 *
 * @param {{ checkpoint?: number | null, preference?: string | null, status?: string | null }} item
 */
export function renderProof(item) {
  const checkpoint = Number.isInteger(item?.checkpoint) ? String(item.checkpoint) : "";
  const preference = item?.preference === "do" ? "do" : "ask";
  const status = typeof item?.status === "string" ? item.status : "recorded";
  const html = `<p>checkpoint ${checkpoint}</p><p>preference ${preference}</p><p>${status}</p>`;
  return redact(html);
}
