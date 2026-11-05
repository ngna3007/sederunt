import { openRouterConfig, openRouterStream } from "../openrouter.js";
import { mergeSemanticVisible, recallVisibleForAsk } from "../slack/reply.js";

const FLUSH_MS = 120;
const FLUSH_CHARS = 48;
const NOTHING = "Nothing kept in this workspace matches that yet.";

/**
 * Web Ask AI system prompt. Walrus Memory chatbot shape: recall ran before this
 * turn and the memories are injected; the model only answers from them.
 */
export function askSystemPrompt(memories, botName = "") {
  const name = String(botName || "").trim() || "Sederunt";
  return [
    `You are ${name}, the assistant inside Sederunt. Sederunt joins meetings and keeps what was decided.`,
    "Memory recall ran before this reply. Answer only from the memories below and the earlier turns.",
    "Do not invent decisions, dates, owners, or numbers. Do not store anything from this question.",
    `If nothing below applies, say exactly: ${NOTHING}`,
    "Lead with the answer in one or two short sentences. Add at most three short bullet points when they help.",
    "When two memories disagree, say so plainly and name both.",
    "Plain language only. Never mention chains, blobs, checkpoints, wallets, or other storage details.",
    "Reply in the language of the latest question.",
    "",
    "Memories:",
    memories.length ? memories.map((row, index) => `${index + 1}. ${memoryLine(row)}`).join("\n") : "(none)",
  ].join("\n");
}

function memoryLine(row) {
  const bits = [String(row?.text ?? "").trim()];
  const who = String(row?.speaker ?? "").trim();
  const when = String(row?.spokenAt ?? "").trim();
  const room = String(row?.roomId ?? "").trim();
  const extra = [who && `said by ${who}`, when && `on ${when.slice(0, 16).replace("T", " ")} UTC`, room && `room ${room}`].filter(Boolean);
  return extra.length ? `${bits[0]} (${extra.join(", ")})` : bits[0];
}

/** Rows the asker may see, ranked for the question (MemWal.recall first when present). */
export async function recallForAsk(visible, question, recall, limit = 5) {
  let rows = recallVisibleForAsk(visible, question, limit);
  if (typeof recall === "function") {
    try {
      const hits = await recall(String(question ?? "").trim());
      const merged = mergeSemanticVisible(visible, hits, question, limit);
      if (merged.length) rows = merged;
    } catch {
      // Keep the keyword rank when memory recall is down.
    }
  }
  return rows;
}

function sourceOf(row) {
  return {
    text: String(row?.text ?? "").trim().slice(0, 280),
    roomId: typeof row?.roomId === "string" ? row.roomId : "",
    spokenAt: typeof row?.spokenAt === "string" ? row.spokenAt : "",
    speaker: typeof row?.speaker === "string" ? row.speaker : "",
  };
}

/**
 * Run one Ask AI turn into the durable store: recall → inject → generate (streamed).
 * Falls back to the retrieval answer when OpenRouter is off or fails before any text.
 *
 * @param {{
 *   store: ReturnType<typeof import("./store.js").createAskStore>,
 *   id: string,
 *   question: string,
 *   visible?: any[],
 *   recall?: (query: string) => Promise<any[]>,
 *   retrieval?: () => Promise<{ body?: string, learned?: string }>,
 *   history?: Array<{ question: string, answer: string }>,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   botName?: string,
 * }} input
 */
export async function runAsk(input) {
  const { store, id } = input;
  const env = input.env ?? process.env;
  const question = String(input.question ?? "").trim();
  try {
    const rows = await recallForAsk(input.visible ?? [], question, input.recall, 5);
    const sources = rows.map(sourceOf).filter((row) => row.text);
    if (openRouterConfig(env).enabled) {
      let pending = "";
      let last = Date.now();
      let wrote = false;
      let chain = Promise.resolve();
      const flush = () => {
        if (!pending) return chain;
        const text = pending;
        pending = "";
        last = Date.now();
        wrote = true;
        chain = chain.then(() => store.append(id, text));
        return chain;
      };
      const messages = [];
      for (const turn of (input.history ?? []).slice(-3)) {
        if (turn?.question && turn?.answer) {
          messages.push({ role: "user", content: turn.question }, { role: "assistant", content: turn.answer });
        }
      }
      messages.push({ role: "user", content: question });
      const result = await openRouterStream({
        env,
        system: askSystemPrompt(rows, input.botName),
        messages,
        fetchImpl: input.fetchImpl,
        onDelta: async (delta) => {
          pending += delta;
          if (pending.length >= FLUSH_CHARS || Date.now() - last >= FLUSH_MS) await flush();
        },
      });
      await flush();
      await chain;
      if (result.used || wrote) {
        await store.finish(id, { status: result.error && !result.used ? "error" : "done", source: "openrouter", sources });
        return { source: "openrouter", sources };
      }
    }
    const answer = typeof input.retrieval === "function" ? await input.retrieval() : null;
    const text = String(answer?.learned || answer?.body || "").trim() || NOTHING;
    await store.append(id, text);
    await store.finish(id, { status: "done", source: "retrieval", sources, result: answer || { body: text } });
    return { source: "retrieval", sources };
  } catch {
    try {
      await store.finish(id, { status: "error" });
    } catch {
      // The reader marks a silent stream stopped after STALE_MS.
    }
    return { source: "error", sources: [] };
  }
}
