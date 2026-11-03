/**
 * Console sign-in. The process has one member and, when configured, one
 * passphrase. This page does not create an account.
 *
 * @param {{
 *   configured?: boolean,
 *   memberSet?: boolean,
 *   reason?: string,
 *   name?: string,
 *   next?: string,
 * }} [state]
 */
export function renderSignInPage(state = {}) {
  const configured = state.configured === true;
  const reason = state.reason || "";
  const name = escapeText(state.name || "");
  const next = escapeText(state.next || "/console");
  const alert = signInAlert(configured, state.memberSet !== false, reason);
  const form = configured
    ? `<form method="post" action="/console/sign-in" id="sign-in-form">
        <input type="hidden" name="next" value="${next}">
        <label>Name
          <input id="sign-name" name="name" autocomplete="name" maxlength="80" value="${name}" placeholder="The name you use in the room">
        </label>
        <label>Passphrase
          <input id="sign-pass" name="passphrase" type="password" autocomplete="current-password" required>
        </label>
        <button class="primary" type="submit" id="sign-submit">Sign in</button>
      </form>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Sederunt</title>
<link rel="stylesheet" href="/console.css">
</head>
<body>
<main class="auth">
  <section class="auth-card" aria-labelledby="sign-title">
    <p class="auth-mark"><span class="tile-mark" aria-hidden="true">S</span> Sederunt</p>
    <h1 id="sign-title">Sign in</h1>
    <p class="page-lede">The console opens with the passphrase set for this process. It is not a separate account.</p>
    ${alert}
    ${form}
  </section>
</main>
<script>
(function () {
  var form = document.getElementById("sign-in-form");
  if (!form) return;
  form.addEventListener("submit", function () {
    var button = document.getElementById("sign-submit");
    if (!button || button.getAttribute("aria-busy") === "true") return;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Checking";
  });
})();
</script>
</body>
</html>`;
}

function signInAlert(configured, memberSet, reason) {
  if (!configured) {
    return `<p class="alert info" role="status">Sign-in is not set up. Set SEDERUNT_CONSOLE_SECRET to a passphrase, then restart. Until then this page cannot open a session.</p>`;
  }
  if (!memberSet) {
    return `<p class="alert warn" role="status">SEDERUNT_MEMBER is not set. You can sign in, and the board will have no member to read as.</p>${reasonAlert(reason)}`;
  }
  return reasonAlert(reason);
}

function reasonAlert(reason) {
  if (reason === "mismatch") return `<p class="alert" role="alert">That passphrase does not match.</p>`;
  if (reason === "missing-pass") return `<p class="alert" role="alert">Enter the passphrase.</p>`;
  if (reason === "expired") return `<p class="alert warn" role="alert">This sign-in has expired. Enter the passphrase again.</p>`;
  if (reason === "invalid") return `<p class="alert" role="alert">This sign-in is not valid. Enter the passphrase again.</p>`;
  if (reason === "missing") return "";
  return "";
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
