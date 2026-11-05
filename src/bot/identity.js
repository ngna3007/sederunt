/**
 * Workspace bot persona. The product name stays Sederunt.
 * The bot's display name and wake phrases are workspace preferences
 * (`user_id` null): `bot_name`, and `wake_phrases` only when customized.
 * A missing name is Adam. Missing phrases are "Hey {name}" and "{name}".
 */

export const DEFAULT_BOT_NAME = "Adam";
export const BOT_NAME_KEY = "bot_name";
export const WAKE_PHRASES_KEY = "wake_phrases";
export const MAX_WAKE_PHRASES = 5;

/**
 * A letter is a character with a case pair. That covers Latin and Vietnamese
 * and matches the database check (`lower(ch) <> upper(ch)`). A character
 * with no upper and lower form is not a name character.
 */
function isCasedLetter(ch) {
  return ch.toLowerCase() !== ch.toUpperCase();
}

function nameCharsOk(name) {
  let first = true;
  for (const ch of name) {
    if (first) {
      first = false;
      if (!isCasedLetter(ch)) return false;
      continue;
    }
    if (ch === " " || ch === "-" || ch === "'" || ch === "\u2019") continue;
    if (!isCasedLetter(ch)) return false;
  }
  return !first;
}

export function validateBotName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, name: "", error: "Give the bot a name." };
  if (name.length > 32 || !nameCharsOk(name)) {
    return { ok: false, name: "", error: "Use 1-32 letters, spaces, hyphens, or apostrophes." };
  }
  return { ok: true, name, error: "" };
}

/** A cleaned name, or "" when the value is empty or not allowed. */
export function normalizeBotName(value) {
  const named = validateBotName(value);
  return named.ok ? named.name : "";
}

export function defaultWakePhrases(name) {
  const clean = normalizeBotName(name) || DEFAULT_BOT_NAME;
  const phrases = [`Hey ${clean}`];
  if (clean.length >= 2) phrases.push(clean);
  return phrases;
}

export function previewLine(name, phrases) {
  const clean = normalizeBotName(name) || DEFAULT_BOT_NAME;
  const lead = Array.isArray(phrases) && String(phrases[0] || "").trim()
    ? String(phrases[0]).trim()
    : `Hey ${clean}`;
  return `Say '${lead}, …' in a meeting`;
}

/**
 * The phrase equals the name, or contains it as whole words.
 * "Adamant" does not contain "Adam". "Hey Jean-Luc" contains "Jean-Luc".
 */
export function phraseHasName(phrase, name) {
  const phraseTokens = letters(phrase);
  const nameTokens = letters(name);
  if (!nameTokens.length || !phraseTokens.length) return false;
  if (phraseTokens.join(" ") === nameTokens.join(" ")) return true;
  for (let i = 0; i <= phraseTokens.length - nameTokens.length; i += 1) {
    if (nameTokens.every((part, offset) => phraseTokens[i + offset] === part)) return true;
  }
  return false;
}

export function validateWakePhrases(phrases, botName) {
  const named = validateBotName(botName);
  if (!named.ok) return { ok: false, phrases: [], error: named.error };
  if (!Array.isArray(phrases)) return { ok: false, phrases: [], error: "Add at least one wake phrase." };
  if (phrases.length < 1) return { ok: false, phrases: [], error: "Add at least one wake phrase." };
  if (phrases.length > MAX_WAKE_PHRASES) return { ok: false, phrases: [], error: "You can keep up to 5 wake phrases." };
  const cleaned = [];
  const seen = new Set();
  for (const item of phrases) {
    const phrase = String(item ?? "").trim().replace(/\s+/g, " ");
    if (phrase.length < 2 || phrase.length > 40) {
      return { ok: false, phrases: [], error: "Each wake phrase must be 2-40 characters." };
    }
    const key = phrase.toLowerCase();
    if (seen.has(key)) return { ok: false, phrases: [], error: "Wake phrases must be unique." };
    if (!phraseHasName(phrase, named.name)) {
      return { ok: false, phrases: [], error: "Each wake phrase must include the bot's name." };
    }
    seen.add(key);
    cleaned.push(phrase);
  }
  return { ok: true, phrases: cleaned, error: "" };
}

export function phrasesMatch(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (a.length !== b.length) return false;
  return a.every((phrase, index) => String(phrase).trim().toLowerCase() === String(b[index]).trim().toLowerCase());
}

/**
 * Workspace map from `loadPreferences`. User rows are ignored so a member
 * cannot rename the bot by saving their own `bot_name`.
 *
 * @param {Record<string, string> | null | undefined} workspace
 */
export function resolveBotIdentity(workspace = {}) {
  const source = workspace && typeof workspace === "object" ? workspace : {};
  const name = normalizeBotName(source[BOT_NAME_KEY]) || DEFAULT_BOT_NAME;
  const stored = parseStoredPhrases(source[WAKE_PHRASES_KEY], name);
  if (!stored) return { name, phrases: defaultWakePhrases(name), phrasesCustomized: false };
  return { name, phrases: stored, phrasesCustomized: true };
}

/**
 * Store the name when it is not the default. Store phrases only when they
 * differ from the derived pair. Clearing a customization deletes that row.
 */
export async function saveBotIdentity(store, { tenantId, name, phrases }) {
  const named = validateBotName(name);
  if (!named.ok) throw new Error(named.error);
  const wake = validateWakePhrases(phrases, named.name);
  if (!wake.ok) throw new Error(wake.error);
  if (!tenantId) throw new Error("missing workspace");
  if (named.name === DEFAULT_BOT_NAME) await store.remove({ tenantId, userId: null, key: BOT_NAME_KEY });
  else await store.upsert({ tenantId, userId: null, key: BOT_NAME_KEY, value: named.name });
  if (phrasesMatch(wake.phrases, defaultWakePhrases(named.name))) {
    await store.remove({ tenantId, userId: null, key: WAKE_PHRASES_KEY });
  } else {
    await store.upsert({ tenantId, userId: null, key: WAKE_PHRASES_KEY, value: JSON.stringify(wake.phrases) });
  }
  return resolveBotIdentity({
    [BOT_NAME_KEY]: named.name === DEFAULT_BOT_NAME ? "" : named.name,
    [WAKE_PHRASES_KEY]: phrasesMatch(wake.phrases, defaultWakePhrases(named.name)) ? "" : JSON.stringify(wake.phrases),
  });
}

function parseStoredPhrases(raw, name) {
  if (raw == null || !String(raw).trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }
  const wake = validateWakePhrases(parsed, name);
  return wake.ok ? wake.phrases : null;
}

function letters(value) {
  return String(value || "").toLowerCase().match(/\p{L}+/gu) || [];
}
