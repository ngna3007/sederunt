/**
 * Account "Bot" card. Owners and admins edit the workspace name and wake
 * phrases. Members see the same card without a way to write.
 */

import { guardConsole } from "../console-auth.js";
import { loadSpaceView } from "../console-flow.js";
import {
  DEFAULT_BOT_NAME,
  defaultWakePhrases,
  previewLine,
  resolveBotIdentity,
  saveBotIdentity,
} from "../bot/identity.js";
import { loadPreferences } from "../bot/preferences.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ name?: string, phrases?: string[], phrasesCustomized?: boolean, canEdit?: boolean }} [state]
 */
export function renderBotSettings(state = {}) {
  const name = String(state.name || DEFAULT_BOT_NAME);
  const phrases = Array.isArray(state.phrases) && state.phrases.length ? state.phrases : defaultWakePhrases(name);
  const canEdit = state.canEdit === true;
  const customized = state.phrasesCustomized === true;
  const locked = canEdit ? "" : " disabled";
  const rows = phrases.map((phrase) => {
    const remove = canEdit
      ? `<button type="button" class="secondary" data-remove-phrase>Remove</button>`
      : "";
    return `<li class="bot-phrase-row"><input type="text" maxlength="40" value="${escapeHtml(phrase)}" aria-label="Wake phrase" autocomplete="off"${locked}>${remove}</li>`;
  }).join("");
  const add = canEdit ? `<button type="button" class="secondary" id="bot-add-phrase">Add a phrase</button>` : "";
  const save = canEdit ? `<p class="section-next"><button type="button" class="primary" id="bot-save">Save</button></p>` : "";
  const who = canEdit
    ? "People say this name to wake the bot in a meeting. Sederunt stays the name of the product."
    : "People say this name to wake the bot in a meeting. Only an owner or admin can change it.";
  return `<div class="settings-card" id="bot-card" data-can-edit="${canEdit ? "true" : "false"}" data-customized="${customized ? "true" : "false"}">
    <p class="section-label">Bot</p>
    <p class="card-help">${who}</p>
    <div class="bot-fields">
      <label class="bot-field" for="bot-name">Name
        <input id="bot-name" type="text" maxlength="32" value="${escapeHtml(name)}" autocomplete="off" spellcheck="false"${locked}>
      </label>
      <p id="bot-name-error" class="bot-field-error" role="alert" hidden></p>
      <div class="bot-field">
        <span class="bot-label" id="bot-phrase-label">Wake phrases</span>
        <ul class="bot-phrase-list" id="bot-phrase-list" aria-labelledby="bot-phrase-label">${rows}</ul>
        ${add}
      </div>
      <p id="bot-phrase-error" class="bot-field-error" role="alert" hidden></p>
      <p id="bot-preview" class="bot-preview">${escapeHtml(previewLine(name, phrases))}</p>
      ${save}
      <p id="bot-note" class="bot-note" role="status"></p>
    </div>
  </div>`;
}

/**
 * Local console (sign-in off) and a passphrase session may edit.
 * An OAuth member may not. An owner or admin may.
 */
export function canEditBot({ signedIn = false, oauth = false, role = "", authRequired = false } = {}) {
  if (!authRequired) return true;
  if (!signedIn) return false;
  if (!oauth) return true;
  return role === "owner" || role === "admin";
}

/**
 * GET /api/bot reads the workspace persona. POST saves it.
 * The store is the same preference boundary the prompt uses. RLS is the
 * database gate; this handler is the console gate.
 */
export async function handleBotSettings(ctx) {
  const { req, res, send, env, identity } = ctx;
  if (req.method !== "GET" && req.method !== "POST") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  const gate = guardConsole(req, env);
  if (gate.required && !gate.session) {
    send(res, 401, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "Sign in again." }));
    return;
  }
  const spaces = identity && gate.session?.kind === "oauth" ? await loadSpaceView(identity, gate.session) : null;
  const canEdit = canEditBot({
    signedIn: Boolean(gate.session),
    oauth: Boolean(spaces?.oauth),
    role: spaces?.activeRole || "",
    authRequired: gate.required,
  });
  const tenantId = spaces?.activeId || "local";
  const store = ctx.store;
  if (req.method === "GET") {
    const view = await readBot(store, tenantId);
    send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, canEdit, ...view }));
    return;
  }
  if (!canEdit) {
    send(res, 403, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "Only an owner or admin can change the bot." }));
    return;
  }
  let body = {};
  try {
    body = await ctx.readJson(req);
  } catch {
    send(res, 400, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: "That could not be saved." }));
    return;
  }
  try {
    const saved = await saveBotIdentity(store, { tenantId, name: body?.name, phrases: body?.phrases });
    send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, canEdit: true, ...saved }));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "That could not be saved.";
    send(res, 400, "application/json; charset=utf-8", JSON.stringify({ ok: false, error: message }));
  }
}

export async function readBot(store, tenantId) {
  if (!store) return resolveBotIdentity({});
  const loaded = await loadPreferences(store, { tenantId, userId: null });
  return resolveBotIdentity(loaded.workspace);
}
