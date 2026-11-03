import { randomBytes } from "node:crypto";
import { displayName, logAction, logFailure, logRequest, logUndo, renderActivity, undoRefusal } from "./activity.js";
import { selectActivity } from "./activity-feed.js";
import { readCalendarEvent, replayPlan, replaySupported, runReplay } from "./activity-replay.js";
import { authorize } from "./domain/allow.js";
import { clashStatuses } from "./domain/clash.js";
import { checkInvite } from "./domain/invite.js";
import { gateEvent } from "./domain/log.js";
import { resolvePreference } from "./domain/preference.js";
import { redact } from "./domain/redact.js";
import { acceptCheckpoint } from "./domain/stamp.js";
import { itemStatus } from "./domain/status.js";
import { splitPassage } from "./memory/analyze.js";
import { addressesHearing, normalizeHearing, stripHearing } from "./hearing.js";
import { looksLikeOpenQuestion, parseUtterance } from "./parse.js";

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
 *   file?: { name?: string, bytes?: string },
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
export async function handleUtterance(input, deps = {}) {
  const session = ensureSession(input.session);
  if (input.openedRoom) return openMeetingRoom(session, deps, input.openedRoom);
  if (!enters(input)) return silence();

  const deliveryId = byteTrim(String(input.deliveryId ?? "").trim(), 255);
  session.trace = {
    requestId: deliveryId || "none",
    route: input.door || "typed",
    tool: input.intent || "",
    private: false,
  };
  if (typeof deps.log === "function") session.emit = deps.log;
  if (deliveryId && session.deliveries.has(deliveryId)) {
    return finish(session, {
      status: "recorded",
      kind: "duplicate",
      body: "duplicate-delivery",
      allow: "duplicate-delivery",
      outcome: "duplicate-delivery",
    });
  }
  if (deliveryId) session.deliveries.add(deliveryId);

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

  const parsed = parseUtterance(withoutAddress(input.text, input.session?.hearing));
  session.trace.tool = parsed.tool || parsed.type || "";
  session.trace.private = parsed.private === true;
  if (parsed.type === "confirm") return confirmAction(input, session, deps, parsed.actionId);
  if (parsed.type === "dismiss") return dismissAction(session, parsed.actionId);
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
  if (parsed.type === "read") return answerRead(input, session, deps, parsed);
  if (parsed.type === "write") return requestWrite(input, session, deps, parsed);
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
    if (roomId && item.roomId !== roomId) return false;
    if (!checkInvite(memberId, item.inviteMemberIds).ok) return false;
    return item.fileNames?.some((file) => file.name === name);
  });
  if (!decision) return { name: null, bytes: null, allow: "not-invited" };
  const file = decision.fileNames.find((item) => item.name === name);
  if (!file || !deps.console?.download) return { name: file?.name ?? null, bytes: null, allow: "read" };
  try {
    const bytes = await deps.console.download({ id: file.consoleFileId, name: file.name });
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
  return addressesHearing(input.text, input.session?.hearing);
}

function withoutAddress(text, hearing) {
  return stripHearing(text, hearing);
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

async function requestWrite(input, session, deps, parsed) {
  const invited = writerInvite(input);
  const preference = resolvePreference(session.preferences, parsed.tool, invited.room?.id || input.room?.id);
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
    id: nextId(session, "action"),
    deliveryId: byteTrim(String(input.deliveryId ?? "").trim(), 255),
    roomId: invited.room.id,
    memberId: input.memberId,
    tool: parsed.tool,
    preference,
    statement: redact(parsed.statement),
    params: parsed.params,
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
  session.actions.push(action);
  await remember(deps, {
    account: "company",
    kind: "action",
    text: action.statement,
    idempotencyKey: action.deliveryId || action.id,
  });
  if (action.missingFact) {
    action.state = "available";
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
    return finish(session, {
      status: "recorded",
      kind: "ticket",
      body: `${action.statement}\nrecorded\npreference ask\nRun automatically is off.`,
      allow: auth.reason,
      preference: "ask",
      actionId: action.id,
    });
  }
  return callConnector(session, deps, action, auth);
}

async function confirmAction(input, session, deps, actionId) {
  const action = session.actions.find((item) => item.id === actionId);
  if (!action || action.state === "dismissed" || action.state === "closed" || action.state === "sending" || action.connectorId || action.missingFact) {
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
      body: `${action.statement}\nrecorded\npreference ${action.preference}\n${invited.reason}`,
      allow: invited.reason,
      preference: action.preference,
      actionId: action.id,
    });
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
  return callConnector(session, deps, action, auth);
}

function dismissAction(session, actionId) {
  const action = session.actions.find((item) => item.id === actionId);
  if (action && (action.state === "waiting" || action.state === "paused")) action.state = "dismissed";
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
  let created;
  try {
    created = await runConnector(deps, action);
  } catch (error) {
    action.state = "available";
    action.connectorId = null;
    const message = error instanceof Error ? error.message : "";
    return didNotHappen(session, deps, action, auth, message);
  }
  const issueId = connectorId(created);
  const assigning = action.edit === "assign";
  const status = itemStatus({ kind: "ticket", edit: assigning ? "update" : action.edit }, issueId);
  if (status !== "filed" && status !== "updated") {
    action.state = "available";
    action.connectorId = null;
    return didNotHappen(session, deps, action, auth, "");
  }
  action.state = "closed";
  action.connectorId = issueId;
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
    const tools = await deps.calendar.listTools();
    const writeTool = (tools ?? []).find((tool) => tool.write === true && tool.name);
    if (!writeTool) return { id: "" };
    return deps.calendar.call(writeTool.name, action.params);
  }
  if (action.edit === "assign") {
    return deps.linear.assignIssue({ id: action.params.id, assignee: action.params.assignee });
  }
  return deps.linear.createIssue({ title: action.params.title, idempotencyKey: action.id });
}

async function didNotHappen(session, deps, action, auth, message) {
  session.items.push({ kind: "ticket", status: "recorded", text: action.statement, issueId: null });
  await noteActivity(session, deps, action, {
    role: "failure",
    actor: "Sederunt",
    actorKind: "sederunt",
    outcome: "failed",
    error: failureText(message),
  });
  return finish(session, {
    status: "recorded",
    kind: "ticket",
    body: `${action.statement}\nrecorded\npreference ${action.preference}\nThe edit did not happen.`,
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
  const kind = fields.role === "failure" ? "failure" : (fields.role === "request" ? "request" : "action");
  const input = {
    id: nextId(session, "activity"),
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
    },
    changes: activityChanges(action),
    tool: { name: "act", server: "sederunt-mcp" },
    origin: {
      roomId: action.roomId || "",
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
 * only after the connector returns.
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
  const request = (session.activity || []).find((row) => row.requestId === named.requestId && row.kind === "request");
  const observed = await readCalendarEvent(deps, named);
  const planned = { ...named, changes: request?.changes?.length ? request.changes : named.changes };
  const plan = replayPlan(planned, "replay", observed);
  if (!plan.ok) return plan;
  let created;
  try {
    created = await runReplay(deps, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error?.reason === "unsupported") return { ok: false, reason: "unsupported" };
    const event = logFailure(session, effectOf(named, { error: failureText(message), changes: named.changes }));
    await storeActivity(session, deps, event);
    return { ok: false, reason: "failed", id: event.id };
  }
  if (!connectorId(created)) return { ok: false, reason: "failed" };
  const changes = plan.from ? [{ field: "start", from: plan.from, to: plan.to }] : (planned.changes || []);
  const event = logAction(session, {
    ...effectOf(named, { changes }),
    undo: replaySupported(named, "undo")
      ? { available: true, until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
      : { available: false, until: "" },
  });
  await storeActivity(session, deps, event);
  await markResolved(session, deps, named);
  await supersedeTarget(session, deps, named, event.id);
  return { ok: true, id: event.id };
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
  if (!replaySupported(event, "undo")) return { ok: false, reason: "unsupported" };
  const observed = await readCalendarEvent(deps, event);
  const plan = replayPlan(event, "undo", observed);
  if (!plan.ok) return plan;
  try {
    const created = await runReplay(deps, plan);
    if (!connectorId(created)) return { ok: false, reason: "failed" };
  } catch (error) {
    if (error?.reason === "unsupported") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "failed" };
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

function effectOf(source, extra) {
  return {
    id: activityIdentity(),
    requestId: source.requestId || source.id,
    actor: { type: "sederunt", name: "Sederunt", via: source.actor?.via || "MCP" },
    verb: source.verb,
    target: source.target,
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
    if (!same) continue;
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

function createTitle(action) {
  const titled = typeof action.params?.title === "string" ? action.params.title.trim() : "";
  if (titled) return titled.slice(0, 80);
  const name = typeof action.params?.name === "string" ? action.params.name.trim() : "";
  if (name) return name.slice(0, 80);
  const spoken = typeof action.statement === "string" ? action.statement.trim() : "";
  return spoken.slice(0, 80);
}

function activityChanges(action) {
  if (action.edit === "assign" && action.params?.assignee) {
    return [{ field: "assignee", from: "", to: displayName(action.params.assignee) }];
  }
  if (action.tool === "calendar" && action.params?.day) {
    return [{ field: "start", from: "", to: String(action.params.day) }];
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
  const room = {
    id: /^[A-Za-z0-9_-]{1,64}$/.test(supplied) ? supplied : nextId(session, "room"),
    kind: "meeting",
    platform,
    botPresent: true,
  };
  session.rooms.push(room);
  await remember(deps, {
    account: "company",
    kind: "room",
    text: `${room.id} meeting`,
    idempotencyKey: room.id,
    room: { id: room.id, kind: "meeting", platform },
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
  if (!room) return refusal(session, "No decision is stored.");
  const inviteMemberIds = snapshot(input, room);
  const invite = checkInvite(input.memberId, inviteMemberIds);
  if (!invite.ok) return refusal(session, invite.reason === "missing-member" ? "No decision is stored." : "No decision is stored.");
  if (looksLikeOpenQuestion(sentence)) {
    return finish(session, {
      status: "recorded",
      kind: "answer",
      body: "That question was not kept.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
      outcome: "question",
    });
  }
  const duplicate = session.decisions.some((item) =>
    !item.deleted && item.roomId === room.id && item.account !== "personal" && item.text === sentence && !item.replacedBy);
  if (duplicate) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "That sentence is already kept.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
      outcome: "duplicate",
    });
  }
  return keepDecision(input, session, deps, {
    text: sentence,
    facts: passage.facts,
    account: "company",
    inviteMemberIds,
    roomId: room.id,
    kind: "decision",
  });
}

async function keepDecision(input, session, deps, draft) {
  const fileName = FILE_NAME.exec(draft.text)?.[1] || "";
  const attached = input.file?.name && fileName && input.file.name.toLowerCase() === fileName.toLowerCase()
    ? input.file.bytes
    : undefined;
  const file = fileName ? await nameFile(deps, fileName, attached) : null;
  const stamp = stampOf(input);
  const decision = {
    id: nextId(session, "decision"),
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
    spokenAt: new Date().toISOString(),
    fileNames: file ? [file] : [],
    expiryEpoch: null,
    account: draft.account,
    sourceDeliveryId: byteTrim(String(input.deliveryId ?? "").trim(), 255),
    deleted: false,
  };
  if (deps.memory?.remember) {
    const saved = await remember(deps, {
      account: draft.account,
      kind: decision.kind,
      text: decision.text,
      idempotencyKey: decision.id,
      decision: decisionDocument(decision),
    });
    if (!saved) return refusal(session, "No decision is stored.");
    decision.blobId = saved.blobId;
    decision.expiryEpoch = epochOf(saved.expiryEpoch);
    if (saved.blobId) session.trace.blobId = saved.blobId;
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
  session.items.push({ kind: "decision", status: "recorded", text: decision.text, issueId: null });
  return renderVisible(session, input.memberId, decision.roomId, null);
}

async function forgetDelivery(input, session, deps) {
  await loadIndex(session, deps);
  const forgetIds = new Set(
    [input.forgetId, ...(Array.isArray(input.forgetIds) ? input.forgetIds : []), input.deliveryId]
      .map((value) => byteTrim(String(value ?? "").trim(), 255))
      .filter((value) => value && !value.startsWith("delete:")),
  );
  const roomId = input.room?.id || "";
  const text = String(input.text || "").trim();
  const decision = (session.decisions ?? []).find((item) => {
    if (item.deleted) return false;
    if (forgetIds.has(item.sourceDeliveryId)) return true;
    return Boolean(roomId && text && item.roomId === roomId && item.text === text);
  });
  if (!decision) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: "Nothing was deleted.\nrecorded\npreference ask",
      allow: "read",
      preference: "ask",
    });
  }
  const actionId = [...forgetIds][0] || decision.id;
  const auth = authorize({
    action: "delete",
    tool: "memory",
    preference: "ask",
    confirmed: true,
    actionId,
    confirmActionId: actionId,
  });
  if (!auth.allowed) {
    return finish(session, {
      status: "recorded",
      kind: "note",
      body: `${decision.text}\nrecorded\npreference ask`,
      allow: auth.reason,
      preference: "ask",
    });
  }
  decision.deleted = true;
  await remember(deps, {
    account: "company",
    kind: "decision",
    text: decision.text,
    idempotencyKey: `${decision.id}:deleted`,
    decision: decisionDocument(decision),
  });
  return finish(session, {
    status: "recorded",
    kind: "note",
    body: "deleted\nrecorded\npreference ask",
    allow: auth.reason,
    preference: "ask",
    decisionId: decision.id,
  });
}

async function nameFile(deps, name, bytes) {
  if (bytes == null || bytes === "" || !deps.console?.upload) return null;
  try {
    const uploaded = await deps.console.upload({ name, bytes });
    const id = typeof uploaded?.id === "string" ? uploaded.id.trim() : "";
    if (!id) return null;
    return {
      name,
      consoleFileId: id,
      folderId: typeof uploaded?.folderId === "string" ? uploaded.folderId : null,
    };
  } catch {
    return null;
  }
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
    decision.deleted = loaded.deleted === true;
    if (loaded.sourceDeliveryId) decision.sourceDeliveryId = loaded.sourceDeliveryId;
    decision.objectId = loaded.objectId ?? decision.objectId;
    decision.blobId = loaded.blobId ?? decision.blobId;
    decision.facts = loaded.facts;
    decision.checkpoint = loaded.checkpoint ?? decision.checkpoint;
    if (decision.expiryEpoch == null && loaded.expiryEpoch != null) decision.expiryEpoch = loaded.expiryEpoch;
    if (loaded.spokenAt) decision.spokenAt = loaded.spokenAt;
  }
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
    connectorId: decision.connectorId ?? null,
    sourceDeliveryId: typeof decision.sourceDeliveryId === "string" ? decision.sourceDeliveryId : "",
    deleted: decision.deleted === true,
    facts: [...(decision.facts ?? [])],
    fileNames: decision.fileNames.map((file) => ({
      name: file.name,
      consoleFileId: file.consoleFileId,
      folderId: file.folderId,
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
    existing.fileNames = decision.fileNames.map((file) => ({ ...file }));
  }
  if (Array.isArray(decision.inviteMemberIds) && decision.inviteMemberIds.length) {
    existing.inviteMemberIds = decision.inviteMemberIds.map(String);
  }
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

function copyOpenedRoom(doc) {
  const room = doc?.room;
  if (!room || typeof room.id !== "string" || !room.id) return null;
  if (room.kind !== "meeting" || !MEETING_PLATFORMS.has(room.platform)) return null;
  return {
    id: room.id,
    kind: "meeting",
    platform: room.platform,
    botPresent: true,
  };
}

function absorbOpenedRoom(session, room) {
  if (!room) return;
  noteIssuedId(session, room.id);
  session.rooms ??= [];
  if (session.rooms.some((item) => item.id === room.id)) return;
  session.rooms.push(room);
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
  const visible = candidates.filter((decision) => checkInvite(memberId, decision.inviteMemberIds).ok);
  if (visible.length === 0) {
    const reason = candidates.length === 0 ? "there are no notes yet" : "not-invited";
    if (reason === "not-invited") await noteOutsideAsk(session, deps, input, candidates);
    return refusal(session, reason);
  }
  await loadSentences(session, deps);
  const proofs = new Map();
  let failed = false;
  for (const decision of visible) {
    if (!decision.blobId || !deps.tatum?.getObject) continue;
    try {
      const object = await deps.tatum.getObject(decision.blobId);
      const text = typeof object?.text === "string" && object.text.trim() ? object.text : decision.text;
      proofs.set(decision.id, {
        failed: false,
        text: redact(text),
        checkpoint: object?.checkpoint ?? null,
        objectId: typeof object?.objectId === "string" ? object.objectId : null,
      });
    } catch {
      failed = true;
      proofs.set(decision.id, { failed: true });
    }
  }
  return renderVisible(session, memberId, roomId, proofs, failed, scope);
}

function renderVisible(session, memberId, roomId, proofs, failed = false, scope = "") {
  const preference = resolvePreference(session.preferences, "linear", roomId);
  const statuses = clashStatuses(session.decisions.filter((decision) => keptInWorkspace(decision, scope)));
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
    if (!checkInvite(memberId, decision.inviteMemberIds).ok) continue;
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
    if (proof?.objectId) objectLink = `/object/${encodeURIComponent(proof.objectId)}`;
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
  return finish(session, {
    status: failed && !sawSentence ? "unknown" : status,
    kind: "answer",
    body: lines.join("\n"),
    allow: "read",
    preference,
    checkpoint,
    decisionId: lastId,
    objectLink,
    visible,
  });
}

function visibleRow(decision, text, status, known) {
  const file = known ? decision.fileNames?.find((item) => item?.name) : null;
  return {
    id: decision.id,
    text: redact(text || ""),
    status,
    fileName: file ? file.name : null,
    connectorId: known && decision.connectorId ? decision.connectorId : null,
  };
}

function refusal(session, reason) {
  const preference = resolvePreference(session.preferences, "linear", "");
  return finish(session, {
    status: "recorded",
    kind: "answer",
    body: `${reason}\nrecorded\npreference ${preference}`,
    allow: reason === "missing-member" || reason === "not-invited" ? reason : "read",
    preference,
    outcome: reason,
  });
}

/**
 * A console confirm names the action and the member. It does not send a room.
 * The room is the one stored on the action. The invite is the decision's,
 * or the member who asked when the action has no decision.
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
  return checkInvite(input.memberId, inviteMemberIds);
}

function writerInvite(input) {
  if (isHuddle(input.room)) return { ok: false, reason: "not-invited", room: null };
  const room = liveRoom(input);
  const inviteMemberIds = room ? snapshot(input, room) : [];
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
  if (Array.isArray(input.participants) && input.participants.length > 0) {
    return input.participants.map(String);
  }
  return [...(room.memberIds ?? [])];
}

async function remember(deps, document) {
  if (!deps.memory?.remember) return { blobId: null };
  try {
    const saved = await deps.memory.remember({
      account: document.account,
      kind: document.kind,
      text: document.text,
      idempotencyKey: byteTrim(document.idempotencyKey || document.text, 255),
      private: document.account === "personal",
      decision: document.decision,
      preference: document.preference,
      roomSetting: document.roomSetting,
      expiry: document.expiry,
      room: document.room,
      access: document.access,
      hearing: document.hearing,
      activity: document.activity,
    });
    const blobId = saved && typeof saved.blobId === "string" ? saved.blobId : null;
    return { blobId, expiryEpoch: epochOf(saved?.expiryEpoch) };
  } catch {
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
  applyIndexedDocuments(current, docs, false);
  if (deps.memory.index && deps.memory.recall) {
    try {
      const full = await deps.memory.recall();
      if (Array.isArray(full)) applyIndexedDocuments(current, full, false);
    } catch {
      // The index still names who was invited. The sentence waits until recall can be read.
    }
  }
  restoreMeetingConfirms(current);
  return { ok: true, empty: current.decisions.length === 0 };
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
export async function readProofs(session, board, tatum) {
  const rows = Array.isArray(board?.decisions) ? board.decisions : [];
  const byId = new Map((session?.decisions ?? []).map((item) => [item.id, item]));
  await Promise.all(rows.map(async (row) => {
    const source = byId.get(row.id);
    const blobId = typeof source?.blobId === "string" ? source.blobId : "";
    if (!blobId || typeof tatum?.getObject !== "function") {
      row.checkpoint = null;
      return;
    }
    try {
      const object = await readObjectWithin(tatum, blobId, 1200);
      const text = typeof object?.text === "string" ? object.text.trim() : "";
      if (text) row.text = redact(text);
      row.checkpoint = Number.isInteger(object?.checkpoint) ? object.checkpoint : null;
    } catch {
      row.checkpoint = null;
    }
  }));
  return board;
}

function readObjectWithin(tatum, blobId, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tatum read failed")), ms);
    tatum.getObject(blobId).then(
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
 * Company sentences one member may see. A private note stays out.
 * No blob id, object id, key, or Console file id.
 * A clash is labeled only when both sentences are in this set.
 * The checkpoint here is the stored stamp. The console replaces it
 * with a Tatum read before the page sees it.
 *
 * @param {ReturnType<import("./session.js").createSession>} session
 * @param {string} [memberId]
 */
export function companyBoard(session, memberId) {
  const member = typeof memberId === "string" ? memberId.trim() : "";
  const visible = [];
  for (const decision of session?.decisions ?? []) {
    if (decision.deleted || decision.account === "personal" || decision.kind === "note") continue;
    if (!member || !checkInvite(member, decision.inviteMemberIds).ok) continue;
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
  }
  const named = session?.roomNames && typeof session.roomNames === "object" ? session.roomNames : {};
  for (const room of rooms) {
    if (typeof named[room.id] === "string" && named[room.id]) room.name = named[room.id];
  }
  const roomIds = new Set(decisions.map((decision) => decision.roomId));
  const waiting = [];
  let sent = 0;
  for (const action of session?.actions ?? []) {
    if (!roomIds.has(action.roomId)) continue;
    if (action.state === "closed") {
      sent += 1;
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
    if (!member || !checkInvite(member, invite).ok) continue;
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
    activity: publicActivity(session, rooms),
    preferences: {
      linear: resolvePreference(preferences, "linear", ""),
      calendar: resolvePreference(preferences, "calendar", ""),
    },
    access: accessRows(session, rooms),
  };
}

function publicActivity(session, rooms) {
  const visible = new Set((rooms || []).map((room) => room.id));
  const rows = session?.activity ?? [];
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
      retryable: row.kind === "failure" && !row.resolved && replaySupported(row, "replay"),
      resolved: row.resolved === true,
      superseded: row.superseded === true,
      refersTo: row.refersTo || "",
      undoOf: row.undoOf || "",
      sentence: renderActivity(row),
    }));
}

function publishedUndo(row, now = Date.now()) {
  const until = Date.parse(row.undo?.until || "");
  const open = row.undo?.available === true
    && row.outcome !== "undone"
    && row.superseded !== true
    && replaySupported(row, "undo")
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
export function searchPublishedActivity(session, rooms, query = {}) {
  return selectActivity(publicActivity(session, rooms), query);
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
  const member = typeof memberId === "string" ? memberId.trim() : "";
  const visible = [];
  for (const decision of session?.decisions ?? []) {
    if (decision.account !== "personal") continue;
    if (!member || !checkInvite(member, decision.inviteMemberIds).ok) continue;
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
    },
    access: [],
  };
}

export function roomLedger(session, roomId = "desk") {
  const id = typeof roomId === "string" && roomId ? roomId : "desk";
  const decisions = (session?.decisions ?? []).filter((decision) =>
    decision.roomId === id && decision.account !== "personal" && decision.kind !== "note");
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
