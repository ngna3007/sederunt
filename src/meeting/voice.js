import { addressesHearing, DEFAULT_HEARING_ALIASES, normalizeHearing } from "../hearing.js";
import { isDeclarativeFact, isQuietKeep } from "./voice-write.js";
import { CONVERSATION_MS } from "./speech-gate.js";

/** A solo line is worth an answer when it asks or requests something. Narration is not. */
export function directRequest(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const folded = value.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  if (!folded) return false;
  if (/^(hmm+|hm+|uh+|um+|er+|ah+)$/.test(folded)) return false;
  if (folded === "okay thanks" || folded === "ok thanks" || folded === "thanks okay" || folded === "okay thank you" || folded === "so yeah" || folded === "let me think") return false;
  if (/\?\s*$/.test(value)) return true;
  return /^(what|when|who|where|why|how|can|could|would|should|do|does|is|are|please|create|remind|note|recall|tell)\b/i.test(value);
}

/**
 * Answer a called line, or the same person while their floor is open.
 * A room with one person and the bot answers that person without the name.
 * Someone else in the room is not a turn. A bare uh-huh, okay, or thanks is not a turn.
 * While a reply is still being composed, only that speaker continues it.
 * The armed room is not a reason to speak.
 *
 * @param {{ hearing?: { name?: string, triggers?: string[] }, hearingHold?: { roomId?: string, until?: number, speaker?: string }, meetingFloor?: { roomId?: string, speaker?: string, until?: number }, meetingCompose?: { roomId?: string, speaker?: string }, meetingDirect?: boolean } | null | undefined} session
 * @param {{ text?: string, addressed?: boolean, room?: { id?: string }, memberId?: string, speakerName?: string } | null | undefined} delivery
 */
export function meetingLineShouldAnswer(session, delivery) {
  const text = String(delivery?.text || "");
  if (!text.trim()) return false;
  const hearing = session?.hearing;
  if (sameGuest(delivery?.speakerName, hearing?.name)) return false;
  if (isBackchannel(text, hearing) || isDismiss(text, hearing)) return false;
  // A keep or a solo-call fact is stored, not answered, even while the floor is open.
  if (isQuietKeep(text)) return false;
  const roomId = typeof delivery?.room?.id === "string" ? delivery.room.id : "";
  const addressed = delivery?.addressed === true || addressesHearing(text, hearing);
  const speaker = speakerKey(delivery);
  const compose = session?.meetingCompose;
  const composing = Boolean(roomId && compose?.roomId === roomId && compose.speaker);
  const direct = session?.meetingDirect === true && directRequest(text);
  if (composing && speaker && speaker !== compose.speaker && !addressed && !direct) return false;
  if (addressed || direct) return true;
  const floor = session?.meetingFloor;
  const floorOpen = Boolean(roomId && floor?.roomId === roomId && floor.speaker && typeof floor.until === "number" && floor.until > Date.now());
  if (!composing && floorOpen && speaker && speaker === floor.speaker) {
    if (session?.meetingDirect === true && isDeclarativeFact(text)) return false;
    return true;
  }
  if (composing && speaker && speaker === compose.speaker) return true;
  const hold = session?.hearingHold;
  const held = Boolean(roomId && hold?.roomId === roomId && typeof hold.until === "number" && hold.until > Date.now());
  if (!held) return false;
  const holdSpeaker = typeof hold?.speaker === "string" ? hold.speaker : "";
  if (speaker && holdSpeaker && speaker !== holdSpeaker) return false;
  if (speaker && floorOpen && speaker !== floor.speaker) return false;
  return true;
}

/**
 * Keep a final line whether or not it is answered. The model can use it later.
 * Partials, the guest's own voice, and a pure backchannel are not stored here.
 *
 * @param {{ hearing?: { name?: string }, roomHeard?: string[] } | null | undefined} session
 * @param {{ text?: string, partial?: boolean, speakerName?: string } | null | undefined} delivery
 */
export function noteMeetingHeard(session, delivery) {
  if (!session || delivery?.partial) return;
  const text = String(delivery?.text || "").replace(/\s+/g, " ").trim();
  if (!text || sameGuest(delivery?.speakerName, session.hearing?.name) || isBackchannel(text, session.hearing)) return;
  const who = String(delivery?.speakerName || "").trim() || "Someone";
  const line = `${who}: ${text}`.slice(0, 180);
  const heard = Array.isArray(session.roomHeard) ? session.roomHeard : [];
  heard.push(line);
  session.roomHeard = heard.slice(-8);
}

/**
 * Thanks from the person on the floor, or thanks that says the name, closes it.
 * Thanks from someone else does not. A partial does not.
 *
 * @param {{ hearing?: { name?: string, triggers?: string[] }, hearingHold?: { roomId?: string, until?: number }, meetingFloor?: { roomId?: string, speaker?: string, until?: number } } | null | undefined} session
 * @param {{ text?: string, partial?: boolean, addressed?: boolean, room?: { id?: string }, memberId?: string, speakerName?: string } | null | undefined} delivery
 */
export function meetingLineClosesFloor(session, delivery) {
  if (!session || delivery?.partial) return false;
  if (sameGuest(delivery?.speakerName, session.hearing?.name)) return false;
  const text = String(delivery?.text || "");
  if (!isDismiss(text, session.hearing)) return false;
  const roomId = typeof delivery?.room?.id === "string" ? delivery.room.id : "";
  if (!roomId) return false;
  const speaker = speakerKey(delivery);
  const floor = session.meetingFloor;
  const owns = Boolean(floor?.roomId === roomId && floor.speaker && speaker && speaker === floor.speaker);
  const addressed = delivery?.addressed === true || addressesHearing(text, session.hearing) || lineNamesGuest(text, session.hearing);
  return owns || addressed;
}

/**
 * The person who just got an answer keeps the floor.
 * A closing thanks also drops the short hold, so the next line needs the name again.
 *
 * @param {{ hearing?: { name?: string, triggers?: string[] }, hearingHold?: { roomId?: string, until?: number }, meetingFloor?: { roomId?: string, speaker?: string, until?: number } } | null | undefined} session
 * @param {{ text?: string, partial?: boolean, addressed?: boolean, room?: { id?: string }, memberId?: string, speakerName?: string } | null | undefined} delivery
 */
export function refreshMeetingFloor(session, delivery) {
  const roomId = typeof delivery?.room?.id === "string" ? delivery.room.id : "";
  if (!session || !roomId || sameGuest(delivery?.speakerName, session.hearing?.name)) return;
  if (isDismiss(delivery?.text, session.hearing)) {
    if (!meetingLineClosesFloor(session, delivery)) return;
    if (session.meetingFloor?.roomId === roomId) delete session.meetingFloor;
    if (session.hearingHold?.roomId === roomId) delete session.hearingHold;
    return;
  }
  if (isBackchannel(delivery?.text, session.hearing)) return;
  const speaker = speakerKey(delivery);
  if (!speaker) return;
  const at = Date.now();
  session.meetingFloor = { roomId, speaker, until: at + CONVERSATION_MS, at };
}

function speakerKey(delivery) {
  const id = String(delivery?.memberId || "").trim();
  if (id) return `id:${id}`;
  const name = String(delivery?.speakerName || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return name ? `name:${name}` : "";
}

function isDismiss(text, hearing) {
  const stripped = phraseResidue(text, hearing);
  if (!stripped || stripped.length > 24) return false;
  return /^(thanks|thank you|that's all|thats all|that is all|never mind|nevermind|goodbye|bye|all good)$/.test(stripped);
}

/** Words left after every name, greeting, and trigger. A real word beside okay or thanks stays. */
function phraseResidue(text, hearing) {
  const heard = normalizeHearing(hearing);
  const phrases = [];
  const push = (value) => {
    const parts = String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length) phrases.push(parts);
  };
  push(heard.name);
  for (const alias of DEFAULT_HEARING_ALIASES) push(alias);
  for (const trigger of heard.triggers) push(trigger);
  phrases.sort((left, right) => right.length - left.length);
  const greetings = new Set(["hey", "hi", "hello"]);
  let tokens = String(text || "").toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
  tokens = tokens.filter((token) => !greetings.has(token.replace(/'/g, "")));
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of phrases) {
      for (let index = 0; index + phrase.length <= tokens.length; index += 1) {
        const slice = tokens.slice(index, index + phrase.length).map((token) => token.replace(/'/g, ""));
        if (!slice.every((part, at) => part === phrase[at])) continue;
        tokens.splice(index, phrase.length);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return tokens.join(" ");
}

function lineNamesGuest(text, hearing) {
  const heard = normalizeHearing(hearing);
  const folded = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  return [heard.name, ...DEFAULT_HEARING_ALIASES].some((name) => {
    const phrase = String(name || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    return Boolean(phrase) && folded.includes(` ${phrase} `);
  });
}

function isBackchannel(text, hearing) {
  const stripped = phraseResidue(text, hearing);
  if (!stripped || stripped.length > 20) return false;
  return /^(uh huh|mm hmm|mmm|mm|yeah|yep|okay|ok|right|sure|got it|makes sense)$/.test(stripped);
}

function sameGuest(speakerName, botName) {
  const speaker = guestLetters(speakerName);
  const bot = guestLetters(botName);
  return Boolean(speaker && bot && speaker === bot);
}

function guestLetters(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
