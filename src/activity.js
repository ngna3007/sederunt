import { replaySupported, toUtcIso } from "./activity-replay.js";
import { redact } from "./domain/redact.js";

export { groupActivity, relativeTime, selectActivity } from "./activity-feed.js";

const VERBS = [
  "create", "update", "assign", "unassign", "move", "label", "unlabel",
  "link", "comment", "post", "schedule", "reschedule", "cancel", "join", "leave",
  "call", "read",
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
  call: "called",
  read: "read",
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
  call: "create",
  read: "create",
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
  return collapse(withChanges(fill(template, event, verb), event));
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
      channel: clean(target.channel),
    },
    changes: Array.isArray(input.changes)
      ? input.changes.map((change) => ({
        field: clean(change?.field),
        from: toUtcIso(clean(change?.from)),
        to: toUtcIso(clean(change?.to)),
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
    retryOf: clean(input.retryOf),
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
    room: postedChannel(event) || origin.roomName || "",
    via: via.startsWith("MCP") ? "MCP" : via,
    system: SYSTEMS[target.system] || target.system || "",
    error: event?.error || "",
    word: verb,
    past: PAST[verb] || verb,
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function postedChannel(event) {
  if (event?.target?.system !== "slack") return "";
  const raw = String(
    event?.target?.channel
    || (event?.changes || []).find((change) => change?.field === "channel")?.to
    || "",
  ).trim();
  if (!raw || /^[CDGW][A-Z0-9]{2,}$/.test(raw)) return "";
  return raw.startsWith("#") ? raw : `#${raw.replace(/^#/, "")}`;
}

function withChanges(sentence, event) {
  if (event?.kind === "undo") return undoSentence(event) || sentence;
  if (event?.kind === "failure" && event?.undoOf) return failedUndoSentence(event);
  const skip = event?.verb === "post" || event?.target?.system === "slack"
    ? new Set(["body", "channel"])
    : null;
  const changes = (event?.changes || []).filter((change) => !skip?.has(change?.field));
  const from = event?.kind === "failure" && !failureCovers(event?.verb, changes[0]) ? 0 : 1;
  const extra = changes
    .slice(from)
    .map((change) => changeClause(change, event?.kind))
    .filter(Boolean);
  if (!extra.length) return sentence;
  const clause = ` and ${extra.join(" and ")}`;
  if (event?.kind === "failure") {
    const colon = sentence.lastIndexOf(": ");
    if (colon > 0) return `${sentence.slice(0, colon)}${clause}${sentence.slice(colon)}`;
  }
  const on = sentence.indexOf(" on ");
  if (on > 0) return `${sentence.slice(0, on)}${clause}${sentence.slice(on)}`;
  return `${sentence}${clause}`;
}

/** The failure template already names this change, so it is not a later clause. */
function failureCovers(verb, change) {
  const field = String(change?.field || "");
  if (!field) return true;
  if (verb === "move" || verb === "reschedule" || verb === "schedule") {
    return field === "status" || field === "state" || field === "start";
  }
  if (verb === "assign" || verb === "unassign") return field === "assignee";
  if (verb === "label" || verb === "unlabel") return field === "label";
  if (verb === "post" || verb === "create") return true;
  return false;
}

function failedUndoSentence(event) {
  const actor = event?.actor?.name || "Someone";
  const title = event?.target?.title || event?.target?.id || "it";
  const bits = (event?.changes || []).map(failedUndoBit).filter(Boolean);
  const detail = bits.length ? ` (${bits.join(", ")})` : "";
  const error = event?.error || "The change did not go through.";
  return `${actor} couldn't finish undoing ${title}${detail}: ${error}`;
}

function failedUndoBit(change) {
  const field = String(change?.field || "");
  const from = change?.from || "";
  const to = change?.to || "";
  if ((field === "status" || field === "state") && from) return `move the status back to ${from}`;
  if (field === "assignee" && from) return `assign it back to ${from}`;
  if (field === "assignee") return "clear the assignee";
  if (field === "label") return `remove the label ${to || from}`;
  if (field === "body" || field === "channel") return "";
  if (field === "priority" && from) return `set the priority back to ${from}`;
  if (field === "end" && from) return `set the end time back to ${from}`;
  if (field === "start" && from) return `move the start back to ${from}`;
  if (from) return `set ${field} back to ${from}`;
  return "";
}

function undoSentence(event) {
  const changes = event?.changes || [];
  if (!changes.length) return "";
  const actor = event?.actor?.name || "Someone";
  const title = event?.target?.title || event?.target?.id || "it";
  const bits = changes.map(undoBit).filter(Boolean);
  const detail = bits.length ? ` (${bits.join(", ")})` : "";
  return `${actor} undid the change to ${title}${detail}`;
}

function undoBit(change) {
  const field = String(change?.field || "");
  const from = change?.from || "";
  if ((field === "status" || field === "state") && from) return `status back to ${from}`;
  if (field === "assignee" && from) return `assignee back to ${from}`;
  if (field === "assignee") return "assignee cleared";
  if (field === "label") return `label ${change?.to || from} removed`;
  if (field === "body" || field === "channel") return "";
  if (from) return `${field} back to ${from}`;
  return "";
}

function changeClause(change, kind) {
  const field = String(change?.field || "");
  const to = change?.to || "";
  const from = change?.from || "";
  const base = kind === "request" || kind === "failure";
  if (field === "assignee" && to) return base ? `assign it to ${to}` : `assigned it to ${to}`;
  if (field === "assignee" && from) return base ? `unassign ${from}` : `unassigned ${from}`;
  if ((field === "status" || field === "state") && from && to) return base ? `move it from ${from} to ${to}` : `moved it from ${from} to ${to}`;
  if (field === "label" && to) return base ? `add the label ${to}` : `added the label ${to}`;
  if (field === "label" && from) return base ? `remove the label ${from}` : `removed the label ${from}`;
  if (field === "priority" && to) return base ? `set the priority to ${to}` : `set the priority to ${to}`;
  if (field === "end" && to) return base ? `set the end time to ${to}` : `set the end time to ${to}`;
  if (field === "start" && from && to) return base ? `move the start from ${from} to ${to}` : `moved the start from ${from} to ${to}`;
  if (field === "start" && to) return base ? `set the start to ${to}` : `set the start to ${to}`;
  if (field && from && to) return base ? `set ${field} from ${from} to ${to}` : `set ${field} from ${from} to ${to}`;
  if (field && to) return `set ${field} to ${to}`;
  return "";
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
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
  if (parsed.port && parsed.port !== "443") return "";
  const host = parsed.hostname.toLowerCase();
  if (host !== "linear.app" && !slackHost(host)) return "";
  return `${parsed.origin}${parsed.pathname}`;
}

function slackHost(host) {
  if (host === "slack.com") return true;
  const suffix = ".slack.com";
  if (!host.endsWith(suffix)) return false;
  const label = host.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
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
