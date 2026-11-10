/** Hold after the latest finished piece, and after one that still ends on a dangling word. */
export const FINISHED_HOLD_MS = 1200;
export const UNFINISHED_HOLD_MS = 2500;

/** How long the same person can continue without saying the name again. */
export const CONVERSATION_MS = 20_000;

const UNFINISHED_TAIL = new Set(["about", "the", "and", "what", "who", "when", "where", "why", "how", "which"]);

const ANCHORS = new Set(
  "a an the i you we they he she it my your our me us is am are was were be been being do does did not no yes can could should would will to of in on for at and or but if so this that with from just now what who when where why how which im ill ok okay here done sure got it"
    .split(/\s+/),
);

const VIETNAMESE_MARK = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function wordsOf(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function lineLooksUnfinished(text) {
  const value = String(text || "").trim();
  if (!value || value.endsWith("?")) return false;
  const words = wordsOf(value.replace(/[.,!]+$/g, ""));
  return UNFINISHED_TAIL.has(words[words.length - 1] || "");
}

export function lineHoldMs(text) {
  return lineLooksUnfinished(text) ? UNFINISHED_HOLD_MS : FINISHED_HOLD_MS;
}

function splitSentences(text) {
  const value = String(text || "")
    .replace(/…/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return [];
  const parts = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function hasForeignScript(text) {
  return /[^\p{Script=Latin}\p{N}\s.,!?;:'’"()\-–—/]/u.test(String(text || ""));
}

export function isEnglishSentence(sentence) {
  const value = String(sentence || "").trim();
  if (!value || VIETNAMESE_MARK.test(value) || hasForeignScript(value)) return false;
  const words = wordsOf(value);
  if (!words.length) return false;
  if (words.length === 1) return words[0].length >= 2;
  const anchors = words.filter((word) => ANCHORS.has(word)).length;
  if (words.length <= 5 && anchors >= 1) return true;
  return anchors >= 2;
}

function isHearSentence(sentence) {
  const folded = wordsOf(sentence).join(" ");
  return folded === "yes i can hear you" || folded === "i can hear you" || folded === "yes i can hear you yes";
}

function withoutHearPhrase(sentence) {
  return sentence
    .replace(/\b(?:yes[\s,]*)?i[\s,]*can[\s,]*hear[\s,]*you(?:[\s,]*yes)?\b/gi, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/^[,\s]+/g, "")
    .replace(/[,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipSpoken(text, options = {}) {
  const sentences = splitSentences(text);
  const kept = [];
  for (const sentence of sentences) {
    if (isHearSentence(sentence)) {
      if (sentences.length > 1 || options.priorHear === true) continue;
      const line = sentence.replace(/\s+/g, " ").trim();
      if (!isEnglishSentence(line)) continue;
      kept.push(line);
      if (kept.length === 2) break;
      continue;
    }
    const cleaned = withoutHearPhrase(sentence);
    if (!cleaned || isHearSentence(cleaned) || !isEnglishSentence(cleaned)) continue;
    kept.push(cleaned);
    if (kept.length === 2) break;
  }
  return kept.join(" ");
}

export function finishSpokenReply(text, _memory, options = {}) {
  return clipSpoken(String(text || ""), options);
}

function roomMemory(session, roomId) {
  if (!session || !roomId) return null;
  if (!session.meetingMemory || typeof session.meetingMemory !== "object") session.meetingMemory = {};
  if (!session.meetingMemory[roomId]) session.meetingMemory[roomId] = { lines: [], exchanges: [] };
  return session.meetingMemory[roomId];
}

export function rememberMeetingLine(session, roomId, line) {
  const room = roomMemory(session, roomId);
  const text = String(line?.text || "").replace(/\s+/g, " ").trim();
  if (!room || !text) return;
  room.lines.push({
    speaker: String(line?.speaker || "Someone").trim().slice(0, 80) || "Someone",
    text: text.slice(0, 2000),
  });
  room.lines = room.lines.slice(-12);
  keepRoomTranscript(session, roomId, line);
}

/** Append one final line onto the meeting room already open in this process. */
export function keepRoomTranscript(session, roomId, line) {
  const stored = Array.isArray(session?.rooms) ? session.rooms.find((item) => item?.id === roomId) : null;
  const text = String(line?.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!stored || !text) return;
  const speaker = String(line?.speaker || "Someone").trim().slice(0, 80) || "Someone";
  const lines = Array.isArray(stored.lines) ? stored.lines : [];
  const last = lines[lines.length - 1];
  if (last && last.text === text && last.speaker === speaker) return;
  const start = Number.isFinite(line?.start) ? line.start : (Number.isFinite(last?.end) ? last.end : lines.length);
  const end = Number.isFinite(line?.end) && line.end >= start ? line.end : start;
  lines.push({ speaker, text, start, end });
  stored.lines = lines.slice(-400);
}

export function rememberMeetingExchange(session, roomId, exchange) {
  const room = roomMemory(session, roomId);
  const user = String(exchange?.user || "").replace(/\s+/g, " ").trim();
  const assistant = String(exchange?.assistant || "").replace(/\s+/g, " ").trim();
  if (!room || (!user && !assistant)) return;
  room.exchanges.push({ user: user.slice(0, 1000), assistant: assistant.slice(0, 500) });
  room.exchanges = room.exchanges.slice(-3);
  const stored = Array.isArray(session?.rooms) ? session.rooms.find((item) => item?.id === roomId) : null;
  if (stored) stored.exchanges = room.exchanges.slice(-3);
}

function storedLines(session, roomId) {
  const room = Array.isArray(session?.rooms) ? session.rooms.find((item) => item?.id === roomId) : null;
  return Array.isArray(room?.lines) ? room.lines : [];
}

function storedExchanges(session, roomId) {
  const room = Array.isArray(session?.rooms) ? session.rooms.find((item) => item?.id === roomId) : null;
  return Array.isArray(room?.exchanges) ? room.exchanges : [];
}

export function meetingContext(session, roomId) {
  const room = session?.meetingMemory?.[roomId];
  const lines = [];
  const seen = new Set();
  const push = (line) => {
    const text = String(line?.text || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const speaker = String(line?.speaker || "Someone").trim().slice(0, 80) || "Someone";
    const key = `${speaker.toLowerCase()}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ speaker, text });
  };
  for (const line of storedLines(session, roomId)) push(line);
  for (const line of room?.lines || []) push(line);
  const exchanges = (Array.isArray(room?.exchanges) && room.exchanges.length
    ? room.exchanges
    : storedExchanges(session, roomId)
  ).slice(-3);
  return {
    lines: lines.slice(-12),
    kept: lines.slice(-400),
    exchanges,
  };
}
