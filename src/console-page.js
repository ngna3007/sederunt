import { priorAsksForThread } from "./ask/thread.js";
import { normalizeHearing } from "./hearing.js";
import { CALENDAR_CONNECT_PATH } from "./connectors/calendar-preset.js";
import { SLACK_INSTALL_PATH } from "./slack/oauth.js";
import { LINEAR_INSTALL_PATH } from "./linear/oauth.js";
import { brandLogo, brandSprite } from "./brand-logos.js";
import { formatLastTested } from "./console/local-time.js";
import { renderConsoleClient } from "./console/page-client.js";
import { renderBotSettings } from "./console/bot-settings.js";
import { renderPeopleMatching } from "./console/people-matching.js";
import { sederuntMark, FAVICON_LINK } from "./sederunt-mark.js";

export { rankDecisions } from "./room-match.js";

/** Header cells, one per row cell, including the empty action column. */
export const ROOM_COLUMNS = ["Room", "Platform", "Speakers", "Status", "Started", "Length", ""];
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
  const slackInstall = state.slackInstall === true;
  const slackWorkspace = String(state.slackWorkspace || "").trim();
  const linearInstall = state.linearInstall === true;
  const linearWorkspace = String(state.linearWorkspace || "").trim();
  const slackNotice = ({
    connected: "Slack is installed for this workspace.",
    partial: "Slack did not grant all required permissions. Reconnect and approve the requested scopes.",
    failed: "Slack could not be connected. Your previous saved connection was not changed. Try again.",
    forbidden: "Only a workspace owner or admin can connect or change Slack.",
    conflict: "That Slack workspace is already connected to another Sederunt workspace.",
    "different-team": "This workspace already has a different Slack connection. Use Change Slack workspace to replace it.",
    stale: "The Slack connection changed while setup was open. Reload and try again.",
    expired: "This Slack setup link expired or was already used. Start again.",
    declined: "Slack setup was cancelled. Your saved connection was not changed.",
    unsupported: "Choose an individual Slack workspace. Organization-wide installations are not supported.",
  })[String(state.slackResult || "")] || "";
  const linearNotice = ({
    connected: "Linear is connected for this workspace.",
    partial: "Linear did not grant read and write. Reconnect and approve both.",
    failed: "Linear could not be connected. Your previous saved connection was not changed. Try again.",
    forbidden: "Only a workspace owner or admin can connect or change Linear.",
    conflict: "That Linear workspace is already connected to another Sederunt workspace.",
    different: "This workspace already has a different Linear connection. Use a different Linear workspace to replace it.",
    stale: "The Linear connection changed while setup was open. Reload and try again.",
    expired: "This Linear setup link expired or was already used. Start again.",
    declined: "Linear setup was cancelled. Your saved connection was not changed.",
  })[String(state.linearResult || "")] || "";
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
  const joinUnavailable = "Joining meetings is not set up on this server yet. Setup shows what is missing.";
  const joinDisabled = state.meeting ? "" : " disabled";
  const joinTrigger = hearing.triggers.length ? hearing.triggers.join("\n") : hearing.name;
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
  const peopleInvite = canInvite ? `<button type="button" class="secondary" id="people-invite" data-invite>${glyph('<path d="M8 3.2v9.6M3.2 8h9.6"/>')}Invite people</button>` : "";
  const membersCard = canInvite
    ? `<div class="settings-card" id="members-card"><p class="section-label">Members</p><p class="card-help">Invite people by email, copy the workspace invite link, or let anyone with your company email join.</p><div class="wait-actions"><button type="button" class="secondary" id="setup-invite" data-invite>Invite people</button></div></div>`
    : "";
  const inviteDialog = canInvite ? renderInviteDialog(closeIcon, state.spaces?.activeName || "") : "";
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
  const openHome = state.section === "home" && state.spaces?.activeKind !== "personal";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
${FAVICON_LINK}
<link rel="stylesheet" href="/console.css">
</head>
<body${openHome ? "" : ` class="is-reading"`}${state.calendarTimeZone ? ` data-calendar-zone="${escapeHtml(state.calendarTimeZone)}"` : ""}>
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
    <section id="onboard"${openHome ? " hidden" : ""}>
      <div class="empty">
        <span class="empty-mark" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6.2A1.2 1.2 0 0 1 5.2 5h7.1A1.2 1.2 0 0 1 13.5 6.2V21"/><path d="M13.5 10.2h4.3A1.2 1.2 0 0 1 19 11.4V21"/><path d="M3 21h18"/><path d="M7.2 8.4h2.6M7.2 12h2.6M7.2 15.6h2.6"/></svg></span>
        <h2 class="sr">Onboard</h2>
        <h2 id="onboard-heading">Loading...</h2>
        <div id="onboard-skeleton" class="skeletons" hidden>
          <span class="sk sk-h"></span>
          <span class="sk sk-l"></span>
          <span class="sk sk-b"></span>
        </div>
        <p id="onboard-reading">Loading...</p>
        <p id="onboard-missing" hidden>The company account is not loaded. Add the delegate outside this page, then restart.</p>
        <p id="onboard-ready" hidden>A room appears when a meeting or a channel is in use.</p>
        <p id="onboard-next" hidden>Meeting and Channel were not turned on when Sederunt started.</p>
        <button id="open-connectors" type="button" hidden>Go to Setup</button>
        <button id="continue" type="button" hidden>Go to Home</button>
        <div id="onboard-doors"></div>
      </div>
    </section>
    <div id="home"${openHome ? "" : " hidden"}>
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
      <button type="button" class="secondary" id="home-add-to-meeting"${openHome ? " hidden" : ""}>Add to a meeting</button>
    </div>
    </div>
    <div class="home-tools">
    ${renderChecklist(state.checklist, closeIcon)}
    <div id="home-empty" class="home-empty"${openHome ? "" : " hidden"}>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span>
      <p id="home-empty-line">Your meetings will show up here</p>
      <p id="home-empty-aside" class="empty-aside">Add Sederunt to your next meeting. It keeps the decisions and follow-ups, and lists them here.</p>
      <div class="empty-actions">
        <button type="button" class="primary" id="home-add-meeting">Add Sederunt to a meeting</button>
        <a class="secondary" href="/console/setup" id="home-connect-tools"${toolsAllOn ? " hidden" : ""}>Connect tools</a>
      </div>
    </div>
    ${calendarAsk}
    <div id="home-stats"${openHome ? " hidden" : ""}>
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
      <p id="loading-label">Loading...</p>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sk sk-tile"></span>
      <span class="sr">Loading...</span>
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
            <button type="button" class="secondary conn-manage" id="cal-manage" data-manage="calendar" aria-haspopup="dialog"${calendarConnected ? "" : " hidden"}>Manage</button>
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
            ${linearNotice ? `<p class="conn-hint" role="status">${escapeHtml(linearNotice)}</p>` : ""}
            <p id="lin-conn" class="conn-state${linearConnected ? "" : " off"}">${linearConnected ? "Connected" : "Not connected"}</p>
            <p id="lin-line" class="${linearConnected && linearWorkspace ? "conn-hint" : "sr"}">${linearConnected && linearWorkspace ? `Linear workspace: ${escapeHtml(linearWorkspace)}.` : "Linear runs automatically."}</p>
          </div>
          <div class="conn-actions" data-col="action">
            <button type="button" class="conn-connect" id="lin-connect" data-connect="linear"${linearConnected ? " hidden" : ""}>Connect</button>
            <button type="button" class="secondary conn-manage" id="lin-manage" data-manage="linear" aria-haspopup="dialog"${linearConnected ? "" : " hidden"}>Manage</button>
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
            ${slackNotice ? `<p class="conn-hint" role="status">${escapeHtml(slackNotice)}</p>` : ""}
            <p id="slack-conn" class="conn-state${slackConnected ? "" : " off"}">${slackConnected ? "Connected" : "Not connected"}</p>
            <p id="slack-line" class="conn-hint">${slackConnected && slackWorkspace ? `Slack workspace: ${escapeHtml(slackWorkspace)}. Add @Sederunt to a channel in Slack when you want it there.` : "Slack runs automatically."}</p>
            <p id="slack-note" class="sr">Sederunt answers in a channel it has already joined.</p>
          </div>
          <div class="conn-actions" data-col="action">
            <button type="button" class="conn-connect" id="slack-connect" data-connect="slack"${slackConnected ? " hidden" : ""}>Connect</button>
            <button type="button" class="secondary conn-manage" id="slack-manage" data-manage="slack" aria-haspopup="dialog"${slackConnected ? "" : " hidden"}>Manage</button>
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
          <p>People say this name.</p>
          <input id="hearing-name" name="hearing-name" maxlength="40" value="${escapeHtml(hearing.name)}" placeholder="Maple" autocomplete="off">
        </div>
        <div class="hearing-field">
          <label for="hearing-triggers">Triggers</label>
          <p>One word or sentence on each line.</p>
          <textarea id="hearing-triggers" name="hearing-triggers" rows="4" placeholder="A sentence that wakes the bot">${escapeHtml(hearing.triggers.length ? hearing.triggers.join("\n") : hearing.name)}</textarea>
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
      <div class="explorer"${openHome ? " hidden" : ""}>
        <div class="explorer-head">
          ${ROOM_COLUMNS.map((label, index) => `<span data-col="${["room", "platform", "speakers", "status", "started", "length", "action"][index]}">${escapeHtml(label)}</span>`).join("")}
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
      <div class="page-head" id="files-head"><div><p class="page-title">Files</p><p class="page-lede"><span>Files in the channels you can see.</span> <span>Kept with this workspace.</span> <span>Deleting hides a file here while cleanup is pending. It does not remove a copy already stored on Walrus.</span></p></div><div class="page-actions" id="files-actions" hidden><label class="sr" for="files-channel">Channel</label><select id="files-channel" hidden></select><input id="files-input" type="file" hidden><button type="button" class="primary" id="files-upload">Upload file</button></div></div>
      <div id="files-unanswered" hidden></div>
      <div id="files-requests" hidden></div>
      <div id="channel-files-empty" class="empty-state" hidden>
        <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.6h5.2L12.2 5.6V13H4z"/><path d="M9.1 2.7V5.7H12.2"/></svg></span>
        <p class="empty-title">No files yet.</p>
        <p id="channel-files-empty-copy">Files from your channels show up here.</p>
      </div>
      <div id="files-list"></div>
      <div id="files-error" class="meta" hidden></div>
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
<div id="join-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="join-title">
  <div class="shade" data-close="join-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="join-title">Add to a meeting</h2>
      <button type="button" class="close" data-close="join-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="panel-body">
    <p>Join a call that is happening now.</p>
    <form id="meet-form">
      <label id="meet-link-label"${state.meeting ? "" : " hidden"}>Meeting link <input id="meet-link" name="meet" placeholder="Paste a Zoom, Google Meet, Teams, or Webex link"></label>
      <p id="join-ready"${state.meeting ? " hidden" : ""}>${state.meeting ? "" : joinUnavailable}</p>
      <button id="join-submit" class="primary" type="submit"${joinDisabled}>Join now</button>
      <button id="meet-connectors" class="primary" type="button"${state.meeting ? " hidden" : ""}>Open Setup</button>
      <p id="join-hint" class="sr">Sederunt joins that meeting when Meet is ready. If Meet is not ready, the status line says so.</p>
    </form>
    <p id="join-status"></p>
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
    <div id="room-meeting">
      <p>A future meeting stays on the calendar. The room appears once Sederunt is in the call.</p>
      <div id="room-events"></div>
      <p id="room-events-empty" class="meta" hidden>No upcoming meeting is on the calendar.</p>
      <p id="room-events-note" class="meta">Scheduling uses the meeting link on the calendar event. Add to a meeting joins a live call.</p>
      <label id="join-trigger-label">Trigger
        <span class="join-trigger-hint">People say this to wake the bot.</span>
        <textarea id="join-trigger" name="trigger" rows="2" placeholder="A sentence that wakes the bot">${escapeHtml(joinTrigger)}</textarea>
      </label>
    </div>
    <div id="channel-door" hidden>
      ${slackAsk}
      <p id="channel-setup"></p>
      <p>No channel is in use.<br>Slack is the channel tool. Status shows whether it is connected.</p>
      <button id="channel-connectors" type="button">Open Setup</button>
    </div>
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
${inviteDialog}
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
<div id="tool-manage-dialog" class="dialog mcp-manage-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="tool-manage-title">
  <div class="shade" data-close="tool-manage-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="tool-manage-title">Tool</h2>
      <button type="button" class="close" data-close="tool-manage-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <div id="tool-manage-body" class="panel-body"></div>
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
<script type="module">${renderConsoleClient({
    peopleColumnsJson: JSON.stringify(PEOPLE_COLUMNS),
    spacesJson: jsonForScript(state.spaces || null),
    accountProfileJson: jsonForScript(state.accountProfile || null),
    toolAskJson: jsonForScript(state.toolAsk || null),
    speakerLabelSource: speakerLabel.toString(),
    slackWorkspaceJson: JSON.stringify(slackWorkspace),
    linearWorkspaceJson: JSON.stringify(linearWorkspace),
    calendarConnectPathJson: JSON.stringify(CALENDAR_CONNECT_PATH),
    linearInstallJson: JSON.stringify(linearInstall),
    linearInstallPathJson: JSON.stringify(LINEAR_INSTALL_PATH),
    slackInstallJson: JSON.stringify(slackInstall),
    slackInstallPathJson: JSON.stringify(SLACK_INSTALL_PATH),
    askDaily,
    priorAsksSource: priorAsksForThread.toString().replaceAll("\n", "\n  "),
    formatLastTestedSource: formatLastTested.toString(),
  })}</script>
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
  const item = (id, done, title, action, keepAction = false) => `<li class="check-item${done ? " done" : ""}" id="checklist-${id}">
        <span class="check-dot" aria-hidden="true">${tick}</span>
        <span class="check-title">${title}</span>
        <span class="sr check-state">${done ? "Done" : "To do"}</span>
        ${done && !keepAction ? "" : action}
      </li>`;
  const rows = [
    item("calendar", list.calendar, list.calendar ? "Calendar connected" : "Connect your calendar", `<a class="check-go" href="/console/setup#tools-card">Connect</a>`),
    item("chat", list.chat, list.chat ? "Slack connected" : "Choose where Sederunt posts", `<a class="check-go" href="/console/setup#tools-card">Set up</a>`),
    list.canInvite ? item("team", list.team, list.team ? "Team invited" : "Invite your team", `<button type="button" class="check-go" id="checklist-invite" data-invite>Invite</button>`, true) : "",
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

function renderInviteDialog(closeIcon, workspaceName) {
  const name = escapeHtml(workspaceName || "this workspace");
  return `<div id="invite-dialog" class="dialog" hidden role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
  <div class="shade" data-close="invite-dialog"></div>
  <div class="panel">
    <div class="panel-bar">
      <h2 id="invite-dialog-title">Invite people</h2>
      <button type="button" class="close" data-close="invite-dialog" aria-label="Close">${closeIcon}</button>
    </div>
    <form class="panel-body" id="invite-dialog-form">
      <p id="invite-dialog-sub">Add people to ${name}.</p>
      <div class="invite-add" id="invite-compose">
        <label class="sr" for="invite-email">Email address</label>
        <input id="invite-email" type="text" inputmode="email" placeholder="name@company.com" autocomplete="off" spellcheck="false">
        <label class="sr" for="invite-role">Role</label>
        <select id="invite-role"><option value="member">Member</option><option value="admin">Admin</option></select>
        <button type="button" id="invite-add">Add</button>
      </div>
      <p class="card-help" id="invite-hint">Paste several addresses at once, separated by commas or spaces.</p>
      <p class="invite-error" id="invite-dialog-error" role="alert" hidden></p>
      <ul class="invite-list" id="invite-dialog-list" hidden></ul>
      <div class="invite-share" id="invite-dialog-share" hidden>
        <label class="sr" for="invite-dialog-link">Invite link</label>
        <input id="invite-dialog-link" readonly value="">
        <button type="button" class="secondary" id="invite-dialog-copy">Copy link</button>
      </div>
      <label class="invite-domain" id="invite-dialog-domain" hidden>
        <input type="checkbox" id="invite-domain-join">
        <span id="invite-domain-copy"></span>
      </label>
      <div id="invite-dialog-sent" hidden></div>
      <div class="wait-actions">
        <button type="button" class="secondary" data-close="invite-dialog" id="invite-dialog-cancel">Cancel</button>
        <button class="primary" type="submit" id="invite-dialog-send">Done</button>
      </div>
    </form>
  </div>
</div>`;
}
