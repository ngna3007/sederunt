/**
 * OpenRouter chat completions for Slack answers.
 * Uses OPENROUTER_API_KEY and optional OPENROUTER_MODEL.
 * Default model: openai/gpt-oss-120b.
 */

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ key: string, model: string, enabled: boolean }}
 */
export function openRouterConfig(env = process.env) {
  const key = typeof env.OPENROUTER_API_KEY === "string" ? env.OPENROUTER_API_KEY.trim() : "";
  const raw = typeof env.OPENROUTER_MODEL === "string" ? env.OPENROUTER_MODEL.trim() : "";
  const model = raw || DEFAULT_MODEL;
  return { key, model, enabled: Boolean(key) };
}

/**
 * One chat completion. Returns empty text when the key is missing or the call fails.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   system?: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   fetchImpl?: typeof fetch,
 * }} [input]
 * @returns {Promise<{ text: string, used: boolean, model: string }>}
 */
export async function openRouterComplete(input = {}) {
  const env = input.env ?? process.env;
  const { key, model, enabled } = openRouterConfig(env);
  if (!enabled) return { text: "", used: false, model };
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
  if (messages.length === 0) return { text: "", used: false, model };
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
    if (!response?.ok) return { text: "", used: false, model };
    const body = typeof response.json === "function" ? await response.json() : null;
    const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { text: "", used: false, model };
    return { text, used: true, model };
  } catch {
    return { text: "", used: false, model };
  }
}
