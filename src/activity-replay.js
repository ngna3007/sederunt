/**
 * Explicit replay and undo for one activity row. Anything not in this table
 * is refused. Nothing here falls through to creating an issue.
 */

import { toUtcIso } from "./instant.js";

export { toUtcIso } from "./instant.js";

const TABLE = {
  "linear:move": { replay: "updateIssue", undo: "updateIssue" },
  "linear:label": { replay: "addLabel", undo: "removeLabel" },
  "linear:assign": { replay: "assignIssue", undo: "assignIssue" },
  "linear:create": { replay: "createIssue", undo: "" },
  "calendar:move": { replay: "update_event", undo: "update_event" },
  "calendar:reschedule": { replay: "update_event", undo: "update_event" },
  "slack:post": { replay: "postMessage", undo: "" },
};

/**
 * Whether the table has an inverse or a replay for this pair. Undo and Retry
 * are shown only when this is true.
 *
 * @param {{ verb?: string, target?: { system?: string } }} event
 * @param {"replay" | "undo"} direction
 */
export function replaySupported(event, direction) {
  const system = event?.target?.system || "";
  const verb = event?.verb || "";
  const row = TABLE[`${system}:${verb}`];
  if (!row) return false;
  return Boolean(direction === "undo" ? row.undo : row.replay);
}

/**
 * Method names the production adapters must export. `unassignIssue` is the
 * assign inverse when the previous assignee is empty. Calendar reads go
 * through `readEvent` and writes through `call`.
 */
export function methodsReferenced() {
  const linear = new Set(["unassignIssue"]);
  const calendar = new Set(["readEvent"]);
  for (const [key, row] of Object.entries(TABLE)) {
    const system = key.slice(0, key.indexOf(":"));
    for (const method of [row.replay, row.undo]) {
      if (!method) continue;
      if (system === "linear") linear.add(method);
      if (system === "calendar") calendar.add("call");
    }
  }
  return {
    linear: [...linear].sort(),
    calendar: [...calendar].sort(),
  };
}

/**
 * Place a clock on the calendar date of an ISO instant, in `timeZone`.
 * A value that is already ISO is kept. "4 PM" and "4:00 PM" are the clocks
 * this accepts. The caller passes the calendar zone.
 *
 * @param {string} iso
 * @param {string} clock
 * @param {string} [timeZone]
 */
export function clockOnDate(iso, clock, timeZone) {
  const text = String(clock || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return toUtcIso(text);
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return "";
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const mer = (match[3] || "").toLowerCase();
  if (mer === "pm" && hours < 12) hours += 12;
  if (mer === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return "";
  if (!timeZone) return "";
  const wall = wallParts(base, timeZone);
  return zonedTimeToUtc(wall.year, wall.month, wall.day, hours, minutes, timeZone).toISOString();
}

function wallParts(date, timeZone) {
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
  let day = Number(bag.day);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const got = wallParts(new Date(utc), timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const delta = desired - gotAsUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

/**
 * @param {{ verb?: string, target?: { system?: string, id?: string, title?: string }, changes?: { field?: string, from?: string, to?: string }[] }} event
 * @param {"replay" | "undo"} direction
 * @param {{ start?: string, end?: string, timeZone?: string } | null} [observed]
 * @param {string} [timeZone] app calendar zone, used when the event has none
 */
export function replayPlan(event, direction, observed = null, timeZone = "") {
  const system = event?.target?.system || "";
  const verb = event?.verb || "";
  const row = TABLE[`${system}:${verb}`];
  if (!row) return { ok: false, reason: "unsupported" };
  const method = direction === "undo" ? row.undo : row.replay;
  if (!method) return { ok: false, reason: "unsupported" };
  const change = event.changes?.[0] || {};
  const id = event.target?.id || "";
  if (system === "linear" && verb === "move") {
    const state = direction === "undo" ? change.from : change.to;
    if (!id || !state) return { ok: false, reason: "unsupported" };
    return { ok: true, system, method, args: { id, state } };
  }
  if (system === "linear" && verb === "label") {
    const label = change.to || "";
    if (!id || !label) return { ok: false, reason: "unsupported" };
    return { ok: true, system, method, args: { id, label } };
  }
  if (system === "linear" && verb === "assign") {
    if (!id) return { ok: false, reason: "unsupported" };
    if (direction === "undo" && !change.from) {
      return { ok: true, system, method: "unassignIssue", args: { id } };
    }
    const assignee = direction === "undo" ? change.from : change.to;
    if (!assignee) return { ok: false, reason: "unsupported" };
    return { ok: true, system, method: "assignIssue", args: { id, assignee } };
  }
  if (system === "linear" && verb === "create") {
    const title = event.target?.title || "";
    const idempotencyKey = event.requestId || event.id || "";
    if (!title || !idempotencyKey) return { ok: false, reason: "unsupported" };
    return { ok: true, system, method, args: { title, idempotencyKey } };
  }
  if (system === "calendar") {
    const zone = observed?.timeZone || timeZone || "";
    if (!zone) return { ok: false, reason: "unsupported" };
    const liveStart = observed?.start || "";
    const liveEnd = observed?.end || "";
    const duration = Date.parse(liveEnd) - Date.parse(liveStart);
    if (!liveStart || !Number.isFinite(duration) || duration <= 0) return { ok: false, reason: "unsupported" };
    const wanted = direction === "undo" ? (change.from || liveStart) : (change.to || liveStart);
    const start = clockOnDate(liveStart, wanted, zone);
    if (!start) return { ok: false, reason: "unsupported" };
    const end = new Date(Date.parse(start) + duration).toISOString();
    return {
      ok: true,
      system,
      method,
      args: { id, title: event.target?.title || "", start, end, timeZone: zone },
      from: toUtcIso(liveStart),
      to: toUtcIso(start),
    };
  }
  if (system === "slack" && verb === "post" && direction === "replay") {
    const body = (event.changes || []).find((change) => change?.field === "body")?.to || "";
    const channel = slackChannel(event);
    if (!channel) return { ok: false, reason: "unsupported" };
    return {
      ok: true,
      system,
      method,
      args: { channel, text: body || event.target?.title || "" },
    };
  }
  return { ok: false, reason: "unsupported" };
}

/** A Slack channel id stored on the target. A room name is not a channel. */
function slackChannel(event) {
  const direct = channelId(event?.target?.channel);
  if (direct) return direct;
  const noted = (event?.changes || []).find((change) => change?.field === "channel");
  const fromChange = channelId(noted?.to);
  if (fromChange) return fromChange;
  return channelId(event?.target?.id);
}

function channelId(value) {
  const text = String(value || "").trim();
  return /^[CDGW][A-Z0-9]{2,}$/.test(text) ? text : "";
}

/**
 * @param {{ linear?: Record<string, Function>, calendar?: { call?: Function, readEvent?: Function }, slack?: Record<string, Function> }} deps
 * @param {{ system: string, method: string, args: object }} plan
 */
export async function runReplay(deps, plan) {
  if (plan.system === "linear") {
    const fn = deps.linear?.[plan.method];
    if (typeof fn !== "function") {
      const error = new Error("unsupported");
      error.reason = "unsupported";
      throw error;
    }
    return fn(plan.args);
  }
  if (plan.system === "calendar") {
    if (typeof deps.calendar?.call !== "function") {
      const error = new Error("unsupported");
      error.reason = "unsupported";
      throw error;
    }
    return deps.calendar.call(plan.method, plan.args);
  }
  if (plan.system === "slack") {
    const fn = deps.slack?.[plan.method];
    if (typeof fn !== "function") {
      const error = new Error("unsupported");
      error.reason = "unsupported";
      throw error;
    }
    return fn(plan.args);
  }
  const error = new Error("unsupported");
  error.reason = "unsupported";
  throw error;
}

/**
 * @param {{ calendar?: { readEvent?: Function } }} deps
 * @param {{ target?: { id?: string, title?: string, system?: string } }} event
 */
export async function readCalendarEvent(deps, event) {
  if (event?.target?.system !== "calendar" || typeof deps.calendar?.readEvent !== "function") return null;
  const read = await deps.calendar.readEvent({ id: event.target.id || "", title: event.target.title || "" });
  if (!read || typeof read.start !== "string") return null;
  return read;
}
