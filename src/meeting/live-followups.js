import { canReadRecord } from "../domain/read-access.js";
import { resolvePreference } from "../domain/preference.js";
import { followupId } from "./followups.js";

const BY_TOOL = {
  linear: { kind: "assign_task", tool: "create_issue" },
  forms: { kind: "create_form", tool: "create_form" },
  calendar: { kind: "edit_calendar", tool: "update_event" },
};

function memberOf(decision) {
  if (typeof decision?.memberId === "string" && decision.memberId.trim()) return decision.memberId.trim();
  if (typeof decision?.speakerMemberId === "string" && decision.speakerMemberId.trim()) return decision.speakerMemberId.trim();
  return "";
}

function trustedAction(decision, actions, preferences) {
  const action = (actions || []).find((row) => row && row.decisionId === decision.id && row.state !== "dismissed");
  if (!action) return null;
  const pair = BY_TOOL[action.tool];
  if (!pair) return null;
  const preference = resolvePreference(preferences, action.tool, action.roomId);
  const args = action.tool === "calendar"
    ? { ...(action.params || {}), eventId: action.params?.eventId || action.params?.id || "" }
    : { title: action.params?.title || action.statement || decision.text || "" };
  return {
    kind: pair.kind,
    tool: pair.tool,
    args,
    where: action.tool === "calendar" ? "Google Calendar" : (action.tool === "forms" ? "Google Forms" : "Linear"),
    explicit: true,
    existingActionId: action.id || "",
    connectorId: action.connectorId || "",
    preference,
  };
}

// A suggestion is extracted only when the kept sentence explicitly names a
// ticket title. It remains a proposal even when the tool default is automatic.
function suggestedAction(text) {
  const match = /\b(?:we should|let(?:'|’)s|please) (?:create|file) (?:a |an |the )?(?:linear )?(?:ticket|issue) (?:named|titled|called) ["“]?([^"”\n]+?)["”]?[.!]?$/i.exec(String(text || "").trim());
  const title = String(match?.[1] || "").trim();
  if (!title || title.length > 200) return null;
  return { kind: "assign_task", tool: "create_issue", args: { title }, where: "Linear", explicit: false, existingActionId: "", connectorId: "" };
}

/**
 * Meeting-end evidence from stored decisions and verified attendance.
 * Display names and the workspace owner are not attendance.
 * @param {{
 *   tenantId: string,
 *   meetingId: string,
 *   teamId?: string,
 *   botName?: string,
 *   decisions?: object[],
 *   actions?: object[],
 *   bindings?: Array<{ roomId?: string, memberId?: string, email?: string, slackUserId?: string }>,
 *   preferences?: object[],
 *   bindingChannelId?: string,
 *   channelRecipients?: object[],
 *   meeting?: object,
 * }} input
 */
export function buildMeetingFollowupInput(input) {
  const tenantId = String(input?.tenantId || "").trim();
  const meetingId = String(input?.meetingId || "").trim();
  const bindings = (input?.bindings || []).filter((row) => row?.roomId === meetingId && row.memberId && row.email);
  const memberIds = [...new Set(bindings.map((row) => String(row.memberId)))];
  const slackFor = (memberId) => bindings.find((row) => row.memberId === memberId)?.slackUserId || "";
  const sources = [];
  for (const decision of input?.decisions || []) {
    if (!decision || decision.deleted || decision.roomId !== meetingId) continue;
    const memberId = memberOf(decision);
    if (!memberIds.includes(memberId)) continue;
    const inviteMemberIds = Array.isArray(decision.inviteMemberIds) && decision.inviteMemberIds.length
      ? [...decision.inviteMemberIds]
      : [...memberIds];
    sources.push({
      id: decision.id,
      text: decision.text,
      memberId,
      slackUserId: slackFor(memberId),
      inviteMemberIds,
      sourceDeliveryId: decision.sourceDeliveryId || "",
      deleted: false,
      action: trustedAction(decision, input.actions, input.preferences) || suggestedAction(decision.text),
    });
  }
  // Paused explicit requests are records in their own right; a decision is
  // not created until a connector succeeds. Preserve their original author
  // and invitation snapshot instead of associating by similar text.
  const linkedActions = new Set(sources.map((source) => source.action?.existingActionId).filter(Boolean));
  for (const action of input?.actions || []) {
    if (!action || linkedActions.has(action.id) || action.roomId !== meetingId || action.state !== "paused"
      || action.connectorId || action.missingFact || !memberIds.includes(action.memberId)
      || !Array.isArray(action.inviteMemberIds) || !action.inviteMemberIds.includes(action.memberId)
      || !action.statement || !action.id) continue;
    const id = `action:${action.deliveryId || action.id}`;
    const mapped = trustedAction({ id, text: action.statement }, [{ ...action, decisionId: id }], input.preferences);
    if (!mapped) continue;
    sources.push({ id, text: action.statement, memberId: action.memberId,
      slackUserId: slackFor(action.memberId), inviteMemberIds: [...action.inviteMemberIds],
      sourceDeliveryId: action.deliveryId || "", action: mapped, deleted: false });
  }
  const explicitSources = new Set((input?.actions || []).filter((action) => action.roomId === meetingId && action.deliveryId).map((action) => action.deliveryId));
  for (const source of sources) {
    if (!source.action?.explicit && explicitSources.has(source.sourceDeliveryId)) source.action = null;
  }
  const people = memberIds.map((memberId) => {
    const person = bindings.find((row) => row.memberId === memberId);
    return {
      memberId,
      slackUserId: person.slackUserId || "",
      email: person.email,
      attended: true,
    };
  });
  const recipients = Array.isArray(input?.channelRecipients) ? input.channelRecipients : [];
  const channelAuthorized = Boolean(input?.bindingChannelId) && recipients.length > 0 && sources.length > 0
    && recipients.every((person) => sources.every((source) => canReadRecord(person, {
      roomId: meetingId,
      inviteMemberIds: source.inviteMemberIds,
      account: "company",
    })));
  const privateMeeting = input?.meeting?.private === true || input?.meeting?.privateOneToOne === true || people.length <= 1;
  return {
    tenantId,
    meetingId,
    teamId: String(input?.teamId || "").trim(),
    memberIds,
    botName: input?.botName || "Maple",
    sources,
    proposals: sources.filter((source) => source.action && !source.action.connectorId).map((source) => ({ sourceId: source.id })),
    channelAuthorized: channelAuthorized && !privateMeeting,
    meeting: {
      ...(input?.meeting || {}),
      people,
      privateOneToOne: privateMeeting,
      bindingChannelId: channelAuthorized && !privateMeeting ? input.bindingChannelId : "",
      inviteChannelId: "",
      emailSending: false,
    },
    minutes: {
      decisions: sources.filter((source) => !source.id.startsWith("action:")).map((source) => ({ text: source.text })),
    },
  };
}

export async function acceptMeetingEnd(followups, store, built) {
  if (!built?.tenantId || !built.meetingId) throw new Error("Verified meeting evidence is required.");
  if (!built.teamId || !built.memberIds?.length) {
    const reason = built.memberIds?.length ? "no-team" : "unverified";
    return store.put({
      id: followupId("outcome", built.tenantId, built.meetingId, reason),
      tenantId: built.tenantId,
      meetingId: built.meetingId,
      kind: "outcome",
      status: "done",
      data: { terminal: reason, attempts: 0 },
    });
  }
  if (typeof followups?.enqueue !== "function") throw new Error("Follow-up finalization is unavailable.");
  return followups.enqueue(built);
}

export function validateFollowupEdit(data, edit) {
  const summary = String(edit?.summary || edit?.change || "").trim();
  if (!summary || summary.length > 500 || summary.includes("\u0000")) return { ok: false };
  const tool = data?.tool;
  if (tool === "create_issue" || tool === "create_form") {
    const title = String(edit?.title || summary).trim();
    if (!title || title.length > 200) return { ok: false };
    return { ok: true, args: { ...(data.args || {}), title }, summary };
  }
  if (tool === "update_event") {
    const eventId = data?.args?.eventId || data?.args?.id || "";
    if (!eventId) return { ok: false };
    let fields;
    const description = /^description:\s*(.+)$/i.exec(summary);
    const times = /^start:\s*(\S+)\s+end:\s*(\S+)$/i.exec(summary);
    if (description) fields = { description: description[1] };
    else if (times) fields = { start: times[1], end: times[2] };
    else { try { fields = JSON.parse(summary); } catch { return { ok: false }; } }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)
      || Object.keys(fields).some((key) => !["start", "end", "description"].includes(key))) return { ok: false };
    if (typeof fields.description === "string" && Object.keys(fields).length === 1) {
      return { ok: true, args: { eventId, description: fields.description }, summary: "Update event description" };
    }
    if (typeof fields.start !== "string" || typeof fields.end !== "string" || Object.keys(fields).length !== 2
      || !Number.isFinite(Date.parse(fields.start)) || !Number.isFinite(Date.parse(fields.end))
      || Date.parse(fields.start) >= Date.parse(fields.end)) return { ok: false };
    return { ok: true, args: { eventId, start: fields.start, end: fields.end }, summary: "Update event time" };
  }
  return { ok: false };
}

function verbOf(actionId) {
  const name = String(actionId || "");
  if (name.startsWith("approve:")) return "approve";
  if (name.startsWith("edit:")) return "edit";
  if (name.startsWith("skip:")) return "skip";
  return "";
}

function editFields(payload) {
  const values = payload?.view?.state?.values || {};
  let change = "";
  let title = "";
  for (const block of Object.values(values)) {
    if (!block || typeof block !== "object") continue;
    if (typeof block.change?.value === "string") change = block.change.value;
    if (typeof block.title?.value === "string") title = block.title.value;
  }
  return { summary: change, change, title };
}

/**
 * Slack interactivity fields. Block actions use the payload channel and thread.
 * Modal submit and cancel keep the stored channel and thread after the actor and team match.
 */
export function followupInteractionFields(payload, stored) {
  const actorSlackId = String(payload?.user?.id || "");
  const teamId = String(payload?.team?.id || payload?.team_id || "");
  if (payload?.type === "block_actions") {
    const action = Array.isArray(payload.actions) ? payload.actions[0] : null;
    const verb = verbOf(action?.action_id);
    if (!verb || !action?.value) return null;
    return {
      verb,
      value: action.value,
      actorSlackId,
      teamId,
      channelId: String(payload.channel?.id || payload.container?.channel_id || ""),
      threadTs: String(payload.message?.thread_ts || payload.container?.thread_ts || payload.message?.ts || ""),
    };
  }
  if (payload?.type !== "view_submission" && payload?.type !== "view_closed") return null;
  if (!stored || stored.teamId !== teamId || stored.requesterSlackId !== actorSlackId) return null;
  return {
    verb: payload.type === "view_closed" ? "cancel" : "save",
    value: String(payload.view?.private_metadata || ""),
    actorSlackId,
    teamId,
    channelId: stored.channelId || "",
    threadTs: stored.threadTs || "",
    edit: payload.type === "view_submission" ? editFields(payload) : undefined,
  };
}
