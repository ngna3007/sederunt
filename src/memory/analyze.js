const LONG = 400;
const FACT_CAP = 20;

/**
 * A short decision is stored as itself. A long transcript becomes one
 * sentence plus extracted facts. Audio is dropped and is not a fact.
 *
 * @param {string} text
 * @returns {{ sentence: string, facts: string[] }}
 */
export function splitPassage(text) {
  const source = String(text ?? "").trim();
  if (source.length < LONG) return { sentence: source, facts: [] };
  const parts = source.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const sentence = parts[0] || source;
  return { sentence, facts: parts.slice(1, FACT_CAP + 1) };
}
