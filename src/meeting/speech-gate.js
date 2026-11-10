/** Hold after the latest finished piece, and after one that still ends on a dangling word. */
export const FINISHED_HOLD_MS = 1200;
export const UNFINISHED_HOLD_MS = 2500;

/** How long the same person can continue without saying the name again. */
export const CONVERSATION_MS = 20_000;

export const WAKE_ACK = "Hey! What do you need?";
export const HEAR_LINE = "Yes, I can hear you.";

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

export function isBareWake(text, name = "") {
  const bare = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const who = String(name || "").toLowerCase().replace(/[^a-z]/g, "") || "adam";
  if (!bare || bare.length > 40) return false;
  return new RegExp(`^(hey |hi |hello )?${who}$`).test(bare);
}

/** Stable speaker slot. A participant id stays apart from a display name. */
export function speechSpeakerKey(line) {
  const id = String(line?.memberId ?? "").trim();
  if (id) return `id:${id}`;
  const name = String(line?.speakerName || line?.speaker || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return name ? `name:${name}` : "";
}

/** One book per bot. Two meetings on the same team do not share a buffer. */
export function meetingSpeechBook(session, botId) {
  const id = String(botId || "").trim();
  if (!session || typeof session !== "object" || !id) return null;
  if (!session.meetingSpeechBooks || typeof session.meetingSpeechBooks !== "object" || Array.isArray(session.meetingSpeechBooks)) {
    session.meetingSpeechBooks = {};
  }
  if (!session.meetingSpeechBooks[id] || typeof session.meetingSpeechBooks[id] !== "object") {
    session.meetingSpeechBooks[id] = { seq: 0, speakers: {} };
  }
  const book = session.meetingSpeechBooks[id];
  if (!book.speakers || typeof book.speakers !== "object" || Array.isArray(book.speakers)) book.speakers = {};
  return book;
}

/** True while this speaker still has pieces waiting to be claimed. */
export function speechBufferOpen(book, speaker) {
  return Boolean(speaker && book?.speakers?.[speaker]);
}

export function scheduleMeetingSpeech(queue, line, now) {
  const clock = Number(now) || 0;
  if (!queue || line?.partial) return { release: false, holdMs: 0, generation: 0 };
  const text = String(line?.text || "").replace(/\s+/g, " ").trim();
  const speaker = String(line?.speaker || "").trim() || speechSpeakerKey(line);
  if (!text || !speaker) return { release: false, holdMs: 0, generation: 0 };
  const holdMs = lineHoldMs(text);
  if (!queue.speakers || typeof queue.speakers !== "object" || Array.isArray(queue.speakers)) queue.speakers = {};
  queue.seq = (queue.seq || 0) + 1;
  const prior = queue.speakers[speaker];
  const joined = prior ? `${prior.text} ${text}`.replace(/\s+/g, " ").trim().slice(0, 4000) : text;
  const item = {
    id: String(line?.id || queue.seq),
    text: joined,
    due: clock + holdMs,
    wake: isBareWake(joined, line?.name),
    generation: queue.seq,
    speaker,
  };
  queue.speakers[speaker] = item;
  return { release: true, holdMs, generation: item.generation, text: joined };
}

export function claimMeetingSpeech(queue, generation, now) {
  if (!queue || !generation) return null;
  const clock = Number(now) || 0;
  const speakers = queue.speakers && typeof queue.speakers === "object" ? queue.speakers : {};
  const mine = Object.values(speakers).find((row) => row && row.generation === generation && row.due <= clock) || null;
  if (!mine) return null;
  if (speakers[mine.speaker] === mine) delete speakers[mine.speaker];
  return mine;
}

/**
 * Wait out this turn's hold, then take the slot.
 * A timer that fires before the due time waits out the rest, so a cold
 * event loop does not drop the line. A newer piece replaces the slot and
 * this wait returns null.
 *
 * @param {object | null | undefined} book
 * @param {number} generation
 * @param {number} holdMs
 * @param {(ms: number) => Promise<void>} [sleep]
 */
export async function waitForMeetingSpeech(book, generation, holdMs, sleep) {
  const pause = typeof sleep === "function"
    ? sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await pause(Math.max(0, Number(holdMs) || 0));
  const claimed = claimMeetingSpeech(book, generation, Date.now());
  if (claimed?.text) return claimed;
  const speakers = book?.speakers && typeof book.speakers === "object" ? book.speakers : {};
  const pending = Object.values(speakers).find((row) => row && row.generation === generation);
  if (!pending) return null;
  const left = Number(pending.due) - Date.now();
  if (left > 0) await pause(left);
  return claimMeetingSpeech(book, generation, Math.max(Date.now(), Number(pending.due) || 0));
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
  if (options.presence === "wake") return WAKE_ACK;
  if (options.presence === "hear") return HEAR_LINE;
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
