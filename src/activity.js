import { redact } from "./domain/redact.js";

const VERBS = [
  "create", "update", "assign", "unassign", "move", "label", "unlabel",
  "link", "comment", "post", "schedule", "reschedule", "cancel", "join", "leave",
];

const KINDS = new Set(["request", "action", "result", "failure", "undo"]);

const SYSTEMS = {
  linear: "Linear",
  calendar: "Google Calendar",
  slack: "Slack",
  recall: "Recall",
};

const RAW_ID = /^(?:U[A-Z0-9_]{4,}|0x[0-9a-fA-F]{6,}|[0-9a-f]{16,})$/;

/**
 * A display name. A raw account id is not a name.
 *
 * @param {unknown} value
 */
export function displayName(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || RAW_ID.test(text) || text.length > 48) return "Someone";
  if (text.toLowerCase() === "sederunt") return "Sederunt";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PHRASES = {
  assign: {
    request: "{actor} asked to assign {id} {title} to {to}",
    action: "{actor} assigned {id} to {to} via {via}",
    result: "{actor} assigned {id} to {to} via {via}",
    failure: "{actor} couldn't assign {id}: {error}",
    undo: "{actor} undid assigning {id}",
  },
  move: {
    request: "{actor} asked to move {title} to {to}",
    action: "{actor} moved {title} from {from} to {to} on {system} via {via}",
    result: "{actor} moved {title} from {from} to {to} on {system} via {via}",
    failure: "{actor} couldn't move {title}: {error}",
    undo: "{actor} undid moving {title}",
  },
  reschedule: {
    request: "{actor} asked to reschedule {title} to {to}",
    action: "{actor} rescheduled {title} from {from} to {to} on {system} via {via}",
    result: "{actor} rescheduled {title} from {from} to {to} on {system} via {via}",
    failure: "{actor} couldn't reschedule {title}: {error}",
    undo: "{actor} undid rescheduling {title}",
  },
  post: {
    request: "{actor} asked to post {title} in {room}",
    action: "{actor} posted {title} in {room} via {system}",
    result: "{actor} posted {title} in {room} via {system}",
    failure: "{actor} couldn't post {title}: {error}",
    undo: "{actor} undid posting {title}",
  },
  label: {
    request: "{actor} asked to add label {to} to {id} {title}",
    action: "{actor} labelled {id} {title} {to} via {via}",
    result: "{actor} labelled {id} {title} {to} via {via}",
    failure: "{actor} couldn't add label {to}: {error}",
    undo: "{actor} undid labelling {id}",
  },
  create: {
    request: "{actor} asked to create a ticket \"{title}\"",
    action: "{actor} created {id} {title} via {via}",
    result: "{actor} created {id} {title} via {via}",
    failure: "{actor} couldn't create {title}: {error}",
    undo: "{actor} undid creating {title}",
  },
};

const GENERIC = {
  request: "{actor} asked to {word} {title}",
  action: "{actor} {past} {title} via {via}",
  result: "{actor} {past} {title} via {via}",
  failure: "{actor} couldn't {word} {title}: {error}",
  undo: "{actor} undid {word} {title}",
};

const PAST = {
  create: "created",
  update: "updated",
  assign: "assigned",
  unassign: "unassigned",
  move: "moved",
  label: "labelled",
  unlabel: "removed a label from",
  link: "linked",
  comment: "commented on",
  post: "posted",
  schedule: "scheduled",
  reschedule: "rescheduled",
  cancel: "cancelled",
  join: "joined",
  leave: "left",
};

const ICON = {
  assign: "assign",
  unassign: "assign",
  label: "label",
  unlabel: "label",
  move: "status",
  reschedule: "status",
  update: "status",
  link: "link",
  create: "create",
  comment: "comment",
  post: "comment",
  schedule: "status",
  cancel: "status",
  join: "join",
  leave: "join",
  failure: "error",
  undo: "undo",
};

/**
 * Relative time. Just now, then minutes, hours, days, and weeks.
 *
 * @param {string} ts
 * @param {number} [now]
 */
export function relativeTime(ts, now = Date.now()) {
  const at = Date.parse(ts || "");
  if (Number.isNaN(at)) return "";
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h ago`;
  const day = Math.floor(hour / 24);
  if (day < 14) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

/**
 * The one sentence for an event. Failure ends with Retry. A request names
 * the room before the relative time.
 *
 * @param {ReturnType<typeof activityEvent>} event
 * @param {number} [now]
 */
export function renderActivity(event, now = Date.now()) {
  const kind = KINDS.has(event?.kind) ? event.kind : "action";
  const verb = VERBS.includes(event?.verb) ? event.verb : "create";
  const template = PHRASES[verb]?.[kind] || GENERIC[kind];
  return collapse(fill(template, event, verb));
}

/**
 * Verb icon name, plus the system badge. One map for every integration.
 *
 * @param {{ verb?: string, kind?: string, target?: { system?: string } }} event
 */
export function activityIcon(event) {
  const failed = event?.kind === "failure";
  const verb = failed ? "failure" : (event?.kind === "undo" ? "undo" : event?.verb);
  return {
    icon: ICON[verb] || "create",
    system: event?.target?.system || "",
  };
}

/**
 * Group a feed by requestId. The request row is first. Later rows indent.
 *
 * @param {Array<ReturnType<typeof activityEvent>>} events
 */
export function groupActivity(events) {
  const groups = [];
  const byRequest = new Map();
  for (const event of events || []) {
    const key = event.requestId || event.id;
    let group = byRequest.get(key);
    if (!group) {
      group = { requestId: key, rows: [] };
      byRequest.set(key, group);
      groups.push(group);
    }
    group.rows.push(event);
  }
  for (const group of groups) {
    group.rows.sort((a, b) => stamp(a) - stamp(b) || (a.kind === "request" ? -1 : 1));
    group.latest = group.rows.reduce((max, row) => Math.max(max, stamp(row)), 0);
  }
  groups.sort((a, b) => b.latest - a.latest);
  return groups;
}

/**
 * Keep a whole request together. A room match keeps every row in the group.
 * Search, kind, and actor match rows.
 *
 * @param {Array<ReturnType<typeof activityEvent>>} events
 * @param {{ kind?: string, query?: string, roomId?: string, actor?: string }} [query]
 */
export function selectActivity(events, query = {}) {
  let groups = groupActivity(events);
  const room = String(query.roomId || "");
  if (room) {
    groups = groups.filter((group) => group.rows.some((row) => touches(row, room)));
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
      if (text) {
        const blob = `${renderActivity(row)} ${row.target?.id || ""} ${row.target?.title || ""} ${row.origin?.roomName || ""}`.toLowerCase();
        if (!blob.includes(text)) return false;
      }
      return true;
    }),
  })).filter((group) => group.rows.length);
}

/**
 * Append a new action for a failed event. The failed row stays.
 *
 * @param {{ activity?: unknown[] }} session
 * @param {string} failureId
 */
export function appendRetry(session, failureId) {
  const failed = (session.activity || []).find((row) => row.id === failureId && row.kind === "failure");
  if (!failed) return null;
  return logAction(session, {
    id: `${failureId}:retry:${(session.activity || []).length + 1}`,
    requestId: failed.requestId || failed.id,
    actor: { type: "sederunt", name: "Sederunt", via: failed.actor?.via || "MCP" },
    verb: failed.verb,
    target: failed.target,
    changes: failed.changes,
    tool: failed.tool,
    origin: failed.origin,
    undo: { available: true, until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
  });
}

/**
 * Refuse a secret or a raw account id. Returns the reason, or an empty string.
 *
 * @param {unknown} value
 */
export function activityRefusal(value) {
  const text = JSON.stringify(value ?? {});
  if (redact(text) !== text) return "secret";
  const names = [];
  collectNames(value, names);
  if (names.some((name) => RAW_ID.test(name))) return "raw-id";
  return "";
}

/**
 * Build a safe event. Throws when the input carries a secret or a raw id.
 *
 * @param {Record<string, unknown>} input
 * @param {Date} [now]
 */
export function activityEvent(input, now = new Date()) {
  const refusal = activityRefusal(input);
  if (refusal) {
    const error = new Error("activity refused");
    error.reason = refusal;
    throw error;
  }
  const verb = VERBS.includes(input.verb) ? input.verb : "create";
  const kind = KINDS.has(input.kind) ? input.kind : "action";
  const actor = input.actor && typeof input.actor === "object" ? input.actor : {};
  const target = input.target && typeof input.target === "object" ? input.target : {};
  const origin = input.origin && typeof input.origin === "object" ? input.origin : {};
  const tool = input.tool && typeof input.tool === "object" ? input.tool : {};
  const event = {
    id: clean(input.id),
    requestId: clean(input.requestId),
    ts: typeof input.ts === "string" && input.ts ? input.ts : now.toISOString(),
    kind,
    actor: {
      type: actor.type === "sederunt" || actor.type === "integration" ? actor.type : "person",
      name: clean(actor.name) || "Someone",
      via: clean(actor.via),
    },
    verb,
    target: {
      system: clean(target.system),
      type: clean(target.type),
      id: clean(target.id),
      title: clean(target.title).slice(0, 80),
      url: safeUrl(target.url),
    },
    changes: Array.isArray(input.changes)
      ? input.changes.map((change) => ({
        field: clean(change?.field),
        from: clean(change?.from),
        to: clean(change?.to),
      })).filter((change) => change.field)
      : [],
    tool: { name: clean(tool.name), server: clean(tool.server) },
    origin: {
      roomId: clean(origin.roomId),
      roomName: clean(origin.roomName),
      at: Number.isFinite(origin.at) ? Math.max(0, Math.floor(origin.at)) : null,
      messageUrl: safeUrl(origin.messageUrl),
    },
    outcome: input.outcome === "failed" || input.outcome === "undone" ? input.outcome : "ok",
    error: clean(input.error),
    undo: undoOf(input.undo),
  };
  return event;
}

/**
 * @param {{ activity?: unknown[] }} session
 * @param {Record<string, unknown>} input
 */
export function logRequest(session, input) {
  return pushActivity(session, { ...input, kind: "request", outcome: input.outcome || "ok" });
}

/**
 * @param {{ activity?: unknown[] }} session
 * @param {Record<string, unknown>} input
 */
export function logAction(session, input) {
  return pushActivity(session, { ...input, kind: "action", outcome: input.outcome || "ok" });
}

/**
 * @param {{ activity?: unknown[] }} session
 * @param {Record<string, unknown>} input
 */
export function logResult(session, input) {
  return pushActivity(session, { ...input, kind: "result", outcome: input.outcome || "ok" });
}

/**
 * @param {{ activity?: unknown[] }} session
 * @param {Record<string, unknown>} input
 */
export function logFailure(session, input) {
  return pushActivity(session, { ...input, kind: "failure", outcome: "failed" });
}

/**
 * @param {{ activity?: unknown[] }} session
 * @param {Record<string, unknown>} input
 */
export function logUndo(session, input) {
  const rows = session?.activity || [];
  const prior = rows.find((row) => row.id === input.undoOf)
    || rows.find((row) => row.requestId === input.requestId && (row.kind === "action" || row.kind === "result"));
  if (prior) {
    prior.outcome = "undone";
    if (prior.undo) prior.undo.available = false;
  }
  return pushActivity(session, { ...input, kind: "undo", outcome: "undone" });
}

function pushActivity(session, input) {
  const event = activityEvent(input);
  session.activity ??= [];
  session.activity.push(event);
  return event;
}

function fill(template, event, verb) {
  const change = event?.changes?.[0] || {};
  const target = event?.target || {};
  const origin = event?.origin || {};
  const via = String(event?.actor?.via || "");
  const values = {
    actor: event?.actor?.name || "Someone",
    id: target.id || "",
    title: target.title || "",
    to: change.to || "",
    from: change.from || "",
    room: origin.roomName || "",
    via: via.startsWith("MCP") ? "MCP" : via,
    system: SYSTEMS[target.system] || target.system || "",
    error: event?.error || "",
    word: verb,
    past: PAST[verb] || verb,
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function collapse(text) {
  return text.replace(/\s+/g, " ").replace(" :", ":").trim();
}

function stamp(event) {
  const at = Date.parse(event?.ts || "");
  return Number.isNaN(at) ? 0 : at;
}

function touches(row, room) {
  const origin = row?.origin || {};
  return origin.roomId === room || origin.roomName === room;
}

function originPhrase(event) {
  const name = event?.origin?.roomName || "";
  if (!name) return "";
  if (Number.isFinite(event?.origin?.at)) return `${name} ${clock(event.origin.at)}`;
  return name;
}

function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function undoOf(undo) {
  if (!undo || typeof undo !== "object") return undefined;
  return {
    available: undo.available === true,
    until: typeof undo.until === "string" ? undo.until : "",
  };
}

function safeUrl(url) {
  const text = clean(url);
  if (text.startsWith("https://linear.app/") || text.startsWith("https://slack.com/")) return text.split("?")[0];
  return "";
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectNames(value, names) {
  if (!value || typeof value !== "object") return;
  if (typeof value.name === "string") names.push(value.name);
  if (typeof value.actor === "object") collectNames(value.actor, names);
  if (Array.isArray(value.changes)) {
    for (const change of value.changes) {
      if (typeof change?.from === "string") names.push(change.from);
      if (typeof change?.to === "string") names.push(change.to);
    }
  }
}
