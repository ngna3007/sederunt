/**
 * Post-meeting action checklist. The model proposes items. Nothing runs
 * until the requester presses Approve in the DM. Edit asks for a change.
 * Skip marks the item skipped. Results go back in that same DM thread.
 *
 * Runtime delivery and approval use the durable coordinator in followups.js.
 * These helpers format messages and adapt writes after the domain allow gate.
 */

import { DEFAULT_BOT_NAME, normalizeBotName } from "../bot/identity.js";
import { callTool as defaultCallTool } from "../connectors/client.js";

export const ACTION_KINDS = Object.freeze(["assign_task", "create_form", "edit_calendar", "other"]);

const TOOL_BY_KIND = {
  assign_task: "create_issue",
  create_form: "create_form",
  edit_calendar: "update_event",
  other: "",
};

export function createMemoryActionStore() {
  const items = new Map();
  return {
    async put(item) {
      items.set(item.id, { ...item });
      return { ...items.get(item.id) };
    },
    async get(id) {
      const item = items.get(id);
      return item ? { ...item } : null;
    },
    async update(id, patch) {
      const current = items.get(id);
      if (!current) return null;
      items.set(id, { ...current, ...patch });
      return { ...items.get(id) };
    },
    async list() {
      return [...items.values()].map((item) => ({ ...item }));
    },
  };
}

export function validateActions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(source.items) ? source.items : null;
  if (!list) return { ok: false, errors: ["items"], items: [] };
  const items = [];
  const errors = [];
  list.forEach((item, index) => {
    const kind = String(item?.kind || "");
    const requester = String(item?.requester || "").trim();
    const summary = String(item?.summary || "").trim();
    const where = String(item?.where || "").trim();
    if (!ACTION_KINDS.includes(kind)) errors.push(`${index}:kind`);
    else if (!requester) errors.push(`${index}:requester`);
    else if (!summary || summary.includes("\n")) errors.push(`${index}:summary`);
    else if (!where) errors.push(`${index}:where`);
    else {
      items.push({
        id: String(item.id || `act-${index + 1}`),
        kind,
        requester,
        requesterSlackId: String(item.requesterSlackId || "").trim(),
        summary,
        where,
        tool: String(item.tool || TOOL_BY_KIND[kind] || "").trim(),
        args: item.args && typeof item.args === "object" ? item.args : {},
        status: "pending",
      });
    }
  });
  return { ok: errors.length === 0, errors, items };
}

export function parseActionJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(raw);
}

/**
 * @param {{ transcript: string, llm: { complete: Function } }} input
 */
export async function extractActions({ transcript, llm, timeoutMs, signal } = {}) {
  const completed = await completeWithin(llm, transcript, timeoutMs, signal);
  if (completed?.timeout) return { ok: false, errors: ["timeout"], items: [] };
  const text = typeof completed === "string" ? completed : completed?.text || "";
  let parsed;
  try {
    parsed = completed?.json && typeof completed.json === "object" ? completed.json : parseActionJson(text);
  } catch {
    return { ok: false, errors: ["json"], items: [] };
  }
  return validateActions(parsed);
}

/** One line: verb + object, and where it will happen. */
export function actionLine(item) {
  const summary = String(item?.summary || "").trim();
  const where = String(item?.where || "").trim();
  if (!where || summary.toLowerCase().includes(where.toLowerCase())) return summary;
  return `${summary} in ${where}`;
}

export function actionChecklistBlocks(items) {
  const blocks = [];
  for (const item of items) {
    const line = actionLine(item);
    blocks.push({
      type: "section",
      block_id: item.id,
      text: { type: "mrkdwn", text: line },
    });
    blocks.push({
      type: "actions",
      block_id: `${item.id}-actions`,
      elements: ["Approve", "Edit", "Skip"].map((label) => ({
        type: "button",
        text: { type: "plain_text", text: label },
        action_id: `${label.toLowerCase()}:${item.id}`,
        value: item.id,
      })),
    });
  }
  return blocks;
}

export function editModal(item) {
  return {
    type: "modal",
    callback_id: `edit:${item.id}`,
    title: { type: "plain_text", text: "Edit action" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: item.id,
    blocks: [
      {
        type: "input",
        block_id: "change",
        label: { type: "plain_text", text: item.tool === "update_event" ? "New event details" : "What should change?" },
        ...(item.tool === "update_event" ? { hint: { type: "plain_text", text: "Use Description: followed by the new description, or Start: and End: followed by times with time zones." } } : {}),
        element: { type: "plain_text_input", action_id: "change", multiline: true },
      },
    ],
  };
}

async function completeWithin(llm, transcript, timeoutMs, signal) {
  const number = Number(timeoutMs);
  const ms = Number.isFinite(number) && number > 0 ? number : 10000;
  let timer;
  let onAbort;
  try {
    return await new Promise((resolve, reject) => {
      const fail = () => reject(Object.assign(new Error("timeout"), { code: "timeout" }));
      timer = setTimeout(fail, ms);
      if (signal) {
        if (signal.aborted) fail();
        else {
          onAbort = fail;
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }
      Promise.resolve(llm.complete({
        messages: [{ role: "user", text: String(transcript || "") }],
        responseFormat: "json",
      })).then(resolve, reject);
    });
  } catch (error) {
    if (error?.code === "timeout") return { timeout: true };
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function groupByRequester(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.requesterSlackId || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * One DM per requester. Items with no Slack id are returned as undelivered
 * and are not posted.
 */
export async function sendActionDms({ items, slack, store, botName }) {
  const undelivered = [];
  const sent = [];
  const username = normalizeBotName(botName) || DEFAULT_BOT_NAME;
  for (const [requesterSlackId, group] of groupByRequester(items)) {
    if (!requesterSlackId) {
      undelivered.push(...group.map((item) => item.id));
      continue;
    }
    for (const item of group) await store.put({ ...item, status: "pending", botName: username });
    const opened = await slack.openConversation({ users: requesterSlackId });
    const channel = opened.channel?.id || opened.channel;
    const blocks = actionChecklistBlocks(group);
    const text = group.map((item) => actionLine(item)).join("\n");
    const posted = await slack.postMessage({ channel, text, blocks, username });
    for (const item of group) {
      await store.update(item.id, { channelId: channel, threadTs: posted.ts, status: "pending" });
    }
    sent.push({ requesterSlackId, channel, ts: posted.ts, itemIds: group.map((item) => item.id) });
  }
  return { sent, undelivered };
}

export function parseActionPayload(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
    const payload = new URLSearchParams(trimmed).get("payload");
    return payload ? JSON.parse(payload) : null;
  }
  if (typeof input.payload === "string") return JSON.parse(input.payload);
  return input;
}

// Legacy callers cannot bypass the durable claim and domain allow gate.
export async function handleActionPayload() {
  return { ok: false, error: "durable_followup_required", ran: false };
}

function linkFrom(text) {
  const match = String(text || "").match(/https:\/\/\S+/);
  return match ? match[0].replace(/[)\].,>]+$/, "") : "";
}

/**
 * Forms and custom tools use the connector `callTool`. Calendar uses the
 * injected calendar port (`updateEventDetails` on the Calendar MCP adapter).
 * Tests pass fakes. This function does not pick a live token on its own.
 */
export async function runApprovedAction(item, ports = {}) {
  const call = ports.callTool || defaultCallTool;
  if (item.kind === "edit_calendar") {
    if (!ports.calendar?.updateEventDetails) {
      return { ok: false, link: "", text: "", next: "Connect Google Calendar, then approve again." };
    }
    try {
      const args = item.args || {};
      const changesTime = typeof args.start === "string" || typeof args.end === "string";
      if (changesTime && (typeof ports.calendar.call !== "function" || !args.start || !args.end
        || !Number.isFinite(Date.parse(args.start)) || !Number.isFinite(Date.parse(args.end))
        || Date.parse(args.start) >= Date.parse(args.end))) {
        return { ok: false, submitted: false, next: "Provide a valid event and start and end times." };
      }
      const updated = changesTime
        ? await ports.calendar.call("update_event", { id: args.id || args.eventId, start: args.start, end: args.end })
        : await ports.calendar.updateEventDetails({ ...args, id: args.id || args.eventId });
      const link = updated?.link || updated?.htmlLink || "";
      if (!updated?.id && !updated?.eventId) return { ok: false, submitted: true, next: "Check Google Calendar for the update before trying again." };
      return { ok: true, connectorId: updated.id || updated.eventId, link, text: updated?.text || "Updated the calendar event.", next: "" };
    } catch (error) {
      return { ok: false, submitted: true, link: "", text: "", next: "Check Google Calendar for the update before trying again." };
    }
  }
  const connector = item.kind === "create_form" ? (ports.formsConnector || ports.connector) : ports.connector;
  if (!connector || !item.tool) {
    return { ok: false, link: "", text: "", next: "Connect the tool, then approve again." };
  }
  let result;
  try {
    result = await call(connector, item.tool, item.args || {}, ports.options || {});
  } catch {
    return { ok: false, submitted: true, link: "", text: "", next: "Check the connected tool before trying again." };
  }
  const text = result?.text || "";
  const link = result?.link || linkFrom(text);
  if (result?.ok !== true) {
    return { ok: false, submitted: result?.submitted !== false, link, text, next: "Check the connected tool before trying again." };
  }
  return { ok: true, connectorId: result.connectorId || result.id || "", link, text, next: "" };
}
