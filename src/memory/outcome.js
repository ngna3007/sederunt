import { createHash } from "node:crypto";

/**
 * Minutes, action items, and any decision that is not already stored.
 * The idempotency key is stable, so a retry of the same outcome does not
 * write a second blob. PR #7 can call this once after renderMinutes.
 *
 * @param {{ room?: { id?: string, attendees?: string[], memberIds?: string[] }, minutes?: string | { text?: string, summary?: string, delivery?: string }, actionItems?: Array<{ text?: string, statement?: string, owner?: string, due?: string }>, decisions?: Array<object>, remember?: Function }} input
 */
export async function rememberMeetingOutcome(input = {}) {
  const remember = input.remember;
  const roomId = typeof input.room?.id === "string" ? input.room.id : "";
  if (!roomId || typeof remember !== "function") return [];
  const attendees = attendeesOf(input.room);
  const written = [];
  const minutes = minutesOf(input.minutes);
  if (minutes.text) {
    const key = `minutes:${roomId}`;
    written.push(await write(remember, {
      kind: "minutes",
      text: minutes.text,
      idempotencyKey: key,
      minutes: {
        roomId,
        text: minutes.text,
        attendees,
        delivery: minutes.delivery,
        source: "meeting",
      },
    }, key));
  }
  for (const item of input.actionItems ?? []) {
    const text = String(item?.text || item?.statement || "").trim();
    if (!text) continue;
    const owner = String(item?.owner || "").trim();
    const due = String(item?.due || "").trim();
    const key = byteTrim(`action-item:${roomId}:${owner}:${hash(text)}`, 255);
    written.push(await write(remember, {
      kind: "action-item",
      text,
      idempotencyKey: key,
      actionItem: { roomId, text, owner, due, attendees, source: "meeting" },
    }, key));
  }
  for (const decision of input.decisions ?? []) {
    const text = String(decision?.text || "").trim();
    const id = typeof decision?.id === "string" && decision.id ? decision.id : "";
    if (!text || !id || decision.blobId) continue;
    written.push(await write(remember, {
      kind: "decision",
      text,
      idempotencyKey: id,
      decision: {
        id,
        roomId,
        text,
        inviteMemberIds: attendees,
        account: "company",
        kind: "decision",
        speakerMemberId: decision.speakerMemberId || "",
        spokenAt: decision.spokenAt || "",
      },
    }, id));
  }
  return written.filter(Boolean);
}

/**
 * A plain minutes draft. A remembered preference about where to post is included.
 */
export function draftMinutes({ room, decisions, memories } = {}) {
  const lines = (decisions ?? []).map((decision) => String(decision?.text || "").trim()).filter(Boolean);
  const preference = (memories ?? []).find((memory) => memory?.kind === "team-preference" && /minutes/i.test(memory.text || ""));
  const delivery = preference ? String(preference.text) : "";
  if (!lines.length && !delivery) return null;
  return {
    roomId: room?.id || "",
    text: lines.join("\n"),
    delivery,
  };
}

async function write(remember, document, key) {
  const saved = await remember(document);
  return { kind: document.kind, key, blobId: saved?.blobId ?? null };
}

function minutesOf(minutes) {
  if (!minutes) return { text: "", delivery: "" };
  if (typeof minutes === "string") return { text: minutes.trim(), delivery: "" };
  const text = String(minutes.text || minutes.summary || "").trim();
  const delivery = String(minutes.delivery || "").trim();
  return { text, delivery };
}

function attendeesOf(room) {
  const list = Array.isArray(room?.attendees) ? room.attendees : (Array.isArray(room?.memberIds) ? room.memberIds : []);
  return list.map((item) => String(item)).filter(Boolean);
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function byteTrim(value, max) {
  let text = String(value ?? "");
  while (Buffer.byteLength(text) > max) text = text.slice(0, -1);
  return text;
}
