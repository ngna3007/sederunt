import { createHash, randomUUID } from "node:crypto";
import { actionChecklistBlocks, actionLine, editModal } from "./actions.js";
import { decideMinutesDelivery, renderMinutes } from "./minutes.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const followupId = (kind, tenantId, meetingId, sourceId) => `${kind}:${hash([tenantId, meetingId, sourceId])}`;
const copy = value => structuredClone(value);
const toolsByKind = { assign_task: "create_issue", create_form: "create_form", edit_calendar: "update_event" };
const settled = new Set(["done", "skipped", "outcome_unknown", "not_reached"]);

function validateEvidence(input) {
  if (!input?.tenantId || !input.meetingId || !input.teamId || !Array.isArray(input.memberIds) || !input.memberIds.length) throw new Error("Verified meeting evidence is required.");
  if (!Array.isArray(input.sources) || input.sources.length > 100) throw new Error("Invalid meeting source evidence.");
  const ids = new Set();
  for (const source of input.sources) {
    if (!source.id || ids.has(source.id) || !input.memberIds.includes(source.memberId) || !source.text) throw new Error("Invalid source attribution.");
    ids.add(source.id);
  }
}

export function proposalsFromEvidence(input) {
  validateEvidence(input);
  const proposals = [];
  for (const proposal of input.proposals || []) {
    const source = input.sources.find(row => row.id === proposal.sourceId);
    if (!source || source.deleted || !source.action || source.action.connectorId) continue;
    const action = source.action;
    if (!toolsByKind[action.kind] || action.tool !== toolsByKind[action.kind] || !action.tool || !action.args || typeof action.args !== "object" || Array.isArray(action.args)) continue;
    // Model output may select trusted evidence; it cannot supply authority or executable arguments.
    proposals.push({
      id: followupId("action", input.tenantId, input.meetingId, source.id),
      tenantId: input.tenantId, meetingId: input.meetingId, kind: "action", status: "pending",
      data: { ...copy(action), sourceId: source.id, summary: source.text, where: action.where || "connected tool", requesterMemberId: source.memberId, requesterSlackId: source.slackUserId || "", teamId: input.teamId, memberIds: [...input.memberIds], argumentVersion: 1, attempts: 0, notificationsDirty: true, explicit: action.explicit === true, existingActionId: action.existingActionId || "", botName: input.botName || "Adam" },
    });
  }
  return proposals;
}

export function followupBlocks(record) {
  const item = { id: `${record.id}:${record.data.argumentVersion}`, ...record.data };
  if (record.status === "pending" || record.status === "failed") return actionChecklistBlocks([item]);
  const labels = { editing: "Editing. Save the changes before approving.", running: "Running. Please wait.", done: "Completed.", skipped: "Skipped.", outcome_unknown: "The result is uncertain. Check the connected tool before trying again.", not_reached: "The requester could not be reached." };
  return [{ type: "section", text: { type: "plain_text", text: `${actionLine(item)}\n${labels[record.status] || record.status}` } }];
}

export function parseFollowupValue(value) {
  const match = /^(action:[a-f0-9]{64}):(\d+)$/.exec(String(value || ""));
  return match ? { id: match[1], version: Number(match[2]) } : null;
}

export function createMeetingFollowups({ store, handleUtterance, slackFor, authorize, authorizeDelivery, validateEdit, clock = Date.now, maxAttempts = 5, claimMs = 60000 } = {}) {
  if (!store) throw new Error("A follow-up store is required.");
  const finish = async (record, status, fields = {}) => store.change(record, { status, data: { ...record.data, ...(record.kind === "action" ? { notificationsDirty: true } : {}), ...fields } });
  async function enqueue(input) {
    validateEvidence(input);
    const fingerprint = hash([input.sources, input.proposals || [], input.minutes || {}, input.meeting || {}]);
    return store.put({ id: followupId("outcome", input.tenantId, input.meetingId, fingerprint), tenantId: input.tenantId, meetingId: input.meetingId, kind: "outcome", status: "pending", data: { input: copy(input), attempts: 0, fingerprint } });
  }
  async function delivery(record) {
    const input = record.data;
    if (typeof authorizeDelivery !== "function" || !await authorizeDelivery({ record: copy(record) })) return finish(record, "not_reached", { next: "Meeting access changed. Review the recipients before delivering." });
    const slack = await slackFor(record.tenantId);
    if (!slack || slack.teamId !== input.teamId) throw new Error("The meeting Slack installation is unavailable.");
    let channel = input.channelId;
    if (!channel) {
      const opened = await slack.openConversation({ users: input.requesterSlackId });
      channel = opened.channel?.id || opened.channel;
      if (!channel) throw new Error("Slack did not open the conversation.");
    }
    const message = { channel, thread_ts: input.replyThreadTs, text: input.text, blocks: input.blocks, username: input.botName, client_msg_id: input.messageId };
    if (input.receipt?.ts && typeof slack.updateMessage !== "function") throw new Error("Slack message updates are unavailable.");
    const posted = input.receipt?.ts
      ? await slack.updateMessage({ ...message, ts: input.receipt.ts })
      : await slack.postMessage(message);
    if (!posted?.ts) return finish(record, "outcome_unknown", { channelId: channel, next: "Check Slack for this message before retrying delivery." });
    const saved = await finish(record, "done", { channelId: channel, threadTs: posted.ts, receipt: { channel, ts: posted.ts } });
    if (saved && input.actionId && !input.replyThreadTs) {
      const action = await store.get(record.tenantId, input.actionId);
      if (action && !action.data.channelId) await finish(action, action.status, { channelId: channel, threadTs: posted.ts });
    }
    return saved;
  }
  async function materialize(outcome) {
    const input = outcome.data.input;
    for (const proposal of proposalsFromEvidence(input)) {
      const item = await store.put(proposal);
      if (settled.has(item.status)) continue;
      const requester = item.data.requesterSlackId;
      if (!requester) { await finish(item, "not_reached", { next: "Match this verified attendee to Slack before creating a replacement proposal." }); continue; }
      await store.put({ id: followupId("delivery", input.tenantId, input.meetingId, item.id), tenantId: input.tenantId, meetingId: input.meetingId, kind: "delivery", status: "pending", data: { teamId: input.teamId, actionId: item.id, requesterSlackId: requester, text: actionLine(item.data), blocks: followupBlocks(item), botName: item.data.botName, messageId: hash(item.id).slice(0, 32), attempts: 0 } });
    }
    // A channel is usable only when the caller established its complete recipient set may read every source.
    const permittedPeople = (input.meeting?.people || []).filter(person => person.memberId && input.memberIds.includes(person.memberId) && input.sources.every(source => !source.deleted && (source.inviteMemberIds || input.memberIds).includes(person.memberId)));
    const meeting = { ...input.meeting, people: permittedPeople, bindingChannelId: input.channelAuthorized ? input.meeting?.bindingChannelId : "", inviteChannelId: input.channelAuthorized ? input.meeting?.inviteChannelId : "", emailSending: false };
    const plan = decideMinutesDelivery(meeting);
    const destinations = plan.postToChannel ? [{ channelId: plan.postToChannel.channelId }] : plan.dms.map(person => ({ requesterSlackId: person.slackUserId }));
    const text = renderMinutes({ ...input.minutes, notReached: plan.notReached });
    for (const target of destinations) {
      const destination = target.channelId || target.requesterSlackId;
      const id = followupId("delivery", input.tenantId, input.meetingId, ["minutes", destination]);
      const existing = await store.put({ id, tenantId: input.tenantId, meetingId: input.meetingId, kind: "delivery", status: "pending", data: { ...target, teamId: input.teamId, text, botName: input.botName || "Adam", messageId: hash(id).slice(0, 32), attempts: 0 } });
      if (existing.status === "done" && existing.data.text !== text) await finish(existing, "pending", { text, attempts: 0 });
    }
    return finish(outcome, "done", { notReached: plan.notReached });
  }
  async function syncAction(record) {
    if (!record.data.channelId || !record.data.threadTs) return;
    const id = followupId("delivery", record.tenantId, record.meetingId, record.id);
    const delivery = await store.get(record.tenantId, id);
    const blocks = followupBlocks(record);
    if (delivery?.status === "done" && JSON.stringify(delivery.data.blocks) !== JSON.stringify(blocks)) {
      await finish(delivery, "pending", { blocks, attempts: 0 });
    }
    if (!["done", "skipped", "outcome_unknown", "failed"].includes(record.status)) {
      await finish(record, record.status, { notificationsDirty: false });
      return;
    }
    const text = record.status === "done" ? `Completed: ${actionLine(record.data)}. ${record.data.receipt?.link || ""}`.trim()
      : record.status === "skipped" ? `Skipped: ${actionLine(record.data)}.`
        : `${actionLine(record.data)}: ${record.data.next || "Check the connected tool before trying again."}`;
    const resultId = followupId("delivery", record.tenantId, record.meetingId, [record.id, record.data.argumentVersion, record.status]);
    await store.put({ id: resultId, tenantId: record.tenantId, meetingId: record.meetingId, kind: "delivery", status: "pending", data: { teamId: record.data.teamId, channelId: record.data.channelId, replyThreadTs: record.data.threadTs, text, botName: record.data.botName, messageId: hash(resultId).slice(0, 32), attempts: 0 } });
    await finish(record, record.status, { notificationsDirty: false });
  }
  async function drain({ tenantId, limit = 25 } = {}) {
    // Rebuild notifications from durable action state after a crash between saving a receipt and enqueueing its message.
    for (const action of await store.list(tenantId, { kind: "action", needsSync: true, limit })) await syncAction(action);
    const rows = [
      ...await store.list(tenantId, { kind: "action", statuses: ["running"], limit }),
      ...await store.list(tenantId, { kind: "outcome", statuses: ["pending", "failed", "running"], limit }),
      ...await store.list(tenantId, { kind: "delivery", statuses: ["pending", "failed", "running"], limit }),
    ].filter(row => row.status === "running" ? row.data.claimUntil <= clock() : !(row.data.nextAttemptAt > clock() || row.data.attempts >= maxAttempts))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, Math.max(1, Math.min(100, limit)));
    const results = [];
    for (const row of rows) {
      if (row.kind === "action") {
        if (row.status === "running" && row.data.claimUntil <= clock()) results.push(await finish(row, "outcome_unknown", { next: "Check the connected tool before retrying this action." }));
        continue;
      }
      if (row.status === "running") {
        if (row.data.claimUntil <= clock()) results.push(await finish(row, row.kind === "outcome" ? "failed" : "outcome_unknown", { next: "Reconcile the previous execution or Slack message before retrying." }));
        continue;
      }
      if (row.data.nextAttemptAt > clock() || row.data.attempts >= maxAttempts) continue;
      const claimed = await finish(row, "running", { attempts: (row.data.attempts || 0) + 1, claimUntil: clock() + claimMs, claimId: randomUUID() });
      if (!claimed) continue;
      try { results.push(await (claimed.kind === "outcome" ? materialize(claimed) : delivery(claimed))); }
      catch { results.push(await finish(claimed, claimed.kind === "delivery" ? "outcome_unknown" : "failed", { nextAttemptAt: clock() + Math.min(300000, 1000 * 2 ** claimed.data.attempts), next: claimed.kind === "delivery" ? "Check Slack before retrying this delivery." : "Retry finalization after checking the meeting evidence and dependencies." })); }
    }
    return results;
  }
  async function authorizeExecution(input) {
    const proposed = input?.followup;
    if (input?.intent !== "followup-approve" || !proposed?.tenantId || !proposed.id) return false;
    const record = await store.get(proposed.tenantId, proposed.id);
    const data = record?.data;
    if (!record || record.status !== "running" || data.permitConsumed || data.claimUntil <= clock() || data.claimId !== proposed.claimId || data.argumentVersion !== proposed.version || record.meetingId !== proposed.meetingId || data.requesterMemberId !== input.memberId || data.requesterSlackId !== proposed.actorSlackId || proposed.requesterSlackId !== data.requesterSlackId || data.sourceId !== proposed.sourceId || data.kind !== proposed.kind || data.tool !== proposed.tool || hash(data.args) !== hash(proposed.args) || data.existingActionId !== proposed.existingActionId || data.explicit !== proposed.explicit) return false;
    if (typeof authorize !== "function" || !await authorize({ record: copy(record), actorSlackId: proposed.actorSlackId })) return false;
    return Boolean(await finish(record, "running", { permitConsumed: true }));
  }
  async function interact(input) {
    const parsed = parseFollowupValue(input.value);
    if (!parsed || !input.tenantId || !input.actorSlackId) return { ok: false, error: "invalid" };
    const record = await store.get(input.tenantId, parsed.id);
    if (!record || record.data.teamId !== input.teamId || record.data.requesterSlackId !== input.actorSlackId || record.data.channelId !== input.channelId || record.data.threadTs !== input.threadTs || record.data.argumentVersion !== parsed.version) return { ok: false, error: "forbidden_or_stale" };
    if (typeof authorize !== "function" || !await authorize({ record: copy(record), actorSlackId: input.actorSlackId })) return { ok: false, error: "not_invited" };
    if (settled.has(record.status) || record.status === "running") return { ok: false, error: "closed" };
    if (input.verb === "skip") {
      const saved = await finish(record, "skipped");
      if (saved) await syncAction(saved);
      return { ok: Boolean(saved), ran: false };
    }
    if (input.verb === "edit") {
      const claimed = await finish(record, "editing");
      if (!claimed) return { ok: false, error: "conflict" };
      await syncAction(claimed);
      return { ok: true, ran: false, modal: { notify_on_close: true, ...editModal({ ...record.data, id: `${record.id}:${record.data.argumentVersion}` }), private_metadata: `${record.id}:${record.data.argumentVersion}` } };
    }
    if (input.verb === "cancel") {
      if (record.status !== "editing") return { ok: false, error: "invalid_edit" };
      const changed = await finish(record, "pending");
      if (changed) await syncAction(changed);
      return { ok: Boolean(changed), ran: false };
    }
    if (input.verb === "save") {
      if (record.status !== "editing" || typeof validateEdit !== "function") return { ok: false, error: "invalid_edit" };
      const edited = await validateEdit(copy(record.data), input.edit);
      if (!edited?.ok || !edited.args || !edited.summary) return { ok: false, error: "invalid_edit" };
      const changed = await finish(record, "pending", { args: copy(edited.args), summary: edited.summary, argumentVersion: parsed.version + 1 });
      if (changed) await syncAction(changed);
      return { ok: Boolean(changed), ran: false, record: changed };
    }
    if (input.verb !== "approve" || record.status === "editing" || typeof handleUtterance !== "function") return { ok: false, error: "invalid" };
    const claimed = await finish(record, "running", { claimId: randomUUID(), claimUntil: clock() + claimMs, permitConsumed: false });
    if (!claimed) return { ok: false, error: "conflict" };
    const item = claimed.data;
    let result;
    try {
      result = await handleUtterance({ door: "slack", intent: "followup-approve", memberId: item.requesterMemberId, room: { id: record.meetingId, botPresent: true, memberIds: item.memberIds }, participants: item.memberIds, followup: { id: record.id, tenantId: record.tenantId, meetingId: record.meetingId, version: item.argumentVersion, actorSlackId: input.actorSlackId, requesterSlackId: item.requesterSlackId, sourceId: item.sourceId, kind: item.kind, tool: item.tool, args: copy(item.args), existingActionId: item.existingActionId, explicit: item.explicit, claimId: item.claimId } });
    } catch { result = null; }
    const status = result?.ok === true && result.connectorId ? "done" : result?.submitted === false ? "failed" : "outcome_unknown";
    const current = await store.get(record.tenantId, record.id);
    const saved = current?.status === "running" && current.data.claimId === claimed.data.claimId ? await finish(current, status, { receipt: result?.connectorId ? { connectorId: result.connectorId, link: result.link || "" } : null, next: result?.next || (status === "outcome_unknown" ? "Check the connected tool before retrying this action." : "Check the required details and connector.") }) : null;
    if (saved) await syncAction(saved);
    return { ok: status === "done", ran: true, status, result, record: saved };
  }
  return { enqueue, drain, interact, authorizeExecution };
}
