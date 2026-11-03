const TRIP_READ = /what tickets are open for the trip\??/i;
const FILE_TICKET = /file the venue ticket(?:\s+(\S+))?/i;
const FILE_REQUEST = /^file (?:the |a |an )(.+?)[.!]?$/i;
const YES = /^yes[.!]?$/i;
const PRIVATE_NOTE = /^(?:private note|private)\s*:\s*/i;
const CONFIRM = /^confirm\s+(\S+)$/i;
const DISMISS = /^dismiss\s+(\S+)$/i;
const PREFERENCE = /^set\s+(linear|calendar)\s+to\s+(ask|do)(?:\s+in\s+room\s+(\S+))?$/i;
const ROOM_VOICE = /^set voice to (short|plain|formal)(?: in room (\S+))?$/i;
const ROOM_CLASH = /^set clash to (on|off)(?: in room (\S+))?$/i;
const DAY = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const CALENDAR_READ = new RegExp(`what is on (${DAY})`, "i");
const CALENDAR_EDIT = new RegExp(`move the review(?:\\s+to\\s+(${DAY}))?`, "i");
const RECALL = /what was decided|what happened/i;
const ASSIGN = /^assign\s+(.+)$/i;
const CREATE_TICKET = /^create\s+(?:(?:a|one)\s+)?(?:test\s+)?ticket\s+titled\s+["\u201c]?(.+?)["\u201d]?[.!]?$/i;
const ISSUE_ID = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * @param {string} text
 */
export function parseUtterance(text) {
  const trimmed = String(text ?? "").trim();
  const confirm = CONFIRM.exec(trimmed);
  if (confirm) return { type: "confirm", actionId: confirm[1] };
  const dismiss = DISMISS.exec(trimmed);
  if (dismiss) return { type: "dismiss", actionId: dismiss[1] };
  const preference = PREFERENCE.exec(trimmed);
  if (preference) {
    return {
      type: "preference",
      tool: preference[1].toLowerCase(),
      value: preference[2].toLowerCase(),
      roomId: preference[3] || "",
    };
  }
  const voice = ROOM_VOICE.exec(trimmed);
  if (voice) {
    return {
      type: "room-voice",
      voice: voice[1].toLowerCase(),
      roomId: voice[2] || "",
    };
  }
  const clash = ROOM_CLASH.exec(trimmed);
  if (clash) {
    return {
      type: "room-clash",
      raiseClash: clash[1].toLowerCase() === "on",
      roomId: clash[2] || "",
    };
  }
  if (YES.test(trimmed)) return { type: "yes" };
  if (TRIP_READ.test(trimmed)) return { type: "read", tool: "linear" };
  const day = CALENDAR_READ.exec(trimmed);
  if (day) return { type: "read", tool: "calendar", day: capitalize(day[1]) };
  const edit = CALENDAR_EDIT.exec(trimmed);
  if (edit) {
    const named = edit[1] ? capitalize(edit[1]) : "";
    return {
      type: "write",
      tool: "calendar",
      edit: "update",
      statement: trimmed,
      missingFact: named ? "" : "day",
      params: { name: "review", day: named || null },
    };
  }
  if (FILE_REQUEST.test(trimmed) && !FILE_TICKET.test(trimmed)) {
    const title = FILE_REQUEST.exec(trimmed)?.[1]?.trim() || trimmed;
    return {
      type: "write",
      tool: "linear",
      edit: "create",
      statement: trimmed,
      title,
      missingFact: "",
      params: { title },
    };
  }
  if (FILE_TICKET.test(trimmed)) {
    const venue = FILE_TICKET.exec(trimmed)?.[1] || "";
    return {
      type: "write",
      tool: "linear",
      edit: "create",
      statement: trimmed,
      title: trimmed,
      missingFact: venue ? "" : "venue",
      params: { title: trimmed },
    };
  }
  if (RECALL.test(trimmed)) return { type: "recall" };
  const create = CREATE_TICKET.exec(trimmed);
  if (create) {
    return {
      type: "write",
      tool: "linear",
      edit: "create",
      statement: trimmed,
      title: create[1],
      missingFact: "",
      params: { title: create[1] },
    };
  }
  const assignment = ASSIGN.exec(trimmed);
  if (assignment) {
    const owned = /^(.*?)\s+to\s+(\S+)$/i.exec(assignment[1]);
    const owner = owned ? owned[2].replace(/[.!?]+$/, "") : "";
    const target = owned ? owned[1].trim() : "";
    if (owner && ISSUE_ID.test(target)) {
      return {
        type: "write",
        tool: "linear",
        edit: "assign",
        statement: trimmed,
        title: trimmed,
        missingFact: "",
        params: { id: target, assignee: owner },
      };
    }
    return {
      type: "write",
      tool: "linear",
      edit: "create",
      statement: trimmed,
      title: trimmed,
      missingFact: owner ? "" : "owner",
      params: { title: owned ? owned[1] : assignment[1], owner: owner || null },
    };
  }
  return {
    type: "note",
    private: PRIVATE_NOTE.test(trimmed),
    text: trimmed,
  };
}

const OPEN_QUESTION = /^(what|who|when|where|why|how|can|did)\b/i;

/**
 * A meeting question. Recall and calendar or ticket reads are not this:
 * those already have their own parse type.
 *
 * @param {string} text
 */
export function looksLikeOpenQuestion(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  if (/what was decided|what happened/i.test(trimmed)) return false;
  if (CALENDAR_READ.test(trimmed) || TRIP_READ.test(trimmed)) return false;
  return /\?$/.test(trimmed) || OPEN_QUESTION.test(trimmed);
}

function capitalize(word) {
  const lower = String(word).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
