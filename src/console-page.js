import { priorAsksForThread } from "./ask/thread.js";
import { normalizeHearing } from "./hearing.js";
import { brandLogo, brandSprite } from "./brand-logos.js";
import { formatLastTested } from "./console/local-time.js";
import { renderBotSettings } from "./console/bot-settings.js";
import { renderPeopleMatching } from "./console/people-matching.js";
import { sederuntMark, FAVICON_LINK } from "./sederunt-mark.js";

export { rankDecisions } from "./room-match.js";

/** Header cells, one per row cell, including the empty action column. */
export const ROOM_COLUMNS = ["Room", "Platform", "Speakers", "Status", "Started", ""];
export const PEOPLE_COLUMNS = ["Name", "Rooms", "Decisions", "Last heard", ""];
export const DECISION_COLUMNS = ["Decision", "Room", "Status", ""];

/**
 * The operator workspace. Onboard, home, rooms, history, chat, and record
 * read the process. The page has no key field.
 * The chip switches Company and Personal. Personal has no room.
 * An OAuth sign-in lists that person's spaces instead, and can add a team or company.
 * The served console uses the Recall shell: one workspace switcher
 * sits at the top of the sidebar, and the breadcrumb sits over the content column.
 * The account block sits at the bottom of the rail. Its name is the session
 * label, or the process member when sign-in is not configured.
 * The room file pins the decision. Each setting is a row, label then control.
 *
 * @param {{ meeting?: boolean, meetingSetup?: string, slackReady?: boolean, signedIn?: boolean, accountName?: string, accountMember?: string, accountLine?: string, spaces?: object | null, accountProfile?: object | null, toolAsk?: object | null }} [state]
 */
export function renderConsolePage(state = {}) {
  const askDaily = Number.isInteger(state.askLimit) && state.askLimit >= 0 ? state.askLimit : 5;
  const calendarConnected = state.calendarConnected === true;
  const linearConnected = state.linearConnected === true;
  const slackConnected = state.slackConnected === true;
  const hearingIn = state.hearing && typeof state.hearing === "object" ? state.hearing : null;
  // Effective guest (saved or default), never blank fields that look unset.
  const hearing = normalizeHearing(hearingIn);
  const signedIn = state.signedIn === true;
  const accountMember = String(state.accountMember || "").trim();
  const givenName = String(state.accountName || "").trim();
  const known = Boolean(givenName || accountMember);
  const accountName = givenName || accountMember || "Account";
  const accountLine = state.accountLine || (signedIn ? "Owner" : "Sign-in is not set up");
  const safeName = escapeHtml(accountName);
  const safeMember = escapeHtml(accountMember);
  const safeLine = escapeHtml(accountLine);
  const meet = state.meeting
    ? ""
    : `<p id="meet-block"><span>No meeting is in use.</span><span class="sr">Meet is not ready.</span><span hidden>${state.meetingSetup || "Set SEDERUNT_PUBLIC_ORIGIN to a public https address, then restart."}</span></p>`;
  const slack = state.slackReady
    ? ""
    : `<p id="slack-block"><span>No channel is in use.</span><span class="sr">The channel door is not set up.</span><span hidden>Set SLACK_SIGNING_SECRET, then restart.</span></p>`;
  const joinReadyCopy = state.meeting ? "Meet is ready." : "Meeting join is unavailable from this page.";
  const joinReadyClass = state.meeting ? "" : " off";
  const joinDisabled = state.meeting ? "" : " disabled";
  const glyph = (paths) =>
    `<span class="ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
  const closeIcon = glyph('<path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"/>');
  const homeIcon = glyph('<path d="M2.8 7.1 8 3l5.2 4.1V13H2.8V7.1Z"/>');
  const roomsIcon = glyph('<path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/>');
  const historyIcon = glyph('<circle cx="8" cy="8" r="4.6"/><path d="M8 5.6V8l1.7 1.1"/>');
  const chatIcon = glyph('<path d="M2.6 3.4h10.8v6.4H6.2L2.6 12.6V3.4Z"/>');
  const filesIcon = glyph('<path d="M4 2.6h5.2L12.2 5.6V13H4z"/><path d="M9.1 2.7V5.7H12.2"/>');
  const recordIcon = glyph('<path d="M4 2.8h5.2L12 5.6V13H4z"/><path d="M9.1 2.9V5.7H12"/><path d="M6 8.2h4M6 10.4h2.6"/>');
  const peopleIcon = glyph('<circle cx="6" cy="5.6" r="1.7"/><path d="M3.1 12c.5-1.7 1.7-2.5 2.9-2.5s2.4.8 2.9 2.5"/><circle cx="11.2" cy="6.1" r="1.25"/><path d="M10.2 12c.3-1 .9-1.6 1.6-1.6"/>');
  const plusIcon = glyph('<path d="M8 3.2v9.6M3.2 8h9.6"/>');
  const switchIcon = glyph('<path d="M5 6.1 8 3.5 11 6.1"/><path d="M5 9.9 8 12.5 11 9.9"/>');
  const userIcon = glyph('<circle cx="8" cy="5.4" r="2.1"/><path d="M3.3 13.1c.55-2.1 2.35-3.2 4.7-3.2s4.15 1.1 4.7 3.2"/>');
  const panelIcon = glyph('<rect x="2.6" y="3" width="10.8" height="10" rx="1.4"/><path d="M6.4 3v10"/>');
  const plugIcon = glyph('<path d="M6 2.6v3M10 2.6v3M4.2 5.6h7.6v2.4a3.8 3.8 0 0 1-7.6 0V5.6Z"/><path d="M8 11.8V14"/>');
  const calendarIcon = brandLogo("google-calendar");
  const formsIcon = brandLogo("google-forms");
  const linearIcon = brandLogo("linear-icon");
  const channelIcon = brandLogo("slack-icon");
  const searchIcon = glyph('<circle cx="7" cy="7" r="3.2"/><path d="M9.4 9.4 12.5 12.5"/>');
  const editIcon = glyph('<path d="M9.6 2.7 13.3 6.4 6.4 13.3H2.7V9.6z"/>');
  const outIcon = glyph('<path d="M6.2 2.8H3.4v10.4h2.8"/><path d="M6.6 8h6.2"/><path d="M10.6 5.4 13.2 8l-2.6 2.6"/>');
  const accountMenu = signedIn
    ? `<button type="button" class="menu-item" role="menuitem" id="edit-profile">${editIcon}Edit profile</button><div class="menu-rule" role="separator"></div><form id="sign-out-form" method="post" action="/console/sign-out"><button id="sign-out" class="menu-item danger" type="submit" role="menuitem">${outIcon}Sign out</button></form>`
    : `<p class="account-note" role="note">Sign-in is not set up.</p>`;
  const signInOff = state.signInOff === true;
  const signInBanner = signInOff
    ? `<div class="sign-in-off" role="status"><p>Sign-in is off. Anyone with this link can act as you. <a href="/console/setup#console-secret" id="set-console-secret">Set a console secret</a></p></div>`
    : "";
  const secretCard = signInOff
    ? `<div class="settings-card" id="console-secret"><p class="section-label">Console sign-in</p><p class="card-help">Sign-in is off. Anyone with this link can act as you. Set SEDERUNT_CONSOLE_SECRET outside this page, then restart. This page never shows the secret.</p></div>`
    : "";
  const switcher = renderWorkspaceSwitcher(state.spaces, switchIcon);
  const canInvite = state.spaces?.oauth === true && (state.spaces.activeRole === "owner" || state.spaces.activeRole === "admin");
  const inviteHref = "/console/welcome?step=team&amp;mode=manage";
  const peopleInvite = canInvite ? `<a class="secondary" href="${inviteHref}" id="people-invite">${glyph('<path d="M8 3.2v9.6M3.2 8h9.6"/>')}Invite people</a>` : "";
  const membersCard = canInvite
    ? `<div class="settings-card" id="members-card"><p class="section-label">Members</p><p class="card-help">Invite people by email, copy the workspace invite link, or let anyone with your company email join.</p><div class="wait-actions"><a class="secondary" href="${inviteHref}" id="setup-invite">Invite people</a></div></div>`
    : "";
  const spaceDialog = state.spaces?.oauth ? renderSpaceDialog(closeIcon) : "";
  const profile = state.accountProfile?.oauth ? state.accountProfile : null;
  const asks = state.toolAsk?.oauth === true;
  const calendarAsk = asks ? toolNeedCard("calendar", "Connect Calendar to add Sederunt to a meeting.") : "";
  const toolsAllOn = state.toolAsk?.connected?.calendar === true && state.toolAsk?.connected?.slack === true;
  const slackAsk = asks ? toolNeedCard("slack", "Connect Slack to use a channel.", true) : "";
  const linearAsk = asks ? toolNeedCard("linear", "Connect Linear to file a ticket.") : "";
  const fileTicket = asks ? `<button type="button" id="file-ticket">File a ticket</button>` : "";
  const heroAvatar = profile?.avatar
    ? `<img src="${escapeHtml(profile.avatar)}" alt="">`
    : escapeHtml(accountInitials(profile?.name || accountName));
  const heroName = profile?.name ? escapeHtml(profile.name) : "";
  const heroRole = profile ? escapeHtml(profile.spaceRole || profile.providerLabel || "") : "";
  const detailName = profile?.name ? escapeHtml(profile.name) : "";
  const workspaceDetail = profile ? escapeHtml(profile.spaceName || "Personal") : "Company";
  const profileRows = profile
    ? `${profile.email ? `<dt>Email</dt><dd id="account-detail-email">${escapeHtml(profile.email)}</dd>` : ""}
            <dt>Sign-in</dt><dd id="account-detail-provider">${escapeHtml(profile.providerLabel || "Signed in")}</dd>
            ${profile.spaceRole ? `<dt>Role</dt><dd id="account-detail-role">${escapeHtml(profile.spaceRole)}</dd>` : ""}`
    : "";
  const peopleMatching = renderPeopleMatching({
    matches: Array.isArray(state.peopleMatches) ? state.peopleMatches : [],
    canOverride: state.canAdmin === true,
  });
  const botCard = renderBotSettings(state.bot || {});
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
${FAVICON_LINK}
<link rel="stylesheet" href="/console.css">
</head>
<body class="is-reading"${state.calendarTimeZone ? ` data-calendar-zone="${escapeHtml(state.calendarTimeZone)}"` : ""}>
<a class="skip-link" href="#main">Skip to content</a>
${brandSprite()}
<div class="nav-scrim" id="nav-scrim"></div>
<div id="rail-tip" class="rail-tip" hidden></div>
<div class="shell">
  <div class="rail-wrap">
    <div class="rail-head">
      <div class="brand-row">
      <p class="brand">${sederuntMark({ size: 28 })}<span class="brand-word">Sederunt</span></p>
      <button id="rail-close" class="close rail-close" type="button" aria-label="Close the menu">${closeIcon}</button>
      <div id="chip-wrap" class="chip-wrap">
        ${switcher}
      </div>
      <button id="goto" class="goto" type="button">Go to<span class="kbd" id="goto-kbd">Ctrl K</span></button>
      </div>
    </div>
    <div class="rail-scroll">
    <button id="rail-prev" class="rail-nudge" type="button" hidden aria-label="Show earlier sections"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg></button>
    <nav class="rail" aria-label="Workspace">
      <p class="rail-label">Work</p>
      <a href="/console" data-show="home" data-label="Home">${homeIcon}Home</a>
      <a href="/console/rooms" data-show="rooms" data-label="Rooms">${roomsIcon}Rooms</a>
      <a href="/console/history" data-show="history" data-label="History">${historyIcon}History</a>
      <a href="/console/decisions" data-show="record" data-label="Decisions">${recordIcon}Decisions</a>
      <a href="/console/chat" data-show="chat" data-label="Ask AI">${chatIcon}Ask AI</a>
      <a href="/console/files" data-show="files" data-label="Files">${filesIcon}Files</a>
      <p class="rail-label">Setup</p>
      <a href="/console/setup" id="show-connectors" data-label="Setup">${plugIcon}Setup</a>
      <a href="/console/connectors" id="show-mcp" data-show="mcp" data-label="Connectors">${plugIcon}Connectors</a>
      <p class="rail-label">Account</p>
      <a href="/console/account" data-show="account" data-label="Account">${userIcon}Account</a>
      <a href="/console/people" data-show="people" data-label="People">${peopleIcon}People</a>
    </nav>
    <button id="rail-next" class="rail-nudge" type="button" hidden aria-label="Show later sections"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
    </div>
    <div class="rail-foot">
      <p id="name-cue" hidden>Sign-in is not set up.</p>
      <div id="name-row" class="account-wrap">
        <button id="account" class="account" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" data-known="${known ? "true" : "false"}" data-name="${safeName}" data-member="${safeMember}">
          <span id="account-avatar" class="account-avatar" aria-hidden="true">${escapeHtml(accountInitials(accountName))}</span>
          <span class="account-copy">
            <span id="account-name">${safeName}</span>
            <span id="account-line">${safeLine}</span>
          </span>
          <span class="account-chevron" aria-hidden="true">${switchIcon}</span>
        </button>
        <div id="account-menu" class="account-menu" role="menu" hidden>
          ${accountMenu}
        </div>
      </div>
    </div>
  </div>
  <div class="stage" id="main" tabindex="-1">
    ${signInBanner}
    <div class="topbar">
      <button id="rail-toggle" class="panel-btn" type="button" aria-pressed="false" aria-label="Hide the sidebar">${panelIcon}</button>
      <span class="topbar-rule" aria-hidden="true"></span>
      <nav class="crumb" aria-label="Breadcrumb">
        <a id="crumb-home" class="crumb-link" href="/console">Home</a>
        <span id="crumb-sep" class="crumb-sep" aria-hidden="true">›</span>
        <a id="crumb-rooms" class="crumb-link" href="/console/rooms" hidden>Rooms</a>
        <span id="crumb-sep2" class="crumb-sep" hidden aria-hidden="true">›</span>
        <span id="crumb-current" aria-current="page">Home</span>
      </nav>
      <span id="top-name" class="top-name"></span>
    </div>
    <h1 id="view-title" class="sr">Home</h1>
    <p id="status-title" class="page-title" hidden>Setup</p>
    <div class="notices">
      <p id="setup-label" class="setup-label">Rooms</p>
      <button id="setup-toggle" class="setup-toggle" type="button" aria-expanded="false" hidden>Setup is unfinished</button>
      <p id="meet-kicker" class="setup-label" hidden>Meeting</p>
${meet}
      <p id="channel-kicker" class="setup-label" hidden>Channel</p>
${slack}
    </div>
    <section id="onboard">
      <div class="empty">
        <span class="empty-mark" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6.2A1.2 1.2 0 0 1 5.2 5h7.1A1.2 1.2 0 0 1 13.5 6.2V21"/><path d="M13.5 10.2h4.3A1.2 1.2 0 0 1 19 11.4V21"/><path d="M3 21h18"/><path d="M7.2 8.4h2.6M7.2 12h2.6M7.2 15.6h2.6"/></svg></span>
        <h2 class="sr">Onboard</h2>
        <h2 id="onboard-heading">Reading the account.</h2>
        <div id="onboard-skeleton" class="skeletons" hidden>
          <span class="sk sk-h"></span>
          <span class="sk sk-l"></span>
          <span class="sk sk-b"></span>
        </div>
        <p id="onboard-reading">Reading the account.</p>
        <p id="onboard-missing" hidden>The company account is not loaded. Add the delegate outside this page, then restart.</p>
        <p id="onboard-ready" hidden>A room appears when a meeting or a channel is in use.</p>
        <p id="onboard-next" hidden>Meeting and Channel were not turned on when Sederunt started.</p>
        <button id="open-connectors" type="button" hidden>Go to Setup</button>
        <button id="continue" type="button" hidden>Go to Home</button>
        <div id="onboard-doors"></div>
      </div>
    </section>
    <div id="home" hidden>
      <div class="main">
    <div id="read-error" class="state-error empty-state" hidden>
      <p id="read-error-copy" class="empty-title">Home could not be loaded.</p>
      <button id="read-again" type="button">Try again</button>
    </div>
    <div class="page-head" id="home-head">
    <div>
    <p id="home-title" class="page-title">Home</p>
    <p class="page-lede">Meetings, decisions, and follow-ups for this workspace.</p>
    </div>
    <div class="page-actions">
      <button type="button" class="secondary" id="home-add-to-meeting">Add to a meeting</button>
    </div>
    </div>
    <div class="home-tools">
    ${renderChecklist(state.checklist, closeIcon)}
    <div id="home-empty" class="home-empty" hidden>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span>
      <p id="home-empty-line">Your meetings will show up here</p>
      <p id="home-empty-aside" class="empty-aside">Add Sederunt to your next meeting. It keeps the decisions and follow-ups, and lists them here.</p>
      <div class="empty-actions">
        <button type="button" class="primary" id="home-add-meeting">Add Sederunt to a meeting</button>
        <a class="secondary" href="/console/setup" id="home-connect-tools"${toolsAllOn ? " hidden" : ""}>Connect tools</a>
      </div>
    </div>
    ${calendarAsk}
    <div id="home-stats">
      <div id="counts" class="counts"></div>
    </div>
    <section id="needs-attention" class="needs-attention" hidden>
      <h2 class="section-label">Needs attention</h2>
      <div id="attention-list" class="attention-list"></div>
    </section>
    <div class="rooms-bar" hidden>
      <button id="new-room" class="primary" type="button">${plusIcon}<span class="room-label">New room</span></button>
    </div>
    </div>
    <p id="status"></p>
    <div id="loading" class="skeletons table-skel" aria-busy="true" hidden>
      <p id="loading-label">Reading the account.</p>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sr">Reading the account.</span>
      <span class="sk sk-row"></span>
      <span class="sk sk-row"></span>
      <span class="sk sk-row"></span>
      <span class="sk sk-row"></span>
    </div>
    <div id="overview" hidden>
      <div class="page-head"><div><p class="page-title">Setup</p><p class="page-lede">Which tools Sederunt can use, and how the meeting guest listens.</p></div><div class="page-actions"></div></div>
      ${secretCard}
      ${membersCard}
      <p id="connector-split"></p>
      <div class="settings-card" id="meeting-card"${state.meeting ? " hidden" : ""}>
        <p class="section-label">Meeting</p>
        <p id="meeting-card-copy" class="card-help">${state.meeting ? "A meeting is in use." : "No meeting is in use."}</p>
      </div>
      <div class="settings-card" id="tools-card">
      <p class="section-label">Tools</p>
      <p class="card-help">Connect a tool to let Sederunt act in it.</p>
      <p id="ask-help" class="sr">On means a change runs as soon as it is asked.</p>
      <div class="connectors">
        <div class="explorer-head status-head">
          <span data-col="mark"></span>
          <span data-col="tool">Tool</span>
          <span data-col="action"></span>
        </div>
        <div class="conn" id="cal-status-row">
          ${calendarIcon}
          <div class="set-copy" data-col="tool">
            <strong>Calendar</strong>
            <p id="cal-conn" class="conn-state${calendarConnected ? "" : " off"}">${calendarConnected ? "Connected" : "Not connected"}</p>
            <p id="cal-line" class="sr">Calendar runs automatically.</p>
          </div>
          <div class="conn-actions" data-col="action">
            <button type="button" class="conn-connect" id="cal-connect" data-connect="calendar"${calendarConnected ? " hidden" : ""}>Connect</button>
            <button type="button" class="secondary conn-manage" id="cal-manage" data-connect="calendar"${calendarConnected ? "" : " hidden"}>Manage</button>
          </div>
        </div>
        <div class="tool-ask${calendarConnected ? "" : " ask-quiet"}" id="cal-ask-row">
          <div class="set-copy" data-col="tool"><span class="ask-name">Run automatically</span><span class="ask-tool"> for Calendar</span></div>
          <div class="conn-ask" data-col="action"><label class="switch"><input id="cal-ask" type="checkbox" checked aria-label="Run automatically for Calendar" aria-describedby="ask-help"></label></div>
        </div>
        <div class="conn" id="lin-status-row">
          ${linearIcon}
          <div class="set-copy" data-col="tool">
            <strong>Linear</strong>
            <p id="lin-conn" class="conn-state${linearConnected ? "" : " off"}">${linearConnected ? "Connected" : "Not connected"}</p>
            <p id="lin-line" class="sr">Linear runs automatically.</p>
          </div>
          <div class="conn-actions" data-col="action">
            <button type="button" class="conn-connect" id="lin-connect" data-connect="linear"${linearConnected ? " hidden" : ""}>Connect</button>
            <button type="button" class="secondary conn-manage" id="lin-manage" data-connect="linear"${linearConnected ? "" : " hidden"}>Manage</button>
          </div>
        </div>
        <div class="tool-ask${linearConnected ? "" : " ask-quiet"}" id="lin-ask-row">
          <div class="set-copy" data-col="tool"><span class="ask-name">Run automatically</span><span class="ask-tool"> for Linear</span></div>
          <div class="conn-ask" data-col="action"><label class="switch"><input id="lin-ask" type="checkbox" checked aria-label="Run automatically for Linear" aria-describedby="ask-help"></label></div>
        </div>
        <div class="conn" id="slack-status-row">
          ${channelIcon}
          <div class="set-copy" data-col="tool">
            <strong>Slack</strong>
            <p id="slack-conn" class="conn-state${slackConnected ? "" : " off"}">${slackConnected ? "Connected" : "Not connected"}</p>
            <p id="slack-line" class="conn-hint">Slack runs automatically.</p>
            <p id="slack-note" class="sr">Sederunt answers in a channel it has already joined.</p>
          </div>
          <div class="conn-actions" data-col="action">
            <button type="button" class="conn-connect" id="slack-connect" data-connect="slack"${slackConnected ? " hidden" : ""}>Connect</button>
            <button type="button" class="secondary conn-manage" id="slack-manage" data-connect="slack"${slackConnected ? "" : " hidden"}>Manage</button>
          </div>
        </div>
        <div class="tool-ask${slackConnected ? "" : " ask-quiet"}" id="slack-ask-row">
          <div class="set-copy" data-col="tool"><span class="ask-name">Run automatically</span><span class="ask-tool"> for Slack</span></div>
          <div class="conn-ask" data-col="action"><label class="switch"><input id="slack-ask" type="checkbox" checked aria-label="Run automatically for Slack" aria-describedby="ask-help"></label></div>
        </div>
      </div>
      </div>
      <div class="settings-card" id="hearing-block">
        <p class="section-label">Meeting guest</p>
        <p id="hearing-help">The guest uses this name in the meeting. A line is kept when someone says the name, or one of the trigger words or sentences.</p>
        <div class="hearing-grid">
        <div class="hearing-field">
          <label for="hearing-name">Name</label>
          <p>Shown on the guest's camera.</p>
          <input id="hearing-name" name="hearing-name" maxlength="40" value="${escapeHtml(hearing.name)}" placeholder="Maple" autocomplete="off">
        </div>
        <div class="hearing-field">
          <label for="hearing-triggers">Triggers</label>
          <p>One word or sentence on each line.</p>
          <textarea id="hearing-triggers" name="hearing-triggers" rows="4" placeholder="keep this">${escapeHtml(hearing.triggers.join("\n"))}</textarea>
        </div>
        </div>
        <p class="section-next"><button id="hearing-save" class="primary" type="button">Save the guest</button></p>
        <p id="hearing-note"></p>
      </div>
      <p id="connector-who"></p>
      <p id="custom-how" class="sr">A tool other than Calendar, Linear, or Slack cannot be connected from this page.</p>
      <p id="prefs" class="sr">Calendar is on Ask. Linear is on Ask.</p>
    </div>
    <section id="mcp-page" hidden>
      <div class="page-head" id="mcp-head">
        <div>
          <p class="page-title">Connectors</p>
          <p class="page-lede">Tools this workspace can use.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="primary" id="mcp-add-head" hidden>Add a connector</button>
        </div>
      </div>
      <div id="mcp-empty" class="empty-state">
        <p class="empty-title">No connectors yet.</p>
        <p>Add an MCP server to use its tools in this space. New tools stay off until you enable them.</p>
        <button type="button" class="primary" id="mcp-add">Add a connector</button>
      </div>
      <div id="mcp-presets" hidden>
        <p class="section-label">Presets</p>
        <div class="preset-row">
          <button type="button" class="preset-card" data-preset="google-forms" data-state="add">
            <span class="preset-head">${formsIcon}<span class="preset-name">Google Forms</span></span>
            <span class="preset-detail">Uses your Google account.</span>
            <span class="preset-action" data-preset-badge>Add</span>
          </button>
          <button type="button" class="preset-card" data-preset="google-calendar" data-state="add">
            <span class="preset-head">${calendarIcon}<span class="preset-name">Google Calendar</span></span>
            <span class="preset-detail">Uses your Google account.</span>
            <span class="preset-action" data-preset-badge>Add</span>
          </button>
        </div>
      </div>
      <div id="mcp-list" class="mcp-list"></div>
    </section>
    <section id="rooms">
      <div class="page-head" id="rooms-head" hidden>
        <div>
          <p class="page-title">Rooms</p>
          <p class="page-lede">Meetings and channels this workspace has heard.</p>
        </div>
        <div class="page-actions"></div>
      </div>
      <div class="toolbar" id="room-toolbar" hidden>
        <div class="chips" role="group" aria-label="Filter rooms">
          <button type="button" class="chip-filter" data-room-filter="all" aria-pressed="true">All</button>
          <button type="button" class="chip-filter" data-room-filter="kept">Kept a decision</button>
        </div>
        <label class="search">${searchIcon}<span class="sr">Search rooms</span><input id="room-search" type="search" placeholder="Search" autocomplete="off"></label>
      </div>
      <section id="meeting-rows" class="meeting-rows" hidden>
        <div class="meeting-head">
          <h2 class="section-label" id="meeting-heading">Meetings</h2>
          <a class="meetings-more" id="meetings-more" href="/console/rooms" hidden>All meetings</a>
        </div>
        <div id="meeting-list" class="meeting-list"></div>
      </section>
      <div class="explorer">
        <div class="explorer-head">
          ${ROOM_COLUMNS.map((label, index) => `<span data-col="${["room", "platform", "speakers", "status", "started", "action"][index]}">${escapeHtml(label)}</span>`).join("")}
        </div>
        <div id="room-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span><p class="empty-title" id="room-empty-line">No rooms yet.</p><p id="room-empty-aside">Bring Sederunt into a meeting or a channel.</p><button type="button" id="clear-filters" hidden>Clear filters</button></div>
        <div id="room-list"></div>
        <div id="room-foot" class="explorer-foot" hidden><span id="room-count"></span><span class="pager"><button id="room-prev" type="button" aria-label="Previous page">‹</button><button id="room-next" type="button" aria-label="Next page">›</button></span></div>
      </div>
      <div id="personal-notes" hidden>
        <p id="personal-empty">Private notes stay in this workspace. They are never shared as rooms.</p>
        <div id="personal-list"></div>
      </div>
    </section>
    <section id="history" hidden>
      <div class="page-head"><div><p class="page-title">History</p><p class="page-lede">Requests, changes and failures across rooms.</p></div></div>
        <div class="history-tools page-toolbar">
        <label class="search">${searchIcon}<span class="sr">Search history</span><input id="history-search" type="search" placeholder="Search" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Whose record">
          <button type="button" class="chip-filter" data-scope="group" aria-pressed="true">Company</button>
          <button type="button" class="chip-filter" data-scope="you" aria-pressed="false">You</button>
        </div>
        <span class="chip-rule" aria-hidden="true"></span>
        <div class="chips" role="group" aria-label="Kind of record">
          <button type="button" class="chip-filter" data-kind="all" aria-pressed="true">All</button>
          <button type="button" class="chip-filter" data-kind="request">Requests</button>
          <button type="button" class="chip-filter" data-kind="action">Actions</button>
          <button type="button" class="chip-filter" data-kind="failure">Failed</button>
        </div>
        <label class="room-filter"><span class="sr">Filter by room</span><select id="history-room"><option value="">All rooms</option></select></label>
      </div>
      <div id="history-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4.6"/><path d="M8 5.6V8l1.7 1.1"/></svg></span><p class="empty-title" id="history-line">No history yet.</p><p>Questions and decisions from a room show up here.</p></div>
      <p class="section-next"><button id="history-next" class="primary" type="button" hidden>New room</button></p>
      <div class="explorer" id="history-table">
        <div id="history-list"></div>
        <div id="history-foot" class="explorer-foot" hidden><span id="history-count"></span><span class="pager"><button id="history-prev" type="button" aria-label="Previous page">‹</button><button id="history-next-page" type="button" aria-label="Next page">›</button></span></div>
      </div>
    </section>
    <section id="chat" hidden>
      <div class="page-head"><div><p class="page-title">Ask AI</p><p class="page-lede">Ask about a meeting or a decision this workspace kept.</p></div></div>
      <div class="talk-panel ai-chat">
        <div class="thread" id="chat-log" role="log" aria-live="polite" aria-relevant="additions">
          <div id="chat-empty" class="chat-hello">
            <p class="empty-title">Ask Sederunt</p>
            <p class="chat-hello-copy">Answers come from what this workspace kept.</p>
            <div class="suggests" id="chat-suggests"></div>
          </div>
          <p id="chat-purpose" hidden></p>
        </div>
        <p id="chat-next-row" class="section-next"><button id="chat-next" class="primary" type="button" hidden>New room</button></p>
        <form id="chat-form" class="composer">
          <p class="ask-out" id="ask-out" role="status" hidden><strong>No questions left today.</strong> <span id="ask-out-copy">You've used all ${askDaily}. They come back at midnight.</span></p>
          <div class="composer-box">
            <label><span class="sr">Ask the workspace</span><textarea id="chat-text" name="chat" rows="1" placeholder="Ask about a meeting or decision"></textarea></label>
            <button id="ask-send" class="primary" type="button" aria-label="Send">Send</button>
          </div>
          <div class="composer-foot">
            <span id="ask-quota" class="ask-quota ask-quota-pending" role="status">${askDaily} questions a day</span>
            <p class="composer-hint" id="chat-hint">Enter sends. Shift+Enter adds a line.</p>
          </div>
        </form>
      </div>
    </section>
    <section id="record" hidden>
      <div class="page-head"><div><p class="page-title">Decisions</p><p class="page-lede">Sentences a room kept, with who kept each one and when.</p></div><div class="page-actions"></div></div>
      <div class="toolbar page-toolbar" id="record-toolbar">
        <label class="search">${searchIcon}<span class="sr">Search decisions</span><input id="record-search" type="search" placeholder="Search" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filter decisions">
          <button type="button" class="chip-filter" data-decision-filter="all" aria-pressed="true">All</button>
          <button type="button" class="chip-filter" data-decision-filter="current">Current</button>
          <button type="button" class="chip-filter" data-decision-filter="clashing">Clashing</button>
        </div>
      </div>
      <div class="empty-state" id="record-empty"><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.8h10v10.4H3z"/><path d="M5 6h6M5 8.4h6M5 10.8h3.5"/></svg></span><p class="empty-title ledger">No decision yet.</p><p>A sentence kept in a room shows up here.</p></div>
      <p class="section-next"><button id="record-next" class="primary" type="button" hidden>New room</button></p>
      <div class="record-board explorer" id="record-table">
        <div class="explorer-head decision-head">${DECISION_COLUMNS.map((label, index) => `<span data-col="${["sentence", "room", "status", "action"][index]}">${escapeHtml(label)}</span>`).join("")}</div>
        <div id="record-list"></div>
        <div id="record-foot" class="explorer-foot" hidden><span id="record-count"></span><span class="pager"><button id="record-prev" type="button" aria-label="Previous page">‹</button><button id="record-next-page" type="button" aria-label="Next page">›</button></span></div>
        <p id="record-detail" hidden></p>
      </div>
    </section>
    <section id="account-page" hidden>
      <div class="page-head"><div><p class="page-title">Account</p><p class="page-lede">The person signed in to this workspace.</p></div></div>
      <div class="account-layout">
        <div class="overview-card account-hero" id="account-card">
          <span id="account-page-avatar" class="account-avatar lg" aria-hidden="true">${heroAvatar}</span>
          <div class="account-identity">
            <p id="account-page-name" class="empty-title">${heroName}</p>
            <p id="account-page-role" class="meta">${heroRole}</p>
          </div>
          ${signedIn ? `<button type="button" class="secondary" id="account-edit">Edit profile</button>` : ""}
        </div>
        <div class="settings-card">
          <p class="section-label">Details</p>
          <dl class="kv account-kv">
            <dt class="account-name-row">Name</dt><dd id="account-detail-name" class="account-name-row">${detailName}</dd>
            ${profileRows}
            <dt>Workspace</dt><dd id="account-detail-workspace">${workspaceDetail}</dd>
            <dt id="account-session-label">${state.accountExpiry ? "Signed in until" : "Session"}</dt><dd id="account-detail-expiry"${state.accountExpiry ? ` data-at="${escapeHtml(new Date(state.accountExpiry).toISOString())}" data-kind="expiry"` : ""}>${escapeHtml(signedIn ? "This sign-in does not list an expiry." : "Sign-in is not set up.")}</dd>
          </dl>
        </div>
        <div class="settings-card">
          <p class="section-label">Sessions</p>
          <p class="card-help">This browser keeps one sign-in for the workspace.</p>
          <div class="wait-actions">
            ${signedIn ? `<button type="button" class="danger" id="account-signout">Sign out</button>` : `<p class="meta">Sign-in is not set up.</p>`}
          </div>
        </div>
        ${botCard}
        ${peopleMatching}
      </div>
    </section>
    <section id="page-missing" class="empty-state" hidden>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13 13"/></svg></span>
      <p class="empty-title">Page not found</p>
      <p>That page is not in this workspace.</p>
      <a class="secondary" href="/console"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>Back to Home</a>
    </section>
    <section id="files" hidden>
      <div class="page-head" id="files-head"><div><p class="page-title">Files</p><p class="page-lede"><span>Files in the channels you can see.</span> <span>Kept with this workspace.</span></p></div><div class="page-actions" id="files-actions" hidden><label class="sr" for="files-channel">Channel</label><select id="files-channel" hidden></select><input id="files-input" type="file" hidden><button type="button" class="primary" id="files-upload">Upload file</button></div></div>
      <div id="files-unanswered" hidden></div>
      <div id="files-requests" hidden></div>
      <div id="channel-files-empty" class="empty-state" hidden>
        <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.6h5.2L12.2 5.6V13H4z"/><path d="M9.1 2.7V5.7H12.2"/></svg></span>
        <p class="empty-title">No files yet.</p>
        <p id="channel-files-empty-copy">Files from your channels show up here.</p>
      </div>
      <div id="files-list"></div>
      <p id="files-error" class="meta" hidden></p>
    </section>
    <section id="people" hidden>
      <div class="page-head"><div><p class="page-title">People</p><p class="page-lede">Names heard in a room.</p></div></div>
      <div class="toolbar page-toolbar" id="people-toolbar">
        <label class="search">${searchIcon}<span class="sr">Search people</span><input id="people-search" type="search" placeholder="Search" autocomplete="off"></label>
        ${peopleInvite}
      </div>
      <div id="people-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.2" r="2.2"/><path d="M3.4 12.6c.7-2 2.4-3 4.6-3s3.9 1 4.6 3"/></svg></span><p class="empty-title">No one is listed yet.</p><p>People from a meeting or a channel show up here.</p></div>
      <p class="section-next"><button id="people-next" class="primary" type="button" hidden>Open Home</button></p>
      <div class="explorer" id="people-table">
        <div id="people-list"></div>
        <div id="people-foot" class="explorer-foot" hidden><span id="people-count"></span><span class="pager"><button id="people-prev" type="button" aria-label="Previous page">‹</button><button id="people-next-page" type="button" aria-label="Next page">›</button></span></div>
      </div>
    </section>
    <div id="file-dialog" class="dialog room-screen" hidden role="region" aria-labelledby="file-title">
      <div class="panel bot-detail room-screen-panel">
        <div id="room-missing" class="empty-state" hidden>
          <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13 13"/></svg></span>
          <p class="empty-title">Room not found</p>
          <p>That room is not in this workspace.</p>
          <a class="secondary" href="/console/rooms" id="room-missing-link"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>Back to rooms</a>
        </div>
        <div class="bot-head" id="file-head">
          <p id="file-kind" class="page-kicker sr"></p>
          <div class="bot-title-row">
            <p id="file-title" class="page-title"></p>
            <button type="button" class="secondary" id="file-edit-event" hidden aria-haspopup="dialog">Edit details</button>
          </div>
          <div class="meta-strip" id="file-meta">
            <button type="button" id="file-id-chip" class="id-chip"><span id="file-id" class="mono"></span></button>
            <span class="meta-item header-only" hidden><span class="meta-label">Status</span><span id="file-status-badge" class="badge"></span></span>
            <span class="meta-item header-only" hidden><span class="meta-label">Platform</span><span id="file-platform-pill"></span></span>
            <span class="meta-item" id="file-started-item" hidden><span class="meta-label">Started</span><span id="file-started" class="meta"></span></span>
            <span class="meta-item header-only" id="file-usage-item" hidden><span class="meta-label">Usage</span><span id="file-usage" class="usage-chip"></span></span>
            <p id="file-lead" class="page-lede" hidden></p>
            <p id="file-lead-status" class="meta"></p>
            <button type="button" id="file-proof" class="badge proof-chip" hidden><svg class="proof-check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg><span id="file-proof-label"></span></button>
          </div>
        </div>
        <div class="room-body">
        <div class="room-split detail-split bot-split" id="room-split">
          <div class="detail-main room-left" id="room-left">
            <div class="player-frame">
              <div class="player" id="player">
                <video id="player-video" controls playsinline preload="metadata"></video>
                <div id="player-fallback" class="player-fallback empty-state">
                  <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.2"/><path d="M6.4 6.2v3.6L10 8z"/></svg></span>
                  <p id="player-name" class="empty-title">No recording for this room</p>
                  <p id="player-note"></p>
                </div>
              </div>
            </div>
            <section class="summary-card" id="summary-card" hidden>
              <h2>Summary</h2>
              <p id="file-summary"></p>
            </section>
            <div class="underline-tabs" role="tablist" aria-label="Room record">
              <button type="button" data-left-tab="transcript" aria-selected="true">Transcript</button>
              <button type="button" data-left-tab="config" aria-selected="false">Config</button>
              <button type="button" data-left-tab="raw" aria-selected="false">Raw</button>
            </div>
            <label class="search dock-search">${searchIcon}<span class="sr">Search the transcript</span><input id="transcript-search" type="search" placeholder="Search transcript" autocomplete="off"></label>
            <div id="left-transcript" class="tab-pane left-scroll">
              <div id="file-transcript"></div>
              <h2 class="pane-label">Speakers</h2>
              <div id="file-heard" class="faces"></div>
              <p id="file-present">The meeting has not sent who is there.</p>
            </div>
            <div id="left-config" class="tab-pane" hidden>
              <section class="detail-block" id="files-block">
                <h2 id="files-heading" hidden>Files</h2>
                <div id="file-files"></div>
                <div id="files-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.2 2.6h6.2L12.8 6v7.4H3.2z"/><path d="M9.2 2.6V6H12.8"/></svg></span><p class="empty-title">No file is attached.</p><p>A file kept with a decision shows up here.</p></div>
              </section>
            </div>
            <div id="left-raw" class="tab-pane" hidden>
              <pre id="file-raw" class="raw-card"></pre>
            </div>
          </div>
          <div id="room-resizer" class="room-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the transcript" tabindex="0"></div>
          <aside class="detail-side room-right">
            <div class="underline-tabs" role="tablist" aria-label="Room detail">
              <button type="button" data-right-tab="overview" aria-selected="true">Overview</button>
              <button type="button" data-right-tab="decisions" aria-selected="false">Decisions</button>
              <button type="button" data-right-tab="waiting" aria-selected="false">Activity</button>
              <button type="button" data-right-tab="history" aria-selected="false">History</button>
            </div>
            <div id="right-overview" class="tab-pane">
              <div class="overview-card" id="file-overview" hidden>
                <h2>Overview</h2>
                <p id="file-overview-platform" class="meta"></p>
                <p id="file-overview-when" class="meta"></p>
                <p id="file-overview-count" class="meta"></p>
                <div id="file-overview-people" class="faces"></div>
              </div>
              <div id="file-callout" class="callout" hidden></div>
              <div class="overview-facts" id="overview-facts"></div>
              <div class="outcome-card" id="file-outcome" hidden></div>
              <dl class="kv" id="file-facts"></dl>
              <section id="participants" class="participants"></section>
              <section class="artifacts" id="artifacts" hidden>
                <h2 class="artifact-title">Downloads</h2>
                <div id="artifact-list"></div>
              </section>
              <div class="settings-card room-settings">
                <h2 id="settings-heading">Settings</h2>
                <div class="room-set">
                  <div class="set-copy">
                    <strong>Run automatically</strong>
                    <p id="room-edit-note"></p>
                  </div>
                  <label class="switch"><input id="ask-first" type="checkbox" checked aria-label="Run automatically"><span class="sr">Run automatically</span></label>
                </div>
                <div class="room-set">
                  <div class="set-copy">
                    <strong>Voice</strong>
                    <p class="field-hint" id="voice-hint">Short is one sentence. Plain adds who heard it. Formal also says what is waiting.</p>
                  </div>
                  <div class="choices voices" role="group" aria-label="How this room reads">
                    <button type="button" data-voice="short">Short</button>
                    <button type="button" data-voice="plain" aria-pressed="true">Plain</button>
                    <button type="button" data-voice="formal">Formal</button>
                  </div>
                </div>
                <div class="room-set">
                  <div class="set-copy">
                    <strong>Raise a clash</strong>
                    <p class="field-hint" id="clash-hint">When two decisions disagree, say so in this room. Both stay.</p>
                    <p id="clash-note"></p>
                  </div>
                  <label class="switch"><input id="raise-clash" type="checkbox" aria-label="Raise a clash"><span class="sr">Raise a clash</span></label>
                </div>
              </div>
            </div>
            <div id="right-decisions" class="tab-pane" hidden>
              <div id="file-decisions"></div>
            </div>
            <div id="right-waiting" class="tab-pane" hidden>
              <section class="detail-block" id="waiting-row">
                <p id="file-action-note" class="meta"></p>
                <div id="file-waiting"></div>
              </section>
            </div>
            <div id="right-history" class="tab-pane" hidden>
              <section class="detail-block" id="outside-block">
                <h2 id="outside-heading">Not invited</h2>
                <div id="file-outside"></div>
              </section>
              <div id="file-history"></div>
            </div>
            <div id="right-raw" class="tab-pane" hidden>
              <pre id="file-raw-side" class="raw-card"></pre>
            </div>
          </aside>
        </div>
        <section id="timeline" class="timeline" aria-label="Timeline">
          <div class="timeline-bar">
            <button type="button" id="tl-play" class="tl-play" aria-label="Play"><span aria-hidden="true">▶</span></button>
            <button type="button" id="tl-restart" class="tl-restart" aria-label="Restart">↺</button>
            <span id="tl-clock" class="tl-clock"><span id="tl-now">0:00</span><span class="tl-sep">/</span><span id="tl-end">0:00</span></span>
            <span id="tl-when" class="tl-when"></span>
            <span class="tl-hints"><span class="hint"><kbd>Space</kbd> play</span><span class="hint"><kbd>J</kbd><kbd>K</kbd> ±10s</span></span>
            <button type="button" id="tl-hide" class="tl-hide" aria-pressed="false">Hide timeline <span aria-hidden="true">▾</span></button>
          </div>
          <div id="tl-track" class="tl-track">
            <div class="tl-row"><span class="tl-lane-label"></span><div id="tl-ruler" class="tl-plot"></div></div>
            <div class="tl-row"><span class="tl-lane-label">Speakers</span><div id="tl-speakers" class="tl-plot"></div></div>
            <div class="tl-row"><span class="tl-lane-label">Events</span><div id="tl-events" class="tl-plot"></div></div>
            <div id="tl-head" class="tl-head" hidden></div>
          </div>
        </section>
        </div>
      </div>
    </div>
    <div id="toast" class="toast" hidden role="status"></div>
    <p id="read-note"></p>
      </div>
    </div>
  </div>
</div>
<div id="ask-ai-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="ask-ai-title">
  <div class="shade" data-close="ask-ai-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="ask-ai-title">That's today's questions</h2>
      <button type="button" class="close" data-close="ask-ai-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <p id="ask-limit-copy">Each person gets ${askDaily} Ask AI questions a day. They come back at midnight.</p>
      <p class="meta">To keep asking now, plug your own agent in under Connectors (MCP).</p>
      <div class="wait-actions">
        <button type="button" class="secondary" id="ask-ai-kept" data-close="ask-ai-dialog">Close</button>
        <button type="button" class="primary" id="ask-ai-connectors">Open Connectors</button>
      </div>
    </div>
  </div>
</div>
<div id="proof-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="proof-dialog-title">
  <div class="shade" data-close="proof-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="proof-dialog-title">Record</h2>
      <button type="button" class="close" data-close="proof-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <section id="proof-panel" class="detail-block proof-panel">
        <p id="proof-plain" class="proof-plain"></p>
        <p id="proof-status" class="meta" aria-live="polite">Verifying on chain…</p>
        <details class="proof-tech" id="proof-tech">
          <summary>Show technical details</summary>
          <p id="proof-kept" class="meta" hidden></p>
          <p id="proof-reason" class="meta" hidden></p>
          <dl class="kv" id="proof-facts"></dl>
          <p id="proof-links" class="proof-links"></p>
          <p id="proof-chain" class="meta">Read via Tatum gRPC · 0 calls</p>
          <button type="button" class="secondary" id="proof-again">Verify again</button>
        </details>
      </section>
    </div>
  </div>
</div>
<div id="create-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="create-title">
  <div class="shade" data-close="create-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="create-title">New room</h2>
      <button type="button" class="close" data-close="create-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
    <div class="choices">
      <button type="button" id="pick-meeting" aria-pressed="true">Meeting</button>
      <button type="button" id="pick-channel" aria-pressed="false">Channel</button>
    </div>
    <div id="room-blocked" hidden>
      <p>Meeting join is not available from this page.</p>
      <p>No channel is in use.</p>
      <button type="button" data-close="create-dialog">Close</button>
    </div>
    <form id="meet-form">
      <label id="meet-link-label"${state.meeting ? "" : " hidden"}>Meeting link <input id="meet-link" name="meet" placeholder="Paste a Zoom, Google Meet, Teams, or Webex link"></label>
      <p id="join-ready" class="${joinReadyClass.trim()}">${joinReadyCopy}</p>
      <button id="join-submit" class="primary" type="submit"${joinDisabled}>Join with this link</button>
      <button id="meet-connectors" class="primary" type="button"${state.meeting ? " hidden" : ""}>Open Setup</button>
      <p id="join-hint" class="sr">Sederunt joins that meeting when Meet is ready. If Meet is not ready, the status line says so.</p>
    </form>
    <div id="channel-door" hidden>
      ${slackAsk}
      <p id="channel-setup"></p>
      <p>No channel is in use.<br>Slack is the channel tool. Status shows whether it is connected.</p>
      <button id="channel-connectors" type="button">Open Setup</button>
    </div>
    <p id="join-status"></p>
    </div>
  </div>
</div>
<div id="workspace-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="workspace-title">
  <div class="shade" data-close="workspace-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="workspace-title">About Company</h2>
      <button type="button" class="close" data-close="workspace-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
    <p class="sr">Create a workspace</p>
    <p class="sr">A second company is a delegate added outside this page. Restart after it is added.</p>
    <p class="sr">This page does not take a key.</p>
    <p>Company is the shared workspace for rooms, decisions, and people.</p>
    </div>
  </div>
</div>
${spaceDialog}
<div id="decision-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="decision-sentence">
  <div class="shade" data-close="decision-dialog"></div>
  <div class="panel">
    <div class="panel-bar file-bar">
      <div class="file-name">
        <p id="decision-state"></p>
        <h2 id="decision-sentence"></h2>
      </div>
      <button type="button" class="close" data-close="decision-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
    <p id="decision-heard"></p>
    <p id="decision-file" hidden></p>
    <p id="decision-ticket" hidden></p>
    <p id="decision-proof" hidden></p>
    <section id="decision-proof-panel" class="detail-block proof-panel" hidden>
      <p id="decision-proof-plain" class="proof-plain"></p>
      <p id="decision-proof-status" class="meta" aria-live="polite">Verifying on chain…</p>
      <details class="proof-tech">
        <summary>Show source</summary>
        <p id="decision-proof-kept" class="meta" hidden></p>
        <p id="decision-proof-reason" class="meta" hidden></p>
        <dl class="kv" id="decision-proof-facts"></dl>
        <p id="decision-proof-links" class="proof-links"></p>
        <p id="decision-proof-chain" class="meta">Read via Tatum gRPC · 0 calls</p>
        <button type="button" class="secondary" id="decision-proof-again">Verify again</button>
      </details>
    </section>
    <p id="decision-epoch" hidden></p>
    <div id="decision-other"></div>
    ${linearAsk}
    <div class="decision-actions">
      <a id="decision-room" href="/console/rooms">Open room</a>
      <button type="button" id="decision-copy">Copy</button>
      ${fileTicket}
    </div>
    </div>
  </div>
</div>
<div id="profile-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="profile-title">
  <div class="shade" data-close="profile-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="profile-title">Profile</h2>
      <button type="button" class="close" data-close="profile-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <form id="profile-form" class="panel-body">
      <p class="page-lede">This is the name shown on your account.</p>
      <label>Display name <input id="profile-name" name="name" autocomplete="name" maxlength="80"></label>
      <p id="profile-note" class="page-lede"></p>
      <div class="wait-actions"><button class="secondary" type="button" data-close="profile-dialog">Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>
  </div>
</div>
<div id="event-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
  <div class="shade" data-close="event-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="event-dialog-title">Edit meeting</h2>
      <button type="button" class="close" data-close="event-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <p id="event-title" class="event-title"></p>
      <p id="event-when" class="meta"></p>
      <p id="event-readonly" class="alert info" hidden>This meeting is read-only. Its description and guests cannot be changed.</p>
      <label class="event-field">Description
        <textarea id="event-description" name="description" rows="5" maxlength="8000"></textarea>
      </label>
      <div class="event-guests-block">
        <p class="event-label" id="event-guests-label">Guests</p>
        <ul id="event-guests" aria-labelledby="event-guests-label"></ul>
        <div class="event-add">
          <label class="sr" for="event-email">Guest email</label>
          <input id="event-email" type="email" inputmode="email" autocomplete="off" spellcheck="false" placeholder="name@company.com" aria-describedby="event-email-error">
          <button type="button" class="secondary" id="event-add">Add</button>
        </div>
        <p id="event-email-error" class="field-error" role="alert" hidden></p>
      </div>
      <div class="event-notify">
        <div class="set-copy">
          <strong>Notify guests</strong>
          <p id="event-notify-help" class="field-hint">Guests receive an email about this change.</p>
        </div>
        <label class="switch"><input id="event-notify" type="checkbox" checked aria-describedby="event-notify-help"><span class="sr">Notify guests</span></label>
      </div>
      <p id="event-error" class="alert" role="alert" hidden></p>
      <div id="event-discard" class="event-discard" hidden>
        <p>Discard unsaved changes?</p>
        <div class="wait-actions">
          <button type="button" class="secondary" id="event-keep">Keep editing</button>
          <button type="button" class="danger" id="event-discard-confirm">Discard</button>
        </div>
      </div>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="event-dialog">Cancel</button>
        <button type="button" class="secondary" id="event-retry" hidden>Try again</button>
        <button type="button" class="primary" id="event-save">Save</button>
      </div>
    </div>
  </div>
</div>
<div id="mcp-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="mcp-dialog-title">
  <div class="shade" data-close="mcp-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="mcp-dialog-title">Add a connector</h2>
      <button type="button" class="close" data-close="mcp-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <form id="mcp-form" class="panel-body">
      <p id="mcp-demo" class="mcp-demo" hidden>
        <button type="button" class="secondary" id="mcp-use-demo">Use demo server</button>
        <span id="mcp-demo-note" class="field-hint"></span>
      </p>
      <label>Name <input id="mcp-name" name="name" maxlength="120" autocomplete="off" required></label>
      <label>Server URL <input id="mcp-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://tools.example.com" required></label>
      <label>Auth token <input id="mcp-token" name="token" type="password" autocomplete="new-password" spellcheck="false"></label>
      <p class="field-hint">Optional. Sent as Authorization: Bearer. The token is stored on the server and is not shown again.</p>
      <label>Header name <input id="mcp-header" name="headerName" value="Authorization" autocomplete="off" spellcheck="false" maxlength="64"></label>
      <p id="mcp-error" class="alert" role="alert" hidden></p>
      <p id="mcp-ok" class="alert info" role="status" hidden></p>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="mcp-dialog">Cancel</button>
        <button type="button" class="secondary" id="mcp-test">Test connection</button>
        <button type="submit" class="primary" id="mcp-save">Save</button>
      </div>
    </form>
  </div>
</div>
<div id="mcp-manage-dialog" class="dialog mcp-manage-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="mcp-manage-title">
  <div class="shade" data-manage-close></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="mcp-manage-title">Connector</h2>
      <button type="button" class="close" data-manage-close aria-label="Close">${closeIcon}</button>
    </div>
    <div id="mcp-manage-body" class="panel-body"></div>
  </div>
</div>
<div id="mcp-token-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="mcp-token-title">
  <div class="shade" data-close="mcp-token-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="mcp-token-title">Replace token</h2>
      <button type="button" class="close" data-close="mcp-token-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <form id="mcp-token-form" class="panel-body">
      <p id="mcp-token-current" class="field-hint"></p>
      <label>New token <input id="mcp-token-next" type="password" autocomplete="new-password" spellcheck="false"></label>
      <label>Header name <input id="mcp-token-header" value="Authorization" autocomplete="off" maxlength="64"></label>
      <p id="mcp-token-error" class="alert" role="alert" hidden></p>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="mcp-token-dialog">Cancel</button>
        <button type="button" class="secondary" id="mcp-token-clear">Clear token</button>
        <button type="submit" class="primary" id="mcp-token-save">Save token</button>
      </div>
    </form>
  </div>
</div>
<div id="file-proof-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="file-proof-title">
  <div class="shade" data-close="file-proof-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="file-proof-title">Verified on Walrus</h2>
      <button type="button" class="close" data-close="file-proof-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <section class="detail-block proof-panel">
        <p id="file-proof-plain" class="proof-plain"></p>
        <p id="file-proof-when" class="meta"></p>
        <details class="proof-tech" id="file-proof-tech">
          <summary>Show technical details</summary>
          <dl class="kv" id="file-proof-facts"></dl>
        </details>
      </section>
    </div>
  </div>
</div>
<div id="file-delete-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="file-delete-title">
  <div class="shade" data-close="file-delete-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="file-delete-title">Delete file</h2>
      <button type="button" class="close" data-close="file-delete-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <p id="file-delete-copy">Delete this file for everyone in the workspace? This cannot be undone.</p>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="file-delete-dialog">Cancel</button>
        <button type="button" class="danger" id="file-delete-confirm">Delete</button>
      </div>
    </div>
  </div>
</div>
<div id="mcp-remove-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="mcp-remove-title">
  <div class="shade" data-close="mcp-remove-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="mcp-remove-title">Remove connector</h2>
      <button type="button" class="close" data-close="mcp-remove-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
      <p id="mcp-remove-copy">Remove this connector and its tools? This does not change the remote server.</p>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="mcp-remove-dialog">Cancel</button>
        <button type="button" class="danger" id="mcp-remove-confirm">Remove</button>
      </div>
    </div>
  </div>
</div>
<div id="palette" class="palette" hidden>
  <div class="shade" data-close="palette"></div>
  <div class="palette-panel" role="dialog" aria-modal="true" aria-labelledby="palette-label">
    <label class="sr" id="palette-label" for="palette-input">Go to</label>
    <input id="palette-input" type="search" placeholder="Go to a page or a room" autocomplete="off">
    <div id="palette-list"></div>
    <p id="palette-empty" class="palette-empty" hidden>No matches.</p>
  </div>
</div>
<script type="module">
import { formatActivitySentence, formatConsoleWhen, groupActivity, relativeTime, selectActivity, undoPrompt, zoneShortName } from "/console/activity.js";
import { wireBotCard } from "/console/bot-card.js";
import { rankDecisions } from "/console/room-match.js";
wireBotCard();
var sessionWhen = document.getElementById("account-detail-expiry");
if (sessionWhen && sessionWhen.dataset.at) {
  var sessionText = formatConsoleWhen(sessionWhen.dataset.at);
  if (sessionText) sessionWhen.textContent = sessionText;
}
(function () {
  var onboard = document.getElementById("onboard");
  var home = document.getElementById("home");
  var state = null;
  var waiting = [];
  var fileRoom = "";
  var fileWait = null;
  var readingTimer = null;
  var readingTries = 0;
  var waitingVoice = "plain";
  var waitingClash = false;
  var historyScope = "group";
  var historyKind = "all";
  var lastQuestion = "";
  var peopleColumns = ${JSON.stringify(PEOPLE_COLUMNS)};
  var slowTimer = null;
  var toastTimer = null;
  var consoleSpaces = ${jsonForScript(state.spaces || null)};
  var accountProfile = ${jsonForScript(state.accountProfile || null)};
  var toolAsk = ${jsonForScript(state.toolAsk || null)};
  var workspaceKind = consoleSpaces && consoleSpaces.activeKind === "personal" ? "personal" : "company";
  var sectionName = "home";
  var returnSection = "home";
  var loadToken = 0;
  var opener = null;
  var roomFilter = "all";
  var roomQuery = "";
    var roomPage = 0;
  var recordPage = 0;
  var historyPage = 0;
  var peoplePage = 0;
  var recordQuery = "";
  var historyQuery = "";
  var peopleQuery = "";
  var recordFilter = "all";
  var roomPageSize = 8;
  var transcriptQuery = "";
  var leftTab = "transcript";
  var rightTab = "overview";
  var operatorLeft = false;
  var routeQuiet = false;
  var routed = false;
  var openDecisionRow = null;
  var eventDraft = null;
  var eventSnapshot = "";
  var eventSaving = false;
  var eventLoaded = false;
  var eventForceClose = false;
  var eventLoadToken = 0;
  var calendarAskPlaced = false;

  function text(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function showLine(id, value) {
    var node = document.getElementById(id);
    if (!node) return;
    node.textContent = value || "";
    node.hidden = !value;
  }

  function roomCount(rows) {
    var filed = rows.map(function (row) { return row.connectorId; }).filter(Boolean);
    var line = countLine(rows.length);
    return filed.length ? line + ". Filed as " + filed[filed.length - 1] + "." : line;
  }

  function ticketLine(decision) {
    return decision.connectorId ? "Filed as " + decision.connectorId + "." : "";
  }

  function fileLine(decision) {
    var names = (decision.fileNames || []).map(function (file) { return file.name; }).filter(Boolean);
    if (!names.length) return "";
    return "File " + names.join(", ") + ".";
  }

  function proofLine(decision) {
    return typeof decision.checkpoint === "number" ? ("checkpoint " + decision.checkpoint) : "Proof is unknown.";
  }

  function humanStatus(status) {
    if (status === "current") return "This is the current decision.";
    if (status === "clashing") return "This sentence clashes with another.";
    if (status === "replaced") return "This sentence was replaced.";
    if (status === "unknown") return "This sentence could not be read.";
    if (status === "filed") return "This was filed.";
    if (status === "updated") return "This was updated.";
    if (!status) return "";
    return "This is recorded.";
  }

  function statusLabel(status) {
    if (status === "current") return "Current";
    if (status === "clashing") return "Clashing";
    if (status === "replaced") return "Replaced";
    if (status === "unknown") return "Unknown";
    if (status === "filed") return "Filed";
    if (status === "updated") return "Updated";
    return "Recorded";
  }

  function proofExplain(decision) {
    if (!decision) return "";
    var status = (decision.proof && decision.proof.status) || decision.proofStatus || "";
    if (status === "verified" || typeof decision.checkpoint === "number") return "Kept with this room.";
    return "";
  }

  function historyBody(decision) {
    var who = personLabel(decision.speaker) || "Someone";
    var when = relativeWhen(decision.spokenAt) || whenLabel(decision.spokenAt);
    var status = decision.status || "recorded";
    var line = who + " kept this";
    if (when) line += " on " + when;
    if (status === "clashing") return line + ". It clashes with another sentence.";
    if (status === "replaced") return line + ". A later sentence replaced it.";
    return line + ".";
  }

  function syncAskState(input) {
    if (!input) return;
    input.setAttribute("aria-checked", input.checked ? "true" : "false");
  }

  function paintConn(id, connected) {
    var node = document.getElementById(id);
    if (!node) return;
    // A MemWal account-read failure must not paint tools as Unknown - doors are independent.
    node.textContent = connected ? "Connected" : "Not connected";
    node.className = connected ? "conn-state" : "conn-state off";
    var connectId = id === "cal-conn" ? "cal-connect" : id === "lin-conn" ? "lin-connect" : id === "slack-conn" ? "slack-connect" : "";
    var connect = connectId ? document.getElementById(connectId) : null;
    if (connect) connect.hidden = !!connected;
    var manageId = id === "cal-conn" ? "cal-manage" : id === "lin-conn" ? "lin-manage" : id === "slack-conn" ? "slack-manage" : "";
    var manage = manageId ? document.getElementById(manageId) : null;
    if (manage) manage.hidden = !connected;
    var askId = id === "cal-conn" ? "cal-ask-row" : id === "lin-conn" ? "lin-ask-row" : id === "slack-conn" ? "slack-ask-row" : "";
    var askRow = askId ? document.getElementById(askId) : null;
    if (askRow) askRow.classList.toggle("ask-quiet", !connected);
  }

  function roomTotal() {
    var rooms = (state && state.rooms) || [];
    var pending = (state && state.waiting) || [];
    return rooms.length + pending.length;
  }

  function paintChecklist(hasMeeting, emptyHome) {
    var card = document.getElementById("home-checklist");
    if (!card) return;
    var item = document.getElementById("checklist-meeting");
    if (item) {
      item.classList.toggle("done", hasMeeting);
      var action = document.getElementById("checklist-add-meeting");
      // The empty Home already shows this button right below; one is enough.
      if (action) action.hidden = hasMeeting || emptyHome;
      var mark = item.querySelector(".check-state");
      if (mark) mark.textContent = hasMeeting ? "Done" : "To do";
    }
    var items = card.querySelectorAll(".check-item");
    var done = card.querySelectorAll(".check-item.done").length;
    var count = document.getElementById("checklist-count");
    if (count) count.textContent = done + " of " + items.length + " done";
    var bar = document.getElementById("checklist-bar");
    if (bar) bar.style.width = Math.round((done / Math.max(items.length, 1)) * 100) + "%";
    if (done === items.length && items.length) card.classList.add("complete");
  }

  function emptyHomeNow() {
    var pending = !state || state.reading === true;
    return workspaceKind !== "personal" && !pending && roomTotal() === 0 && sectionName === "home";
  }

  function toolOn(name) {
    var doors = (state && state.doors) || {};
    if (name === "slack" && state && state.slack === "ready") return true;
    if (doors[name] === true) return true;
    return !!(toolAsk && toolAsk.connected && toolAsk.connected[name]);
  }

  function syncHomeChrome() {
    var personal = workspaceKind === "personal";
    var pending = !state || state.reading === true;
    var emptyHome = emptyHomeNow();
    var homeEmpty = document.getElementById("home-empty");
    var blockedHome = !!(document.getElementById("meet-block") && document.getElementById("slack-block"));
    if (homeEmpty) homeEmpty.hidden = !emptyHome;
    // One primary on an empty Home: the card's "Add Sederunt to a meeting".
    var headerAdd = document.getElementById("home-add-to-meeting");
    if (headerAdd) headerAdd.hidden = emptyHome;
    var newRoom = document.getElementById("new-room");
    if (newRoom && emptyHome) newRoom.hidden = true;
    var connectTools = document.getElementById("home-connect-tools");
    if (connectTools) connectTools.hidden = toolOn("calendar") && toolOn("slack");
    paintChecklist(!pending && roomTotal() > 0, emptyHome);
    var stats = document.getElementById("home-stats");
    if (stats) stats.hidden = sectionName !== "home" || emptyHome || (state && state.read === "failed");
    var note = document.getElementById("read-note");
    if (note) note.hidden = sectionName !== "home" || emptyHome;
    var explorer = document.querySelector("#rooms .explorer");
    if (explorer && !personal) explorer.hidden = pending || (sectionName === "home" && emptyHome);
    var line = document.getElementById("home-empty-line");
    var aside = document.getElementById("home-empty-aside");
    // When the calendar already lists meetings below, the card must not claim there are none.
    var listed = !!(state && state.read !== "failed" && Array.isArray(state.meetings) && state.meetings.length);
    if (line) line.textContent = listed ? "Nothing kept yet" : "Your meetings will show up here";
    if (aside) aside.textContent = listed
      ? "Add Sederunt to one of your meetings below. Its decisions and follow-ups will show up here."
      : blockedHome
      ? "Add Sederunt to a meeting or a Slack channel. It keeps the decisions and follow-ups, and lists them here."
      : "Add Sederunt to your next meeting. It keeps the decisions and follow-ups, and lists them here.";
  }

  function placeDoors(intoOnboard) {
    var host = intoOnboard ? document.getElementById("onboard-doors") : document.querySelector(".notices");
    if (!host) return;
    ["meet-kicker", "meet-block", "channel-kicker", "slack-block"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node && node.parentNode !== host) host.appendChild(node);
    });
  }

  function syncNotices() {
    var meet = document.getElementById("meet-block");
    var slack = document.getElementById("slack-block");
    var unfinished = !!(meet || slack);
    var onOnboard = !!(onboard && !onboard.hidden);
    var loaded = !!(state && state.companyLoaded === true);
    var showFull = unfinished && !onOnboard && sectionName === "connectors";
    var showInOnboard = unfinished && onOnboard && loaded;
    var toggle = document.getElementById("setup-toggle");
    var label = document.getElementById("setup-label");
    if (toggle) {
      toggle.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
    if (label) label.hidden = true;
    if (meet) meet.hidden = true;
    if (slack) slack.hidden = true;
    var meetKicker = document.getElementById("meet-kicker");
    var channelKicker = document.getElementById("channel-kicker");
    if (meetKicker) meetKicker.hidden = true;
    if (channelKicker) channelKicker.hidden = true;
    var meetingCard = document.getElementById("meeting-card");
    var meetingCopy = document.getElementById("meeting-card-copy");
    if (meetingCard) meetingCard.hidden = !meet;
    if (meetingCopy) meetingCopy.textContent = meet ? "No meeting is in use." : "A meeting is in use.";
    placeDoors(false);
    if (onOnboard) {
      text("crumb-current", "Rooms");
      var roomsNav = document.querySelector(".rail [data-show=rooms]");
      if (roomsNav) {
        roomsNav.setAttribute("aria-current", "page");
        roomsNav.removeAttribute("aria-disabled");
      }
    }
    var statusTitle = document.getElementById("status-title");
    if (statusTitle) statusTitle.hidden = true;
    var blockedNav = !!(document.getElementById("meet-block") && document.getElementById("slack-block"));
    ["rooms", "history", "record", "chat", "people"].forEach(function (name) {
      var nav = document.querySelector(".rail [data-show=" + name + "]");
      if (nav) nav.classList.toggle("wait", blockedNav);
    });
    if (!onOnboard) return;
    var open = document.getElementById("open-connectors");
    var cont = document.getElementById("continue");
    var heading = document.getElementById("onboard-heading");
    if (heading && loaded) heading.textContent = unfinished ? "No room is listed." : "Start with Home";
    var next = document.getElementById("onboard-next");
    if (next) next.hidden = true;
    if (!loaded) {
      if (open) open.hidden = true;
      if (cont) cont.hidden = true;
    } else if (unfinished) {
      if (open) {
        open.hidden = false;
        open.classList.add("primary");
        open.textContent = "New room";
      }
      if (cont) cont.hidden = true;
    } else {
      if (open) open.hidden = true;
      if (cont) {
        cont.hidden = false;
        cont.classList.add("primary");
      }
    }
  }

  function syncJoinReady() {
    var node = document.getElementById("join-ready");
    var button = document.getElementById("join-submit");
    if (!node) return;
    var ready = !document.getElementById("meet-block");
    node.textContent = ready ? "Joining is available." : "Joining meetings is not set up on this server yet. Setup shows what is missing.";
    node.className = ready ? "" : "off";
    var label = document.getElementById("meet-link-label");
    if (label) label.hidden = !ready;
    if (button) {
      button.disabled = !ready;
      button.hidden = false;
      button.textContent = ready ? "Join with this link" : "Join";
      button.classList.toggle("primary", ready);
    }
    var alt = document.getElementById("meet-connectors");
    if (alt) alt.hidden = true;
  }

  function railButtons(rail) {
    return Array.prototype.filter.call(rail.children, function (node) {
      return node.tagName === "BUTTON";
    });
  }

  function railPad(rail) {
    var endPad = rail.querySelector(".rail-end");
    if (!endPad) {
      endPad = document.createElement("span");
      endPad.className = "rail-end";
      endPad.setAttribute("aria-hidden", "true");
      rail.appendChild(endPad);
    }
    return endPad;
  }

  function railOuter(rail) {
    return rail.getBoundingClientRect();
  }

  function buttonInRail(rail, button) {
    var outer = railOuter(rail);
    var box = button.getBoundingClientRect();
    return box.left >= outer.left - 1 && box.right <= outer.right + 1 && box.width > 0;
  }

  function railClean(rail) {
    var buttons = railButtons(rail);
    var outer = railOuter(rail);
    for (var i = 0; i < buttons.length; i += 1) {
      var box = buttons[i].getBoundingClientRect();
      var overlaps = box.right > outer.left + 1 && box.left < outer.right - 1;
      if (!overlaps) continue;
      if (box.left < outer.left - 1 || box.right > outer.right + 1) return false;
    }
    return true;
  }

  function placeRail(rail, scroll) {
    var maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    if (scroll > maxScroll) scroll = maxScroll;
    if (scroll < 0) scroll = 0;
    rail.scrollLeft = scroll;
  }

  function fitRailEnd() {
    var rail = document.querySelector(".rail");
    if (!rail) return;
    var endPad = railPad(rail);
    var phone = window.matchMedia("(max-width: 959px)").matches;
    endPad.style.width = phone ? "16px" : "0px";
    if (!phone) return;
    var buttons = railButtons(rail);
    if (!buttons.length) return;
    var last = buttons[buttons.length - 1];
    var kept = rail.scrollLeft;
    var guard = 0;
    while (guard < 12) {
      guard += 1;
      var maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      rail.scrollLeft = Math.min(last.offsetLeft, maxScroll);
      if (buttonInRail(rail, last) && railClean(rail)) {
        rail.scrollLeft = kept;
        return;
      }
      var missing = Math.ceil(last.getBoundingClientRect().right - railOuter(rail).right);
      if (missing < 8) missing = 8;
      var width = parseFloat(endPad.style.width) || 0;
      endPad.style.width = (width + missing) + "px";
    }
    rail.scrollLeft = kept;
  }

  function showRailButton(button) {
    var rail = document.querySelector(".rail");
    if (!rail || !button) return;
    fitRailEnd();
    var buttons = railButtons(rail);
    var chosen = button.offsetLeft;
    for (var i = 0; i < buttons.length; i += 1) {
      var start = buttons[i].offsetLeft;
      if (start > button.offsetLeft + 1) break;
      placeRail(rail, start);
      if (buttonInRail(rail, button) && railClean(rail)) {
        chosen = start;
        break;
      }
    }
    placeRail(rail, chosen);
    var outer = railOuter(rail);
    var box = button.getBoundingClientRect();
    if (box.right > outer.right + 1) {
      var endPad = railPad(rail);
      var missing = Math.ceil(box.right - outer.right) + 12;
      var width = parseFloat(endPad.style.width) || 0;
      endPad.style.width = (width + missing) + "px";
      placeRail(rail, rail.scrollLeft + missing);
    }
    syncRail();
  }

  function syncRail() {
    var rail = document.querySelector(".rail");
    var prev = document.getElementById("rail-prev");
    var next = document.getElementById("rail-next");
    if (!rail || !prev || !next) return;
    var buttons = railButtons(rail);
    var outer = railOuter(rail);
    var overflow = rail.scrollWidth > rail.clientWidth + 1;
    var canPrev = false;
    var canNext = false;
    for (var i = 0; i < buttons.length; i += 1) {
      var box = buttons[i].getBoundingClientRect();
      if (box.right <= outer.left + 1) canPrev = true;
      if (box.left >= outer.right - 1) canNext = true;
    }
    prev.hidden = !overflow || !canPrev;
    next.hidden = !overflow || !canNext;
  }

  function revealRail(name) {
    var rail = document.querySelector(".rail");
    if (!rail) return;
    var button = name === "connectors" ? document.getElementById("show-connectors") : null;
    if (!button) {
      rail.querySelectorAll("[data-show]").forEach(function (node) {
        if (node.getAttribute("data-show") === name) button = node;
      });
    }
    if (button) {
      showRailButton(button);
      var again = button;
      requestAnimationFrame(function () { showRailButton(again); });
    } else syncRail();
  }

  function stepRail(direction) {
    var rail = document.querySelector(".rail");
    if (!rail) return;
    var buttons = railButtons(rail);
    var outer = railOuter(rail);
    var target = null;
    if (direction < 0) {
      for (var i = buttons.length - 1; i >= 0; i -= 1) {
        if (buttons[i].getBoundingClientRect().left < outer.left - 1) {
          target = buttons[i];
          break;
        }
      }
    } else {
      for (var j = 0; j < buttons.length; j += 1) {
        var box = buttons[j].getBoundingClientRect();
        if (box.left >= outer.right - 1 || box.right > outer.right + 1) {
          target = buttons[j];
          break;
        }
      }
    }
    if (target) showRailButton(target);
    else syncRail();
  }

  function splitLines(raw) {
    var nl = String.fromCharCode(10);
    var cr = String.fromCharCode(13);
    var lines = [];
    var current = "";
    var value = String(raw || "");
    for (var i = 0; i < value.length; i += 1) {
      var ch = value.charAt(i);
      if (ch === nl || ch === cr) {
        lines.push(current);
        current = "";
      } else current += ch;
    }
    lines.push(current);
    return lines;
  }

  function isStatusWord(word) {
    return word === "current" || word === "recorded" || word === "clashing" || word === "replaced" || word === "unknown" || word === "filed" || word === "updated";
  }

  function chatParts(body) {
    var lines = splitLines(body);
    var facts = [];
    var pending = "";
    function flush(issue) {
      if (!pending) return;
      facts.push(issue ? pending + " Filed as " + issue + "." : pending);
      pending = "";
    }
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      if (isStatusWord(trimmed) || /^(?:preference|checkpoint) [a-z0-9-]+$/i.test(trimmed)) return;
      if (/^ROW-[0-9]+$/.test(trimmed)) {
        flush(trimmed);
        return;
      }
      flush("");
      pending = trimmed;
    });
    flush("");
    if (facts.length > 1 || (facts.length === 1 && lastQuestion)) return rankAnswer(lastQuestion);
    if (facts.length === 1) return { answer: facts[0], detail: "", cites: [] };
    var stored = rankAnswer(lastQuestion);
    if (stored.answer) return stored;
    var raw = String(body || "");
    if (raw.indexOf("missing-member") !== -1) return { answer: "This server has no member configured.", detail: "", cites: [] };
    if (raw.indexOf("not-invited") !== -1) return { answer: "You were not in that room.", detail: "", cites: [] };
    if (raw.indexOf("there are no notes yet") !== -1) return { answer: "There are no notes yet.", detail: "", cites: [] };
    if (/(^|\\n)unknown(\\n|$)/.test(raw)) return { answer: "The account could not be read. Read it again.", detail: "", cites: [] };
    return { answer: "Nothing is stored that you can read.", detail: "", cites: [] };
  }

  function rankAnswer(question) {
    return rankDecisions(question, (state && state.decisions) || [], (state && state.rooms) || []);
  }

  function storedAnswer() {
    var rows = (state && state.decisions) || [];
    var lines = [];
    rows.forEach(function (decision) {
      var sentence = String(decision.text || "").trim();
      if (!sentence) return;
      var who = personLabel(decision.speaker);
      var when = relativeWhen(decision.spokenAt) || whenLabel(decision.spokenAt);
      var tail = [who, when].filter(Boolean).join(", ");
      lines.push(tail ? sentence + " (" + tail + ")" : sentence);
    });
    return lines.join("\\n");
  }

  ${speakerLabel.toString()}

  function personLabel(name) {
    return speakerLabel(name, member(), accountMember());
  }

  function whenLabel(iso) {
    return formatConsoleWhen(iso, { time: false });
  }

  function epochLine(decision) {
    if (typeof decision.expiryEpoch !== "number") return "";
    return "Observed through epoch " + decision.expiryEpoch + ". This page does not renew it.";
  }

  function clear(id) {
    var node = document.getElementById(id);
    if (node) node.replaceChildren();
  }

  function fillHearing(hearing) {
    var name = document.getElementById("hearing-name");
    var triggers = document.getElementById("hearing-triggers");
    var heard = hearing && typeof hearing === "object" ? hearing : null;
    var nextName = heard && heard.name ? String(heard.name) : (name && name.value ? name.value : "");
    if (name && document.activeElement !== name && nextName) name.value = nextName;
    if (triggers && document.activeElement !== triggers && heard) triggers.value = (heard.triggers || []).join("\\n");
  }

  function member() {
    var node = document.getElementById("account");
    if (!node || node.getAttribute("data-known") !== "true") return "";
    return (node.getAttribute("data-name") || "").trim();
  }

  function accountMember() {
    var node = document.getElementById("account");
    return node ? (node.getAttribute("data-member") || "").trim() : "";
  }

  function placeAskHelp() {
    var help = document.getElementById("ask-help");
    var block = document.getElementById("ask-block");
    var kicker = block ? block.querySelector(".ask-kicker") : null;
    if (!help || !block) return;
    if (help.parentNode !== block) {
      if (kicker && kicker.nextSibling) block.insertBefore(help, kicker.nextSibling);
      else block.appendChild(help);
    }
  }

  function placeNameRow() {
    var row = document.getElementById("name-row");
    var foot = document.querySelector(".rail-foot");
    var block = document.getElementById("ask-block");
    if (!row || !foot) return;
    if (row.parentNode !== foot) foot.appendChild(row);
    if (block) block.classList.remove("name-with-ask");
  }

  function syncNameCue() {
    var cue = document.getElementById("name-cue");
    placeAskHelp();
    placeNameRow();
    if (cue) cue.hidden = true;
    var line = document.getElementById("history-line");
    if (line) line.hidden = false;
    var historyPane = document.getElementById("history");
    if (historyPane) historyPane.classList.remove("name-wait");
  }

  function initials(name) {
    var parts = String(name || "").trim().split(" ");
    var letters = "";
    parts.forEach(function (part) {
      if (part && letters.length < 2) letters += part.charAt(0).toUpperCase();
    });
    return letters || "?";
  }

  function toneClass(name) {
    var value = 0;
    var lower = String(name || "").toLowerCase();
    for (var i = 0; i < lower.length; i += 1) value = value * 9 + lower.charCodeAt(i);
    var tone = value % 8;
    if (tone < 0) tone += 8;
    return "t" + tone;
  }

  function face(name) {
    var node = document.createElement("span");
    node.className = "face " + toneClass(name);
    node.textContent = initials(name);
    node.title = name;
    return node;
  }

  function countLine(count) {
    if (!count) return "No decision yet.";
    if (count === 1) return "1 decision";
    return String(count) + " decisions";
  }

  function decisionsFor(roomId) {
    return (state && state.decisions || []).filter(function (item) { return item.roomId === roomId; });
  }

  function peopleFor(roomId) {
    var names = [];
    decisionsFor(roomId).forEach(function (item) {
      if (item.speaker && names.indexOf(item.speaker) === -1) names.push(item.speaker);
    });
    return names;
  }

  function addRoomCard(spec) {
    var card = document.createElement("a");
    card.className = "room";
    card.href = spec.roomId ? ("/console/rooms/" + encodeURIComponent(spec.roomId)) : "/console/rooms";
    card.title = spec.fullTitle || spec.title || "Room";
    if (spec.roomId) card.setAttribute("data-room", spec.roomId);
    var roomCol = document.createElement("span");
    roomCol.className = "ex-room";
    roomCol.dataset.col = "room";
    var title = document.createElement("strong");
    title.textContent = spec.title || "Room";
    title.title = spec.fullTitle || spec.title || "Room";
    title.classList.remove("mono");
    var count = document.createElement("span");
    count.className = "ex-count";
    var subtitle = spec.countLine || "";
    if (spec.where) {
      var inlinePlat = document.createElement("span");
      inlinePlat.className = "ex-plat-inline";
      inlinePlat.textContent = (spec.where === "Google Meet" ? "Meet" : spec.where) + (subtitle ? " · " : "");
      count.append(inlinePlat);
    }
    if (subtitle) count.append(document.createTextNode(subtitle));
    roomCol.append(title, count);
    if (spec.calendarEventId) {
      var editDetails = document.createElement("button");
      editDetails.type = "button";
      editDetails.className = "secondary row-edit";
      editDetails.textContent = "Edit details";
      editDetails.setAttribute("data-edit-event", spec.calendarEventId);
      editDetails.setAttribute("aria-haspopup", "dialog");
      roomCol.append(editDetails);
    }
    var where = document.createElement("span");
    where.className = "where ex-plat";
    where.dataset.col = "platform";
    if (spec.where) where.append(platformBadge(spec.where));
    var heard = document.createElement("span");
    heard.className = "avatar-stack";
    heard.dataset.col = "speakers";
    var people = spec.people || [];
    heard.title = people.length ? people.map(function (person) { return personLabel(person) || person; }).join(", ") : "No speakers yet";
    if (!people.length) {
      var noneSpeaker = document.createElement("span");
      noneSpeaker.className = "speaker-none";
      noneSpeaker.textContent = "None";
      noneSpeaker.title = "No speakers yet";
      heard.append(noneSpeaker);
    }
    people.slice(0, 2).forEach(function (person) { heard.append(face(personLabel(person) || person)); });
    if (people.length > 2) {
      var more = document.createElement("span");
      more.className = "face more";
      more.textContent = "+" + (people.length - 2);
      heard.append(more);
    }
    var status = document.createElement("span");
    status.className = "status-cell";
    status.dataset.col = "status";
    var badge = document.createElement("span");
    var tone = roomTone(spec.roomId);
    badge.className = tone.badge;
    badge.textContent = tone.word;
    var fails = failedActions(spec.roomId);
    status.append(badge);
    if (fails > 0) {
      var chip = document.createElement("span");
      chip.className = "fail-chip";
      chip.textContent = fails === 1 ? "1 failed action" : (fails + " failed actions");
      status.append(chip);
    }
    var when = document.createElement("span");
    when.className = "when";
    when.dataset.col = "started";
    when.textContent = spec.whenText || "";
    var view = document.createElement("span");
    view.className = "row-view";
    view.dataset.col = "action";
    view.setAttribute("aria-label", "View");
    view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    card.append(roomCol, where, heard, status, when, view);
    card.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest("button")) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (spec.wait) openWaiting(spec);
      else openFile(spec.roomId);
    });
    document.getElementById("room-list").append(card);
  }

  function logoKey(name) {
    var key = String(name || "");
    var map = {
      "Google Meet": "google-meet",
      "Meet": "google-meet",
      "Zoom": "zoom",
      "Teams": "microsoft-teams",
      "Microsoft Teams": "microsoft-teams",
      "Webex": "webex",
      "Slack": "slack-icon",
      "Calendar": "google-calendar",
      "Google Calendar": "google-calendar",
      "Linear": "linear-icon",
      "Walrus": "walrus",
      "Recall": "recall"
    };
    return map[key] || "";
  }

  function logoSvg(name) {
    var key = logoKey(name);
    if (!key || !document.getElementById("logo-" + key)) return null;
    var symbol = document.getElementById("logo-" + key);
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "brand-mark");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", (symbol && symbol.getAttribute("viewBox")) || "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#logo-" + key);
    svg.append(use);
    return svg;
  }

  function platformBadge(name) {
    var badge = document.createElement("span");
    badge.className = "plat-badge";
    var svg = logoSvg(name);
    if (svg) badge.append(svg);
    else {
      var mark = document.createElement("span");
      mark.className = "tool-logo";
      mark.textContent = String(name || "M").replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "M";
      badge.append(mark);
    }
    var label = document.createElement("span");
    label.textContent = name === "Google Meet" ? "Meet" : name;
    badge.append(label);
    return badge;
  }

  function syncWorkspaceMenu() {
    document.querySelectorAll("#workspace-menu [data-workspace]").forEach(function (button) {
      var on = button.getAttribute("data-workspace") === workspaceKind;
      button.hidden = false;
      button.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function paintChip() {
    if (consoleSpaces && consoleSpaces.oauth) {
      paintSpaceChip();
      return;
    }
    var personal = workspaceKind === "personal";
    text("chip-name", personal ? "Personal" : "Company");
    text("chip-hint", personal ? "A separate workspace" : "");
    syncWorkspaceMenu();
    var mark = document.getElementById("chip-mark");
    mark.textContent = personal ? "P" : "C";
    mark.className = personal ? "tile-mark pe" : "tile-mark co";
    document.querySelectorAll("[data-workspace]").forEach(function (button) {
      button.setAttribute("aria-checked", button.getAttribute("data-workspace") === workspaceKind ? "true" : "false");
    });
  }

  function paintSpaceChip() {
    var items = consoleSpaces.items || [];
    var active = null;
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].id === consoleSpaces.activeId) active = items[i];
    }
    if (!active && items.length) active = items[0];
    var personal = active ? active.kind === "personal" : consoleSpaces.activeKind === "personal";
    text("chip-name", active ? active.name : (consoleSpaces.activeName || "Personal"));
    text("chip-hint", active ? (active.hint || "") : "");
    var mark = document.getElementById("chip-mark");
    if (mark) {
      mark.textContent = active ? (active.mark || (personal ? "P" : "S")) : "P";
      mark.className = personal ? "tile-mark pe" : "tile-mark";
    }
    document.querySelectorAll("#workspace-menu [data-tenant]").forEach(function (button) {
      var on = !!(active && button.getAttribute("data-tenant") === active.id);
      button.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function paintRooms() {
    clear("room-list");
    var personal = workspaceKind === "personal";
    syncNewRoom();
    var explorer = document.querySelector("#rooms .explorer");
    var notes = document.getElementById("personal-notes");
    if (personal) {
      if (explorer) explorer.hidden = true;
      if (notes) notes.hidden = false;
      clear("personal-list");
      var kept = (state && state.decisions) || [];
      var personalEmpty = document.getElementById("personal-empty");
      if (personalEmpty) personalEmpty.hidden = kept.length > 0;
      kept.forEach(function (decision) {
        addLine("personal-list", decision.text || "No decision yet.", proofExplain(decision), function () {
          openDecision(decision);
        });
      });
      syncHomeChrome();
      return;
    }
    if (explorer) explorer.hidden = false;
    if (notes) notes.hidden = true;
    var rooms = (state && state.rooms) || [];
    var specs = [];
    var usedTitle = {};
    waiting.forEach(function (item) {
      if (!roomVisible(item)) return;
      specs.push(item);
    });
    rooms.forEach(function (room) {
      var rows = decisionsFor(room.id);
      var ident = roomIdentity(room, rows);
      var spec = {
        roomId: room.id,
        title: ident.title,
        fullTitle: ident.full,
        meta: ident.meta,
        where: room.platform || "",
        whenText: ident.when ? (relativeWhen(ident.when) || "") : "",
        countLine: rows.length ? roomCount(rows) : "",
        people: peopleFor(room.id),
        waitingCount: waitingFor(room.id).length,
        kept: rows.length > 0,
        calendarEventId: typeof room.calendarEventId === "string" ? room.calendarEventId : ""
      };
      if (!roomVisible(spec)) return;
      var base = spec.title;
      if (usedTitle[base]) {
        usedTitle[base] += 1;
        var stamp = relativeWhen(ident.when) || whenLabel(ident.when) || String(room.id || "").slice(0, 6);
        spec.title = base + (stamp ? " (" + stamp + ")" : " (" + usedTitle[base] + ")");
        if (usedTitle[spec.title]) spec.title = base + " (" + usedTitle[base] + ")";
      }
      usedTitle[base] = usedTitle[base] || 1;
      usedTitle[spec.title] = (usedTitle[spec.title] || 0) + 1;
      specs.push(spec);
    });
    var shown = specs.length;
    var onHome = sectionName === "home";
    var pages = onHome ? 1 : Math.max(1, Math.ceil(shown / roomPageSize));
    if (roomPage > pages - 1) roomPage = pages - 1;
    if (roomPage < 0) roomPage = 0;
    var start = onHome ? 0 : roomPage * roomPageSize;
    var pageSize = onHome ? 3 : roomPageSize;
    var explorerHead = document.querySelector("#rooms .explorer-head");
    if (explorerHead) explorerHead.hidden = onHome;
    // Home: a label so the recent rooms read as their own block under the meetings list.
    var roomsLabel = document.getElementById("home-rooms-label");
    var roomsExplorer = document.querySelector("#rooms .explorer");
    if (!roomsLabel && roomsExplorer && roomsExplorer.parentNode) {
      roomsLabel = document.createElement("h2");
      roomsLabel.id = "home-rooms-label";
      roomsLabel.className = "section-label";
      roomsLabel.textContent = "Recent rooms";
      roomsExplorer.parentNode.insertBefore(roomsLabel, roomsExplorer);
    }
    if (roomsLabel) roomsLabel.hidden = !(onHome && shown > 0);
    specs.slice(start, start + pageSize).forEach(addRoomCard);
    var allRooms = document.getElementById("home-all-rooms");
    if (!allRooms) {
      allRooms = document.createElement("p");
      allRooms.id = "home-all-rooms";
      allRooms.className = "section-next";
      var allLink = document.createElement("a");
      allLink.className = "secondary";
      allLink.href = "/console/rooms";
      allLink.textContent = "All rooms";
      allRooms.append(allLink);
      var roomList = document.getElementById("room-list");
      if (roomList && roomList.parentNode) roomList.parentNode.insertBefore(allRooms, roomList.nextSibling);
    }
    allRooms.hidden = !(onHome && shown > 3);
    var total = rooms.length + waiting.length;
    var empty = document.getElementById("room-empty");
    var emptyLine = document.getElementById("room-empty-line");
    if (empty) empty.hidden = shown > 0;
    var filteredOut = total > 0 && shown === 0;
    var failed = state && state.read === "failed";
    if (emptyLine) {
      emptyLine.textContent = failed
        ? "Rooms are unavailable."
        : filteredOut
          ? "No results."
          : "No rooms yet.";
    }
    var aside = document.getElementById("room-empty-aside");
    if (aside) aside.textContent = failed
      ? "Home could not be loaded."
      : filteredOut
        ? "Clear the filters to see every room."
        : "Bring Sederunt into a meeting or a channel.";
    var clearFilters = document.getElementById("clear-filters");
    if (clearFilters) clearFilters.hidden = !filteredOut;
    var explorer = document.querySelector("#rooms .explorer");
    if (explorer) {
      var anyWait = waiting.length > 0 || rooms.some(function (room) { return waitingFor(room.id).length > 0; });
      explorer.classList.toggle("no-wait", !anyWait);
    }
    syncHomeChrome();
    var foot = document.getElementById("room-foot");
    var count = document.getElementById("room-count");
    var prev = document.getElementById("room-prev");
    var next = document.getElementById("room-next");
    if (foot) foot.hidden = onHome || shown === 0 || pages <= 1;
    var roomPager = foot ? foot.querySelector(".pager") : null;
    if (roomPager) roomPager.hidden = pages <= 1;
    if (count) {
      var from = shown ? start + 1 : 0;
      var to = Math.min(shown, start + roomPageSize);
      count.textContent = shown ? (from + "\u2013" + to + " of " + shown) : "";
    }
    if (prev) prev.disabled = roomPage <= 0;
    if (next) next.disabled = roomPage >= pages - 1;
  }

  function clipText(text, max) {
    var value = String(text || "").trim();
    if (value.length <= max) return value;
    var cut = value.slice(0, max - 1);
    var space = cut.lastIndexOf(" ");
    return (space > 8 ? cut.slice(0, space) : cut).trim() + "…";
  }

  function roomName(room) {
    if (!room) return "";
    if (room.channel) {
      var channel = String(room.channel);
      return channel.charAt(0) === "#" ? channel : ("#" + channel);
    }
    if (room.name && /slack/i.test(room.platform || "")) {
      var slackName = String(room.name);
      return slackName.charAt(0) === "#" ? slackName : ("#" + slackName);
    }
    if (room.name) return String(room.name);
    return "";
  }

  function blankMark() { return "\\u2014"; }

  function roomIdentity(room) {
    var when = (room && (room.startedAt || room.recordingStart)) || "";
    var platform = (room && room.platform) || "";
    var named = roomName(room);
    var title = named && !looksLikeRawRoomId(named) ? named : "";
    if (!title && platform) title = platform;
    if (!title) title = "Room";
    var stamp = relativeWhen(when) || whenLabel(when);
    return {
      title: title,
      full: title,
      meta: stamp,
      when: when,
      platform: platform
    };
  }

  function zoneParts(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    // Same zone as whenLabel (the viewer). A calendar day must not mix
    // "Today at …" with an absolute date from a different zone.
    var parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).formatToParts(date);
    var bag = {};
    parts.forEach(function (part) { if (part.type !== "literal") bag[part.type] = part.value; });
    return bag;
  }

  function relativeWhen(iso) {
    return formatConsoleWhen(iso);
  }

  function clockOnly(iso) {
    return formatConsoleWhen(iso, { part: "clock" });
  }

  function dayHeading(ms) {
    if (ms == null || isNaN(ms)) return "";
    return formatConsoleWhen(ms, { part: "day" });
  }

  function groupOpened(group) {
    var requestAt = null;
    var earliest = null;
    (group.rows || []).forEach(function (row) {
      var t = Date.parse(row && row.ts || "");
      if (isNaN(t)) return;
      if (earliest == null || t < earliest) earliest = t;
      if (row.kind === "request") requestAt = t;
    });
    return requestAt != null ? requestAt : earliest;
  }

  function roomLabel(room, lead) {
    var rows = lead ? [lead] : [];
    return roomIdentity(room || {}, rows).title;
  }

  function roomVisible(spec) {
    if (roomFilter === "waiting") return true;
    if (roomFilter === "kept" && !spec.kept) return false;
    if (!roomQuery) return true;
    var hay = String(spec.fullTitle || "") + " " + String(spec.title || "") + " " + String(spec.where || "");
    return hay.toLowerCase().indexOf(roomQuery) !== -1;
  }

  function addDecisionRow(decision) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "room decision-row";
    var main = document.createElement("span");
    main.className = "ex-room";
    main.dataset.col = "sentence";
    var heading = document.createElement("strong");
    heading.textContent = decision.text || "No decision yet.";
    var meta = document.createElement("span");
    meta.className = "meta";
    var who = personLabel(decision.speaker);
    var when = relativeWhen(decision.spokenAt) || whenLabel(decision.spokenAt);
    meta.textContent = [who, when].filter(Boolean).join(" · ");
    main.append(heading, meta);
    var decisionRoom = (((state && state.rooms) || []).filter(function (item) { return item.id === decision.roomId; })[0]) || {};
    var roomCell = document.createElement("span");
    roomCell.className = "ex-plat";
    roomCell.dataset.col = "room";
    var roomLabelText = roomName(decisionRoom) || "";
    if (roomLabelText && looksLikeRawRoomId(roomLabelText)) roomLabelText = "";
    if (!roomLabelText && decisionRoom.platform) roomLabelText = String(decisionRoom.platform);
    if (!roomLabelText) roomLabelText = "Room";
    if (roomLabelText) {
      var roomText = document.createElement("span");
      roomText.className = "room-name";
      roomText.textContent = roomLabelText;
      roomText.title = roomLabelText;
      roomCell.append(roomText);
    } else if (decisionRoom.platform) {
      roomCell.append(platformBadge(decisionRoom.platform));
    } else {
      var fallbackRoom = document.createElement("span");
      fallbackRoom.className = "room-name";
      fallbackRoom.textContent = "Room";
      roomCell.append(fallbackRoom);
    }
    var status = decision.status || "recorded";
    var clashing = status === "clashing";
    if (clashing) {
      var inline = document.createElement("span");
      inline.className = "badge warn badge-inline";
      inline.textContent = "Clashing";
      meta.append(inline);
    }
    var badge = document.createElement("span");
    badge.dataset.col = "status";
    badge.className = clashing ? "badge warn" : "badge";
    badge.textContent = clashing ? "Clashing" : "";
    var view = document.createElement("span");
    view.className = "row-view";
    view.dataset.col = "action";
    view.setAttribute("aria-label", "View");
    view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    card.append(main, roomCell, badge, view);
    card.addEventListener("click", function () { openDecision(decision); });
    document.getElementById("record-list").append(card);
  }

  function decisionMatchesFilter(decision) {
    if (!decision) return false;
    if (recordFilter === "current") return decision.status === "current";
    if (recordFilter === "clashing") return decision.status === "clashing";
    return true;
  }

  function paintRecord() {
    clear("record-list");
    text("record-detail", "");
    var all = (state && state.decisions) || [];
    var rows = all.filter(decisionMatchesFilter);
    rows.forEach(function (decision) { addDecisionRow(decision); });
    var recordCount = document.getElementById("record-count");
    if (recordCount && all.length) {
      recordCount.textContent = rows.length ? ("1\u2013" + rows.length + " of " + all.length) : ("0 of " + all.length);
    }
  }

  function applyRecordFilter(filter) {
    recordFilter = filter === "current" || filter === "clashing" ? filter : "all";
    document.querySelectorAll("[data-decision-filter]").forEach(function (node) {
      node.setAttribute("aria-pressed", node.getAttribute("data-decision-filter") === recordFilter ? "true" : "false");
    });
    paintRecord();
  }

  function paintPeople() {
    var list = document.getElementById("people-list");
    clear("people-list");
    var map = {};
    ((state && state.decisions) || []).forEach(function (decision) {
      var name = personLabel(decision.speaker);
      if (!name) return;
      if (!map[name]) map[name] = { name: name, rooms: [], count: 0, last: "" };
      map[name].count += 1;
      var room = roomLabel((((state && state.rooms) || []).filter(function (item) { return item.id === decision.roomId; })[0]) || {}, decision);
      if (room && map[name].rooms.indexOf(room) === -1) map[name].rooms.push(room);
      if (decision.spokenAt && decision.spokenAt > map[name].last) map[name].last = decision.spokenAt;
    });
    var rows = Object.keys(map).map(function (key) { return map[key]; });
    var foot = document.getElementById("people-foot");
    var count = document.getElementById("people-count");
    if (!rows.length) {
      if (foot) foot.hidden = true;
      return;
    }
    var head = document.createElement("div");
    head.className = "explorer-head people-head";
    ["name", "rooms", "count", "heard", "action"].forEach(function (key, index) {
      var cell = document.createElement("span");
      cell.dataset.col = key;
      cell.textContent = peopleColumns[index] || "";
      head.append(cell);
    });
    list.append(head);
    rows.forEach(function (person) {
      var row = document.createElement("div");
      row.className = "people-row";
      var name = document.createElement("span");
      name.className = "person";
      name.dataset.col = "name";
      name.append(face(person.name));
      var label = document.createElement("span");
      label.textContent = person.name;
      name.append(label);
      var roomsCell = document.createElement("span");
      roomsCell.className = "room-chips";
      roomsCell.dataset.col = "rooms";
      if (!person.rooms.length) {
        var none = document.createElement("span");
        none.className = "mini-chip";
        none.textContent = "Room";
        roomsCell.append(none);
      }
      person.rooms.forEach(function (room, index) {
        var chip = document.createElement("span");
        chip.className = "mini-chip" + (index === 1 ? " chip-second" : index > 1 ? " chip-rest" : "");
        chip.textContent = room;
        chip.title = room;
        chip.setAttribute("data-full", room);
        roomsCell.append(chip);
      });
      if (person.rooms.length > 1) {
        var narrowMore = document.createElement("span");
        narrowMore.className = "mini-chip more-narrow";
        narrowMore.textContent = "+" + (person.rooms.length - 1);
        narrowMore.title = person.rooms.slice(1).join(", ");
        roomsCell.append(narrowMore);
      }
      if (person.rooms.length > 2) {
        var wideMore = document.createElement("span");
        wideMore.className = "mini-chip more-wide";
        wideMore.textContent = "+" + (person.rooms.length - 2);
        wideMore.title = person.rooms.slice(2).join(", ");
        roomsCell.append(wideMore);
      }
      var decisions = document.createElement("span");
      decisions.className = "num";
      decisions.dataset.col = "count";
      var countText = person.count === 1 ? "1 decision" : (person.count + " decisions");
      decisions.textContent = countText;
      var heard = document.createElement("span");
      heard.className = "heard";
      heard.dataset.col = "heard";
      var heardText = relativeWhen(person.last) || whenLabel(person.last) || "";
      heard.textContent = heardText;
      var view = document.createElement("span");
      view.className = "row-open";
      view.dataset.col = "action";
      view.setAttribute("aria-label", "View");
    view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
      row.append(name, roomsCell, decisions, heard, view);
      list.append(row);
    });
    if (foot) foot.hidden = true;
    fitChips();
  }

  function fitChips() {
    var chips = document.querySelectorAll(".room-chips .mini-chip");
    Array.prototype.forEach.call(chips, function (chip) {
      if (chip.className.indexOf("more-") !== -1) return;
      var full = chip.getAttribute("data-full") || chip.textContent;
      chip.setAttribute("data-full", full);
      chip.textContent = full;
      if (!chip.clientWidth || chip.scrollWidth <= chip.clientWidth) return;
      var words = full.split(" ");
      var kept = "";
      var i;
      for (i = 0; i < words.length; i += 1) {
        var next = kept ? (kept + " " + words[i]) : words[i];
        chip.textContent = next + "…";
        if (chip.scrollWidth > chip.clientWidth) {
          chip.textContent = kept ? (kept + "…") : (words[0].charAt(0) + "…");
          while (chip.textContent.length > 2 && chip.scrollWidth > chip.clientWidth) {
            chip.textContent = chip.textContent.slice(0, -2) + "…";
          }
          return;
        }
        kept = next;
      }
    });
  }

  function addLine(id, title, body, onPick) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    var heading = document.createElement("strong");
    heading.textContent = title;
    var line = document.createElement("p");
    line.textContent = body;
    card.append(heading, line);
    if (onPick) card.addEventListener("click", onPick);
    document.getElementById(id).append(card);
  }

  function addCount(box, label, number, line, onPick, attention) {
    var cell = onPick ? document.createElement("button") : document.createElement("span");
    if (onPick) cell.type = "button";
    cell.className = attention === "danger" ? "count danger" : attention ? "count attention" : "count";
    var name = document.createElement("span");
    name.textContent = label;
    var value = document.createElement("strong");
    value.textContent = String(number || 0);
    cell.append(name, value);
    if (line) {
      var note = document.createElement("span");
      note.className = "count-note";
      note.textContent = line;
      cell.append(note);
    }
    if (onPick) cell.addEventListener("click", onPick);
    box.append(cell);
  }

  function openWaitingList() {
    historyScope = "you";
    historyKind = "all";
    setHistoryPressed();
    showSection("history");
    paintHistory();
  }

  function paintCounts() {
    var box = document.getElementById("counts");
    clear("counts");
    var counts = (state && state.counts) || {};
    addCount(box, "Decisions", counts.kept || 0, "Sentences kept in this workspace.", null, false);
    addCount(box, "Actions", counts.actionsToday || 0, "Changes that ran today.", null, false);
    if (counts.failed) {
      var failedNote = counts.failed === 1 ? "1 change did not go through." : (counts.failed + " changes did not go through.");
      addCount(box, "Failed", counts.failed, failedNote, null, "danger");
    }
    if (counts.sent) addCount(box, "Sent", counts.sent, "The tool accepted the change.", null, false);
  }

  function attentionStamp(value) {
    var at = Date.parse(value || "");
    return isNaN(at) ? 0 : at;
  }

  function paintAttention() {
    var section = document.getElementById("needs-attention");
    var list = document.getElementById("attention-list");
    if (!section || !list) return;
    list.replaceChildren();
    var items = [];
    ((state && state.decisions) || []).forEach(function (decision) {
      if (!decision || decision.status !== "clashing") return;
      items.push({
        kind: "clash",
        text: decision.text || "A decision clashes.",
        href: decision.roomId ? ("/console/rooms/" + encodeURIComponent(decision.roomId)) : "/console/decisions",
        roomId: decision.roomId || "",
        at: attentionStamp(decision.spokenAt)
      });
    });
    ((state && state.activity) || []).forEach(function (row) {
      if (!row || row.kind !== "failure" || row.outcome !== "failed" || row.resolved) return;
      var origin = row.origin || {};
      items.push({
        kind: "failed",
        text: row.sentence || "A change did not go through.",
        href: "/console/history#activity-" + encodeURIComponent(row.id || ""),
        activityId: row.id || "",
        roomId: origin.roomId || "",
        retryable: row.retryable === true,
        at: attentionStamp(row.ts)
      });
    });
    items.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "clash" ? -1 : 1;
      return b.at - a.at;
    });
    items = items.slice(0, 5);
    var quiet = !state || state.reading === true || state.read === "failed" || sectionName !== "home";
    section.hidden = quiet || items.length === 0;
    items.forEach(function (item) {
      var wrap = document.createElement("div");
      wrap.className = "attention-item";
      var link = document.createElement("a");
      link.className = "attention-row";
      link.href = item.href;
      link.title = item.text;
      var badge = document.createElement("span");
      badge.className = item.kind === "failed" ? "badge attention-failed" : "badge warn";
      badge.textContent = item.kind === "failed" ? "Failed" : "Clashing";
      var label = document.createElement("span");
      label.textContent = item.text;
      link.append(badge, label);
      link.addEventListener("click", function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        if (item.kind === "clash" && item.roomId) {
          openFile(item.roomId);
          return;
        }
        if (!item.activityId) return;
        showSection("history");
        var target = "activity-" + item.activityId;
        if (window.history && window.history.replaceState) {
          history.replaceState({ section: "history" }, "", "/console/history#" + target);
        }
        var node = document.getElementById(target);
        if (node && node.scrollIntoView) node.scrollIntoView({ block: "center" });
      });
      wrap.append(link);
      if (item.kind === "failed" && (item.roomId || item.retryable)) {
        var actions = document.createElement("span");
        actions.className = "attention-actions";
        if (item.roomId) {
          var roomLink = document.createElement("a");
          roomLink.className = "attention-room";
          roomLink.href = "/console/rooms/" + encodeURIComponent(item.roomId);
          roomLink.textContent = "Room";
          roomLink.addEventListener("click", function (event) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            openFile(item.roomId);
          });
          actions.append(roomLink);
        }
        if (item.retryable && item.activityId) {
          var retry = document.createElement("button");
          retry.type = "button";
          retry.className = "attention-retry";
          retry.textContent = "Retry";
          retry.addEventListener("click", function () { postActivity("retry", item.activityId, retry); });
          actions.append(retry);
        }
        wrap.append(actions);
      }
      list.append(wrap);
    });
  }

  function syncHistoryKinds() {
    if (historyKind !== "all" && historyKind !== "request" && historyKind !== "action" && historyKind !== "failure") historyKind = "all";
  }

  function setHistoryPressed() {
    syncHistoryKinds();
    document.querySelectorAll("[data-scope]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-scope") === historyScope ? "true" : "false");
    });
    document.querySelectorAll("[data-kind]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-kind") === historyKind ? "true" : "false");
    });
  }

  function paintHistory() {
    setHistoryPressed();
    clear("history-list");
    var roomPick = document.getElementById("history-room");
    if (roomPick) {
      var chosen = roomPick.value;
      roomPick.replaceChildren();
      var any = document.createElement("option");
      any.value = "";
      any.textContent = "All rooms";
      roomPick.append(any);
      ((state && state.rooms) || []).forEach(function (room) {
        var option = document.createElement("option");
        option.value = room.id;
        option.textContent = roomName(room) || room.id;
        roomPick.append(option);
      });
      if (chosen) roomPick.value = chosen;
    }
    var query = ((document.getElementById("history-search") || {}).value || "").trim().toLowerCase();
    var roomId = roomPick ? roomPick.value : "";
    var groups = selectActivity((state && state.activity) || [], {
      kind: historyKind,
      query: query,
      roomId: roomId,
      actor: historyScope === "you" ? member() : ""
    });
    var filtered = !!(query || roomId || (historyKind && historyKind !== "all") || historyScope === "you");
    paintActivity(document.getElementById("history-list"), [], { groups: groups, showRoom: true, filtered: filtered });
    var countRows = groups.reduce(function (sum, group) { return sum + group.rows.length; }, 0);
    var empty = document.getElementById("history-empty");
    if (empty) empty.hidden = countRows > 0;
    if (empty && filtered && !countRows) {
      var historyLine = document.getElementById("history-line");
      if (historyLine) historyLine.textContent = "No activity matches.";
    }
    var table = document.getElementById("history-table");
    if (table) table.hidden = countRows === 0;
    var historyCount = document.getElementById("history-count");
    var historyFoot = document.getElementById("history-foot");
    if (historyFoot) historyFoot.hidden = countRows === 0;
    if (historyCount && groups.length) historyCount.textContent = "1\u2013" + groups.length + " of " + groups.length;
    return;
    var rows = [];
    var decisions = (state && state.decisions) || [];
    var waitingRows = (state && state.waiting) || [];
    var showQuestions = historyKind === "all" || historyKind === "question";
    var showActions = historyKind === "all" || historyKind === "action";
    if (historyScope === "group" && showQuestions) {
      decisions.forEach(function (decision) {
        rows.push({
          title: decision.text,
          body: historyBody(decision),
          decision: decision
        });
      });
    }
    if (historyScope === "you" && showActions && member()) {
      waitingRows.forEach(function (action) {
        rows.push({
          title: action.statement || "A change is waiting.",
          body: (action.tool || "This change") + " is waiting for a confirm.",
          roomId: action.roomId
        });
      });
    }
    var showOther = historyKind === "all" || historyKind === "other";
    if (historyScope === "group" && showOther) {
      ((state && state.access) || []).forEach(function (row) {
        rows.push({
          title: (row.speaker || "Someone") + " asked.",
          body: "No sentence is shown.",
          roomId: row.roomId
        });
      });
    }
    var kinds = document.querySelector('#history [aria-label="Kind of record"]');
    if (kinds) kinds.hidden = rows.length === 0;
    var empty = document.getElementById("history-empty");
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      var historyLine = document.getElementById("history-line");
      var historyWords = "No company history yet. Questions and decisions from a room show up here.";
      if (historyScope === "you" && !member()) historyWords = "Sign-in is not set up, so this list has no account.";
      else if (historyScope === "you") historyWords = "You lists changes waiting on you. Nothing is waiting.";
      else if (historyKind === "other") historyWords = "Nothing else is in this list.";
      else if (document.getElementById("meet-block") && document.getElementById("slack-block")) historyWords = "No shared history yet. See Setup for whether a room is in use.";
      if (historyLine) historyLine.textContent = historyWords;
    }
    var historyNext = document.getElementById("history-next");
    if (historyNext) {
      var needsName = historyScope === "you" && !member();
      var doorsBlocked = !!(document.getElementById("meet-block") && document.getElementById("slack-block"));
      var offerRoom = workspaceKind !== "personal" && (doorsBlocked || !needsName);
      historyNext.hidden = rows.length > 0 || (!needsName && !offerRoom);
      if (needsName && rows.length === 0) {
        historyNext.hidden = true;
      } else if (doorsBlocked && rows.length === 0) {
        historyNext.textContent = "See Setup";
        historyNext.classList.remove("primary");
        historyNext.setAttribute("data-act", "status");
      } else if (needsName) {
        historyNext.hidden = true;
      } else {
        historyNext.textContent = "New room";
        historyNext.setAttribute("data-act", "room");
      }
    }
    syncNameCue();
    var table = document.getElementById("history-table");
    if (table) table.hidden = rows.length === 0;
    rows.forEach(function (row) {
      var kind = row.decision ? "Decision" : (row.body && row.body.indexOf("waiting") !== -1 ? "Waiting" : "Ask");
      var when = row.decision ? (relativeWhen(row.decision.spokenAt) || whenLabel(row.decision.spokenAt)) : "";
      addTableRow("history-list", [row.title, kind, when], function () {
        if (row.decision) openDecision(row.decision);
        else if (row.roomId) openFile(row.roomId);
      });
    });
    var historyFoot = document.getElementById("history-foot");
    var historyCount = document.getElementById("history-count");
    if (historyFoot) historyFoot.hidden = rows.length === 0;
    if (historyCount && rows.length) historyCount.textContent = "1\u2013" + rows.length + " of " + rows.length;
  }

  function addTableRow(listId, cells, onPick) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "room table-row";
    cells.forEach(function (value, index) {
      var cell = document.createElement("span");
      if (index === 0) {
        cell.className = "ex-room";
        var strong = document.createElement("strong");
        strong.textContent = value || "";
        cell.append(strong);
      } else {
        cell.className = "meta";
        cell.textContent = value || "";
      }
      row.append(cell);
    });
    var view = document.createElement("span");
    view.className = "row-view";
    view.setAttribute("aria-label", "View");
    view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    row.append(view);
    if (onPick) row.addEventListener("click", onPick);
    var list = document.getElementById(listId);
    if (list) list.append(row);
  }

  function looksLikeRawRoomId(value) {
    var s = String(value || "").replace(/^#/, "").trim();
    if (!s) return true;
    // Slack channel ids (C…) and bare UUIDs are not human meeting names.
    if (/^[CGD][A-Z0-9]{8,}$/i.test(s)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
    return false;
  }

  function paintSuggestions() {
    var box = document.getElementById("chat-suggests");
    if (!box) return;
    box.replaceChildren();
    var prompts = [];
    var rooms = ((state && state.rooms) || []).filter(function (room) {
      return decisionsFor(room.id).length > 0;
    });
    rooms.slice(0, 2).forEach(function (room) {
      var title = roomIdentity(room, decisionsFor(room.id)).title || "";
      var shortName = String(title).split(":")[0].trim() || title;
      if (looksLikeRawRoomId(shortName)) return;
      prompts.push("What did " + shortName + " decide?");
    });
    ["What did the last meeting decide?", "Which decisions are clashing?", "What changed since yesterday?", "What is still open?"].forEach(function (prompt) {
      if (prompts.length < 4 && prompts.indexOf(prompt) === -1) prompts.push(prompt);
    });
    prompts.slice(0, 4).forEach(function (prompt) {
      var example = document.createElement("button");
      example.type = "button";
      example.className = "suggest-chip";
      example.setAttribute("data-suggest", prompt);
      example.textContent = prompt;
      box.append(example);
    });
  }

  function paint(next) {
    state = next;
    text("status", "");
    if (consoleSpaces && consoleSpaces.oauth) {
      workspaceKind = consoleSpaces.activeKind === "personal" ? "personal" : "company";
    } else if (next.workspace === "personal" || next.workspace === "company") {
      workspaceKind = next.workspace;
    }
    paintChip();
    showHomeSkeleton(next.reading === true);
    document.body.classList.toggle("read-failed", next.read === "failed");
    document.body.classList.toggle("is-reading", next.reading === true);
    if (next.reading) {
      if (!routed) {
        routed = true;
        routeQuiet = true;
        var earlyRoom = roomFromPath(location.pathname);
        if (earlyRoom) fileRoom = earlyRoom;
        showSection(earlyRoom ? "file" : sectionFromPath(location.pathname));
      }
      if (onboard) onboard.hidden = true;
      if (home) home.hidden = false;
      lockNav(false);
      if (!readingTimer) readingTimer = setTimeout(function () { readingTimer = null; load(); }, 1500);
      return;
    }
    readingTries = 0;
    if (readingTimer) {
      clearTimeout(readingTimer);
      readingTimer = null;
    }
    syncSkeleton(false);
    clearTimeout(slowTimer);
    slowTimer = null;
    var errorBox = document.getElementById("read-error");
    if (errorBox) errorBox.classList.remove("still-loading", "state-info");
    // Soft-retry a failed account read quietly - only show the error after retries exhaust.
    if (next.read === "failed" && readingTries < 3) {
      readingTries += 1;
      showRetry(false);
      showHomeSkeleton(true);
      if (!readingTimer) readingTimer = setTimeout(function () { readingTimer = null; load(); }, 2000);
    } else {
      showRetry(next.read === "failed", homeErrorCopy(next.message));
    }
    fillHearing(next.hearing);
    var loaded = next.companyLoaded === true;
    document.getElementById("onboard-missing").hidden = loaded;
    var reading = document.getElementById("onboard-reading");
    if (reading) reading.hidden = true;
    document.getElementById("onboard-ready").hidden = !loaded;
    syncJoinReady();
    if (!loaded && !operatorLeft) {
      home.hidden = true;
      onboard.hidden = false;
      lockNav(true);
      text("crumb-current", "Rooms");
      syncNotices();
      return;
    }
    lockNav(false);
    if (onboard) onboard.hidden = true;
    if (home) home.hidden = false;
    var doors = next.doors || {};
    var prefs = next.preferences || {};
    var calendarMode = prefs.calendar === "do" ? "Do" : "Ask";
    var linearMode = prefs.linear === "do" ? "Do" : "Ask";
    var slackMode = prefs.slack === "do" ? "Do" : "Ask";
    paintConn("cal-conn", !!doors.calendar);
    paintConn("lin-conn", !!doors.linear);
    paintConn("slack-conn", next.slack === "ready");
    var slackNote = document.getElementById("slack-note");
    if (slackNote) slackNote.textContent = next.slack === "ready"
      ? "Sederunt answers in a channel it has already joined."
      : "Slack is not set up on this server yet. Calendar, rooms, and chat still work.";
    text("cal-line", calendarMode === "Ask" ? "Calendar waits before a change." : "Calendar runs automatically.");
    text("lin-line", linearMode === "Ask" ? "Linear waits before a change." : "Linear runs automatically.");
    text("slack-line", next.slack === "ready"
      ? (slackMode === "Ask" ? "Slack waits before a change." : "Slack runs automatically.")
      : "Chat and rooms work without Slack. Connect it when a bot token is ready.");
    text("prefs", "");
    var calAsk = document.getElementById("cal-ask");
    var linAsk = document.getElementById("lin-ask");
    var slackAsk = document.getElementById("slack-ask");
    if (calAsk) calAsk.checked = calendarMode !== "Ask";
    if (linAsk) linAsk.checked = linearMode !== "Ask";
    if (slackAsk) slackAsk.checked = slackMode !== "Ask";
    syncAskState(calAsk);
    syncAskState(linAsk);
    syncAskState(slackAsk);
    var calRow = document.getElementById("cal-ask-row");
    var linRow = document.getElementById("lin-ask-row");
    var slackRow = document.getElementById("slack-ask-row");
    if (calRow) calRow.hidden = false;
    if (linRow) linRow.hidden = false;
    if (slackRow) slackRow.hidden = false;
    var kicker = document.querySelector(".ask-kicker");
    var askHelp = document.getElementById("ask-help");
    var askBlock = document.getElementById("ask-block");
    if (askBlock) askBlock.hidden = false;
    if (kicker) kicker.hidden = false;
    if (askHelp) askHelp.textContent = "On means a change runs as soon as it is asked.";
    var note = next.message || "";
    if (!note && !member() && !(next.rooms || []).length && !(next.decisions || []).length) note = "Sign-in is not set up.";
    text("read-note", note);
    syncHomeChrome();
    paintRooms();
    paintMeetings();
    paintCounts();
    syncCalendarAsk();
    paintAttention();
    paintHistory();
    clear("people-list");
    paintRecord();
    syncNotices();
    paintPeople(next);
    fitChips();
    var peopleCount = document.querySelectorAll("#people-list .people-row").length;
    document.getElementById("people-empty").hidden = peopleCount > 0;
    var peopleTable = document.getElementById("people-table");
    if (peopleTable) peopleTable.hidden = peopleCount === 0;
    var peopleNext = document.getElementById("people-next");
    if (peopleNext) {
      peopleNext.hidden = peopleCount > 0 || !(document.getElementById("meet-block") && document.getElementById("slack-block"));
      if (!peopleNext.hidden) {
        peopleNext.textContent = "See Setup";
        peopleNext.classList.remove("primary");
        peopleNext.setAttribute("data-act", "status");
      }
    }
    var recordNext = document.getElementById("record-next");
    if (recordNext) recordNext.hidden = true;
    var recordBoard = document.querySelector(".record-board");
    var recordEmpty = document.getElementById("record-empty");
    var noKept = (next.decisions || []).length === 0;
    if (recordEmpty) {
      recordEmpty.hidden = !noKept;
      var emptyTitle = recordEmpty.querySelector(".empty-title");
      var emptyLine = recordEmpty.querySelector("p:last-child");
      if (next.read === "failed" && emptyTitle) emptyTitle.textContent = "Decisions are unavailable.";
      if (next.read === "failed" && emptyLine) emptyLine.textContent = "Home could not be loaded.";
    }
    if (recordBoard) recordBoard.hidden = noKept;
    var recordFoot = document.getElementById("record-foot");
    if (recordFoot) recordFoot.hidden = noKept;
    var chatNext = document.getElementById("chat-next");
    if (chatNext) chatNext.hidden = true;
    var chatForm = document.getElementById("chat-form");
    var chatEmpty = document.getElementById("chat-empty");
    if (chatEmpty) chatEmpty.hidden = document.querySelector("#chat-log .chat-turn") != null;
    paintSuggestions();
    if (chatForm) chatForm.hidden = false;
    if (typeof paintAskQuota === "function") paintAskQuota();
    syncRoomLabels();
    if (fileRoom) renderFile();
    if (!routed) {
      routed = true;
      routeQuiet = true;
      showSection(sectionFromPath(location.pathname));
    }
  }

  function setViewTitle(label) {
    var shown = label || "Sederunt";
    var heading = document.getElementById("view-title");
    if (heading) heading.textContent = shown;
    if (shown.length > 48) shown = shown.slice(0, 45).trim() + "...";
    document.title = shown + " · Sederunt";
  }

  function placeNotice() {
    var box = document.getElementById("read-error");
    if (!box) return;
    var head = document.getElementById("home-head");
    if (sectionName === "rooms") head = document.getElementById("rooms-head");
    else if (sectionName === "history") head = document.querySelector("#history .page-head");
    else if (sectionName === "record") head = document.querySelector("#record .page-head");
    else if (sectionName === "chat") head = document.querySelector("#chat .page-head");
    else if (sectionName === "people") head = document.querySelector("#people .page-head");
    else if (sectionName === "files") head = document.querySelector("#files .page-head");
    else if (sectionName === "account") head = document.querySelector("#account-page .page-head");
    else if (sectionName === "connectors") head = document.querySelector("#overview .page-head");
    else if (sectionName === "mcp") head = document.getElementById("mcp-head");
    else if (sectionName === "file") head = document.getElementById("file-head");
    if (head && head.parentNode) head.parentNode.insertBefore(box, head.nextSibling);
  }

  function sectionLabel(name) {
    if (name === "rooms") return "Rooms";
    if (name === "history") return "History";
    if (name === "chat") return "Ask AI";
    if (name === "record") return "Decisions";
    if (name === "people") return "People";
    if (name === "files") return "Files";
    if (name === "account") return "Account";
    if (name === "connectors") return "Setup";
    if (name === "mcp") return "Connectors";
    if (name === "missing") return "Not found";
    return "Home";
  }

  function placeNewRoom() {
    var button = document.getElementById("new-room");
    if (!button) return;
    var hostId = sectionName === "rooms" ? "rooms-head" : "home-head";
    var host = document.querySelector("#" + hostId + " .page-actions");
    if (host && button.parentNode !== host) host.appendChild(button);
  }

  function syncNewRoom() {
    var button = document.getElementById("new-room");
    if (!button) return;
    var onList = sectionName === "home" || sectionName === "rooms";
    button.hidden = workspaceKind === "personal" || !onList || (state && state.read === "failed") || emptyHomeNow();
    button.disabled = !state || state.reading === true || (state && state.read === "failed");
    placeNewRoom();
  }

  function stripEdge(value) {
    var text = String(value || "");
    while (text.charAt(0) === "." || text.charAt(0) === " ") text = text.slice(1);
    while (text.length && (text.charAt(text.length - 1) === "." || text.charAt(text.length - 1) === " ")) text = text.slice(0, -1);
    return text;
  }

  function homeErrorCopy(reason) {
    var head = "Home could not be loaded.";
    var extra = String(reason || "").trim();
    while (extra.indexOf("  ") !== -1) extra = extra.split("  ").join(" ");
    var lead = "home could not be loaded";
    if (extra.toLowerCase().indexOf(lead) === 0) extra = extra.slice(lead.length);
    extra = stripEdge(extra);
    ["try again", "read the account again", "read it again"].forEach(function (tail) {
      if (extra.toLowerCase().slice(-tail.length) === tail) extra = extra.slice(0, extra.length - tail.length);
    });
    extra = stripEdge(extra);
    if (!extra) return head;
    return head + " " + extra + ".";
  }

  function showRetry(on, copy) {
    var box = document.getElementById("read-error");
    var button = document.getElementById("read-again");
    var line = document.getElementById("read-error-copy");
    if (box) {
      box.hidden = !on;
      if (!on) box.classList.remove("still-loading", "state-info");
    }
    if (button) button.hidden = !on;
    if (on && copy && line) line.textContent = copy;
    if (button && on) {
      button.disabled = false;
      if (copy && String(copy).indexOf("Home could not be loaded") === 0) button.textContent = "Try again";
      else if (copy === "Still loading…") button.textContent = "Retry";
    }
  }

  function toast(message) {
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 5200);
  }

  function homeListRoute() {
    return sectionName === "home" || sectionName === "rooms";
  }

  function showHomeSkeleton(on) {
    var node = document.getElementById("loading");
    var show = Boolean(on && homeListRoute());
    if (node) node.hidden = !show;
    document.body.classList.toggle("is-reading", show);
  }

  function syncSkeleton(reading) {
    var sk = document.getElementById("onboard-skeleton");
    if (sk) sk.hidden = !reading;
    var still = document.getElementById("onboard-reading");
    if (still && reading) still.hidden = false;
  }

  function leaveOnboard() {
    operatorLeft = true;
    if (onboard) onboard.hidden = true;
    if (home) home.hidden = false;
    lockNav(false);
    document.body.classList.remove("nav-open");
  }

  function lockNav(locked) {
    document.querySelectorAll(".rail [data-show]").forEach(function (button) {
      if (locked) {
        button.setAttribute("aria-disabled", "true");
        button.removeAttribute("aria-current");
      } else {
        button.removeAttribute("aria-disabled");
      }
    });
    var setup = document.getElementById("show-connectors");
    if (setup) setup.removeAttribute("aria-disabled");
  }

  function roomQueryString() {
    var params = new URLSearchParams();
    if (roomFilter && roomFilter !== "all") params.set("filter", roomFilter);
    if (roomQuery) params.set("q", roomQuery);
    var text = params.toString();
    return text ? ("?" + text) : "";
  }

  function pathFor(name) {
    var query = roomQueryString();
    var path = "/console";
    if (name === "file" && fileRoom) path = "/console/rooms/" + encodeURIComponent(fileRoom) + query;
    else if (name === "rooms") path = "/console/rooms" + query;
    else if (name === "history") path = "/console/history";
    else if (name === "record") path = "/console/decisions";
    else if (name === "chat") path = "/console/chat";
    else if (name === "people") path = "/console/people";
    else if (name === "files") path = "/console/files";
    else if (name === "account") path = "/console/account";
    else if (name === "connectors") path = "/console/setup";
    else if (name === "mcp") path = "/console/connectors";
    else if (name === "missing") return location.pathname;
    return withPersona(path);
  }

  function withPersona(path) {
    var as = new URLSearchParams(location.search).get("as");
    if (!as || path.indexOf("as=") !== -1) return path;
    return path + (path.indexOf("?") === -1 ? "?" : "&") + "as=" + encodeURIComponent(as);
  }

  function roomFromPath(path) {
    var match = String(path || "").match(/^\\/console\\/rooms\\/([^/?#]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (error) { return match[1]; }
  }

  function sectionFromPath(path) {
    if (roomFromPath(path)) return "file";
    if (path === "/console/rooms") return "rooms";
    if (path === "/console/history") return "history";
    if (path === "/console/decisions") return "record";
    if (path === "/console/chat" || path === "/console/ask") return "chat";
    if (path === "/console/people") return "people";
    if (path === "/console/files") return "files";
    if (path === "/console/account") return "account";
    if (path === "/console/status" || path === "/console/setup") return "connectors";
    if (path === "/console/connectors") return "mcp";
    if (path === "/console" || path === "/console/") return "home";
    return "missing";
  }

  function showSection(name) {
    var file = document.getElementById("file-dialog");
    if (name !== "file") {
      if (file) file.hidden = true;
      if (sectionName === "file") {
        fileRoom = "";
        fileWait = null;
      }
    }
    sectionName = name;
    if (name !== "home" && name !== "rooms") showHomeSkeleton(false);
    var homeTitle = document.getElementById("home-title");
    if (homeTitle) homeTitle.hidden = name !== "home";
    var panels = ["rooms", "history", "chat", "record", "people", "files", "account-page", "page-missing", "mcp-page"];
    var onFile = name === "file";
    document.getElementById("overview").hidden = name !== "connectors";
    var crumbHome = document.getElementById("crumb-home");
    var crumbSep = document.getElementById("crumb-sep");
    var roomsCrumb = document.getElementById("crumb-rooms");
    var sep2 = document.getElementById("crumb-sep2");
    var onHome = name === "home";
    if (crumbHome) crumbHome.hidden = onHome;
    if (crumbSep) crumbSep.hidden = onHome;
    if (roomsCrumb) roomsCrumb.hidden = !onFile;
    if (sep2) sep2.hidden = !onFile;
    var currentCrumb = document.getElementById("crumb-current");
    if (onFile) {
      if (currentCrumb) {
        currentCrumb.textContent = "";
        currentCrumb.hidden = true;
      }
      if (sep2) sep2.hidden = true;
      if (file) file.hidden = false;
    } else {
      if (currentCrumb) currentCrumb.hidden = false;
      text("crumb-current", sectionLabel(name));
    }
    panels.forEach(function (id) {
      var key = id === "account-page" ? "account" : id === "page-missing" ? "missing" : id === "mcp-page" ? "mcp" : id;
      var node = document.getElementById(id);
      if (!node) return;
      node.hidden = onFile ? true : (name === "home" ? id !== "rooms" : key !== name);
    });
    var current = onFile ? "rooms" : name;
    document.querySelectorAll(".rail [data-show]").forEach(function (button) {
      if (button.getAttribute("data-show") === current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    var setup = document.getElementById("show-connectors");
    if (name === "connectors") setup.setAttribute("aria-current", "page");
    else setup.removeAttribute("aria-current");
    syncNewRoom();
    syncHomeChrome();
    syncNotices();
    syncNameCue();
    revealRail(onFile ? "rooms" : name);
    var roomsHead = document.getElementById("rooms-head");
    var roomTools = document.getElementById("room-toolbar");
    if (roomsHead) roomsHead.hidden = name !== "rooms";
    var quietHome = !state || state.read === "failed" || state.read === "empty" || state.read === "reading" || state.reading || (!((state && state.rooms) || []).length && !((state && state.decisions) || []).length);
    if (roomTools) roomTools.hidden = quietHome || (name !== "rooms" && name !== "home");
    var homeHead = document.getElementById("home-head");
    if (homeHead) homeHead.hidden = name !== "home";
    var readError = document.getElementById("read-error");
    if (readError) {
      var showHomeError = (name === "home" || name === "rooms") && state && state.read === "failed";
      if (!showHomeError) readError.classList.remove("still-loading", "state-info");
      readError.hidden = !showHomeError;
      var readAgain = document.getElementById("read-again");
      if (readAgain) readAgain.hidden = !showHomeError;
    }
    var homeTools = document.querySelector(".home-tools");
    var homeStats = document.getElementById("home-stats");
    if (homeTools) homeTools.hidden = name !== "home";
    if (homeStats && name !== "home") homeStats.hidden = true;
    paintAttention();
    paintMeetings();
    var label = onFile ? ((document.getElementById("file-title") || {}).textContent || "Room") : sectionLabel(name);
    setViewTitle(label);
    placeNotice();
    var pageName = document.getElementById("account-page-name");
    var shownName = member() || "Account";
    if (accountProfile && accountProfile.oauth && accountProfile.name) shownName = accountProfile.name;
    if (pageName) pageName.textContent = shownName;
    var pageRole = document.getElementById("account-page-role");
    var roleLine = (document.getElementById("account-line") || {}).textContent || "";
    if (accountProfile && accountProfile.oauth && accountProfile.spaceRole) roleLine = accountProfile.spaceRole;
    if (pageRole) pageRole.textContent = roleLine;
    text("account-detail-role", roleLine);
    var detailNameNode = document.getElementById("account-detail-name");
    if (detailNameNode && shownName && shownName !== "Account") detailNameNode.textContent = shownName;
    var avatar = document.getElementById("account-page-avatar");
    if (avatar && !avatar.querySelector("img")) avatar.textContent = initials(shownName);
    var workspaceLabel = document.getElementById("account-detail-workspace");
    if (workspaceLabel) {
      if (accountProfile && accountProfile.oauth && accountProfile.spaceName) workspaceLabel.textContent = accountProfile.spaceName;
      else workspaceLabel.textContent = workspaceKind === "personal" ? "Personal" : "Company";
    }
    placeNewRoom();
    if (name === "files") loadFiles();
    if (name === "chat") loadAsks();
    if (!routeQuiet && window.history && window.history.pushState) {
      if (onFile && fileRoom) {
        var listPath = "/console/rooms" + roomQueryString();
        var detailPath = pathFor("file");
        if (location.pathname + location.search !== detailPath) {
          if (location.pathname !== "/console/rooms") history.pushState({ section: "rooms" }, "", listPath);
          history.pushState({ section: "file", room: fileRoom }, "", detailPath);
        }
      } else {
        var path = pathFor(name);
        if (location.pathname + location.search !== path) history.pushState({ section: name }, "", path);
      }
    }
    routeQuiet = false;
    closeNav();
    document.body.classList.toggle("room-open", name === "file");
    placeRoomChrome();
    syncCalendarAsk();
    if (name === "mcp") loadMcp();
  }

  function closeNav() {
    document.body.classList.remove("nav-open");
    var toggle = document.getElementById("rail-toggle");
    if (!toggle || !window.matchMedia("(max-width: 1100px)").matches) return;
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Open the menu");
  }

  function dialogOpen() {
    var ids = ["proof-dialog", "event-dialog", "profile-dialog", "decision-dialog", "create-dialog", "workspace-dialog", "space-dialog", "mcp-dialog", "mcp-manage-dialog", "mcp-token-dialog", "mcp-remove-dialog", "file-proof-dialog", "file-delete-dialog"];
    for (var i = 0; i < ids.length; i += 1) {
      var node = document.getElementById(ids[i]);
      if (node && !node.hidden) return true;
    }
    return false;
  }

  function syncPage() {
    document.body.classList.toggle("dialog-open", dialogOpen());
  }

  function openDialog(id) {
    opener = document.activeElement;
    var dialog = document.getElementById(id);
    dialog.hidden = false;
    var body = dialog.querySelector(".panel-body");
    if (body) body.scrollTop = 0;
    syncPage();
    var close = dialog.querySelector(".close");
    if (close) close.focus();
  }

  function closeDialog(id) {
    if (id === "event-dialog" && !eventForceClose) {
      if (eventSaving) return;
      if (eventDirty()) {
        var discardBox = document.getElementById("event-discard");
        if (discardBox) {
          discardBox.hidden = false;
          var keepEditing = document.getElementById("event-keep");
          if (keepEditing) keepEditing.focus();
        }
        return;
      }
    }
    var dialog = document.getElementById(id);
    if (!dialog || dialog.hidden) {
      if (id === "event-dialog") eventForceClose = false;
      return;
    }
    if (id === "file-dialog") {
      var proofOpen = document.getElementById("proof-dialog");
      if (proofOpen && !proofOpen.hidden) proofOpen.hidden = true;
      var decision = document.getElementById("decision-dialog");
      if (decision && !decision.hidden) closeDialog("decision-dialog");
      showSection(returnSection === "rooms" ? "rooms" : "home");
      syncPage();
      if (opener && opener.focus) opener.focus();
      return;
    }
    dialog.hidden = true;
    if (id === "event-dialog") {
      eventForceClose = false;
      eventLoadToken += 1;
      eventDraft = null;
      eventLoaded = false;
      eventSaving = false;
      eventSnapshot = "";
      var discardDone = document.getElementById("event-discard");
      if (discardDone) discardDone.hidden = true;
    }
    syncPage();
    if (opener && opener.focus) opener.focus();
  }

  function waitingFor(roomId) {
    return ((state && state.waiting) || []).filter(function (item) { return item.roomId === roomId; });
  }

  function roomOf(roomId) {
    var rooms = (state && state.rooms) || [];
    for (var i = 0; i < rooms.length; i += 1) {
      if (rooms[i].id === roomId) return rooms[i];
    }
    return null;
  }

  function voiceFor() {
    if (!fileRoom) return waitingVoice;
    var room = roomOf(fileRoom);
    var voice = room && room.voice;
    if (voice === "short" || voice === "plain" || voice === "formal") return voice;
    return "plain";
  }

  function clashOn() {
    if (!fileRoom) return waitingClash;
    var room = roomOf(fileRoom);
    return Boolean(room && room.raiseClash);
  }

  function voiceWord(voice) {
    if (voice === "short") return "Short";
    if (voice === "formal") return "Formal";
    return "Plain";
  }

  function renderLead() {
    var rows = fileRoom ? decisionsFor(fileRoom) : [];
    var lead = rows.length ? rows[rows.length - 1] : null;
    var leadLine = document.getElementById("file-lead");
    if (leadLine) leadLine.hidden = true;
    var status = document.getElementById("file-lead-status");
    if (status) {
      status.textContent = "";
      status.hidden = true;
    }
    paintProofChip(lead);
  }

  function fileMark(name) {
    var dot = name.lastIndexOf(".");
    var ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
    if (ext.length > 4) ext = ext.slice(0, 4);
    return ext;
  }

  function renderFiles() {
    var names = [];
    (fileRoom ? decisionsFor(fileRoom) : []).forEach(function (decision) {
      (decision.fileNames || []).forEach(function (file) {
        if (file.name && names.indexOf(file.name) === -1) names.push(file.name);
      });
    });
    var filesBlock = document.getElementById("files-block");
    if (filesBlock) filesBlock.hidden = false;
    var filesEmpty = document.getElementById("files-empty");
    if (filesEmpty) filesEmpty.hidden = names.length > 0;
    document.getElementById("files-heading").hidden = names.length === 0;
    clear("file-files");
    names.forEach(function (name) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      var mark = document.createElement("span");
      mark.className = "file-mark";
      mark.textContent = fileMark(name);
      var label = document.createElement("span");
      label.textContent = name;
      tile.append(mark, label);
      tile.addEventListener("click", function () { downloadNamed(name, tile); });
      document.getElementById("file-files").append(tile);
    });
  }

  function downloadNamed(name, button) {
    button.disabled = true;
    fetch("/api/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, room: { id: fileRoom } })
    }).then(function (response) { return response.json(); }).then(function (result) {
      button.disabled = false;
      if (!result || result.allow === "missing-member") {
        text("file-action-note", "This server has no member configured.");
        return;
      }
      if (result.allow === "not-invited") {
        text("file-action-note", "You were not in this room.");
        return;
      }
      if (!result.bytes) {
        text("file-action-note", "This file has no bytes on this page.");
        return;
      }
      var blob = new Blob([result.bytes], { type: "application/octet-stream" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = result.name || name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      text("file-action-note", "");
    }).catch(function () {
      button.disabled = false;
      text("file-action-note", "The account could not be read. Read the account again.");
    });
  }

  function wrote(result) {
    if (!result) return false;
    var allow = result.allow || "";
    return allow === "read" || allow === "do" || allow === "confirmed";
  }

  function sendAction(kind, actionId, button) {
    if (!plainRoom(actionId)) {
      text("room-edit-note", "This change cannot be edited from here.");
      return;
    }
    button.disabled = true;
    var wasWaiting = waitingFor(fileRoom).some(function (item) { return item.id === actionId; });
    fetch("/api/typed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: kind + " " + actionId })
    }).then(function (response) { return response.json(); }).then(function (result) {
      return load().then(function () { return result; });
    }).then(function (result) {
      var note = "That change is still waiting.";
      var body = result && result.body ? String(result.body) : "";
      var stillWaiting = waitingFor(fileRoom).some(function (item) { return item.id === actionId; });
      var ticket = (body.match(/ROW-[0-9]+/) || [])[0];
      if (kind === "confirm" && wasWaiting && !stillWaiting) {
        var toolWord = /linear/i.test(body) ? "Linear" : /calendar/i.test(body) ? "Calendar" : "";
        note = ticket ? ("Filed as " + ticket + (toolWord ? " in " + toolWord : "") + ".") : "That change was confirmed.";
      } else if (kind === "dismiss" && wasWaiting && !stillWaiting) note = "That change was dismissed.";
      else if (body.indexOf("The edit did not happen.") !== -1) note = "The edit did not happen.";
      else if (result && result.allow === "missing-member") note = "This server has no member configured.";
      else if (result && result.allow === "not-invited") note = "You were not in this room.";
      else if (kind === "confirm" && result && result.allow === "confirmed") note = "That change was confirmed.";
      text("file-action-note", note);
      if (note && note !== "That change is still waiting.") toast(note);
    }).catch(function () {
      button.disabled = false;
      text("file-action-note", "The account could not be read. Read the account again.");
    });
  }

  function meetingWord(room) {
    if (!room) return { word: "No recording", badge: "badge" };
    if (room.live === true) return { word: "Live", badge: "badge live" };
    if (room.channel || /slack/i.test(String(room.platform || ""))) return { word: "Channel", badge: "badge" };
    var heard = room.id ? decisionsFor(room.id).length > 0 : false;
    if (heard || room.startedAt || room.recordingStart) return { word: "Ended", badge: "badge" };
    return { word: "No recording", badge: "badge" };
  }

  function failedActions(roomId) {
    return ((state && state.activity) || []).filter(function (row) {
      return row && row.kind === "failure" && row.outcome === "failed" && !row.resolved && (row.origin || {}).roomId === roomId;
    }).length;
  }

  function roomTone(roomId) {
    return meetingWord(roomOf(roomId));
  }

  function activityRows(roomId) {
    return ((state && state.activity) || []).filter(function (row) {
      if (!row) return false;
      if (!roomId) return true;
      var origin = row.origin || {};
      if (origin.roomId && origin.roomId === roomId) return true;
      var named = roomName(roomOf(roomId));
      return !!(named && origin.roomName && origin.roomName === named);
    });
  }


  function activityGlyph(kind) {
    if (kind === "failure") {
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="5.2"/><path d="M8 5.1v3.2M8 10.6v.4"/></svg>';
    }
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/></svg>';
  }

  function isSpaceCode(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11 || code === 160;
  }

  function collapseSpaces(value) {
    var text = String(value || "");
    var out = "";
    var pending = false;
    var i;
    for (i = 0; i < text.length; i += 1) {
      if (isSpaceCode(text.charCodeAt(i))) {
        if (out) pending = true;
      } else {
        if (pending) {
          out += " ";
          pending = false;
        }
        out += text.charAt(i);
      }
    }
    return out;
  }

  function proseEdges(value) {
    var text = String(value || "");
    var start = false;
    var end = false;
    var i;
    for (i = 0; i < text.length; i += 1) {
      if (!isSpaceCode(text.charCodeAt(i))) break;
      start = true;
    }
    for (i = text.length - 1; i >= 0; i -= 1) {
      if (!isSpaceCode(text.charCodeAt(i))) break;
      end = true;
    }
    return { start: start, end: end, text: collapseSpaces(text) };
  }

  function ensureWordSpace(parent) {
    if (!parent.childNodes.length) return;
    var last = parent.lastChild;
    var value = last && last.nodeType === 3 ? String(last.nodeValue || "") : "";
    if (value && isSpaceCode(value.charCodeAt(value.length - 1))) return;
    parent.append(document.createTextNode(" "));
  }

  function paintRich(parent, text, row) {
    var title = (row.target && row.target.title) || "";
    var id = (row.target && row.target.id) || "";
    var marks = [];
    var gap = false;
    if (title && text.indexOf(title) >= 0) marks.push({ at: text.indexOf(title), len: title.length, kind: "title" });
    if (id && text.indexOf(id) >= 0) marks.push({ at: text.indexOf(id), len: id.length, kind: "id" });
    marks.sort(function (a, b) { return a.at - b.at; });
    function place(node, leadingGap) {
      if (!node) return;
      if (gap || leadingGap) ensureWordSpace(parent);
      gap = false;
      parent.append(node);
    }
    function placeText(raw) {
      var piece = proseEdges(raw);
      if (!piece.text) {
        if (piece.start || piece.end) gap = true;
        return;
      }
      var span = document.createElement("span");
      span.className = "activity-prose";
      span.textContent = piece.text;
      place(span, piece.start);
      if (piece.end) gap = true;
    }
    var cursor = 0;
    marks.forEach(function (mark) {
      if (mark.at < cursor) return;
      if (mark.at > cursor) placeText(text.slice(cursor, mark.at));
      if (mark.kind === "title") {
        var named = document.createElement("span");
        named.className = "activity-prose";
        named.textContent = collapseSpaces(title);
        if (named.textContent) place(named, false);
      } else if (row.target && row.target.url) {
        var link = document.createElement("a");
        link.className = "entity-id";
        link.href = row.target.url;
        link.textContent = id;
        place(link, false);
      } else if (id) {
        var plain = document.createElement("span");
        plain.className = "entity-id";
        plain.textContent = id;
        place(plain, false);
      }
      cursor = mark.at + mark.len;
    });
    if (cursor < text.length) placeText(text.slice(cursor));
    return gap;
  }

  function postActivity(op, id, button) {
    if (button) button.disabled = true;
    fetch("/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: op, id: id })
    }).then(function (response) { return response.json(); }).then(function (result) {
        if (!result || !result.ok) {
        toast(result && result.reason === "stale"
          ? "Superseded by a newer change."
          : op === "undo" ? "That action cannot be undone." : "Retry did not run.");
        if (button) button.disabled = false;
        return;
      }
      toast(op === "undo" ? "Undone." : "Retried.");
      return load();
    }).catch(function () {
      toast("The account could not be read. Read the account again.");
      if (button) button.disabled = false;
    });
  }

  function undoReason(result) {
    var reason = result && result.reason;
    if (reason === "stale") return "Superseded by a newer change.";
    if (reason === "unsupported") return "That action cannot be undone.";
    if (reason === "partial") return "Part of the undo went through.";
    if (reason === "already") return "That action was already undone.";
    if (reason === "missing" || reason === "not-action") return "That action is no longer here.";
    if (reason === "origin") return "That undo was refused.";
    if (reason === "failed") return "The change did not go through.";
    return "That action cannot be undone.";
  }

  function confirmUndo(row, line, undo) {
    var calendarZone = document.body.getAttribute("data-calendar-zone") || "";
    var viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var prompt = undoPrompt(row, calendarZone, viewerZone);
    var saved = [];
    var index;
    for (index = 0; index < line.childNodes.length; index += 1) saved.push(line.childNodes[index]);
    var ask = document.createElement("div");
    ask.className = "undo-confirm";
    var question = document.createElement("p");
    question.textContent = prompt.ask;
    var actions = document.createElement("div");
    actions.className = "undo-actions";
    var go = document.createElement("button");
    go.type = "button";
    go.className = "primary";
    go.textContent = "Undo change";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    actions.append(go, cancel);
    ask.append(question, actions);
    function onKey(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      restore();
    }
    function restore() {
      document.removeEventListener("keydown", onKey, true);
      line.classList.remove("is-confirming");
      line.replaceChildren.apply(line, saved);
      if (undo && undo.focus) undo.focus();
    }
    function showReason(message) {
      go.disabled = false;
      cancel.disabled = false;
      var note = ask.querySelector(".undo-reason");
      if (!note) {
        note = document.createElement("p");
        note.className = "undo-reason";
        ask.append(note);
      }
      note.textContent = message;
    }
    document.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", restore);
    go.addEventListener("click", function () {
      go.disabled = true;
      cancel.disabled = true;
      fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "undo", id: row.id })
      }).then(function (response) { return response.json(); }).then(function (result) {
        if (!result || !result.ok) {
          showReason(undoReason(result));
          return;
        }
        document.removeEventListener("keydown", onKey, true);
        toast(prompt.done);
        return load();
      }).catch(function () {
        showReason("The account could not be read. Read the account again.");
      });
    });
    line.classList.add("is-confirming");
    line.replaceChildren(ask);
    setTimeout(function () { go.focus(); }, 0);
  }

  function paintActivity(box, rows, options) {
    if (!box) return;
    var opts = options || {};
    box.replaceChildren();
    var groups = opts.groups || groupActivity(rows);
    if (!groups.length) {
      var empty = document.createElement("p");
      empty.className = "empty-title";
      empty.textContent = opts.filtered ? "No activity matches." : "No activity yet.";
      box.append(empty);
      return;
    }
    if (opts.showRoom) {
      var head = document.createElement("div");
      head.className = "explorer-head history-head";
      [["mark", ""], ["event", "Event"], ["when", "When"], ["room", "Room"], ["action", "Open"]].forEach(function (pair) {
        var cell = document.createElement("span");
        cell.dataset.col = pair[0];
        cell.textContent = pair[1];
        head.append(cell);
      });
      box.append(head);
    }
    var feed = document.createElement("div");
    feed.className = "activity-feed";
    groups.forEach(function (group) {
      var wrap = document.createElement("div");
      wrap.className = "activity-group";
      group.rows.forEach(function (row) {
        var line = document.createElement("div");
        var faded = (row.superseded || row.outcome === "undone") && !(row.kind === "failure" && row.resolved);
        line.className = "activity-row" + (row.kind === "failure" ? " is-failure" : "") + (row.kind === "request" ? "" : " activity-child") + (row.retryOf ? " is-retry" : "") + (faded ? " muted" : "");
        line.id = "activity-" + row.id;
        var icon = document.createElement("span");
        icon.className = "activity-icon" + (row.kind === "failure" && !row.resolved ? " bad" : "");
        icon.innerHTML = activityGlyph(row.resolved ? "action" : row.kind, row.verb);
        var text = document.createElement("p");
        var copy = document.createElement("span");
        copy.className = "activity-copy";
        var who = document.createElement("strong");
        who.textContent = (row.actor && row.actor.name) || "Someone";
        copy.append(who);
        var calendarZone = document.body.getAttribute("data-calendar-zone") || "";
        var viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        var sample = row.changes && row.changes[0] ? (row.changes[0].from || row.changes[0].to || "") : "";
        var sentence = formatActivitySentence(
          row.sentence || "",
          row.target && row.target.system === "calendar" ? calendarZone : viewerZone,
          viewerZone,
          sample
        );
        var rest = sentence.indexOf(who.textContent) === 0 ? sentence.slice(who.textContent.length) : (" " + sentence);
        paintRich(copy, rest, row);
        var outcomeKind = group.rows.some(function (item) { return item.kind === "result"; }) ? "result" : "action";
        if (row.verb === "label" && row.kind === outcomeKind && row.changes && row.changes[0] && row.changes[0].to) {
          var labelWord = String(row.changes[0].to);
          var source = rest;
          var labelAt = source.indexOf(labelWord);
          if (labelAt >= 0) {
            var before = source.slice(0, labelAt);
            var after = source.slice(labelAt + labelWord.length);
            copy.replaceChildren(who);
            var pending = paintRich(copy, before, row);
            var pill = document.createElement("span");
            pill.className = "label-pill";
            pill.textContent = labelWord;
            if (pending) ensureWordSpace(copy);
            copy.append(pill);
            paintRich(copy, after, row);
          }
        }
        if (opts.viewRoom && row.origin && Number.isFinite(row.origin.at)) {
          var seek = document.createElement("button");
          seek.type = "button";
          seek.className = "at-link";
          var seconds = row.origin.at;
          var mins = Math.floor(seconds / 60);
          var secs = String(seconds % 60);
          if (secs.length < 2) secs = "0" + secs;
          seek.textContent = "at " + mins + ":" + secs;
          seek.addEventListener("click", function () { seekTo(seconds); });
          ensureWordSpace(copy);
          copy.append(seek);
        }
        text.append(copy);
        var meta = document.createElement("div");
        meta.className = "activity-meta";
        var time = document.createElement("time");
        if (row.ts) {
          time.dateTime = row.ts;
          time.title = relativeWhen(row.ts) || row.ts;
          time.textContent = opts.showRoom ? (clockOnly(row.ts) || relativeTime(row.ts)) : (relativeWhen(row.ts) || relativeTime(row.ts));
        }
        meta.append(time);
        var origin = row.origin || {};
        var suffix = document.createElement("span");
        suffix.className = "room-suffix";
        var roomName = opts.showRoom ? String(origin.roomName || "").trim() : "";
        suffix.textContent = roomName;
        if (roomName) {
          var sep = document.createElement("span");
          sep.className = "meta-sep";
          sep.textContent = " · ";
          meta.append(sep);
        }
        meta.append(suffix);
        var openLink = null;
        if (row.target && row.target.url && row.target.system === "slack" && (row.kind === "action" || row.kind === "result")) {
          openLink = document.createElement("a");
          openLink.className = "history-open";
          openLink.href = row.target.url;
          openLink.rel = "noreferrer";
          openLink.textContent = "Open";
        }
        var undoUntil = row.undo && row.undo.until ? Date.parse(row.undo.until) : 0;
        var action = document.createElement("span");
        action.className = "activity-action";
        action.dataset.col = "action";
        if (row.outcome === "undone") {
          var undone = document.createElement("span");
          undone.className = "undone-mark";
          undone.textContent = "Undone";
          action.append(undone);
        } else if (row.undo && row.undo.available && !row.superseded && undoUntil > Date.now()) {
          var undo = document.createElement("button");
          undo.type = "button";
          undo.className = "activity-undo";
          undo.textContent = "Undo";
          undo.addEventListener("click", function () { confirmUndo(row, line, undo); });
          action.append(undo);
        }
        if (row.kind === "failure" && row.resolved) {
          var done = document.createElement("span");
          done.className = "retried";
          done.textContent = "Retried";
          ensureWordSpace(copy);
          copy.append(done);
        } else if (row.kind === "failure" && row.stale) {
          var stale = document.createElement("span");
          stale.className = "activity-stale";
          stale.textContent = "Superseded by a newer change";
          action.append(stale);
        } else if (row.kind === "failure" && row.retryable === true) {
          var retry = document.createElement("button");
          retry.type = "button";
          retry.className = "activity-retry";
          retry.textContent = "Retry";
          retry.addEventListener("click", function () { postActivity("retry", row.id, retry); });
          action.append(retry);
        }
        if (openLink) action.append(openLink);
        if (opts.showRoom) {
          icon.dataset.col = "mark";
          text.dataset.col = "event";
          time.dataset.col = "when";
          suffix.dataset.col = "room";
          action.dataset.col = "action";
          line.append(icon, text, meta, action);
        } else {
          if (action.childNodes.length) meta.append(action);
          line.append(icon, text);
          if (meta.childNodes.length) line.append(meta);
        }
        wrap.append(line);
      });
      feed.append(wrap);
    });
    if (opts.showRoom) {
      var buckets = [];
      var cursor = 0;
      groups.forEach(function (group) {
        var heading = dayHeading(groupOpened(group)) || "Earlier";
        var last = buckets[buckets.length - 1];
        if (!last || last.heading !== heading) {
          last = { heading: heading, nodes: [] };
          buckets.push(last);
        }
        last.nodes.push(feed.children[cursor]);
        cursor += 1;
      });
      feed.replaceChildren();
      buckets.forEach(function (bucket) {
        var day = document.createElement("section");
        day.className = "history-day";
        var title = document.createElement("h3");
        title.className = "day-heading";
        title.textContent = bucket.heading;
        var dayFeed = document.createElement("div");
        dayFeed.className = "activity-feed";
        bucket.nodes.forEach(function (node) { if (node) dayFeed.append(node); });
        day.append(title, dayFeed);
        feed.append(day);
      });
    }
    box.append(feed);
  }

  function renderWaiting() {
    var box = document.getElementById("file-waiting");
    var waitingRow = document.getElementById("waiting-row");
    if (waitingRow) waitingRow.hidden = false;
    paintActivity(box, [], { groups: selectActivity((state && state.activity) || [], { roomId: fileRoom }), viewRoom: fileRoom });
  }

  function clashLine(other) {
    var who = String(personLabel(other.speaker) || "someone").trim().toLowerCase() || "someone";
    var clock = formatConsoleWhen(other.spokenAt, { part: "clock" });
    var tail = clock ? (who + ", " + clock) : who;
    return "Clashes with: " + (other.text || "A sentence") + " (" + tail + ")";
  }

  function decisionCopyText(decision) {
    if (!decision) return "";
    var lines = [String(decision.text || "").trim()];
    if (decision.status === "clashing") {
      decisionsFor(decision.roomId).forEach(function (other) {
        if (!other || other.id === decision.id || other.status !== "clashing") return;
        lines.push(clashLine(other));
      });
    }
    return lines.filter(Boolean).join("\\n");
  }

  function openDecision(decision) {
    openDecisionRow = decision;
    text("decision-state", humanStatus(decision.status || "recorded"));
    text("decision-sentence", decision.text || "");
    var heardWho = personLabel(decision.speaker);
    var heardWhen = relativeWhen(decision.spokenAt) || whenLabel(decision.spokenAt);
    text("decision-heard", heardWho && heardWhen ? heardWho + " kept this " + whenInSentence(heardWhen) + "." : heardWho ? heardWho + " kept this." : heardWhen ? "Kept " + whenInSentence(heardWhen) + "." : "No one is recorded yet.");
    showLine("decision-file", fileLine(decision));
    showLine("decision-ticket", ticketLine(decision));
    showLine("decision-proof", "");
    renderProofPanel("decision-proof", decision);
    showLine("decision-epoch", epochLine(decision));
    clear("decision-other");
    if (decision.status === "clashing") {
      decisionsFor(decision.roomId).forEach(function (other) {
        if (other.id === decision.id || other.status !== "clashing") return;
        var line = document.createElement("p");
        line.textContent = clashLine(other);
        document.getElementById("decision-other").append(line);
      });
    }
    var roomLink = document.getElementById("decision-room");
    if (roomLink) {
      if (decision.roomId) {
        roomLink.hidden = false;
        roomLink.href = "/console/rooms/" + encodeURIComponent(decision.roomId);
      } else {
        roomLink.hidden = true;
        roomLink.removeAttribute("href");
      }
    }
    openDialog("decision-dialog");
  }

  function renderFile() {
    var people = fileRoom ? peopleFor(fileRoom) : [];
    var room = (state && state.rooms || []).filter(function (item) { return item.id === fileRoom; })[0];
    var leadRows = fileRoom ? decisionsFor(fileRoom) : [];
    var lead = leadRows.length ? leadRows[leadRows.length - 1] : null;
    text("file-kind", (fileWait && fileWait.where) || (room && room.platform) || "");
    var kind = document.getElementById("file-kind");
    if (kind) kind.hidden = !kind.textContent;
    var named = roomIdentity(room || {}, leadRows);
    var knownRoom = Boolean(room) || leadRows.length > 0 || fileWait;
    var missing = document.getElementById("room-missing");
    var fileHead = document.getElementById("file-head");
    var split = document.querySelector("#file-dialog .detail-split");
    if (missing) missing.hidden = knownRoom;
    if (fileHead) fileHead.hidden = !knownRoom;
    if (split) split.hidden = !knownRoom;
    var timelineBox = document.getElementById("timeline");
    if (!knownRoom && timelineBox) timelineBox.hidden = true;
    document.body.classList.toggle("room-missing", !knownRoom);
    text("file-title", fileWait ? (fileWait.title || "Room") : (knownRoom ? named.title : "Room not found"));
    var fileEdit = document.getElementById("file-edit-event");
    if (fileEdit) {
      var calendarEventId = room && typeof room.calendarEventId === "string" ? room.calendarEventId : "";
      if (calendarEventId) fileEdit.setAttribute("data-edit-event", calendarEventId);
      else fileEdit.removeAttribute("data-edit-event");
      fileEdit.hidden = !calendarEventId || !knownRoom;
    }
    renderLead();
    if (sectionName === "file") {
      var currentCrumb = document.getElementById("crumb-current");
      if (currentCrumb) currentCrumb.hidden = true;
      setViewTitle(document.getElementById("file-title").textContent || "Room");
    }
    var overviewCard = document.getElementById("file-overview");
    if (overviewCard) overviewCard.hidden = true;
    text("file-id", fileRoom || "");
    var waitingOn = (fileRoom && waitingFor(fileRoom).length > 0) || !!(fileWait && fileWait.wait);
    var statusBadge = document.getElementById("file-status-badge");
    if (statusBadge) {
      var tone = roomTone(fileRoom);
      statusBadge.className = knownRoom ? tone.badge : "badge";
      statusBadge.textContent = knownRoom ? tone.word : "";
    }
    var pill = document.getElementById("file-platform-pill");
    if (pill) {
      pill.replaceChildren();
      var platformName = (fileWait && fileWait.where) || (room && room.platform) || "";
      if (platformName) pill.append(platformBadge(platformName));
    }
    var startedAt = (room && (room.startedAt || room.recordingStart)) || "";
    if (!startedAt && fileRoom) {
      var spokenTimes = decisionsFor(fileRoom).map(function (row) { return row.spokenAt; }).filter(function (v) { return !isNaN(Date.parse(v || "")); }).sort();
      startedAt = spokenTimes[0] || "";
    }
    var startedLabel = startedAt ? (relativeWhen(startedAt) || whenLabel(startedAt) || "") : "";
    text("file-started", startedLabel);
    var startedItem = document.getElementById("file-started-item");
    if (startedItem) startedItem.hidden = !startedLabel;
    document.querySelectorAll("#file-meta .header-only").forEach(function (node) {
      if (node.id === "file-usage-item") return;
      node.hidden = !knownRoom;
    });
    text("file-summary", "");
    var outcome = document.getElementById("file-outcome");
    if (outcome) paintMeetingOutcome(outcome, leadRows, people);
    paintCallout(fileRoom);
    clear("file-overview-people");
    people.forEach(function (person) {
      var who = personLabel(person) || person;
      document.getElementById("file-overview-people").append(face(who));
    });
    renderFacts(room, named, leadRows);
    renderTranscript(leadRows);
    var raw = JSON.stringify({
      id: fileRoom,
      platform: (room && room.platform) || "",
      title: named.title,
      decisions: leadRows.map(function (decision) {
        return { text: decision.text || "", speaker: personLabel(decision.speaker) || "", spokenAt: decision.spokenAt || "", status: decision.status || "" };
      })
    }, null, 2);
    text("file-raw", raw);
    text("file-raw-side", raw);
    applyRoomTabs();
    loadRoomMedia();
    clear("file-heard");
    var present = document.getElementById("file-present");
    if (!people.length) {
      text("file-heard", "No one is recorded yet.");
      if (present) present.hidden = false;
    } else {
      text("file-heard", "");
      people.forEach(function (person) {
        var item = document.createElement("span");
        item.className = "person";
        item.append(face(personLabel(person) || person));
        var name = document.createElement("span");
        name.textContent = personLabel(person) || person;
        item.append(name);
        document.getElementById("file-heard").append(item);
      });
      if (present) present.hidden = true;
    }
    var participants = document.getElementById("participants");
    if (participants) {
      participants.replaceChildren();
      var heading = document.createElement("h3");
      heading.textContent = "Participants · " + people.length;
      participants.append(heading);
      people.forEach(function (person) {
        var chip = document.createElement("span");
        chip.className = "person";
        chip.append(face(personLabel(person) || person));
        var label = document.createElement("span");
        label.textContent = personLabel(person) || person;
        chip.append(label);
        participants.append(chip);
      });
    }
    var ask = document.getElementById("ask-first");
    ask.disabled = !fileRoom;
    if (room) ask.checked = room.ask !== true;
    else ask.checked = true;
    var voice = voiceFor();
    document.querySelectorAll("[data-voice]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-voice") === voice ? "true" : "false");
    });
    var clash = document.getElementById("raise-clash");
    clash.checked = clashOn();
    text("clash-note", clash.checked ? "This room will raise a clash here. Nothing is sent from this page." : "");
    clear("file-decisions");
    var rows = fileRoom ? decisionsFor(fileRoom) : [];
    var clashRows = rows.filter(function (decision) { return decision.status === "clashing"; });
    if (!rows.length) {
      var none = document.createElement("p");
      none.className = "meta";
      none.textContent = "No decision yet.";
      document.getElementById("file-decisions").append(none);
    }
    if (clashRows.length >= 2) {
      var clashNote = document.createElement("p");
      clashNote.className = "meta";
      clashNote.textContent = clashRows.length + " decisions clash. Read both in Overview.";
      document.getElementById("file-decisions").append(clashNote);
    }
    rows.forEach(function (decision) {
      if (clashRows.length >= 2 && decision.status === "clashing") return;
      var line = document.createElement("p");
      line.className = "decision-line";
      var who = personLabel(decision.speaker);
      var when = relativeWhen(decision.spokenAt) || whenLabel(decision.spokenAt);
      line.textContent = decision.text || "No decision yet.";
      var badge = document.createElement("span");
      badge.className = decision.status === "clashing" ? "badge warn" : "badge";
      badge.textContent = statusLabel(decision.status || "recorded");
      line.append(badge);
      line.setAttribute("role", "button");
      line.tabIndex = 0;
      line.addEventListener("click", function () { openDecision(decision); });
      if (who || when) {
        var meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = [who, when].filter(Boolean).join(" · ");
        line.append(meta);
      }
      document.getElementById("file-decisions").append(line);
    });
    clear("file-history");
    var roomActivity = activityRows(fileRoom).filter(function (row) { return row.kind !== "resolve" && row.kind !== "supersede"; });
    if (!roomActivity.length) {
      var quiet = document.createElement("p");
      quiet.className = "empty-title";
      quiet.textContent = "No activity for this room yet.";
      var quietAside = document.createElement("p");
      quietAside.className = "meta";
      quietAside.textContent = "Requests, changes and failures show up here.";
      document.getElementById("file-history").append(quiet, quietAside);
    } else {
      paintActivity(document.getElementById("file-history"), roomActivity, { showRoom: false, viewRoom: fileRoom });
    }
    renderWaiting();
    renderFiles();
    renderOutside();
    renderProofPanel("proof", lead);
  }

  function chainLine() {
    var chain = state && state.chain;
    if (!chain) return "Read via Tatum gRPC · 0 calls";
    var calls = chain.calls || 0;
    var ms = chain.lastMs == null ? "" : " · last " + chain.lastMs + " ms";
    var tip = chain.checkpoint == null ? "" : " · latest checkpoint " + chain.checkpoint;
    return "Read via Tatum gRPC · " + calls + " calls" + ms + tip;
  }

  function suiscanHref(kind, id) {
    if (id == null || id === "") return "";
    return "https://suiscan.xyz/mainnet/" + kind + "/" + id;
  }

  function whySource(memory) {
    if (!memory) return null;
    var rows = [
      ["Blob", memory.blobId || ""],
      ["Object", memory.objectId || ""],
      ["Transaction", memory.digest || ""],
      ["Checkpoint", memory.checkpoint != null ? String(memory.checkpoint) : ""]
    ].filter(function (pair) { return pair[1]; });
    if (!rows.length) return null;
    var details = document.createElement("details");
    details.className = "why-source";
    var summary = document.createElement("summary");
    summary.textContent = "Show source";
    details.append(summary);
    rows.forEach(function (pair) {
      var line = document.createElement("p");
      line.className = "proof-id";
      var kind = pair[0] === "Object" ? "object" : pair[0] === "Transaction" ? "tx" : pair[0] === "Checkpoint" ? "checkpoint" : "";
      if (kind) {
        var link = document.createElement("a");
        link.href = suiscanHref(kind, pair[1]);
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = pair[0] + " " + pair[1];
        line.append(link);
      } else line.textContent = pair[0] + " " + pair[1];
      details.append(line);
    });
    return details;
  }

  function proofStatusCopy(decision) {
    var proof = decision && decision.proof;
    var status = (proof && proof.status) || (decision && decision.proofStatus) || "unknown";
    if (status === "verified") return "Verified on Walrus.";
    if (status === "pending") return "Verifying on Walrus…";
    if (status === "unverified") return (proof && proof.reason) || (decision && decision.proofReason) || "Unverified.";
    return (proof && proof.reason) || (decision && decision.proofReason) || "Proof is unknown.";
  }

  function proofCheckpoint(decision) {
    var proof = (decision && decision.proof) || {};
    if (proof.checkpoint != null && proof.checkpoint !== "") return String(proof.checkpoint);
    if (decision && typeof decision.checkpoint === "number") return String(decision.checkpoint);
    return "";
  }

  function whenInSentence(when) {
    var text = String(when || "").trim();
    if (/^(today|yesterday|tomorrow)( |$)/i.test(text)) return text.charAt(0).toLowerCase() + text.slice(1);
    return "on " + text;
  }

  function countWords(n, one, many) {
    var words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    return (n <= 10 ? words[n] : String(n)) + " " + (n === 1 ? one : many);
  }

  function proofPlain(decision, noun) {
    var proof = (decision && decision.proof) || {};
    var status = (proof && proof.status) || (decision && decision.proofStatus) || "unknown";
    var meeting = noun !== "decision";
    var when = chainWhen(proof.checkpointTime);
    if (status === "verified") {
      var head = meeting ? "This meeting's record is kept" : "This decision is kept";
      if (when) return head + " and was confirmed " + whenInSentence(when) + ". Nobody can change it.";
      return head + ". Nobody can change it.";
    }
    if (status === "pending") {
      return meeting ? "We're checking that this meeting's record is kept." : "We're checking that this decision is kept.";
    }
    return meeting ? "We couldn't confirm this record yet." : "We couldn't confirm this decision yet.";
  }

  function proofWorthShowing(decision) {
    if (!decision) return false;
    var proof = decision.proof || {};
    var status = proof.status || decision.proofStatus || "";
    if (status === "verified" || status === "pending" || status === "unverified") return true;
    if (proof.blobId || decision.blobId || proof.objectId || decision.objectId || proof.digest || decision.digest) return true;
    if (proof.checkpoint != null || typeof decision.checkpoint === "number") return true;
    return false;
  }

  function paintProofChip(decision) {
    var chip = document.getElementById("file-proof");
    var label = document.getElementById("file-proof-label");
    if (!chip) return;
    // No proof to talk about yet: show nothing rather than a warning.
    if (!decision || !proofWorthShowing(decision)) {
      chip.hidden = true;
      chip.className = "badge proof-chip";
      if (label) label.textContent = "";
      var idleTitle = document.getElementById("proof-dialog-title");
      if (idleTitle) idleTitle.textContent = "Record";
      return;
    }
    var proof = decision.proof || {};
    var status = proof.status || decision.proofStatus || "unknown";
    var word = "Couldn't verify";
    var tone = "badge warn proof-chip";
    if (status === "verified") {
      word = "Verified on Walrus";
      tone = "badge ok proof-chip is-verified";
    } else if (status === "pending") {
      word = "Verifying…";
      tone = "badge info proof-chip";
    }
    chip.className = tone;
    chip.hidden = false;
    if (label) label.textContent = word;
    var title = document.getElementById("proof-dialog-title");
    if (title) title.textContent = word;
  }

  // A chain or memory time in the viewer's zone, with the zone named:
  // "Today at 11:44 PM GMT+7" rather than a raw ISO string.
  function chainWhen(iso) {
    if (!iso) return "";
    var text = formatConsoleWhen(iso);
    if (!text) return "";
    var zone = zoneShortName(iso, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return zone ? text + " " + zone : text;
  }

  function renderProofPanel(prefix, decision) {
    var status = document.getElementById(prefix + "-status");
    var facts = document.getElementById(prefix + "-facts");
    var links = document.getElementById(prefix + "-links");
    var chain = document.getElementById(prefix + "-chain");
    var noun = prefix === "decision-proof" ? "decision" : "meeting";
    if (chain) chain.textContent = chainLine();
    if (status) status.textContent = decision ? proofStatusCopy(decision) : "Proof is unknown until the chain is read.";
    if (status) status.setAttribute("data-proof", decision ? ((decision.proof && decision.proof.status) || decision.proofStatus || "unknown") : "none");
    var plain = document.getElementById(prefix + "-plain");
    if (plain) plain.textContent = decision ? proofPlain(decision, noun) : "We couldn't confirm this record yet.";
    var panel = document.getElementById(prefix + "-panel");
    if (prefix === "decision-proof" && panel) panel.hidden = !proofWorthShowing(decision);
    if (prefix === "proof") paintProofChip(decision);
    var kept = document.getElementById(prefix + "-kept");
    if (kept) {
      var checkpoint = proofCheckpoint(decision);
      kept.textContent = checkpoint ? ("Confirmed as record " + checkpoint + ".") : "";
      kept.hidden = !kept.textContent;
    }
    var reasonNode = document.getElementById(prefix + "-reason");
    if (reasonNode) {
      var proof = (decision && decision.proof) || {};
      var stateName = (proof && proof.status) || (decision && decision.proofStatus) || "unknown";
      var reason = (proof && proof.reason) || (decision && decision.proofReason) || "";
      var showReason = stateName !== "verified" && stateName !== "pending" && reason && reason !== "Verifying on chain…";
      reasonNode.textContent = showReason ? reason : "";
      reasonNode.hidden = !showReason;
    }
    if (decision && proofPending(decision)) followProof(decision);
    if (facts) {
      facts.replaceChildren();
      var proof = (decision && decision.proof) || {};
      var rows = [
        ["Blob", proof.blobId || (decision && decision.blobId) || ""],
        ["Object", proof.objectId || (decision && decision.objectId) || ""],
        ["Transaction", proof.digest || (decision && decision.digest) || ""],
        ["Checkpoint", proof.checkpoint != null ? String(proof.checkpoint) : (decision && typeof decision.checkpoint === "number" ? String(decision.checkpoint) : "")],
        ["Checkpoint time", chainWhen(proof.checkpointTime)],
        ["Certified in Walrus epoch", proof.certifiedEpoch != null ? String(proof.certifiedEpoch) : ""]
      ];
      rows.forEach(function (pair) {
        if (!pair[1]) return;
        var term = document.createElement("dt");
        term.textContent = pair[0];
        var value = document.createElement("dd");
        value.className = "proof-id";
        value.textContent = pair[1];
        facts.append(term, value);
      });
    }
    if (links) {
      links.replaceChildren();
      var proof = (decision && decision.proof) || {};
      var objectId = proof.objectId || (decision && decision.objectId) || "";
      var digest = proof.digest || (decision && decision.digest) || "";
      var checkpoint = proof.checkpoint != null ? proof.checkpoint : (decision && typeof decision.checkpoint === "number" ? decision.checkpoint : "");
      [["object", objectId, "Object"], ["tx", digest, "Transaction"], ["checkpoint", checkpoint, "Checkpoint"]].forEach(function (item) {
        if (item[1] === "" || item[1] == null) return;
        var link = document.createElement("a");
        link.href = suiscanHref(item[0], item[1]);
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = item[2];
        links.append(link);
      });
    }
  }

  // A proof the server is still reading comes back "pending". The panel says
  // so and follows it up here, without a reload. Each follow-up waits on the
  // read already running on the server, so this does not add gateway calls.
  // "unknown" is shown only after a real failure, with Verify again.
  var PROOF_FOLLOW_TRIES = 8;
  var PROOF_FOLLOW_GAP_MS = 750;

  function proofPending(decision) {
    var proof = decision && decision.proof;
    return ((proof && proof.status) || (decision && decision.proofStatus)) === "pending";
  }

  function applyProofResult(decision, result) {
    decision.proof = result.proof || decision.proof;
    decision.proofStatus = result.status || decision.proofStatus;
    decision.proofReason = result.reason || decision.proofReason;
    if (result.checkpoint != null) decision.checkpoint = result.checkpoint;
    if (result.chain) state.chain = result.chain;
  }

  function paintProof(decision) {
    var rows = fileRoom ? decisionsFor(fileRoom) : [];
    var lead = rows.length ? rows[rows.length - 1] : null;
    if (lead && lead.id === decision.id) renderProofPanel("proof", decision);
    if (openDecisionRow && openDecisionRow.id === decision.id) {
      renderProofPanel("decision-proof", decision);
      showLine("decision-proof", "");
    }
  }

  function proofFailed(decision, reason) {
    decision.proof = { status: "unknown", reason: reason, blobId: (decision.proof && decision.proof.blobId) || decision.blobId || null, links: {} };
    decision.proofStatus = "unknown";
    decision.proofReason = reason;
    paintProof(decision);
  }

  function askProof(decision, fresh) {
    return fetch("/api/proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: decision.id, workspace: workspaceKind, fresh: fresh === true })
    }).then(function (response) {
      if (!response.ok) throw new Error("proof " + response.status);
      return response.json();
    });
  }

  function followProof(decision, tries) {
    if (!decision || !decision.id) return;
    if (tries == null) {
      if (decision.proofFollowing) return;
      decision.proofFollowing = true;
      tries = 0;
    }
    askProof(decision, false).then(function (result) {
      applyProofResult(decision, result);
      if (proofPending(decision)) {
        if (tries + 1 >= PROOF_FOLLOW_TRIES) {
          decision.proofFollowing = false;
          proofFailed(decision, "Tatum did not answer in time. Try Verify again.");
          return;
        }
        paintProof(decision);
        setTimeout(function () { followProof(decision, tries + 1); }, PROOF_FOLLOW_GAP_MS);
        return;
      }
      decision.proofFollowing = false;
      paintProof(decision);
    }).catch(function () {
      decision.proofFollowing = false;
      proofFailed(decision, "The chain read failed. Try Verify again.");
    });
  }

  function verifyDecision(decision) {
    if (!decision || !decision.id) return;
    decision.proof = { status: "pending", reason: "Verifying on chain…", blobId: (decision.proof && decision.proof.blobId) || decision.blobId || null, links: {} };
    decision.proofStatus = "pending";
    // Hold off the follow-up while this fresh read is out.
    decision.proofFollowing = true;
    paintProof(decision);
    askProof(decision, true).then(function (result) {
      decision.proofFollowing = false;
      applyProofResult(decision, result);
      paintProof(decision);
    }).catch(function () {
      decision.proofFollowing = false;
      proofFailed(decision, "The chain read failed. Try Verify again.");
    });
  }

  function renderFacts(room, named, rows) {
    var box = document.getElementById("file-facts");
    if (!box) return;
    box.replaceChildren();
    var facts = [];
    facts.forEach(function (pair) {
      var term = document.createElement("dt");
      term.textContent = pair[0];
      var value = document.createElement("dd");
      value.textContent = pair[1];
      box.append(term, value);
    });
    box.hidden = facts.length === 0;
  }

  function transcriptEmptyCopy(hasRows) {
    if (hasRows) return "No matching lines.";
    var media = roomMediaState;
    var word = meetingWord(roomOf(fileRoom)).word;
    if (media && (media.state === "processing" || word === "Live")) return "No transcript yet.";
    if (media && (media.state === "ready" || media.state === "novideo") && word !== "Ended" && word !== "No recording" && word !== "Channel") return "No transcript yet.";
    if (!media) return "No transcript yet.";
    if (media.state === "none" || media.state === "channel" || media.state === "expired" || word === "Ended" || word === "No recording" || word === "Channel") return "Nothing was recorded.";
    return "No transcript yet.";
  }

  function renderTranscript(rows) {
    var box = document.getElementById("file-transcript");
    if (!box) return;
    box.replaceChildren();
    var query = transcriptQuery.trim().toLowerCase();
    var shown = 0;
    (rows || []).forEach(function (decision) {
      var who = personLabel(decision.speaker) || "Speaker";
      var sentence = decision.text || "";
      if (query && (who + " " + sentence).toLowerCase().indexOf(query) === -1) return;
      shown += 1;
      var row = document.createElement("button");
      row.type = "button";
      row.className = "utter";
      var stamps = (rows || []).map(function (item) { return Date.parse(item.spokenAt || ""); }).filter(function (value) { return !isNaN(value); });
      var origin = roomMediaState && roomMediaState.startedAt ? Date.parse(roomMediaState.startedAt) : (stamps.length ? Math.min.apply(null, stamps) : NaN);
      var spoken = Date.parse(decision.spokenAt || "");
      var start = !isNaN(origin) && !isNaN(spoken) ? Math.max(0, (spoken - origin) / 1000) : shown;
      var limit = mediaDuration();
      var past = limit > 0 && start > limit + 0.05;
      row.setAttribute("data-start", past ? "" : String(start));
      row.setAttribute("data-end", past ? "" : String(start + 4));
      var head = document.createElement("span");
      head.className = "utter-head";
      var name = document.createElement("span");
      name.className = "utter-name";
      name.textContent = who;
      var dot = document.createElement("span");
      dot.className = "speaker-dot " + speakerHue(who);
      dot.setAttribute("aria-hidden", "true");
      var time = document.createElement("time");
      time.textContent = past ? "" : clockText(start);
      head.append(dot, name, time);
      var line = document.createElement("span");
      line.className = "utter-text";
      if (query) {
        var lower = sentence.toLowerCase();
        var at = lower.indexOf(query);
        if (at >= 0) {
          line.append(document.createTextNode(sentence.slice(0, at)));
          var mark = document.createElement("mark");
          mark.textContent = sentence.slice(at, at + query.length);
          line.append(mark, document.createTextNode(sentence.slice(at + query.length)));
        } else line.textContent = sentence;
      } else line.textContent = sentence;
      row.append(head, line);
      row.addEventListener("click", function () { seekTo(start); });
      box.append(row);
    });
    if (!shown) {
      var empty = document.createElement("p");
      empty.className = "meta";
      empty.textContent = transcriptEmptyCopy(rows && rows.length);
      box.append(empty);
    }
    placeTranscriptSearch((rows || []).length);
  }

  function placeTranscriptSearch(count) {
    var search = document.querySelector("label.dock-search");
    if (!search) return;
    var lines = typeof count === "number" ? count : (fileRoom ? decisionsFor(fileRoom).length : 0);
    search.hidden = leftTab !== "transcript" || lines < 2;
  }

  function applyRoomTabs() {
    ["transcript", "config", "raw"].forEach(function (name) {
      var pane = document.getElementById("left-" + name);
      if (pane) pane.hidden = name !== leftTab;
      var button = document.querySelector('[data-left-tab="' + name + '"]');
      if (button) button.setAttribute("aria-selected", name === leftTab ? "true" : "false");
    });
    ["overview", "decisions", "waiting", "history", "raw"].forEach(function (name) {
      var pane = document.getElementById("right-" + name);
      if (pane) pane.hidden = name !== rightTab;
      var button = document.querySelector('[data-right-tab="' + name + '"]');
      if (button) button.setAttribute("aria-selected", name === rightTab ? "true" : "false");
    });
    placeTranscriptSearch();
    var settings = document.querySelector(".room-settings");
    if (settings) settings.hidden = rightTab !== "overview";
  }

  var roomMediaState = null;

  function paintCallout(roomId) {
    var callout = document.getElementById("file-callout");
    if (!callout) return;
    callout.className = "callout-stack";
    callout.replaceChildren();
    var clashing = decisionsFor(roomId).filter(function (decision) { return decision.status === "clashing"; });

    if (clashing.length) {
      var warn = document.createElement("div");
      warn.className = "callout callout-warn";
      var warnTitle = document.createElement("p");
      warnTitle.className = "callout-title";
      warnTitle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></svg> These decisions clash';
      warn.append(warnTitle);
      var ordered = clashing.slice().sort(function (a, b) {
        return String(b.spokenAt || "").localeCompare(String(a.spokenAt || ""));
      });
      ordered.forEach(function (decision) {
        var line = document.createElement("p");
        line.className = "clash-line";
        var sentence = document.createElement("span");
        sentence.className = "clash-text";
        sentence.textContent = (decision && decision.text) || "A sentence";
        line.append(sentence);
        var when = relativeWhen(decision && decision.spokenAt) || whenLabel(decision && decision.spokenAt);
        if (when) {
          var stamp = document.createElement("span");
          stamp.className = "clash-when";
          stamp.textContent = " · " + when;
          line.append(stamp);
        }
        warn.append(line);
      });
      callout.append(warn);
    }
    var failed = activityRows(roomId).filter(function (row) { return row.kind === "failure" && row.outcome === "failed" && !row.resolved && row.retryable === true; });
    var shown = failed[failed.length - 1];
    if (shown) {
      var bad = document.createElement("div");
      bad.className = "callout callout-bad";
      var badTitle = document.createElement("p");
      badTitle.className = "callout-title";
      badTitle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> Couldn\u2019t finish';
      var line = document.createElement("p");
      line.textContent = shown.sentence || shown.error || "A change did not go through.";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "activity-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", function () { postActivity("retry", shown.id, retry); });
      bad.append(badTitle, line, retry);
      callout.append(bad);
    }
    callout.hidden = callout.childElementCount === 0;
    placeRoomChrome();
  }

  function paintMeetingOutcome(box, rows, people) {
    box.replaceChildren();
    box.hidden = false;
    var list = (rows || []).filter(function (row) { return row && String(row.text || "").trim(); });
    var isAction = function (row) { return /action|todo|task/i.test(String(row.kind || row.type || "")); };
    var decided = list.filter(function (row) { return !isAction(row); });
    var actions = list.filter(isAction);
    var head = document.createElement("h2");
    head.textContent = "Summary";
    var lede = document.createElement("p");
    lede.className = "outcome-lede";
    if (!list.length) {
      lede.textContent = "Nothing decided in this meeting yet.";
      box.append(head, lede);
      return;
    }
    var names = (people || []).map(function (p) { return personLabel(p) || p; }).filter(Boolean);
    var bits = [];
    if (decided.length) bits.push(countWords(decided.length, "decision", "decisions"));
    if (actions.length) bits.push(countWords(actions.length, "action item", "action items"));
    var who = names.length === 1 ? names[0] + " agreed on "
      : names.length > 1 ? (names.length <= 10 ? countWords(names.length, "person", "people") : names.length + " people") + " met and agreed on "
      : "This meeting agreed on ";
    who = who.charAt(0).toUpperCase() + who.slice(1);
    lede.textContent = who + bits.join(" and ") + ".";
    box.append(head, lede);
    function group(title, items) {
      if (!items.length) return;
      var h = document.createElement("h3");
      h.className = "outcome-label";
      h.textContent = title;
      var ul = document.createElement("ul");
      ul.className = "outcome-list";
      items.forEach(function (row) {
        var li = document.createElement("li");
        li.textContent = String(row.text).trim();
        var who = personLabel(row.speaker);
        if (who) {
          var by = document.createElement("span");
          by.className = "meta";
          by.textContent = " · " + who;
          li.append(by);
        }
        ul.append(li);
      });
      box.append(h, ul);
    }
    group("Decisions", decided);
    group("Action items", actions);
  }

  function placeRoomChrome() {
    var callout = document.getElementById("file-callout");
    var head = document.getElementById("file-head");
    var overview = document.getElementById("right-overview");
    var facts = document.getElementById("overview-facts");
    if (!callout || !head || !overview) return;
    var narrow = document.body.classList.contains("room-open") && window.matchMedia("(max-width: 768px)").matches;
    if (narrow) {
      if (callout.previousElementSibling !== head) head.insertAdjacentElement("afterend", callout);
      return;
    }
    if (callout.parentNode !== overview) {
      if (facts && facts.parentNode === overview) facts.before(callout);
      else overview.prepend(callout);
    }
  }

  function clockText(seconds) {
    var value = Math.max(0, Math.floor(seconds || 0));
    var mins = Math.floor(value / 60);
    var secs = String(value % 60);
    if (secs.length < 2) secs = "0" + secs;
    return mins + ":" + secs;
  }

  function mediaDuration() {
    var video = document.getElementById("player-video");
    if (video && isFinite(video.duration) && video.duration > 0) return video.duration;
    if (roomMediaState && roomMediaState.duration) return roomMediaState.duration;
    var max = 0;
    ((roomMediaState && roomMediaState.segments) || []).forEach(function (segment) {
      if (segment.end > max) max = segment.end;
    });
    ((roomMediaState && roomMediaState.lines) || []).forEach(function (line) {
      if (line.end > max) max = line.end;
    });
    laneSegments().forEach(function (segment) {
      if (segment.end > max) max = segment.end;
    });
    return max || 60;
  }

  function paintPlayer(media) {
    var video = document.getElementById("player-video");
    var fallback = document.getElementById("player-fallback");
    var note = document.getElementById("player-note");
    var name = document.getElementById("player-name");
    var people = fileRoom ? peopleFor(fileRoom) : [];
    var named = media && (media.state === "ready" || media.state === "novideo");
    if (name) name.textContent = named && people.length ? (personLabel(people[0]) || people[0]) : "No recording for this room";
    var copy = "";
    if (media && media.state === "processing") copy = "Recording is still processing.";
    else if (media && media.state === "expired") copy = "Recording expired";
    else if (media && media.state === "channel") copy = "Slack channels aren't recorded";
    else if (media && (media.state === "ready" || media.state === "novideo")) copy = "";
    if (note) note.textContent = copy;
    if (video && media && media.videoUrl && media.state === "ready") {
      if (video.getAttribute("src") !== media.videoUrl) video.src = media.videoUrl;
      video.hidden = false;
      if (fallback) fallback.hidden = true;
      var leftOn = document.getElementById("room-left");
      if (leftOn) leftOn.classList.remove("no-recording");
    } else if (video) {
      video.removeAttribute("src");
      video.hidden = true;
      if (fallback) fallback.hidden = false;
      var leftOff = document.getElementById("room-left");
      if (leftOff) leftOff.classList.add("no-recording");
    }
  }

  function paintArtifacts(media) {
    var list = document.getElementById("artifact-list");
    if (!list) return;
    list.replaceChildren();
    var rows = [
      ["Video", media && media.videoUrl],
      ["Transcript", media && media.transcriptUrl],
      ["Participants", media && media.participantsUrl],
      ["Participant events", media && media.eventsUrl],
      ["Speaker timeline", media && media.timelineUrl]
    ].filter(function (row) { return row[1]; });
    var section = document.getElementById("artifacts");
    if (section) section.hidden = rows.length === 0;
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = row[1] ? "artifact-row" : "artifact-row off";
      var label = document.createElement("span");
      label.textContent = row[0];
      var actions = document.createElement("span");
      actions.className = "artifact-actions";
      var view = document.createElement("a");
      view.className = "icon-btn";
      view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/></svg>';
      view.setAttribute("aria-label", "View raw " + row[0]);
      var save = document.createElement("a");
      save.className = "icon-btn";
      save.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
      save.setAttribute("aria-label", "Download " + row[0]);
      if (row[1]) {
        view.href = row[1];
        save.href = row[1];
        save.setAttribute("download", "");
        view.target = "_blank";
        view.rel = "noopener";
        actions.append(view, save);
      } else {
        var none = document.createElement("span");
        none.className = "artifact-none";
        none.textContent = "None";
        actions.append(none);
      }
      item.append(label, actions);
      list.append(item);
    });
  }

  function pct(seconds, duration) {
    if (!duration) return "0%";
    return Math.max(0, Math.min(100, seconds / duration * 100)) + "%";
  }

  function speakerHue(name) {
    var value = 0;
    var lower = String(name || "").toLowerCase();
    for (var i = 0; i < lower.length; i += 1) value = value * 9 + lower.charCodeAt(i);
    var tone = value % 8;
    if (tone < 0) tone += 8;
    return "spk-" + tone;
  }

  function stampSeconds(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (!value || typeof value !== "object") return NaN;
    if (typeof value.relative === "number") return value.relative;
    return NaN;
  }

  function utteranceSegments(payload, people) {
    var rows = Array.isArray(payload) ? payload
      : (payload && (payload.utterances || payload.lines || payload.transcript)) || [];
    if (!Array.isArray(rows)) return [];
    var named = {};
    (Array.isArray(people) ? people : []).forEach(function (person) {
      if (person && person.id != null && person.name) named[String(person.id)] = String(person.name);
    });
    var out = [];
    rows.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      var participant = row.participant && typeof row.participant === "object" ? row.participant : {};
      var id = participant.id != null ? String(participant.id) : (row.participant_id != null ? String(row.participant_id) : "");
      var speaker = participant.name || row.speaker || row.name || named[id] || "Speaker";
      var words = Array.isArray(row.words) ? row.words : null;
      if (words && words.length) {
        var first = words[0];
        var last = words[words.length - 1];
        var start = stampSeconds(first.start_timestamp != null ? first.start_timestamp : first.start);
        var end = stampSeconds(last.end_timestamp != null ? last.end_timestamp : (last.end != null ? last.end : last.start));
        if (isNaN(start)) return;
        if (isNaN(end) || end <= start) end = start + 0.4;
        out.push({ speaker: String(speaker), start: start, end: end });
        return;
      }
      if (typeof row.start === "number") {
        var endAt = typeof row.end === "number" && row.end > row.start ? row.end : row.start + 1;
        out.push({ speaker: String(speaker), start: row.start, end: endAt });
      }
    });
    return out;
  }

  function laneSegments() {
    var direct = (roomMediaState && roomMediaState.segments) || [];
    if (direct.length) return direct;
    var fromLines = utteranceSegments(roomMediaState && roomMediaState.lines, roomMediaState && roomMediaState.participants);
    if (fromLines.length) return fromLines;
    return (roomMediaState && roomMediaState.derivedSegments) || [];
  }

  function httpUrl(value) {
    var text = String(value || "");
    var head = text.slice(0, 8).toLowerCase();
    if (head.slice(0, 8) === "https://" || head.slice(0, 7) === "http://") return text;
    return "";
  }

  function loadSpeakerLanes() {
    var media = roomMediaState;
    if (!media) return Promise.resolve();
    if ((media.segments || []).length || utteranceSegments(media.lines, media.participants).length) return Promise.resolve();
    var transcript = httpUrl(media.transcriptUrl);
    var peopleUrl = httpUrl(media.participantsUrl);
    if (!transcript && !peopleUrl) return Promise.resolve();
    var asked = media.forRoom || fileRoom;
    function pull(url) {
      if (!url) return Promise.resolve(null);
      return fetch(url).then(function (response) {
        if (!response.ok) throw new Error("lane");
        return response.json();
      }).catch(function () { return null; });
    }
    return Promise.all([pull(transcript), pull(peopleUrl)]).then(function (pair) {
      if (!roomMediaState || (roomMediaState.forRoom || fileRoom) !== asked) return;
      var people = Array.isArray(pair[1]) ? pair[1] : (pair[1] && (pair[1].participants || pair[1].people)) || [];
      roomMediaState.participants = people;
      roomMediaState.derivedSegments = utteranceSegments(pair[0], people);
    });
  }

  function reserveDockSpace() {
    var timeline = document.getElementById("timeline");
    var height = timeline && !timeline.hidden ? Math.ceil(timeline.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--dock-pad", height + "px");
  }

  function paintTimeline() {
    var timeline = document.getElementById("timeline");
    var segments = laneSegments();
    var mediaEvents = (roomMediaState && roomMediaState.events) || [];
    var useful = roomMediaState && (roomMediaState.state === "ready" || roomMediaState.state === "novideo" || segments.length || mediaEvents.length);
    if (timeline) timeline.hidden = !useful;
    if (!useful) {
      if (timeline) timeline.classList.remove("is-scrub");
      reserveDockSpace();
      return;
    }
    var duration = mediaDuration();
    text("tl-end", clockText(duration));
    var when = document.getElementById("tl-when");
    if (when) when.textContent = "";
    var ruler = document.getElementById("tl-ruler");
    var speakers = document.getElementById("tl-speakers");
    var events = document.getElementById("tl-events");
    if (ruler) ruler.replaceChildren();
    if (speakers) speakers.replaceChildren();
    if (events) events.replaceChildren();
    var steps = 6;
    for (var i = 0; i <= steps; i += 1) {
      var tick = document.createElement("span");
      tick.className = "tl-tick" + (i === steps ? " end" : "");
      tick.style.left = (i / steps * 100) + "%";
      tick.textContent = clockText(duration * i / steps);
      if (ruler) ruler.append(tick);
    }
    segments.forEach(function (segment) {
      var block = document.createElement("span");
      block.className = "tl-seg " + speakerHue(segment.speaker || "");
      block.style.left = pct(segment.start, duration);
      block.style.width = Math.max(0.6, ((segment.end - segment.start) / duration) * 100) + "%";
      block.title = segment.speaker || "";
      if (speakers) speakers.append(block);
    });
    mediaEvents.forEach(function (event) {
      var dot = document.createElement("span");
      dot.className = "tl-dot";
      dot.style.left = pct(event.at, duration);
      dot.title = (event.kind || "event") + " " + (event.name || "");
      if (events) events.append(dot);
    });
    var marks = 0;
    if (fileRoom && roomMediaState && roomMediaState.startedAt) {
      var origin = Date.parse(roomMediaState.startedAt);
      decisionsFor(fileRoom).forEach(function (decision) {
        var at = Date.parse(decision.spokenAt || "");
        if (isNaN(origin) || isNaN(at)) return;
        var offset = (at - origin) / 1000;
        if (duration && (offset < 0 || offset > duration)) return;
        var mark = document.createElement("span");
        mark.className = "tl-mark";
        mark.style.left = pct(offset, duration);
        mark.title = decision.text || "";
        if (events) events.append(mark);
        marks += 1;
      });
    }
    var scrub = segments.length === 0 && mediaEvents.length === 0 && marks === 0;
    timeline.classList.toggle("is-scrub", scrub);
    placePlayhead(0, duration);
    reserveDockSpace();
  }

  function seekTo(seconds) {
    var video = document.getElementById("player-video");
    var duration = mediaDuration();
    var next = Math.max(0, Math.min(duration, seconds || 0));
    if (video && video.src) {
      video.currentTime = next;
    }
    placePlayhead(next, duration);
    text("tl-now", clockText(next));
    markTranscript(next);
  }

  function placePlayhead(seconds, duration) {
    var head = document.getElementById("tl-head");
    var plot = document.getElementById("tl-ruler");
    if (!head || !plot || !duration) return;
    if (head.parentNode !== plot) plot.append(head);
    head.hidden = false;
    head.style.left = pct(seconds, duration);
  }

  function markTranscript(seconds) {
    document.querySelectorAll("#file-transcript .utter").forEach(function (row) {
      var start = Number(row.getAttribute("data-start") || 0);
      var end = Number(row.getAttribute("data-end") || start + 2);
      row.classList.toggle("active", seconds >= start && seconds < end);
    });
  }

  var mediaFlight = "";

  function loadRoomMedia() {
    var room = roomOf(fileRoom);
    var channel = room && /slack/i.test(room.platform || "");
    if (!fileRoom || channel) {
      roomMediaState = channel ? { state: "channel", title: roomName(room) } : { state: "none" };
      paintPlayer(roomMediaState);
      paintArtifacts(roomMediaState);
      renderTranscript(fileRoom ? decisionsFor(fileRoom) : []);
      paintTimeline();
      return;
    }
    if (mediaFlight === fileRoom || (roomMediaState && roomMediaState.forRoom === fileRoom)) return;
    var asked = fileRoom;
    mediaFlight = asked;
    fetch("/console/rooms/" + encodeURIComponent(asked) + "/media").then(function (response) {
      if (!response.ok) throw new Error("media");
      return response.json();
    }).then(function (media) {
      if (!media) return;
      roomMediaState = media;
      roomMediaState.forRoom = asked;
      if (media.title && room && !room.name) {
        room.name = media.title;
        text("file-title", media.title);
        if (sectionName === "file") setViewTitle(media.title);
      }
      paintPlayer(media);
      paintArtifacts(media);
      paintFactsMedia(media);
      if (media.startedAt) {
        var roomLive = roomOf(fileRoom);
        if (roomLive) {
          roomLive.startedAt = media.startedAt;
          roomLive.recordingStart = media.startedAt;
        }
        var stamp = relativeWhen(media.startedAt) || whenLabel(media.startedAt) || blankMark();
        text("file-started", stamp);
        var startedRow = document.getElementById("file-started-item");
        if (startedRow) startedRow.hidden = !stamp || stamp === blankMark();
        renderFacts(roomLive || room || {}, { when: media.startedAt }, fileRoom ? decisionsFor(fileRoom) : []);
      }
      renderTranscript(fileRoom ? decisionsFor(fileRoom) : []);
      loadSpeakerLanes().then(function () { paintTimeline(); });
    }).catch(function () {
      roomMediaState = { state: "none" };
      paintPlayer(roomMediaState);
      paintArtifacts(roomMediaState);
      renderTranscript(fileRoom ? decisionsFor(fileRoom) : []);
    }).finally(function () {
      if (mediaFlight === asked) mediaFlight = "";
    });
  }

  function paintFactsMedia(media) {
    var box = document.getElementById("overview-facts");
    if (box) box.replaceChildren();
    var statusBadge = document.getElementById("file-status-badge");
    if (statusBadge && media && media.state && !document.body.classList.contains("room-missing")) {
      var mediaWord = media.state === "processing"
        ? { word: "Live", badge: "badge live" }
        : (media.state === "ready" || media.state === "novideo" || media.state === "expired")
          ? { word: "Ended", badge: "badge" }
          : media.state === "channel"
            ? { word: "Channel", badge: "badge" }
            : meetingWord(roomOf(fileRoom));
      if (mediaWord) {
        statusBadge.className = mediaWord.badge;
        statusBadge.textContent = mediaWord.word;
      }
    }
    var usageItem = document.getElementById("file-usage-item");
    var usage = document.getElementById("file-usage");
    if (usage && media && media.duration) {
      usage.textContent = clockText(media.duration);
      if (usageItem) usageItem.hidden = false;
    } else if (usageItem) usageItem.hidden = true;
  }

  function outsideFor(roomId) {
    return ((state && state.access) || []).filter(function (row) { return row.roomId === roomId; });
  }

  function renderOutside() {
    var rows = fileRoom ? outsideFor(fileRoom) : [];
    var outsideBlock = document.getElementById("outside-block");
    if (outsideBlock) outsideBlock.hidden = rows.length === 0;
    var heading = document.getElementById("outside-heading");
    if (heading) heading.hidden = rows.length === 0;
    clear("file-outside");
    rows.forEach(function (row) {
      var line = document.createElement("p");
      line.textContent = (row.speaker || "Someone") + " asked. No sentence is shown.";
      document.getElementById("file-outside").append(line);
    });
  }

  function openFile(roomId) {
    if (sectionName !== "file") returnSection = sectionName === "rooms" ? "rooms" : "home";
    fileWait = null;
    fileRoom = roomId || "";
    text("room-edit-note", "");
    text("file-action-note", "");
    renderFile();
    showSection("file");
    var close = document.querySelector("#file-dialog .close");
    if (close) close.focus();
  }

  function openWaiting(spec) {
    fileRoom = "";
    fileWait = spec;
    text("room-edit-note", "");
    text("file-action-note", "");
    renderFile();
    showSection("file");
  }

  function plainRoom(id) {
    if (!id) return false;
    for (var i = 0; i < id.length; i += 1) {
      var code = id.charCodeAt(i);
      var ok = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || code === 95;
      if (!ok) return false;
    }
    return true;
  }

  function saveToolAsk(tool, on) {
    var boxId = tool === "calendar" ? "cal-ask" : tool === "linear" ? "lin-ask" : "slack-ask";
    var line = tool === "calendar" ? "cal-line" : tool === "linear" ? "lin-line" : "slack-line";
    var box = document.getElementById(boxId);
    var value = on ? "do" : "ask";
    text(line, "Saving Run automatically.");
    fetch("/api/typed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "set " + tool + " to " + value })
    }).then(function (response) { return response.json(); }).then(function (result) {
      return load().then(function () { return result; });
    }).then(function (result) {
      if (!wrote(result)) {
        box.checked = !on;
        text(line, result && result.allow === "missing-member" ? "This server has no member configured." : "Run automatically was not saved.");
      } else {
        text(line, "");
        toast("Saved.");
      }
    }).catch(function () {
      box.checked = !on;
      text(line, "The account could not be read. Read the account again.");
    });
  }

  function saveAsk(on) {
    var roomId = fileRoom;
    var box = document.getElementById("ask-first");
    if (!roomId || !plainRoom(roomId)) {
      box.checked = true;
      text("room-edit-note", "This room cannot be edited from here.");
      return;
    }
    var value = on ? "do" : "ask";
    text("room-edit-note", "Saving Run automatically.");
    var tools = ["linear", "calendar"];
    var pending = Promise.resolve();
    var failed = null;
    tools.forEach(function (tool) {
      pending = pending.then(function () {
        return fetch("/api/typed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "set " + tool + " to " + value + " in room " + roomId })
        }).then(function (response) { return response.json(); }).then(function (result) {
          if (!wrote(result)) failed = result;
        });
      });
    });
    pending.then(function () { return load(); }).then(function () {
      if (failed) box.checked = !on;
      if (failed && failed.allow === "missing-member") text("room-edit-note", "This server has no member configured.");
      else if (failed) text("room-edit-note", "Run automatically was not saved.");
      else text("room-edit-note", on ? "This room runs a change as soon as it is asked." : "This room does not run a change.");
    }).catch(function () {
      box.checked = !on;
      text("room-edit-note", "The account could not be read. Read the account again.");
    });
  }

  function postRoom(sentence, done, fail) {
    var roomId = fileRoom;
    if (!roomId || !plainRoom(roomId)) {
      text("room-edit-note", "This room cannot be edited from here.");
      if (fail) fail();
      return;
    }
    text("room-edit-note", "Saving this room.");
    fetch("/api/typed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sentence })
    }).then(function (response) { return response.json(); }).then(function (result) {
      return load().then(function () { return result; });
    }).then(function (result) {
      if (!wrote(result)) {
        text("room-edit-note", result && result.allow === "missing-member" ? "This server has no member configured." : "That change was not saved.");
        if (fail) fail();
        return;
      }
      if (done) done();
    }).catch(function () {
      if (fail) fail();
      text("room-edit-note", "The account could not be read. Read the account again.");
    });
  }

  function saveVoice(voice) {
    if (voice !== "short" && voice !== "plain" && voice !== "formal") return;
    postRoom("set voice to " + voice + " in room " + fileRoom, function () {
      text("room-edit-note", "This room uses " + voiceWord(voice) + ".");
    }, function () { renderFile(); });
  }

  function saveClash(on) {
    postRoom("set clash to " + (on ? "on" : "off") + " in room " + fileRoom, function () {
      text("room-edit-note", on ? "This room will raise a clash here." : "This room will not raise a clash.");
    }, function () { renderFile(); });
  }

  function meetingHost(link) {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function meetingKind(host) {
    if (host === "meet.google.com") return "Google Meet";
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
    if (host === "teams.microsoft.com" || host === "teams.live.com") return "Teams";
    if (host === "webex.com" || host.endsWith(".webex.com")) return "Webex";
    return "";
  }

  function offerEmptyStatus(button, emptyId) {
    if (!button) return;
    var empty = document.getElementById(emptyId);
    var open = !!(empty && !empty.hidden);
    var blocked = !!(document.getElementById("meet-block") || document.getElementById("slack-block"));
    if (!(blocked && open)) {
      button.hidden = true;
      return;
    }
    if (emptyId === "history-empty" && historyScope === "you" && !member()) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = "See Setup";
    button.classList.remove("primary");
    button.setAttribute("data-act", "status");
  }

  function syncRoomLabels() {
    var homeLabel = document.querySelector("#new-room .room-label");
    var homeButton = document.getElementById("new-room");
    if (homeButton) homeButton.classList.add("primary");
    if (homeLabel) homeLabel.textContent = "New room";
    var plus = homeButton ? homeButton.querySelector(".ic") : null;
    if (plus) plus.hidden = false;
    offerEmptyStatus(document.getElementById("record-next"), "record-empty");
    var chatNext = document.getElementById("chat-next");
    if (chatNext) chatNext.hidden = true;
    offerEmptyStatus(document.getElementById("history-next"), "history-empty");
    offerEmptyStatus(document.getElementById("people-next"), "people-empty");
  }

  function pickDoor(meeting) {
    var choices = document.querySelector("#create-dialog .choices");
    var blockedPanel = document.getElementById("room-blocked");
    if (choices) choices.hidden = false;
    if (blockedPanel) blockedPanel.hidden = true;
    document.getElementById("pick-meeting").setAttribute("aria-pressed", meeting ? "true" : "false");
    document.getElementById("pick-channel").setAttribute("aria-pressed", meeting ? "false" : "true");
    document.getElementById("meet-form").hidden = !meeting;
    document.getElementById("channel-door").hidden = meeting;
    text("create-title", "New room");
    syncJoinReady();
    if (!meeting) showLine("channel-setup", "");
  }

  function consoleQuery() {
    var q = "?workspace=" + encodeURIComponent(workspaceKind);
    var company = consoleSpaces && consoleSpaces.activeId && consoleSpaces.activeKind !== "personal"
      ? String(consoleSpaces.activeId)
      : "";
    if (company) q += "&company=" + encodeURIComponent(company);
    return q;
  }

  function closeMenu() {
    document.getElementById("workspace-menu").hidden = true;
    var chip = document.getElementById("workspace-chip");
    chip.setAttribute("aria-expanded", "false");
    chip.classList.remove("open");
  }

  function openMenu() {
    var menu = document.getElementById("workspace-menu");
    menu.hidden = false;
    var chip = document.getElementById("workspace-chip");
    chip.setAttribute("aria-expanded", "true");
    chip.classList.add("open");
    syncWorkspaceMenu();
    if (consoleSpaces && consoleSpaces.oauth) {
      var current = menu.querySelector("[role='menuitemradio'][aria-checked='true']") || menu.querySelector("[role='menuitem']");
      if (current) current.focus();
      return;
    }
    var next = menu.querySelector('[data-workspace="' + workspaceKind + '"]');
    if (next) next.focus();
  }

  function setWorkspace(kind) {
    if (kind !== "company" && kind !== "personal") return;
    var changed = kind !== workspaceKind;
    workspaceKind = kind;
    closeMenu();
    closeDialog("decision-dialog");
    closeDialog("create-dialog");
    closeDialog("file-dialog");
    closeDialog("workspace-dialog");
    closeDialog("space-dialog");
    if (!home.hidden) showSection("home");
    paintChip();
    if (!changed) return;
    document.getElementById("chat-text").value = "";
    document.querySelectorAll("#chat-log .chat-turn").forEach(function (node) { node.remove(); });
    var emptyChat = document.getElementById("chat-empty");
    if (emptyChat) emptyChat.hidden = false;
    showHomeSkeleton(true);
    load();
  }

  function dropTrail(value) {
    return String(value || "").split("\\n").filter(function (line) {
      var trimmed = line.trim();
      return !/^(?:preference|checkpoint) [a-z0-9-]+$/i.test(trimmed);
    }).join("\\n").trim();
  }

  function armSlow() {
    if (slowTimer) return;
    slowTimer = setTimeout(function () {
      // Keep the skeleton path only — never surface the error/Retry chrome for a slow read.
      var label = document.getElementById("loading-label");
      if (label) label.textContent = "Still working…";
      var quiet = document.querySelector("#loading .sr");
      if (quiet) quiet.textContent = "Still working…";
      var onboardReading = document.getElementById("onboard-reading");
      if (onboardReading && !onboardReading.hidden) onboardReading.textContent = "Still working…";
    }, 10000);
  }

  function load() {
    var token = loadToken + 1;
    loadToken = token;
    armSlow();
    return fetch("/api/console" + consoleQuery()).then(function (response) {
      if (response.status === 401) {
        location.href = "/console/sign-in?reason=expired&next=" + encodeURIComponent(location.pathname);
        return null;
      }
      if (!response.ok) throw new Error("unread");
      return response.json();
    }).then(function (next) {
      if (!next || token !== loadToken) return;
      paint(next);
    }).catch(function () {
      if (token !== loadToken) return;
      document.getElementById("loading").hidden = true;
      showRetry(true, homeErrorCopy("The account could not be read."));
      text("status", "");
    });
  }

  document.querySelectorAll("[data-connect]").forEach(function (button) {
    button.addEventListener("click", function () {
      var which = button.getAttribute("data-connect");
      var url = "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server";
      if (which === "linear") url = "https://linear.app/docs/mcp";
      if (which === "slack") url = "https://docs.slack.dev/ai/slack-mcp-server";
      window.open(url, "_blank", "noopener");
      text("connector-who", "Finish in the window that opened, then come back here. This page never asks for a key.");
    });
  });
  window.addEventListener("focus", function () { load(); });
  document.getElementById("crumb-home").addEventListener("click", function () {
    showSection("home");
  });
  document.getElementById("workspace-chip").addEventListener("click", function (event) {
    event.stopPropagation();
    if (document.getElementById("workspace-menu").hidden) openMenu();
    else closeMenu();
  });
  document.getElementById("workspace-menu").addEventListener("click", function (event) {
    event.stopPropagation();
  });
  document.querySelectorAll("[data-workspace]").forEach(function (button) {
    button.addEventListener("click", function () {
      setWorkspace(button.getAttribute("data-workspace"));
    });
  });
  document.getElementById("create-workspace").addEventListener("click", function () {
    closeMenu();
    if (consoleSpaces && consoleSpaces.oauth) openDialog("space-dialog");
    else openDialog("workspace-dialog");
  });
  document.getElementById("workspace-menu").addEventListener("keydown", function (event) {
    if (!consoleSpaces || !consoleSpaces.oauth) return;
    var move = event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End";
    if (!move) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("#workspace-menu [role='menuitemradio'], #workspace-menu [role='menuitem']"));
    if (!items.length) return;
    var index = items.indexOf(document.activeElement);
    if (index < 0) index = 0;
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = items.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") index = (index + 1) % items.length;
    else index = (index + items.length - 1) % items.length;
    event.preventDefault();
    items.forEach(function (item, i) { item.tabIndex = i === index ? 0 : -1; });
    items[index].focus();
  });
  document.addEventListener("click", function () { closeMenu(); });
  document.getElementById("continue").addEventListener("click", function () {
    onboard.hidden = true;
    home.hidden = false;
    lockNav(false);
    showSection("home");
  });
  document.getElementById("open-connectors").addEventListener("click", function () {
    onboard.hidden = true;
    home.hidden = false;
    lockNav(false);
    showSection("home");
    document.getElementById("new-room").click();
  });
  document.getElementById("ask-ai-connectors").addEventListener("click", function () {
    closeDialog("ask-ai-dialog");
    showSection("mcp");
  });
  document.getElementById("history-next").addEventListener("click", function () {
    var act = document.getElementById("history-next").getAttribute("data-act");
    if (act === "home") {
      showSection("home");
      return;
    }
    if (act === "status") {
      showSection("connectors");
      return;
    }
    if (act === "name") {
      document.getElementById("account").click();
      return;
    }
    document.getElementById("new-room").click();
  });
  function openNext(button) {
    if (button.getAttribute("data-act") === "status") {
      showSection("connectors");
      return;
    }
    document.getElementById("new-room").click();
  }
  document.getElementById("record-next").addEventListener("click", function () {
    openNext(document.getElementById("record-next"));
  });
  document.getElementById("chat-next").addEventListener("click", function () {
    openNext(document.getElementById("chat-next"));
  });
  document.getElementById("people-next").addEventListener("click", function () {
    openNext(document.getElementById("people-next"));
  });
  document.getElementById("channel-connectors").addEventListener("click", function () {
    closeDialog("create-dialog");
    if (home.hidden) return;
    showSection("connectors");
  });
  document.getElementById("meet-connectors").addEventListener("click", function () {
    closeDialog("create-dialog");
    if (home.hidden) return;
    showSection("connectors");
  });

  document.getElementById("rail-prev").addEventListener("click", function () { stepRail(-1); });
  document.getElementById("rail-next").addEventListener("click", function () { stepRail(1); });
  document.querySelector(".rail").addEventListener("scroll", syncRail);
  window.addEventListener("resize", function () {
    fitChips();
    reserveComposer();
    placeRoomChrome();
    reserveDockSpace();
    if (!window.matchMedia("(max-width: 767px)").matches) {
      try {
        if (localStorage.getItem("sederunt-rail") === "collapsed") document.body.classList.add("rail-collapsed");
      } catch (error) { /* ignore */ }
    }
    placeAskHelp();
    placeNameRow();
    var rail = document.querySelector(".rail");
    if (!rail) return;
    var current = rail.querySelector("[aria-current='page']");
    if (current) showRailButton(current);
    else {
      fitRailEnd();
      syncRail();
    }
  });
  var skipLink = document.querySelector(".skip-link");
  if (skipLink) skipLink.addEventListener("click", function (event) {
    var main = document.getElementById("main");
    if (!main) return;
    event.preventDefault();
    main.focus();
  });
  var secretLink = document.getElementById("set-console-secret");
  if (secretLink) secretLink.addEventListener("click", function (event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    leaveOnboard();
    showSection("connectors");
    var secretCard = document.getElementById("console-secret");
    if (secretCard && secretCard.scrollIntoView) secretCard.scrollIntoView({ block: "start" });
  });
  document.querySelectorAll(".rail [data-show], #show-connectors").forEach(function (button) {
    button.addEventListener("click", function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (button.getAttribute("aria-disabled") === "true") return;
      leaveOnboard();
      showSection(button.getAttribute("data-show") || "connectors");
    });
  });
  function shouldAsk(tool) {
    if (!toolAsk || !toolAsk.oauth) return false;
    if (toolAsk.connected && toolAsk.connected[tool]) return false;
    var pref = toolAsk.prefs ? toolAsk.prefs[tool] : "";
    if (pref === "connect" || pref === "never") return false;
    return true;
  }

  function revealCalendarAsk() {
    var card = document.getElementById("tool-ask-calendar");
    if (!card) return false;
    card.hidden = false;
    calendarAskPlaced = true;
    return true;
  }

  function syncCalendarAsk() {
    if (calendarAskPlaced || sectionName !== "home" || !shouldAsk("calendar")) return;
    revealCalendarAsk();
  }

  function saveToolChoice(tool, choice) {
    return fetch("/console/tool-prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: tool, choice: choice })
    }).then(function (response) {
      if (!response.ok) throw new Error("no");
      return response.json();
    }).then(function (result) {
      if (!toolAsk.prefs) toolAsk.prefs = {};
      if (result && result.prefs) toolAsk.prefs = result.prefs;
      else toolAsk.prefs[tool] = choice;
    });
  }

  function calendarConnected() {
    if (state && state.doors && typeof state.doors.calendar === "boolean") return state.doors.calendar;
    return !!(toolAsk && toolAsk.connected && toolAsk.connected.calendar);
  }

  function showCalendarAsk() {
    showSection("home");
    var card = document.getElementById("tool-ask-calendar");
    if (!card) {
      toast("Calendar is not connected.");
      return;
    }
    card.hidden = false;
    var connect = card.querySelector("[data-tool-choice='connect']");
    if (connect) connect.focus();
  }

  function isGuestBreak(ch) {
    var code = ch.charCodeAt(0);
    return ch === " " || ch === "," || ch === ";" || code === 10 || code === 13 || code === 9;
  }

  function hasGuestBreak(value) {
    var text = String(value || "");
    for (var i = 0; i < text.length; i += 1) {
      if (isGuestBreak(text.charAt(i))) return true;
    }
    return false;
  }

  function guestParts(raw) {
    var text = String(raw || "").trim();
    var parts = [];
    var current = "";
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (isGuestBreak(ch)) {
        if (current) parts.push(current);
        current = "";
      } else current += ch;
    }
    if (current) parts.push(current);
    return parts;
  }

  function validGuestEmail(value) {
    var email = String(value || "").trim();
    if (!email || email.length > 254) return "";
    var at = email.indexOf("@");
    if (at < 1 || at !== email.lastIndexOf("@")) return "";
    var local = email.slice(0, at);
    var domain = email.slice(at + 1);
    if (!local || !domain || domain.indexOf(".") < 1) return "";
    if (domain.charAt(domain.length - 1) === ".") return "";
    if (local.indexOf(" ") !== -1 || domain.indexOf(" ") !== -1) return "";
    return email;
  }

  function eventWhenText(start, end) {
    var open = "";
    var close = "";
    try {
      open = start ? formatConsoleWhen(start) : "";
      close = end ? formatConsoleWhen(end) : "";
    } catch (error) {
      open = "";
      close = "";
    }
    if (open && close) {
      var sameDay = false;
      try {
        sameDay = formatConsoleWhen(start, { part: "day" }) === formatConsoleWhen(end, { part: "day" });
      } catch (error) {
        sameDay = false;
      }
      var clock = sameDay ? formatConsoleWhen(end, { part: "clock" }) : "";
      return open + " – " + (clock || close);
    }
    return open || close || "";
  }

  function paintMeetings() {
    var box = document.getElementById("meeting-rows");
    var list = document.getElementById("meeting-list");
    if (!box || !list) return;
    var meetings = (state && state.meetings) || [];
    var failed = state && state.read === "failed";
    var onHome = sectionName === "home";
    var heading = document.getElementById("meeting-heading");
    var more = document.getElementById("meetings-more");
    // Home lists every upcoming meeting the calendar returned, soonest first.
    if (heading) heading.textContent = onHome ? (meetings.length === 1 ? "Next meeting" : "Upcoming meetings") : "Meetings";
    if (more) more.hidden = true;
    var shown = meetings;
    box.hidden = failed || meetings.length === 0;
    list.replaceChildren();
    if (box.hidden) return;
    shown.forEach(function (meeting) {
      if (!meeting || !meeting.id) return;
      var row = document.createElement("div");
      row.className = "meeting-row";
      var copy = document.createElement("div");
      copy.className = "meeting-copy";
      var title = document.createElement("strong");
      title.textContent = meeting.title || "Meeting";
      var when = document.createElement("span");
      when.className = "meta";
      when.textContent = eventWhenText(meeting.start, meeting.end);
      copy.append(title, when);
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Edit details";
      edit.setAttribute("data-edit-event", meeting.id);
      edit.setAttribute("aria-haspopup", "dialog");
      if (meeting.readOnly) edit.setAttribute("data-readonly", "true");
      row.append(copy, edit);
      list.append(row);
    });
  }

  function showEventError(message) {
    var node = document.getElementById("event-error");
    var retry = document.getElementById("event-retry");
    if (node) {
      node.textContent = message || "";
      node.hidden = !message;
    }
    if (retry) {
      retry.hidden = !message;
      if (message) retry.focus();
    }
  }

  function showEmailError(message) {
    var node = document.getElementById("event-email-error");
    var input = document.getElementById("event-email");
    if (node) {
      node.textContent = message || "";
      node.hidden = !message;
    }
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function syncEventDraftFromForm() {
    if (!eventDraft) return;
    var desc = document.getElementById("event-description");
    var notify = document.getElementById("event-notify");
    if (desc) eventDraft.description = desc.value;
    if (notify) eventDraft.notify = !!notify.checked;
  }

  function eventStamp() {
    if (!eventDraft) return "";
    syncEventDraftFromForm();
    var emails = [];
    for (var i = 0; i < eventDraft.attendees.length; i += 1) emails.push(String(eventDraft.attendees[i].email || "").toLowerCase());
    return JSON.stringify({
      description: eventDraft.description || "",
      notify: eventDraft.notify !== false,
      emails: emails
    });
  }

  function eventDirty() {
    if (!eventDraft || !eventLoaded || eventDraft.readOnly) return false;
    var pending = document.getElementById("event-email");
    if (pending && pending.value.trim()) return true;
    return eventStamp() !== eventSnapshot;
  }

  function fieldsLocked() {
    if (!eventDraft) return true;
    return eventDraft.readOnly === true || eventSaving || !eventLoaded;
  }

  function syncNotifyHelp() {
    var notify = document.getElementById("event-notify");
    var help = document.getElementById("event-notify-help");
    if (!notify || !help) return;
    help.textContent = notify.checked ? "Guests receive an email about this change." : "Guests won't get an email about this change.";
  }

  function applyEventMode() {
    var readOnly = !!(eventDraft && eventDraft.readOnly);
    var locked = fieldsLocked();
    var description = document.getElementById("event-description");
    var email = document.getElementById("event-email");
    var add = document.getElementById("event-add");
    var notify = document.getElementById("event-notify");
    var save = document.getElementById("event-save");
    var note = document.getElementById("event-readonly");
    if (description) description.disabled = locked;
    if (email) email.disabled = locked;
    if (add) add.disabled = locked;
    if (notify) notify.disabled = locked;
    syncNotifyHelp();
    if (save) {
      save.hidden = readOnly;
      save.disabled = locked || readOnly;
    }
    if (note) note.hidden = !readOnly;
  }

  function paintEventGuests() {
    var list = document.getElementById("event-guests");
    if (!list || !eventDraft) return;
    list.replaceChildren();
    eventDraft.attendees.forEach(function (guest, index) {
      var item = document.createElement("li");
      item.className = "guest-row";
      item.setAttribute("data-email", guest.email);
      if (guest.organizer) item.setAttribute("data-organizer", "true");
      var copy = document.createElement("span");
      copy.className = "guest-copy";
      var who = document.createElement("span");
      who.className = "guest-name";
      who.textContent = guest.name || guest.email;
      copy.append(who);
      if (guest.name && guest.name !== guest.email) {
        var mail = document.createElement("span");
        mail.className = "guest-mail";
        mail.textContent = guest.email;
        copy.append(mail);
      }
      if (guest.organizer) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Organizer";
        copy.append(badge);
      }
      item.append(copy);
      if (!guest.organizer && !eventDraft.readOnly) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "secondary guest-remove";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + guest.email);
        remove.setAttribute("data-guest-index", String(index));
        item.append(remove);
      }
      list.append(item);
    });
  }

  function fillEventDialog() {
    if (!eventDraft) return;
    text("event-title", eventDraft.title || "Meeting");
    text("event-when", eventWhenText(eventDraft.start, eventDraft.end));
    var desc = document.getElementById("event-description");
    if (desc) desc.value = eventDraft.description || "";
    var notify = document.getElementById("event-notify");
    if (notify) notify.checked = eventDraft.notify !== false;
    paintEventGuests();
    applyEventMode();
  }

  function addGuestEmails(raw) {
    if (!eventDraft || eventDraft.readOnly) return false;
    var parts = guestParts(raw);
    if (!parts.length) {
      showEmailError("Enter a valid email address.");
      return false;
    }
    var next = eventDraft.attendees.slice();
    for (var i = 0; i < parts.length; i += 1) {
      var email = validGuestEmail(parts[i]);
      if (!email) {
        showEmailError("Enter a valid email address.");
        return false;
      }
      var key = email.toLowerCase();
      var exists = false;
      for (var j = 0; j < next.length; j += 1) {
        if (String(next[j].email || "").toLowerCase() === key) exists = true;
      }
      if (exists) {
        showEmailError(email + " is already invited.");
        return false;
      }
      if (next.length >= 100) {
        showEmailError("A meeting can have at most 100 guests.");
        return false;
      }
      next.push({ email: email, name: "", organizer: false });
    }
    eventDraft.attendees = next;
    showEmailError("");
    var input = document.getElementById("event-email");
    if (input) input.value = "";
    paintEventGuests();
    return true;
  }

  function loadEventDetails(id) {
    var token = eventLoadToken + 1;
    eventLoadToken = token;
    var dialog = document.getElementById("event-dialog");
    if (dialog) dialog.setAttribute("aria-busy", "true");
    fetch("/console/calendar/events/" + encodeURIComponent(id), { headers: { accept: "application/json" } })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, body: body };
        }, function () {
          return { ok: false, body: null };
        });
      })
      .then(function (result) {
        if (token !== eventLoadToken) return;
        if (dialog) dialog.removeAttribute("aria-busy");
        var still = document.getElementById("event-dialog");
        if (!still || still.hidden || !eventDraft || eventDraft.id !== id) return;
        if (!result.body || result.body.ok === false) {
          eventLoaded = false;
          applyEventMode();
          showEventError((result.body && result.body.message) || "That meeting could not be read.");
          return;
        }
        var event = result.body.event || {};
        var attendees = [];
        var list = event.attendees || [];
        for (var i = 0; i < list.length; i += 1) {
          var guest = list[i] || {};
          if (!guest.email) continue;
          attendees.push({
            email: String(guest.email),
            name: guest.name ? String(guest.name) : "",
            responseStatus: guest.responseStatus ? String(guest.responseStatus) : "",
            organizer: guest.organizer === true
          });
        }
        eventDraft = {
          id: event.id || id,
          title: event.title || "Meeting",
          start: event.start || "",
          end: event.end || "",
          description: typeof event.description === "string" ? event.description : "",
          attendees: attendees,
          readOnly: event.readOnly === true,
          notify: true
        };
        eventLoaded = true;
        showEventError("");
        fillEventDialog();
        eventSnapshot = eventStamp();
        var desc = document.getElementById("event-description");
        if (desc && !desc.disabled) desc.focus();
      })
      .catch(function () {
        if (token !== eventLoadToken) return;
        if (dialog) dialog.removeAttribute("aria-busy");
        if (!eventDraft || eventDraft.id !== id) return;
        eventLoaded = false;
        applyEventMode();
        showEventError("Calendar could not be reached. Try again.");
      });
  }

  function saveEventDetails() {
    if (!eventDraft || eventDraft.readOnly || eventSaving || !eventLoaded) return;
    var pending = document.getElementById("event-email");
    if (pending && pending.value.trim()) {
      if (!addGuestEmails(pending.value)) return;
    }
    syncEventDraftFromForm();
    setSaving(true);
    showEventError("");
    var id = eventDraft.id;
    var token = eventLoadToken;
    fetch("/console/calendar/events/" + encodeURIComponent(id), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        description: eventDraft.description || "",
        attendees: eventDraft.attendees.map(function (guest) { return guest.email; }),
        notify: eventDraft.notify !== false
      })
    }).then(function (response) {
      return response.json().then(function (body) {
        return { ok: response.ok, body: body };
      }, function () {
        return { ok: false, body: null };
      });
    }).then(function (result) {
      if (!eventDraft || eventDraft.id !== id || token !== eventLoadToken) return;
      setSaving(false);
      if (!result.body || result.body.ok === false) {
        if (result.body && result.body.error === "read-only" && eventDraft) {
          eventDraft.readOnly = true;
          fillEventDialog();
        }
        showEventError((result.body && result.body.message) || "Calendar could not be reached. Try again.");
        return;
      }
      if (result.body.event && typeof result.body.event.description === "string") {
        eventDraft.description = result.body.event.description;
      }
      eventSnapshot = eventStamp();
      var changed = result.body.changed !== false;
      var notified = changed && result.body.sendUpdates !== "none";
      eventForceClose = true;
      closeDialog("event-dialog");
      toast(!changed ? "No changes to save." : (notified ? "Saved. Guests were notified." : "Saved without notifying guests."));
    }).catch(function () {
      if (!eventDraft || eventDraft.id !== id) return;
      setSaving(false);
      showEventError("Calendar could not be reached. Try again.");
    });
  }

  function setSaving(on) {
    eventSaving = on;
    var dialog = document.getElementById("event-dialog");
    if (dialog) {
      if (on) dialog.setAttribute("aria-busy", "true");
      else dialog.removeAttribute("aria-busy");
    }
    var save = document.getElementById("event-save");
    if (save) {
      if (on) save.setAttribute("aria-busy", "true");
      else save.removeAttribute("aria-busy");
      save.textContent = on ? "Saving…" : "Save";
    }
    applyEventMode();
  }

  function openEventEditor(id, readOnlyHint) {
    if (!id) return;
    if (!calendarConnected()) {
      if (shouldAsk("calendar")) {
        showCalendarAsk();
        return;
      }
      toast("Calendar is not connected.");
      return;
    }
    eventDraft = {
      id: id,
      title: "Meeting",
      start: "",
      end: "",
      description: "",
      attendees: [],
      readOnly: readOnlyHint === true,
      notify: true
    };
    eventLoaded = false;
    eventSaving = false;
    eventSnapshot = "";
    showEventError("");
    showEmailError("");
    var discard = document.getElementById("event-discard");
    if (discard) discard.hidden = true;
    var emailInput = document.getElementById("event-email");
    if (emailInput) emailInput.value = "";
    fillEventDialog();
    openDialog("event-dialog");
    loadEventDetails(id);
  }

  function eventFocusable() {
    var dialog = document.getElementById("event-dialog");
    if (!dialog || dialog.hidden) return [];
    var nodes = dialog.querySelectorAll("button, textarea, input, a[href]");
    var list = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.disabled || node.hidden) continue;
      if (node.closest("[hidden]")) continue;
      list.push(node);
    }
    return list;
  }

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-edit-event]") : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openEventEditor(button.getAttribute("data-edit-event"), button.getAttribute("data-readonly") === "true");
  }, true);

  var eventGuestList = document.getElementById("event-guests");
  if (eventGuestList) eventGuestList.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-guest-index]") : null;
    if (!button || !eventDraft || eventDraft.readOnly) return;
    var index = Number(button.getAttribute("data-guest-index"));
    var guest = eventDraft.attendees[index];
    if (!guest || guest.organizer) return;
    eventDraft.attendees.splice(index, 1);
    paintEventGuests();
    var nextFocus = document.querySelector("#event-guests .guest-remove") || document.getElementById("event-email");
    if (nextFocus && !nextFocus.disabled) nextFocus.focus();
  });

  var eventEmail = document.getElementById("event-email");
  if (eventEmail) {
    eventEmail.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addGuestEmails(eventEmail.value);
    });
    eventEmail.addEventListener("paste", function (event) {
      var data = event.clipboardData || window.clipboardData;
      var pasted = data ? data.getData("text") : "";
      if (!pasted || !hasGuestBreak(pasted)) return;
      event.preventDefault();
      addGuestEmails(pasted);
    });
    eventEmail.addEventListener("input", function () {
      if (eventEmail.getAttribute("aria-invalid") === "true") showEmailError("");
    });
  }
  var eventNotify = document.getElementById("event-notify");
  if (eventNotify) eventNotify.addEventListener("change", syncNotifyHelp);
  var eventAdd = document.getElementById("event-add");
  if (eventAdd) eventAdd.addEventListener("click", function () {
    addGuestEmails(eventEmail ? eventEmail.value : "");
  });
  var eventSave = document.getElementById("event-save");
  if (eventSave) eventSave.addEventListener("click", saveEventDetails);
  var eventRetry = document.getElementById("event-retry");
  if (eventRetry) eventRetry.addEventListener("click", function () {
    if (!eventDraft) return;
    showEventError("");
    if (!eventLoaded) loadEventDetails(eventDraft.id);
    else saveEventDetails();
  });
  var eventKeep = document.getElementById("event-keep");
  if (eventKeep) eventKeep.addEventListener("click", function () {
    var box = document.getElementById("event-discard");
    if (box) box.hidden = true;
    var desc = document.getElementById("event-description");
    if (desc && !desc.disabled) desc.focus();
    else if (eventEmail && !eventEmail.disabled) eventEmail.focus();
  });
  var eventDiscardConfirm = document.getElementById("event-discard-confirm");
  if (eventDiscardConfirm) eventDiscardConfirm.addEventListener("click", function () {
    eventForceClose = true;
    closeDialog("event-dialog");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var dialog = document.getElementById("event-dialog");
    if (!dialog || dialog.hidden) return;
    var list = eventFocusable();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    var inside = false;
    for (var i = 0; i < list.length; i += 1) if (list[i] === active) inside = true;
    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function onHomeAddMeeting() {
    if (shouldAsk("calendar") && revealCalendarAsk()) return;
    document.getElementById("new-room").click();
  }
  var homeAdd = document.getElementById("home-add-meeting");
  if (homeAdd) homeAdd.addEventListener("click", onHomeAddMeeting);
  var homeAddToMeeting = document.getElementById("home-add-to-meeting");
  if (homeAddToMeeting) homeAddToMeeting.addEventListener("click", onHomeAddMeeting);
  var checklistAdd = document.getElementById("checklist-add-meeting");
  if (checklistAdd) checklistAdd.addEventListener("click", onHomeAddMeeting);
  var checklist = document.getElementById("home-checklist");
  if (checklist) {
    var checklistKey = "sederunt-checklist-hidden:" + checklist.getAttribute("data-tenant");
    try { if (localStorage.getItem(checklistKey) === "1") checklist.hidden = true; } catch (error) { /* private mode */ }
    var checklistClose = document.getElementById("checklist-dismiss");
    if (checklistClose) checklistClose.addEventListener("click", function () {
      checklist.hidden = true;
      try { localStorage.setItem(checklistKey, "1"); } catch (error) { /* private mode */ }
    });
  }
  var homeConnect = document.getElementById("home-connect-tools");
  if (homeConnect) homeConnect.addEventListener("click", function (event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    leaveOnboard();
    showSection("connectors");
  });
  document.getElementById("new-room").addEventListener("click", function () {
    text("join-status", "");
    pickDoor(true);
    openDialog("create-dialog");
    var linkLabel = document.getElementById("meet-link-label");
    if (linkLabel && !linkLabel.hidden) document.getElementById("meet-link").focus();
  });
  document.getElementById("pick-meeting").addEventListener("click", function () { pickDoor(true); });
  document.getElementById("pick-channel").addEventListener("click", function () {
    pickDoor(false);
    var card = document.getElementById("tool-ask-slack");
    if (card) card.hidden = !shouldAsk("slack");
  });
  var fileTicket = document.getElementById("file-ticket");
  if (fileTicket) fileTicket.addEventListener("click", function () {
    var card = document.getElementById("tool-ask-linear");
    if (shouldAsk("linear") && card) {
      card.hidden = false;
      return;
    }
    closeDialog("decision-dialog");
    showSection("connectors");
  });
  document.querySelectorAll(".tool-need [data-tool-choice]").forEach(function (button) {
    button.addEventListener("click", function () {
      var card = button.closest(".tool-need");
      if (!card) return;
      var tool = card.getAttribute("data-tool");
      var choice = button.getAttribute("data-tool-choice");
      var error = card.querySelector(".tool-need-error");
      if (error) error.hidden = true;
      saveToolChoice(tool, choice).then(function () {
        card.hidden = true;
        if (choice === "connect") {
          location.href = "/console/setup";
          return;
        }
        if (tool === "calendar" && choice === "later") document.getElementById("new-room").click();
      }).catch(function () {
        if (!error) return;
        error.hidden = false;
        error.textContent = "That could not be saved. Try again.";
      });
    });
  });
  document.querySelectorAll("[data-close]").forEach(function (node) {
    node.addEventListener("click", function (event) {
      event.stopPropagation();
      closeDialog(node.getAttribute("data-close"));
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (document.body.classList.contains("nav-open")) {
      closeNav();
      return;
    }
    var eventDialog = document.getElementById("event-dialog");
    if (eventDialog && !eventDialog.hidden) {
      var discardOpen = document.getElementById("event-discard");
      if (discardOpen && !discardOpen.hidden) {
        discardOpen.hidden = true;
        return;
      }
      closeDialog("event-dialog");
      return;
    }
    var mcpDialog = document.getElementById("mcp-dialog");
    if (mcpDialog && !mcpDialog.hidden) { closeDialog("mcp-dialog"); return; }
    var mcpTokenDialog = document.getElementById("mcp-token-dialog");
    if (mcpTokenDialog && !mcpTokenDialog.hidden) { closeDialog("mcp-token-dialog"); return; }
    var mcpRemoveDialog = document.getElementById("mcp-remove-dialog");
    if (mcpRemoveDialog && !mcpRemoveDialog.hidden) { closeDialog("mcp-remove-dialog"); return; }
    var mcpManageDialog = document.getElementById("mcp-manage-dialog");
    if (mcpManageDialog && !mcpManageDialog.hidden) { closeMcpManage(); return; }
    if (!document.getElementById("account-menu").hidden) closeAccountMenu();
    else if (!document.getElementById("profile-dialog").hidden) closeDialog("profile-dialog");
    else if (!document.getElementById("palette").hidden) closePalette();
    else if (document.getElementById("proof-dialog") && !document.getElementById("proof-dialog").hidden) closeDialog("proof-dialog");
    else if (!document.getElementById("decision-dialog").hidden) closeDialog("decision-dialog");
    else if (!document.getElementById("create-dialog").hidden) closeDialog("create-dialog");
    else if (!document.getElementById("file-dialog").hidden) closeDialog("file-dialog");
    else if (!document.getElementById("workspace-dialog").hidden) closeDialog("workspace-dialog");
    else if (document.getElementById("space-dialog") && !document.getElementById("space-dialog").hidden) closeDialog("space-dialog");
    else if (!document.getElementById("workspace-menu").hidden) closeMenu();
  });
  document.querySelectorAll("[data-scope]").forEach(function (button) {
    button.addEventListener("click", function () {
      historyScope = button.getAttribute("data-scope");
      setHistoryPressed();
      paintHistory();
    });
  });
  document.querySelectorAll("[data-kind]").forEach(function (button) {
    button.addEventListener("click", function () {
      historyKind = button.getAttribute("data-kind");
      setHistoryPressed();
      paintHistory();
    });
  });
  var historySearch = document.getElementById("history-search");
  if (historySearch) historySearch.addEventListener("input", function () { paintHistory(); });
  var historyRoom = document.getElementById("history-room");
  if (historyRoom) historyRoom.addEventListener("change", function () { paintHistory(); });
  document.getElementById("raise-clash").addEventListener("change", function () {
    var box = document.getElementById("raise-clash");
    if (!fileRoom) {
      if (!(fileWait && fileWait.wait)) {
        box.checked = false;
        return;
      }
      waitingClash = box.checked;
      text("clash-note", waitingClash ? "This room will raise a clash here. Nothing is sent from this page." : "");
      return;
    }
    saveClash(box.checked);
  });
  document.querySelectorAll("[data-voice]").forEach(function (button) {
    button.addEventListener("click", function () {
      var voice = button.getAttribute("data-voice");
      if (!fileRoom) {
        waitingVoice = voice || "plain";
        renderFile();
        return;
      }
      saveVoice(voice);
    });
  });
  document.getElementById("hearing-save").addEventListener("click", function () {
    var name = document.getElementById("hearing-name").value;
    var triggers = document.getElementById("hearing-triggers").value;
    var note = document.getElementById("hearing-note");
    if (note) note.textContent = "Saving the guest.";
    fetch("/api/hearing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, triggers: triggers })
    }).then(function (response) {
      return response.json().then(function (result) {
        return { ok: response.ok, result: result || {} };
      });
    }).then(function (payload) {
      var result = payload.result || {};
      if (!payload.ok || !result.hearing || !result.hearing.name) {
        if (note) note.textContent = result.error || "The guest was not saved.";
        return;
      }
      fillHearing(result.hearing);
      if (note) note.textContent = "";
      toast("Saved. The meeting guest is " + result.hearing.name + ".");
    }).catch(function () {
      if (note) note.textContent = "The guest was not saved.";
    });
  });
  document.getElementById("ask-first").addEventListener("change", function () {
    saveAsk(document.getElementById("ask-first").checked);
  });
  document.getElementById("cal-ask").addEventListener("change", function () {
    syncAskState(document.getElementById("cal-ask"));
    saveToolAsk("calendar", document.getElementById("cal-ask").checked);
  });
  document.getElementById("lin-ask").addEventListener("change", function () {
    syncAskState(document.getElementById("lin-ask"));
    saveToolAsk("linear", document.getElementById("lin-ask").checked);
  });
  document.getElementById("slack-ask").addEventListener("change", function () {
    syncAskState(document.getElementById("slack-ask"));
    saveToolAsk("slack", document.getElementById("slack-ask").checked);
  });
  document.getElementById("read-again").addEventListener("click", function () {
    readingTries = 0;
    var button = document.getElementById("read-again");
    if (button) {
      button.disabled = true;
      button.textContent = "Retrying...";
    }
    text("read-error-copy", "Retrying the read.");
    showHomeSkeleton(true);
    fetch("/api/console/read" + consoleQuery(), { method: "POST" }).then(function () {
      if (button) {
        button.disabled = false;
        button.textContent = "Try again";
      }
      return load();
    });
  });
  var decisionRoom = document.getElementById("decision-room");
  if (decisionRoom) decisionRoom.addEventListener("click", function (event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    var roomId = openDecisionRow && openDecisionRow.roomId;
    if (!roomId) return;
    event.preventDefault();
    closeDialog("decision-dialog");
    leaveOnboard();
    openFile(roomId);
  });
  var decisionCopy = document.getElementById("decision-copy");
  if (decisionCopy) decisionCopy.addEventListener("click", function () {
    var copied = decisionCopyText(openDecisionRow);
    var done = function () { toast("Copied."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copied).then(done, function () { toast("Copy did not work."); });
    } else toast("Copy did not work.");
  });
  var proofAgain = document.getElementById("proof-again");
  if (proofAgain) proofAgain.addEventListener("click", function () {
    var rows = fileRoom ? decisionsFor(fileRoom) : [];
    verifyDecision(rows.length ? rows[rows.length - 1] : null);
  });
  var decisionAgain = document.getElementById("decision-proof-again");
  if (decisionAgain) decisionAgain.addEventListener("click", function () {
    verifyDecision(openDecisionRow);
  });
  /** The kept-decision answer (no model, or the model was unreachable), drawn into one turn. */
  function renderChatResult(result, turn, quiet) {
      var learned = typeof result.learned === "string" ? result.learned.trim() : "";
      var answer = learned || result.body || "";
      if (!learned && answer === "A decision is kept from a room.") {
        answer = "A decision is kept from a room. Chat does not keep a decision. Ask what was decided.";
      }
      var parts = learned ? { answer: answer, detail: "", cites: [], clash: [] } : chatParts(answer);
      var purpose = document.getElementById("chat-purpose");
      if (purpose) purpose.hidden = true;
      var pending = turn;
      var reading = turn ? turn.querySelector(".chat-body > span") : null;
      if (pending) pending.classList.remove("chat-pending", "chat-streaming");
      if (reading && parts.clash && parts.clash.length > 1) {
        reading.textContent = parts.lead || dropTrail(parts.answer) || "These decisions clash.";
        reading.classList.add("chat-answer");
        var note = document.createElement("div");
        note.className = "callout callout-warn chat-clash";
        parts.clash.forEach(function (item) {
          var line = document.createElement("p");
          var when = relativeWhen(item.spokenAt) || whenLabel(item.spokenAt);
          line.textContent = item.text + (when ? " · " + when : "");
          note.append(line);
        });
        var chips = document.createElement("span");
        chips.className = "cite-row";
        parts.clash.forEach(function (item) {
          var chip = document.createElement("span");
          chip.className = "cite-chip";
          var who = personLabel(item.speaker) || "";
          var label = who || item.clock || "";
          if (who && item.clock) label = who + " · " + item.clock;
          if (!label) return;
          chip.textContent = label;
          chips.append(chip);
        });
        var clashKeys = {};
        parts.clash.forEach(function (item) {
          clashKeys[(item.roomId || "") + "|" + (item.spokenAt || "")] = true;
        });
        var extras = (parts.cites || []).filter(function (cite) {
          return cite && !clashKeys[(cite.roomId || "") + "|" + (cite.spokenAt || "")];
        });
        function extraLabel(cite) {
          var who = personLabel(cite.speaker) || "";
          var clock = cite.clock || "";
          if (who && clock) return who + " · " + clock;
          if (who) return who;
          if (clock) return clock;
          // Drop raw Slack/member ids that leaked into cite.label.
          var raw = String(cite.label || "").trim();
          if (/^u[a-z0-9_]{2,}$/i.test(raw.split(" · ")[0] || "")) return clock || "";
          return raw;
        }
        function addExtra(cite) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "cite-chip";
          chip.textContent = extraLabel(cite);
          chip.addEventListener("click", function () {
            if (!cite.roomId) return;
            leaveOnboard();
            openFile(cite.roomId);
          });
          chips.append(chip);
        }
        if (extras.length && extras.length <= 2) extras.forEach(addExtra);
        else if (extras.length > 2) {
          var moreDecisions = document.createElement("button");
          moreDecisions.type = "button";
          moreDecisions.className = "cite-chip";
          moreDecisions.textContent = extras.length + " more decisions";
          moreDecisions.addEventListener("click", function () {
            moreDecisions.remove();
            extras.forEach(addExtra);
          });
          chips.append(moreDecisions);
        }
        note.append(chips);
        var clashActions = document.createElement("div");
        clashActions.className = "clash-actions";
        var roomId = parts.clash[0] && parts.clash[0].roomId;
        if (roomId) {
          var openRoom = document.createElement("a");
          openRoom.href = "/console/rooms/" + encodeURIComponent(roomId);
          openRoom.textContent = "Open room";
          openRoom.addEventListener("click", function (event) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            leaveOnboard();
            openFile(roomId);
          });
          clashActions.append(openRoom);
        }
        var copyClash = document.createElement("button");
        copyClash.type = "button";
        copyClash.textContent = "Copy";
        copyClash.addEventListener("click", function () {
          var copied = parts.lead || reading.textContent || "";
          var done = function () { toast("Copied."); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copied).then(done, function () { toast("Copy did not work."); });
          } else toast("Copy did not work.");
        });
        clashActions.append(copyClash);
        note.append(clashActions);
        reading.parentNode.append(note);
      } else if (reading) reading.textContent = dropTrail(parts.answer) || "The room did not answer.";
      if (reading && parts.detail) {
        var extra = document.createElement("span");
        extra.className = "chat-detail";
        extra.textContent = parts.detail;
        reading.parentNode.append(extra);
      }
      if (reading && parts.cites && !(parts.clash && parts.clash.length > 1)) appendCites(reading.parentNode, parts.cites);
      if (reading && result.why && result.why.length) {
        var why = document.createElement("details");
        why.className = "why-panel";
        var summary = document.createElement("summary");
        summary.textContent = "Why";
        why.append(summary);
        result.why.forEach(function (memory) {
          var row = document.createElement("div");
          row.className = "why-row";
          var sentence = document.createElement("p");
          var bits = [];
          if (memory && memory.text) bits.push(String(memory.text).trim());
          if (memory && memory.at) bits.push(chainWhen(memory.at) || memory.at);
          var trust = memory && memory.verified === "verified" ? "Verified." : (memory && memory.verified === "unverified" ? "Couldn't verify." : "");
          var spoken = [];
          if (bits[0]) spoken.push(bits[0]);
          if (bits[1]) spoken.push("Kept " + whenInSentence(bits[1]) + ".");
          if (trust) spoken.push(trust);
          sentence.textContent = spoken.join(" ");
          row.append(sentence);
          var source = whySource(memory);
          if (source) row.append(source);
          why.append(row);
        });
        reading.parentNode.append(why);
      }
      if (!quiet) placeChatAnswer((pending && pending.querySelector(".cite-row")) || pending);
  }

  var askState = { limit: ${askDaily}, remaining: null, live: false, loaded: false, resetAt: "", streams: {} };
  function askResetLabel() {
    return "They come back at midnight.";
  }
  function paintAskQuota() {
    var pill = document.getElementById("ask-quota");
    var input = document.getElementById("chat-text");
    var button = document.getElementById("ask-send");
    if (!pill || !askState) return;
    // Before /api/ask answers, the pill keeps the server-rendered daily allowance, never blank.
    if (askState.remaining === null) {
      pill.hidden = false;
      pill.textContent = askState.limit + " questions a day";
      return;
    }
    var out = askState.remaining <= 0;
    pill.hidden = false;
    pill.classList.remove("ask-quota-pending");
    pill.textContent = out ? "No questions left today" : (askState.remaining + " of " + askState.limit + " questions left today");
    pill.classList.toggle("ask-quota-out", out);
    // Out of questions: say so beside the composer instead of waiting for a refused send.
    var outNote = document.getElementById("ask-out");
    var outCopy = document.getElementById("ask-out-copy");
    var hint = document.getElementById("chat-hint");
    if (outCopy) outCopy.textContent = "You've used all " + askState.limit + ". " + askResetLabel();
    if (outNote) outNote.hidden = !out;
    if (hint) hint.hidden = out;
    var composer = document.getElementById("chat-form");
    if (composer) composer.classList.toggle("composer-out", out);
    if (input) {
      input.disabled = out;
      input.placeholder = out ? "No questions left. Back at midnight." : "Ask about a meeting or decision";
    }
    if (button && !button.classList.contains("ask-stop")) button.disabled = out;
    var copy = document.getElementById("ask-limit-copy");
    if (copy) copy.textContent = "Each person gets " + askState.limit + " Ask AI questions a day. " + askResetLabel();
  }
  function takeAskQuota(data) {
    if (!data) return;
    if (typeof data.limit === "number") askState.limit = data.limit;
    // used and remaining come from the same quota key. A refund lowers used
    // and raises remaining, so this snapshot replaces the claim, including used 0.
    if (typeof data.used === "number" && typeof askState.limit === "number") {
      var usedNow = data.used;
      if (usedNow < 0) usedNow = 0;
      if (usedNow > askState.limit) usedNow = askState.limit;
      askState.remaining = askState.limit - usedNow;
    } else if (typeof data.remaining === "number") askState.remaining = data.remaining;
    if (typeof data.live === "boolean") askState.live = data.live;
    if (data.resetAt) askState.resetAt = data.resetAt;
    paintAskQuota();
  }
  function refreshAskQuota() {
    fetch("/api/ask", { headers: { accept: "application/json" } }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (data) {
      if (data) takeAskQuota(data);
    }).catch(function () {});
  }
  function setAskSending(on) {
    var button = document.getElementById("ask-send");
    if (!button) return;
    button.classList.toggle("ask-stop", on);
    button.textContent = on ? "Stop" : "Send";
    button.setAttribute("aria-label", on ? "Stop" : "Send");
    button.disabled = !on && askState.remaining !== null && askState.remaining <= 0;
  }
  var ASK_FRIENDLY = "I couldn't answer that just now. Try again in a moment.";
  function protocolLine(line) {
    var trimmed = String(line || "").trim();
    if (!trimmed) return true;
    if (isStatusWord(trimmed)) return true;
    if (trimmed === "missing-member" || trimmed === "not-invited" || trimmed === "duplicate-delivery") return true;
    if (/^(?:preference|checkpoint)(?:\\s+\\S+)?$/i.test(trimmed)) return true;
    if (/^ROW-[0-9]+$/.test(trimmed)) return true;
    return false;
  }
  function humanAskText(value) {
    return splitLines(value).map(function (line) { return line.trim(); }).filter(function (line) { return !protocolLine(line); }).join(String.fromCharCode(10));
  }
  ${priorAsksForThread.toString().replaceAll("\n", "\n  ")}
  function loadAsks() {
    // Render and resume only. A reload must not POST the question again.
    // priorAsksForThread leaves friendly failures and protocol-only turns out of the thread.
    fetch("/api/ask", { headers: { accept: "application/json" } }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (data) {
      if (!data) return;
      takeAskQuota(data);
      if (askState.loaded) return;
      askState.loaded = true;
      var asks = priorAsksForThread(Array.isArray(data.asks) ? data.asks : []);
      asks.forEach(function (ask) {
        if (!ask || !ask.id || document.querySelector('#chat-log [data-ask="' + ask.id + '"]')) return;
        showAskThread();
        addChatTurn("You", ask.question || "", "");
        var turn = addChatTurn("Sederunt", ask.text ? "" : "Thinking\u2026", "");
        turn.setAttribute("data-ask", ask.id);
        var span = turn.querySelector(".chat-body > span");
        if (ask.text) {
          turn._askRaw = ask.text;
          var shown = humanAskText(ask.text);
          span.textContent = shown;
        }
        if (ask.status === "streaming") {
          turn.classList.add("chat-streaming");
          if (followAsk(ask.id, turn, ask.count || 0)) askBusy = true;
        } else settleAsk(turn, ask, true);
      });
      var log = document.getElementById("chat-log");
      if (log && asks.length) log.scrollTop = log.scrollHeight;
    }).catch(function () {});
  }
  function showAskThread() {
    var emptyLine = document.getElementById("chat-empty");
    if (emptyLine) emptyLine.hidden = true;
    var purpose = document.getElementById("chat-purpose");
    if (purpose) purpose.hidden = true;
  }
  function keepAskInView(turn) {
    var log = document.getElementById("chat-log");
    if (!log || !turn) return;
    var near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
    if (near) log.scrollTop = log.scrollHeight;
  }
  var askLive = null;
  var askCancel = false;
  var askBusy = false;
  function releaseAsk() {
    var open = askState.streams ? Object.keys(askState.streams) : [];
    if (open.length) return;
    askBusy = false;
  }
  function askSendLocked() {
    var button = document.getElementById("ask-send");
    return askBusy || (button && button.classList.contains("ask-stop"));
  }
  function stopAsk() {
    var live = askLive;
    askLive = null;
    if (!live) {
      if (askBusy) {
        askCancel = true;
        var held = document.getElementById("ask-send");
        if (held) held.disabled = true;
      } else {
        askCancel = false;
        setAskSending(false);
      }
      return;
    }
    live.turn.setAttribute("data-stopped", "1");
    if (live.source) live.source.close();
    delete askState.streams[live.id];
    setAskSending(false);
    settleAsk(live.turn, { status: "stopped" });
    releaseAsk();
  }
  function followAsk(id, turn, from) {
    if (turn.getAttribute("data-stopped") === "1" || turn.getAttribute("data-settled") === "1") return false;
    if (askState.streams[id]) return true;
    if (typeof EventSource !== "function") return false;
    var got = from || 0;
    var span = turn.querySelector(".chat-body > span");
    var source = new EventSource("/api/ask/" + encodeURIComponent(id) + "/stream?from=" + got);
    askState.streams[id] = source;
    askLive = { id: id, turn: turn, source: source };
    setAskSending(true);
    function stop() {
      source.close();
      delete askState.streams[id];
      if (askLive && askLive.source === source) askLive = null;
    }
    source.addEventListener("chunk", function (event) {
      var data = JSON.parse(event.data || "{}");
      if (typeof data.i !== "number" || data.i < got) return;
      turn._askRaw = (turn._askRaw || "") + (data.t || "");
      var shown = humanAskText(turn._askRaw);
      if (shown) {
        turn.classList.remove("chat-pending", "chat-thinking");
        turn.classList.add("chat-streaming");
        span.textContent = shown;
      }
      got = data.i + 1;
      turn.removeAttribute("data-tries");
      keepAskInView(turn);
    });
    source.addEventListener("done", function (event) {
      var data = {};
      try { data = JSON.parse(event.data || "{}"); } catch (error) { data = {}; }
      stop();
      setAskSending(false);
      if (data.quota) takeAskQuota(data.quota);
      settleAsk(turn, data);
      releaseAsk();
    });
    source.addEventListener("again", function () {
      stop();
      if (!followAsk(id, turn, got)) releaseAsk();
    });
    source.onerror = function () {
      stop();
      if (turn.getAttribute("data-stopped") === "1" || turn.getAttribute("data-settled") === "1") {
        releaseAsk();
        return;
      }
      var tries = Number(turn.getAttribute("data-tries") || "0") + 1;
      turn.setAttribute("data-tries", String(tries));
      if (tries > 5) {
        setAskSending(false);
        settleAsk(turn, { status: "stopped" });
        releaseAsk();
        return;
      }
      setTimeout(function () {
        if (turn.getAttribute("data-stopped") === "1" || turn.getAttribute("data-settled") === "1" || !followAsk(id, turn, got)) releaseAsk();
      }, 800 * tries);
    };
    return true;
  }
  function drawAnswer(span, value) {
    span.textContent = "";
    span.classList.add("chat-answer-md");
    var list = null;
    String(value || "").split(/\\n/).forEach(function (raw) {
      var line = raw.replace(/\\s+$/, "");
      var bullet = /^\\s*(?:[-*•]|\\d+[.)])\\s+(.*)$/.exec(line);
      if (bullet) {
        if (!list) {
          list = document.createElement(/^\\s*\\d/.test(line) ? "ol" : "ul");
          span.append(list);
        }
        var item = document.createElement("li");
        inline(item, bullet[1]);
        list.append(item);
        return;
      }
      list = null;
      if (!line.trim()) return;
      var para = document.createElement("span");
      para.className = "md-line";
      inline(para, line.replace(/^#+\\s*/, ""));
      span.append(para);
    });
    function inline(node, textValue) {
      String(textValue).split(/(\\*\\*[^*]+\\*\\*)/).forEach(function (bit) {
        if (!bit) return;
        if (/^\\*\\*[^*]+\\*\\*$/.test(bit)) {
          var strong = document.createElement("strong");
          strong.textContent = bit.slice(2, -2);
          node.append(strong);
        } else node.append(document.createTextNode(bit.replace(/\\x60/g, "")));
      });
    }
  }
  function settleAsk(turn, done, quiet) {
    if (!turn || turn.getAttribute("data-settled") === "1") return;
    turn.setAttribute("data-settled", "1");
    turn.classList.remove("chat-pending", "chat-thinking", "chat-streaming");
    var span = turn.querySelector(".chat-body > span");
    if (!span) return;
    var streamed = humanAskText(turn._askRaw || span.textContent || "");
    var fromResult = "";
    if (done && done.result) {
      var learned = typeof done.result.learned === "string" ? done.result.learned : "";
      var body = typeof done.result.body === "string" ? done.result.body : "";
      fromResult = humanAskText(learned || body);
    }
    // Prefer the finished result when the model streamed the empty-memory sentence
    // but recall already grounded a keep (source retrieval).
    var emptyMemory = "Nothing kept in this workspace matches that yet.";
    var said = streamed;
    if (fromResult && (!said || said === emptyMemory || (done && done.source === "retrieval"))) said = fromResult;
    else if (!said) said = fromResult;
    var status = done && done.status;
    if (!said) {
      span.textContent = status === "done" ? ASK_FRIENDLY : "The answer stopped. Ask again.";
      if (!quiet) refreshAskQuota();
      return;
    }
    drawAnswer(span, said);
    if (status === "stopped" || status === "error") {
      var cut = document.createElement("span");
      cut.className = "chat-detail";
      cut.textContent = "The answer stopped early.";
      span.parentNode.append(cut);
    }
    var sources = (done && Array.isArray(done.sources) ? done.sources : []).filter(function (item) { return item && item.text; });
    if (sources.length) {
      var label = document.createElement("span");
      label.className = "ask-sources-label";
      label.textContent = sources.length === 1 ? "From 1 kept decision" : "From " + sources.length + " kept decisions";
      span.parentNode.append(label);
      appendCites(span.parentNode, sources.map(function (item) {
        // Label is the friendly speaker only; appendCites adds the time once.
        return { label: personLabel(item.speaker) || "", roomId: item.roomId || "", spokenAt: item.spokenAt || "" };
      }));
    }
    var actions = document.createElement("div");
    actions.className = "ask-actions";
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "ask-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", function () {
      var ok = function () { toast("Copied."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(said).then(ok, function () { toast("Copy did not work."); });
      else toast("Copy did not work.");
    });
    actions.append(copy);
    span.parentNode.append(actions);
    if (!quiet) {
      keepAskInView(turn);
      refreshAskQuota();
    }
  }
  var askSend = document.getElementById("ask-send");
  if (askSend) askSend.addEventListener("click", function () {
    if (askSend.classList.contains("ask-stop")) {
      stopAsk();
      return;
    }
    if (askBusy || askSend.disabled) return;
    var form = document.getElementById("chat-form");
    if (!form) return;
    askSend.disabled = true;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  document.getElementById("chat-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (askBusy) return;
    if (askSendLocked()) return;
    askCancel = false;
    askBusy = true;
    var input = document.getElementById("chat-text");
    var askedNow = input.value.trim();
    if (!askedNow) {
      releaseAsk();
      setAskSending(false);
      return;
    }
    if (askState.remaining !== null && askState.remaining <= 0) {
      releaseAsk();
      setAskSending(false);
      openDialog("ask-ai-dialog");
      return;
    }
    showAskThread();
    lastQuestion = askedNow;
    addChatTurn("You", askedNow, "");
    var turn = addChatTurn("Sederunt", "Thinking\u2026", "");
    setAskSending(true);
    input.value = "";
    growChat();
    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: askedNow, workspace: workspaceKind })
    }).then(function (response) {
      return response.json().then(function (body) { return { status: response.status, body: body || {} }; });
    }).then(function (reply) {
      var span = turn.querySelector(".chat-body > span");
      if (askCancel) {
        askCancel = false;
        setAskSending(false);
        releaseAsk();
        if (turn.getAttribute("data-settled") !== "1") settleAsk(turn, { status: "stopped" });
        return;
      }
      if (reply.status === 429) {
        turn.classList.remove("chat-pending", "chat-thinking");
        span.textContent = "You've used today's " + (reply.body.limit || askState.limit) + " questions. " + askResetLabel();
        setAskSending(false);
        releaseAsk();
        takeAskQuota({ limit: reply.body.limit, used: reply.body.used, remaining: reply.body.remaining });
        openDialog("ask-ai-dialog");
        return;
      }
      if (reply.status !== 200 || !reply.body.id) {
        turn.classList.remove("chat-pending", "chat-thinking");
        setAskSending(false);
        releaseAsk();
        span.textContent = reply.body.error && reply.body.error !== "limit" ? reply.body.error : "Ask AI did not answer. Send the question again.";
        return;
      }
      takeAskQuota(reply.body);
      turn.setAttribute("data-ask", reply.body.id);
      if (!followAsk(reply.body.id, turn, 0)) {
        setAskSending(false);
        if (turn.getAttribute("data-settled") !== "1") settleAsk(turn, { status: "stopped" });
        releaseAsk();
      }
    }).catch(function () {
      var span = turn.querySelector(".chat-body > span");
      turn.classList.remove("chat-pending", "chat-thinking");
      setAskSending(false);
      releaseAsk();
      if (span) span.textContent = "Ask AI did not answer. Send the question again.";
    });
  });
  var joinBusy = false;
  document.getElementById("meet-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (joinBusy) return;
    var link = document.getElementById("meet-link").value.trim();
    var lowered = link.toLowerCase();
    if (!link) {
      text("join-status", "Paste a Zoom, Google Meet, Teams, or Webex link.");
      return;
    }
    var host = meetingHost(link);
    if (host.indexOf("slack.") !== -1 || lowered.indexOf("huddle") !== -1) {
      text("join-status", "A Slack huddle is not a meeting. Add the bot to the channel.");
      return;
    }
    var kind = meetingKind(host);
    if (!kind) {
      text("join-status", "That link is not Zoom, Google Meet, Teams, or Webex.");
      return;
    }
    joinBusy = true;
    var joinButton = document.getElementById("join-submit");
    if (joinButton) {
      joinButton.disabled = true;
      joinButton.textContent = "Joining…";
    }
    text("join-status", "Sederunt is joining that meeting…");
    fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: link })
    }).then(function (response) { return response.json(); }).then(function (result) {
      if (result.join === "sent") {
        document.getElementById("meet-link").value = "";
        closeDialog("create-dialog");
        text("status", "Sederunt is on the way to the meeting.");
        load();
        return;
      }
      text("join-status", result.join === "failed"
        ? "Sederunt could not join that meeting."
        : "Meet is not ready, so Sederunt cannot join that meeting yet.");
    }).catch(function () {
      text("join-status", "Sederunt could not join that meeting.");
    }).finally(function () {
      joinBusy = false;
      syncJoinReady();
    });
  });
  function reserveComposer() {
    var chat = document.getElementById("chat");
    var form = document.getElementById("chat-form");
    if (!chat || !form) return;
    if (window.matchMedia("(max-width: 700px)").matches) {
      chat.style.paddingBottom = (form.getBoundingClientRect().height + 16) + "px";
    } else chat.style.paddingBottom = "";
  }

  function placeChatAnswer(node) {
    var log = document.getElementById("chat-log");
    var form = document.getElementById("chat-form");
    reserveComposer();
    if (!log || !node) return;
    var composer = form ? form.getBoundingClientRect().height : 72;
    var gap = 16;
    log.style.paddingBottom = "";
    if (!form) return;
    var scroller = log;
    var parent = log.parentElement;
    while (parent && parent !== document.documentElement) {
      var style = getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
        scroller = parent;
        break;
      }
      parent = parent.parentElement;
    }
    var bottom = node.getBoundingClientRect().bottom;
    var limit = form.getBoundingClientRect().top - gap;
    scroller.scrollTop += bottom - limit;
  }

  function appendCites(body, cites) {
    function citeReadable(cite) {
      if (!cite) return "";
      var head = String(cite.label || "").split(" · ")[0].trim();
      var when = relativeWhen(cite.spokenAt) || whenLabel(cite.spokenAt) || "";
      // Never show raw Slack user/channel ids or UUIDs on Ask chips.
      if (/^u[a-z0-9_]{2,}$/i.test(head)) head = "";
      if (/^[cgd][a-z0-9]{8,}$/i.test(head)) head = "";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(head)) head = "";
      // If label was already a when-string, prefer spokenAt once.
      if (head && when && head === when) head = "";
      if (/^(today|yesterday|tomorrow)\b/i.test(head) && when) head = "";
      if (head && when) return head + " · " + when;
      return head || when || "";
    }
    var all = (cites || []).map(function (cite) {
      var label = citeReadable(cite);
      return label ? { label: label, roomId: cite.roomId || "", spokenAt: cite.spokenAt || "" } : null;
    }).filter(Boolean);
    if (!all.length) return;
    var row = document.createElement("span");
    row.className = "cite-row";
    var limit = 2;
    function addChip(cite) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cite-chip";
      chip.textContent = cite.label;
      chip.title = cite.label;
      chip.addEventListener("click", function () {
        if (!cite.roomId) return;
        leaveOnboard();
        openFile(cite.roomId);
      });
      row.append(chip);
    }
    all.slice(0, limit).forEach(addChip);
    if (all.length > limit) {
      var more = document.createElement("button");
      more.type = "button";
      more.className = "cite-chip cite-more";
      more.textContent = "+" + (all.length - limit) + " more";
      more.addEventListener("click", function () {
        more.remove();
        all.slice(limit).forEach(addChip);
      });
      row.append(more);
    }
    body.append(row);
  }

  function addChatTurn(who, value, detail, cites) {
    var line = document.createElement("div");
    line.className = who === "You" ? "chat-turn chat-you" : "chat-turn chat-bot";
    line.setAttribute("role", "article");
    var thinking = value === "Thinking\u2026";
    if (thinking) line.classList.add("chat-pending", "chat-thinking");
    if (who !== "You") {
      var avatar = document.createElement("span");
      avatar.className = "ask-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "S";
      line.append(avatar);
    }
    var label = document.createElement("span");
    label.className = "sr";
    label.textContent = who === "You" ? "You" : "Sederunt";
    var body = document.createElement("span");
    body.className = "chat-body";
    var answer = document.createElement("span");
    answer.textContent = value;
    body.append(answer);
    if (detail) {
      var extra = document.createElement("span");
      extra.className = "chat-detail";
      extra.textContent = detail;
      body.append(extra);
    }
    if (cites) appendCites(body, cites);
    line.append(label, body);
    var log = document.getElementById("chat-log");
    log.append(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }

  var accountButton = document.getElementById("account");
  var accountMenu = document.getElementById("account-menu");
  function closeAccountMenu() {
    if (!accountMenu || !accountButton) return;
    accountMenu.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
    accountButton.classList.remove("open");
  }
  accountButton.addEventListener("click", function (event) {
    event.stopPropagation();
    var open = accountMenu.hidden;
    accountMenu.hidden = !open;
    accountButton.setAttribute("aria-expanded", open ? "true" : "false");
    accountButton.classList.toggle("open", open);
  });
  accountMenu.addEventListener("click", function (event) { event.stopPropagation(); });
  document.addEventListener("click", closeAccountMenu);
  var editProfile = document.getElementById("edit-profile");
  var accountEdit = document.getElementById("account-edit");
  if (accountEdit) accountEdit.addEventListener("click", function () {
    if (editProfile) editProfile.click();
    else openDialog("profile-dialog");
  });
  var accountOut = document.getElementById("account-signout");
  if (accountOut) accountOut.addEventListener("click", function () {
    var form = document.getElementById("sign-out-form");
    if (form) form.submit();
  });
  if (editProfile) editProfile.addEventListener("click", function () {
    closeAccountMenu();
    document.getElementById("profile-name").value = member();
    text("profile-note", "");
    openDialog("profile-dialog");
  });
  var profileForm = document.getElementById("profile-form");
  if (profileForm) profileForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var nextName = document.getElementById("profile-name").value.trim();
    text("profile-note", "Saving.");
    fetch("/console/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName })
    }).then(function (response) {
      if (!response.ok) throw new Error("no");
      return response.json();
    }).then(function (result) {
      var shown = result && result.name ? result.name : nextName;
      accountButton.setAttribute("data-known", "true");
      accountButton.setAttribute("data-name", shown);
      document.getElementById("account-name").textContent = shown;
      document.getElementById("account-avatar").textContent = initials(shown);
      var pageName = document.getElementById("account-page-name");
      if (pageName) pageName.textContent = shown;
      var pageAvatar = document.getElementById("account-page-avatar");
      if (pageAvatar && !pageAvatar.querySelector("img")) pageAvatar.textContent = initials(shown);
      text("profile-note", "");
      closeDialog("profile-dialog");
      if (state) paint(state);
    }).catch(function () {
      text("profile-note", "The name was not saved.");
    });
  });
  document.getElementById("show-connectors").addEventListener("click", function (event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    leaveOnboard();
    showSection("connectors");
  });
  document.getElementById("setup-toggle").addEventListener("click", function () {
    leaveOnboard();
    showSection("connectors");
  });
  document.getElementById("rail-toggle").addEventListener("click", function () {
    var button = document.getElementById("rail-toggle");
    if (window.matchMedia("(max-width: 1100px)").matches) {
      var open = document.body.classList.toggle("nav-open");
      button.setAttribute("aria-pressed", open ? "true" : "false");
      button.setAttribute("aria-label", open ? "Close the menu" : "Open the menu");
      return;
    }
    var on = document.body.classList.toggle("rail-collapsed");
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute("aria-label", on ? "Show the sidebar" : "Hide the sidebar");
    try { localStorage.setItem("sederunt-rail", on ? "collapsed" : "open"); } catch (error) { /* ignore */ }
  });
  document.getElementById("nav-scrim").addEventListener("click", function () {
    closeNav();
  });
  var railTip = document.getElementById("rail-tip");
  document.querySelectorAll(".rail a[data-label], #show-connectors").forEach(function (link) {
    link.addEventListener("mouseenter", function () {
      if (!railTip || !document.body.classList.contains("rail-collapsed")) return;
      var box = link.getBoundingClientRect();
      railTip.textContent = link.getAttribute("data-label") || "";
      railTip.hidden = false;
      railTip.style.top = (box.top + box.height / 2) + "px";
      railTip.style.left = (box.right + 8) + "px";
    });
    link.addEventListener("mouseleave", function () { if (railTip) railTip.hidden = true; });
  });
  var railClose = document.getElementById("rail-close");
  if (railClose) railClose.addEventListener("click", closeNav);
  document.querySelectorAll("[data-left-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      leftTab = button.getAttribute("data-left-tab") || "transcript";
      applyRoomTabs();
    });
  });
  document.querySelectorAll("[data-right-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      rightTab = button.getAttribute("data-right-tab") || "overview";
      applyRoomTabs();
    });
  });
  var suggestBox = document.getElementById("chat-suggests");
  if (suggestBox) suggestBox.addEventListener("click", function (event) {
    var button = event.target.closest("[data-fill], [data-suggest]");
    if (!button) return;
    var input = document.getElementById("chat-text");
    if (!input) return;
    if (button.hasAttribute("data-fill")) {
      input.disabled = false;
      var ask = document.querySelector("#chat-form button");
      if (ask && !askSendLocked()) ask.disabled = false;
      input.value = button.getAttribute("data-fill") || "";
      growChat();
      input.focus();
      return;
    }
    if (input.disabled || askSendLocked()) return;
    input.value = button.getAttribute("data-suggest") || "";
    growChat();
    var form = document.getElementById("chat-form");
    var send = document.getElementById("ask-send");
    if (send && form) send.disabled = true;
    if (form && form.requestSubmit) form.requestSubmit();
    else if (send) send.disabled = false;
  });
  var roomPrev = document.getElementById("room-prev");
  var roomNext = document.getElementById("room-next");
  if (roomPrev) roomPrev.addEventListener("click", function () {
    roomPage -= 1;
    paintRooms();
  });
  if (roomNext) roomNext.addEventListener("click", function () {
    roomPage += 1;
    paintRooms();
  });
  var resizer = document.getElementById("room-resizer");
  if (resizer) {
    try {
      var savedWidth = localStorage.getItem("sederunt-room-width");
      var leftPane = document.getElementById("room-left");
      if (savedWidth && leftPane) leftPane.style.width = savedWidth + "px";
    } catch (error) { /* ignore */ }
    resizer.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      var split = document.getElementById("room-split");
      var left = document.getElementById("room-left");
      if (!split || !left) return;
      if (resizer.setPointerCapture) resizer.setPointerCapture(event.pointerId);
      function move(next) {
        var bounds = split.getBoundingClientRect();
        var width = Math.min(bounds.width - 420, Math.max(360, next.clientX - bounds.left));
        left.style.width = width + "px";
        left.style.flex = "none";
      }
      function up(next) {
        resizer.removeEventListener("pointermove", move);
        resizer.removeEventListener("pointerup", up);
        var width = Math.round(left.getBoundingClientRect().width);
        try { localStorage.setItem("sederunt-room-width", String(width)); } catch (error) { /* ignore */ }
      }
      resizer.addEventListener("pointermove", move);
      resizer.addEventListener("pointerup", up);
      move(event);
    });
    resizer.addEventListener("keydown", function (event) {
      var left = document.getElementById("room-left");
      if (!left) return;
      var width = left.getBoundingClientRect().width;
      if (event.key === "ArrowLeft") left.style.width = Math.max(360, width - 24) + "px";
      if (event.key === "ArrowRight") {
        var split = document.getElementById("room-split");
        var max = split ? split.getBoundingClientRect().width * 0.5 : width + 24;
        left.style.width = Math.min(max, width + 24) + "px";
      }
    });
  }
  var tlPlay = document.getElementById("tl-play");
  var tlRestart = document.getElementById("tl-restart");
  var tlHide = document.getElementById("tl-hide");
  var playerVideo = document.getElementById("player-video");
  if (tlPlay) tlPlay.addEventListener("click", function () {
    if (!playerVideo || !playerVideo.src) return;
    if (playerVideo.paused) { playerVideo.play(); tlPlay.textContent = "❚❚"; tlPlay.setAttribute("aria-label", "Pause"); }
    else { playerVideo.pause(); tlPlay.textContent = "▶"; tlPlay.setAttribute("aria-label", "Play"); }
  });
  if (tlRestart) tlRestart.addEventListener("click", function () { seekTo(0); });
  if (tlHide) tlHide.addEventListener("click", function () {
    var track = document.getElementById("tl-track");
    var hidden = track && !track.hidden;
    if (track) track.hidden = hidden;
    tlHide.setAttribute("aria-pressed", hidden ? "true" : "false");
    tlHide.textContent = hidden ? "Show timeline" : "Hide timeline";
  });
  var ruler = document.getElementById("tl-ruler");
  if (ruler) ruler.addEventListener("click", function (event) {
    var box = ruler.getBoundingClientRect();
    var ratio = (event.clientX - box.left) / box.width;
    seekTo(ratio * mediaDuration());
  });
  if (playerVideo) playerVideo.addEventListener("timeupdate", function () {
    text("tl-now", clockText(playerVideo.currentTime));
    placePlayhead(playerVideo.currentTime, mediaDuration());
    markTranscript(playerVideo.currentTime);
  });
  if (playerVideo) playerVideo.addEventListener("error", function () {
    playerVideo.hidden = true;
    var fallback = document.getElementById("player-fallback");
    var note = document.getElementById("player-note");
    if (fallback) fallback.hidden = false;
    if (note && !note.textContent) note.textContent = "Media has already expired.";
  });
  document.addEventListener("keydown", function (event) {
    if (!document.body.classList.contains("room-open")) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === " ") {
      event.preventDefault();
      if (tlPlay) tlPlay.click();
    } else if (event.key === "j" || event.key === "J") {
      var video = document.getElementById("player-video");
      seekTo((video && video.currentTime ? video.currentTime : 0) - 10);
    } else if (event.key === "k" || event.key === "K") {
      var playing = document.getElementById("player-video");
      seekTo((playing && playing.currentTime ? playing.currentTime : 0) + 10);
    }
  });
  var proofChip = document.getElementById("file-proof");
  if (proofChip) proofChip.addEventListener("click", function () {
    openDialog("proof-dialog");
  });
  var transcriptSearch = document.getElementById("transcript-search");
  if (transcriptSearch) transcriptSearch.addEventListener("input", function () {
    transcriptQuery = transcriptSearch.value || "";
    renderTranscript(fileRoom ? decisionsFor(fileRoom) : []);
  });
  var chatBox = document.getElementById("chat-text");
  function growChat() {
    if (!chatBox) return;
    chatBox.style.height = "32px";
    var next = chatBox.scrollHeight;
    if (next > 160) {
      chatBox.style.height = "160px";
      chatBox.style.overflow = "auto";
    } else {
      chatBox.style.height = Math.max(32, next) + "px";
      chatBox.style.overflow = "hidden";
    }
  }
  if (chatBox) {
    chatBox.addEventListener("input", growChat);
    chatBox.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (event.repeat || chatBox.disabled || askBusy || askSendLocked()) return;
      var form = document.getElementById("chat-form");
      var send = document.getElementById("ask-send");
      if (!form) return;
      if (send) send.disabled = true;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }
  document.getElementById("goto").addEventListener("click", openPalette);
  document.getElementById("palette-input").addEventListener("input", function () {
    paintPalette(document.getElementById("palette-input").value);
  });
  function applyRoomFilters(filter, query) {
    roomFilter = filter || "all";
    roomQuery = String(query || "").trim().toLowerCase();
    roomPage = 0;
    document.querySelectorAll("[data-room-filter]").forEach(function (node) {
      node.setAttribute("aria-pressed", node.getAttribute("data-room-filter") === roomFilter ? "true" : "false");
    });
    var input = document.getElementById("room-search");
    if (input && document.activeElement !== input) input.value = query || "";
    var path = location.pathname + roomQueryString();
    if (location.pathname + location.search !== path) history.replaceState(history.state || { section: sectionName }, "", path);
    paintRooms();
  }
  document.querySelectorAll("[data-room-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      applyRoomFilters(button.getAttribute("data-room-filter") || "all", document.getElementById("room-search").value);
    });
  });
  document.querySelectorAll("[data-decision-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      applyRecordFilter(button.getAttribute("data-decision-filter") || "all");
    });
  });
  var clearFilters = document.getElementById("clear-filters");
  if (clearFilters) clearFilters.addEventListener("click", function () {
    var input = document.getElementById("room-search");
    if (input) input.value = "";
    applyRoomFilters("all", "");
  });
  var roomSearch = document.getElementById("room-search");
  if (roomSearch) roomSearch.addEventListener("input", function () {
    applyRoomFilters(roomFilter, roomSearch.value);
  });
  document.addEventListener("keydown", function (event) {
    var key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "k") {
      event.preventDefault();
      if (document.getElementById("palette").hidden) openPalette();
      else closePalette();
    }
  });
  window.addEventListener("popstate", function () {
    routeQuiet = true;
    var roomId = roomFromPath(location.pathname);
    var name = sectionFromPath(location.pathname);
    if (name !== "home") leaveOnboard();
    var params = new URLSearchParams(location.search);
    roomFilter = params.get("filter") || "all";
    roomQuery = (params.get("q") || "").trim().toLowerCase();
    if (roomId) openFile(roomId);
    else showSection(name);
  });
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) location.reload();
  });
  function openPalette() {
    var palette = document.getElementById("palette");
    palette.hidden = false;
    var input = document.getElementById("palette-input");
    input.value = "";
    paintPalette("");
    input.focus();
  }
  function closePalette() {
    document.getElementById("palette").hidden = true;
  }
  var paletteIndex = 0;
  function paletteItems() {
    return Array.prototype.slice.call(document.querySelectorAll("#palette-list button"));
  }
  function selectPalette(index) {
    var items = paletteItems();
    if (!items.length) return;
    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;
    paletteIndex = index;
    items.forEach(function (item, i) {
      item.setAttribute("aria-selected", i === paletteIndex ? "true" : "false");
    });
    if (items[paletteIndex].scrollIntoView) items[paletteIndex].scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function paintPalette(query) {
    var list = document.getElementById("palette-list");
    list.replaceChildren();
    var q = String(query || "").trim().toLowerCase();
    var count = 0;
    function add(group, label, run) {
      if (q && label.toLowerCase().indexOf(q) === -1) return;
      if (!list.querySelector("[data-group='" + group + "']")) {
        var head = document.createElement("p");
        head.className = "palette-group";
        head.setAttribute("data-group", group);
        head.textContent = group;
        list.append(head);
      }
      var button = document.createElement("button");
      button.className = "menu-item";
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-selected", count === 0 ? "true" : "false");
      button.addEventListener("mouseenter", function () {
        selectPalette(paletteItems().indexOf(button));
      });
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        closePalette();
        run();
      });
      list.append(button);
      count += 1;
    }
    [["home", "Home"], ["rooms", "Rooms"], ["history", "History"], ["record", "Decisions"], ["chat", "Chat"], ["files", "Files"], ["connectors", "Setup"], ["mcp", "Connectors"], ["account", "Account"], ["people", "People"]].forEach(function (page) {
      add("Navigate", page[1], function () {
        leaveOnboard();
        showSection(page[0]);
      });
    });
    ((state && state.rooms) || []).forEach(function (room) {
      var rows = decisionsFor(room.id);
      var last = rows.length ? rows[rows.length - 1] : null;
      add("Rooms", roomLabel(room, last), function () {
        leaveOnboard();
        openFile(room.id);
      });
    });
    ((state && state.decisions) || []).forEach(function (decision) {
      if (!decision.text) return;
      add("Decisions", decision.text, function () {
        leaveOnboard();
        openFile(decision.roomId);
      });
    });
    ((state && state.people) || []).forEach(function (person) {
      var name = typeof person === "string" ? person : (person.name || "");
      if (!name) return;
      add("People", name, function () {
        leaveOnboard();
        showSection("people");
      });
    });
    document.getElementById("palette-empty").hidden = count > 0;
    paletteIndex = 0;
  }
  document.getElementById("palette-input").addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectPalette(paletteIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectPalette(paletteIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      var items = paletteItems();
      if (items[paletteIndex]) items[paletteIndex].click();
    }
  });
  var palettePanel = document.querySelector(".palette-panel");
  if (palettePanel) palettePanel.addEventListener("click", function (event) { event.stopPropagation(); });
  try {
    if (localStorage.getItem("sederunt-rail") === "collapsed" && !window.matchMedia("(max-width: 767px)").matches) {
      document.body.classList.add("rail-collapsed");
      var toggle = document.getElementById("rail-toggle");
      toggle.setAttribute("aria-pressed", "true");
      toggle.setAttribute("aria-label", "Show the sidebar");
    }
  } catch (error) { /* ignore */ }
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  var hint = document.getElementById("goto-kbd");
  if (hint) hint.textContent = mac ? "⌘K" : "Ctrl K";
  var params = new URLSearchParams(location.search);
  if (params.get("filter")) roomFilter = params.get("filter");
  if (params.get("q")) roomQuery = params.get("q").trim().toLowerCase();
  if (onboard) onboard.hidden = true;
  if (home) home.hidden = false;
  routeQuiet = true;
  var startRoom = roomFromPath(location.pathname);
  if (startRoom) fileRoom = startRoom;
  showSection(startRoom ? "file" : sectionFromPath(location.pathname));
  if (location.hash === "#console-secret") {
    var secretAt = document.getElementById("console-secret");
    if (secretAt && secretAt.scrollIntoView) secretAt.scrollIntoView({ block: "start" });
  }
  if (!startRoom && (sectionName === "home" || sectionName === "rooms")) showHomeSkeleton(true);
  routed = true;
  reserveComposer();
  var mcpDemoUrl = "";
  var mcpRows = [];
  var mcpPresets = {};
  var mcpTokenId = "";
  var mcpRemoveId = "";
  var mcpBusy = false;

  function mcpPost(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (response) {
      return response.json().then(function (data) {
        var payload = data && typeof data === "object" ? data : {};
        if (!response.ok) payload.ok = false;
        if (!payload.message && payload.ok === false) payload.message = "That could not be saved.";
        return payload;
      }).catch(function () {
        return { ok: false, message: "That could not be saved." };
      });
    }).catch(function () {
      return { ok: false, message: "The connection failed." };
    });
  }

  function loadMcp() {
    var page = document.getElementById("mcp-page");
    if (!page) return Promise.resolve();
    return fetch("/console/connectors", { headers: { accept: "application/json" } }).then(function (response) {
      return response.json();
    }).then(function (data) {
      paintMcp(data || {});
    }).catch(function () {
      toast("Connectors could not be loaded.");
    });
  }

  ${formatLastTested.toString()}
  function mcpWhen(value) {
    return formatLastTested(value);
  }

  function mcpStatusLabel(status) {
    if (status === "connected") return "Connected";
    if (status === "error") return "Error";
    if (status === "needs_auth") return "Needs auth";
    if (status === "disabled") return "Disabled";
    return "Draft";
  }

  function mcpBadgeClass(status) {
    if (status === "connected") return "badge ok";
    if (status === "error" || status === "needs_auth") return "badge bad";
    return "badge warn";
  }

  function mcpActionLabel(action) {
    if (action === "read") return "Read";
    if (action === "delete") return "Delete";
    return "Write";
  }

  function presetTone(state) {
    if (state === "connected" || state === "ready") return "ok";
    if (state === "error") return "bad";
    if (state === "needs_access") return "warn";
    if (state === "connecting") return "neutral";
    return "accent";
  }

  function paintPreset(id, preset, accessDetail) {
    var card = document.querySelector("[data-preset='" + id + "']");
    if (!card) return;
    var state = preset && preset.state ? preset.state : "add";
    if (card.getAttribute("data-state") === "connecting" && state !== "connected") return;
    card.setAttribute("data-state", state);
    card.disabled = state === "connected";
    var badge = card.querySelector("[data-preset-badge]");
    var detail = card.querySelector(".preset-detail");
    if (badge) badge.className = state === "add" ? "preset-action" : ("badge " + presetTone(state));
    if (state === "needs_access") {
      if (badge) badge.textContent = "Needs Google access";
      if (detail) detail.textContent = preset && preset.message ? preset.message : accessDetail;
    } else if (state === "connected") {
      if (badge) badge.textContent = "Connected";
      if (detail) detail.textContent = "Uses your Google account.";
    } else if (state === "error") {
      if (badge) badge.textContent = "Couldn't add";
    } else if (state === "connecting") {
      if (badge) badge.textContent = "Connecting";
    } else if (state === "ready") {
      if (badge) badge.textContent = "Connected";
      if (detail) detail.textContent = "Uses your Google account.";
    } else {
      if (badge) badge.textContent = "Add";
      if (detail) detail.textContent = "Uses your Google account.";
    }
  }

  function presetTaken(id, connectors) {
    return connectors.some(function (connector) {
      if (!connector) return false;
      if (connector.preset === id) return true;
      if (id === "google-forms" && connector.url === "builtin:google-forms") return true;
      if (id === "google-calendar" && /calendarmcp\\.googleapis\\.com/.test(connector.url || "")) return true;
      return false;
    });
  }

  function hideConnectedPresets(connectors) {
    var any = false;
    document.querySelectorAll(".preset-card[data-preset]").forEach(function (card) {
      var id = card.getAttribute("data-preset") || "";
      var hide = card.getAttribute("data-state") === "connected" && presetTaken(id, connectors);
      card.hidden = hide;
      if (!hide) any = true;
    });
    var box = document.getElementById("mcp-presets");
    if (box) box.hidden = !any;
  }

  function paintMcp(data) {
    if (data && data.presets) mcpPresets = data.presets;
    paintPreset("google-forms", mcpPresets["google-forms"], "Connect Google Forms");
    paintPreset("google-calendar", mcpPresets["google-calendar"], "Connect Google Calendar");
    var connectors = Array.isArray(data.connectors) ? data.connectors : [];
    mcpRows = connectors;
    mcpDemoUrl = typeof data.demoUrl === "string" ? data.demoUrl : "";
    var demo = document.getElementById("mcp-demo");
    var note = document.getElementById("mcp-demo-note");
    if (demo) demo.hidden = !mcpDemoUrl;
    if (note) note.textContent = mcpDemoUrl || "";
    var empty = document.getElementById("mcp-empty");
    var head = document.getElementById("mcp-add-head");
    if (empty) empty.hidden = connectors.length > 0;
    if (head) head.hidden = connectors.length === 0;
    var list = document.getElementById("mcp-list");
    if (!list) return;
    list.replaceChildren();
    connectors.forEach(function (connector) {
      list.appendChild(mcpCard(connector));
    });
    hideConnectedPresets(connectors);
    var manageDialog = document.getElementById("mcp-manage-dialog");
    if (mcpManageId && manageDialog && !manageDialog.hidden) paintMcpManage();
  }

  function mcpIcon(connector) {
    var key = connector.preset || (connector.url === "builtin:google-forms" ? "google-forms" : /calendarmcp\\.googleapis\\.com/.test(connector.url || "") ? "google-calendar" : "");
    var source = key ? document.querySelector(".preset-card[data-preset='" + key + "'] .conn-mark") : null;
    if (source) {
      var copy = source.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      return copy;
    }
    var mark = document.createElement("span");
    mark.className = "conn-mark mcp-generic-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/></svg>';
    return mark;
  }

  function mcpSummary(connector) {
    var tools = connector.tools || [];
    var on = tools.filter(function (tool) { return tool.enabled === true; }).length;
    return tools.length + (tools.length === 1 ? " tool" : " tools") + " · " + on + " on";
  }

  function mcpCard(connector) {
    var card = document.createElement("article");
    card.className = "settings-card mcp-card";
    card.setAttribute("data-connector", connector.id || "");
    var head = document.createElement("div");
    head.className = "mcp-card-head";
    var who = document.createElement("div");
    who.className = "mcp-card-who";
    var title = document.createElement("h2");
    title.className = "mcp-name";
    title.textContent = connector.name || "Connector";
    var pill = document.createElement("span");
    pill.className = mcpBadgeClass(connector.status);
    pill.setAttribute("data-status", connector.status || "draft");
    pill.textContent = mcpStatusLabel(connector.status);
    who.append(mcpIcon(connector), title);
    var manage = document.createElement("button");
    manage.type = "button";
    manage.className = "secondary mcp-manage";
    manage.textContent = "Manage";
    manage.setAttribute("aria-haspopup", "dialog");
    manage.setAttribute("aria-label", "Manage " + (connector.name || "connector"));
    manage.addEventListener("click", function () { openMcpManage(connector.id); });
    var actions = document.createElement("div");
    actions.className = "mcp-card-actions";
    actions.append(pill, manage);
    head.append(who, actions);
    var summary = document.createElement("p");
    summary.className = "mcp-summary";
    summary.textContent = mcpSummary(connector);
    card.append(head, summary);
    if (connector.lastError) {
      var error = document.createElement("p");
      error.className = "alert";
      error.setAttribute("role", "alert");
      error.textContent = connector.lastError;
      card.append(error);
    }
    return card;
  }

  var mcpManageId = "";
  var mcpManageOpener = null;

  function openMcpManage(id) {
    mcpManageId = id || "";
    mcpManageOpener = document.activeElement;
    if (!paintMcpManage()) return;
    openDialog("mcp-manage-dialog");
  }

  function closeMcpManage() {
    closeDialog("mcp-manage-dialog");
    mcpManageId = "";
    var target = mcpManageOpener;
    if (target && !document.body.contains(target) ) target = null;
    if (!target) target = document.querySelector("#mcp-list .mcp-manage");
    if (target && target.focus) target.focus();
  }

  function paintMcpManage() {
    var connector = null;
    mcpRows.forEach(function (row) { if (row.id === mcpManageId) connector = row; });
    var dialog = document.getElementById("mcp-manage-dialog");
    if (!connector) {
      if (dialog && !dialog.hidden) closeMcpManage();
      return false;
    }
    var titleNode = document.getElementById("mcp-manage-title");
    if (titleNode) titleNode.textContent = connector.name || "Connector";
    var body = document.getElementById("mcp-manage-body");
    if (!body) return false;
    var keep = body.scrollTop;
    var focusTool = document.activeElement && body.contains(document.activeElement) && document.activeElement.closest("[data-tool]");
    var focusName = focusTool ? focusTool.getAttribute("data-tool") : "";
    body.replaceChildren();
    var top = document.createElement("div");
    top.className = "mcp-manage-top";
    var pill = document.createElement("span");
    pill.className = mcpBadgeClass(connector.status);
    pill.setAttribute("data-status", connector.status || "draft");
    pill.textContent = mcpStatusLabel(connector.status);
    var url = document.createElement("p");
    url.className = "mcp-url";
    url.textContent = (connector.preset === "google-forms" || connector.url === "builtin:google-forms") ? "Built in" : (connector.url || "");
    top.append(pill, url);
    var tested = document.createElement("p");
    tested.className = "meta";
    tested.textContent = mcpWhen(connector.lastTestedAt);
    body.append(top, tested);
    if (connector.lastError) {
      var error = document.createElement("p");
      error.className = "alert";
      error.setAttribute("role", "alert");
      error.textContent = connector.lastError;
      body.append(error);
    }
    if (connector.authType === "google_oauth") {
      var account = document.createElement("p");
      account.className = "meta";
      account.textContent = "Uses your Google account.";
      body.append(account);
    } else {
      var tokenLine = document.createElement("p");
      tokenLine.className = "mcp-token-line";
      var tokenButton = document.createElement("button");
      tokenButton.type = "button";
      tokenButton.className = "secondary";
      tokenButton.setAttribute("data-token", connector.id || "");
      if (connector.hasToken) tokenButton.textContent = "Set ••••" + String(connector.tokenLast4 || "") + " · Replace";
      else tokenButton.textContent = "Add token";
      tokenButton.addEventListener("click", function () { openMcpToken(connector); });
      tokenLine.append(tokenButton);
      body.append(tokenLine);
    }
    var actions = document.createElement("div");
    actions.className = "wait-actions";
    var again = document.createElement("button");
    again.type = "button";
    again.className = "secondary";
    again.textContent = "Test again";
    again.addEventListener("click", function () { testMcpAgain(connector.id, again); });
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", function () { openMcpRemove(connector); });
    actions.append(again, remove);
    body.append(actions);
    var tools = connector.tools || [];
    var groups = [["read", "Read"], ["write", "Write"], ["delete", "Delete"]];
    var wrap = document.createElement("div");
    wrap.className = "mcp-tools";
    groups.forEach(function (group) {
      var members = tools.filter(function (tool) {
        var kind = tool.actionClass === "read" || tool.actionClass === "delete" ? tool.actionClass : "write";
        return kind === group[0];
      });
      if (!members.length) return;
      var section = document.createElement("section");
      section.className = "mcp-tool-group";
      section.setAttribute("data-group", group[0]);
      var heading = document.createElement("h3");
      heading.id = "mcp-group-" + group[0];
      heading.textContent = group[1] + " · " + members.length;
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);
      members.forEach(function (tool) { section.appendChild(mcpToolRow(connector, tool)); });
      wrap.append(section);
    });
    if (!tools.length) {
      var none = document.createElement("p");
      none.className = "meta";
      none.textContent = "No tools found. Test again to refresh.";
      wrap.append(none);
    }
    body.append(wrap);
    body.scrollTop = keep;
    if (focusName) {
      var back = body.querySelector("[data-tool='" + focusName + "'] input");
      if (back) back.focus();
    }
    return true;
  }

  function mcpToolRow(connector, tool) {
    var row = document.createElement("div");
    row.className = "mcp-tool";
    row.setAttribute("data-tool", tool.name || "");
    var copy = document.createElement("div");
    copy.className = "mcp-tool-copy";
    var name = document.createElement("p");
    name.className = "mcp-tool-name";
    name.textContent = tool.name || "";
    var description = document.createElement("p");
    description.className = "mcp-tool-desc";
    description.textContent = tool.description || "";
    var badges = document.createElement("p");
    badges.className = "mcp-tool-badges";
    var action = document.createElement("span");
    action.className = tool.actionClass === "delete" ? "badge bad" : tool.actionClass === "read" ? "badge info" : "badge warn";
    action.textContent = mcpActionLabel(tool.actionClass);
    badges.append(action);
    if (tool.changed) {
      var changed = document.createElement("span");
      changed.className = "badge warn";
      changed.textContent = "Changed since approval";
      badges.append(changed);
    }
    copy.append(name, description, badges);
    var label = document.createElement("label");
    label.className = "switch";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = tool.enabled === true;
    input.setAttribute("aria-label", "Enable " + (tool.name || "tool"));
    input.addEventListener("change", function () {
      var next = input.checked;
      input.disabled = true;
      mcpPost("/console/connectors/" + encodeURIComponent(connector.id) + "/tools/" + encodeURIComponent(tool.name), { enabled: next }).then(function (result) {
        input.disabled = false;
        if (!result.ok) {
          input.checked = !next;
          toast(result.message || "That could not be saved.");
          return;
        }
        if (result.connector) paintMcp({ connectors: replaceMcp(result.connector), demoUrl: mcpDemoUrl });
      });
    });
    var sr = document.createElement("span");
    sr.className = "sr";
    sr.textContent = "Enable " + (tool.name || "tool");
    label.append(input, sr);
    row.append(copy, label);
    return row;
  }

  function replaceMcp(connector) {
    var found = false;
    var next = mcpRows.map(function (row) {
      if (row.id === connector.id) { found = true; return connector; }
      return row;
    });
    if (!found) next.push(connector);
    return next;
  }

  function openMcpDialog() {
    var form = document.getElementById("mcp-form");
    if (form) form.reset();
    var header = document.getElementById("mcp-header");
    if (header) header.value = "Authorization";
    var error = document.getElementById("mcp-error");
    var ok = document.getElementById("mcp-ok");
    if (error) { error.hidden = true; error.textContent = ""; }
    if (ok) { ok.hidden = true; ok.textContent = ""; }
    setMcpBusy(false);
    openDialog("mcp-dialog");
    var name = document.getElementById("mcp-name");
    if (name) name.focus();
  }

  function mcpFields() {
    var name = (document.getElementById("mcp-name").value || "").trim();
    var url = (document.getElementById("mcp-url").value || "").trim();
    var token = document.getElementById("mcp-token").value || "";
    var headerName = (document.getElementById("mcp-header").value || "").trim() || "Authorization";
    var error = "";
    if (!name) error = "Enter a name.";
    else if (!url || !/^https?:\\/\\//i.test(url)) error = "Enter a valid server URL.";
    return { name: name, url: url, token: token, headerName: headerName, error: error };
  }

  function showMcpError(message) {
    var error = document.getElementById("mcp-error");
    var ok = document.getElementById("mcp-ok");
    if (ok) ok.hidden = true;
    if (!error) return;
    error.hidden = !message;
    error.textContent = message || "";
  }

  function showMcpOk(message) {
    var ok = document.getElementById("mcp-ok");
    var error = document.getElementById("mcp-error");
    if (error) error.hidden = true;
    if (!ok) return;
    ok.hidden = !message;
    ok.textContent = message || "";
  }

  function setMcpBusy(on) {
    mcpBusy = on === true;
    ["mcp-test", "mcp-save", "mcp-use-demo"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.disabled = id === "mcp-use-demo" ? !mcpDemoUrl || mcpBusy : mcpBusy;
    });
    var dialog = document.getElementById("mcp-dialog");
    if (dialog) dialog.setAttribute("aria-busy", mcpBusy ? "true" : "false");
  }

  function testMcpConnection() {
    if (mcpBusy) return;
    var fields = mcpFields();
    if (fields.error) { showMcpError(fields.error); return; }
    setMcpBusy(true);
    showMcpError("");
    mcpPost("/console/connectors/probe", fields).then(function (result) {
      setMcpBusy(false);
      if (!result.ok) { showMcpError(result.message || "The connection failed."); return; }
      var server = result.serverInfo && result.serverInfo.name ? result.serverInfo.name : "Server";
      var count = Number(result.toolCount || 0);
      showMcpOk(server + " · " + count + (count === 1 ? " tool" : " tools"));
    });
  }

  function saveMcp(event) {
    event.preventDefault();
    if (mcpBusy) return;
    var fields = mcpFields();
    if (fields.error) { showMcpError(fields.error); return; }
    setMcpBusy(true);
    mcpPost("/console/connectors", fields).then(function (result) {
      setMcpBusy(false);
      if (!result.ok || !result.connector) { showMcpError(result.message || "That could not be saved."); return; }
      closeDialog("mcp-dialog");
      loadMcp().then(function () {
        if (result.test && result.test.ok === false) toast(result.test.message || "The connection failed.");
        else toast("Connector saved.");
      });
    });
  }

  function testMcpAgain(id, button) {
    if (!id || (button && button.disabled)) return;
    if (button) button.disabled = true;
    mcpPost("/console/connectors/" + encodeURIComponent(id) + "/test", {}).then(function (result) {
      if (button) button.disabled = false;
      if (result.connector) paintMcp({ connectors: replaceMcp(result.connector), demoUrl: mcpDemoUrl });
      else loadMcp();
      if (result.test && result.test.ok === false) toast(result.test.message || "The connection failed.");
      else if (result.ok) toast("Connection succeeded.");
    });
  }

  function openMcpToken(connector) {
    mcpTokenId = connector.id || "";
    var current = document.getElementById("mcp-token-current");
    if (current) {
      current.textContent = connector.hasToken ? ("Set ••••" + String(connector.tokenLast4 || "")) : "No token is stored.";
    }
    var next = document.getElementById("mcp-token-next");
    if (next) next.value = "";
    var header = document.getElementById("mcp-token-header");
    if (header) header.value = connector.headerName || "Authorization";
    var error = document.getElementById("mcp-token-error");
    if (error) { error.hidden = true; error.textContent = ""; }
    openDialog("mcp-token-dialog");
  }

  function saveMcpToken(event, clear) {
    if (event) event.preventDefault();
    if (!mcpTokenId) return;
    var token = clear ? "" : (document.getElementById("mcp-token-next").value || "");
    var headerName = (document.getElementById("mcp-token-header").value || "").trim() || "Authorization";
    mcpPost("/console/connectors/" + encodeURIComponent(mcpTokenId) + "/token", { token: token, headerName: headerName }).then(function (result) {
      var error = document.getElementById("mcp-token-error");
      if (!result.ok) {
        if (error) { error.hidden = false; error.textContent = result.message || "That could not be saved."; }
        return;
      }
      closeDialog("mcp-token-dialog");
      loadMcp();
      toast(clear ? "Token cleared." : "Token replaced.");
    });
  }

  function openMcpRemove(connector) {
    mcpRemoveId = connector.id || "";
    var copy = document.getElementById("mcp-remove-copy");
    if (copy) copy.textContent = "Remove " + (connector.name || "this connector") + " and its tools? This does not change the remote server.";
    openDialog("mcp-remove-dialog");
  }

  function confirmMcpRemove() {
    if (!mcpRemoveId) return;
    var id = mcpRemoveId;
    mcpPost("/console/connectors/" + encodeURIComponent(id) + "/remove", {}).then(function (result) {
      if (!result.ok) { toast(result.message || "That could not be saved."); return; }
      closeDialog("mcp-remove-dialog");
      loadMcp();
      toast("Connector removed.");
    });
  }

  function addPreset(id) {
    var card = document.querySelector("[data-preset='" + id + "']");
    if (!card) return;
    var state = card.getAttribute("data-state") || "add";
    var previous = state;
    if (state === "connecting" || state === "connected") return;
    var preset = mcpPresets[id] || {};
    var accessDetail = id === "google-calendar" ? "Connect Google Calendar" : "Connect Google Forms";
    var fallback = id === "google-calendar"
      ? "/console/auth/google?intent=calendar&next=/console/connectors"
      : "/console/auth/google?intent=forms&next=/console/connectors";
    if (state === "needs_access") {
      window.location.assign(preset.connectUrl || fallback);
      return;
    }
    card.setAttribute("data-state", "connecting");
    card.disabled = true;
    var badge = card.querySelector("[data-preset-badge]");
    if (badge) badge.textContent = "Connecting";
    mcpPost("/console/connectors/presets/" + id, {}).then(function (result) {
      if (result && result.code === "needs_access") {
        mcpPresets[id] = {
          state: "needs_access",
          connectUrl: result.connectUrl || "",
          message: result.detail || "",
        };
        card.setAttribute("data-state", "add");
        paintPreset(id, mcpPresets[id], accessDetail);
        if (result.connectUrl) window.location.assign(result.connectUrl);
        return;
      }
      if (!result || result.ok !== true) {
        card.disabled = false;
        card.setAttribute("data-state", "add");
        paintPreset(id, { state: "error" }, accessDetail);
        toast((result && result.message) || "That could not be saved.");
        return;
      }
      card.setAttribute("data-state", "add");
      loadMcp();
    });
  }

  var formsPreset = document.querySelector("[data-preset='google-forms']");
  if (formsPreset) formsPreset.addEventListener("click", function () { addPreset("google-forms"); });
  var calendarPreset = document.querySelector("[data-preset='google-calendar']");
  if (calendarPreset) calendarPreset.addEventListener("click", function () { addPreset("google-calendar"); });
  var mcpAdd = document.getElementById("mcp-add");
  var mcpAddHead = document.getElementById("mcp-add-head");
  if (mcpAdd) mcpAdd.addEventListener("click", openMcpDialog);
  if (mcpAddHead) mcpAddHead.addEventListener("click", openMcpDialog);
  var mcpForm = document.getElementById("mcp-form");
  if (mcpForm) mcpForm.addEventListener("submit", saveMcp);
  var mcpTest = document.getElementById("mcp-test");
  if (mcpTest) mcpTest.addEventListener("click", testMcpConnection);
  var mcpUseDemo = document.getElementById("mcp-use-demo");
  if (mcpUseDemo) mcpUseDemo.addEventListener("click", function () {
    if (!mcpDemoUrl) return;
    var url = document.getElementById("mcp-url");
    if (url) url.value = mcpDemoUrl;
  });
  var mcpTokenForm = document.getElementById("mcp-token-form");
  if (mcpTokenForm) mcpTokenForm.addEventListener("submit", function (event) { saveMcpToken(event, false); });
  var mcpTokenClear = document.getElementById("mcp-token-clear");
  if (mcpTokenClear) mcpTokenClear.addEventListener("click", function () { saveMcpToken(null, true); });
  document.querySelectorAll("[data-manage-close]").forEach(function (node) {
    node.addEventListener("click", function (event) { event.stopPropagation(); closeMcpManage(); });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var top = null;
    ["mcp-remove-dialog", "mcp-token-dialog", "mcp-manage-dialog"].forEach(function (id) {
      var node = document.getElementById(id);
      if (!top && node && !node.hidden) top = node;
    });
    if (!top) return;
    var list = Array.prototype.filter.call(top.querySelectorAll("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])"), function (node) {
      return !node.disabled && node.offsetParent !== null;
    });
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    if (!top.contains(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  });
  var mcpRemoveConfirm = document.getElementById("mcp-remove-confirm");
  if (mcpRemoveConfirm) mcpRemoveConfirm.addEventListener("click", confirmMcpRemove);

  load();
  syncRail();

  function loadFiles() {
    var list = document.getElementById("files-list");
    if (!list) return Promise.resolve();
    var error = document.getElementById("files-error");
    if (error) error.hidden = true;
    return fetch("/api/files" + (location.search || ""), { headers: { accept: "application/json" } })
      .then(function (res) {
        // A workspace without file storage has no files to list, which is the empty state, not an error.
        if (res.status === 404) return {};
        if (!res.ok) throw new Error("files " + res.status);
        return res.json();
      })
      .then(function (body) { paintFiles(body || {}); })
      .then(scheduleFilesPoll)
      .catch(function () {
        if (error) {
          error.hidden = false;
          error.textContent = "Files could not be loaded.";
        }
      });
  }

  var filesPollTimer = null;
  var filesBusy = false;
  var filesChannels = [];
  var filesDeleteId = "";

  function scheduleFilesPoll() {
    if (filesPollTimer) clearTimeout(filesPollTimer);
    filesPollTimer = null;
    var section = document.getElementById("files");
    if (!filesBusy || !section || section.hidden) return;
    // Storing a file takes a few seconds. Check again until it is ready.
    filesPollTimer = setTimeout(loadFiles, 3000);
  }

  function paintFilesActions(body) {
    var actions = document.getElementById("files-actions");
    var select = document.getElementById("files-channel");
    filesChannels = body.channels || [];
    if (actions) actions.hidden = !body.viewer || filesChannels.length === 0;
    if (!select) return;
    var keep = select.value;
    select.replaceChildren();
    filesChannels.forEach(function (channel) {
      var option = document.createElement("option");
      option.value = channel.id;
      option.textContent = channel.name || "Channel";
      select.append(option);
    });
    if (keep) select.value = keep;
    select.hidden = filesChannels.length < 2;
    var copy = document.getElementById("channel-files-empty-copy");
    if (copy) copy.textContent = filesChannels.length ? "Upload a file to share it with this workspace." : "Files from your channels show up here.";
  }

  function paintFiles(body) {
    paintFilesActions(body);
    var uploading = body.uploading || [];
    filesBusy = uploading.some(function (file) { return file.uploading; }) || (body.files || []).some(function (file) { return file.deleting; });
    var files = uploading.concat(body.files || []);
    var requests = (body.requests || []).filter(function (request) { return request.canAnswer; });
    var unanswered = body.unanswered || [];
    paintFileRequests("files-requests", "Delete requests", requests, true);
    paintFileRequests("files-unanswered", "Unanswered delete requests", unanswered, false);
    var empty = document.getElementById("channel-files-empty");
    var list = document.getElementById("files-list");
    if (empty) empty.hidden = files.length > 0 || requests.length > 0 || unanswered.length > 0;
    if (!list) return;
    list.replaceChildren();
    var names = [];
    files.forEach(function (file) {
      if (names.indexOf(file.channelName) === -1) names.push(file.channelName);
    });
    names.forEach(function (channel) {
      var group = document.createElement("section");
      group.className = "files-group";
      var heading = document.createElement("h2");
      heading.className = "files-channel";
      heading.textContent = channel || "Channel";
      group.append(heading);
      files.filter(function (file) { return file.channelName === channel; }).forEach(function (file) {
        group.append(fileRow(file));
      });
      list.append(group);
    });
  }

  function paintFileRequests(id, title, rows, answering) {
    var host = document.getElementById(id);
    if (!host) return;
    host.replaceChildren();
    host.hidden = rows.length === 0;
    if (!rows.length) return;
    var heading = document.createElement("h2");
    heading.className = "files-channel";
    heading.textContent = title;
    host.append(heading);
    rows.forEach(function (request) {
      var card = document.createElement("article");
      card.className = answering ? "file-request" : "file-unanswered";
      var copy = document.createElement("div");
      copy.className = "file-request-copy";
      var who = request.requestedByName || "Someone";
      var ask = document.createElement("p");
      ask.textContent = who + " asked to delete " + (request.fileName || "a file");
      copy.append(ask);
      if (request.reason) {
        var reason = document.createElement("p");
        reason.className = "file-meta";
        reason.textContent = "\u201c" + request.reason + "\u201d";
        copy.append(reason);
      }
      var actions = document.createElement("div");
      actions.className = "file-request-actions";
      if (answering) {
        actions.append(fileButton("Approve", "primary", function () { answerFileRequest(request.id, true); }));
        actions.append(fileButton("Decline", "secondary", function () { answerFileRequest(request.id, false); }));
      } else {
        actions.append(fileButton("Delete", "danger", function () { deleteListedFile(request.fileId); }));
        actions.append(fileButton("Dismiss", "secondary", function () { dismissFileRequest(request.id); }));
      }
      card.append(copy, actions);
      host.append(card);
    });
  }

  function fileRow(file) {
    var row = document.createElement("article");
    row.className = "file-row";
    row.setAttribute("data-file", file.id);
    var copy = document.createElement("div");
    copy.className = "file-copy";
    var name = document.createElement("p");
    name.className = "file-name";
    name.textContent = file.name;
    var meta = document.createElement("p");
    meta.className = "file-meta";
    meta.textContent = [file.ownerName || "Someone", formatFileSize(file.sizeBytes), formatFileDate(file.createdAt)].filter(Boolean).join(" · ");
    copy.append(name, meta);
    var actions = document.createElement("div");
    actions.className = "file-actions";
    if (file.proof) copy.append(fileProofBadge(file));
    if (file.uploading || file.failed) {
      var state = document.createElement("p");
      state.className = "files-deleting";
      state.textContent = file.uploading ? "Uploading…" : "Couldn't upload";
      actions.append(state);
      if (file.failed) actions.append(fileButton("Remove", "secondary", function () { discardFailedFile(file.id); }));
      row.append(copy, actions);
      return row;
    }
    if (file.deleting) {
      var pending = document.createElement("p");
      pending.className = "files-deleting";
      pending.textContent = "Deleting…";
      actions.append(pending);
      row.append(copy, actions);
      return row;
    }
    var trigger = fileButton("Actions", "secondary", function (event) {
      event.stopPropagation();
      var menu = actions.querySelector(".file-menu");
      var open = menu && menu.hidden;
      closeFileMenus();
      if (menu && open) menu.hidden = false;
    });
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-label", "Actions for " + file.name);
    var menu = document.createElement("div");
    menu.className = "file-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.append(fileMenuItem("Download", false, function () { downloadListedFile(file); }));
    if (file.canDelete) menu.append(fileMenuItem("Delete", true, function () { confirmFileDelete(file); }));
    if (file.canRequest) menu.append(fileMenuItem("Ask owner to delete", false, function () { askFileDelete(file.id); }));
    actions.append(trigger, menu);
    row.append(copy, actions);
    return row;
  }

  function fileButton(label, kind, run) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = kind;
    button.textContent = label;
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      run(event);
    });
    return button;
  }

  function fileMenuItem(label, danger, run) {
    var button = fileButton(label, danger ? "menu-item danger" : "menu-item", run);
    button.setAttribute("role", "menuitem");
    return button;
  }

  function closeFileMenus() {
    document.querySelectorAll("#files .file-menu").forEach(function (menu) { menu.hidden = true; });
  }

  function filesPost(path, body) {
    return fetch(path + (location.search || ""), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (payload) {
        if (!res.ok) throw new Error(payload.error || "The file request failed");
        return payload;
      });
    });
  }

  function fileNote(message) {
    var error = document.getElementById("files-error");
    if (!error) return;
    error.hidden = !message;
    error.textContent = message || "";
  }

  function fileProofBadge(file) {
    var badge = document.createElement("button");
    badge.type = "button";
    badge.className = "file-verified";
    badge.textContent = "Verified on Walrus";
    badge.setAttribute("aria-label", "Verified on Walrus: details for " + file.name);
    badge.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openFileProof(file);
    });
    return badge;
  }

  function openFileProof(file) {
    var proof = file.proof || {};
    var plain = document.getElementById("file-proof-plain");
    var when = document.getElementById("file-proof-when");
    var facts = document.getElementById("file-proof-facts");
    var tech = document.getElementById("file-proof-tech");
    if (plain) plain.textContent = (file.name || "This file") + " is stored encrypted, with a public proof it was saved. Only people in this workspace can open it.";
    if (when) when.textContent = proof.storedAt ? "Stored " + formatFileDate(proof.storedAt) + "." : "";
    if (tech) tech.open = false;
    if (facts) {
      facts.replaceChildren();
      [["Blob ID", proof.blobId], ["Object ID", proof.objectId], ["File ID", file.id]].forEach(function (pair) {
        if (!pair[1]) return;
        var term = document.createElement("dt");
        term.textContent = pair[0];
        var value = document.createElement("dd");
        var code = document.createElement("code");
        code.textContent = pair[1];
        value.append(code);
        facts.append(term, value);
      });
    }
    openDialog("file-proof-dialog");
  }

  function confirmFileDelete(file) {
    closeFileMenus();
    filesDeleteId = file.id;
    var copy = document.getElementById("file-delete-copy");
    if (copy) copy.textContent = "Delete " + (file.name || "this file") + " for everyone in the workspace? This cannot be undone.";
    openDialog("file-delete-dialog");
  }

  var fileDeleteConfirm = document.getElementById("file-delete-confirm");
  if (fileDeleteConfirm) fileDeleteConfirm.addEventListener("click", function () {
    var id = filesDeleteId;
    filesDeleteId = "";
    closeDialog("file-delete-dialog");
    if (id) deleteListedFile(id);
  });

  function discardFailedFile(id) {
    filesPost("/api/files/" + encodeURIComponent(id) + "/discard").then(loadFiles).catch(function (error) {
      fileNote(error.message || "The file could not be removed.");
    });
  }

  var filesUpload = document.getElementById("files-upload");
  var filesInput = document.getElementById("files-input");
  if (filesUpload && filesInput) {
    filesUpload.addEventListener("click", function () { filesInput.click(); });
    filesInput.addEventListener("change", function () {
      var picked = filesInput.files && filesInput.files[0];
      filesInput.value = "";
      if (picked) uploadPickedFile(picked);
    });
  }

  function uploadPickedFile(picked) {
    var select = document.getElementById("files-channel");
    var channelId = (select && select.value) || (filesChannels[0] && filesChannels[0].id) || "";
    fileNote("");
    if (filesUpload) {
      filesUpload.disabled = true;
      filesUpload.textContent = "Uploading…";
    }
    fetch("/api/files" + (location.search || ""), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": picked.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(picked.name || "file"),
        "x-channel-id": channelId
      },
      body: picked
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (payload) {
        if (!res.ok) throw new Error(payload.error || "The file could not be uploaded.");
        return payload;
      });
    }).then(loadFiles).catch(function (error) {
      fileNote(error.message || "The file could not be uploaded.");
    }).then(function () {
      if (filesUpload) {
        filesUpload.disabled = false;
        filesUpload.textContent = "Upload file";
      }
    });
  }

  function downloadListedFile(file) {
    closeFileMenus();
    // A short-lived link opens the file straight from the server. The fallback reads it here.
    filesPost("/api/files/" + encodeURIComponent(file.id) + "/link").then(function (link) {
      if (!link || !link.url) throw new Error("no link");
      var anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.download = file.name || "file";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    }).catch(function () { downloadFileBytes(file); });
  }

  function downloadFileBytes(file) {
    var path = "/api/files/" + encodeURIComponent(file.id) + (location.search || "");
    fetch(path).then(function (res) {
      if (!res.ok) {
        fileNote("The file could not be downloaded.");
        return null;
      }
      return res.blob();
    }).then(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = file.name || "file";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }).catch(function () { fileNote("The file could not be downloaded."); });
  }

  function deleteListedFile(id) {
    closeFileMenus();
    filesPost("/api/files/" + encodeURIComponent(id) + "/delete").then(loadFiles).catch(function (error) {
      fileNote(error.message || "The file could not be deleted.");
    });
  }

  function askFileDelete(id) {
    closeFileMenus();
    filesPost("/api/files/" + encodeURIComponent(id) + "/request-delete", { reason: "Please delete this file." })
      .then(function () { return loadFiles(); })
      .then(function () { fileNote("Asked the owner to delete it."); })
      .catch(function (error) { fileNote(error.message || "The request was not sent."); });
  }

  function answerFileRequest(id, approve) {
    filesPost("/api/files/requests/" + encodeURIComponent(id) + "/answer", { approve: approve })
      .then(loadFiles)
      .catch(function (error) { fileNote(error.message || "The request was not answered."); });
  }

  function dismissFileRequest(id) {
    filesPost("/api/files/requests/" + encodeURIComponent(id) + "/dismiss")
      .then(loadFiles)
      .catch(function (error) { fileNote(error.message || "The request was not dismissed."); });
  }

  function formatFileSize(bytes) {
    var size = Number(bytes) || 0;
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
    var mb = size / (1024 * 1024);
    return (mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10) + " MB";
  }

  function formatFileDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[date.getUTCMonth()] + " " + date.getUTCDate() + ", " + date.getUTCFullYear();
  }

  document.addEventListener("click", closeFileMenus);
})();
</script>
</body>
</html>`;
}

/**
 * The name shown for who kept a sentence. The session label replaces the
 * process member id. A raw id, a row id, or an address stays blank.
 *
 * @param {string} speaker
 * @param {string} displayName
 * @param {string} memberId
 */
export function speakerLabel(speaker, displayName, memberId) {
  const value = String(speaker || "").trim();
  if (!value) return "";
  const shown = String(displayName || "").trim();
  const mine = String(memberId || "").trim();
  if (shown && (value === shown || (mine && value === mine))) return shown;
  if (/^\d+$/.test(value)) return "";
  if (/^ROW-\d+$/i.test(value)) return "";
  if (/^U[A-Z0-9_]{2,}$/i.test(value)) return "";
  if (/^0x[0-9a-fA-F]+$/.test(value)) return "";
  if (/^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(value)) return value.split(/[._-]+/).map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); }).join(" ");
  return value;
}

function accountInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || "?";
}

function toolNeedCard(tool, copy, never = false) {
  return `<div id="tool-ask-${tool}" class="tool-need" data-tool="${tool}" hidden>
    <p>${escapeHtml(copy)}</p>
    <div class="tool-need-actions">
      <button type="button" class="primary" data-tool-choice="connect">Connect now</button>
      <button type="button" data-tool-choice="later">Later</button>
      ${never ? `<button type="button" data-tool-choice="never">Never</button>` : ""}
    </div>
    <p class="tool-need-error alert" hidden role="alert"></p>
  </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON for a script tag. User-controlled names must not close the script. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Home's getting-started card. Real state only: the server reads tools and
 * team, the page marks the meeting item once a room exists.
 *
 * @param {{ tenantId: string, calendar: boolean, chat: boolean, team: boolean, canInvite: boolean } | null | undefined} list
 * @param {string} closeIcon
 */
function renderChecklist(list, closeIcon) {
  if (!list || !list.tenantId) return "";
  const tick = `<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const item = (id, done, title, action) => `<li class="check-item${done ? " done" : ""}" id="checklist-${id}">
        <span class="check-dot" aria-hidden="true">${tick}</span>
        <span class="check-title">${title}</span>
        <span class="sr check-state">${done ? "Done" : "To do"}</span>
        ${done ? "" : action}
      </li>`;
  const rows = [
    item("calendar", list.calendar, list.calendar ? "Calendar connected" : "Connect your calendar", `<a class="check-go" href="/console/setup#tools-card">Connect</a>`),
    item("chat", list.chat, list.chat ? "Slack connected" : "Choose where Sederunt posts", `<a class="check-go" href="/console/setup#tools-card">Set up</a>`),
    list.canInvite ? item("team", list.team, list.team ? "Team invited" : "Invite your team", `<a class="check-go" href="/console/welcome?step=team&amp;mode=manage">Invite</a>`) : "",
    item("meeting", false, "Add Sederunt to a meeting", `<button type="button" class="check-go" id="checklist-add-meeting">Add</button>`),
  ].filter(Boolean);
  const total = rows.length;
  const done = [list.calendar, list.chat, list.canInvite && list.team].filter(Boolean).length;
  return `<section class="home-checklist" id="home-checklist" data-tenant="${escapeHtml(list.tenantId)}" aria-labelledby="checklist-title">
      <div class="check-head">
        <div>
          <h2 id="checklist-title" class="check-heading">Get started with Sederunt</h2>
          <p class="check-sub"><span id="checklist-count">${done} of ${total} done</span></p>
        </div>
        <button type="button" class="icon-button check-close" id="checklist-dismiss" aria-label="Hide getting started">${closeIcon}</button>
      </div>
      <div class="check-track" aria-hidden="true"><span id="checklist-bar" style="width:${Math.round((done / total) * 100)}%"></span></div>
      <ul class="check-list">${rows.join("")}</ul>
    </section>`;
}

function renderWorkspaceSwitcher(spaces, switchIcon) {
  if (!spaces?.oauth) {
    return `<button id="workspace-chip" class="chip" type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="workspace-menu">
          <span id="chip-mark" class="tile-mark co" aria-hidden="true">C</span>
          <span class="ws-copy"><span id="chip-name">Company</span><span id="chip-hint"></span></span>
          ${switchIcon}
        </button>
        <div id="workspace-menu" class="menu" role="menu" aria-labelledby="workspace-chip" hidden>
          <button class="menu-item" type="button" role="menuitemradio" data-workspace="company" aria-checked="true"><span class="tile-mark co" aria-hidden="true">C</span><span class="ws-copy"><span>Company</span><span class="menu-hint"></span></span></button>
          <button class="menu-item" type="button" role="menuitemradio" data-workspace="personal" aria-checked="false"><span class="tile-mark pe" aria-hidden="true">P</span><span class="ws-copy"><span>Personal</span><span class="menu-hint">A separate workspace</span></span></button>
          <div class="menu-rule" role="separator"></div>
          <button class="menu-item" id="create-workspace" type="button" role="menuitem"><span class="ws-copy"><span>About Company</span><span class="menu-hint">What Company is</span></span></button>
        </div>`;
  }
  const items = Array.isArray(spaces.items) ? spaces.items : [];
  const active = items.find((item) => item.id && item.id === spaces.activeId) || items[0] || null;
  const personal = (active?.kind || spaces.activeKind) === "personal";
  const name = active?.name || spaces.activeName || "Personal";
  const hint = active?.hint || "";
  const mark = active?.mark || (personal ? "P" : "S");
  const rows = items.map((item) => {
    const on = !!(active && item.id === active.id);
    const itemPersonal = item.kind === "personal";
    return `<form class="space-form" method="post" action="/console/space">
          <input type="hidden" name="tenant" value="${escapeHtml(item.id)}">
          <button class="menu-item" type="submit" role="menuitemradio" data-tenant="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.kind)}" aria-checked="${on ? "true" : "false"}" tabindex="${on ? "0" : "-1"}">
            <span class="${itemPersonal ? "tile-mark pe" : "tile-mark"}" aria-hidden="true">${escapeHtml(item.mark || "S")}</span>
            <span class="ws-copy"><span>${escapeHtml(item.name)}</span><span class="menu-hint">${escapeHtml(item.hint || "")}</span></span>
          </button>
        </form>`;
  }).join("");
  const error = spaces.error
    ? `<p class="menu-note" role="alert">${escapeHtml(spaces.error)}</p>`
    : "";
  return `<button id="workspace-chip" class="chip" type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="workspace-menu">
          <span id="chip-mark" class="${personal ? "tile-mark pe" : "tile-mark"}" aria-hidden="true">${escapeHtml(mark)}</span>
          <span class="ws-copy"><span id="chip-name">${escapeHtml(name)}</span><span id="chip-hint">${escapeHtml(hint)}</span></span>
          ${switchIcon}
        </button>
        <div id="workspace-menu" class="menu" role="menu" aria-labelledby="workspace-chip" hidden>
          ${error}
          ${rows}
          <div class="menu-rule" role="separator"></div>
          <button class="menu-item" id="create-workspace" type="button" role="menuitem" tabindex="${items.length ? "-1" : "0"}"><span class="ws-copy"><span>Create workspace</span><span class="menu-hint">For another company or team</span></span></button>
        </div>`;
}

function renderSpaceDialog(closeIcon) {
  return `<div id="space-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="space-dialog-title">
  <div class="shade" data-close="space-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="space-dialog-title">Create workspace</h2>
      <button type="button" class="close" data-close="space-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <form class="panel-body" method="post" action="/console/welcome" id="space-dialog-form">
      <p class="page-lede">A separate workspace with its own meetings and people. You can invite people next.</p>
      <input type="hidden" name="action" value="create">
      <input type="hidden" name="from" value="switcher">
      <label>Workspace name
        <input id="space-name" name="name" required maxlength="120" minlength="1" autocomplete="organization" placeholder="Acme">
      </label>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="space-dialog">Cancel</button>
        <button class="primary" type="submit" id="space-submit">Create workspace</button>
      </div>
    </form>
  </div>
</div>`;
}
