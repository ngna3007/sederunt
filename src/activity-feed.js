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
  const at = (row) => {
    const parsed = Date.parse(row?.ts || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  for (const group of groups) {
    group.rows.sort((a, b) => at(a) - at(b) || (a.kind === "request" ? -1 : 1));
    group.latest = group.rows.reduce((max, row) => Math.max(max, at(row)), 0);
  }
  groups.sort((a, b) => b.latest - a.latest);
  return groups;
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
