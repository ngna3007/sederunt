/**
 * OpenRouter chat completions for Ask AI and Slack.
 * Uses OPENROUTER_API_KEY, optional OPENROUTER_MODEL (preferred),
 * and optional OPENROUTER_MODEL_FALLBACKS (comma-separated).
 * Default chain: google/gemma-4-31b-it:free → openai/gpt-oss-120b → openai/gpt-oss-20b.
 */

const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
const DEFAULT_FALLBACKS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function splitModels(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

/**
 * Ordered models: preferred first, then fallbacks, duplicates dropped.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function openRouterModels(env = process.env) {
  const preferred = splitModels(env.OPENROUTER_MODEL)[0] || DEFAULT_MODEL;
  const fallbacks = splitModels(env.OPENROUTER_MODEL_FALLBACKS);
  const rest = fallbacks.length ? fallbacks : DEFAULT_FALLBACKS;
  const seen = new Set();
  const models = [];
  for (const model of [preferred, ...rest]) {
    if (seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ key: string, model: string, models: string[], enabled: boolean }}
 */
export function openRouterConfig(env = process.env) {
  const key = typeof env.OPENROUTER_API_KEY === "string" ? env.OPENROUTER_API_KEY.trim() : "";
  const models = openRouterModels(env);
  return { key, model: models[0], models, enabled: Boolean(key) };
}

/**
 * @param {string} model
 * @returns {boolean}
 */
function usesReasoning(model) {
  return model.startsWith("openai/gpt-oss");
}

/**
 * One chat completion. Tries each model in the fallback chain. Never throws.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   system?: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   fetchImpl?: typeof fetch,
 * }} [input]
 * @returns {Promise<{ text: string, used: boolean, model: string, tried?: string[] }>}
 */
export async function openRouterComplete(input = {}) {
  const env = input.env ?? process.env;
  const { key, models, enabled } = openRouterConfig(env);
  if (!enabled) return { text: "", used: false, model: models[0], tried: [] };
  const fetchImpl = input.fetchImpl || fetch;
  const messages = [];
  if (typeof input.system === "string" && input.system.trim()) {
    messages.push({ role: "system", content: input.system.trim() });
  }
  for (const turn of input.messages ?? []) {
    if (!turn || typeof turn.content !== "string" || !turn.content.trim()) continue;
    const role = turn.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: turn.content.trim() });
  }
  if (messages.length === 0) return { text: "", used: false, model: models[0], tried: [] };

  const tried = [];
  for (const model of models) {
    tried.push(model);
    try {
      const response = await fetchImpl(CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "HTTP-Referer": "https://sederunt.app",
          "X-Title": "Sederunt",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
        }),
      });
      if (!response?.ok) continue;
      const body = typeof response.json === "function" ? await response.json() : null;
      const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) continue;
      return { text, used: true, model, tried };
    } catch {
      continue;
    }
  }
  return { text: "", used: false, model: tried.at(-1) || models[0], tried };
}

/**
 * Streamed chat completion (OpenRouter SSE). Tries each model until one streams
 * usable text. Calls onDelta only for the successful model. Never throws.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   system?: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   fetchImpl?: typeof fetch,
 *   onDelta?: (text: string) => void | Promise<void>,
 *   signal?: AbortSignal,
 *   maxTokens?: number,
 * }} [input]
 * @returns {Promise<{ text: string, used: boolean, model: string, error?: string, tried?: string[] }>}
 */
export async function openRouterStream(input = {}) {
  const env = input.env ?? process.env;
  const { key, models, enabled } = openRouterConfig(env);
  if (!enabled) return { text: "", used: false, model: models[0], error: "no-key", tried: [] };
  const fetchImpl = input.fetchImpl || fetch;
  const messages = [];
  if (typeof input.system === "string" && input.system.trim()) messages.push({ role: "system", content: input.system.trim() });
  for (const turn of input.messages ?? []) {
    if (!turn || typeof turn.content !== "string" || !turn.content.trim()) continue;
    messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content.trim() });
  }
  if (!messages.length) return { text: "", used: false, model: models[0], error: "empty", tried: [] };

  const tried = [];
  let lastError = "unavailable";
  for (const model of models) {
    tried.push(model);
    let text = "";
    try {
      const body = {
        model,
        messages,
        temperature: 0.2,
        stream: true,
        max_tokens: input.maxTokens ?? 700,
      };
      if (usesReasoning(model)) body.reasoning = { effort: "low", exclude: true };
      const response = await fetchImpl(CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          accept: "text/event-stream",
          "HTTP-Referer": "https://sederunt.app",
          "X-Title": "Sederunt",
        },
        body: JSON.stringify(body),
        signal: input.signal,
      });
      if (!response?.ok || !response.body) {
        lastError = `http-${response?.status ?? 0}`;
        continue;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      let streamError = false;
      for await (const part of response.body) {
        buffer += typeof part === "string" ? part : decoder.decode(part, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") { finished = true; break; }
          let event;
          try { event = JSON.parse(data); } catch { continue; }
          if (event?.error) {
            streamError = true;
            lastError = "stream-error";
            break;
          }
          const delta = event?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            text += delta;
            if (typeof input.onDelta === "function") await input.onDelta(delta);
          }
        }
        if (finished || streamError) break;
      }
      if (streamError && !text.trim()) continue;
      const trimmed = text.trim();
      if (!trimmed) {
        lastError = "empty";
        continue;
      }
      return { text: trimmed, used: true, model, tried };
    } catch {
      if (text.trim()) return { text: text.trim(), used: true, model, error: "network", tried };
      lastError = "network";
      continue;
    }
  }
  return { text: "", used: false, model: tried.at(-1) || models[0], error: lastError, tried };
}
