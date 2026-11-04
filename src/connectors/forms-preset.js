import { formsFakeEnabled } from "../mcp-forms/api.js";
import { requestOrigin } from "../identity/routes.js";
import { testConnection } from "./client.js";
import { connectorMessage } from "./errors.js";
import { FORMS_SCOPES } from "./google-person.js";

export const GOOGLE_FORMS_PRESET = "google-forms";

export const GOOGLE_FORMS_TOOLS = Object.freeze([
  "create_form",
  "add_questions",
  "get_form",
  "list_responses",
  "publish_form",
]);

export const FORMS_CONNECT_PATH = "/console/auth/google?intent=forms&next=/console/connectors";

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
  let granted = false;
  try {
    granted = Boolean(input.personId && input.grants && await input.grants.granted(input.personId));
  } catch {
    granted = false;
  }
  if (!granted) return { state: "needs_access", connectUrl: FORMS_CONNECT_PATH };
  return { state: "add", connectUrl: "" };
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
      message: "Connect Google Forms before adding it.",
    };
  }
  const url = `${requestOrigin(input.req, input.env)}/mcp/forms`;
  const connector = await input.store.create(input.tenantId, {
    name: "Google Forms",
    url,
    preset: GOOGLE_FORMS_PRESET,
    authType: "google_oauth",
    scopes: FORMS_SCOPES,
  });
  const test = await testConnection({ url, env: input.env });
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
