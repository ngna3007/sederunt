/**
 * Explicit replay and undo for one activity row. Anything not in this table
 * is refused. Nothing here falls through to creating an issue.
 */

const TABLE = {
  "linear:move": { replay: "updateIssue", undo: "updateIssue" },
  "linear:label": { replay: "addLabel", undo: "removeLabel" },
  "linear:assign": { replay: "assignIssue", undo: "assignIssue" },
  "calendar:move": { replay: "update_event", undo: "update_event" },
  "calendar:reschedule": { replay: "update_event", undo: "update_event" },
  "slack:post": { replay: "postMessage", undo: "" },
};

/**
 * Place a clock on the date of an ISO instant. A value that is already ISO
 * is kept. "4 PM" and "4:00 PM" are the clocks this accepts.
 *
 * @param {string} iso
 * @param {string} clock
 */
export function clockOnDate(iso, clock) {
  const text = String(clock || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return "";
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const mer = (match[3] || "").toLowerCase();
  if (mer === "pm" && hours < 12) hours += 12;
  if (mer === "am" && hours === 12) hours = 0;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hours, minutes, 0)).toISOString();
}

/**
 * @param {{ verb?: string, target?: { system?: string, id?: string, title?: string }, changes?: { field?: string, from?: string, to?: string }[] }} event
 * @param {"replay" | "undo"} direction
 * @param {{ start?: string, end?: string } | null} [observed]
 */
export function replayPlan(event, direction, observed = null) {
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
  if (system === "calendar") {
    const live = observed?.start || "";
    const wanted = direction === "undo" ? (change.from || live) : change.to;
    const start = clockOnDate(live || wanted, wanted);
    if (!start) return { ok: false, reason: "unsupported" };
    const endDate = new Date(start);
    endDate.setHours(endDate.getHours() + 1);
    return {
      ok: true,
      system,
      method,
      args: { id, title: event.target?.title || "", start, end: endDate.toISOString() },
      from: live || change.from || "",
      to: start,
    };
  }
  if (system === "slack" && verb === "post" && direction === "replay") {
    return { ok: true, system, method, args: { channel: event.origin?.roomName || "", text: event.target?.title || "" } };
  }
  return { ok: false, reason: "unsupported" };
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
