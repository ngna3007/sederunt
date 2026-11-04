import { sederuntMark, FAVICON_LINK } from "./sederunt-mark.js";

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
  const passMessage = passphraseError(reason);
  const passInvalid = passMessage !== "";
  const form = configured
    ? `<form method="post" action="/console/sign-in" id="sign-in-form">
        <input type="hidden" name="next" value="${next}">
        <label>Passphrase (required)
          <input id="sign-pass" name="passphrase" type="password" autocomplete="current-password" required placeholder="Workspace passphrase"${passInvalid ? ' aria-invalid="true"' : ""} aria-describedby="${passInvalid ? "pass-error pass-hint" : "pass-hint"}">
          <span id="pass-hint" class="field-hint">Ask your workspace admin for the console passphrase.</span>
          ${passInvalid ? `<span id="pass-error" class="field-error" role="alert">${escapeText(passMessage)}</span>` : ""}
        </label>
        <label>Name (optional)
          <input id="sign-name" name="name" autocomplete="name" maxlength="80" value="${name}" placeholder="The name you use in the room">
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
${FAVICON_LINK}
<link rel="stylesheet" href="/console.css">
</head>
<body>
<main class="auth">
  <section class="auth-card" aria-labelledby="sign-title">
    <p class="auth-mark">${sederuntMark({ size: 32 })}<span class="brand-word">Sederunt</span></p>
    <h1 id="sign-title">Sign in</h1>
    <p class="page-lede">Enter your workspace passphrase.</p>
    ${alert}
    ${form}
  </section>
</main>
<script>
(function () {
  var pass = document.getElementById("sign-pass");
  if (pass && pass.getAttribute("aria-invalid") === "true") pass.focus();
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
    return `<p class="alert info" role="status">Sign-in is not set up on this server, so the console stays open.</p><details class="admin-note"><summary>For the person who runs this process</summary><p>Set SEDERUNT_CONSOLE_SECRET to a passphrase, then restart.</p></details>`;
  }
  if (!memberSet) {
    return `<p class="alert warn" role="status">This process has no member configured, so the board has no one to read as.</p><details class="admin-note"><summary>For the person who runs this process</summary><p>Set SEDERUNT_MEMBER, then restart.</p></details>${reasonAlert(reason)}`;
  }
  return reasonAlert(reason);
}

function passphraseError(reason) {
  if (reason === "mismatch") return "That passphrase does not match.";
  if (reason === "missing-pass") return "Enter the passphrase.";
  if (reason === "expired") return "This sign-in has expired. Enter the passphrase again.";
  if (reason === "invalid") return "This sign-in is not valid. Enter the passphrase again.";
  return "";
}

function reasonAlert(reason) {
  if (passphraseError(reason)) return "";
  return "";
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
