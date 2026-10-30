import { looksLikeOpenQuestion } from "../parse.js";

const RECALL = /what was decided|what happened/i;
const STOP = new Set(["what", "about", "that", "this", "with", "from", "your", "have", "does", "file", "when", "where", "who", "why", "how", "was", "decided", "the", "and", "for"]);

/** The file name a question is about, or an empty string. */
export function replyFile(visible, question) {
  const words = questionWords(question);
  if (words.length === 0) return "";
  for (const row of visible ?? []) {
    if (!row?.fileName) continue;
    const hay = `${row.text ?? ""} ${row.fileName}`.toLowerCase();
    if (words.some((word) => hay.includes(word))) return row.fileName;
  }
  return "";
}

/**
 * Text posted back to Slack. A stored file name is included only when the
 * question is about that file. An unrelated question keeps the other facts.
 */
export function slackAnswer(visible, question, body) {
  const file = replyFile(visible, question);
  if (file) {
    const row = (visible ?? []).find((item) => item?.fileName === file);
    const fact = typeof row?.text === "string" && row.text.trim() ? row.text.trim() : String(body ?? "");
    const text = fact.toLowerCase().includes(file.toLowerCase()) ? fact : `${fact}\n${file}`;
    return { text, file };
  }
  const names = (visible ?? [])
    .map((item) => (typeof item?.fileName === "string" ? item.fileName.trim() : ""))
    .filter(Boolean);
  const text = String(body ?? "")
    .split("\n")
    .filter((line) => !names.some((name) => line.toLowerCase().includes(name.toLowerCase())))
    .join("\n");
  return { text, file: "" };
}

function questionWords(question) {
  return String(question ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
}

/** A Slack message that should be answered, not stored. */
export function slackQuestion(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  return looksLikeOpenQuestion(trimmed) || RECALL.test(trimmed);
}

/**
 * Post one answer into the channel or direct message that asked.
 * The token stays with the caller and is not returned.
 *
 * @param {{ token?: string, fetchImpl?: typeof fetch, channel?: string, text?: string, thread?: string }} input
 */
export async function postSlackReply(input) {
  const token = input.token;
  const channel = input.channel;
  const text = input.text;
  if (!token || !channel || !text) return { posted: false };
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: input.thread || undefined,
    }),
  });
  return { posted: response.ok };
}
