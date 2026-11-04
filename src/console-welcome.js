/**
 * First-run welcome and invite acceptance. The console shell stays on Home.
 * This page asks the one space question, then gets out of the way.
 */

/**
 * @param {{
 *   step?: "choose" | "name" | "ready",
 *   kind?: "team" | "company" | "",
 *   name?: string,
 *   emails?: string,
 *   domain?: string,
 *   error?: string,
 *   invites?: Array<{ email: string, href: string }>,
 *   spaceName?: string,
 * }} [state]
 */
export function renderWelcomePage(state = {}) {
  const step = state.step === "name" || state.step === "ready" ? state.step : "choose";
  const kind = state.kind === "company" ? "company" : state.kind === "team" ? "team" : "";
  const error = state.error ? `<p class="alert" id="space-error" role="alert">${escapeText(state.error)}</p>` : "";
  let body = "";
  if (step === "ready") body = readyStep(state);
  else if (step === "name" && kind) body = nameStep(kind, state, error);
  else body = chooseStep(error);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${step === "ready" ? "Invites" : "Welcome"} · Sederunt</title>
<link rel="stylesheet" href="/console.css">
</head>
<body class="welcome-page">
<main class="auth welcome">
  <section class="auth-card welcome-card" aria-labelledby="welcome-title">
    <p class="auth-mark"><span class="tile-mark" aria-hidden="true">S</span> Sederunt</p>
    ${body}
  </section>
</main>
<script>
(function () {
  var group = document.getElementById("space-choices");
  if (group) {
    var radios = Array.prototype.slice.call(group.querySelectorAll("[role='radio']"));
    function select(index) {
      radios.forEach(function (radio, i) {
        var on = i === index;
        radio.setAttribute("aria-checked", on ? "true" : "false");
        radio.tabIndex = on ? 0 : -1;
      });
    }
    var current = 0;
    radios.forEach(function (radio, index) {
      if (radio.getAttribute("aria-checked") === "true") current = index;
      radio.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % radios.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + radios.length - 1) % radios.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = radios.length - 1;
        else return;
        event.preventDefault();
        select(next);
        radios[next].focus();
      });
    });
    select(current);
  }
  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = document.getElementById(button.getAttribute("data-copy"));
      var value = input ? input.value : "";
      var done = function () {
        button.textContent = "Copied";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(function () {
          if (input) { input.focus(); input.select(); }
        });
        return;
      }
      if (input) { input.focus(); input.select(); }
    });
  });
  var name = document.getElementById("space-name");
  if (name && name.getAttribute("aria-invalid") === "true") name.focus();
})();
</script>
</body>
</html>`;
}

/**
 * A short HTML page for a switcher error. Never a raw JSON body.
 *
 * @param {string} title
 * @param {string} message
 */
export function renderFlowMessage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)} · Sederunt</title>
<link rel="stylesheet" href="/console.css">
</head>
<body class="welcome-page">
<main class="auth welcome">
  <section class="auth-card welcome-card" aria-labelledby="flow-title">
    <p class="auth-mark"><span class="tile-mark" aria-hidden="true">S</span> Sederunt</p>
    <h1 id="flow-title">${escapeText(title)}</h1>
    <p class="alert" role="alert">${escapeText(message)}</p>
    <p class="welcome-skip"><a href="/console">Back to Home</a></p>
  </section>
</main>
</body>
</html>`;
}

/**
 * @param {{ error?: string, tokenHint?: string }} [state]
 */
export function renderInvitePage(state = {}) {
  const error = state.error ? `<p class="alert" id="invite-error" role="alert">${escapeText(state.error)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accept invite · Sederunt</title>
<link rel="stylesheet" href="/console.css">
</head>
<body class="welcome-page">
<main class="auth welcome">
  <section class="auth-card welcome-card" aria-labelledby="invite-title">
    <p class="auth-mark"><span class="tile-mark" aria-hidden="true">S</span> Sederunt</p>
    <h1 id="invite-title">Accept invite</h1>
    <p class="page-lede">Join this space with the email on your account.</p>
    ${error}
    <form method="post">
      <button class="primary" type="submit" id="accept-invite">Accept invite</button>
    </form>
    <p class="welcome-skip"><a href="/console">Back to Home</a></p>
  </section>
</main>
</body>
</html>`;
}

function chooseStep(error) {
  return `<h1 id="welcome-title">How will you use Sederunt?</h1>
    <p class="page-lede">You already have a Personal space. Pick what to open next.</p>
    ${error}
    <form method="post" action="/console/welcome" id="choice-form">
      <div class="choice-grid" id="space-choices" role="radiogroup" aria-labelledby="welcome-title">
        ${choice("personal", "Just me", "Stay in your Personal space.", true)}
        ${choice("team", "My team", "A shared space for the people you work with.", false)}
        ${choice("company", "My company", "A space for the company, with an optional email domain.", false)}
      </div>
    </form>
    ${skipForm()}`;
}

function choice(value, title, copy, checked) {
  return `<button class="choice-card" type="submit" name="kind" value="${value}" role="radio" id="choice-${value}" aria-checked="${checked ? "true" : "false"}" tabindex="${checked ? "0" : "-1"}">
      <span class="choice-title">${title}</span>
      <span class="choice-copy">${copy}</span>
    </button>`;
}

function nameStep(kind, state, error) {
  const company = kind === "company";
  const title = company ? "Name the company" : "Name the team";
  const nameLabel = company ? "Company name" : "Team name";
  const invalid = state.error ? ` aria-invalid="true" aria-describedby="space-error"` : "";
  const domain = company
    ? `<label>Email domain (optional)
        <input id="space-domain" name="domain" autocomplete="off" maxlength="253" placeholder="example.com" value="${escapeText(state.domain || "")}">
        <span class="field-hint">Optional. Leave it blank if you don't want one saved.</span>
      </label>`
    : "";
  return `<h1 id="welcome-title">${title}</h1>
    <p class="page-lede">Then invite people, if you want to. Sederunt does not send email yet.</p>
    ${error}
    <form method="post" action="/console/welcome" id="space-form">
      <input type="hidden" name="action" value="create">
      <input type="hidden" name="kind" value="${kind}">
      <label>${nameLabel}
        <input id="space-name" name="name" required maxlength="120" minlength="1" autocomplete="organization" value="${escapeText(state.name || "")}"${invalid}>
      </label>
      ${domain}
      <label>Invite emails (optional)
        <textarea id="space-emails" name="emails" rows="4" placeholder="one@example.com, two@example.com">${escapeText(state.emails || "")}</textarea>
        <span class="field-hint">Optional. Separate addresses with commas or new lines.</span>
      </label>
      <button class="primary" type="submit" id="space-submit">Create the space</button>
    </form>
    <p class="welcome-skip"><a href="/console/welcome">Back</a></p>
    ${skipForm()}`;
}

function readyStep(state) {
  const invites = Array.isArray(state.invites) ? state.invites : [];
  const error = state.error ? `<p class="alert" id="space-error" role="alert">${escapeText(state.error)}</p>` : "";
  const list = invites.length
    ? `<ul class="invite-list">${invites.map((invite, index) => `<li class="invite-row">
        <span class="invite-email">${escapeText(invite.email)}</span>
        <label class="sr" for="invite-link-${index}">Invite link for ${escapeText(invite.email)}</label>
        <input id="invite-link-${index}" readonly value="${escapeText(invite.href)}">
        <button type="button" data-copy="invite-link-${index}">Copy</button>
      </li>`).join("")}</ul>`
    : `<p>No invites yet. You can add people later.</p>`;
  return `<h1 id="welcome-title">${escapeText(state.spaceName || "Space")} is ready</h1>
    <p class="page-lede">Copy a link and send it yourself. Sederunt does not send email yet.</p>
    ${error}
    ${list}
    <a class="primary welcome-go" id="welcome-home" href="/console">Go to Home</a>`;
}

function skipForm() {
  return `<form method="post" action="/console/welcome" class="welcome-skip">
    <button type="submit" name="action" value="skip" class="text-link" id="skip-onboarding">Skip for now</button>
  </form>`;
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
