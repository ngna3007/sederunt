/** Fast tool caller, then a second vendor, then the newer lite. A pin replaces the first. */
export const MEETING_VOICE_MODELS = Object.freeze([
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-mini",
  "google/gemini-3.1-flash-lite",
]);

/**
 * Voice chain only. The general OPENROUTER_MODEL list is not a voice model.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function voiceModels(env = process.env) {
  const pinned = typeof env?.OPENROUTER_VOICE_MODEL === "string" ? env.OPENROUTER_VOICE_MODEL.trim() : "";
  const seen = new Set();
  const models = [];
  for (const model of [pinned, ...MEETING_VOICE_MODELS]) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}
