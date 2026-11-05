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
 * Completion budget for both reasoning and the visible answer.
 * Low effort still spends about a fifth of this on reasoning, and some
 * providers floor the reasoning budget near 1024, so the cap stays above that.
 */
export const OPENROUTER_OUTPUT_TOKENS = 2048;

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
 * Assistant text only. Reasoning, tool calls, and status objects are not the answer.
 * @param {unknown} content
 * @returns {string}
 */
export function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (typeof part === "string") {
      out += part;
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const type = String(part.type || "");
    if (type.startsWith("reasoning") || type.startsWith("tool")) continue;
    if (typeof part.text === "string") out += part.text;
  }
  return out;
}

/** Visible text from one streamed choice. Ignores reasoning and tool deltas. */
function choiceText(choice) {
  if (!choice || typeof choice !== "object") return "";
  const delta = choice.delta;
  if (delta && typeof delta === "object") {
    if ("content" in delta && delta.content != null) {
      const fromDelta = textFromContent(delta.content);
      if (fromDelta) return fromDelta;
    }
    // content null plus reasoning/tools is not an answer, even if message repeats the trace.
    if (delta.reasoning || delta.reasoning_content || delta.reasoning_details || delta.tool_calls) return "";
  }
  return textFromContent(choice.message?.content);
}

/**
 * Shared chat body. Reasoning models get a low effort cap so the trace cannot
 * spend the whole max_tokens budget, and the trace is left out of the reply.
 * @param {string} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ stream?: boolean, maxTokens?: number }} [options]
 */
function completionBody(model, messages, options = {}) {
  const body = {
    model,
    messages,
    max_tokens: options.maxTokens ?? OPENROUTER_OUTPUT_TOKENS,
  };
  // Sampling params are rejected by some reasoning endpoints and would skip the model.
  if (!usesReasoning(model)) body.temperature = 0.2;
  if (options.stream) body.stream = true;
  if (usesReasoning(model)) body.reasoning = { effort: "low", exclude: true };
  return body;
}

function dropBody(response) {
  const cancel = response?.body?.cancel;
  if (typeof cancel === "function") cancel.call(response.body).catch(() => {});
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
        body: JSON.stringify(completionBody(model, messages, { maxTokens: input.maxTokens })),
      });
      if (!response?.ok) {
        dropBody(response);
        continue;
      }
      const body = typeof response.json === "function" ? await response.json() : null;
      const choice = body?.choices?.[0];
      const text = textFromContent(choice?.message?.content).trim();
      // content null with only a reasoning trace, or a length stop, is not an answer.
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
      const body = completionBody(model, messages, { stream: true, maxTokens: input.maxTokens });
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
        dropBody(response);
        continue;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      let streamError = false;
      const takePayload = async (data) => {
        if (data === "[DONE]") { finished = true; return; }
        let event;
        try { event = JSON.parse(data); } catch { return; }
        if (event?.error) {
          streamError = true;
          lastError = "stream-error";
          return;
        }
        const delta = choiceText(event?.choices?.[0]);
        if (!delta) return;
        text += delta;
        // Leading padding from a reasoning model is not an answer and must not be shown.
        if (!delta.trim() && !text.trim()) return;
        if (typeof input.onDelta === "function") await input.onDelta(delta);
      };
      const consume = async (block, flushTail) => {
        let rest = block;
        let cut;
        while ((cut = rest.indexOf("\n")) !== -1) {
          const line = rest.slice(0, cut).replace(/\r$/, "").trim();
          rest = rest.slice(cut + 1);
          if (!line.startsWith("data:")) continue;
          await takePayload(line.slice(5).trim());
          if (finished || streamError) return "";
        }
        if (flushTail && rest.trim().startsWith("data:")) {
          await takePayload(rest.trim().slice(5).trim());
          return "";
        }
        return rest;
      };
      for await (const part of response.body) {
        buffer += typeof part === "string" ? part : decoder.decode(part, { stream: true });
        buffer = await consume(buffer, false);
        if (finished || streamError) break;
      }
      if (!finished && !streamError) {
        buffer += decoder.decode();
        await consume(buffer, true);
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
