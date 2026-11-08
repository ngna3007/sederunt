import { FAVICON_LINK, sederuntMark } from "./sederunt-mark.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Sederunt</title>${FAVICON_LINK}<link rel="stylesheet" href="/console.css"></head>`;

export function renderAdminSignIn({ error = "", configured = true } = {}) {
  return `${head("Admin sign in")}<body><main class="auth"><section class="auth-card" aria-labelledby="admin-title">
    <p class="auth-mark">${sederuntMark()}<span class="brand-word">Sederunt</span></p>
    <h1 id="admin-title">Admin sign in</h1><p class="page-lede">Manage accounts, workspaces, and user data.</p>
    ${error ? `<p class="alert" role="alert">${escape(error)}</p>` : ""}
    ${configured ? `<form method="post" action="/admin/login" class="admin-login">
      <label for="username">Username</label><input id="username" name="username" autocomplete="username" maxlength="80" required autofocus>
      <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required>
      <button class="primary" type="submit">Sign in to admin</button></form>` : ""}
    <p class="admin-muted"><a href="/console">Back to Sederunt</a></p></section></main></body></html>`;
}

export function renderAdminPage({ csrf, username }) {
  return `${head("Accounts")}<body class="admin-body">
    <aside class="admin-sidebar"><a class="admin-brand" href="/admin" aria-label="Sederunt">${sederuntMark()}<span>Sederunt</span></a>
      <p class="admin-nav-label">Administration</p><nav aria-label="Admin"><a href="/admin" aria-current="page">Accounts</a><a href="/console">Open app</a></nav>
      <div class="admin-sidebar-foot"><span>Signed in as ${escape(username)}</span><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${escape(csrf)}"><button class="ghost">Sign out</button></form></div>
    </aside>
    <main class="admin-main"><header class="admin-topbar">Administration <span>Accounts &amp; user data</span></header>
      <div class="admin-content"><div class="admin-heading"><div><h1>Accounts</h1><p class="admin-muted">Find an account, review its workspaces, and manage its data.</p></div><button id="refresh">Refresh</button></div>
      <p id="notice" role="status" class="alert info" hidden></p>
      <div class="admin-grid"><section class="admin-panel" aria-label="Account directory">
        <form id="search-form" class="admin-search"><label class="sr" for="search">Search accounts by email or name</label><input id="search" type="search" placeholder="Search email or name" maxlength="120"><button type="submit">Search</button></form>
        <p id="list-state" class="admin-list-state" role="status">Loading accounts…</p>
        <div class="admin-table-wrap"><table class="admin-table"><caption class="sr">Sederunt accounts</caption><thead><tr><th scope="col">Account</th><th scope="col">Workspaces</th><th scope="col">Last sign in</th></tr></thead><tbody id="accounts"></tbody></table></div>
        <footer class="admin-pagination"><span id="page-label"></span><div><button id="previous" disabled>Previous</button><button id="next" disabled>Next</button></div></footer>
      </section><section class="admin-panel admin-detail" aria-labelledby="detail-title"><div id="detail"><h2 id="detail-title">Select an account</h2><p class="admin-muted">Choose a row to see workspaces, today’s AI usage, and recovery actions.</p></div></section></div>
      <p class="admin-retention">Data deletion removes app workspace access and onboarding data. The Google login is kept. Contributions in shared workspaces, external recordings, Walrus blobs, Slack messages, and published proofs remain.</p>
      </div>
    </main>
    <dialog id="confirm-dialog" class="admin-dialog" aria-labelledby="confirm-title"><form id="confirm-form">
      <h2 id="confirm-title"></h2><p id="confirm-account" class="admin-muted"></p><div id="confirm-scope"></div>
      <p class="admin-muted" id="confirm-help"></p><label for="confirm-input">Type the account email to confirm</label><input id="confirm-input" autocomplete="off" required aria-describedby="confirm-help">
      <p id="confirm-error" class="alert" role="alert" hidden></p><footer><button type="button" id="cancel">Cancel</button><button type="submit" id="confirm-submit" class="danger" disabled>Confirm</button></footer>
    </form></dialog>
    <script>(${adminClient.toString()})(${JSON.stringify(csrf)});</script>
    </body></html>`;
}

function adminClient(csrf) {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let offset = 0;
  let selected = "";
  let preview = null;
  let listRequest = 0;
  let detailRequest = 0;
  let pending = false;
  const date = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never";
  const notice = (message, error = false) => { $("notice").textContent = message; $("notice").className = error ? "alert" : "alert info"; $("notice").hidden = !message; };
  async function api(path, body) {
    const response = await fetch(`/admin/api/${path}`, body ? { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...body, csrf }) } : {});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request failed.");
    return result;
  }
  function scope(space) {
    return space.role === "owner" && Number(space.members) === 1 ? "Delete workspace and its app records" : "Leave workspace; other members keep their data";
  }
  async function loadAccounts() {
    const request = ++listRequest;
    $("list-state").textContent = "Loading accounts…";
    $("list-state").hidden = false;
    $("accounts").replaceChildren();
    $("previous").disabled = true;
    $("next").disabled = true;
    try {
      const result = await api(`accounts?q=${encodeURIComponent($("search").value)}&offset=${offset}`);
      if (request !== listRequest) return;
      $("list-state").textContent = result.accounts.length ? "" : "No accounts match this search.";
      $("list-state").hidden = Boolean(result.accounts.length);
      $("accounts").innerHTML = result.accounts.map((account) => `<tr${selected === account.id ? ' class="selected"' : ""}><td><button class="admin-account" data-account="${esc(account.id)}" aria-pressed="${selected === account.id}"><strong>${esc(account.name || account.email || account.id)}</strong><span>${esc(account.email || "No email")}</span><small>${esc((account.providers || []).filter(Boolean).join(" · "))}</small></button></td><td>${Number(account.workspaces)}</td><td>${esc(date(account.last_sign_in_at))}</td></tr>`).join("");
      $("previous").disabled = offset === 0;
      $("next").disabled = !result.more;
      $("page-label").textContent = result.accounts.length ? `Showing ${offset + 1}–${offset + result.accounts.length}` : "No results";
    } catch (error) {
      if (request !== listRequest) return;
      $("list-state").textContent = `${error.message} Use Refresh to try again.`;
    }
  }
  async function loadDetail(id) {
    selected = id;
    const request = ++detailRequest;
    document.querySelectorAll("[data-account]").forEach((button) => { button.setAttribute("aria-pressed", String(button.dataset.account === id)); button.closest("tr").classList.toggle("selected", button.dataset.account === id); });
    $("detail").innerHTML = '<p role="status">Loading account…</p>';
    try {
      const account = await api(`accounts/${encodeURIComponent(id)}`);
      if (request !== detailRequest) return;
      const blocked = account.workspaces.some((s) => s.role === "owner" && s.members > 1 && !s.otherOwners);
      $("detail").innerHTML = `<h2 id="detail-title">${esc(account.email || account.id)}</h2><p class="admin-account-id">${esc(account.id)}</p>
        <section class="admin-detail-section"><h3>Workspaces</h3><ul class="admin-workspaces">${account.workspaces.map((space) => `<li><div><strong>${esc(space.name)}</strong><span>${esc(space.kind)} · ${esc(space.role)} · ${Number(space.members)} member${Number(space.members) === 1 ? "" : "s"}</span></div></li>`).join("") || '<li class="admin-muted">No workspaces</li>'}</ul></section>
        <section class="admin-detail-section"><h3>Ask AI today</h3><div class="admin-quota"><strong>${Number(account.quota.used)} <span>/ ${Number(account.quota.limit)}</span></strong><span>${Number(account.quota.remaining)} prompt${Number(account.quota.remaining) === 1 ? "" : "s"} available</span></div><p class="admin-muted">Resets ${esc(new Date(account.quota.resetAt).toLocaleString())}. Usage is shared across this account’s workspaces.</p>${account.backend === "memory" ? '<p class="alert warn">Usage is held in this process only. Configure Redis for reliable resets across deployments.</p>' : ""}
        <button data-action="reset-quota">Reset AI quota</button></section>
        <section class="admin-detail-section"><h3>Delete user data</h3><p class="admin-muted">Delete this account’s app data and reset onboarding. Keep its Google login. End running meetings and close this account’s app tabs first.</p>${blocked ? '<p class="alert warn">This account is the only owner of a workspace with other members. Transfer ownership before deleting this account’s data.</p>' : ""}<button class="danger" data-action="restart-demo" ${blocked ? "disabled" : ""}>Delete user data</button></section>`;
    } catch (error) { if (request === detailRequest) $("detail").innerHTML = `<p class="alert" role="alert">${esc(error.message)}</p>`; }
  }
  $("accounts").addEventListener("click", (event) => { const button = event.target.closest("[data-account]"); if (button) loadDetail(button.dataset.account); });
  $("search-form").addEventListener("submit", (event) => { event.preventDefault(); offset = 0; loadAccounts(); });
  $("refresh").addEventListener("click", () => { loadAccounts(); if (selected) loadDetail(selected); });
  $("previous").addEventListener("click", () => { offset = Math.max(0, offset - 25); loadAccounts(); });
  $("next").addEventListener("click", () => { offset += 25; loadAccounts(); });
  $("detail").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || pending) return;
    pending = true;
    button.disabled = true;
    notice("Preparing action preview…");
    try {
      preview = await api("preview", { userId: selected, action: button.dataset.action });
      const restart = preview.action === "restart-demo";
      $("confirm-title").textContent = restart ? "Delete this user’s data?" : "Reset today’s AI quota?";
      $("confirm-account").textContent = preview.plan.email || preview.plan.id;
      $("confirm-scope").innerHTML = restart ? `<ul class="admin-scope">${preview.plan.workspaces.map((space) => `<li><strong>${esc(space.name)}</strong><span>${esc(scope(space))}</span></li>`).join("")}</ul><p>Remove this account’s Google grants and bot preferences. Replace its personal space. Clear the current Ask AI conversation and reset today’s quota.</p><p class="alert warn">Contributions in shared workspaces, external recordings, Walrus blobs, Slack messages and published proofs remain. This action cannot be undone.</p>` : "<p>Restore the full daily prompt allowance for this account. Keep its conversation, files, workspace memberships, and settings.</p>";
      $("confirm-help").textContent = `Enter ${preview.confirmation}. This preview expires in 5 minutes.`;
      $("confirm-input").previousElementSibling.textContent = preview.plan.email ? "Type the account email to confirm" : "Type the account ID to confirm";
      $("confirm-input").value = "";
      $("confirm-error").hidden = true;
      $("confirm-submit").textContent = restart ? "Delete user data" : "Reset quota";
      $("confirm-submit").disabled = true;
      $("confirm-dialog").showModal();
      $("confirm-input").focus();
      notice("");
    } catch (error) { notice(error.message, true); }
    finally { pending = false; button.disabled = false; }
  });
  $("cancel").addEventListener("click", () => { if (!pending) $("confirm-dialog").close(); });
  $("confirm-dialog").addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
  $("confirm-input").addEventListener("input", () => { $("confirm-submit").disabled = !preview || $("confirm-input").value !== preview.confirmation; });
  $("confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || !preview || $("confirm-input").value !== preview.confirmation) return;
    pending = true;
    $("confirm-submit").disabled = true;
    $("cancel").disabled = true;
    $("confirm-submit").textContent = "Applying…";
    try {
      const result = await api("confirm", { token: preview.token, confirmation: $("confirm-input").value });
      $("confirm-dialog").close();
      notice(result.message, result.partial);
      loadAccounts();
      loadDetail(selected);
    } catch (error) { $("confirm-error").textContent = error.message; $("confirm-error").hidden = false; }
    finally { pending = false; $("cancel").disabled = false; $("confirm-submit").textContent = "Preview again to continue"; $("confirm-submit").disabled = true; }
  });
  loadAccounts();
}
