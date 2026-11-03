import { replaySupported } from "./activity-replay.js";
import { redact } from "./domain/redact.js";

export { groupActivity, relativeTime, selectActivity } from "./activity-feed.js";

const VERBS = [
  "create", "update", "assign", "unassign", "move", "label", "unlabel",
  "link", "comment", "post", "schedule", "reschedule", "cancel", "join", "leave",
];

const KINDS = new Set(["request", "action", "result", "failure", "undo", "resolve", "supersede"]);

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
    action: "{actor} added label {to} to {id} {title} via {via}",
    result: "{actor} added label {to} to {id} {title} via {via}",
    failure: "{actor} couldn't add label {to} to {id} {title}: {error}",
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
  resolve: "{actor} resolved {title}",
  supersede: "{actor} superseded {title}",
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
 * The one sentence for an event.
 *
 * @param {ReturnType<typeof activityEvent>} event
 * @param {number} [now]
 */
export function renderActivity(event, now = Date.now()) {
  const kind = KINDS.has(event?.kind) ? event.kind : "action";
  if (kind === "resolve" || kind === "supersede") return "";
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
 * Append a new action for a failed event. The failed row stays.
 *
 * @param {{ activity?: unknown[] }} session
 * @param {string} failureId
 */
/**
 * Why an undo must be refused. Empty means the action can be undone.
 *
 * @param {{ kind?: string, outcome?: string, undo?: { available?: boolean, until?: string } } | null | undefined} event
 * @param {number} [now]
 */
export function undoRefusal(event, now = Date.now()) {
  if (!event) return "missing";
  if (event.kind !== "action" && event.kind !== "result") return "not-action";
  if (event.outcome === "undone") return "already";
  if (!event.undo?.available) return "unavailable";
  const until = Date.parse(event.undo.until || "");
  if (Number.isNaN(until) || until < now) return "expired";
  return "";
}

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
    undo: replaySupported(failed, "undo")
      ? { available: true, until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
      : { available: false, until: "" },
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
    refersTo: clean(input.refersTo),
    undoOf: clean(input.undoOf),
    resolved: input.resolved === true,
    superseded: input.superseded === true,
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
