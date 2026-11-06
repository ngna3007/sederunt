import { createHash } from "node:crypto";
import { contentWords } from "../room-match.js";

const PREFER = /^prefer\s+(.+)$/i;
const CORRECTION = /^(?:no|actually|correction)[:,]?\s+(.+)$/i;

/**
 * A spoken preference or correction. Tool ask/do preferences stay on their own path.
 * @param {string} text
 */
export function parseLearnedUtterance(text) {
  const trimmed = String(text ?? "").trim();
  const prefer = PREFER.exec(trimmed);
  if (prefer?.[1]?.trim()) return { kind: "team-preference", text: prefer[1].trim() };
  const correction = CORRECTION.exec(trimmed);
  if (correction?.[1]?.trim()) return { kind: "correction", text: correction[1].trim() };
  return null;
}

export function learnedKey(kind, text) {
  const hash = createHash("sha256").update(String(text)).digest("hex").slice(0, 24);
  return `learned:${kind}:${hash}`;
}

/**
 * Memories shape the answer only when a correction replaces it or a preference
 * or action item adds a line that is not already there. The why list is the
 * memories that scored, whether or not the words changed.
 *
 * @param {{ question?: string, sentences?: string[], memories?: Array<{ text?: string, at?: string, kind?: string, verified?: string }>, topK?: number }} input
 */
export function shapeAnswer(input = {}) {
  const base = (input.sentences ?? []).map((sentence) => String(sentence ?? "").trim()).filter(Boolean);
  const picked = pickMemories(input.question, input.memories, input.topK ?? 4);
  let text = base.join("\n");
  let replaced = false;
  let appended = false;
  const why = [];
  for (const memory of picked) {
    const line = clip(memory.text, 140);
    why.push({
      text: line,
      at: typeof memory.at === "string" ? memory.at : "",
      kind: memory.kind || "memory",
      verified: memory.verified === "verified" || memory.verified === "unverified" ? memory.verified : "unknown",
      blobId: typeof memory.blobId === "string" ? memory.blobId : "",
      objectId: typeof memory.objectId === "string" ? memory.objectId : "",
      digest: typeof memory.digest === "string" ? memory.digest : "",
      checkpoint: typeof memory.checkpoint === "number" ? memory.checkpoint : null,
    });
    const memoryText = String(memory.text ?? "").trim();
    if (!memoryText) continue;
    if (memory.kind === "correction" && overlaps(input.question, memoryText)) {
      if (text.trim() !== memoryText) {
        text = memoryText;
        replaced = true;
      }
      continue;
    }
    if (text.includes(memoryText)) continue;
    if ((memory.kind === "team-preference" || memory.kind === "action-item") && overlaps(input.question, memoryText)) {
      text = text ? `${text}\n${memoryText}` : memoryText;
      appended = true;
    }
  }
  return { text, why, replaced, appended };
}

export function memoriesFor(session) {
  const rows = [];
  for (const item of session?.learned ?? []) {
    if (!item?.text) continue;
    rows.push({
      text: item.text,
      at: item.at || "",
      kind: item.kind || "memory",
      verified: item.verified || "unknown",
      blobId: typeof item.blobId === "string" ? item.blobId : "",
      objectId: typeof item.objectId === "string" ? item.objectId : "",
      digest: typeof item.digest === "string" ? item.digest : "",
      checkpoint: typeof item.checkpoint === "number" ? item.checkpoint : null,
    });
  }
  for (const decision of session?.decisions ?? []) {
    if (!decision || decision.deleted || decision.account === "personal" || !decision.text) continue;
    rows.push({
      text: decision.text,
      at: decision.spokenAt || "",
      kind: "decision",
      verified: decision.proofStatus || "unknown",
      blobId: typeof decision.blobId === "string" ? decision.blobId : "",
      objectId: typeof decision.objectId === "string" ? decision.objectId : "",
      digest: typeof decision.digest === "string" ? decision.digest : "",
      checkpoint: typeof decision.checkpoint === "number" ? decision.checkpoint : null,
    });
  }
  return rows;
}

function pickMemories(question, memories, topK) {
  const words = contentWords(question);
  const ranked = (memories ?? []).map((memory) => {
    const hay = `${memory?.text ?? ""} ${memory?.kind ?? ""}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (hay.includes(word)) score += 2;
    }
    if (memory?.kind === "correction" && score > 0) score += 5;
    return { memory, score };
  });
  const matched = words.length ? ranked.filter((row) => row.score > 0) : ranked;
  matched.sort((a, b) => b.score - a.score || String(b.memory?.at || "").localeCompare(String(a.memory?.at || "")));
  return matched.slice(0, topK).map((row) => row.memory).filter(Boolean);
}

function overlaps(question, text) {
  const words = contentWords(question);
  if (!words.length) return false;
  const hay = String(text || "").toLowerCase();
  return words.some((word) => hay.includes(word));
}

function clip(value, max) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
