/**
 * Room names in a question. The page and the server both use this module.
 * Generic room-name words score as weak so "planning" does not tie two rooms.
 */
export const ROOM_WEAK = new Set(["planning", "review", "sync", "meeting", "room", "crit", "weekly", "daily"]);

const ROOM_STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "at", "about", "what", "was", "were", "decided", "decide", "decision", "decisions", "did", "does", "we", "do", "or", "is", "this", "that", "with", "from"]);

/** Content words in a question. Matching is a whole word, not a prefix. */
export function contentWords(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ROOM_STOP.has(word));
}

function wordHit(question, token) {
  const text = String(token || "").trim().toLowerCase().replace(/^#/, "");
  if (text.length < 3) return false;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(question);
}

function roomTokens(value) {
  return String(value || "").toLowerCase().replace(/^#/, "").split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ROOM_STOP.has(word));
}

function scoreRoom(question, room) {
  const full = typeof room?.name === "string" ? room.name.trim() : "";
  const leading = full.split(":")[0].trim();
  const asked = String(question || "").toLowerCase();
  if (leading && wordHit(asked, leading)) return 100 + leading.length;
  if (full && wordHit(asked, full)) return 100 + full.length;
  if (wordHit(asked, room?.id) || wordHit(asked, room?.channel)) return 80 + String(room?.id || room?.channel || "").length;
  const words = new Set(roomTokens(asked));
  let score = 0;
  for (const word of roomTokens(`${room?.id || ""} ${room?.channel || ""} ${leading}`)) {
    if (words.has(word)) score += ROOM_WEAK.has(word) ? 1 : 5;
  }
  return score;
}

/**
 * Room ids the question names. One clear winner, or every room tied for best.
 *
 * @param {string} text
 * @param {{ id?: string, name?: string, channel?: string }[]} rooms
 */
/**
 * Rooms whose kept text contains a whole word from the question.
 * A prefix such as "plan" does not hit "planning".
 *
 * @param {string} text
 * @param {{ roomId?: string, text?: string, deleted?: boolean }[]} decisions
 */
export function decisionRoomIds(text, decisions) {
  const words = contentWords(text);
  if (!words.length) return [];
  const ids = [];
  for (const decision of decisions || []) {
    if (!decision || decision.deleted || !decision.roomId) continue;
    const blob = String(decision.text || "").toLowerCase();
    if (words.some((word) => wordHit(blob, word)) && !ids.includes(decision.roomId)) ids.push(decision.roomId);
  }
  return ids;
}

const LIVE_ROOM_CALLS = new Set([
  "joining_call",
  "in_waiting_room",
  "in_call_not_recording",
  "in_call_recording",
]);

const ROOM_TEXT_FIELDS = ["startedAt", "recordingStart", "platform", "name", "call", "channel"];

function roomText(value) {
  return typeof value === "string" && value.trim() ? value : "";
}

function roomRecency(room) {
  const when = Date.parse(room?.startedAt || room?.recordingStart || "");
  if (Number.isFinite(when)) return when;
  if (LIVE_ROOM_CALLS.has(room?.call)) return Number.MAX_SAFE_INTEGER;
  return 0;
}

/** Newest start first. A live call with no start ranks as now. Undated finished rooms stay put. */
export function compareRoomsNewestFirst(left, right) {
  return roomRecency(right) - roomRecency(left);
}

function mergeRoomRecord(prior, incoming) {
  const room = { ...prior, ...incoming };
  for (const key of ROOM_TEXT_FIELDS) {
    const nextValue = roomText(incoming?.[key]);
    if (nextValue) room[key] = nextValue;
    else {
      const prevValue = roomText(prior?.[key]);
      if (prevValue) room[key] = prevValue;
    }
  }
  const nextDuration = Number(incoming?.duration);
  const prevDuration = Number(prior?.duration);
  if (nextDuration > 0) room.duration = nextDuration;
  else if (prevDuration > 0) room.duration = prevDuration;
  const nextLines = Array.isArray(incoming?.lines) ? incoming.lines : null;
  const prevLines = Array.isArray(prior?.lines) ? prior.lines : null;
  if (prevLines && (!nextLines || prevLines.length > nextLines.length)) room.lines = prevLines;
  else if (nextLines) room.lines = nextLines;
  return room;
}

/** Incoming rows win field-by-field. A room missing from the later list stays. */
export function mergeRoomLists(prior, incoming) {
  const previous = Array.isArray(prior) ? prior : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const byId = new Map();
  for (const room of previous) {
    if (!room?.id || byId.has(room.id)) continue;
    byId.set(room.id, room);
  }
  const order = [];
  const seen = new Set();
  for (const room of next) {
    if (!room?.id || seen.has(room.id)) continue;
    seen.add(room.id);
    order.push(room.id);
    const old = byId.get(room.id);
    byId.set(room.id, old ? mergeRoomRecord(old, room) : { ...room });
  }
  for (const room of previous) {
    if (!room?.id || seen.has(room.id)) continue;
    seen.add(room.id);
    order.push(room.id);
  }
  return order.map((id) => byId.get(id));
}

export function roomsMatching(text, rooms) {
  const ranked = (rooms || []).map((room) => ({ id: room?.id, score: scoreRoom(text, room) })).filter((room) => room.id && room.score > 0);
  if (!ranked.length) return [];
  ranked.sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!second || best.score >= second.score + 5) return [best.id];
  return ranked.filter((room) => room.score === best.score).map((room) => room.id);
}

function sentenceOf(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function roomTitle(room) {
  const channel = String(room?.channel || "").trim();
  if (channel || /slack/i.test(room?.platform || "")) {
    const raw = channel || String(room?.name || room?.id || "").trim();
    if (!raw) return "Room";
    return raw.startsWith("#") ? raw : `#${raw.replace(/^#/, "")}`;
  }
  const full = String(room?.name || room?.id || "").trim();
  return full.split(":")[0].trim() || "Room";
}

function citeWhen(iso) {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date).replace(/\u202f|\u00a0/g, " ");
}

function clashClock(iso) {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(/\u202f|\u00a0/g, " ");
}

function tidySentence(text) {
  return String(text || "").trim().replace(/[.!?]+$/g, "").trim();
}

function countWord(count) {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return words[count] || String(count);
}

/** One plain sentence from clashing lines. The first side keeps the shared prefix. */
export function clashLead(items) {
  if (!items || items.length < 2) return "";
  const bodies = items.map((item) => tidySentence(item.text));
  const words = bodies.map((body) => body.split(/\s+/).filter(Boolean));
  let shared = 0;
  const limit = Math.min(...words.map((row) => row.length));
  while (shared < limit && words.every((row) => row[shared].toLowerCase() === words[0][shared].toLowerCase())) shared += 1;
  const tails = words.map((row) => row.slice(shared).join(" "));
  const usable = shared >= 3 && tails.every((tail) => tail.length > 0);
  const phrases = items.map((item, index) => {
    let phrase = bodies[index];
    if (usable) {
      phrase = index === 0
        ? `${words[0].slice(0, shared).join(" ")} ${tails[0]}`.replace(/\s+/g, " ").trim()
        : tails[index];
    }
    if (index === 0 && phrase) phrase = phrase.charAt(0).toLowerCase() + phrase.slice(1);
    const who = String(item.speaker || "someone").trim().toLowerCase() || "someone";
    const clock = item.clock || "";
    return clock ? `${phrase} (${who}, ${clock})` : `${phrase} (${who})`;
  });
  const head = `${countWord(items.length)} decisions disagree`;
  if (phrases.length === 2) return `${head}: ${phrases[0]} vs ${phrases[1]}.`;
  return `${head}: ${phrases.slice(0, -1).join("; ")} vs ${phrases[phrases.length - 1]}.`;
}

/**
 * Decisions that answer a question. Sentences stay separate. A room whose
 * kept lines contradict each other says so. A cite names the room and the time.
 *
 * @param {string} question
 * @param {{ text?: string, roomId?: string, spokenAt?: string, status?: string }[]} decisions
 * @param {{ id?: string, name?: string, platform?: string }[]} rooms
 */
export function rankDecisions(question, decisions, rooms) {
  const words = contentWords(question);
  const rows = (decisions || []).filter((decision) => String(decision.text || "").trim());
  if (!rows.length) return { answer: "Nothing is stored that you can read.", detail: "", cites: [] };
  const named = roomsMatching(question, rooms);
  let picked = rows;
  if (named.length) {
    const ids = new Set(named);
    picked = rows.filter((decision) => ids.has(decision.roomId || ""));
    if (!picked.length) return { answer: "Nothing stored matches that.", detail: "", cites: [] };
  } else if (words.length) {
    const roomsHit = {};
    rows.forEach((decision) => {
      const blob = String(decision.text || "").toLowerCase();
      if (words.some((word) => wordHit(blob, word))) roomsHit[decision.roomId || ""] = true;
    });
    picked = rows.filter((decision) => roomsHit[decision.roomId || ""]);
    if (!picked.length) return { answer: "Nothing stored matches that.", detail: "", cites: [] };
  } else {
    picked = rows.slice().sort((a, b) => String(b.spokenAt || "").localeCompare(String(a.spokenAt || ""))).slice(0, 3);
  }
  picked = picked.slice().sort((a, b) => String(b.spokenAt || "").localeCompare(String(a.spokenAt || "")));
  const lines = picked.map((decision) => sentenceOf(decision.text));
  const clash = picked.filter((decision) => decision.status === "clashing").slice().sort((a, b) => String(b.spokenAt || "").localeCompare(String(a.spokenAt || "")));
  if (clash.length > 1) lines.push("These decisions clash.");
  const cites = picked.map((decision) => {
    const room = (rooms || []).find((item) => item?.id === decision.roomId);
    const label = [roomTitle(room), citeWhen(decision.spokenAt)].filter(Boolean).join(" · ");
    const speaker = String(decision.speaker || decision.speakerMemberId || "").trim();
    return {
      roomId: decision.roomId,
      label,
      text: decision.text || "",
      spokenAt: decision.spokenAt || "",
      speaker,
      clock: clashClock(decision.spokenAt),
    };
  });
  const clashItems = clash.map((decision) => {
    const room = (rooms || []).find((item) => item?.id === decision.roomId);
    const speaker = String(decision.speaker || decision.speakerMemberId || "").trim();
    return {
      text: sentenceOf(decision.text),
      when: citeWhen(decision.spokenAt),
      spokenAt: decision.spokenAt || "",
      room: roomTitle(room),
      roomId: decision.roomId || "",
      speaker,
      clock: clashClock(decision.spokenAt),
    };
  });
  return {
    answer: lines.join("\n"),
    detail: "",
    cites,
    clash: clashItems,
    lead: clashLead(clashItems),
  };
}
