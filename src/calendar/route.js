import { guardConsole } from "../console-auth.js";
import { calendarPresentedConnected } from "./fake.js";
import { CalendarError, calendarStatus } from "./validate.js";

/**
 * Read or save one calendar event for a console session.
 * POST requires the same JSON same-origin check as other console writes.
 *
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   send: Function,
 *   readJson: Function,
 *   calendar: { readEventDetails?: Function, updateEventDetails?: Function } | null,
 *   sameOrigin: (req: import("node:http").IncomingMessage) => boolean,
 *   id: string,
 * }} ctx
 */
export async function handleCalendarEvent(ctx) {
  const { req, res, send, id } = ctx;
  const gate = guardConsole(req, ctx.env);
  if (gate.required && !gate.session) {
    sendJson(send, res, 401, { ok: false, error: "sign-in", message: "Sign in." });
    return;
  }
  if (!/^[A-Za-z0-9_.:@-]{1,256}$/.test(id)) {
    sendJson(send, res, 404, { ok: false, error: "not-found", message: "That meeting was not found." });
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  if (req.method === "POST" && !ctx.sameOrigin(req)) {
    sendJson(send, res, 403, { ok: false, error: "forbidden", message: "That request was refused." });
    return;
  }
  const calendar = ctx.calendar;
  if (!calendarPresentedConnected(ctx.env) || typeof calendar?.readEventDetails !== "function") {
    sendJson(send, res, 409, { ok: false, error: "not-connected", message: "Calendar is not connected." });
    return;
  }
  try {
    if (req.method === "GET") {
      const event = publicEvent(await calendar.readEventDetails(id));
      sendJson(send, res, 200, { ok: true, event });
      return;
    }
    const body = await ctx.readJson(req);
    const sendUpdates = body?.sendUpdates === "all" || body?.sendUpdates === "none"
      ? body.sendUpdates
      : (body?.notify === false ? "none" : "all");
    const event = publicEvent(await calendar.updateEventDetails({
      id,
      description: typeof body?.description === "string" ? body.description : "",
      attendees: Array.isArray(body?.attendees) ? body.attendees : [],
      sendUpdates,
    }));
    sendJson(send, res, 200, { ok: true, sendUpdates, event });
  } catch (error) {
    const typed = error instanceof CalendarError ? error : null;
    const code = typed?.code || "network";
    const message = typed?.message || "Calendar could not be reached. Try again.";
    sendJson(send, res, calendarStatus(code), { ok: false, error: code, message });
  }
}

function sendJson(send, res, status, body) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function publicEvent(event) {
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
  return {
    id: String(event?.id || ""),
    title: String(event?.title || "Meeting"),
    start: String(event?.start || ""),
    end: String(event?.end || ""),
    description: typeof event?.description === "string" ? event.description : "",
    readOnly: event?.readOnly === true,
    attendees: attendees.map((guest) => {
      const row = { email: String(guest?.email || "") };
      if (guest?.name) row.name = String(guest.name);
      if (guest?.responseStatus) row.responseStatus = String(guest.responseStatus);
      if (guest?.organizer) row.organizer = true;
      return row;
    }).filter((guest) => guest.email),
  };
}
