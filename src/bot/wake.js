/**
 * Wake detection for a workspace bot name.
 * Case-insensitive and punctuation-tolerant. A name token may be one
 * same-length edit away ("Adum", "Edam") or split in two ("a dam", "Ad am").
 * Vietnamese diacritics fold, so "Ê đam", "A đam", and "Hây Adam" can match.
 * See docs/design/bot-behavior.md for the limits.
 */

import { DEFAULT_BOT_NAME, defaultWakePhrases, normalizeBotName } from "./identity.js";

const HEY = new Set(["hey", "hi", "ok", "okay", "nay", "hay"]);
const TITLES = new Set(["anh", "chi", "ong", "ba", "co", "chu", "bac", "em", "ban", "cau", "mr", "mrs", "ms", "miss"]);

/**
 * @param {string} text
 * @param {{ name?: string, botName?: string, phrases?: string[] }} [options]
 * @returns {{ addressed: boolean, match: string }}
 */
export function detectWake(text, options = {}) {
  const name = normalizeBotName(options.name || options.botName) || DEFAULT_BOT_NAME;
  const phrases = phraseList(options.phrases, name);
  const nameFold = fold(name);
  for (const clause of splitClauses(text)) {
    const { tokens, question } = tokenize(clause);
    if (tokens.length === 0) continue;
    const phrase = phraseAtStart(tokens, phrases, nameFold);
    if (phrase) return { addressed: true, match: phrase };
    for (let index = 0; index < tokens.length; index += 1) {
      const span = nameSpanLength(tokens, index, nameFold);
      if (!span || blockedByTitle(tokens, index, span)) continue;
      const atStart = index === 0;
      const vocative = isVocative(tokens, index, span);
      const tag = question && index + span === tokens.length;
      if (atStart || vocative || tag) {
        return { addressed: true, match: tokens.slice(index, index + span).map((token) => token.raw).join(" ") };
      }
    }
  }
  return { addressed: false, match: "" };
}

function phraseList(phrases, name) {
  if (!Array.isArray(phrases) || phrases.length === 0) return defaultWakePhrases(name);
  const cleaned = phrases.map((phrase) => String(phrase ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : defaultWakePhrases(name);
}

function splitClauses(text) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const clauses = [];
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (".!?;\n…".includes(raw[i])) {
      const chunk = raw.slice(start, i + 1).trim();
      if (chunk) clauses.push(chunk);
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail) clauses.push(tail);
  return clauses;
}

function tokenize(clause) {
  const question = /\?\s*$/.test(clause.trim());
  const chunks = clause.split(",");
  const tokens = [];
  chunks.forEach((chunk, index) => {
    const words = chunk.match(/[\p{L}\p{N}]+(?:['’]s)?/gu) || [];
    words.forEach((word, wordIndex) => {
      const possessive = /['’]s$/i.test(word);
      const raw = word.replace(/['’]s$/i, "");
      tokens.push({
        raw,
        fold: fold(raw),
        possessive,
        commaBefore: index > 0 && wordIndex === 0,
        commaAfter: false,
      });
    });
    if (tokens.length && index < chunks.length - 1) tokens[tokens.length - 1].commaAfter = true;
  });
  return { tokens, question };
}

function phraseAtStart(tokens, phrases, nameFold) {
  for (const phrase of phrases) {
    const wanted = (String(phrase).match(/[\p{L}\p{N}]+/gu) || []).map(fold);
    if (!wanted.length) continue;
    let index = 0;
    let ok = true;
    for (const want of wanted) {
      if (index >= tokens.length) {
        ok = false;
        break;
      }
      if (want === nameFold || tokenMatchesName(want, nameFold)) {
        const span = nameSpanLength(tokens, index, nameFold);
        if (!span) {
          ok = false;
          break;
        }
        index += span;
        continue;
      }
      if (HEY.has(want) && HEY.has(tokens[index].fold)) {
        index += 1;
        continue;
      }
      if (tokens[index].fold !== want || tokens[index].possessive) {
        ok = false;
        break;
      }
      index += 1;
    }
    if (ok) return tokens.slice(0, index).map((token) => token.raw).join(" ");
  }
  return "";
}

function nameSpanLength(tokens, index, nameFold) {
  const token = tokens[index];
  if (!token || token.possessive) return 0;
  if (tokenMatchesName(token.fold, nameFold)) return 1;
  const next = tokens[index + 1];
  if (!next || next.possessive || next.commaBefore) return 0;
  if (token.fold.length >= nameFold.length || next.fold.length >= nameFold.length) return 0;
  const joined = token.fold + next.fold;
  if (joined.length !== nameFold.length) return 0;
  if (joined === nameFold || substitutions(joined, nameFold) <= 1) return 2;
  return 0;
}

function tokenMatchesName(heard, nameFold) {
  if (!heard || heard.length !== nameFold.length) return false;
  if (heard === nameFold) return true;
  if (nameFold.length < 3) return false;
  return substitutions(heard, nameFold) <= 1;
}

function substitutions(left, right) {
  if (left.length !== right.length) return 99;
  let count = 0;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) count += 1;
  return count;
}

function blockedByTitle(tokens, index, span) {
  const before = tokens[index - 1];
  if (!before || !TITLES.has(before.fold)) return false;
  if (tokens[index].commaBefore) return false;
  if (isParticle(tokens[index + span])) return false;
  return true;
}

function isVocative(tokens, index, span) {
  const token = tokens[index];
  const before = tokens[index - 1];
  const after = tokens[index + span];
  if (token.commaBefore || (token.commaAfter && index === 0)) return true;
  if (before && (HEY.has(before.fold) || isParticle(before))) return true;
  if (after && (HEY.has(after.fold) || isParticle(after))) return true;
  return false;
}

function isParticle(token) {
  if (!token) return false;
  if (token.fold === "oi") return true;
  return token.raw.normalize("NFC").toLowerCase() === "à";
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
