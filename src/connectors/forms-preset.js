import { formsFakeEnabled } from "../mcp-forms/api.js";
import { requestOrigin } from "../identity/routes.js";
import { BUILTIN_GOOGLE_FORMS_URL, GOOGLE_FORMS_PRESET } from "./builtin-forms.js";
import { testConnection } from "./client.js";
import { connectorMessage } from "./errors.js";
import { FORMS_SCOPES } from "./google-person.js";

export { BUILTIN_GOOGLE_FORMS_URL, GOOGLE_FORMS_PRESET };

export const GOOGLE_FORMS_TOOLS = Object.freeze([
  "create_form",
  "add_questions",
  "get_form",
  "list_responses",
  "publish_form",
]);

export const FORMS_CONNECT_PATH = "/console/auth/google?intent=forms&next=/console/connectors";
export const FORMS_PARTIAL_MESSAGE = "Google did not grant Forms access. Connect again and allow Forms.";

/**
 * @param {{
 *   store: { list: Function },
 *   tenantId: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   grants?: { granted?: Function },
 *   personId?: string,
 * }} input
 */
export async function googleFormsPresetState(input) {
  const connectors = await input.store.list(input.tenantId);
  if (connectors.some((item) => item.preset === GOOGLE_FORMS_PRESET)) {
    return { state: "connected", connectUrl: "" };
  }
  if (formsFakeEnabled(input.env)) return { state: "add", connectUrl: "" };
  const access = await formsAccess(input);
  if (!access.granted) {
    return {
      state: "needs_access",
      connectUrl: FORMS_CONNECT_PATH,
      ...(access.partial ? { message: FORMS_PARTIAL_MESSAGE } : {}),
    };
  }
  return { state: "add", connectUrl: "" };
}

/**
 * @param {{ personId?: string, tenantId?: string, grants?: { granted?: Function, describe?: Function } }} input
 */
async function formsAccess(input) {
  if (!input.personId || !input.grants) return { granted: false, partial: false };
  const tenantId = input.tenantId || "";
  try {
    if (typeof input.grants.describe === "function") {
      const described = await input.grants.describe(input.personId, { tenantId });
      return { granted: described?.granted === true, partial: described?.partial === true };
    }
    const granted = Boolean(await input.grants.granted(input.personId, { tenantId }));
    return { granted, partial: false };
  } catch {
    return { granted: false, partial: false };
  }
}

/**
 * One click adds the Forms connector for this space.
 * Fake mode connects without a Google grant. Otherwise the person needs Forms scopes.
 *
 * @param {{
 *   store: { list: Function, create: Function, recordTest: Function, setToolEnabled: Function, remove: Function, get: Function },
 *   tenantId: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   req: import("node:http").IncomingMessage,
 *   grants?: { granted?: Function },
 *   personId?: string,
 * }} input
 */
export async function addGoogleFormsPreset(input) {
  const existing = (await input.store.list(input.tenantId)).find((item) => item.preset === GOOGLE_FORMS_PRESET);
  if (existing) return { ok: true, connector: existing };
  const state = await googleFormsPresetState(input);
  if (state.state === "needs_access") {
    return {
      ok: false,
      code: "needs_access",
      connectUrl: state.connectUrl,
      message: state.message || "Connect Google Forms before adding it.",
      detail: state.message || "",
    };
  }
  const url = BUILTIN_GOOGLE_FORMS_URL;
  const connector = await input.store.create(input.tenantId, {
    name: "Google Forms",
    url,
    preset: GOOGLE_FORMS_PRESET,
    authType: "google_oauth",
    scopes: FORMS_SCOPES,
  });
  const test = await testConnection({
    url,
    preset: GOOGLE_FORMS_PRESET,
    env: input.env,
    forms: input.forms,
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
  for (const name of GOOGLE_FORMS_TOOLS) {
    const next = await input.store.setToolEnabled(input.tenantId, connector.id, name, true);
    if (next) saved = next;
  }
  return { ok: true, connector: saved, test };
}
