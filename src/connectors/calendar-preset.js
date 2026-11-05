import { calendarPresentedConnected } from "../calendar/fake.js";
import { CALENDAR_SCOPES, calendarGrantPartial } from "../calendar/mcp.js";
import { requestOrigin } from "../identity/routes.js";
import { GOOGLE_CALENDAR_MCP_URL, GOOGLE_CALENDAR_PRESET } from "./builtin-calendar.js";
import { testConnection } from "./client.js";
import { connectorMessage } from "./errors.js";

export { GOOGLE_CALENDAR_MCP_URL, GOOGLE_CALENDAR_PRESET };

export const CALENDAR_CONNECT_PATH = "/console/auth/google?intent=calendar&next=/console/connectors";
export const CALENDAR_PARTIAL_MESSAGE = "Google did not grant Calendar access. Connect again and allow Calendar.";

/**
 * The preset shares the calendar-edit grant. A row is Connected.
 * An existing grant is ready ("Connected"), with no second consent.
 * Otherwise the card needs access.
 *
 * @param {{
 *   store: { list: Function },
 *   tenantId: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 */
export async function googleCalendarPresetState(input) {
  const connectors = await input.store.list(input.tenantId);
  if (connectors.some((item) => item.preset === GOOGLE_CALENDAR_PRESET)) {
    return { state: "connected", connectUrl: "" };
  }
  if (calendarPresentedConnected(input.env)) return { state: "ready", connectUrl: "" };
  return {
    state: "needs_access",
    connectUrl: CALENDAR_CONNECT_PATH,
    ...(calendarGrantPartial(input.env) ? { message: CALENDAR_PARTIAL_MESSAGE } : {}),
  };
}

/**
 * Adds the Calendar connector on the same grant calendar-edit already uses.
 * Read and write tools start on. Delete stays off.
 *
 * @param {{
 *   store: { list: Function, create: Function, recordTest: Function, setToolEnabled: Function, remove: Function },
 *   tenantId: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   req: import("node:http").IncomingMessage,
 *   calendarMcp?: { server: Function },
 * }} input
 */
export async function addGoogleCalendarPreset(input) {
  const existing = (await input.store.list(input.tenantId)).find((item) => item.preset === GOOGLE_CALENDAR_PRESET);
  if (existing) return { ok: true, connector: existing };
  const state = await googleCalendarPresetState(input);
  if (state.state === "needs_access") {
    return {
      ok: false,
      code: "needs_access",
      connectUrl: state.connectUrl,
      message: state.message || "Connect Google Calendar before adding it.",
      detail: state.message || "",
    };
  }
  const url = GOOGLE_CALENDAR_MCP_URL;
  const connector = await input.store.create(input.tenantId, {
    name: "Google Calendar",
    url,
    preset: GOOGLE_CALENDAR_PRESET,
    authType: "google_oauth",
    scopes: CALENDAR_SCOPES,
  });
  const test = await testConnection({
    url,
    preset: GOOGLE_CALENDAR_PRESET,
    env: input.env,
    calendarMcp: input.calendarMcp,
    origin: requestOrigin(input.req, input.env),
  });
  if (!test?.ok) {
    await input.store.remove(input.tenantId, connector.id);
    return {
      ok: false,
      code: test?.code || "protocol",
      message: test?.message || connectorMessage(test?.code || "protocol"),
    };
  }
  let saved = await input.store.recordTest(input.tenantId, connector.id, test);
  for (const tool of saved?.tools || []) {
    if (tool.actionClass === "delete") continue;
    const next = await input.store.setToolEnabled(input.tenantId, connector.id, tool.name, true);
    if (next) saved = next;
  }
  return { ok: true, connector: saved, test };
}
