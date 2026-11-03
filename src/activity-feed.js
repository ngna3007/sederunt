/**
 * Feed grouping and search. This file has no Node imports so the console
 * can load it as a module.
 */

export function relativeTime(ts, now = Date.now()) {
  const at = Date.parse(ts || "");
  if (Number.isNaN(at)) return "";
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  const min = Math.floor(sec / 60);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h ago`;
  const day = Math.floor(hour / 24);
  if (day < 14) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g;

/**
 * Turn ISO instants in a sentence into clocks in `timeZone`. A pair is
 * `from 2:00 PM to 4:00 PM`. The date is included only when the two instants
 * fall on different dates. A zone abbreviation is added when the viewer's
 * offset at that instant differs from `timeZone`. Aliases such as
 * `Asia/Saigon` and `Asia/Ho_Chi_Minh` share an offset and add nothing.
 *
 * @param {string} sentence
 * @param {string} [timeZone] calendar or viewer zone; omitted means the runtime zone
 * @param {string} [viewerZone]
 * @param {string} [sampleIso] instant used when the sentence is already clocks
 */
export function formatActivitySentence(sentence, timeZone, viewerZone, sampleIso) {
  const text = String(sentence || "");
  const found = text.match(ISO_INSTANT);
  if (!found || !found.length) return placeZoneAfterClock(text, timeZone, viewerZone, sampleIso);
  const zoneNote = zoneAbbreviation(found[0], timeZone, viewerZone);
  if (found.length >= 2) {
    const [left, right] = found;
    const differ = !sameLocalDay(left, right, timeZone);
    const formattedLeft = formatClock(left, timeZone, differ);
    const formattedRight = formatClock(right, timeZone, differ);
    const range = `from ${formattedLeft} to ${formattedRight}${zoneNote}`;
    const fromTo = `from ${left} to ${right}`;
    if (text.includes(fromTo)) return text.replace(fromTo, range);
    return text.replace(left, formattedLeft).replace(right, `${formattedRight}${zoneNote}`);
  }
  return text.replace(found[0], `${formatClock(found[0], timeZone, false)}${zoneNote}`);
}

/** Short zone name, the same label the feed and the timeline use. */
export function zoneShortName(iso, timeZone) {
  if (!timeZone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date(iso));
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function placeZoneAfterClock(text, timeZone, viewerZone, sampleIso) {
  if (!text || !timeZone || !viewerZone || !sampleIso) return text;
  if (!ISO_INSTANT.test(String(sampleIso))) return text;
  if (sameOffset(sampleIso, timeZone, viewerZone)) return text;
  if (/\b(?:GMT|UTC)[+-]\d|\bICT\b/.test(text)) return text;
  const name = zoneShortName(sampleIso, timeZone);
  if (!name) return text;
  const clock = /(?:[A-Z][a-z]{2} \d{1,2}, )?\d{1,2}:\d{2} [AP]M/g;
  let last;
  for (const match of text.matchAll(clock)) last = match;
  if (!last) return text;
  const at = last.index + last[0].length;
  return `${text.slice(0, at)} ${name}${text.slice(at)}`;
}

function zoneAbbreviation(iso, timeZone, viewerZone) {
  if (!timeZone || !viewerZone || sameOffset(iso, timeZone, viewerZone)) return "";
  const name = zoneShortName(iso, timeZone);
  return name ? ` ${name}` : "";
}

function sameOffset(iso, left, right) {
  if (left === right) return true;
  const a = offsetMinutes(iso, left);
  const b = offsetMinutes(iso, right);
  if (a == null || b == null) return false;
  return a === b;
}

function offsetMinutes(iso, timeZone) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const bag = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    let hour = Number(bag.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), hour, Number(bag.minute), Number(bag.second));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

function sameLocalDay(left, right, timeZone) {
  return localDayKey(left, timeZone) === localDayKey(right, timeZone);
}

function localDayKey(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const bag = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function formatClock(iso, timeZone, withDate) {
  const date = new Date(iso);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(/\u202f|\u00a0/g, " ");
  if (!withDate) return clock;
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
  return `${day}, ${clock}`;
}

export function groupActivity(events) {
  const groups = [];
  const byRequest = new Map();
  for (const event of events || []) {
    if (event?.kind === "resolve" || event?.kind === "supersede") continue;
    const key = event.requestId || event.id;
    let group = byRequest.get(key);
    if (!group) {
      group = { requestId: key, rows: [] };
      byRequest.set(key, group);
      groups.push(group);
    }
    group.rows.push(event);
  }
  const at = (row) => {
    const parsed = Date.parse(row?.ts || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const byId = new Map();
  for (const group of groups) {
    for (const row of group.rows) if (row?.id) byId.set(row.id, group);
  }
  for (const group of [...groups]) {
    const stay = [];
    for (const row of group.rows) {
      const home = row?.retryOf ? byId.get(row.retryOf) : null;
      if (home && home !== group) {
        home.rows.push(row);
        if (row.id) byId.set(row.id, home);
      } else stay.push(row);
    }
    group.rows = stay;
  }
  const kept = groups.filter((group) => group.rows.length);
  for (const group of kept) {
    group.rows.sort((a, b) => at(a) - at(b) || (a.kind === "request" ? -1 : 1));
    group.latest = group.rows.reduce((max, row) => Math.max(max, at(row)), 0);
    const request = group.rows.find((row) => row.kind === "request");
    group.opened = request ? at(request) : group.rows.reduce((min, row) => Math.min(min, at(row)), group.latest);
  }
  kept.sort((a, b) => b.opened - a.opened || b.latest - a.latest);
  return kept;
}

export function selectActivity(events, query = {}) {
  let groups = groupActivity(events);
  const room = String(query.roomId || "");
  if (room) {
    groups = groups.filter((group) => group.rows.some((row) => {
      const origin = row?.origin || {};
      return origin.roomId === room || origin.roomName === room;
    }));
  }
  const kind = query.kind && query.kind !== "all" ? query.kind : "";
  const actor = String(query.actor || "").trim().toLowerCase();
  const text = String(query.query || "").trim().toLowerCase();
  if (!kind && !actor && !text) return groups;
  return groups.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => {
      if (kind && row.kind !== kind && !(kind === "action" && row.kind === "result")) return false;
      if (actor && String(row.actor?.name || "").toLowerCase() !== actor) return false;
      if (text && !searchText(row).includes(text)) return false;
      return true;
    }),
  })).filter((group) => group.rows.length);
}

function searchText(row) {
  const change = row.changes?.[0] || {};
  return [
    row.actor?.name, row.verb, row.kind, row.target?.system, row.target?.id, row.target?.title,
    row.origin?.roomName, change.field, change.from, change.to, row.error,
  ].filter(Boolean).join(" ").toLowerCase();
}

function quoteLabel(value) {
  return `\u201c${value}\u201d`;
}

function shownChange(value, zone, viewerZone) {
  const text = value == null ? "" : String(value);
  if (!text) return "";
  return formatActivitySentence(text, zone || undefined, viewerZone || undefined, text);
}

function undoSubject(target) {
  const title = String(target?.title || "").trim();
  const id = String(target?.id || "").trim();
  if (title) return { quoted: quoteLabel(title) };
  if (id) return { quoted: id };
  return { quoted: "it" };
}

function undoClause(change, target, zone, viewerZone) {
  const field = String(change?.field || "");
  const from = shownChange(change?.from, zone, viewerZone);
  const to = shownChange(change?.to, zone, viewerZone);
  const subject = undoSubject(target);
  const id = String(target?.id || "").trim();
  const place = id || subject.quoted;
  if (field === "label" && to) {
    return {
      ask: `Remove label ${quoteLabel(to)} from ${place}?`,
      done: `Removed label ${quoteLabel(to)} from ${place}.`,
    };
  }
  if (field === "label" && from) {
    return {
      ask: `Add label ${quoteLabel(from)} back to ${place}?`,
      done: `Added label ${quoteLabel(from)} back to ${place}.`,
    };
  }
  if (field === "start" && from) {
    return {
      ask: `Move ${subject.quoted} back to ${from}?`,
      done: `Moved ${subject.quoted} back to ${from}.`,
    };
  }
  if (field === "end" && from) {
    return {
      ask: `Move the end of ${subject.quoted} back to ${from}?`,
      done: `Moved the end of ${subject.quoted} back to ${from}.`,
    };
  }
  if (field === "assignee" && from) {
    return {
      ask: `Assign ${place} back to ${from}?`,
      done: `Assigned ${place} back to ${from}.`,
    };
  }
  if (field === "assignee") {
    return {
      ask: `Clear the assignee on ${place}?`,
      done: `Cleared the assignee on ${place}.`,
    };
  }
  if ((field === "status" || field === "state") && from) {
    return {
      ask: `Move ${subject.quoted} back to ${from}?`,
      done: `Moved ${subject.quoted} back to ${from}.`,
    };
  }
  if (field === "priority" && from) {
    return {
      ask: `Set the priority of ${subject.quoted} back to ${from}?`,
      done: `Set the priority of ${subject.quoted} back to ${from}.`,
    };
  }
  if (from) {
    const name = field || "it";
    return {
      ask: `Set ${name} on ${subject.quoted} back to ${from}?`,
      done: `Set ${name} on ${subject.quoted} back to ${from}.`,
    };
  }
  return null;
}

/**
 * Confirm and toast copy for the inverse of one recorded action.
 * Clocks use the calendar zone when the target is a calendar event.
 *
 * @param {{ target?: { id?: string, title?: string, system?: string }, changes?: { field?: string, from?: string, to?: string }[] }} row
 * @param {string} [timeZone]
 * @param {string} [viewerZone]
 */
export function undoPrompt(row, timeZone, viewerZone) {
  const target = row?.target || {};
  const zone = target.system === "calendar" ? (timeZone || viewerZone || "") : (viewerZone || timeZone || "");
  const viewer = viewerZone || timeZone || "";
  const changes = Array.isArray(row?.changes) ? row.changes : [];
  const bits = changes.map((change) => undoClause(change, target, zone, viewer)).filter(Boolean);
  if (!bits.length) {
    const subject = undoSubject(target);
    return { ask: `Undo the change to ${subject.quoted}?`, done: `Undid the change to ${subject.quoted}.` };
  }
  if (bits.length === 1) return bits[0];
  return {
    ask: `${bits.map((bit) => bit.ask.replace(/\?$/, "")).join("; ")}?`,
    done: `${bits.map((bit) => bit.done.replace(/\.$/, "")).join("; ")}.`,
  };
}
