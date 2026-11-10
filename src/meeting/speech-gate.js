/** Hold after a finished transcript line, and after one that still looks unfinished. */
export const FINISHED_HOLD_MS = 800;
export const UNFINISHED_HOLD_MS = 2200;

/** How long the same person can continue without saying the name again. */
export const CONVERSATION_MS = 20_000;

export const WAKE_ACK = "Hey! What do you need?";
export const HEAR_LINE = "Yes, I can hear you.";

const UNFINISHED_TAIL = new Set(["about", "the", "what", "who", "when", "where", "why", "how", "which"]);

const KNOWN_WORDS = new Set(
  "a an the i you we they he she it my your our me us is am are was were be been being do does did not no yes can could should would will to of in on for at and or but if so this that with from just now what who when where why how which got ready help take hear hey need needs done write ran approval before ill ill send okay waiting could answer launch thursday booth yes im here"
    .split(/\s+/)
    .concat(["i'll", "ill"]),
);

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

export function scheduleMeetingSpeech(queue, line, now) {
  const clock = Number(now) || 0;
  if (!queue || line?.partial) return { release: false, holdMs: 0, generation: 0 };
  const text = String(line?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return { release: false, holdMs: 0, generation: 0 };
  const holdMs = lineHoldMs(text);
  const wake = isBareWake(text, line?.name);
  queue.seq = (queue.seq || 0) + 1;
  const item = {
    id: String(line?.id || queue.seq),
    text,
    due: clock + holdMs,
    wake,
    generation: queue.seq,
  };
  const items = Array.isArray(queue.items) ? queue.items : [];
  queue.items = items.filter((row) => row && (row.wake || row.due <= clock));
  queue.items.push(item);
  return { release: true, holdMs, generation: item.generation };
}

export function claimMeetingSpeech(queue, generation, now) {
  if (!queue || !generation) return null;
  const clock = Number(now) || 0;
  const items = Array.isArray(queue.items) ? queue.items : [];
  const mine = items.find((row) => row && row.generation === generation && row.due <= clock) || null;
  if (!mine) return null;
  queue.items = items.filter((row) => row !== mine);
  return mine;
}

function splitSentences(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  const parts = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function knownCount(sentence) {
  const words = wordsOf(sentence);
  let known = 0;
  for (const word of words) if (KNOWN_WORDS.has(word)) known += 1;
  return { words, known };
}

export function isEnglishSentence(sentence) {
  const { words, known } = knownCount(sentence);
  if (!words.length || known === 0) return false;
  if (words.length === 1) return known === 1 && words[0].length >= 3;
  return known >= 2;
}

function isHearSentence(sentence) {
  const folded = wordsOf(sentence).join(" ");
  return folded === "yes i can hear you" || folded === "i can hear you" || folded === "yes i can hear you yes";
}

export function clipSpoken(text, options = {}) {
  if (options.presence === "wake") return WAKE_ACK;
  if (options.presence === "hear") return HEAR_LINE;
  const sentences = splitSentences(text);
  const kept = [];
  for (const sentence of sentences) {
    if (isHearSentence(sentence) && (sentences.length > 1 || options.priorHear === true)) continue;
    if (!isEnglishSentence(sentence)) continue;
    kept.push(sentence.replace(/\s+/g, " ").trim());
    if (kept.length === 2) break;
  }
  return kept.join(" ");
}

function memoryBlob(memory) {
  const lines = Array.isArray(memory?.kept) ? memory.kept : (Array.isArray(memory?.lines) ? memory.lines : []);
  const exchanges = Array.isArray(memory?.exchanges) ? memory.exchanges : [];
  return [
    ...lines.map((line) => `${line?.speaker || ""} ${line?.text || ""}`),
    ...exchanges.map((row) => `${row?.user || ""} ${row?.assistant || ""}`),
  ].join("\n").toLowerCase();
}

const ASK_AGAIN = /what time|when should|who should i invite|what about the meeting|who to invite|who should be invited/i;
const HAS_TIME = /\b7\s*pm\b|\b7pm\b|at 7 pm|at 7pm/;
const HAS_INVITE = /invite me only|invite only me|invite only you|only you/;

export function memoryHasPlan(memory) {
  const blob = memoryBlob(memory);
  return HAS_TIME.test(blob) && HAS_INVITE.test(blob);
}

export function replyAsksAgain(text, memory) {
  if (!memoryHasPlan(memory)) return false;
  return ASK_AGAIN.test(String(text || ""));
}

export function finishSpokenReply(text, memory, options = {}) {
  let source = String(text || "");
  if (memoryHasPlan(memory)) {
    source = splitSentences(source).filter((sentence) => !ASK_AGAIN.test(sentence)).join(" ");
  }
  return clipSpoken(source, options);
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
