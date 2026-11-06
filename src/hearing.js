/** The meeting guest when the operator has not chosen one. */
export const DEFAULT_HEARING_NAME = "Maple";
/**
 * Names that always count as an address. The visible Recall bot defaults to
 * Adam (`DEFAULT_BOT_NAME`), while hearing still defaults to Maple. A line
 * that says "Adam, remember this…" must keep even when hearing was never saved.
 */
export const DEFAULT_HEARING_ALIASES = ["Adam", "Maple"];

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
  if (tokens.some((token) => addressNames(heard).has(token))) return true;
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
  const words = addressNames(heard);
  let offset = 0;
  for (const part of raw.split(/(\s+)/)) {
    if (words.has(letters(part))) cut = Math.max(cut, offset + part.length);
    offset += part.length;
  }
  if (cut < 0) return raw;
  const after = raw.slice(cut).replace(/^[,:\s-]+/, "").trim();
  // Address-only ("Maple.") is not a decision. Empty after lets the
  // meeting door arm a short continuation window for the next chunk.
  return after;
}

/**
 * True when the line is a remember-this keep with a real payload.
 * Used on the meeting door so a dropped wake name still stores the decision.
 * A lone "remember this" or casual "I'll remember this later" does not match.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isRememberThisKeep(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  const match = raw.match(/\bremember\s+this\b[:\s,-]+(.+)/i);
  if (!match) return false;
  const payload = String(match[1] || "").trim();
  const words = payload.split(/\s+/).filter(Boolean);
  return payload.length >= 8 || words.length >= 2;
}

/**
 * One Recall chunk can concatenate several "Maple/Adam remember this …"
 * lines into a single utterance. Split so each addressed keep can be stored
 * on its own. A line with one address, or none, is returned unchanged.
 * Bare "remember this … remember this …" clauses also split, so a dropped
 * wake name does not glue two decisions together.
 * stripHearing still cuts at the last name inside each part.
 *
 * @param {string} text
 * @param {{ name?: string, triggers?: string[] } | null | undefined} hearing
 * @returns {string[]}
 */
export function splitAddressedKeepSentences(text, hearing) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const names = addressLabels(hearing);
  if (!names.length) return [raw];
  const namePattern = names.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(?:^|\\s)(?:(?:${namePattern})[,:\\s-]*)?remember\\s+this\\b`, "gi");
  const starts = [];
  for (const hit of raw.matchAll(pattern)) {
    let start = hit.index ?? 0;
    if (start < raw.length && /\s/.test(raw.charAt(start))) start += 1;
    starts.push(start);
  }
  if (starts.length <= 1) return [raw];
  const parts = [];
  for (let i = 0; i < starts.length; i += 1) {
    const slice = raw.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : raw.length).trim();
    if (slice) parts.push(slice);
  }
  return parts.length ? parts : [raw];
}

function addressLabels(hearing) {
  const heard = normalizeHearing(hearing);
  const labels = [heard.name, ...DEFAULT_HEARING_ALIASES];
  for (const trigger of heard.triggers) {
    if (!trigger.includes(" ")) labels.push(trigger);
  }
  const seen = new Set();
  const unique = [];
  for (const label of labels) {
    const key = letters(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }
  return unique;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addressNames(heard) {
  return new Set([
    letters(heard.name),
    ...DEFAULT_HEARING_ALIASES.map(letters),
    ...heard.triggers.filter((trigger) => !trigger.includes(" ")).map(letters),
  ]);
}

function triggerMatches(raw, tokens, trigger) {
  if (trigger.includes(" ")) return raw.toLowerCase().includes(trigger.toLowerCase());
  return tokens.includes(letters(trigger));
}

function letters(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
