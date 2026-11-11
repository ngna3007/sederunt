import { calendarTimeZone } from "../calendar/mcp.js";

const DEFAULT_DURATION_MIN = 30;
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const LEAD = /^(?:(?:hey|hi|ok|okay|please|so)[,.\s]+)*(?:(?:adam|maple)\b[,.\s]*)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?/i;
const SCHEDULE_VERB = /^(?:schedule|set\s+up|setup)\s+(?:a|an|the)\s+/i;
const BOOK_VERB = /^(?:book)\s+(?:a|an|the)\s+(?=(?:meeting|call|sync|event|appointment|standup)\b)/i;
const TIME_AT = /(?:\b(?:at|@)\s*)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i;
const TIME_BARE = /\b(\d{1,2})(?::(\d{2}))\s*(a\.?m\.?|p\.?m\.?)?\b/i;
const TIME_AMPM = /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i;
const DAY_WORD = /\b(today|tomorrow|tonight)\b/i;
const WEEKDAY = /\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
const DATE_MD = /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

/**
 * A spoken request to create a calendar event, with a title and optional start.
 * Time is interpreted in `timeZone` (default Asia/Ho_Chi_Minh, same as Asia/Saigon).
 *
 * @param {string} text
 * @param {{ now?: Date, timeZone?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ title: string, start: string, end: string, timeZone: string, missing: string } | null}
 */
export function parseScheduleUtterance(text, options = {}) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  value = value.replace(LEAD, "");
  let body = "";
  const booked = BOOK_VERB.exec(value);
  const scheduled = SCHEDULE_VERB.exec(value);
  if (scheduled) body = value.slice(scheduled[0].length).trim();
  else if (booked) body = value.slice(booked[0].length).trim();
  else return null;
  body = body.replace(/[.!?]+$/g, "").trim();
  if (!body) return null;

  const timeZone = String(options.timeZone || calendarTimeZone(options.env) || "Asia/Ho_Chi_Minh");
  const now = options.now instanceof Date ? options.now : new Date();
  const when = readWhen(body, now, timeZone);
  const title = eventTitle(when.rest || body);
  const missing = when.start ? "" : "when";
  if (!when.start) return { title: title || "Meeting", start: "", end: "", timeZone, missing };
  const end = addMinutesIso(when.start, DEFAULT_DURATION_MIN, timeZone);
  return { title: title || "Meeting", start: when.start, end, timeZone, missing: "" };
}

/**
 * A reply to "When should it be?" — a day and time, without a schedule verb.
 * @param {string} text
 * @param {{ now?: Date, timeZone?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function parseWhenAnswer(text, options = {}) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  value = value.replace(LEAD, "");
  value = value.replace(/^(?:(?:it should be|make it|set it(?: for| to)?|put it|schedule it)\b[,:\s]*)/i, "");
  value = value.replace(/[.!?]+$/g, "").trim();
  if (!value) return null;
  const timeZone = String(options.timeZone || calendarTimeZone(options.env) || "Asia/Ho_Chi_Minh");
  const now = options.now instanceof Date ? options.now : new Date();
  const when = readWhen(value, now, timeZone);
  if (!when.start) return { start: "", end: "", timeZone, missing: "when" };
  return { start: when.start, end: addMinutesIso(when.start, DEFAULT_DURATION_MIN, timeZone), timeZone, missing: "" };
}

/** True when the speaker asked to schedule, book, or set up a meeting. */
export function isScheduleRequest(text) {
  return parseScheduleUtterance(text) != null;
}

/**
 * A spoken confirmation after a calendar event is created.
 * @param {{ title?: string, start?: string, timeZone?: string, now?: Date }} input
 */
export function scheduledVoiceLine(input = {}) {
  const title = String(input.title || "").replace(/['"]/g, "").replace(/\s+/g, " ").trim() || "the meeting";
  const start = String(input.start || "").trim();
  const timeZone = String(input.timeZone || "Asia/Ho_Chi_Minh");
  const now = input.now instanceof Date ? input.now : new Date();
  if (!start) return `I scheduled ${title}.`;
  const when = formatWhen(start, timeZone, now);
  return when ? `I scheduled ${title} for ${when}.` : `I scheduled ${title}.`;
}

function eventTitle(body) {
  let value = String(body || "").replace(/\s+/g, " ").trim();
  value = stripWhenWords(value);
  value = value.replace(/^(?:called|titled|named)\s+/i, "");
  value = value.replace(/\b(?:meeting|call|event|appointment|standup)\s*$/i, "").trim();
  if (!value) {
    const fallback = String(body || "").replace(/\s+/g, " ").trim();
    const named = /\b((?:meeting|call|sync|event|appointment|standup))\b/i.exec(fallback);
    value = named ? capitalize(named[1]) : "Meeting";
  }
  return capitalize(value).slice(0, 120);
}

function stripWhenWords(value) {
  let text = String(value || "");
  text = text.replace(DATE_MD, " ");
  text = text.replace(WEEKDAY, " ");
  text = text.replace(DAY_WORD, " ");
  text = text.replace(TIME_AT, " ");
  text = text.replace(TIME_AMPM, " ");
  text = text.replace(TIME_BARE, " ");
  text = text.replace(/\b(?:at\s+)?noon\b/gi, " ");
  text = text.replace(/\b(?:next|this|coming)\b(?=\s*$|\s+(?:at|on|for)\b)/gi, " ");
  text = text.replace(/\b(?:next|this|coming)\s*$/gi, " ");
  text = text.replace(/\b(?:at|on|for|starting)\b/gi, " ");
  return text.replace(/\s+/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
}

function readWhen(body, now, timeZone) {
  const rest = body;
  const clock = readClock(body);
  const day = readDay(body, now, timeZone);
  if (!clock) return { start: "", rest: stripWhenWords(rest) };
  if (!day && !DAY_WORD.test(body) && !WEEKDAY.test(body) && !DATE_MD.test(body) && !/\btoday\b|\btomorrow\b|\btonight\b/i.test(body)) {
    // A time with no day is today if it is still ahead, otherwise tomorrow.
    const today = localParts(now, timeZone);
    const candidate = zonedIso(timeZone, today.year, today.month, today.day, clock.hour, clock.minute);
    const startMs = Date.parse(candidate);
    const start = !Number.isNaN(startMs) && startMs <= now.getTime()
      ? shiftDay(today, 1, timeZone, clock)
      : candidate;
    return { start, rest: stripWhenWords(rest) };
  }
  let parts = day || localParts(now, timeZone);
  const named = WEEKDAY.exec(body);
  if (named && !/\bnext\s+(?:week\s+)?(?:on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(body)) {
    // "Wednesday at 5pm" said on a Wednesday before 5pm is today, not next week.
    const today = localParts(now, timeZone);
    if (WEEKDAYS.indexOf(named[1].toLowerCase()) === today.weekday) {
      const sameDay = zonedIso(timeZone, today.year, today.month, today.day, clock.hour, clock.minute);
      if (Date.parse(sameDay) > now.getTime()) parts = today;
    }
  }
  return { start: zonedIso(timeZone, parts.year, parts.month, parts.day, clock.hour, clock.minute), rest: stripWhenWords(rest) };
}

function readClock(text) {
  if (/\b(?:at\s+)?noon\b/i.test(text)) return { hour: 12, minute: 0 };
  const at = TIME_AT.exec(text);
  const ampm = !at && TIME_AMPM.exec(text);
  const bare = !at && !ampm && TIME_BARE.exec(text);
  const match = at || ampm || bare;
  if (!match) return null;
  let hour = Number(at ? match[1] : match[1]);
  const minute = Number((at ? match[2] : (bare ? match[2] : "0")) || 0);
  const mer = String((at ? match[3] : (ampm ? match[2] : (bare ? match[3] : ""))) || "").toLowerCase().replace(/\./g, "");
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  if (mer === "am" || mer === "pm") {
    hour %= 12;
    if (mer === "pm") hour += 12;
  } else if (hour >= 1 && hour <= 7) {
    // "at 3" in a work meeting means 3 PM, not 3 AM.
    hour += 12;
  }
  return { hour, minute };
}

function readDay(body, now, timeZone) {
  const local = localParts(now, timeZone);
  if (/\btonight\b/i.test(body) || /\btoday\b/i.test(body)) return local;
  if (/\btomorrow\b/i.test(body)) return shiftParts(local, 1);
  const named = WEEKDAY.exec(body);
  if (named) {
    const want = WEEKDAYS.indexOf(named[1].toLowerCase());
    const delta = (want - local.weekday + 7) % 7 || 7;
    return shiftParts(local, delta);
  }
  const dated = DATE_MD.exec(body);
  if (dated) {
    const month = MONTHS[dated[1].toLowerCase()];
    const day = Number(dated[2]);
    let year = local.year;
    if (month < local.month || (month === local.month && day < local.day)) year += 1;
    return { year, month, day, weekday: 0 };
  }
  return null;
}

function shiftDay(local, days, timeZone, clock) {
  const next = shiftParts(local, days);
  return zonedIso(timeZone, next.year, next.month, next.day, clock.hour, clock.minute);
}

function shiftParts(local, days) {
  const utc = Date.UTC(local.year, local.month - 1, local.day + days);
  const date = new Date(utc);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

function localParts(date, timeZone) {
  const parts = formatParts(date, timeZone);
  const weekdayName = String(parts.weekday || "").toLowerCase();
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(weekdayName)),
  };
}

function formatParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

function tzOffsetMs(utcMillis, timeZone) {
  const parts = formatParts(new Date(utcMillis), timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    0,
  );
  return asUtc - utcMillis;
}

function zonedIso(timeZone, year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = guess - tzOffsetMs(guess, timeZone);
  utc = guess - tzOffsetMs(utc, timeZone);
  const offset = tzOffsetMs(utc, timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const oh = String(Math.floor(abs / 3_600_000)).padStart(2, "0");
  const om = String(Math.floor((abs % 3_600_000) / 60_000)).padStart(2, "0");
  const pad = (value) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${oh}:${om}`;
}

function addMinutesIso(start, minutes, timeZone) {
  const ms = Date.parse(start);
  if (!Number.isFinite(ms)) return "";
  const later = new Date(ms + minutes * 60_000);
  const parts = localParts(later, timeZone);
  return zonedIso(timeZone, parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

function formatWhen(start, timeZone, now) {
  const ms = Date.parse(start);
  if (!Number.isFinite(ms)) return "";
  const at = localParts(new Date(ms), timeZone);
  const today = localParts(now, timeZone);
  const hour12 = at.hour % 12 || 12;
  const mer = at.hour >= 12 ? "PM" : "AM";
  const clock = at.minute ? `${hour12}:${String(at.minute).padStart(2, "0")} ${mer}` : `${hour12} ${mer}`;
  const todayKey = `${today.year}-${today.month}-${today.day}`;
  const atKey = `${at.year}-${at.month}-${at.day}`;
  const tomorrow = shiftParts(today, 1);
  const tomorrowKey = `${tomorrow.year}-${tomorrow.month}-${tomorrow.day}`;
  if (atKey === todayKey) return `today at ${clock}`;
  if (atKey === tomorrowKey) return `tomorrow at ${clock}`;
  const weekday = WEEKDAYS[at.weekday] || "";
  return weekday ? `${capitalize(weekday)} at ${clock}` : `at ${clock}`;
}

function capitalize(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
