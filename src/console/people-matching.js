/**
 * Account-page "People matching" card. Admins get an override control.
 * A member sees the same rows without a way to write.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPeopleMatching({ matches = [], canOverride = false } = {}) {
  const rows = (matches || []).map((match) => {
    const email = escapeHtml(match.email || "");
    const user = match.slackUserId ? escapeHtml(match.slackUserId) : "No Slack user";
    const source = escapeHtml(match.source || "none");
    const delivery = match.slackUserId ? "slack" : "email";
    const control = canOverride
      ? `<label class="match-override">Slack user id <input name="slack_user_id" data-override-for="${email}" value="${match.slackUserId ? escapeHtml(match.slackUserId) : ""}" autocomplete="off"></label><button type="button" data-save-override="${email}">Save override</button>`
      : "";
    return `<li data-email="${email}" data-source="${source}" data-delivery="${delivery}"><span class="match-email">${email}</span><span class="match-user">${user}</span><span class="match-source">${source}</span>${control}</li>`;
  });
  const body = rows.length
    ? `<ul class="match-list">${rows.join("")}</ul>`
    : `<p class="card-help">No invitee matches yet.</p>`;
  return `<div class="settings-card" id="people-matching"><p class="section-label">People matching</p><p class="card-help">Invitee email to Slack user. An override wins over lookup.</p>${body}</div>`;
}

/** The override an admin save would write. Empty slack id clears the user and keeps source override. */
export function overrideFromControl({ email, slackUserId, overriddenBy, tenantId, workspaceId }) {
  const clean = String(slackUserId || "").trim();
  return {
    tenantId,
    workspaceId: workspaceId || "",
    email: String(email || "").trim().toLowerCase(),
    slackUserId: clean || null,
    overriddenBy: overriddenBy || null,
  };
}
