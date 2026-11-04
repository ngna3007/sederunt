/**
 * Post-meeting action checklist. The model proposes items. Nothing runs
 * until the requester presses Approve in the DM. Edit asks for a change.
 * Skip marks the item skipped. Results go back in that same DM thread.
 *
 * `createMemoryActionStore` is the persistence stand-in. A durable store
 * implements get, put, and update. Connector calls go through `callTool`
 * from src/connectors/client.js, or through an injected calendar port
 * whose `updateEventDetails` is the Calendar MCP write.
 */

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
export async function extractActions({ transcript, llm }) {
  const completed = await llm.complete({
    messages: [{ role: "user", text: String(transcript || "") }],
    responseFormat: "json",
  });
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
        label: { type: "plain_text", text: "What should change?" },
        element: { type: "plain_text_input", action_id: "change", multiline: true },
      },
    ],
  };
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
export async function sendActionDms({ items, slack, store }) {
  const undelivered = [];
  const sent = [];
  for (const [requesterSlackId, group] of groupByRequester(items)) {
    if (!requesterSlackId) {
      undelivered.push(...group.map((item) => item.id));
      continue;
    }
    for (const item of group) await store.put({ ...item, status: "pending" });
    const opened = await slack.openConversation({ users: requesterSlackId });
    const channel = opened.channel?.id || opened.channel;
    const blocks = actionChecklistBlocks(group);
    const text = group.map((item) => actionLine(item)).join("\n");
    const posted = await slack.postMessage({ channel, text, blocks });
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

function threadOf(payload, item) {
  return payload?.message?.thread_ts || payload?.message?.ts || item?.threadTs || "";
}

function channelOf(payload, item) {
  return payload?.channel?.id || payload?.channel || item?.channelId || "";
}

/**
 * Approve is the only path that calls the connector. The actor must be the
 * requester. Results are posted with thread_ts so they stay in the DM.
 */
export async function handleActionPayload({ payload, store, slack, connectors, actorSlackId }) {
  const body = parseActionPayload(payload);
  const action = body?.actions?.[0];
  if (!action?.value) return { ok: false, error: "missing", ran: false };
  const item = await store.get(action.value);
  if (!item) return { ok: false, error: "missing", ran: false };
  const actor = actorSlackId || body.user?.id || "";
  if (!actor || actor !== item.requesterSlackId) return { ok: false, error: "not_requester", ran: false };
  const verb = String(action.action_id || "").split(":")[0];
  const channel = channelOf(body, item);
  const thread_ts = threadOf(body, item);

  if (verb === "skip") {
    await store.update(item.id, { status: "skipped" });
    await slack.postMessage({
      channel,
      thread_ts,
      text: `Skipped: ${actionLine(item)}. I did not run it.`,
    });
    return { ok: true, status: "skipped", ran: false };
  }

  if (verb === "edit") {
    await store.update(item.id, { status: "editing" });
    let opened = false;
    if (typeof slack.openModal === "function" && body.trigger_id) {
      await slack.openModal({ triggerId: body.trigger_id, view: editModal(item) });
      opened = true;
    }
    if (!opened) {
      await slack.postMessage({
        channel,
        thread_ts,
        text: `What should change in "${actionLine(item)}"?`,
      });
    }
    return { ok: true, status: "editing", ran: false, modal: opened };
  }

  if (verb !== "approve") return { ok: false, error: "unknown", ran: false };
  if (item.status === "done" || item.status === "skipped") return { ok: false, error: "closed", ran: false };
  await store.update(item.id, { status: "approved" });
  const result = await connectors.run(item);
  const status = result?.ok ? "done" : "failed";
  await store.update(item.id, { status, result: { ok: Boolean(result?.ok), link: result?.link || "", text: result?.text || "" } });
  const text = result?.ok
    ? `${actionLine(item)}. ${result.link || ""}`.trim()
    : `I couldn't ${item.summary}. Next: ${result?.next || "check the connector, then approve again."}`;
  await slack.postMessage({ channel, thread_ts, text });
  return { ok: Boolean(result?.ok), status, ran: true };
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
      const updated = await ports.calendar.updateEventDetails(item.args || {});
      const link = updated?.link || updated?.htmlLink || "";
      return { ok: true, link, text: updated?.text || "Updated the calendar event.", next: "" };
    } catch (error) {
      return { ok: false, link: "", text: "", next: error?.message || "Check the calendar event, then approve again." };
    }
  }
  const connector = item.kind === "create_form" ? (ports.formsConnector || ports.connector) : ports.connector;
  if (!connector || !item.tool) {
    return { ok: false, link: "", text: "", next: "Connect the tool, then approve again." };
  }
  const result = await call(connector, item.tool, item.args || {}, ports.options || {});
  const text = result?.text || "";
  const link = result?.link || linkFrom(text);
  if (result?.ok !== true) {
    return { ok: false, link, text, next: "Check the connector, then approve again." };
  }
  return { ok: true, link, text, next: "" };
}
