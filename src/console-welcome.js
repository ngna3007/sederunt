import { DEFAULT_BOT_NAME } from "./bot/identity.js";
import { brandLogo, brandSprite } from "./brand-logos.js";
import { sederuntMark, FAVICON_LINK } from "./sederunt-mark.js";

/**
 * First-run welcome: four short steps, then Home.
 *   1 Create your workspace (required)
 *   2 Connect your calendar
 *   3 Connect Slack
 *   4 Invite your team
 * Steps 2-4 can be skipped. The team step is also the "Invite people" page.
 */

export const WELCOME_STEPS = ["workspace", "calendar", "chat", "team"];

export const CALENDAR_DOCS = "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server";

/**
 * @param {{
 *   step?: "workspace" | "calendar" | "chat" | "team" | "sent",
 *   manage?: boolean,
 *   error?: string,
 *   notice?: string,
 *   name?: string,
 *   email?: string,
 *   renaming?: boolean,
 *   botName?: string,
 *   botInvalid?: boolean,
 *   joinable?: Array<{ id: string, name: string }>,
 *   calendar?: { connected?: boolean, meetings?: Array<{ when: string, title: string }>, unavailable?: boolean, autoJoin?: boolean, asked?: boolean },
 *   chat?: { slack?: boolean, channel?: string, asked?: boolean },
 *   team?: { workspaceName?: string, domain?: string, domainOn?: boolean, link?: string, invites?: Array<{ email: string, role: string }>, canManage?: boolean },
 *   sent?: { workspaceName?: string, invites?: Array<{ email: string, role: string, href: string }> },
 * }} [state]
 */
export function renderWelcomePage(state = {}) {
  const step = ["workspace", "calendar", "chat", "team", "sent"].includes(state.step) ? state.step : "workspace";
  const manage = state.manage === true && (step === "team" || step === "sent");
  const index = step === "sent" ? 4 : WELCOME_STEPS.indexOf(step) + 1;
  const view = step === "calendar" ? calendarStep(state)
    : step === "chat" ? chatStep(state)
      : step === "team" ? teamStep(state, manage)
        : step === "sent" ? sentStep(state, manage)
          : workspaceStep(state);
  const counter = manage ? "" : `<span class="ob-count" id="ob-step">Step ${index} of 4</span>`;
  const progress = manage ? "" : `<div class="ob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${index}"><span class="ob-progress-fill" data-step="${index}"></span></div>`;
  const error = state.error ? `<p class="ob-alert" id="ob-error" role="alert">${escapeText(state.error)}</p>` : "";
  const notice = state.notice ? `<p class="ob-note" id="ob-notice" role="status">${escapeText(state.notice)}</p>` : "";
  const open = view.form === false
    ? `<section class="ob-card" id="ob-card" data-step="${step}" aria-labelledby="ob-title">`
    : `<form class="ob-card" id="ob-card" data-step="${step}" method="post" action="/console/welcome${manage ? "?mode=manage" : ""}" aria-labelledby="ob-title" novalidate>
    <input type="hidden" name="step" value="${step}">`;
  const close = view.form === false ? "</section>" : "</form>";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(view.title)} · Sederunt</title>
${FAVICON_LINK}
<link rel="stylesheet" href="/console.css">
</head>
<body class="welcome-page ob-page">
${brandSprite()}
<main class="ob">
  ${open}
    <div class="ob-top">
      <span class="ob-brand">${sederuntMark({ size: 24 })}<span class="brand-word">Sederunt</span></span>
      ${counter}
    </div>
    ${progress}
    <div class="ob-body">
      <h1 id="ob-title">${escapeText(view.title)}</h1>
      <p class="ob-sub" id="ob-sub">${view.sub}</p>
      ${error}${notice}
      ${view.body}
    </div>
    <div class="ob-foot">
      <div class="ob-foot-left">${view.left || ""}</div>
      <div class="ob-foot-right">${view.right || ""}</div>
    </div>
  ${close}
</main>
<script>${WELCOME_SCRIPT}</script>
</body>
</html>`;
}

function backLink(href) {
  return `<a class="ob-link" href="${href}" id="ob-back">Back</a>`;
}

function workspaceStep(state) {
  const renaming = state.renaming === true;
  const name = String(state.name || "");
  const botName = String(state.botName || DEFAULT_BOT_NAME);
  const invalid = state.error && !state.botInvalid ? ` aria-invalid="true" aria-describedby="ob-error"` : "";
  const botInvalid = state.botInvalid ? ` aria-invalid="true" aria-describedby="ob-error"` : "";
  const joinable = renaming ? [] : (Array.isArray(state.joinable) ? state.joinable.filter((row) => row && row.id) : []);
  const joins = joinable.length ? `<div class="ob-join" id="ob-joinable">
        <p class="ob-label">Your team is already here</p>
        <ul class="ob-list">${joinable.map((row) => `<li class="ob-row">
          ${avatar(row.name)}
          <span class="ob-row-main"><span class="ob-row-title">${escapeText(row.name)}</span><span class="ob-row-meta">Open to your email domain</span></span>
          <button class="ob-btn" type="submit" name="join" value="${escapeAttr(row.id)}" formnovalidate>Join</button>
        </li>`).join("")}</ul>
        <p class="ob-or"><span>or create a new one</span></p>
      </div>` : "";
  const botFields = renaming ? "" : `
      <label class="ob-field" for="ob-bot-name"><span class="ob-label">Bot name <span class="ob-optional">optional</span></span>
        <input id="ob-bot-name" name="bot_name" type="text" value="${escapeAttr(botName)}" maxlength="32" autocomplete="off" spellcheck="false"${botInvalid}>
      </label>
      <p class="ob-hint" id="ob-bot-hint">People say this name in a meeting. Leave it as ${escapeText(DEFAULT_BOT_NAME)} if you like. Sederunt stays the product name.</p>`;
  return {
    title: renaming ? "Your workspace" : "Create your workspace",
    sub: renaming
      ? "This is the name your team sees. You can change it."
      : "Meetings, decisions and follow-ups live here. Your team joins it next.",
    body: `${joins}<input type="hidden" name="action" value="${renaming ? "rename" : "create"}">
      <label class="ob-field" for="workspace-name"><span class="ob-label">Workspace name</span>
        <input id="workspace-name" name="name" type="text" value="${escapeAttr(name)}" maxlength="120" autocomplete="organization" required${invalid}>
      </label>
      <p class="ob-hint">Usually your company or team name.</p>${botFields}`,
    left: state.email ? `<span class="ob-muted" id="ob-signed-in">Signed in as ${escapeText(state.email)}</span>` : "",
    right: `<button class="ob-primary" type="submit" id="ob-continue">Continue</button>`,
  };
}

function calendarStep(state) {
  const cal = state.calendar || {};
  const connected = cal.connected === true;
  const meetings = Array.isArray(cal.meetings) ? cal.meetings.slice(0, 4) : [];
  const status = connected
    ? `<span class="ob-status ok" id="calendar-status">${check()}Connected</span>`
    : `<span class="ob-status" id="calendar-status">${cal.asked ? "Finish in Setup" : "Not connected"}</span>`;
  const upcoming = !connected ? "" : meetings.length
    ? `<div class="ob-upcoming" id="calendar-upcoming">
        <p class="ob-label">Coming up</p>
        <ul class="ob-meetings">${meetings.map((row) => `<li><span class="ob-when">${escapeText(row.when)}</span><span class="ob-time">${escapeText(row.time || "")}</span><span class="ob-what">${escapeText(row.title)}</span></li>`).join("")}</ul>
      </div>`
    : `<p class="ob-empty-line" id="calendar-upcoming">${cal.unavailable ? "Calendar is connected, but it could not be read just now." : "Nothing on your calendar today or tomorrow."}</p>`;
  const toggle = connected ? `<label class="ob-toggle" for="auto-join">
        <span class="ob-toggle-copy"><span class="ob-row-title">Send Sederunt to my meetings automatically</span><span class="ob-row-meta">Any meeting on this calendar with a Meet, Zoom or Teams link.</span></span>
        <span class="switch"><input id="auto-join" name="auto_join" type="checkbox" role="switch"${cal.autoJoin === false ? "" : " checked"}></span>
      </label>` : "";
  return {
    title: "Connect your calendar",
    sub: "Sederunt sees your upcoming meetings, so it can join them and take notes.",
    body: `<input type="hidden" name="action" value="calendar">
      <ul class="ob-list" id="calendar-options">
        <li class="ob-row${connected ? " on" : ""}" id="calendar-google">
          <span class="ob-logo">${brandLogo("google-calendar", 20)}</span>
          <span class="ob-row-main"><span class="ob-row-title">Google Calendar</span><span class="ob-row-meta">Meet, Zoom and Teams links</span></span>
          ${status}
        </li>
        <li class="ob-row soon" id="calendar-outlook">
          <span class="ob-logo">${tile("O", "var(--brand-outlook)")}</span>
          <span class="ob-row-main"><span class="ob-row-title">Outlook Calendar</span></span>
          <span class="ob-soon">Coming soon</span>
        </li>
      </ul>
      ${upcoming}
      ${toggle}`,
    left: `${backLink("/console/welcome?step=workspace")}${connected ? "" : `<button class="ob-link" type="submit" name="choice" value="later" id="ob-skip" formnovalidate>Not now</button>`}`,
    right: connected
      ? `<button class="ob-primary" type="submit" name="choice" value="continue" id="ob-continue">Continue</button>`
      : `<button class="ob-primary" type="submit" name="choice" value="connect" id="calendar-connect">Connect Google Calendar</button>`,
  };
}

function chatStep(state) {
  const chat = state.chat || {};
  const slack = chat.slack === true;
  const waiting = !slack && state.slackInstall === true && chat.asked === true;
  const status = slack
    ? `<span class="ob-status ok" id="slack-status">${check()}Connected</span>`
    : `<span class="ob-status" id="slack-status">${waiting ? "Allow in the other tab" : chat.asked ? "Finish in Setup" : "Not connected"}</span>`;
  const soon = [
    ["teams", "Microsoft Teams"],
    ["gchat", "Google Chat"],
    ["discord", "Discord"],
    ["email", "Email digest"],
  ];
  const hint = slack
    ? `<p class="ob-hint">Add @Sederunt to a channel in Slack when you want it there.</p>`
    : "";
  return {
    title: slack ? "Slack is connected" : "Connect Slack",
    sub: slack
      ? "Continue. You can add the bot to a channel later."
      : "One allow adds the Sederunt bot to your Slack workspace.",
    body: `<input type="hidden" name="action" value="chat">
      <ul class="ob-list" id="chat-options">
        <li class="ob-row${slack ? " on" : ""}" id="chat-slack">
          <span class="ob-logo">${brandLogo("slack-icon", 20)}</span>
          <span class="ob-row-main"><span class="ob-row-title">Slack</span><span class="ob-row-meta">${slack ? "Bot connected" : "Allow once, then you are done on this page"}</span></span>
          ${status}
        </li>
      </ul>
      <p class="ob-soon-line" id="chat-soon"><span class="ob-soon">Coming soon</span> ${soon.map(([id, label]) => `<span id="chat-${id}">${label}</span>`).join(", ")}</p>
      ${hint}`,
    left: `${backLink("/console/welcome?step=calendar")}${slack ? "" : `<button class="ob-link" type="submit" name="choice" value="later" id="ob-skip" formnovalidate>Not now</button>`}`,
    right: slack
      ? `<button class="ob-primary" type="submit" name="choice" value="continue" id="ob-continue">Continue</button>`
      : `<button class="ob-primary" type="submit" name="choice" value="connect" id="slack-connect"${state.slackInstall === true && state.fakeTools !== true ? ' formtarget="_blank"' : ""}>Connect Slack</button>`,
  };
}

function teamStep(state, manage) {
  const team = state.team || {};
  const invites = Array.isArray(team.invites) ? team.invites : [];
  const domain = String(team.domain || "");
  const rows = invites.map((row) => inviteeRow(row.email, row.role)).join("");
  const count = invites.length;
  const link = team.link ? `<div class="ob-share" id="invite-link-row">
        <p class="ob-label" id="invite-link-label">Or share this link</p>
        <div class="ob-share-row">
          <span class="ob-share-icon" aria-hidden="true">${linkIcon()}</span>
          <label class="sr" for="invite-link">Invite link</label>
          <textarea id="invite-link" readonly rows="2">${escapeText(team.link)}</textarea>
          <button class="ob-btn" type="button" data-copy="invite-link" id="copy-invite-link">Copy link</button>
        </div>
      </div>` : "";
  const domainRow = domain ? `<label class="ob-toggle subtle" for="domain-join">
        <span class="ob-toggle-copy"><span class="ob-row-title">Anyone with an @${escapeText(domain)} email can join</span><span class="ob-row-meta">They join as Members.</span></span>
        <span class="switch"><input id="domain-join" name="domain_join" type="checkbox" role="switch"${team.domainOn ? " checked" : ""}></span>
      </label>
      <input type="hidden" name="domain_present" value="1">` : "";
  const empty = manage ? "Done" : "Finish";
  const label = count === 0 ? empty : count === 1 ? "Invite 1 person" : `Invite ${count} people`;
  return {
    title: manage ? "Invite people" : "Invite your team",
    sub: manage
      ? `Add people to ${escapeText(team.workspaceName || "this workspace")}.`
      : "Sederunt is better with everyone in the meeting. Add the people you meet with.",
    body: `<input type="hidden" name="action" value="invite">
      <div class="ob-add" id="invite-add-row">
        <label class="sr" for="invite-email">Email address</label>
        <input id="invite-email" name="emails" type="text" inputmode="email" placeholder="name@company.com" autocomplete="off" spellcheck="false" aria-describedby="invite-hint">
        <label class="sr" for="invite-role">Role</label>
        <select id="invite-role" name="roles" class="ob-select">${roleOptions("member")}</select>
        <button class="ob-dark" type="button" id="invite-add">Add</button>
      </div>
      <p class="ob-hint" id="invite-hint">Paste several addresses at once, separated by commas or spaces.</p>
      <p class="ob-field-error" id="invite-field-error" role="alert"${state.inviteError ? "" : " hidden"}>${escapeText(state.inviteError || "")}</p>
      <ul class="ob-people" id="invitee-list" aria-label="People to invite"${count ? "" : " hidden"}>${rows}</ul>
      <p class="ob-empty-line" id="invitee-empty"${count ? " hidden" : ""}>No one on the list yet.</p>
      ${link || domainRow ? `<div class="ob-extras" id="invite-extras">${link}${domainRow}</div>` : ""}
      <template id="invitee-template">${inviteeRow("", "member")}</template>`,
    left: manage
      ? `<a class="ob-link" href="/console/people" id="ob-skip">Back to People</a>`
      : `${backLink("/console/welcome?step=chat")}<button class="ob-link" type="submit" name="action" value="skip" id="ob-skip" formnovalidate>I'll do this later</button>`,
    right: `<button class="ob-primary" type="submit" id="invite-send" data-count="${count}" data-empty="${empty}">${label}</button>`,
  };
}

function sentStep(state, manage) {
  const sent = state.sent || {};
  const invites = Array.isArray(sent.invites) ? sent.invites : [];
  const list = invites.length ? `<ul class="ob-people sent" id="invite-links">${invites.map((row, index) => `<li class="ob-person">
          ${avatar(row.email)}
          <span class="ob-row-main"><span class="ob-row-title">${emailBreak(row.email)}</span><span class="ob-row-meta">${row.role === "admin" ? "Admin" : "Member"}</span></span>
          <label class="sr" for="invite-href-${index}">Invite link for ${escapeText(row.email)}</label>
          <input class="sr" id="invite-href-${index}" type="text" value="${escapeAttr(row.href)}" readonly>
          <button class="ob-btn" type="button" data-copy="invite-href-${index}">Copy link</button>
        </li>`).join("")}</ul>` : "";
  return {
    form: false,
    title: invites.length === 1 ? "1 invite ready" : `${invites.length} invites ready`,
    sub: "Sederunt doesn't email invites yet. Copy each link and send it to that person. Links work for 14 days.",
    body: list,
    left: manage ? `<a class="ob-link" href="/console/welcome?step=team&amp;mode=manage">Invite more</a>` : "",
    right: `<a class="ob-primary" href="${manage ? "/console/people" : "/console"}" id="ob-done">${manage ? "Done" : "Go to Home"}</a>`,
  };
}

// Lets a long address wrap after the @ rather than mid-word on a phone.
function emailBreak(email) {
  const text = String(email || "");
  const at = text.lastIndexOf("@");
  if (at < 1) return escapeText(text);
  return `${escapeText(text.slice(0, at + 1))}<wbr>${escapeText(text.slice(at + 1))}`;
}

function inviteeRow(email, role) {
  const value = escapeAttr(email);
  return `<li class="ob-person" data-email="${value}">
          ${avatar(email)}
          <span class="ob-person-email">${emailBreak(email)}</span>
          <input type="hidden" name="emails" value="${value}">
          <label class="ob-role"><span class="sr">Role for ${escapeText(email)}</span><select name="roles" class="ob-select ob-select-sm">${roleOptions(role)}</select></label>
          <button class="ob-x" type="button" data-remove aria-label="Remove ${escapeAttr(email)}">${xIcon()}</button>
        </li>`;
}

function roleOptions(role) {
  return `<option value="member"${role === "admin" ? "" : " selected"}>Member</option><option value="admin"${role === "admin" ? " selected" : ""}>Admin</option>`;
}

function avatar(text) {
  const clean = String(text || "").split("@")[0].replace(/[^A-Za-z0-9 ._-]/g, "");
  const parts = clean.split(/[ ._-]+/).filter(Boolean);
  const letters = ((parts[0] || "").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase() || "?";
  return `<span class="ob-avatar" aria-hidden="true">${escapeText(letters)}</span>`;
}

function tile(letter, color) {
  return `<span class="ob-tile" style="--tile:${color}" aria-hidden="true">${letter}</span>`;
}

function check() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function xIcon() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function linkIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

const WELCOME_SCRIPT = `
(function () {
  var slackConnect = document.getElementById("slack-connect");
  var slackStatus = document.getElementById("slack-status");
  var slackWait = "sederunt-slack-wait";
  if (slackConnect) {
    slackConnect.addEventListener("click", function () {
      try { sessionStorage.setItem(slackWait, "1"); } catch (error) {}
    });
  }
  var slackDone = slackStatus && slackStatus.textContent.indexOf("Connected") !== -1;
  if (slackDone) {
    try { sessionStorage.removeItem(slackWait); } catch (error) {}
  } else if (slackStatus) {
    try {
      if (sessionStorage.getItem(slackWait) === "1") {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") location.reload();
        });
      }
    } catch (error) {}
  }
  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = document.getElementById(button.getAttribute("data-copy"));
      var value = input ? input.value : "";
      var label = button.textContent;
      var done = function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = label; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(function () { if (input) { input.select(); } });
        return;
      }
      if (input) { input.select(); }
    });
  });
  var name = document.getElementById("workspace-name");
  if (name) {
    if (name.getAttribute("aria-invalid") === "true" || !name.value) name.focus();
  }
  var email = document.getElementById("invite-email");
  var list = document.getElementById("invitee-list");
  if (!email || !list) return;
  var role = document.getElementById("invite-role");
  var add = document.getElementById("invite-add");
  var empty = document.getElementById("invitee-empty");
  var error = document.getElementById("invite-field-error");
  var send = document.getElementById("invite-send");
  var template = document.getElementById("invitee-template");
  var EMAIL = /^[^\\s@,;]+@[^\\s@,;]+\\.[^\\s@,;]{2,}$/;
  email.removeAttribute("name");
  role.removeAttribute("name");
  function emails() {
    return Array.prototype.map.call(list.querySelectorAll(".ob-person"), function (row) { return row.getAttribute("data-email"); });
  }
  function paint() {
    var count = emails().length;
    list.hidden = count === 0;
    empty.hidden = count !== 0;
    send.textContent = count === 0 ? (send.getAttribute("data-empty") || "Finish") : count === 1 ? "Invite 1 person" : "Invite " + count + " people";
    send.setAttribute("data-count", String(count));
  }
  function initials(value) {
    var parts = value.split("@")[0].split(/[ ._-]+/).filter(Boolean);
    return (((parts[0] || "").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase()) || "?";
  }
  function row(value, roleValue) {
    var holder = document.createElement("ul");
    holder.innerHTML = template.innerHTML;
    var li = holder.firstElementChild;
    li.setAttribute("data-email", value);
    li.querySelector(".ob-avatar").textContent = initials(value);
    var cell = li.querySelector(".ob-person-email");
    var at = value.lastIndexOf("@");
    cell.textContent = at > 0 ? value.slice(0, at + 1) : value;
    if (at > 0) {
      cell.appendChild(document.createElement("wbr"));
      cell.appendChild(document.createTextNode(value.slice(at + 1)));
    }
    li.querySelector("input[type=hidden]").value = value;
    var select = li.querySelector("select");
    select.value = roleValue;
    select.parentNode.firstChild.textContent = "Role for " + value;
    li.querySelector("[data-remove]").setAttribute("aria-label", "Remove " + value);
    return li;
  }
  function say(message) {
    error.textContent = message;
    error.hidden = !message;
    email.setAttribute("aria-invalid", message ? "true" : "false");
  }
  function addAll() {
    var raw = email.value.split(/[,;\\s]+/).map(function (part) { return part.trim().toLowerCase(); }).filter(Boolean);
    if (!raw.length) { say("Enter an email address."); email.focus(); return false; }
    var have = emails();
    var bad = [];
    var dupes = 0;
    raw.forEach(function (value) {
      if (!EMAIL.test(value)) { bad.push(value); return; }
      if (have.indexOf(value) !== -1) { dupes += 1; return; }
      if (have.length >= 50) { bad.push(value); return; }
      have.push(value);
      list.appendChild(row(value, role.value));
    });
    email.value = bad.join(", ");
    if (bad.length) say(bad.length === 1 ? bad[0] + " doesn't look like an email address." : bad.length + " addresses don't look right: " + bad.join(", "));
    else if (dupes) say(dupes === 1 ? "That person is already on the list." : dupes + " were already on the list.");
    else say("");
    paint();
    email.focus();
    return true;
  }
  add.addEventListener("click", addAll);
  email.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); addAll(); }
  });
  email.addEventListener("paste", function () {
    setTimeout(function () { if (/[,;\\s]/.test(email.value.trim())) addAll(); }, 0);
  });
  email.addEventListener("input", function () { if (!error.hidden) say(""); });
  list.addEventListener("click", function (event) {
    var button = event.target.closest("[data-remove]");
    if (!button) return;
    var li = button.closest(".ob-person");
    var next = li.nextElementSibling || li.previousElementSibling;
    li.remove();
    paint();
    (next ? next.querySelector("[data-remove]") : email).focus();
  });
  send.addEventListener("click", function (event) {
    if (email.value.trim()) {
      event.preventDefault();
      if (addAll() && error.hidden) send.form.requestSubmit(send);
    }
  });
  paint();
})();
`;

/**
 * A short HTML page for a switcher error. Never a raw JSON body.
 *
 * @param {string} title
 * @param {string} message
 */
export function renderFlowMessage(title, message) {
  return simplePage(title, `<h1 id="ob-title">${escapeText(title)}</h1>
      <p class="ob-alert" role="alert">${escapeText(message)}</p>`, `<a class="ob-primary" href="/console">Back to Home</a>`);
}

/**
 * @param {{ error?: string, join?: boolean }} [state]
 */
export function renderInvitePage(state = {}) {
  const error = state.error ? `<p class="ob-alert" id="invite-error" role="alert">${escapeText(state.error)}</p>` : "";
  return simplePage(state.join ? "Join workspace" : "Accept invite", `<h1 id="ob-title">${state.join ? "Join workspace" : "Accept invite"}</h1>
      <p class="ob-sub">${state.join ? "You were sent a link to a Sederunt workspace. You'll join as a Member." : "Join this workspace with the email on your account."}</p>
      ${error}`, `<form method="post"><button class="ob-primary" type="submit" id="accept-invite">${state.join ? "Join workspace" : "Accept invite"}</button></form>`, `<a class="ob-link" href="/console">Back to Home</a>`);
}

function simplePage(title, body, right, left = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)} · Sederunt</title>
${FAVICON_LINK}
<link rel="stylesheet" href="/console.css">
</head>
<body class="welcome-page ob-page">
<main class="ob">
  <section class="ob-card" aria-labelledby="ob-title">
    <div class="ob-top"><span class="ob-brand">${sederuntMark({ size: 24 })}<span class="brand-word">Sederunt</span></span></div>
    <div class="ob-body">
      ${body}
    </div>
    <div class="ob-foot"><div class="ob-foot-left">${left}</div><div class="ob-foot-right">${right}</div></div>
  </section>
</main>
</body>
</html>`;
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
