import { openRouterConfig, openRouterStream } from "../openrouter.js";
import { contentWords } from "../room-match.js";
import { mergeSemanticVisible, recallVisibleForAsk } from "../slack/reply.js";

const FLUSH_MS = 120;
const FLUSH_CHARS = 48;
export const NOTHING = "Nothing kept in this workspace matches that yet.";
/** Shown when every model fails and no kept sentence answers the question. */
export const ASK_UNAVAILABLE = "I couldn't answer that just now. Try again in a moment.";

/**
 * A daily question is spent only when the person got a real answer.
 * Unavailable, errors, and stopped turns are refunded.
 * @param {string | undefined} source
 * @param {string} [status]
 */
export function askSpendsQuota(source, status = "done") {
  return status === "done" && (source === "openrouter" || source === "retrieval");
}

const PROTOCOL_LINE = /^(?:missing-member|not-invited|duplicate-delivery|recorded|current|clashing|replaced|unknown|filed|updated)$/i;
const PROTOCOL_TAG = /^(?:preference|checkpoint)(?:\s+\S+)?$/i;
const PROTOCOL_ROW = /^ROW-\d+$/i;
const SYSTEM_LINE = /^(?:Nothing stored matches that\.|Nothing is stored that you can read\.|There are no notes yet\.|A decision is kept from a room\.?|The question is missing\.)$/i;

/** Drop tool protocol lines. A real sentence stays. */
export function humanAskText(raw) {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !PROTOCOL_LINE.test(line) && !PROTOCOL_TAG.test(line) && !PROTOCOL_ROW.test(line))
    .join("\n")
    .trim();
}

/**
 * The retrieval fallback the user can read. Protocol keys are never the answer.
 * Unmatched decision dumps are not either: those wait for the model.
 * @param {string} question
 * @param {{ body?: string, learned?: string } | null | undefined} answer
 */
export function askFallbackText(question, answer) {
  const learned = humanAskText(answer?.learned);
  if (learned) return learned;
  const lines = humanAskText(answer?.body).split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return ASK_UNAVAILABLE;
  const words = contentWords(question);
  if (words.length) {
    const matched = lines.filter((line) => words.some((word) => line.toLowerCase().includes(word)));
    if (matched.length) return matched.join("\n");
  }
  if (lines.length === 1 && (SYSTEM_LINE.test(lines[0]) || !words.length)) return lines[0];
  return ASK_UNAVAILABLE;
}

/**
 * Web Ask AI system prompt. Recall already ran (Walrus Memory shape) and the
 * memories are injected. They are the only source for a kept decision.
 * A product question may use the built-in description when that list is empty.
 * @param {Array<{ text?: string, speaker?: string, spokenAt?: string, roomId?: string }>} memories
 * @param {string} [botName]
 */
export function askSystemPrompt(memories, botName = "") {
  const name = String(botName || "").trim() || "Sederunt";
  return [
    `You are ${name}, the assistant inside Sederunt.`,
    "Built-in product knowledge: Sederunt joins a channel or a meeting, keeps what was decided, and answers later from that record. People ask in this console, in the room, or from an agent they already use.",
    "Memory recall ran before this reply. The memories below are the only kept decisions you may cite.",
    "If the question is what Sederunt is or how Sederunt works, answer in one or two short sentences from the built-in product knowledge, even when no memory applies. Do not answer a product question with the empty-memory sentence.",
    "If the question asks for a meeting, a decision, a date, an owner, or a number, answer only from the memories below and the earlier turns. Do not invent decisions, dates, owners, or numbers.",
    "When a memory below clearly answers the question (same topic, date, place, or name), use that memory. Prefer the memory that matches the question over unlock codes or unrelated keeps.",
    `Only if none of the memories below apply, say exactly: ${NOTHING}`,
    "Do not store anything from this question.",
    "Lead with the answer in one or two short sentences. Add at most three short bullet points when they help.",
    "When two memories disagree, say so plainly and name both.",
    "Plain language only. Never mention chains, blobs, checkpoints, wallets, or other storage details.",
    "Never quote Slack user ids, channel ids, UUIDs, or other technical member ids. Prefer a person's name or say someone.",
    "Reply in the language of the latest question.",
    "",
    "Memories:",
    memories.length ? memories.map((row, index) => `${index + 1}. ${memoryLine(row)}`).join("\n") : "(none)",
  ].join("\n");
}

/** Drop Slack/member/room technical ids from Ask memory lines. */
export function askDisplayName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^U[A-Z0-9_]{2,}$/i.test(text)) return "";
  if (/^[CGD][A-Z0-9]{8,}$/i.test(text)) return "";
  if (/^ROW-\d+$/i.test(text)) return "";
  if (/^\d+$/.test(text)) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return "";
  return text;
}

/** Strip leftover Slack user/channel ids from model text before it reaches the page. */
export function scrubAskIds(raw) {
  return String(raw ?? "")
    .replace(/\bU[A-Z0-9_]{2,}\b/gi, "someone")
    .replace(/\b[CGD][A-Z0-9]{8,}\b/g, "a channel")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "a room");
}

/**
 * When the model abstains with NOTHING but recall already found keeps, answer
 * from the top ranked row so a schedule/gate question is not empty on camera.
 * @param {string} question
 * @param {Array<{ text?: string }>} rows
 */
export function groundedAskAnswer(question, rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => humanAskText(row?.text))
    .filter((line) => line && line !== NOTHING && !SYSTEM_LINE.test(line));
  if (!list.length) return "";
  const stripKeep = (line) => {
    const cleaned = String(line)
      .replace(/^.*?please keep:\s*/i, "")
      .replace(/^Northline decision\s*[—\-]\s*/i, "")
      .trim();
    return cleaned || line;
  };
  let text = stripKeep(list[0]);
  const words = contentWords(question);
  if (words.length) {
    const matched = list.filter((line) => words.some((word) => line.toLowerCase().includes(word)));
    if (matched.length) text = stripKeep(matched[0]);
  }
  return text;
}

function memoryLine(row) {
  const bits = [String(row?.text ?? "").trim()];
  const who = askDisplayName(row?.speaker);
  const when = String(row?.spokenAt ?? "").trim();
  const room = askDisplayName(row?.roomId);
  const extra = [who && `said by ${who}`, when && `on ${when.slice(0, 16).replace("T", " ")} UTC`, room && `in ${room}`].filter(Boolean);
  return extra.length ? `${bits[0]} (${extra.join(", ")})` : bits[0];
}

/** Rows the asker may see, ranked for the question (MemWal.recall first when present). */
export async function recallForAsk(visible, question, recall, limit = 5, memberId = "") {
  let rows = recallVisibleForAsk(visible, question, limit);
  if (typeof recall === "function") {
    try {
      const hits = await recall(String(question ?? "").trim());
      const merged = mergeSemanticVisible(visible, hits, question, limit, memberId);
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
    const rows = await recallForAsk(input.visible ?? [], question, input.recall, 5, input.memberId || "");
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
          messages.push({ role: "user", content: turn.question }, { role: "assistant", content: scrubAskIds(turn.answer) });
        }
      }
      messages.push({ role: "user", content: question });
      const result = await openRouterStream({
        env,
        system: askSystemPrompt(rows, input.botName),
        messages,
        fetchImpl: input.fetchImpl,
        onDelta: async (delta) => {
          pending += scrubAskIds(delta);
          if (pending.length >= FLUSH_CHARS || Date.now() - last >= FLUSH_MS) await flush();
        },
      });
      await flush();
      await chain;
      const streamed = scrubAskIds(humanAskText(result.text));
      if (streamed === NOTHING) {
        const grounded = groundedAskAnswer(question, rows);
        if (grounded) {
          if (typeof store.replace === "function") await store.replace(id, grounded);
          else await store.append(id, grounded);
          await store.finish(id, { status: "done", source: "retrieval", sources, result: { body: grounded } });
          return { source: "retrieval", sources };
        }
      }
      // A real answer includes the empty-memory sentence for a decision question.
      // The friendly failure sentence is not an answer, so the daily charge is returned.
      if ((result.used || wrote) && streamed && streamed !== ASK_UNAVAILABLE) {
        await store.finish(id, { status: "done", source: "openrouter", sources });
        return { source: "openrouter", sources };
      }
      // Every configured model failed, or the only text is the failure sentence.
      // Do not substitute tool protocol, and do not append the sentence twice.
      if (streamed !== ASK_UNAVAILABLE) await store.append(id, ASK_UNAVAILABLE);
      await store.finish(id, { status: "done", source: "unavailable", sources, result: { body: ASK_UNAVAILABLE } });
      return { source: "unavailable", sources };
    }
    const answer = typeof input.retrieval === "function" ? await input.retrieval() : null;
    const text = scrubAskIds(askFallbackText(question, answer));
    await store.append(id, text);
    const source = text === ASK_UNAVAILABLE ? "unavailable" : "retrieval";
    await store.finish(id, { status: "done", source, sources, result: { body: text } });
    return { source, sources };
  } catch {
    try {
      await store.finish(id, { status: "error" });
    } catch {
      // The reader marks a silent stream stopped after STALE_MS.
    }
    return { source: "error", sources: [] };
  }
}
