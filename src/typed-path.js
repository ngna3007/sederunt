import { canReadRecord, readPrincipalId, readableSession } from "./domain/read-access.js";
import { createHash, randomBytes } from "node:crypto";
import { displayName, logAction, logFailure, logRequest, logUndo, renderActivity, undoRefusal } from "./activity.js";
import { formatActivitySentence, selectActivity } from "./activity-feed.js";
import { canReplay, canUndo, fieldUndoPlan, readCalendarEvent, replayPlan, replaySupported, runReplay } from "./activity-replay.js";
import { authorize } from "./domain/allow.js";
import { runApprovedAction } from "./meeting/actions.js";
import { clashStatuses } from "./domain/clash.js";
import { checkInvite } from "./domain/invite.js";
import { gateEvent } from "./domain/log.js";
import { resolvePreference } from "./domain/preference.js";
import { redact } from "./domain/redact.js";
import { acceptCheckpoint } from "./domain/stamp.js";
import { itemStatus } from "./domain/status.js";
import { splitPassage } from "./memory/analyze.js";
import { addressesHearing, isRememberThisKeep, normalizeHearing, splitAddressedKeepSentences, stripHearing } from "./hearing.js";
import { learnedKey, memoriesFor, parseLearnedUtterance, shapeAnswer } from "./memory/learn.js";
import { draftMinutes, rememberMeetingOutcome } from "./memory/outcome.js";
import { looksLikeOpenQuestion, parseUtterance } from "./parse.js";
import { meetingCallRank } from "./meeting/recall.js";
import { publicProof } from "./tatum/proof.js";

const KEY_NAMES = [
  "COMPANY_MEMWAL_KEY",
  "PERSONAL_MEMWAL_KEY",
  "PERSONAL_OWNER_KEY",
  "LINEAR_MCP_TOKEN",
  "RECALL_API_KEY",
  "CONSOLE_API_KEY",
  "CONSOLE_SERVICE_PRIVATE_KEY",
  "TATUM_API_KEY",
  "CALENDAR_MCP_TOKEN",
];

const FILE_NAME = /\b([\w.-]+\.(?:pdf|png|docx|txt|pptx))\b/i;

/**
 * The only write door. Adapters are injected. A delivery id is consumed
 * once, and a connector runs only after the invite check and the allow.
 *
 * @param {{
 *   text?: string,
 *   session: ReturnType<import("./session.js").createSession>,
 *   memberId?: string,
 *   room?: { id?: string, kind?: string, source?: string, botPresent?: boolean, memberIds?: string[] },
 *   participants?: string[],
 *   door?: string,
 *   addressed?: boolean,
 *   intent?: string,
 *   deliveryId?: string,
 *   decision?: { area?: string, contradicts?: string[], replaces?: string },
 *   join?: unknown,
 *   checkpoint?: number,
 *   knowableAtCheckpoint?: number,
 *   file?: { name?: string, bytes?: string, id?: string },
 *   files?: Array<{ name?: string, bytes?: string, id?: string }>,
 * }} input
 * @param {{
 *   linear?: { readOpenTripTickets(): Promise<unknown>, createIssue(input: { title: string }): Promise<{ identifier?: string, id?: string }> },
 *   calendar?: { readDay(day: string): Promise<unknown>, listTools(): Promise<Array<{ name: string, write?: boolean }>>, call(name: string, params: unknown): Promise<{ id?: string, identifier?: string, eventId?: string }> },
 *   memory?: { remember(input: unknown): Promise<unknown> },
 *   console?: { upload(input: { name: string, bytes?: string }): Promise<unknown>, download?(input: { id?: string | null, name?: string }): Promise<unknown> },
 *   tatum?: { getObject(blobId: string): Promise<{ text?: string, checkpoint?: number, objectId?: string }> },
 *   meeting?: { join(input: unknown): Promise<unknown> },
 * }} deps
 */
/** Recall often streams the guest name alone, then the rest.
 * An address-only meeting chunk arms a short hold so the next line still enters.
 * Hearing a name also marks the room for the rest of the session, and a
 * remember-this keep refreshes the hold so a dropped wake or a split
 * continuation can still enter.
 */
const HEARING_HOLD_MS = 15_000;

function meetingRoomId(input) {
  return typeof input.room?.id === "string" ? input.room.id.trim() : "";
}

function meetingSpeakerKey(input) {
  const id = String(input?.memberId || "").trim();
  if (id) return `id:${id}`;
  const name = String(input?.speakerName || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return name ? `name:${name}` : "";
}

function armMeetingHearing(session, roomId, speaker) {
  if (!roomId) return;
  const until = Date.now() + HEARING_HOLD_MS;
  const hold = { roomId, until };
  if (speaker) hold.speaker = speaker;
  session.hearingHold = hold;
  session.hearingArmedRooms ??= new Set();
  session.hearingArmedRooms.add(roomId);
}

function roomHearingArmed(session, roomId) {
  if (!roomId || !session) return false;
  if (session.hearingArmedRooms instanceof Set && session.hearingArmedRooms.has(roomId)) return true;
  const hold = session.hearingHold;
  return Boolean(hold && hold.roomId === roomId);
}

function meetingRememberKeep(text, hearing) {
  return isRememberThisKeep(text) || isRememberThisKeep(stripHearing(text, hearing));
}

export async function handleUtterance(input, deps = {}) {
  if (input.door === "admin") {
    const { handleAdminAction } = await import("./domain/admin.js");
    return handleAdminAction(input, deps.admin);
  }
  const session = ensureSession(input.session);
  if (input.intent === "delete-cleanup") {
    const intent = input.deletionIntent;
    if (!intent || !deps.deletions || intent.tenantId !== deps.deletionTenantId) return { ok: false };
    const persisted = (await deps.deletions.list(intent.tenantId)).find((row) => row.id === intent.id);
    if (!persisted || persisted.state !== "running" || persisted.leaseToken !== intent.leaseToken
      || new Date(persisted.leaseUntil).getTime() <= Date.now()) return { ok: false };
    const auth = authorize({ action: "delete", tool: "memory", preference: "ask", confirmed: true, actionId: intent.id, confirmActionId: intent.id });
    if (!auth.allowed) return { ok: false };
    const decision = input.deletionDecision;
    const { deletionMatches, decisionDeletionScope } = await import("./memory/deletions.js");
    if (!deletionMatches(intent, decisionDeletionScope(intent.tenantId, decision))) return { ok: false };
    const tombstone = { ...decision, deleted: true, text: "", fileNames: [] };
    const receipt = await remember(deps, { account: decision.account || "company", kind: "decision", text: `${decision.id} deleted`, idempotencyKey: `${decision.id}:deleted`, decision: decisionDocument(tombstone) });
    return { ok: receipt != null, receipt };
  }
  if (input.intent === "followup-approve") return approveFollowup(input, session, deps);
  if (input.openedRoom) return openMeetingRoom(session, deps, input.openedRoom);
  if (!enters(input)) return silence();

  // Address-only ("Maple.") is not a decision. Arm a hold for the next chunk.
  // A remember-this keep refreshes that hold so a split continuation can
  // still enter. Other named lines consume it.
  if (input.door === "meeting") {
    const roomId = meetingRoomId(input);
    const hearing = input.session?.hearing;
    const stripped = withoutAddress(input.text, hearing);
    const addressedNow = input.addressed === true || addressesHearing(input.text, hearing);
    const rememberKeep = meetingRememberKeep(input.text, hearing);
    if (addressedNow && roomId) {
      session.hearingArmedRooms ??= new Set();
      session.hearingArmedRooms.add(roomId);
    }
    if (addressedNow && !String(stripped).trim()) {
      armMeetingHearing(session, roomId, meetingSpeakerKey(input));
      return silence();
    }
    // Refresh the short hold after a remember-this keep so a split
    // continuation can still enter. Other addressed lines consume it,
    // matching Slack-adjacent meeting tests and avoiding leftover holds.
    if (roomId && rememberKeep) {
      armMeetingHearing(session, roomId, meetingSpeakerKey(input));
    } else if (roomId) {
      if (session.hearingHold) delete session.hearingHold;
    }
  }

  const deliveryId = byteTrim(String(input.deliveryId ?? "").trim(), 255);
  session.trace = {
    requestId: deliveryId || "none",
    route: input.door || "typed",
    tool: input.intent || "",
    private: false,
  };
  if (typeof deps.log === "function") session.emit = deps.log;
  if (deliveryId && session.deliveries.has(deliveryId)) {
    // Same ts as an earlier keep (Slack message_changed) can still bring files.
    if (!attachedUploads(input).length) {
      return finish(session, {
        status: "recorded",
        kind: "duplicate",
        body: "duplicate-delivery",
        allow: "duplicate-delivery",
        outcome: "duplicate-delivery",
      });
    }
  } else if (deliveryId) {
    session.deliveries.add(deliveryId);
  }

  if (input.join && deps.meeting?.join) {
    session.trace.join = "failed";
    try {
      await deps.meeting.join(input.join);
      session.trace.join = "sent";
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      session.trace.join = message === "Meeting join is not configured" ? "not-configured" : "failed";
    }
  }

  if (input.intent === "delete") return forgetDelivery(input, session, deps);
  if (input.intent === "recall") {
    session.trace.tool = "recall";
    return answerRecall(input, session, deps);
  }

  // One transcript delivery can contain several "Maple/Adam remember this …"
  // sentences. Store each as its own decision instead of stripping to the last.
  const keepClauses = splitAddressedKeepSentences(input.text, input.session?.hearing);
  if (keepClauses.length > 1) {
    let last = null;
    for (const clause of keepClauses) {
      const stripped = withoutAddress(clause, input.session?.hearing);
      if (!stripped) continue;
      last = await storeDecision(
        { ...input, text: clause, addressed: true },
        session,
        deps,
        { type: "note", private: false, text: stripped },
      );
    }
    return last || silence();
  }

  const parsed = parseUtterance(withoutAddress(input.text, input.session?.hearing));
  session.trace.tool = parsed.tool || parsed.type || "";
  session.trace.private = parsed.private === true;
  if (parsed.type === "confirm") return confirmAction(input, session, deps, parsed.actionId);
  if (parsed.type === "dismiss") return dismissAction(session, parsed.actionId, deps);
  if (parsed.type === "preference") return storePreference(input, session, deps, parsed);
  if (parsed.type === "room-voice") return storeRoomVoice(input, session, deps, parsed);
  if (parsed.type === "room-clash") return storeRoomClash(input, session, deps, parsed);
  if (parsed.type === "yes") {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "yes\nrecorded\npreference ask",
      allow: "ask",
      preference: "ask",
    });
  }
  // A Slack channel line that is not an ask is kept. Its words never turn it
  // into a recall or a read; the ask/keep split is where the message arrived.
  // Ticket commands (writes) still go through their allow first.
  if (parsed.type === "write") return requestWrite(input, session, deps, parsed);
  if (input.intent === "keep") {
    const note = parsed.type === "note"
      ? parsed
      : { type: "note", private: false, text: String(withoutAddress(input.text, input.session?.hearing) ?? "").trim() };
    return storeDecision(input, session, deps, note);
  }
  if (parsed.type === "read") return answerRead(input, session, deps, parsed);
  if (parsed.type === "recall") return answerRecall(input, session, deps);
  return storeDecision(input, session, deps, parsed);
}

/**
 * Bytes for a file a decision names. Recall does not call this.
 * A member who was not invited receives no bytes.
 */
export async function downloadFile(input, deps = {}) {
  const session = ensureSession(input.session);
  const memberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
  const name = typeof input.name === "string" ? input.name : "";
  if (!memberId) return { name: null, bytes: null, allow: "missing-member" };
  await loadIndex(session, deps);
  const roomId = input.room?.id || "";
  const decision = session.decisions.find((item) => {
    if (item.deleted || (roomId && item.roomId !== roomId)) return false;
    if (!checkInvite(memberId, item.inviteMemberIds).ok) return false;
    return item.fileNames?.some((file) => file.name === name);
  });
  if (!decision) return { name: null, bytes: null, allow: "not-invited" };
  const file = decision.fileNames.find((item) => item.name === name);
  if (!file || !deps.console?.download) return { name: file?.name ?? null, bytes: null, allow: "read" };
  try {
    const bytes = await deps.console.download({
      id: file.consoleFileId,
      name: file.name,
      folderId: typeof file.folderId === "string" ? file.folderId : "",
    });
    return { name: file.name, bytes: bytes ?? null, allow: "read" };
  } catch {
    return { name: file.name, bytes: null, allow: "read" };
  }
}

export function formatTripRead(data) {
  const trip = data?.trip ?? data?.issues ?? [];
  const open = data?.open ?? [];
  const lines = ["What tickets are open for the trip?", "team ROW"];
  lines.push("Matching the trip:");
  if (trip.length === 0) lines.push("No open Linear issue matched the trip.");
  for (const issue of trip) lines.push(issueLine(issue));
  if (open.length > 0) {
    lines.push("Open issues read from team ROW:");
    for (const issue of open) lines.push(issueLine(issue));
  }
  lines.push("This read created nothing.");
  return lines.join("\n");
}

function ensureSession(session) {
  session.deliveries ??= new Set();
  session.decisions ??= [];
  session.actions ??= [];
  session.activity ??= [];
  session.preferences ??= [];
  session.roomSettings ??= [];
  session.rooms ??= [];
  session.learned ??= [];
  session.accesses ??= [];
  session.log ??= [];
  session.events ??= [];
  session.items ??= [];
  session.spentYes ??= new Set();
  session.standingAllows ??= [];
  session.nextId ??= 1;
  return session;
}

function enters(input) {
  if (input.door !== "meeting") return true;
  if (input.addressed === true) return true;
  const hearing = input.session?.hearing;
  if (addressesHearing(input.text, hearing)) return true;
  // A clear remember-this keep enters on the meeting door even when STT
  // dropped Maple/Adam. Slack channel keep does not use this door.
  if (meetingRememberKeep(input.text, hearing)) return true;
  const roomId = meetingRoomId(input);
  if (!roomId) return false;
  const until = input.session?.hearingHold?.roomId === roomId ? input.session.hearingHold.until : 0;
  if (typeof until === "number" && until > Date.now()) {
    const speaker = meetingSpeakerKey(input);
    const holdSpeaker = input.session?.hearingHold?.speaker;
    if (speaker && holdSpeaker && speaker !== holdSpeaker) return false;
    return true;
  }
  return roomHearingArmed(input.session, roomId) && meetingRememberKeep(input.text, hearing);
}

function withoutAddress(text, hearing) {
  return stripHearing(text, hearing);
}

function releaseDelivery(session, deliveryId) {
  const id = byteTrim(String(deliveryId ?? "").trim(), 255);
  if (id && session?.deliveries?.delete) session.deliveries.delete(id);
}

function silence() {
  return {
    status: "recorded",
    kind: "silence",
    body: "",
    issueId: null,
    allow: "read",
    preference: null,
    link: null,
    entered: false,
    decisionId: null,
    actionId: null,
    checkpoint: null,
    objectLink: null,
    join: null,
    visible: [],
  };
}

async function answerRead(input, session, deps, parsed) {
  const preference = resolvePreference(session.preferences, parsed.tool, input.room?.id);
  const auth = authorize({ action: "read", tool: parsed.tool, preference });
  if (parsed.tool === "calendar") {
    let data = { unavailable: true, events: [] };
    try {
      data = await deps.calendar.readDay(parsed.day);
    } catch {
      data = { unavailable: true, events: [] };
    }
    const events = Array.isArray(data?.events) ? data.events.map((event) => String(event)).filter(Boolean) : [];
    const summary = data?.unavailable
      ? `The calendar could not be read. Sign in to Calendar again, then ask what is on ${parsed.day}.`
      : events.length
        ? `${parsed.day}: ${events.join(", ")}.`
        : `Nothing is on ${parsed.day}.`;
    const body = `${summary}\nrecorded\npreference ${preference}`;
    session.items.push({ kind: "answer", status: "recorded", text: body, issueId: null });
    return finish(session, {
      status: "recorded",
      kind: "answer",
      body,
      allow: auth.reason,
      preference,
    });
  }
  const data = await deps.linear.readOpenTripTickets();
  const body = `${formatTripRead(data)}\nrecorded\npreference ${preference}`;
  session.items.push({ kind: "answer", status: "recorded", text: body, issueId: null });
  return finish(session, {
    status: "recorded",
    kind: "answer",
    body,
    allow: auth.reason,
    preference,
  });
}

const FOLLOWUP_TOOLS = {
  create_issue: { kind: "assign_task", preference: "linear" },
  create_form: { kind: "create_form", preference: "forms" },
  update_event: { kind: "edit_calendar", preference: "calendar" },
};

function followupTitle(args) {
  const title = args?.title;
  return title ? String(title).trim() : "";
}

async function approveFollowup(input, session, deps) {
  const followup = input.followup;
  const mapped = FOLLOWUP_TOOLS[followup?.tool];
  if (!mapped || !followup?.id) return { ok: false, submitted: false, next: "This approval is not a connected action." };
  if (mapped.kind === "assign_task" || mapped.kind === "create_form") {
    const title = followupTitle(followup.args);
    if (!title) return { ok: false, submitted: false, next: "A title is required." };
  }
  let calendar = null;
  if (mapped.kind === "edit_calendar") {
    if (!(followup.args?.eventId || followup.args?.id)) return { ok: false, submitted: false, next: "The calendar event is required." };
    calendar = typeof deps.calendarFor === "function" ? await deps.calendarFor(input.memberId) : null;
    if (!calendar?.updateEventDetails) return { ok: false, submitted: false, next: "Connect Google Calendar, then approve again." };
  }
  if (typeof deps.followups?.authorizeExecution !== "function") return { ok: false, submitted: false, next: "Approval could not be checked." };
  const permitted = await deps.followups.authorizeExecution(input);
  if (!permitted) return { ok: false, submitted: false, next: "This approval is no longer valid." };
  const explicit = followup.explicit === true;
  const preference = explicit
    ? resolvePreference(session.preferences, mapped.preference, followup.meetingId)
    : "ask";
  const actionId = explicit && followup.existingActionId ? followup.existingActionId : followup.id;
  const permission = authorize({
    action: "write",
    tool: mapped.preference,
    preference,
    confirmed: true,
    actionId,
    confirmActionId: actionId,
  });
  if (!permission.allowed) return { ok: false, submitted: false, next: "This change was not approved." };
  if (explicit && followup.existingActionId) {
    const existing = session.actions.find((row) => row.id === followup.existingActionId);
    if (existing?.connectorId) return { ok: true, connectorId: existing.connectorId, submitted: true };
    if (existing) {
      if (mapped.kind === "edit_calendar") {
        const args = followup.args || {};
        const description = typeof args.description === "string" && args.description.trim();
        const time = args.start && args.end && Number.isFinite(Date.parse(args.start))
          && Number.isFinite(Date.parse(args.end)) && Date.parse(args.start) < Date.parse(args.end);
        if (!(args.eventId || args.id) || Boolean(description) === Boolean(time)
          || Object.keys(args).some((key) => !["eventId", "id", "start", "end", "description"].includes(key))) {
          return { ok: false, submitted: false, next: "Provide the event and a description or valid start and end times." };
        }
      }
      existing.params = { ...existing.params, ...followup.args };
      const result = await confirmAction(input, session, mapped.kind === "edit_calendar" ? { ...deps, calendar } : deps, existing.id);
      if (existing.connectorId) return { ok: true, connectorId: existing.connectorId, submitted: true };
      return { ok: false, submitted: result?.allow === "confirmed", next: "Check the connected tool before trying again." };
    }
    return { ok: false, submitted: false, next: "The original request could not be loaded. Refresh the meeting and try again." };
  }
  let ran;
  try {
    ran = await runApprovedAction({ kind: mapped.kind, tool: followup.tool, args: { ...followup.args, idempotencyKey: followup.id } }, {
      connector: mapped.kind === "create_form" ? deps.forms : deps.linear,
      formsConnector: deps.forms,
      calendar,
      callTool: deps.callTool || defaultFollowupCall,
    });
  } catch {
    return { ok: false, submitted: true, next: "Check the connected tool before trying again." };
  }
  if (ran?.ok === true && ran.connectorId) return { ok: true, connectorId: ran.connectorId, link: ran.link || "", submitted: true };
  if (ran?.submitted === true || (ran?.ok === true && !ran.connectorId)) {
    return { ok: false, submitted: true, next: ran?.next || "Check the connected tool before trying again." };
  }
  return { ok: false, submitted: false, next: ran.next };
}

async function defaultFollowupCall(connector, tool, args) {
  if (tool === "create_issue" && typeof connector?.createIssue === "function") {
    const created = await connector.createIssue({ title: args.title, idempotencyKey: args?.idempotencyKey });
    const connectorId = created?.identifier || created?.id || "";
    return { ok: Boolean(connectorId), connectorId, id: connectorId };
  }
  if (typeof connector?.call === "function") return connector.call(tool, args);
  return { ok: false, submitted: false };
}

async function requestWrite(input, session, deps, parsed) {
  const invited = writerInvite(input);
  const preference = input.voiceFile === true && parsed.tool === "linear"
    ? "do"
    : resolvePreference(session.preferences, parsed.tool, invited.room?.id || input.room?.id);
  if (!invited.ok) {
    if (invited.reason === "not-invited") await noteOutsideAsk(session, deps, input);
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${redact(parsed.statement)}\nrecorded\npreference ${preference}\n${invited.reason}`,
      allow: invited.reason,
      preference,
    });
  }
  const action = {
    id: stableActionId(input, deps),
    deliveryId: byteTrim(String(input.deliveryId ?? "").trim(), 255),
    roomId: invited.room.id,
    memberId: input.memberId,
    tool: parsed.tool,
    preference,
    statement: redact(parsed.statement),
    params: spokenParams(input, parsed),
    missingFact: parsed.missingFact || "",
    connectorId: null,
    edit: parsed.edit,
    inviteMemberIds: snapshot(input, invited.room),
    state: "waiting",
    speaker: displayName(input.memberId),
    source: activitySource(input),
    roomName: roomLabel(input, invited.room),
    offset: Number.isFinite(input.offset) ? input.offset : null,
  };
  if (action.deliveryId && session.actions.some((row) => row.id === action.id)) {
    return finish(session, { status: "recorded", kind: "duplicate", body: "duplicate-delivery", allow: "duplicate-delivery", outcome: "duplicate-delivery", actionId: action.id });
  }
  session.actions.push(action);
  if (action.missingFact) {
    action.state = "available";
    if (!await persistAction(deps, action)) return refusal(session, "memory-remember-failed");
    const gap = action.missingFact === "owner" ? "Who owns it?" : `missing fact: ${action.missingFact}`;
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${action.statement}\nrecorded\npreference ${preference}\n${gap}`,
      allow: "ask",
      preference,
      actionId: action.id,
      outcome: "missing-fact",
    });
  }
  const auth = authorize({ action: "write", tool: parsed.tool, preference });
  await noteActivity(session, deps, action, {
    role: "request",
    actor: action.speaker,
    actorKind: "person",
    outcome: auth.allowed ? "sent" : "paused",
  });
  if (!auth.allowed) {
    action.state = "paused";
    if (!await persistAction(deps, action)) {
      session.actions = session.actions.filter((row) => row !== action);
      session.deliveries.delete(action.deliveryId);
      return refusal(session, "memory-remember-failed");
    }
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${action.statement}\nrecorded\npreference ask\nRun automatically is off.`,
      allow: auth.reason,
      preference: "ask",
      actionId: action.id,
    });
  }
  action.state = "sending";
  if (!await persistAction(deps, action)) {
    session.actions = session.actions.filter((row) => row !== action);
    session.deliveries.delete(action.deliveryId);
    return refusal(session, "memory-remember-failed");
  }
  return callConnector(session, deps, action, auth);
}

async function confirmAction(input, session, deps, actionId) {
  const action = session.actions.find((item) => item.id === actionId);
  if (!action) {
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${actionId}\nrecorded\npreference ask`,
      allow: "ask",
      preference: "ask",
      actionId,
    });
  }
  const invited = confirmInvite(input, session, action);
  if (!invited.ok) {
    if (invited.reason === "not-invited") await noteOutsideAsk(session, deps, input);
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${invited.reason}\nrecorded\npreference ask`,
      allow: invited.reason,
      preference: action.preference,
      actionId: action.id,
    });
  }
  if (action.state === "dismissed" || action.state === "closed" || action.state === "sending" || action.state === "outcome_unknown" || action.connectorId || action.missingFact) {
    return finish(session, { status: "recorded", kind: "ticket", body: `${actionId}\nrecorded\npreference ask`, allow: "ask", preference: "ask", actionId });
  }
  const auth = authorize({
    action: "write",
    tool: action.tool,
    preference: "ask",
    confirmed: true,
    actionId: action.id,
    confirmActionId: actionId,
  });
  if (!auth.allowed) {
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${action.statement}\nrecorded\npreference ask`,
      allow: auth.reason,
      preference: "ask",
      actionId: action.id,
    });
  }
  action.state = "sending";
  if (!await persistAction(deps, action)) {
    action.state = "paused";
    return refusal(session, "memory-remember-failed");
  }
  return callConnector(session, deps, action, auth);
}

async function dismissAction(session, actionId, deps) {
  const action = session.actions.find((item) => item.id === actionId);
  if (action && (action.state === "waiting" || action.state === "paused")) {
    action.state = "dismissed";
    if (!await persistAction(deps, action)) { action.state = "paused"; return refusal(session, "memory-remember-failed"); }
  }
  return finish(session, {
    status: "recorded",
    kind: "ticket",
    body: `${actionId}\nrecorded\npreference ask`,
    allow: "ask",
    preference: "ask",
    actionId,
  });
}

async function callConnector(session, deps, action, auth) {
  if (!deps.actionClaims && deps.requireActionClaims) {
    action.state = "paused";
    await persistAction(deps, action);
    return finish(session, { status: "recorded", kind: "ticket", body: "The change could not be claimed. Try again when storage is available.", allow: "ask", preference: "ask", actionId: action.id });
  }
  if (deps.actionClaims) {
    let claimed;
    try {
      claimed = await deps.actionClaims.claim({ tenantId: deps.actionClaimTenantId || deps.tenantId, roomId: action.roomId, sourceId: action.deliveryId || action.id, action: action.tool });
    } catch {
      action.state = "paused";
      await persistAction(deps, action);
      return finish(session, { status: "recorded", kind: "ticket", body: "The change could not be claimed. Try again when storage is available.", allow: "ask", preference: "ask", actionId: action.id });
    }
    if (!claimed) {
      action.state = "outcome_unknown";
      await persistAction(deps, action);
      return didNotHappen(session, deps, action, auth, "");
    }
  }
  let created;
  try {
    created = await runConnector(deps, action);
  } catch (error) {
    action.state = "outcome_unknown";
    action.connectorId = null;
    const message = error instanceof Error ? error.message : "";
    noteConnectorFailure(deps, action, message, error?.rejected === true ? "rejected" : String(error?.reason || "threw"));
    await persistAction(deps, action);
    return didNotHappen(session, deps, action, auth, message);
  }
  const issueId = connectorId(created);
  const assigning = action.edit === "assign";
  const status = itemStatus({ kind: "ticket", edit: assigning ? "update" : action.edit }, issueId);
  if (status !== "filed" && status !== "updated") {
    noteConnectorFailure(deps, action, "", "no-id");
    action.state = "outcome_unknown";
    action.connectorId = null;
    await persistAction(deps, action);
    return didNotHappen(session, deps, action, auth, "");
  }
  action.state = "closed";
  action.connectorId = issueId;
  const savedReceipt = await persistAction(deps, action);
  if (!savedReceipt) {
    action.state = "outcome_unknown";
    return didNotHappen(session, deps, action, auth, "The result could not be saved. Check the connected tool before trying again.");
  }
  // An assignment edits an existing ticket; it never becomes another decision's ticket.
  const linked = assigning
    ? null
    : action.decisionId
      ? session.decisions.find((decision) => decision.id === action.decisionId && !decision.deleted)
      : session.decisions.find((decision) => decision.roomId === action.roomId && !decision.replacedBy && !decision.deleted);
  if (linked) {
    linked.connectorId = issueId;
    await remember(deps, {
      account: "company",
      kind: "decision",
      text: linked.text,
      idempotencyKey: `${linked.id}:${issueId}`,
      decision: decisionDocument(linked),
    });
  }
  if (assigning) await keepAssignment(session, deps, action, issueId);
  if (!assigning && !action.decisionId && deps.memory?.attachConnector) {
    try {
      await deps.memory.attachConnector(action.roomId, issueId);
    } catch {
      // The connector id is already on the session decision.
    }
  }
  session.items.push({ kind: "ticket", status, text: action.statement, issueId });
  await noteActivity(session, deps, action, {
    role: "action",
    actor: "Sederunt",
    actorKind: "sederunt",
    outcome: "done",
    entityId: issueId,
    url: typeof created?.permalink === "string" ? created.permalink : (typeof created?.url === "string" ? created.url : ""),
    undoToken: action.id,
  });
  await remember(deps, {
    account: "company",
    kind: "action",
    text: `${action.statement}\n${issueId}`,
    idempotencyKey: `${action.id}:${issueId}`,
  });
  return finish(session, {
    status,
    kind: "ticket",
    body: `${action.statement}\n${status}\npreference ${action.preference}\n${issueId}`,
    issueId,
    allow: auth.reason,
    preference: action.preference,
    actionId: action.id,
  });
}

/**
 * A confirmed assignment is kept as one company record in the action's room,
 * so recall in every door, and a reloaded ledger, can say who owns the ticket.
 */
async function keepAssignment(session, deps, action, issueId) {
  const assignee = String(action.params?.assignee || "").trim();
  if (!assignee) return;
  const decision = {
    id: nextId(session, "decision"),
    roomId: action.roomId,
    text: `${issueId} was assigned to ${assignee}.`,
    speakerMemberId: action.memberId,
    inviteMemberIds: [...(action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId])],
    area: "",
    contradicts: [],
    predecessorId: null,
    replaces: null,
    replacedBy: null,
    blobId: null,
    objectId: null,
    connectorId: issueId,
    kind: "decision",
    facts: [],
    checkpoint: null,
    spokenAt: new Date().toISOString(),
    fileNames: [],
    expiryEpoch: null,
    account: "company",
    sourceDeliveryId: action.deliveryId || "",
    deleted: false,
  };
  const saved = await remember(deps, {
    account: "company",
    kind: "decision",
    text: decision.text,
    idempotencyKey: `${action.id}:assigned`,
    decision: decisionDocument(decision),
  });
  if (saved?.blobId) decision.blobId = saved.blobId;
  session.decisions.push(decision);
}

async function runConnector(deps, action) {
  if (action.tool === "calendar") {
    if (typeof action.params?.description === "string" && (action.params.eventId || action.params.id)) {
      return deps.calendar.updateEventDetails({ id: action.params.eventId || action.params.id, description: action.params.description });
    }
    const tools = await deps.calendar.listTools();
    const writeTool = (tools ?? []).find((tool) => tool.write === true && tool.name);
    if (!writeTool) return { id: "" };
    return deps.calendar.call(writeTool.name, action.params);
  }
  if (action.tool === "slack") {
    const channel = await slackChannelFor(deps, action.params?.channel || "");
    if (!channel || typeof deps.slack?.postMessage !== "function") {
      const error = new Error("unsupported");
      error.reason = "unsupported";
      throw error;
    }
    action.params = { ...(action.params || {}), channel };
    const posted = await deps.slack.postMessage({
      channel,
      text: action.params.text || action.params.body || action.statement || "",
    });
    const ts = String(posted?.ts || "").trim();
    return { ...posted, id: ts, channel: posted?.channel || channel };
  }
  if (action.edit === "assign") {
    return deps.linear.assignIssue({ id: action.params.id, assignee: action.params.assignee });
  }
  return deps.linear.createIssue({
    title: action.params.title,
    idempotencyKey: action.id,
    description: [issueDescription({
      origin: { roomId: action.roomId, roomName: action.roomName, at: action.offset },
      actor: { type: "person", name: action.speaker || action.memberName || "" },
    }, deps), action.params?.heard ? `Heard: "${action.params.heard}"` : ""].filter(Boolean).join("\n\n"),
  });
}

/** A voice title answer keeps the words as heard when the title was cleaned up. */
function spokenParams(input, parsed) {
  const params = parsed.params;
  if (input.voiceFile !== true || parsed.tool !== "linear" || !params || typeof params !== "object") return params;
  const heard = redact(String(input.spokenTitle || "").replace(/\s+/g, " ").trim()).slice(0, 200);
  const fold = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!heard || fold(heard) === fold(params.title)) return params;
  return { ...params, heard };
}

/**
 * A connector call that failed left no trace (Nov 11 2026, bot 01ccb144: the
 * Linear save failed inside a second and nothing was logged). Log the tool and
 * a short error with secrets and the spoken title taken out.
 */
function noteConnectorFailure(deps, action, message, reason) {
  if (typeof deps?.log !== "function") return;
  let text = String(message || "").replace(/\s+/g, " ");
  for (const said of [action?.params?.title, action?.params?.text, action?.params?.heard, action?.statement]) {
    if (typeof said !== "string") continue;
    for (const form of [said.trim(), said.trim().replace(/[\s.!?,;:]+$/g, "")]) {
      if (form.length < 3) continue;
      text = text.replace(new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[title]");
    }
  }
  text = text
    .replace(/bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key|authorization)(["'\s:=]+)[^\s"',}]+/gi, "$1$2[redacted]")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "[redacted]")
    .slice(0, 240);
  try {
    deps.log({ kind: "connector-failed", tool: String(action?.tool || ""), edit: String(action?.edit || "create"), reason: String(reason || ""), message: text });
  } catch {}
}

async function didNotHappen(session, deps, action, auth, message) {
  session.items.push({ kind: "ticket", status: "recorded", text: action.statement, issueId: null });
  if (action.state !== "outcome_unknown") {
    await noteActivity(session, deps, action, {
      role: "failure",
      actor: "Sederunt",
      actorKind: "sederunt",
      outcome: "failed",
      error: failureText(message),
    });
  }
  return finish(session, {
    status: "recorded",
    kind: "ticket",
    body: `${action.statement}\nrecorded\npreference ${action.preference}\n${action.state === "outcome_unknown" ? "The result is uncertain. Check the connected tool before trying again." : "The edit did not happen."}`,
    allow: auth.reason,
    preference: action.preference,
    actionId: action.id,
  });
}

function connectorId(created) {
  return String(created?.identifier || created?.eventId || created?.id || "").trim();
}

function activitySource(input) {
  if (input?.door === "mcp") return `MCP: ${input.clientName || "client"}`;
  if (input?.door === "channel" || input?.room?.source === "slack") return "Slack";
  if (input?.door === "meeting") return input.room?.platform || "Google Meet";
  return "Console";
}

function roomLabel(input, room) {
  return input?.room?.name || input?.room?.channel || room?.name || room?.id || "";
}

function failureText(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 160) return "The change did not go through.";
  if (renderSafe(text) !== text) return "The change did not go through.";
  return text;
}

function renderSafe(text) {
  return text.replace(/0x[0-9a-fA-F]{6,}/g, "").replace(/\bBearer\s+\S+/gi, "").replace(/\blin_api_\S+/g, "");
}

function verbFor(action) {
  if (action.edit === "assign") return "assign";
  if (action.tool === "calendar") return "move";
  if (action.tool === "slack") return "post";
  return "create";
}

function activitySystem(action) {
  if (action.tool === "calendar") return "calendar";
  if (action.tool === "slack") return "slack";
  return "linear";
}

async function noteActivity(session, deps, action, fields) {
  if (action.tool === "slack") {
    const channel = await slackChannelFor(deps, action.params?.channel || "");
    if (channel) action.params = { ...(action.params || {}), channel };
  }
  const kind = fields.role === "failure" ? "failure" : (fields.role === "request" ? "request" : "action");
  const input = {
    // A session counter restarts in every function instance, so "activity-N" from
    // two instances named two different events (Walrus 409, Nov 11, bot ae224b81).
    id: activityIdentity(),
    requestId: action.id,
    actor: {
      type: fields.actorKind === "sederunt" ? "sederunt" : "person",
      name: fields.actorKind === "sederunt" ? "Sederunt" : displayName(fields.actor),
      via: fields.actorKind === "sederunt" ? "MCP: sederunt" : (action.source || "Console"),
    },
    verb: verbFor(action),
    target: {
      system: action.tool === "calendar" ? "calendar" : (action.tool === "slack" ? "slack" : "linear"),
      type: action.tool === "calendar" ? "event" : "issue",
      id: fields.entityId || action.params?.id || "",
      title: createTitle(action),
      url: fields.url || "",
      channel: action.tool === "slack" ? slackChannelId(action.params?.channel) : "",
    },
    changes: activityChanges(action),
    tool: { name: "act", server: "sederunt-mcp" },
    origin: {
      roomId: action.roomId || "",
      sourceDeliveryId: action.deliveryId || "",
      roomName: action.roomName || "",
      at: Number.isFinite(action.offset) ? action.offset : null,
    },
    outcome: kind === "failure" ? "failed" : "ok",
    error: kind === "failure" ? failureText(fields.error) : "",
    undo: kind === "action" && replaySupported({ verb: verbFor(action), target: { system: activitySystem(action) } }, "undo")
      ? { available: true, until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
      : undefined,
  };
  let event;
  try {
    event = kind === "request" ? logRequest(session, input) : (kind === "failure" ? logFailure(session, input) : logAction(session, input));
  } catch {
    return null;
  }
  await remember(deps, {
    account: "company",
    kind: "activity",
    text: renderActivity(event),
    idempotencyKey: event.id,
    activity: event,
  });
  return event;
}

function activityIdentity() {
  return `activity-${randomBytes(8).toString("hex")}`;
}

function actionFromEvent(event, changes) {
  const change = changes?.[0] || {};
  const system = event.target?.system || "linear";
  return {
    id: event.requestId || event.id,
    tool: system === "calendar" ? "calendar" : system === "slack" ? "slack" : "linear",
    edit: event.verb === "assign" ? "assign" : event.verb === "move" || event.verb === "reschedule" ? "update" : "create",
    params: {
      id: event.target?.id || "",
      assignee: change.to || "",
      title: event.target?.title || "",
      name: event.target?.title || "",
      day: change.to || "",
    },
    statement: event.target?.title || "",
    roomId: event.origin?.roomId || "",
    preference: "do",
  };
}

async function storeActivity(session, deps, event) {
  await remember(deps, {
    account: "company",
    kind: "activity",
    text: renderActivity(event),
    idempotencyKey: event.id,
    activity: event,
  });
  return event;
}

/**
 * Run the failed action through the connector again. A log row is written
 * only after the connector returns. `replayBusy` is an in-memory lock for
 * this process only. A second instance does not see it.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ linear?: object, calendar?: object, memory?: object }} deps
 * @param {string} failureId
 */
export async function replayFailure(session, deps, failureId) {
  const named = (session.activity || []).find((row) => row.id === failureId);
  if (!named) return { ok: false, reason: "missing" };
  if (named.kind !== "failure") return { ok: false, reason: "already" };
  if (named.resolved) return { ok: false, reason: "already" };
  if (alreadyRetried(session, named)) return { ok: false, reason: "already" };
  if (newerFailure(session, named)) return { ok: false, reason: "already" };
  if (newerSuccess(session, named)) return { ok: false, reason: "stale" };
  session.replayBusy ??= new Set();
  if (session.replayBusy.has(named.id)) return { ok: false, reason: "already" };
  session.replayBusy.add(named.id);
  try {
    const request = (session.activity || []).find((row) => row.requestId === named.requestId && row.kind === "request");
    const observed = await readCalendarEvent(deps, named);
    const undoing = Boolean(named.undoOf);
    const planned = undoing
      ? { ...named }
      : { ...named, changes: request?.changes?.length ? request.changes : named.changes };
    if (planned.target?.system === "slack") {
      if (named.channelMissing) return { ok: false, reason: "unsupported" };
      const channel = await slackChannelFor(
        deps,
        planned.target?.channel || channelChange(planned) || request?.target?.channel || channelChange(request) || "",
      );
      if (!channel) {
        named.channelMissing = true;
        return { ok: false, reason: "unsupported" };
      }
      named.channelMissing = false;
      named.target = { ...named.target, channel };
      planned.target = { ...planned.target, channel };
    }
    const plan = undoing && planned.target?.system === "linear"
      ? fieldUndoPlan(planned)
      : replayPlan(planned, "replay", observed, deps.app?.timeZone || "");
    if (!plan.ok) return plan;
    if (plan.method === "createIssue") {
      const speaker = request?.actor?.type === "person"
        ? request.actor
        : (named.actor?.type === "person" ? named.actor : { type: "person", name: "" });
      plan.args.description = issueDescription({ ...named, actor: speaker }, deps);
    }
    let created;
    try {
      created = await runReplay(deps, plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (error?.reason === "unsupported") return { ok: false, reason: "unsupported" };
      const honest = undoing
        ? (error?.partial ? "Part of the undo went through." : failureText(message))
        : (error?.partial ? "Part of the change went through." : failureText(message));
      const changes = undoing
        ? remainingChanges(planned.changes, error?.appliedIndexes, error?.partial)
        : named.changes;
      const event = logFailure(session, {
        ...effectOf(named, { error: honest, changes }),
        undoOf: undoing ? named.undoOf : "",
      });
      await storeActivity(session, deps, event);
      return { ok: false, reason: error?.partial ? "partial" : "failed", id: event.id };
    }
    if (!connectorSucceeded(named.target?.system, created)) {
      const event = logFailure(session, {
        ...effectOf(named, {
          error: failureText(created?.error || "The change did not go through."),
          changes: undoing ? planned.changes : named.changes,
        }),
        undoOf: undoing ? named.undoOf : "",
      });
      await storeActivity(session, deps, event);
      return { ok: false, reason: "failed", id: event.id };
    }
    if (undoing) {
      const undo = logUndo(session, {
        id: activityIdentity(),
        requestId: named.requestId || named.id,
        undoOf: named.undoOf,
        actor: { type: "sederunt", name: "Sederunt", via: "Console" },
        verb: named.verb,
        target: named.target,
        changes: planned.changes,
        tool: named.tool,
        origin: named.origin,
      });
      await storeActivity(session, deps, undo);
      await markResolved(session, deps, named);
      return { ok: true, id: undo.id };
    }
    const changes = plan.from ? [{ field: "start", from: plan.from, to: plan.to }] : (planned.changes || []);
    const event = logAction(session, {
      ...effectOf(named, { changes, target: appliedTarget(named, created, deps) }),
      retryOf: named.id,
      undo: replaySupported(named, "undo")
        ? { available: true, until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
        : { available: false, until: "" },
    });
    await storeActivity(session, deps, event);
    await markResolved(session, deps, named);
    await supersedeTarget(session, deps, named, event.id);
    return { ok: true, id: event.id };
  } finally {
    session.replayBusy.delete(named.id);
  }
}

/**
 * Reverse one action through the connector, then record the undo.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ linear?: object, calendar?: object, memory?: object }} deps
 * @param {string} id
 * @param {string} actorName
 */
export async function undoRecorded(session, deps, id, actorName) {
  const event = (session.activity || []).find((row) => row.id === id);
  const reason = undoRefusal(event);
  if (reason) return { ok: false, reason };
  if (!canUndo(event)) return { ok: false, reason: "unsupported" };
  const observed = await readCalendarEvent(deps, event);
  const plan = replayPlan(event, "undo", observed, deps.app?.timeZone || "");
  if (!plan.ok) return plan;
  try {
    const created = await runReplay(deps, plan);
    if (!connectorSucceeded(event.target?.system, created)) {
      const noted = logFailure(session, {
        ...effectOf(event, { error: failureText(created?.error || "The change did not go through.") }),
        undoOf: event.id,
      });
      await storeActivity(session, deps, noted);
      return { ok: false, reason: "failed", id: noted.id };
    }
  } catch (error) {
    if (error?.reason === "unsupported") return { ok: false, reason: "unsupported" };
    const partial = error?.partial;
    const changes = remainingChanges(event.changes, error?.appliedIndexes, partial);
    if (partial && event.undo) event.undo.available = false;
    const noted = logFailure(session, {
      ...effectOf(event, {
        error: partial ? "Part of the undo went through." : failureText(error instanceof Error ? error.message : ""),
        changes,
      }),
      undoOf: event.id,
    });
    await storeActivity(session, deps, noted);
    return { ok: false, reason: partial ? "partial" : "failed", id: noted.id };
  }
  const undo = logUndo(session, {
    id: activityIdentity(),
    requestId: event.requestId || event.id,
    undoOf: event.id,
    actor: { type: "person", name: displayName(actorName), via: "Console" },
    verb: event.verb,
    target: event.target,
    changes: event.changes,
    tool: event.tool,
    origin: event.origin,
  });
  await storeActivity(session, deps, undo);
  foldActivity(session);
  return { ok: true, id: undo.id };
}

function newerSuccess(session, failure) {
  const target = failure?.target || {};
  const at = Date.parse(failure?.ts || "") || 0;
  return (session.activity || []).some((row) => {
    if (!row || row.id === failure.id) return false;
    if (row.kind !== "action" && row.kind !== "result") return false;
    if (row.outcome === "undone" || row.superseded) return false;
    if ((row.target?.system || "") !== (target.system || "")) return false;
    const sameId = target.id && row.target?.id === target.id;
    const sameTitle = !target.id && target.title && row.target?.title === target.title;
    if (!sameId && !sameTitle) return false;
    if (!sameField(failure, row)) return false;
    return (Date.parse(row.ts || "") || 0) > at;
  });
}

function fieldSet(row) {
  return [...new Set((row?.changes || []).map((change) => String(change?.field || "").trim()).filter(Boolean))];
}

function sameField(left, right) {
  const fields = fieldSet(left);
  const other = fieldSet(right);
  if (fields.length && other.length) return fields.some((field) => other.includes(field));
  if (!fields.length && !other.length) return String(left?.verb || "") === String(right?.verb || "");
  return false;
}

function newerFailure(session, failure) {
  const at = Date.parse(failure?.ts || "") || 0;
  return (session.activity || []).some((row) => {
    if (!row || row.id === failure.id || row.kind !== "failure") return false;
    if ((row.requestId || "") !== (failure.requestId || "")) return false;
    return (Date.parse(row.ts || "") || 0) > at;
  });
}

function alreadyRetried(session, failure) {
  const at = Date.parse(failure?.ts || "") || 0;
  return (session.activity || []).some((row) => {
    if (!row || row.id === failure.id) return false;
    if (row.kind === "resolve" && row.refersTo === failure.id) return true;
    if (row.kind !== "action" && row.kind !== "result") return false;
    if (row.outcome === "undone") return false;
    if (row.retryOf === failure.id) return true;
    if (row.retryOf) return false;
    if ((row.requestId || "") !== (failure.requestId || "")) return false;
    if ((row.verb || "") !== (failure.verb || "")) return false;
    return (Date.parse(row.ts || "") || 0) > at;
  });
}

function connectorSucceeded(system, created) {
  if (system === "slack") return created?.ok === true;
  return Boolean(connectorId(created));
}

function appliedTarget(named, created, deps) {
  const previous = named.target || {};
  const title = previous.title || "";
  if (previous.system === "slack") {
    const ts = String(created?.ts || "").trim();
    const permalink = typeof created?.permalink === "string" ? created.permalink : slackPermalink(created);
    return {
      system: "slack",
      type: previous.type || "message",
      id: ts,
      title,
      url: permalink,
      channel: slackChannelId(created?.channel) || slackChannelId(previous.channel),
    };
  }
  if (named.verb === "create") {
    const id = String(created?.identifier || created?.id || "").trim();
    const url = (typeof created?.url === "string" && created.url)
    || (previous.system === "linear" || !previous.system ? linearIssueUrl(deps, id) : "");
    return {
      system: previous.system || "linear",
      type: previous.type || "issue",
      id,
      title,
      url,
      channel: "",
    };
  }
  const id = connectorId(created) || previous.id || "";
  const createdId = connectorId(created);
  const sameIssue = !createdId || createdId === previous.id;
  const connectorUrl = typeof created?.url === "string" && created.url ? created.url : "";
  const url = connectorUrl
    || (sameIssue ? (previous.url || "") : "")
    || ((previous.system || "") === "linear" ? linearIssueUrl(deps, id) : "");
  return {
    system: previous.system || "",
    type: previous.type || "",
    id,
    title,
    url,
    channel: "",
  };
}

function remainingChanges(changes, appliedIndexes, partial) {
  const rows = Array.isArray(changes) ? changes : [];
  if (!partial) return rows;
  const applied = new Set(appliedIndexes || []);
  return rows.filter((change, index) => change?.field && !applied.has(index));
}

async function slackChannelFor(deps, raw) {
  const direct = slackChannelId(raw);
  if (direct) return direct;
  if (!slackName(raw)) {
    // A post with no channel stays unresolved. The install does not pick a home channel.
    return slackChannelId(deps.app?.slackChannel);
  }
  if (typeof deps.slack?.resolveChannel !== "function") return "";
  try {
    return slackChannelId(await deps.slack.resolveChannel(raw));
  } catch {
    return "";
  }
}

/**
 * Resolve Slack channel names on failure rows before the page is built.
 * A name is listed only when one is present. A miss is unsupported.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ slack?: { resolveChannel?: Function }, app?: { slackChannel?: string } }} [deps]
 */
export async function hydrateSlackChannels(session, deps = {}) {
  const rows = (session?.activity || []).filter((row) => {
    if (!row || row.kind !== "failure" || row.target?.system !== "slack" || row.channelMissing) return false;
    const raw = row.target?.channel || channelChange(row) || "";
    return Boolean(slackName(raw)) && !slackChannelId(raw);
  });
  const names = [...new Set(rows.map((row) => slackName(row.target?.channel || channelChange(row))))];
  const found = new Map();
  for (const name of names) {
    found.set(name, await slackChannelFor(deps, name));
  }
  for (const row of rows) {
    const name = slackName(row.target?.channel || channelChange(row));
    const id = found.get(name) || "";
    if (!id) {
      row.channelMissing = true;
      continue;
    }
    row.channelMissing = false;
    row.target = { ...row.target, channel: id };
  }
}

function slackName(value) {
  const text = String(value || "").trim().replace(/^#/, "");
  if (!text || slackChannelId(text)) return "";
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(text) ? text : "";
}

function slackChannelId(value) {
  const text = String(value || "").trim();
  return /^[CDGW][A-Z0-9]{2,}$/.test(text) ? text : "";
}

function channelChange(event) {
  return (event?.changes || []).find((change) => change?.field === "channel")?.to || "";
}

function slackPermalink(created) {
  const channel = slackChannelId(created?.channel);
  const ts = String(created?.ts || "").trim();
  if (!channel || !ts) return "";
  return `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

function linearIssueUrl(deps, id) {
  const workspace = String(deps?.app?.linearWorkspace || "").trim();
  if (!workspace || !id) return "";
  return `https://linear.app/${encodeURIComponent(workspace)}/issue/${id}`;
}

function issueDescription(event, deps) {
  const room = event?.origin?.roomName || "";
  const roomId = event?.origin?.roomId || "";
  const speaker = event?.actor?.type === "person" ? event.actor.name : "";
  const at = Number.isFinite(event?.origin?.at) ? event.origin.at : null;
  const clock = at == null ? "" : `${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`;
  const origin = String(deps?.app?.origin || "").replace(/\/$/, "");
  const link = roomId && origin
    ? `${origin}/console/rooms/${encodeURIComponent(roomId)}${at == null ? "" : `#t=${at}`}`
    : "";
  const who = [speaker, clock && `at ${clock}`].filter(Boolean).join(" ");
  return [room && `From ${room}.`, who && `${who}.`, link].filter(Boolean).join(" ") || "Filed from a room.";
}

function effectOf(source, extra) {
  return {
    id: activityIdentity(),
    requestId: source.requestId || source.id,
    actor: { type: "sederunt", name: "Sederunt", via: source.actor?.via || "MCP" },
    verb: source.verb,
    target: extra.target || source.target,
    changes: extra.changes || source.changes,
    tool: source.tool,
    origin: source.origin,
    error: extra.error || "",
  };
}

async function markResolved(session, deps, failed) {
  const event = {
    id: activityIdentity(),
    requestId: failed.requestId || failed.id,
    kind: "resolve",
    refersTo: failed.id,
    actor: { type: "sederunt", name: "Sederunt", via: "Console" },
    verb: failed.verb || "update",
    target: failed.target || { system: "", type: "", id: "", title: "", url: "" },
    changes: [],
    tool: failed.tool || { name: "act", server: "sederunt-mcp" },
    origin: failed.origin || { roomId: "", roomName: "", at: null, messageUrl: "" },
    outcome: "ok",
    error: "",
    ts: new Date().toISOString(),
  };
  session.activity.push(event);
  await storeActivity(session, deps, event);
  foldActivity(session);
}

async function supersedeTarget(session, deps, source, keepId) {
  const id = source.target?.id || "";
  const title = source.target?.title || "";
  const system = source.target?.system || "";
  const fresh = [];
  for (const row of session.activity || []) {
    if (row.id === keepId || row.id === source.id) continue;
    if (row.kind !== "action" && row.kind !== "result") continue;
    if (row.superseded || row.outcome === "undone") continue;
    const same = row.target?.system === system && ((id && row.target?.id === id) || (!id && title && row.target?.title === title));
    if (!same || !sameField(source, row)) continue;
    const event = {
      id: activityIdentity(),
      requestId: row.requestId || row.id,
      kind: "supersede",
      refersTo: row.id,
      actor: { type: "sederunt", name: "Sederunt", via: "Console" },
      verb: row.verb || "update",
      target: row.target,
      changes: [],
      tool: row.tool || { name: "act", server: "sederunt-mcp" },
      origin: row.origin || { roomId: "", roomName: "", at: null, messageUrl: "" },
      outcome: "ok",
      error: "",
      ts: new Date().toISOString(),
    };
    session.activity.push(event);
    fresh.push(event);
  }
  foldActivity(session);
  for (const row of fresh) await storeActivity(session, deps, row);
}

function clipTitle(text) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (value.length <= 60) return value;
  const cut = value.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return (space > 30 ? cut.slice(0, space) : cut).trim();
}

function createTitle(action) {
  const titled = typeof action.params?.title === "string" ? action.params.title.trim() : "";
  const spoken = typeof action.statement === "string" ? action.statement.trim() : "";
  if (titled && titled !== spoken) return titled.slice(0, 80);
  const name = typeof action.params?.name === "string" ? action.params.name.trim() : "";
  if (name && name !== spoken) return name.slice(0, 80);
  return clipTitle(titled || name || spoken);
}

function activityChanges(action) {
  if (action.edit === "assign" && action.params?.assignee) {
    return [{ field: "assignee", from: "", to: displayName(action.params.assignee) }];
  }
  if (action.tool === "calendar" && action.params?.day) {
    return [{ field: "start", from: "", to: String(action.params.day) }];
  }
  if (action.tool === "slack") {
    const body = action.params?.text || action.params?.body || action.statement || "";
    const channel = slackChannelId(action.params?.channel);
    const changes = [];
    if (channel) changes.push({ field: "channel", to: channel });
    if (body) changes.push({ field: "body", to: String(body) });
    return changes;
  }
  return [];
}

async function storePreference(input, session, deps, parsed) {
  if (!input.memberId) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "missing-member\nrecorded\npreference ask",
      allow: "missing-member",
      preference: "ask",
    });
  }
  const roomId = parsed.roomId || "";
  const id = nextId(session, "preference");
  const replaced = [];
  for (const pref of session.preferences) {
    if (pref.tool === parsed.tool && (pref.roomId || "") === roomId && !pref.replacedBy) {
      pref.replacedBy = id;
      replaced.push(pref);
    }
  }
  const live = {
    id,
    tool: parsed.tool,
    value: parsed.value,
    roomId,
    replacedBy: null,
  };
  session.preferences.push(live);
  for (const pref of replaced) await remember(deps, preferenceMemory(pref));
  await remember(deps, preferenceMemory(live));
  return finish(session, {
    status: "recorded",
    kind: "note",
    body: `${parsed.tool} ${parsed.value}\nrecorded\npreference ${parsed.value}`,
    allow: "read",
    preference: parsed.value,
  });
}

async function storeRoomVoice(input, session, deps, parsed) {
  if (!input.memberId) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "missing-member\nrecorded\npreference ask",
      allow: "missing-member",
      preference: "ask",
    });
  }
  if (!parsed.roomId || (parsed.voice !== "short" && parsed.voice !== "plain" && parsed.voice !== "formal")) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "A voice is copied onto one room.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
    });
  }
  const setting = await replaceRoomSetting(session, deps, parsed.roomId, { voice: parsed.voice });
  const word = setting.voice === "short" ? "Short" : setting.voice === "formal" ? "Formal" : "Plain";
  return finish(session, {
    status: "recorded",
    kind: "note",
    body: `${word}\nrecorded\npreference ask`,
    allow: "read",
    preference: "ask",
  });
}

async function storeRoomClash(input, session, deps, parsed) {
  if (!input.memberId) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "missing-member\nrecorded\npreference ask",
      allow: "missing-member",
      preference: "ask",
    });
  }
  if (!parsed.roomId || typeof parsed.raiseClash !== "boolean") {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "A clash is raised in one room.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
    });
  }
  const setting = await replaceRoomSetting(session, deps, parsed.roomId, { raiseClash: parsed.raiseClash });
  const line = setting.raiseClash ? "This room will raise a clash here." : "This room will not raise a clash.";
  return finish(session, {
    status: "recorded",
    kind: "note",
    body: `${line}\nrecorded\npreference ask`,
    allow: "read",
    preference: "ask",
  });
}

async function replaceRoomSetting(session, deps, roomId, patch) {
  const id = nextId(session, "setting");
  const prior = liveRoomSetting(session.roomSettings, roomId);
  if (prior) prior.replacedBy = id;
  const setting = {
    id,
    roomId,
    voice: patch.voice || prior?.voice || "plain",
    raiseClash: typeof patch.raiseClash === "boolean" ? patch.raiseClash : prior?.raiseClash === true,
    replacedBy: null,
  };
  session.roomSettings.push(setting);
  if (prior) await remember(deps, roomSettingMemory(prior));
  await remember(deps, roomSettingMemory(setting));
  return setting;
}

function preferenceMemory(pref) {
  return {
    account: "company",
    kind: "preference",
    text: `${pref.tool} ${pref.value}`,
    idempotencyKey: pref.replacedBy ? `${pref.id}:replaced` : pref.id,
    preference: {
      id: pref.id,
      tool: pref.tool,
      value: pref.value,
      roomId: pref.roomId || "",
      replacedBy: pref.replacedBy || null,
    },
  };
}

const MEETING_PLATFORMS = new Set(["Google Meet", "Zoom", "Teams", "Webex"]);

/**
 * The meeting door has already sent the bot. This records the room so a
 * reload can show it. The link stays out of the document.
 */
async function openMeetingRoom(session, deps, opened) {
  const platform = typeof opened?.platform === "string" ? opened.platform : "";
  if (!MEETING_PLATFORMS.has(platform)) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "",
      allow: "read",
    });
  }
  const supplied = typeof opened?.id === "string" ? opened.id.trim() : "";
  const startedAt = typeof opened?.startedAt === "string" ? opened.startedAt : "";
  const room = {
    id: /^[A-Za-z0-9_-]{1,64}$/.test(supplied) ? supplied : nextId(session, "room"),
    kind: "meeting",
    platform,
    botPresent: true,
    call: "joining_call",
  };
  if (startedAt) room.startedAt = startedAt;
  const memberIds = copyMemberIds(opened?.memberIds);
  if (memberIds.length) room.memberIds = memberIds;
  session.rooms.push(room);
  await remember(deps, {
    account: "company",
    kind: "room",
    text: `${room.id} meeting`,
    idempotencyKey: room.id,
    room: {
      id: room.id,
      kind: "meeting",
      platform,
      call: "joining_call",
      ...(startedAt ? { startedAt } : {}),
      ...(memberIds.length ? { memberIds } : {}),
    },
  });
  return finish(session, {
    status: "recorded",
    kind: "note",
    body: "",
    allow: "read",
  });
}

function roomSettingMemory(setting) {
  return {
    account: "company",
    kind: "room",
    text: `${setting.roomId} ${setting.voice} ${setting.raiseClash ? "on" : "off"}`,
    idempotencyKey: setting.replacedBy ? `${setting.id}:replaced` : setting.id,
    roomSetting: {
      id: setting.id,
      roomId: setting.roomId,
      voice: setting.voice,
      raiseClash: setting.raiseClash === true,
      replacedBy: setting.replacedBy || null,
    },
  };
}

async function storeDecision(input, session, deps, parsed) {
  const keepClauses = splitAddressedKeepSentences(input.text, input.session?.hearing);
  if (keepClauses.length > 1) {
    let last = null;
    for (const clause of keepClauses) {
      const stripped = withoutAddress(clause, input.session?.hearing);
      if (!stripped) continue;
      last = await storeDecision(
        { ...input, text: clause, addressed: true },
        session,
        deps,
        { type: "note", private: parsed?.private === true, text: stripped },
      );
    }
    return last || silence();
  }
  if (isHuddle(input.room)) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "A Slack huddle is not a meeting.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
    });
  }
  const guest = normalizeHearing(input.session?.hearing).name;
  const speaker = typeof input.memberId === "string" ? input.memberId : "";
  if (speaker === "sederunt" || speaker.toLowerCase() === guest.toLowerCase()) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "No decision is stored.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
      outcome: "bot-line",
    });
  }
  const passage = parsed.private
    ? { sentence: parsed.text.replace(/^(?:private note|private)\s*:\s*/i, ""), facts: [] }
    : splitPassage(parsed.text);
  const sentence = redact(passage.sentence);
  if (!sentence) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "No decision is stored.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
    });
  }
  if (parsed.private) {
    const invite = checkInvite(input.memberId, input.memberId ? [input.memberId] : []);
    if (!invite.ok) return refusal(session, invite.reason);
    return keepDecision(input, session, deps, {
      text: sentence,
      facts: [],
      account: "personal",
      inviteMemberIds: [input.memberId],
      roomId: input.room?.id || "",
      kind: "note",
    });
  }
  const room = liveRoom(input);
  if (!room) return refusal(session, "no-room");
  const inviteMemberIds = meetingReaders(input, room);
  const invite = checkInvite(input.memberId, inviteMemberIds);
  if (!invite.ok) return refusal(session, invite.reason === "missing-member" ? "missing-member" : "not-invited");
  if (input.intent !== "keep" && looksLikeOpenQuestion(sentence)) {
    return finish(session, {
      status: "recorded",
      kind: "answer",
      body: "That question was not kept.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
      outcome: "question",
    });
  }
  const existing = session.decisions.find((item) =>
    !item.deleted && item.roomId === room.id && item.account !== "personal" && item.text === sentence && !item.replacedBy);
  if (existing) {
    const named = await namedFiles(input, deps, { text: sentence });
    const merged = mergeNamedFiles(existing.fileNames, named);
    if (!merged.changed.length) {
      return finish(session, {
        status: "recorded",
        kind: "note",
        body: "That sentence is already kept.\nrecorded\npreference ask",
        allow: "read",
        preference: "ask",
        outcome: "duplicate",
      });
    }
    existing.fileNames = merged.files;
    if (deps.memory?.remember) {
      const saved = await remember(deps, {
        account: existing.account,
        kind: existing.kind,
        text: existing.text,
        idempotencyKey: `${existing.id}:files:${fileSetFingerprint(merged.files)}`,
        decision: decisionDocument(existing),
      });
      if (!saved) return refusal(session, "memory-remember-failed");
    }
    return renderVisible(session, input.memberId, existing.roomId, null);
  }
  const learned = parseLearnedUtterance(sentence);
  return keepDecision(input, session, deps, {
    text: sentence,
    facts: passage.facts,
    account: "company",
    inviteMemberIds,
    roomId: room.id,
    kind: "decision",
    learned,
  });
}

async function keepLearned(session, deps, learned, decision) {
  const key = `${learnedKey(learned.kind, learned.text)}:${decision.id}`;
  if ((session.learned ?? []).some((item) => item.key === key)) return;
  const row = {
    key,
    kind: learned.kind,
    text: learned.text,
    at: new Date().toISOString(),
    verified: "unknown",
    roomId: decision.roomId,
    sourceDecisionId: decision.id,
    inviteMemberIds: [...decision.inviteMemberIds],
  };
  session.learned.push(row);
  await remember(deps, {
    account: "company",
    kind: learned.kind,
    text: learned.text,
    idempotencyKey: key,
    learned: { ...row },
  });
}

async function keepDecision(input, session, deps, draft) {
  // Uploads are kept even when the sentence never names them.
  // With no upload, a filename written in the sentence is still the candidate.
  const named = await namedFiles(input, deps, draft);
  const stamp = stampOf(input);
  const sourceDeliveryId = byteTrim(String(input.deliveryId ?? "").trim(), 255);
  const decision = {
    id: stableDecisionId(session, sourceDeliveryId),
    roomId: draft.roomId,
    text: draft.text,
    speakerMemberId: input.memberId,
    inviteMemberIds: [...draft.inviteMemberIds],
    area: input.decision?.area || "",
    contradicts: [...(input.decision?.contradicts ?? [])],
    predecessorId: input.decision?.replaces || null,
    replaces: input.decision?.replaces || null,
    replacedBy: null,
    blobId: null,
    objectId: null,
    connectorId: null,
    kind: draft.kind || "decision",
    facts: [...(draft.facts ?? [])],
    checkpoint: stamp,
    spokenAt: spokenAtFor(sourceDeliveryId),
    fileNames: named,
    expiryEpoch: null,
    account: draft.account,
    sourceDeliveryId,
    deleted: false,
  };
  if (deps.memory?.remember) {
    const saved = await remember(deps, {
      account: draft.account,
      kind: decision.kind,
      text: decision.text,
      // Slack deliveryId is stable across retries/isolates; nextId counters are not.
      idempotencyKey: sourceDeliveryId || decision.id,
      decision: decisionDocument(decision),
    });
    if (!saved) {
      releaseDelivery(session, input.deliveryId);
      return refusal(session, "memory-remember-failed");
    }
    decision.blobId = saved.blobId;
    decision.expiryEpoch = epochOf(saved.expiryEpoch);
    if (typeof saved.objectId === "string" && saved.objectId) decision.objectId = saved.objectId;
    if (typeof saved.digest === "string" && saved.digest) decision.digest = saved.digest;
    if (Number.isInteger(saved.checkpoint)) decision.checkpoint = saved.checkpoint;
    if (typeof saved.owner === "string" && /^0x[0-9a-fA-F]{64}$/.test(saved.owner)) decision.blobOwner = saved.owner;
    if (saved.blobId) session.trace.blobId = saved.blobId;
    if (decision.objectId) {
      await remember(deps, {
        account: draft.account,
        kind: decision.kind,
        text: decision.text,
        idempotencyKey: `${sourceDeliveryId || decision.id}:chain`,
        decision: decisionDocument(decision),
      });
    }
    await rememberObservedEpoch(deps, decision);
  }
  if (decision.replaces) {
    const previous = session.decisions.find((item) => item.id === decision.replaces);
    if (previous && !previous.replacedBy) previous.replacedBy = decision.id;
  }
  for (const otherId of decision.contradicts) {
    const other = session.decisions.find((item) => item.id === otherId);
    if (!other) continue;
    if (!Array.isArray(other.contradicts)) other.contradicts = [];
    if (!other.contradicts.includes(decision.id)) other.contradicts.push(decision.id);
  }
  session.decisions.push(decision);
  if (draft.learned) await keepLearned(session, deps, draft.learned, decision);
  session.items.push({ kind: "decision", status: "recorded", text: decision.text, issueId: null });
  return renderVisible(session, input.memberId, decision.roomId, null);
}

async function forgetDelivery(input, session, deps) {
  await loadIndex(session, deps);
  const sourceIds = [...new Set([input.forgetId, ...(Array.isArray(input.forgetIds) ? input.forgetIds : []), input.deliveryId]
    .map((value) => byteTrim(String(value ?? "").trim(), 255)).filter((id) => id && !id.startsWith("delete:")))];
  const roomId = input.room?.id || "";
  const matches = session.decisions.filter((item) => item.roomId === roomId && !item.deleted
    && (sourceIds.includes(item.sourceDeliveryId) || (!sourceIds.length && input.text && item.text === input.text)));
  if (!roomId || (!sourceIds.length && !matches.length)) return finish(session, {
    status: "recorded", kind: "note", body: "Nothing was deleted.", allow: "read", preference: "ask",
  });
  const actionId = sourceIds[0] || matches[0].id;
  const auth = authorize({ action: "delete", tool: "memory", preference: "ask", confirmed: true, actionId, confirmActionId: actionId });
  if (!auth.allowed) return refusal(session, auth.reason);
  if (deps.deletions) {
    try {
      await deps.deletions.request({ tenantId: deps.deletionTenantId, roomId, sourceIds, decisionIds: matches.map((item) => item.id) });
    } catch {
      session.deliveries.delete(input.deliveryId);
      return finish(session, { status: "failed", kind: "note", body: "Deletion could not be saved. Try again.", allow: auth.reason, preference: "ask", outcome: "deletion-failed" });
    }
    for (const decision of matches) decision.deleted = true;
    return finish(session, { status: "recorded", kind: "note", body: "Deletion requested. Hidden from Sederunt while memory cleanup is pending.", allow: auth.reason, preference: "ask", outcome: "deletion-pending", decisionId: matches[0]?.id });
  }
  for (const decision of matches) {
    const tombstone = { ...decision, deleted: true, text: "", fileNames: [] };
    const receipt = deps.memory?.remember ? await remember(deps, { account: decision.account || "company", kind: "decision", text: `${decision.id} deleted`, idempotencyKey: `${decision.id}:deleted`, decision: decisionDocument(tombstone) }) : null;
    if (!receipt) {
      session.deliveries.delete(input.deliveryId);
      return finish(session, { status: "failed", kind: "note", body: "Deletion could not be saved. Try again.", allow: auth.reason, preference: "ask", outcome: "deletion-failed" });
    }
    decision.deleted = true;
  }
  return finish(session, { status: "recorded", kind: "note", body: matches.length ? "deleted\nrecorded\npreference ask" : "Nothing was deleted.", allow: auth.reason, preference: "ask", decisionId: matches[0]?.id });
}

function attachedUploads(input) {
  const list = [];
  const seen = new Set();
  const push = (item) => {
    if (!item || typeof item.name !== "string") return;
    const name = item.name.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    list.push(item);
  };
  if (Array.isArray(input?.files)) {
    for (const item of input.files) push(item);
  }
  if (!list.length) push(input?.file);
  return list;
}

function fileNameKey(file) {
  return typeof file?.name === "string" ? file.name.trim().toLowerCase() : "";
}

function mergeNamedFiles(existing, incoming) {
  const files = (Array.isArray(existing) ? existing : []).map((file) => ({ ...file }));
  const byName = new Map();
  for (const file of files) {
    const key = fileNameKey(file);
    if (key) byName.set(key, file);
  }
  const changed = [];
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    const prior = byName.get(key);
    if (!prior) {
      const next = { ...item, name };
      files.push(next);
      byName.set(key, next);
      changed.push(next);
      continue;
    }
    let dirty = false;
    if (item.slackFileId && item.slackFileId !== prior.slackFileId) {
      prior.slackFileId = item.slackFileId;
      dirty = true;
    }
    if (item.consoleFileId && !prior.consoleFileId) {
      prior.consoleFileId = item.consoleFileId;
      if (item.folderId) prior.folderId = item.folderId;
      dirty = true;
    }
    if (dirty) changed.push(prior);
  }
  return { files, changed };
}

function fileSetFingerprint(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => `${fileNameKey(file)}:${typeof file?.slackFileId === "string" ? file.slackFileId : ""}`)
    .filter((part) => part && part !== ":")
    .sort()
    .join(",");
}

async function namedFiles(input, deps, draft) {
  const attached = attachedUploads(input);
  if (attached.length) {
    const out = [];
    for (const item of attached) {
      const name = item.name.trim();
      const bytes = item.bytes;
      const hasBytes = bytes != null && bytes !== "";
      const slackFileId = typeof item.id === "string" ? item.id.trim() : "";
      if (!hasBytes && !slackFileId) continue;
      try {
        const file = await nameFile(deps, name, hasBytes ? bytes : undefined, slackFileId);
        if (file) out.push(file);
      } catch {
        // One file must not abort the rest of a multi-file keep.
        if (name && slackFileId) {
          out.push({ name, consoleFileId: null, folderId: null, slackFileId });
        }
      }
    }
    return out;
  }
  const namedInText = FILE_NAME.exec(draft.text)?.[1] || "";
  if (!namedInText) return [];
  const file = await nameFile(deps, namedInText, undefined, "");
  return file ? [file] : [];
}

// The Slack attachment is always recorded by name (and Slack file id), so a
// resend can find it. The Console copy is best-effort and fills in its ids.
// When Slack already gave us a file id, do not wait for Console/Walrus publish
// (encrypt + poll can take up to 40s per file and a multi-file keep would
// overrun the function time limit before it can post "Kept …").
async function nameFile(deps, name, bytes, slackFileId = "") {
  const hasBytes = bytes != null && bytes !== "";
  if (!hasBytes && !slackFileId) return null;
  const file = { name, consoleFileId: null, folderId: null };
  if (slackFileId) file.slackFileId = slackFileId;
  if (hasBytes && deps.console?.upload && !slackFileId) {
    try {
      const uploaded = await deps.console.upload({ name, bytes });
      const id = typeof uploaded?.id === "string" ? uploaded.id.trim() : "";
      if (id) {
        file.consoleFileId = id;
        file.folderId = typeof uploaded?.folderId === "string" ? uploaded.folderId : null;
      }
    } catch {
      // Kept by name; the bytes are fetched again from Slack on resend.
    }
  }
  return file;
}

function stampOf(input) {
  if (input.checkpoint == null || input.knowableAtCheckpoint == null) return null;
  const stamp = acceptCheckpoint({
    checkpoint: input.checkpoint,
    knowableAtCheckpoint: input.knowableAtCheckpoint,
  });
  return stamp.ok ? stamp.stamp : null;
}

async function loadIndex(session, deps) {
  if (session.decisions.length > 0) return;
  if (!deps.memory?.index) return;
  let docs = [];
  try {
    docs = await deps.memory.index();
  } catch {
    return;
  }
  applyIndexedDocuments(session, docs, true);
}

async function loadSentences(session, deps) {
  if (!deps.memory?.recall) return;
  recordEvent(session, {
    kind: "memory",
    status: "recorded",
    preference: null,
    tool: "memory",
    outcome: "recall",
  });
  let docs = [];
  try {
    docs = await deps.memory.recall();
  } catch {
    return;
  }
  const byId = new Map();
  for (const doc of docs ?? []) {
    const decision = copyDecision(doc);
    if (!decision) continue;
    const previous = byId.get(decision.id);
    if (previous) foldDecision(previous, decision, false);
    else byId.set(decision.id, decision);
  }
  if (session.decisions.length === 0) {
    for (const decision of byId.values()) session.decisions.push(decision);
    return;
  }
  for (const decision of session.decisions) {
    const loaded = byId.get(decision.id);
    if (!loaded) continue;
    decision.text = loaded.text;
    decision.connectorId = loaded.connectorId ?? decision.connectorId;
    decision.deleted = decision.deleted === true || loaded.deleted === true;
    if (loaded.sourceDeliveryId) decision.sourceDeliveryId = loaded.sourceDeliveryId;
    decision.objectId = loaded.objectId ?? decision.objectId;
    decision.blobId = loaded.blobId ?? decision.blobId;
    decision.facts = loaded.facts;
    decision.checkpoint = loaded.checkpoint ?? decision.checkpoint;
    if (decision.expiryEpoch == null && loaded.expiryEpoch != null) decision.expiryEpoch = loaded.expiryEpoch;
    if (loaded.spokenAt) decision.spokenAt = loaded.spokenAt;
    if (Array.isArray(loaded.fileNames) && loaded.fileNames.length) {
      decision.fileNames = mergeNamedFiles(decision.fileNames, loaded.fileNames).files;
    }
  }
}

/**
 * Save a paused action the console can confirm after the process is gone.
 * absorbAction reloads this record. The connector does not run here.
 *
 * @param {{ memory?: { remember?: Function } }} deps
 * @param {object} action
 */
export async function rememberHeldAction(deps, action) {
  if (!action || typeof action.id !== "string" || typeof action.roomId !== "string" || !action.roomId
    || typeof action.memberId !== "string" || !action.memberId) return false;
  action.state = "paused";
  action.preference = "ask";
  action.connectorId = null;
  action.missingFact = "";
  action.params = { ...(action.params || {}) };
  action.inviteMemberIds = Array.isArray(action.inviteMemberIds) && action.inviteMemberIds.includes(action.memberId)
    ? [...action.inviteMemberIds]
    : [action.memberId];
  return persistAction(deps, action);
}

async function persistAction(deps, action) {
  const revision = (action.revision || 0) + 1;
  const inviteMemberIds = Array.isArray(action.inviteMemberIds) && action.inviteMemberIds.length ? [...action.inviteMemberIds] : [action.memberId].filter(Boolean);
  const record = { ...action, revision, params: { ...(action.params || {}) }, inviteMemberIds };
  const saved = await remember(deps, { account: "company", kind: "action", text: `action ${action.id} ${revision}`,
    idempotencyKey: `${action.id}:action:${revision}`, actionItem: { actionRecord: record } });
  if (!saved) return false;
  action.revision = revision;
  return true;
}

function absorbAction(session, document) {
  const row = document?.actionItem?.actionRecord;
  if (!row || typeof row.id !== "string" || typeof row.roomId !== "string" || typeof row.memberId !== "string"
    || !Array.isArray(row.inviteMemberIds) || !row.inviteMemberIds.includes(row.memberId)
    || !Number.isSafeInteger(row.revision) || row.revision < 1) return;
  const existing = session.actions.find((item) => item.id === row.id);
  if (existing && (existing.revision || 0) >= row.revision) return;
  const action = { ...row, params: { ...(row.params || {}) }, inviteMemberIds: [...row.inviteMemberIds] };
  if (action.state === "sending") action.state = "outcome_unknown";
  if (existing) Object.assign(existing, action);
  else { noteIssuedId(session, action.id); session.actions.push(action); }
}

function decisionDocument(decision) {
  return {
    id: decision.id,
    roomId: decision.roomId,
    text: decision.text,
    speakerMemberId: decision.speakerMemberId,
    inviteMemberIds: [...decision.inviteMemberIds],
    area: decision.area,
    kind: decision.kind || "decision",
    contradicts: [...decision.contradicts],
    predecessorId: decision.predecessorId,
    replaces: decision.replaces,
    replacedBy: decision.replacedBy,
    checkpoint: decision.checkpoint,
    spokenAt: typeof decision.spokenAt === "string" ? decision.spokenAt : "",
    blobId: decision.blobId ?? null,
    objectId: decision.objectId ?? null,
    digest: decision.digest ?? null,
    connectorId: decision.connectorId ?? null,
    sourceDeliveryId: typeof decision.sourceDeliveryId === "string" ? decision.sourceDeliveryId : "",
    deleted: decision.deleted === true,
    facts: [...(decision.facts ?? [])],
    fileNames: decision.fileNames.map((file) => ({
      name: file.name,
      consoleFileId: file.consoleFileId ?? null,
      folderId: file.folderId ?? null,
      ...(file.slackFileId ? { slackFileId: file.slackFileId } : {}),
    })),
    expiryEpoch: epochOf(decision.expiryEpoch),
    account: decision.account,
  };
}

function copyDecision(doc) {
  const decision = doc?.decision;
  if (!decision || typeof decision.id !== "string" || !Array.isArray(decision.inviteMemberIds)) return null;
  return {
    id: decision.id,
    roomId: decision.roomId ?? "",
    text: typeof decision.text === "string" ? decision.text : "",
    speakerMemberId: decision.speakerMemberId ?? "",
    inviteMemberIds: decision.inviteMemberIds.map(String),
    area: decision.area ?? "",
    kind: decision.kind || doc.kind || "decision",
    contradicts: Array.isArray(decision.contradicts) ? [...decision.contradicts] : [],
    predecessorId: decision.predecessorId ?? null,
    replaces: decision.replaces ?? null,
    replacedBy: decision.replacedBy ?? null,
    blobId: typeof doc.blobId === "string" ? doc.blobId : (typeof decision.blobId === "string" ? decision.blobId : null),
    objectId: typeof decision.objectId === "string" ? decision.objectId : null,
    digest: typeof decision.digest === "string" ? decision.digest : null,
    connectorId: typeof decision.connectorId === "string" ? decision.connectorId : null,
    sourceDeliveryId: typeof decision.sourceDeliveryId === "string" ? decision.sourceDeliveryId : "",
    deleted: decision.deleted === true,
    facts: Array.isArray(decision.facts) ? [...decision.facts] : [],
    checkpoint: decision.checkpoint ?? null,
    spokenAt: typeof decision.spokenAt === "string" ? decision.spokenAt : "",
    fileNames: Array.isArray(decision.fileNames) ? decision.fileNames.map((file) => ({ ...file })) : [],
    expiryEpoch: epochOf(decision.expiryEpoch),
    account: decision.account ?? doc.account ?? "company",
  };
}

function applyIndexedDocuments(session, docs, blankText) {
  const seen = new Set((session.decisions ?? []).map((item) => item.id));
  const epochs = new Map();
  for (const doc of docs ?? []) {
    absorbPreference(session, copyPreference(doc));
    absorbRoomSetting(session, copyRoomSetting(doc));
    absorbOpenedRoom(session, copyOpenedRoom(doc));
    absorbAccess(session, copyAccess(doc));
    absorbHearing(session, copyHearing(doc));
    absorbActivity(session, doc?.activity);
    absorbAction(session, doc);
    absorbLearned(session, doc);
    const observedId = typeof doc?.expiry?.decisionId === "string" ? doc.expiry.decisionId : "";
    const observed = epochOf(doc?.expiry?.expiryEpoch);
    if (observedId && observed != null && !epochs.has(observedId)) epochs.set(observedId, observed);
    const kind = doc?.decision?.kind || doc?.kind;
    if (kind !== "decision" && kind !== "note") continue;
    const decision = copyDecision(doc?.decision ? doc : { decision: doc });
    if (!decision) continue;
    if (seen.has(decision.id)) {
      const existing = session.decisions.find((item) => item.id === decision.id);
      if (existing) foldDecision(existing, decision, blankText);
      continue;
    }
    seen.add(decision.id);
    if (blankText) decision.text = "";
    noteIssuedId(session, decision.id);
    session.decisions.push(decision);
  }
  for (const decision of session.decisions) {
    const observed = epochs.get(decision.id);
    if (decision.expiryEpoch == null && observed != null) decision.expiryEpoch = observed;
  }
}

function foldDecision(existing, decision, blankText) {
  const wasDeleted = existing.deleted === true;
  existing.deleted = wasDeleted || decision.deleted === true;
  if (wasDeleted) return;
  if (!blankText && decision.text) existing.text = decision.text;
  if (typeof decision.connectorId === "string" && decision.connectorId) existing.connectorId = decision.connectorId;
  if (decision.sourceDeliveryId) existing.sourceDeliveryId = decision.sourceDeliveryId;
  if (Array.isArray(decision.fileNames) && decision.fileNames.length) {
    existing.fileNames = mergeNamedFiles(existing.fileNames, decision.fileNames).files;
  }
  if (Array.isArray(decision.inviteMemberIds) && decision.inviteMemberIds.length) {
    existing.inviteMemberIds = decision.inviteMemberIds.map(String);
  }
}

function absorbLearned(session, doc) {
  const learned = doc?.learned;
  const minutes = doc?.minutes;
  const actionItem = doc?.actionItem;
  const row = learned || (minutes ? { ...minutes, kind: "minutes" } : null) || (actionItem ? { ...actionItem, kind: "action-item" } : null);
  if (!row) return;
  const text = typeof row.text === "string" ? row.text : "";
  if (!text) return;
  const kind = row.kind || "memory";
  const key = typeof row.key === "string" && row.key ? row.key : `${kind}:${text}`;
  session.learned ??= [];
  if (session.learned.some((item) => item.key === key)) return;
  session.learned.push({
    key,
    kind,
    text,
    at: typeof row.at === "string" ? row.at : "",
    verified: "unknown",
    roomId: typeof row.roomId === "string" ? row.roomId : "",
    sourceDecisionId: typeof row.sourceDecisionId === "string" ? row.sourceDecisionId : "",
    inviteMemberIds: Array.isArray(row.inviteMemberIds) ? row.inviteMemberIds.filter((id) => typeof id === "string") : [],
  });
}

function copyHearing(doc) {
  const hearing = doc?.hearing;
  if (!hearing || typeof hearing !== "object") return null;
  const savedAt = typeof hearing.savedAt === "string" ? hearing.savedAt : "";
  return { ...normalizeHearing(hearing), savedAt };
}

function absorbHearing(session, hearing) {
  if (!hearing) return;
  const current = session.hearing;
  if (current?.savedAt && hearing.savedAt && current.savedAt > hearing.savedAt) return;
  session.hearing = hearing;
}

/**
 * Remember the meeting guest name and the extra words or sentences that address it.
 * The name is what the meeting shows. A trigger is a word or a sentence.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ memory?: { remember?: (input: object) => Promise<unknown> } }} deps
 * @param {{ name?: string, triggers?: string[] }} input
 */
export async function saveHearing(session, deps, input) {
  const current = ensureSession(session);
  const hearing = { ...normalizeHearing(input), savedAt: new Date().toISOString() };
  current.hearing = hearing;
  await remember(deps, {
    account: "company",
    kind: "hearing",
    text: `${hearing.name} ${hearing.triggers.join(" ")}`.trim(),
    idempotencyKey: `hearing:${hearing.savedAt}`,
    hearing,
  });
  return hearing;
}

function copyPreference(doc) {
  const pref = doc?.preference;
  if (!pref || typeof pref.id !== "string") return null;
  if (pref.tool !== "linear" && pref.tool !== "calendar") return null;
  if (pref.value !== "ask" && pref.value !== "do") return null;
  return {
    id: pref.id,
    tool: pref.tool,
    value: pref.value,
    roomId: typeof pref.roomId === "string" ? pref.roomId : "",
    replacedBy: typeof pref.replacedBy === "string" && pref.replacedBy ? pref.replacedBy : null,
  };
}

function copyRoomSetting(doc) {
  const setting = doc?.roomSetting;
  if (!setting || typeof setting.id !== "string" || typeof setting.roomId !== "string" || !setting.roomId) return null;
  if (setting.voice !== "short" && setting.voice !== "plain" && setting.voice !== "formal") return null;
  return {
    id: setting.id,
    roomId: setting.roomId,
    voice: setting.voice,
    raiseClash: setting.raiseClash === true,
    replacedBy: typeof setting.replacedBy === "string" && setting.replacedBy ? setting.replacedBy : null,
  };
}

function absorbPreference(session, pref) {
  if (!pref) return;
  noteIssuedId(session, pref.id);
  const existing = session.preferences.find((item) => item.id === pref.id);
  if (!existing) {
    session.preferences.push(pref);
    return;
  }
  if (pref.replacedBy && !existing.replacedBy) existing.replacedBy = pref.replacedBy;
}

function copySpokenLines(lines) {
  if (!Array.isArray(lines)) return [];
  const out = [];
  for (const line of lines) {
    const text = typeof line?.text === "string" ? line.text.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
    if (!text) continue;
    const speaker = typeof line?.speaker === "string" && line.speaker.trim() ? line.speaker.trim().slice(0, 80) : "Someone";
    const start = Number.isFinite(line?.start) ? line.start : 0;
    const end = Number.isFinite(line?.end) && line.end >= start ? line.end : start;
    out.push({ speaker, text, start, end });
    if (out.length >= 400) break;
  }
  return out;
}

function copyExchanges(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const user = typeof row?.user === "string" ? row.user.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
    const assistant = typeof row?.assistant === "string" ? row.assistant.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    if (!user && !assistant) continue;
    out.push({ user, assistant });
  }
  return out.slice(-3);
}

function copyOpenedRoom(doc) {
  const room = doc?.room;
  if (!room || typeof room.id !== "string" || !room.id) return null;
  if (room.kind !== "meeting") return null;
  const platform = MEETING_PLATFORMS.has(room.platform) ? room.platform : "";
  const call = meetingCallRank(room.call) ? room.call : "";
  if (!platform && !call) return null;
  const startedAt = typeof room.startedAt === "string" ? room.startedAt : "";
  const duration = Number.isFinite(room.duration) && room.duration > 0 ? Math.round(room.duration) : 0;
  const lines = copySpokenLines(room.lines);
  const exchanges = copyExchanges(room.exchanges);
  const memberIds = copyMemberIds(room.memberIds);
  return {
    id: room.id,
    kind: "meeting",
    platform,
    botPresent: true,
    ...(call ? { call } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(duration ? { duration } : {}),
    ...(memberIds.length ? { memberIds } : {}),
    ...(lines.length ? { lines } : {}),
    ...(exchanges.length ? { exchanges } : {}),
  };
}

function copyMemberIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids) {
    const value = String(id || "").trim().slice(0, 80);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 40) break;
  }
  return out;
}

function meetingReaders(input, room) {
  const ids = [];
  const push = (value) => {
    const id = String(value || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  const participants = Array.isArray(input?.participants) ? input.participants : [];
  const onDelivery = Array.isArray(room?.memberIds) ? room.memberIds : [];
  const stored = (input?.session?.rooms || []).find((item) => item && item.id === room?.id);
  const onRoom = Array.isArray(stored?.memberIds) ? stored.memberIds : [];
  const meeting = input?.door === "meeting" || room?.kind === "meeting" || room?.source === "recall";
  if (meeting) {
    for (const id of onRoom) push(id);
    for (const id of (participants.length ? participants : onDelivery)) push(id);
    if (ids.length) return ids;
  }
  for (const id of (participants.length ? participants : onDelivery)) push(id);
  return ids;
}

function absorbOpenedRoom(session, room) {
  if (!room) return;
  noteIssuedId(session, room.id);
  session.rooms ??= [];
  const existing = session.rooms.find((item) => item.id === room.id);
  if (existing) {
    if (!existing.platform && room.platform) existing.platform = room.platform;
    if (!existing.startedAt && typeof room.startedAt === "string" && room.startedAt) existing.startedAt = room.startedAt;
    if (room.duration > 0 && !(existing.duration > 0)) existing.duration = Math.round(room.duration);
    if (meetingCallRank(room.call) > meetingCallRank(existing.call)) existing.call = room.call;
    if (Array.isArray(room.lines) && room.lines.length > (Array.isArray(existing.lines) ? existing.lines.length : 0)) {
      existing.lines = room.lines;
    }
    if (Array.isArray(room.exchanges) && room.exchanges.length) existing.exchanges = room.exchanges.slice(-3);
    for (const id of copyMemberIds(room.memberIds)) {
      existing.memberIds = Array.isArray(existing.memberIds) ? existing.memberIds : [];
      if (!existing.memberIds.includes(id)) existing.memberIds.push(id);
    }
    return;
  }
  session.rooms.push(room);
}

/**
 * Remember a later Recall phase for a meeting the bot already opened.
 * An earlier phase does not replace a later one.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ memory?: { remember?: Function }, tenantId?: string }} deps
 * @param {string} roomId
 * @param {string} code
 */
export async function noteMeetingCall(session, deps, roomId, code) {
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!id || !meetingCallRank(code)) return false;
  const current = ensureSession(session);
  current.rooms ??= [];
  let room = current.rooms.find((item) => item.id === id);
  if (room && meetingCallRank(room.call) >= meetingCallRank(code)) return false;
  if (!room) {
    room = { id, kind: "meeting", platform: "", botPresent: true, call: code };
    current.rooms.push(room);
  } else {
    room.call = code;
  }
  const platform = MEETING_PLATFORMS.has(room.platform) ? room.platform : "";
  await remember(deps, {
    account: "company",
    kind: "room",
    text: `${id} meeting ${code}`,
    idempotencyKey: `${id}:call:${code}`,
    room: {
      id,
      kind: "meeting",
      ...(platform ? { platform } : {}),
      call: code,
      ...(typeof room.startedAt === "string" && room.startedAt ? { startedAt: room.startedAt } : {}),
      ...(room.duration > 0 ? { duration: Math.round(room.duration) } : {}),
    },
  });
  return true;
}

/**
 * Keep the spoken lines on the meeting. A later, longer transcript replaces
 * a shorter one. The remember text does not repeat the words.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ memory?: { remember?: Function }, tenantId?: string }} deps
 * @param {string} roomId
 * @param {Array<{ speaker?: string, text?: string, start?: number, end?: number }>} lines
 */
export async function noteMeetingLines(session, deps, roomId, lines) {
  const id = typeof roomId === "string" ? roomId.trim() : "";
  const spoken = copySpokenLines(lines);
  if (!id || !spoken.length) return false;
  const current = ensureSession(session);
  const room = current.rooms.find((item) => item.id === id);
  if (!room) return false;
  const previous = Array.isArray(room.lines) ? room.lines.length : 0;
  if (spoken.length > previous) room.lines = spoken;
  const platform = MEETING_PLATFORMS.has(room.platform) ? room.platform : "";
  const call = meetingCallRank(room.call) ? room.call : "";
  if ((!platform && !call) || previous >= spoken.length) return spoken.length > previous;
  const exchanges = copyExchanges(room.exchanges);
  await remember(deps, {
    account: "company",
    kind: "room",
    text: `${id} meeting transcript`,
    idempotencyKey: `${id}:transcript:${room.lines.length}`,
    room: {
      id,
      kind: "meeting",
      ...(platform ? { platform } : {}),
      ...(call ? { call } : {}),
      ...(typeof room.startedAt === "string" && room.startedAt ? { startedAt: room.startedAt } : {}),
      ...(room.duration > 0 ? { duration: Math.round(room.duration) } : {}),
      lines: room.lines,
      ...(exchanges.length ? { exchanges } : {}),
    },
  });
  return true;
}

function copyAccess(doc) {
  const access = doc?.access;
  if (!access || typeof access.id !== "string" || !access.id) return null;
  if (typeof access.roomId !== "string" || !access.roomId) return null;
  const speaker = typeof access.speaker === "string" ? access.speaker.trim() : "";
  if (!speaker) return null;
  return { id: access.id, roomId: access.roomId, speaker };
}

function absorbAccess(session, access) {
  if (!access) return;
  noteIssuedId(session, access.id);
  session.accesses ??= [];
  if (session.accesses.some((item) => item.id === access.id)) return;
  if (session.accesses.some((item) => item.roomId === access.roomId && item.speaker === access.speaker)) return;
  session.accesses.push(access);
}

function absorbRoomSetting(session, setting) {
  if (!setting) return;
  noteIssuedId(session, setting.id);
  const existing = session.roomSettings.find((item) => item.id === setting.id);
  if (!existing) {
    session.roomSettings.push(setting);
    return;
  }
  if (setting.replacedBy && !existing.replacedBy) existing.replacedBy = setting.replacedBy;
}

function noteIssuedId(session, id) {
  const match = /-(\d+)$/.exec(String(id || ""));
  if (!match) return;
  const number = Number(match[1]);
  if (Number.isInteger(number) && number >= session.nextId) session.nextId = number + 1;
}

function liveRoomSetting(settings, roomId) {
  let chosen = null;
  for (const setting of settings ?? []) {
    if (setting.roomId !== roomId || setting.replacedBy) continue;
    const rank = noteRank(setting.id);
    if (!chosen || rank >= noteRank(chosen.id)) chosen = setting;
  }
  return chosen;
}

function noteRank(id) {
  const match = /-(\d+)$/.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

function keptInWorkspace(decision, scope) {
  const personal = decision.account === "personal" || decision.kind === "note";
  if (scope === "personal") return decision.account === "personal";
  if (scope === "company") return !personal;
  return true;
}

async function answerRecall(input, session, deps) {
  const memberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
  if (!memberId) return refusal(session, "missing-member");
  const scope = input.workspace === "personal" || input.workspace === "company" ? input.workspace : "";
  await loadIndex(session, deps);
  const roomId = input.room?.id || "";
  const candidates = session.decisions.filter((decision) =>
    !decision.deleted && (!roomId || decision.roomId === roomId) && keptInWorkspace(decision, scope));
  const principal = input.readPrincipal || memberId;
  const visible = candidates.filter((decision) => canReadRecord(principal, decision));
  if (visible.length === 0) {
    const reason = candidates.length === 0 ? "there are no notes yet" : "not-invited";
    if (reason === "not-invited") await noteOutsideAsk(session, deps, input, candidates);
    return refusal(session, reason);
  }
  await loadSentences(session, deps);
  const proofs = new Map();
  let failed = false;
  const proving = visible.filter((decision) => decision.blobId && deps.tatum?.getObject);
  let batched = null;
  if (proving.length > 1 && typeof deps.tatum.getObjects === "function") {
    try {
      const results = await deps.tatum.getObjects(proving.map((decision) => ({
        id: proofTarget(decision),
        hints: proofHints(decision),
      })));
      batched = new Map(proving.map((decision, index) => [decision.id, results?.[index] || { ok: false }]));
    } catch {
      batched = new Map(proving.map((decision) => [decision.id, { ok: false }]));
    }
  }
  for (const decision of proving) {
    try {
      const object = batched
        ? (batched.get(decision.id)?.ok ? batched.get(decision.id).object : null)
        : await deps.tatum.getObject(decision.blobId);
      if (!object) throw new Error("Tatum read failed");
      const text = typeof object?.text === "string" && object.text.trim() ? object.text : decision.text;
      proofs.set(decision.id, {
        failed: false,
        text: redact(text),
        checkpoint: object?.checkpoint ?? null,
        objectId: typeof object?.objectId === "string" ? object.objectId : null,
      });
      if (object?.proof?.status) decision.proofStatus = object.proof.status;
      if (object?.proof?.status === "verified" && typeof object.objectId === "string" && object.objectId) decision.objectId = object.objectId;
    } catch {
      failed = true;
      proofs.set(decision.id, { failed: true });
    }
  }
  return renderVisible(session, principal, roomId, proofs, failed, scope, input.text);
}

function renderVisible(session, memberId, roomId, proofs, failed = false, scope = "", question = "") {
  const preference = resolvePreference(session.preferences, "linear", roomId);
  const statuses = clashStatuses(session.decisions.filter((decision) => keptInWorkspace(decision, scope) && canReadRecord(memberId, decision)));
  const statusOf = new Map(statuses.map((row) => [row.id, row.status]));
  const lines = [];
  const visible = [];
  let lastStatus = "recorded";
  let lastId = null;
  let sawSentence = false;
  let sawUnknown = false;
  let objectLink = null;
  for (const decision of session.decisions) {
    if (decision.deleted || !keptInWorkspace(decision, scope)) continue;
    if (roomId && decision.roomId !== roomId) continue;
    if (!canReadRecord(memberId, decision)) continue;
    const proof = proofs?.get(decision.id);
    if (proof?.failed) {
      lines.push("unknown");
      visible.push(visibleRow(decision, "", "unknown", false));
      sawUnknown = true;
      lastStatus = "unknown";
      lastId = decision.id;
      continue;
    }
    const text = proof?.text ?? decision.text;
    const status = statusOf.get(decision.id) || "recorded";
    if (proof?.objectId && decision.objectId === proof.objectId) objectLink = `/object/${encodeURIComponent(proof.objectId)}`;
    lines.push(text, status);
    visible.push(visibleRow(decision, text, status, true));
    if (text) session.lastSpoken = text;
    if (decision.connectorId) lines.push(decision.connectorId);
    if (proof?.checkpoint != null) lines.push(`checkpoint ${proof.checkpoint}`);
    lastStatus = status;
    lastId = decision.id;
    sawSentence = true;
  }
  lines.push(`preference ${preference}`);
  const status = sawUnknown && !sawSentence ? "unknown" : lastStatus;
  const checkpoint = [...(proofs?.values() ?? [])].find((proof) => proof && !proof.failed && proof.checkpoint != null)?.checkpoint ?? null;
  const shaped = question
    ? shapeAnswer({
      question,
      sentences: visible.map((row) => row.text).filter(Boolean),
      memories: memoriesFor(readableSession(session, memberId)),
    })
    : null;
  let body = lines.join("\n");
  let learned = "";
  let why = [];
  if (shaped && (shaped.replaced || shaped.appended) && shaped.text) {
    body = [shaped.text, status, `preference ${preference}`].filter(Boolean).join("\n");
    learned = shaped.text;
  }
  if (shaped?.why?.length) why = shaped.why;
  return finish(session, {
    status: failed && !sawSentence ? "unknown" : status,
    kind: "answer",
    body,
    allow: "read",
    preference,
    checkpoint,
    decisionId: lastId,
    objectLink,
    visible,
    learned,
    why,
  });
}

function visibleRow(decision, text, status, known) {
  const names = known
    ? (Array.isArray(decision.fileNames) ? decision.fileNames : [])
      .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
      .filter(Boolean)
    : [];
  return {
    id: decision.id,
    text: redact(text || ""),
    status,
    fileName: names[0] || null,
    fileNames: names,
    connectorId: known && decision.connectorId ? decision.connectorId : null,
  };
}

function refusal(session, reason) {
  const preference = resolvePreference(session.preferences, "linear", "");
  return finish(session, {
    status: "recorded",
    kind: "answer",
    body: `${reason === "no-room" ? "No decision is stored because the bot is not in this room." : reason}\nrecorded\npreference ${preference}`,
    allow: reason === "missing-member" || reason === "not-invited" ? reason : "read",
    preference,
    outcome: reason,
  });
}

/**
 * A console confirm names the action and the member. It does not send a room.
 * The room is the one stored on the action. The invite is the decision's,
 * or the member who asked when the action has no decision.
 * A meeting hold can also be confirmed by the signed-in person bound to that
 * room's Recall participant, or by a console user named on the hold.
 */
function confirmInvite(input, session, action) {
  if (isHuddle(input.room)) return { ok: false, reason: "not-invited" };
  const roomId = typeof action.roomId === "string" ? action.roomId.trim() : "";
  if (!roomId) return { ok: false, reason: "not-invited" };
  const decision = action.decisionId
    ? (session.decisions ?? []).find((item) => item.id === action.decisionId && !item.deleted)
    : null;
  if (action.decisionId && !decision) return { ok: false, reason: "not-invited" };
  const inviteMemberIds = decision
    ? decision.inviteMemberIds
    : (typeof action.memberId === "string" && action.memberId.trim() ? [action.memberId] : []);
  const direct = checkInvite(input.memberId, inviteMemberIds);
  if (direct.ok || decision) return direct;
  const held = Array.isArray(action.inviteMemberIds) && action.inviteMemberIds.length
    ? action.inviteMemberIds
    : inviteMemberIds;
  const identities = Array.isArray(input.principal?.identities) ? input.principal.identities : [];
  const meeting = action.source === "Google Meet";
  const bound = meeting && identities.some((identity) =>
    typeof identity?.roomId === "string"
    && identity.roomId === roomId
    && checkInvite(identity.memberId, held).ok);
  if (bound) return { ok: true, reason: "invited" };
  const principalId = typeof input.principal?.memberId === "string" ? input.principal.memberId.trim() : "";
  if (meeting && principalId && principalId === String(input.memberId || "").trim() && checkInvite(principalId, held).ok) {
    return { ok: true, reason: "invited" };
  }
  return direct;
}

function writerInvite(input) {
  if (isHuddle(input.room)) return { ok: false, reason: "not-invited", room: null };
  const room = liveRoom(input);
  const inviteMemberIds = room
    ? (Array.isArray(input.participants) && input.participants.length ? input.participants : (room.memberIds ?? []))
    : [];
  const invite = checkInvite(input.memberId, inviteMemberIds);
  if (!invite.ok || !room) return { ok: false, reason: invite.reason, room: null };
  return { ok: true, reason: invite.reason, room };
}

function liveRoom(input) {
  const room = input.room;
  if (!room || room.botPresent !== true) return null;
  if (isHuddle(room)) return null;
  if (!room.id) return null;
  return room;
}

function isHuddle(room) {
  if (!room) return false;
  return room.source === "slack-huddle" || room.kind === "huddle";
}

/**
 * One company row per speaker per room. The document names who asked.
 * It does not keep the utterance or a decision sentence. A missing member,
 * a personal note, a room with no notes, and a huddle store nothing.
 */
async function noteOutsideAsk(session, deps, input, candidates) {
  const speaker = typeof input?.memberId === "string" ? input.memberId.trim() : "";
  if (!speaker || isHuddle(input?.room) || input?.workspace === "personal") return;
  session.accesses ??= [];
  for (const roomId of outsideRoomIds(input, candidates)) {
    if (session.accesses.some((row) => row.roomId === roomId && row.speaker === speaker)) continue;
    const row = { id: nextId(session, "access"), roomId, speaker };
    session.accesses.push(row);
    await remember(deps, {
      account: "company",
      kind: "access",
      text: `${row.id} asked`,
      idempotencyKey: byteTrim(`access:${roomId}:${speaker}`, 255),
      access: { id: row.id, roomId, speaker },
    });
  }
}

function outsideRoomIds(input, candidates) {
  const named = typeof input?.room?.id === "string" ? input.room.id.trim() : "";
  if (named) return [named];
  const ids = [];
  for (const decision of candidates ?? []) {
    if (decision?.account === "personal" || decision?.kind === "note") continue;
    const roomId = typeof decision?.roomId === "string" ? decision.roomId.trim() : "";
    if (roomId && !ids.includes(roomId)) ids.push(roomId);
  }
  return ids;
}

function snapshot(input, room) {
  const ids = Array.isArray(input.participants) && input.participants.length > 0
    ? input.participants.map(String)
    : [...(room.memberIds ?? [])];
  const speaker = typeof input.memberId === "string" ? input.memberId.trim() : "";
  if (speaker && !ids.includes(speaker)) ids.push(speaker);
  return ids;
}

/**
 * The memory idempotency key. A room record is written by more than one isolate,
 * each from its own copy of the room, so the same key can carry different content
 * (Walrus answers 409). The content fingerprint keeps a true retry on one key and
 * gives a different room snapshot its own key.
 */
const FINGERPRINTED = { room: "room", activity: "activity" };

export function memoryKey(document) {
  const base = String(document.idempotencyKey || document.text || "");
  // Room snapshots and activity rows are written in the background by more than
  // one instance. Decisions, action revisions and other records keep their plain
  // key: a second copy with other content is refused on purpose. For an action,
  // "<id>:action:<revision>" is the guard that stops two instances from writing
  // different states (say "sending" and "dismissed") as the same revision.
  const field = FINGERPRINTED[document.kind];
  const payload = field ? document[field] : null;
  if (!payload || typeof payload !== "object") return byteTrim(base, 255);
  let body = "";
  try { body = JSON.stringify(payload); } catch { body = ""; }
  const print = createHash("sha256").update(`${document.text || ""}\n${body}`, "utf8").digest("hex").slice(0, 12);
  return `${byteTrim(base, 242)}:${print}`;
}

async function remember(deps, document) {
  if (document?.kind === "activity" && document.activity && typeof deps?.mirrorActivity === "function") {
    // A room-scoped copy any instance can read at once; Walrus search lags.
    try { await deps.mirrorActivity(document.activity); } catch { /* the Walrus write below still runs */ }
  }
  if (!deps.memory?.remember) return { blobId: null };
  try {
    const saved = await deps.memory.remember({
      account: document.account,
      kind: document.kind,
      text: document.text,
      idempotencyKey: memoryKey(document),
      private: document.account === "personal",
      decision: document.decision,
      preference: document.preference,
      roomSetting: document.roomSetting,
      expiry: document.expiry,
      room: document.room,
      access: document.access,
      hearing: document.hearing,
      activity: document.activity,
      learned: document.learned,
      minutes: document.minutes,
      actionItem: document.actionItem,
    });
    const blobId = saved && typeof saved.blobId === "string" ? saved.blobId : null;
    return {
      blobId,
      expiryEpoch: epochOf(saved?.expiryEpoch),
      objectId: typeof saved?.objectId === "string" ? saved.objectId : null,
      digest: typeof saved?.digest === "string" ? saved.digest : null,
      checkpoint: Number.isInteger(saved?.checkpoint) ? saved.checkpoint : null,
      owner: typeof saved?.owner === "string" ? saved.owner : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "remember failed");
    if (typeof deps.log === "function") {
      deps.log({ kind: "memory-remember-error", message: message.slice(0, 240), account: document.account || "", kindName: document.kind || "" });
    }
    return null;
  }
}

/**
 * The epoch is known only after the sentence blob exists.
 * The extra document names that decision. It is not a second sentence,
 * and it does not replace the blob the proof reads. Nothing here extends the blob.
 */
async function rememberObservedEpoch(deps, decision) {
  if (decision.expiryEpoch == null || decision.account === "personal") return;
  await remember(deps, {
    account: decision.account,
    kind: "expiry",
    text: `${decision.id} epoch`,
    idempotencyKey: `${decision.id}:expiry`,
    expiry: { decisionId: decision.id, expiryEpoch: decision.expiryEpoch },
  });
}

function epochOf(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function finish(session, fields) {
  const status = fields.status;
  const issueId = status === "filed" || status === "updated" ? fields.issueId || null : null;
  const body = redact(fields.body ?? "");
  const result = {
    status,
    kind: fields.kind ?? "note",
    body,
    issueId,
    allow: fields.allow ?? "read",
    preference: fields.preference ?? null,
    link: issueId,
    entered: true,
    decisionId: fields.decisionId ?? null,
    actionId: fields.actionId ?? null,
    checkpoint: fields.checkpoint ?? null,
    objectLink: fields.objectLink ?? null,
    join: session.trace?.join ?? null,
    visible: Array.isArray(fields.visible) ? fields.visible : [],
    outcome: fields.outcome ?? null,
  };
  if (typeof fields.learned === "string" && fields.learned) result.learned = fields.learned;
  if (Array.isArray(fields.why) && fields.why.length) result.why = fields.why;
  session.log.push(body);
  recordEvent(session, {
    kind: result.kind,
    status: result.status,
    preference: result.preference,
    tool: fields.tool || "",
    outcome: fields.outcome || result.allow || result.status,
    blobId: fields.blobId || session.trace?.blobId || null,
  });
  if (session.trace) session.trace.blobId = null;
  return result;
}

function recordEvent(session, fields) {
  const event = gateEvent(session.trace, {
    ...fields,
    keyPresent: KEY_NAMES.some((name) => Boolean(process.env[name])),
  });
  session.events.push(event);
  if (typeof session.emit === "function") session.emit(event);
}

function nextId(session, prefix) {
  const id = `${prefix}-${session.nextId}`;
  session.nextId += 1;
  return id;
}

function stableActionId(input, deps) {
  const deliveryId = String(input.deliveryId || "").trim();
  if (!deliveryId) return `action-${randomBytes(16).toString("hex")}`;
  const scope = JSON.stringify([deps.tenantId || "", input.room?.id || "", deliveryId]);
  return `action-${createHash("sha256").update(scope).digest("hex").slice(0, 32)}`;
}

/** Slack (and similar) delivery ids must mint one stable decision id so MemWal
 * idempotency keys do not collide across cold isolates that all restart nextId at 1. */
function stableDecisionId(session, deliveryId) {
  const src = byteTrim(String(deliveryId ?? "").trim(), 255);
  if (!src) return nextId(session, "decision");
  const safe = src.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return `decision-${safe}`;
}

/** Derive spokenAt from a Slack message ts (seconds.micros) so retries share one payload. */
function spokenAtFor(deliveryId) {
  const src = String(deliveryId ?? "").trim();
  const match = /^(\d{10})(?:\.(\d+))?$/.exec(src);
  if (match) {
    const ms = Number(match[1]) * 1000;
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function byteTrim(value, max) {
  let text = String(value ?? "");
  while (Buffer.byteLength(text) > max) text = text.slice(0, -1);
  return text;
}

function issueLine(issue) {
  return [issue.identifier || issue.id, issue.title, issue.status || issue.state]
    .filter(Boolean)
    .join(" ");
}

/**
 * Company decisions for the room screen. Recall still checks the invite.
 * A private note stays out. Nothing here is a blob id or a key.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {string} [roomId]
 */
/**
 * Load company decisions from the memory index into an empty session.
 * A thrown read stays a failure. An empty index is an empty workspace.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ memory?: { index?: () => Promise<unknown>, recall?: () => Promise<unknown> } }} [deps]
 */
export async function rebuildCompanyIndex(session, deps = {}) {
  const current = ensureSession(session);
  if (!deps.memory?.index && !deps.memory?.recall) {
    return { ok: true, empty: current.decisions.length === 0 };
  }
  let docs;
  try {
    docs = deps.memory.index ? await deps.memory.index() : await deps.memory.recall();
  } catch {
    return { ok: false, empty: false };
  }
  if (!Array.isArray(docs)) return { ok: false, empty: false };
  try {
    applyIndexedDocuments(current, docs, false);
    // A successful index already searched this mark. One more recall is only
    // the fallback when that search came back empty.
    if (docs.length === 0 && deps.memory.index && deps.memory.recall) {
      try {
        const full = await deps.memory.recall();
        if (Array.isArray(full)) applyIndexedDocuments(current, full, false);
      } catch {
        // The index still names who was invited. The sentence waits until recall can be read.
      }
    }
    restoreMeetingConfirms(current);
    return { ok: true, empty: current.decisions.length === 0 };
  } catch {
    return { ok: false, empty: false };
  }
}

function restoreMeetingConfirms() {
  // A kept sentence is not a change waiting for confirm.
}

/**
 * Read each visible decision through Tatum. The public row keeps the
 * checkpoint or loses it. A failed read leaves the checkpoint unset.
 * There is no second reader, and this does not renew the blob.
 * Non-empty object text replaces the sentence.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ decisions?: Array<{ id?: string, text?: string, checkpoint?: number | null }> }} board
 * @param {{ getObject?: (blobId: string) => Promise<{ text?: string, checkpoint?: number | null }> }} [tatum]
 */
export async function readProofs(session, board, tatum, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 1200;
  const fresh = options.fresh === true;
  const rows = Array.isArray(board?.decisions) ? board.decisions : [];
  const byId = new Map((session?.decisions ?? []).map((item) => [item.id, item]));
  if (typeof tatum?.refreshChain === "function") {
    try {
      await tatum.refreshChain();
    } catch {
      // The tip is optional. Each proof still reads on its own.
    }
  }
  const sources = [];
  for (const row of rows) {
    const source = byId.get(row.id);
    if (typeof source?.blobId === "string" && source.blobId && typeof tatum?.getObject === "function") sources.push(source);
  }
  const reads = proofReads(tatum, sources, { fresh });
  await Promise.all(rows.map(async (row) => {
    const source = byId.get(row.id);
    const blobId = typeof source?.blobId === "string" ? source.blobId : "";
    if (!blobId || typeof tatum?.getObject !== "function") {
      row.checkpoint = null;
      row.proofStatus = "unknown";
      row.proofReason = "The chain proof is incomplete.";
      return;
    }
    let object;
    try {
      object = await settleWithin(reads.get(blobId), timeoutMs);
    } catch {
      row.checkpoint = null;
      row.proofStatus = "unknown";
      row.proofReason = "The chain proof is incomplete.";
      row.proof = publicProof({ status: "unknown", reason: row.proofReason, blobId });
      if (blobId) row.blobId = blobId;
      return;
    }
    if (object === PROOF_PENDING) {
      // The read keeps going on the server. The page shows a pending
      // proof and asks again; it is not a failure.
      row.checkpoint = Number.isInteger(source?.checkpoint) ? source.checkpoint : null;
      row.proofStatus = "pending";
      row.proofReason = PROOF_PENDING_REASON;
      row.proof = { ...publicProof({ blobId }), status: "pending", reason: PROOF_PENDING_REASON };
      if (blobId) row.blobId = blobId;
      return;
    }
    applyProof(row, source, object, blobId);
  }));
  return board;
}

export const PROOF_PENDING_REASON = "Verifying on chain…";
const PROOF_PENDING = Symbol("proof pending");

function applyProof(row, source, object, blobId) {
  const text = typeof object?.text === "string" ? object.text.trim() : "";
  if (text) row.text = redact(text);
  row.checkpoint = Number.isInteger(object?.checkpoint) ? object.checkpoint : null;
  const proof = object?.proof
    ? publicProof({ ...object.proof, blobId: object.proof.blobId || blobId })
    : publicProof({
      status: "unknown",
      reason: "The chain proof is incomplete.",
      blobId,
      objectId: typeof object?.objectId === "string" ? object.objectId : null,
      digest: typeof object?.digest === "string" ? object.digest : null,
      checkpoint: row.checkpoint,
    });
  row.proof = proof;
  row.proofStatus = proof.status;
  row.proofReason = proof.reason;
  if (proof.blobId) row.blobId = proof.blobId;
  if (proof.objectId) row.objectId = proof.objectId;
  if (proof.digest) row.digest = proof.digest;
  if (source) {
    source.proofStatus = proof.status;
    if (proof.status === "verified" && proof.objectId) source.objectId = proof.objectId;
  }
}

// One proof cache per Tatum reader. A verified read is kept, so the second
// load is instant. A read still running is shared, so a page load, a poll and
// the start-up warm never ask the gateway twice for one blob. A failure or an
// unverified read is not kept, so the next ask reads again.
const proofCaches = new WeakMap();

function proofCache(tatum) {
  let cache = proofCaches.get(tatum);
  if (!cache) {
    cache = { settled: new Map(), running: new Map() };
    proofCaches.set(tatum, cache);
  }
  return cache;
}

function proofTarget(source) {
  const blobId = source?.blobId;
  return typeof source?.objectId === "string" && /^0x[0-9a-fA-F]{64}$/.test(source.objectId) ? source.objectId : blobId;
}

function proofHints(source) {
  return {
    blobId: source.blobId,
    owner: source?.blobOwner,
    digest: source?.digest,
    checkpoint: source?.checkpoint,
  };
}

// Several memories share one BatchGetObjects and one BatchGetTransactions.
// One memory stays on GetObject. A reader without getObjects stays one call
// per memory. A verified result is cached per blob. A failure is not.
function proofReads(tatum, sources, { fresh = false } = {}) {
  const out = new Map();
  if (!tatum || typeof tatum !== "object") return out;
  const cache = proofCache(tatum);
  const todo = [];
  for (const source of sources) {
    const blobId = source?.blobId;
    if (!blobId || out.has(blobId) || todo.some((item) => item.blobId === blobId)) continue;
    if (!fresh && cache.settled.has(blobId)) {
      out.set(blobId, Promise.resolve(cache.settled.get(blobId)));
      continue;
    }
    if (cache.running.has(blobId)) {
      out.set(blobId, cache.running.get(blobId));
      continue;
    }
    todo.push(source);
  }
  if (todo.length > 1 && typeof tatum?.getObjects === "function") {
    const slots = new Map();
    for (const source of todo) {
      let resolve;
      let reject;
      const promise = new Promise((ok, fail) => {
        resolve = ok;
        reject = fail;
      });
      slots.set(source.blobId, { resolve, reject });
      const running = promise.then((object) => {
        cache.running.delete(source.blobId);
        if (object?.proof?.status === "verified") cache.settled.set(source.blobId, object);
        else cache.settled.delete(source.blobId);
        return object;
      }, (error) => {
        cache.running.delete(source.blobId);
        throw error;
      });
      cache.running.set(source.blobId, running);
      out.set(source.blobId, running);
    }
    Promise.resolve()
      .then(() => tatum.getObjects(todo.map((source) => ({ id: proofTarget(source), hints: proofHints(source) }))))
      .then((results) => {
        todo.forEach((source, index) => {
          const result = results?.[index];
          if (result?.ok && result.object) slots.get(source.blobId).resolve(result.object);
          else {
            const error = result?.error instanceof Error ? result.error : new Error("Tatum read failed");
            slots.get(source.blobId).reject(error);
          }
        });
      }, (error) => {
        for (const slot of slots.values()) slot.reject(error);
      });
    return out;
  }
  for (const source of todo) out.set(source.blobId, lookupProof(tatum, source, { fresh }));
  return out;
}

function lookupProof(tatum, source, { fresh = false } = {}) {
  const blobId = source.blobId;
  const cache = proofCache(tatum);
  if (!fresh && cache.settled.has(blobId)) return Promise.resolve(cache.settled.get(blobId));
  if (cache.running.has(blobId)) return cache.running.get(blobId);
  const running = Promise.resolve()
    .then(() => tatum.getObject(proofTarget(source), proofHints(source)))
    .then((object) => {
      cache.running.delete(blobId);
      if (object?.proof?.status === "verified") cache.settled.set(blobId, object);
      else cache.settled.delete(blobId);
      return object;
    }, (error) => {
      cache.running.delete(blobId);
      throw error;
    });
  cache.running.set(blobId, running);
  return running;
}

/**
 * Read the chain proof for every company memory with a blob, so the first
 * room load finds them already verified. Several memories share one batch.
 * One memory, or a reader without batch reads, stays one call at a time.
 * Runs in the background through the reader's shared throttle. A failure is
 * left for the page to retry.
 *
 * @param {{ decisions?: any[] }} session
 * @param {{ getObject?: Function }} tatum
 * @returns {Promise<{ verified: number, failed: number, ms: number }>}
 */
export async function warmProofs(session, tatum) {
  const started = Date.now();
  const out = { verified: 0, failed: 0, ms: 0 };
  if (typeof tatum?.getObject !== "function") return out;
  const decisions = (session?.decisions ?? []).filter((decision) => decision && !decision.deleted && decision.account !== "personal" && typeof decision.blobId === "string" && decision.blobId);
  const batched = decisions.length > 1 && typeof tatum.getObjects === "function";
  const reads = batched ? proofReads(tatum, decisions, {}) : null;
  for (const decision of decisions) {
    try {
      const object = await (reads ? reads.get(decision.blobId) : lookupProof(tatum, decision));
      if (object?.proof?.status === "verified") {
        out.verified += 1;
        decision.proofStatus = "verified";
      } else out.failed += 1;
    } catch {
      out.failed += 1;
    }
  }
  out.ms = Date.now() - started;
  return out;
}

function voiceFollowupItems(session, roomId) {
  const rows = Array.isArray(session?.voiceFollowups) ? session.voiceFollowups : [];
  const items = [];
  for (const row of rows) {
    if (!row || row.roomId !== roomId) continue;
    const name = String(row.name || "tool").replace(/\s+/g, " ").trim();
    const ask = String(row.ask || "").replace(/\s+/g, " ").trim();
    const subject = ask ? `${name}: ${ask}` : name;
    const result = String(row.result || "").replace(/\s+/g, " ").trim();
    const text = row.status === "pending" || !result
      ? `Follow up after the call. ${subject} was still running.`
      : `Follow up after the call. ${subject}. ${result}`;
    items.push({ text: text.slice(0, 400), owner: "", due: "" });
  }
  return items;
}

function settleWithin(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(PROOF_PENDING), ms);
    promise.then(
      (object) => {
        clearTimeout(timer);
        resolve(object);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Write minutes and action items when a meeting ends. Decisions already stored
 * are left alone. A voice tool that ran past its budget is one of the action
 * items. An unknown room writes nothing.
 */
export async function endMeeting(session, deps, roomId) {
  const current = ensureSession(session);
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!id) return [];
  const room = (current.rooms ?? []).find((item) => item.id === id) || { id };
  const decisions = (current.decisions ?? []).filter((item) => item.roomId === id && !item.deleted);
  const actionItems = (current.actions ?? [])
    .filter((item) => item.roomId === id)
    .map((item) => ({ text: item.statement, owner: item.memberId || item.speaker || "", due: "" }))
    .concat(voiceFollowupItems(current, id));
  const visibleSources = new Set(decisions.map((decision) => decision.id));
  const memories = (current.learned ?? []).filter((record) => record.roomId === id && record.sourceDecisionId && visibleSources.has(record.sourceDecisionId));
  const minutes = draftMinutes({ room, decisions, memories });
  return rememberMeetingOutcome({
    room: { ...room, attendees: room.memberIds || [] },
    minutes,
    actionItems,
    decisions,
    remember: (document) => remember(deps, document),
  });
}

/**
 * Company sentences one member may see. A private note stays out.
 * No blob id, object id, key, or Console file id.
 * A clash is labeled only when both sentences are in this set.
 * The checkpoint here is the stored stamp. The console replaces it
 * with a Tatum read before the page sees it.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {string} [memberId]
 */
export function companyBoard(session, memberId, options = {}) {
  if (typeof memberId === "object") session = readableSession(session, memberId);
  const member = typeof memberId === "object" ? memberId : readPrincipalId(memberId);
  const visible = [];
  for (const decision of session?.decisions ?? []) {
    if (decision.deleted || decision.account === "personal" || decision.kind === "note") continue;
    if (!readPrincipalId(member) || !canReadRecord(member, decision)) continue;
    visible.push(decision);
  }
  const statuses = new Map(clashStatuses(visible).map((row) => [row.id, row.status]));
  const decisions = visible.map((decision) => ({
    id: decision.id,
    text: redact(decision.text || ""),
    speaker: typeof decision.speakerMemberId === "string" ? decision.speakerMemberId : "",
    roomId: typeof decision.roomId === "string" ? decision.roomId : "",
    spokenAt: typeof decision.spokenAt === "string" ? decision.spokenAt : "",
    status: statuses.get(decision.id) || "recorded",
    checkpoint: typeof decision.checkpoint === "number" ? decision.checkpoint : null,
    expiryEpoch: epochOf(decision.expiryEpoch),
    connectorId: typeof decision.connectorId === "string" ? decision.connectorId : "",
    fileNames: (Array.isArray(decision.fileNames) ? decision.fileNames : [])
      .filter((file) => typeof file?.name === "string" && file.name.trim())
      .map((file) => ({ name: file.name.trim() })),
  }));
  const preferences = session?.preferences ?? [];
  const rooms = [];
  for (const decision of decisions) {
    let room = rooms.find((item) => item.id === decision.roomId);
    if (!room) {
      const setting = liveRoomSetting(session?.roomSettings, decision.roomId);
      room = {
        id: decision.roomId,
        count: 0,
        ask: true,
        voice: setting?.voice || "plain",
        raiseClash: setting?.raiseClash === true,
      };
      rooms.push(room);
    }
    room.count += 1;
    room.ask = resolvePreference(preferences, "linear", decision.roomId) === "ask"
      && resolvePreference(preferences, "calendar", decision.roomId) === "ask";
  }
  for (const opened of session?.rooms ?? []) {
    if (!opened?.id) continue;
    let room = rooms.find((item) => item.id === opened.id);
    if (!room) {
      const setting = liveRoomSetting(session?.roomSettings, opened.id);
      room = {
        id: opened.id,
        count: 0,
        ask: true,
        voice: setting?.voice || "plain",
        raiseClash: setting?.raiseClash === true,
      };
      rooms.push(room);
    }
    if (opened.platform) room.platform = opened.platform;
    if (typeof opened.name === "string" && opened.name) room.name = opened.name;
    if (typeof opened.channel === "string" && opened.channel) room.channel = opened.channel;
    if (typeof opened.startedAt === "string" && opened.startedAt) room.startedAt = opened.startedAt;
    if (Number.isFinite(opened.duration) && opened.duration > 0) room.duration = Math.round(opened.duration);
    if (meetingCallRank(opened.call)) room.call = opened.call;
    if (typeof opened.calendarEventId === "string" && opened.calendarEventId.trim()) {
      room.calendarEventId = opened.calendarEventId.trim();
    }
  }
  const named = session?.roomNames && typeof session.roomNames === "object" ? session.roomNames : {};
  for (const room of rooms) {
    if (typeof named[room.id] === "string" && named[room.id]) room.name = named[room.id];
  }
  const roomIds = new Set(decisions.map((decision) => decision.roomId));
  const waiting = [];
  let sent = 0;
  for (const action of session?.actions ?? []) {
    const meetingHold = action?.source === "Google Meet" && action?.state === "paused"
      && typeof action.id === "string" && action.id && typeof action.roomId === "string" && action.roomId;
    if (!meetingHold && !roomIds.has(action.roomId)) continue;
    if (action.state === "closed") {
      sent += 1;
      continue;
    }
    if (meetingHold) {
      const invite = action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId];
      if (!readPrincipalId(member) || !canReadRecord(member, { ...action, inviteMemberIds: invite })) continue;
      const tool = action.tool === "linear" || action.tool === "calendar" ? action.tool : "";
      waiting.push({
        id: action.id,
        roomId: action.roomId,
        tool,
        statement: redact(action.statement || ""),
      });
      if (!rooms.some((item) => item.id === action.roomId)) {
        const setting = liveRoomSetting(session?.roomSettings, action.roomId);
        rooms.push({
          id: action.roomId,
          count: 0,
          ask: true,
          voice: setting?.voice || "plain",
          raiseClash: setting?.raiseClash === true,
        });
      }
      continue;
    }
    if (action.state !== "waiting" || typeof action.id !== "string" || !action.id) continue;
    const tool = action.tool === "linear" || action.tool === "calendar" ? action.tool : "";
    waiting.push({
      id: action.id,
      roomId: action.roomId,
      tool,
      statement: redact(action.statement || ""),
    });
  }
  const tickets = [];
  for (const action of session?.actions ?? []) {
    if (action.state !== "closed" || action.tool !== "linear" || typeof action.connectorId !== "string" || !action.connectorId) continue;
    const invite = action.inviteMemberIds?.length ? action.inviteMemberIds : [action.memberId];
    if (!readPrincipalId(member) || !canReadRecord(member, { ...action, inviteMemberIds: invite })) continue;
    tickets.push({
      actionId: action.id,
      connectorId: action.connectorId,
      edit: action.edit === "assign" ? "assign" : "create",
      statement: redact(action.statement || ""),
    });
  }
  const people = [];
  for (const decision of decisions) {
    if (decision.speaker && !people.includes(decision.speaker)) people.push(decision.speaker);
  }
  return {
    decisions,
    rooms,
    people,
    waiting,
    tickets,
    counts: {
      kept: decisions.length,
      waiting: waiting.length,
      sent,
      failed: (session?.activity ?? []).filter((row) => row.kind === "failure" && row.outcome === "failed" && !row.resolved).length,
      actionsToday: (session?.activity ?? []).filter((row) => row.kind === "action" && String(row.ts || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    },
    activity: publicActivity(session, rooms, options),
    preferences: {
      linear: resolvePreference(preferences, "linear", ""),
      calendar: resolvePreference(preferences, "calendar", ""),
      slack: resolvePreference(preferences, "slack", ""),
    },
    access: accessRows(session, rooms),
  };
}

function publicActivity(session, rooms, options = {}) {
  const visible = new Set((rooms || []).map((room) => room.id));
  const rows = session?.activity ?? [];
  const timeZone = options.timeZone || "";
  return rows
    .filter((row) => row && row.kind !== "resolve" && row.kind !== "supersede" && (!row.origin?.roomId || visible.has(row.origin.roomId)))
    .map((row) => ({
      id: row.id,
      requestId: row.requestId,
      ts: row.ts,
      kind: row.kind,
      actor: row.actor,
      verb: row.verb,
      target: row.target,
      changes: row.changes,
      tool: row.tool,
      origin: row.origin,
      outcome: row.outcome,
      error: row.error,
      undo: publishedUndo(row),
      retryable: row.kind === "failure" && !row.resolved && !newerSuccess(session, row) && !newerFailure(session, row) && canReplay(row, { slackChannel: options.slackChannel || "" }),
      stale: row.kind === "failure" && !row.resolved && newerSuccess(session, row),
      resolved: row.resolved === true,
      superseded: row.superseded === true,
      refersTo: row.refersTo || "",
      undoOf: row.undoOf || "",
      retryOf: row.retryOf || "",
      sentence: timeZone && row.target?.system === "calendar"
        ? formatActivitySentence(renderActivity(row), timeZone)
        : renderActivity(row),
    }));
}

function publishedUndo(row, now = Date.now()) {
  const until = Date.parse(row.undo?.until || "");
  const open = row.undo?.available === true
    && row.outcome !== "undone"
    && row.superseded !== true
    && canUndo(row)
    && !Number.isNaN(until)
    && until > now;
  if (!row.undo && !open) return undefined;
  return { available: open, until: row.undo?.until || "" };
}

/**
 * The workspace feed, filtered with the same search the page uses.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {{ id?: string }[]} rooms
 * @param {{ query?: string, roomId?: string, kind?: string, actor?: string }} [query]
 */
export function searchPublishedActivity(session, rooms, query = {}, options = {}) {
  return selectActivity(publicActivity(session, rooms, options), query);
}

/** Rows from the room activity mirror, merged like indexed rows. */
export function absorbActivityRows(session, rows) {
  for (const row of rows || []) absorbActivity(session, row);
}

/** One room's published activity rows. */
export function roomPublicActivity(session, roomId, options = {}) {
  return publicActivity(session, [{ id: roomId }], options).filter((row) => row.origin?.roomId === roomId);
}

function absorbActivity(session, activity) {
  if (!activity || typeof activity.id !== "string" || !activity.id) return;
  session.activity ??= [];
  if (!session.activity.some((row) => row.id === activity.id)) session.activity.push(activity);
  foldActivity(session);
}

function foldActivity(session) {
  for (const event of session.activity || []) {
    if (event.kind === "resolve" && event.refersTo) {
      const prior = session.activity.find((row) => row.id === event.refersTo);
      if (prior) prior.resolved = true;
    }
    if (event.kind === "supersede" && event.refersTo) {
      const prior = session.activity.find((row) => row.id === event.refersTo);
      if (prior) {
        prior.superseded = true;
        if (prior.undo) prior.undo.available = false;
      }
    }
    if (event.kind === "undo" && event.undoOf) {
      const prior = session.activity.find((row) => row.id === event.undoOf);
      if (prior) {
        prior.outcome = "undone";
        if (prior.undo) prior.undo.available = false;
      }
    }
  }
}

function accessRows(session, rooms) {
  const visible = new Set(rooms.map((room) => room.id));
  const access = [];
  for (const row of session?.accesses ?? []) {
    if (!row || !visible.has(row.roomId)) continue;
    const speaker = typeof row.speaker === "string" ? row.speaker.trim() : "";
    if (!speaker) continue;
    if (access.some((item) => item.roomId === row.roomId && item.speaker === speaker)) continue;
    access.push({ roomId: row.roomId, speaker });
  }
  return access;
}

/**
 * Private notes one member may see. A company sentence stays out.
 * This board has no rooms. No blob id, object id, key, or Console file id.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {string} [memberId]
 */
export function personalBoard(session, memberId) {
  const member = typeof memberId === "object" ? memberId : readPrincipalId(memberId);
  const visible = [];
  for (const decision of session?.decisions ?? []) {
    if (decision.account !== "personal") continue;
    if (!readPrincipalId(member) || !canReadRecord(member, decision)) continue;
    visible.push(decision);
  }
  const decisions = visible.map((decision) => ({
    id: decision.id,
    text: redact(decision.text || ""),
    speaker: typeof decision.speakerMemberId === "string" ? decision.speakerMemberId : "",
    roomId: "",
    spokenAt: typeof decision.spokenAt === "string" ? decision.spokenAt : "",
    status: "recorded",
    checkpoint: typeof decision.checkpoint === "number" ? decision.checkpoint : null,
    expiryEpoch: epochOf(decision.expiryEpoch),
    fileNames: (Array.isArray(decision.fileNames) ? decision.fileNames : [])
      .filter((file) => typeof file?.name === "string" && file.name.trim())
      .map((file) => ({ name: file.name.trim() })),
  }));
  const people = [];
  for (const decision of decisions) {
    if (decision.speaker && !people.includes(decision.speaker)) people.push(decision.speaker);
  }
  const preferences = session?.preferences ?? [];
  return {
    decisions,
    rooms: [],
    people,
    waiting: [],
    counts: {
      kept: decisions.length,
      waiting: 0,
      sent: 0,
      failed: 0,
    },
    preferences: {
      linear: resolvePreference(preferences, "linear", ""),
      calendar: resolvePreference(preferences, "calendar", ""),
      slack: resolvePreference(preferences, "slack", ""),
    },
    access: [],
  };
}

export function roomLedger(session, roomId = "desk", memberId = "") {
  session = readableSession(session, memberId);
  const id = typeof roomId === "string" && roomId ? roomId : "desk";
  const decisions = (session?.decisions ?? []).filter((decision) =>
    !decision.deleted && decision.roomId === id && decision.account !== "personal" && decision.kind !== "note");
  const statuses = new Map(clashStatuses(decisions).map((row) => [row.id, row.status]));
  const preferences = session?.preferences ?? [];
  return {
    decisions: decisions.map((decision) => ({
      id: decision.id,
      text: redact(decision.text || ""),
      speaker: typeof decision.speakerMemberId === "string" ? decision.speakerMemberId : "",
      status: statuses.get(decision.id) || "recorded",
      spokenAt: typeof decision.spokenAt === "string" ? decision.spokenAt : "",
      contradicts: Array.isArray(decision.contradicts) ? decision.contradicts.map(String) : [],
      replaces: decision.replaces || "",
      replacedBy: decision.replacedBy || "",
    })),
    waiting: (session?.actions ?? [])
      .filter((action) => action.state === "waiting" && action.roomId === id)
      .map((action) => ({
        id: action.id,
        tool: action.tool === "linear" || action.tool === "calendar" ? action.tool : "",
        statement: redact(action.statement || ""),
      })),
    preferences: {
      linear: resolvePreference(preferences, "linear", id),
      calendar: resolvePreference(preferences, "calendar", id),
    },
  };
}
