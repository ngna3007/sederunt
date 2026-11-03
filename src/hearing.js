/** The meeting guest when the operator has not chosen one. */
export const DEFAULT_HEARING_NAME = "Maple";

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} '\-]{0,39}$/u;

/**
 * The name shown in the meeting, and the extra words or sentences that address the guest.
 * The name itself is always one of the words. A blank name stays Maple.
 *
 * @param {{ name?: string, triggers?: string[] } | null | undefined} input
 */
export function normalizeHearing(input) {
  const rawName = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const name = NAME.test(rawName) ? rawName : DEFAULT_HEARING_NAME;
  const seen = new Set([letters(name)]);
  const triggers = [];
  for (const value of Array.isArray(input?.triggers) ? input.triggers : []) {
    const trigger = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!trigger || trigger.length > 80) continue;
    const key = trigger.toLowerCase();
    if (seen.has(key) || seen.has(letters(trigger))) continue;
    seen.add(key);
    triggers.push(trigger);
    if (triggers.length >= 12) break;
  }
  return { name, triggers };
}

/** True when the line addresses this guest. A missing hearing uses the default name. */
export function addressesHearing(text, hearing) {
  const raw = String(text ?? "");
  const heard = normalizeHearing(hearing);
  const tokens = raw.split(/\s+/).map(letters).filter(Boolean);
  if (tokens.includes(letters(heard.name))) return true;
  return heard.triggers.some((trigger) => triggerMatches(raw, tokens, trigger));
}

/** The words after the last name or trigger. The address itself is not the decision. */
export function stripHearing(text, hearing) {
  const raw = String(text ?? "").trim();
  const heard = normalizeHearing(hearing);
  let cut = -1;
  const lower = raw.toLowerCase();
  for (const trigger of heard.triggers) {
    if (!trigger.includes(" ")) continue;
    const at = lower.lastIndexOf(trigger.toLowerCase());
    if (at >= 0) cut = Math.max(cut, at + trigger.length);
  }
  const words = new Set([letters(heard.name), ...heard.triggers.filter((trigger) => !trigger.includes(" ")).map(letters)]);
  let offset = 0;
  for (const part of raw.split(/(\s+)/)) {
    if (words.has(letters(part))) cut = Math.max(cut, offset + part.length);
    offset += part.length;
  }
  if (cut < 0) return raw;
  const after = raw.slice(cut).replace(/^[,:\s-]+/, "").trim();
  return after || raw;
}

function triggerMatches(raw, tokens, trigger) {
  if (trigger.includes(" ")) return raw.toLowerCase().includes(trigger.toLowerCase());
  return tokens.includes(letters(trigger));
}

function letters(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
