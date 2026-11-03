/**
 * Room names in a question. The page and the server both use this module.
 * Generic room-name words score as weak so "planning" does not tie two rooms.
 */
export const ROOM_WEAK = new Set(["planning", "review", "sync", "meeting", "room", "crit", "weekly", "daily"]);

const ROOM_STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "at", "about", "what", "was", "were", "decided", "decide", "decision", "decisions", "did", "does", "we", "do", "or", "is", "this", "that", "with", "from"]);

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
  const full = String(room?.name || room?.channel || room?.id || "").trim();
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

/**
 * Decisions that answer a question. Sentences stay separate. A room whose
 * kept lines contradict each other says so. A cite names the room and the time.
 *
 * @param {string} question
 * @param {{ text?: string, roomId?: string, spokenAt?: string, status?: string }[]} decisions
 * @param {{ id?: string, name?: string, platform?: string }[]} rooms
 */
export function rankDecisions(question, decisions, rooms) {
  const words = String(question || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ROOM_STOP.has(word));
  const rows = (decisions || []).filter((decision) => String(decision.text || "").trim());
  if (!rows.length) return { answer: "Nothing is stored that you can read.", detail: "", cites: [] };
  const named = roomsMatching(question, rooms);
  let picked = rows;
  if (named.length) {
    const ids = new Set(named);
    picked = rows.filter((decision) => ids.has(decision.roomId || ""));
    if (!picked.length) return { answer: "Nothing stored matches that question.", detail: "", cites: [] };
  } else if (words.length) {
    const roomsHit = {};
    rows.forEach((decision) => {
      const blob = String(decision.text || "").toLowerCase();
      if (words.some((word) => wordHit(blob, word))) roomsHit[decision.roomId || ""] = true;
    });
    picked = rows.filter((decision) => roomsHit[decision.roomId || ""]);
    if (!picked.length) return { answer: "Nothing stored matches that question.", detail: "", cites: [] };
  } else {
    picked = rows.slice().sort((a, b) => String(b.spokenAt || "").localeCompare(String(a.spokenAt || ""))).slice(0, 3);
  }
  picked = picked.slice().sort((a, b) => String(b.spokenAt || "").localeCompare(String(a.spokenAt || "")));
  const lines = picked.map((decision) => sentenceOf(decision.text));
  if (picked.filter((decision) => decision.status === "clashing").length > 1) lines.push("These decisions clash.");
  const cites = picked.map((decision) => {
    const room = (rooms || []).find((item) => item?.id === decision.roomId);
    const label = [roomTitle(room), citeWhen(decision.spokenAt)].filter(Boolean).join(" · ");
    return { roomId: decision.roomId, label, text: decision.text || "" };
  });
  return { answer: lines.join("\n"), detail: "", cites };
}
