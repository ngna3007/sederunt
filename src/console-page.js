import { brandLogo, brandSprite } from "./brand-logos.js";

export { rankDecisions } from "./room-match.js";

/** Header cells, one per row cell, including the empty action column. */
export const ROOM_COLUMNS = ["Room", "Platform", "Speakers", "Status", "Started", ""];
export const PEOPLE_COLUMNS = ["Name", "Rooms", "Decisions", "Last heard", ""];
export const DECISION_COLUMNS = ["Decision", "Room", "Status", ""];

/**
 * The operator workspace. Onboard, home, rooms, history, chat, and record
 * read the process. The page has no key field.
 * The chip switches Company and Personal. Personal has no room.
 * The served console uses the Recall shell: one workspace switcher
 * sits at the top of the sidebar, and the breadcrumb sits over the content column.
 * The account block sits at the bottom of the rail. Its name is the session
 * label, or the process member when sign-in is not configured.
 * The room file pins the decision. Each setting is a row, label then control.
 *
 * @param {{ meeting?: boolean, meetingSetup?: string, slackReady?: boolean, signedIn?: boolean, accountName?: string, accountMember?: string, accountLine?: string }} [state]
 */
export function renderConsolePage(state = {}) {
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
  const recordIcon = glyph('<path d="M4 2.8h5.2L12 5.6V13H4z"/><path d="M9.1 2.9V5.7H12"/><path d="M6 8.2h4M6 10.4h2.6"/>');
  const peopleIcon = glyph('<circle cx="6" cy="5.6" r="1.7"/><path d="M3.1 12c.5-1.7 1.7-2.5 2.9-2.5s2.4.8 2.9 2.5"/><circle cx="11.2" cy="6.1" r="1.25"/><path d="M10.2 12c.3-1 .9-1.6 1.6-1.6"/>');
  const plusIcon = glyph('<path d="M8 3.2v9.6M3.2 8h9.6"/>');
  const switchIcon = glyph('<path d="M5 6.1 8 3.5 11 6.1"/><path d="M5 9.9 8 12.5 11 9.9"/>');
  const userIcon = glyph('<circle cx="8" cy="5.4" r="2.1"/><path d="M3.3 13.1c.55-2.1 2.35-3.2 4.7-3.2s4.15 1.1 4.7 3.2"/>');
  const panelIcon = glyph('<rect x="2.6" y="3" width="10.8" height="10" rx="1.4"/><path d="M6.4 3v10"/>');
  const plugIcon = glyph('<path d="M6 2.6v3M10 2.6v3M4.2 5.6h7.6v2.4a3.8 3.8 0 0 1-7.6 0V5.6Z"/><path d="M8 11.8V14"/>');
  const calendarIcon = brandLogo("google-calendar");
  const linearIcon = brandLogo("linear-icon");
  const channelIcon = brandLogo("slack-icon");
  const searchIcon = glyph('<circle cx="7" cy="7" r="3.2"/><path d="M9.4 9.4 12.5 12.5"/>');
  const editIcon = glyph('<path d="M9.6 2.7 13.3 6.4 6.4 13.3H2.7V9.6z"/>');
  const outIcon = glyph('<path d="M6.2 2.8H3.4v10.4h2.8"/><path d="M6.6 8h6.2"/><path d="M10.6 5.4 13.2 8l-2.6 2.6"/>');
  const accountMenu = signedIn
    ? `<button type="button" role="menuitem" id="edit-profile">${editIcon}Edit profile</button><div class="menu-rule" role="separator"></div><form id="sign-out-form" method="post" action="/console/sign-out"><button id="sign-out" type="submit" role="menuitem">${outIcon}Sign out</button></form>`
    : `<p class="account-note" role="note">Sign-in is not set up.</p>`;
  const signInOff = state.signInOff === true;
  const signInBanner = signInOff
    ? `<div class="sign-in-off" role="status"><p>Sign-in is off. Anyone with this link can act as you. <a href="/console/status#console-secret" id="set-console-secret">Set a console secret</a></p></div>`
    : "";
  const secretCard = signInOff
    ? `<div class="settings-card" id="console-secret"><p class="section-label">Console sign-in</p><p class="card-help">Sign-in is off. Anyone with this link can act as you. Set SEDERUNT_CONSOLE_SECRET outside this page, then restart. This page never shows the secret.</p></div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
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
      <p class="brand"><span class="tile-mark brand-mark" aria-hidden="true">S</span>Sederunt</p>
      <button id="rail-close" class="close rail-close" type="button" aria-label="Close the menu">${closeIcon}</button>
      <div id="chip-wrap" class="chip-wrap">
        <button id="workspace-chip" class="chip" type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="workspace-menu">
          <span id="chip-mark" class="tile-mark co" aria-hidden="true">C</span>
          <span class="ws-copy"><span id="chip-name">Company</span><span id="chip-hint"></span></span>
          ${switchIcon}
        </button>
        <div id="workspace-menu" class="menu" role="menu" hidden>
          <button type="button" role="menuitemradio" data-workspace="company" aria-checked="true"><span class="tile-mark co" aria-hidden="true">C</span><span class="ws-copy"><span>Company</span><span class="menu-hint"></span></span></button>
          <button type="button" role="menuitemradio" data-workspace="personal" aria-checked="false"><span class="tile-mark pe" aria-hidden="true">P</span><span class="ws-copy"><span>Personal</span><span class="menu-hint">A separate workspace</span></span></button>
          <div class="menu-rule" role="separator"></div>
          <button id="create-workspace" type="button" role="menuitem"><span class="ws-copy"><span>About Company</span><span class="menu-hint">What Company is</span></span></button>
        </div>
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
      <a href="/console/chat" data-show="chat" data-label="Chat">${chatIcon}Chat</a>
      <p class="rail-label">Setup</p>
      <a href="/console/status" id="show-connectors" data-label="Status">${plugIcon}Status</a>
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
    <p id="status-title" class="page-title" hidden>Status</p>
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
        <button id="open-connectors" type="button" hidden>Go to Status</button>
        <button id="continue" type="button" hidden>Go to Home</button>
        <div id="onboard-doors"></div>
      </div>
    </section>
    <div id="home" hidden>
      <div class="main">
    <div id="read-error" class="state-error empty-state" hidden>
      <p id="read-error-copy" class="empty-title">Couldn't load your workspace. Try again.</p>
      <button id="read-again" type="button">Retry</button>
    </div>
    <div class="page-head" id="home-head">
    <div>
    <p id="home-title" class="page-title">Home</p>
    <p class="page-lede">Decisions this workspace kept, and the actions that followed.</p>
    </div>
    <div class="page-actions"></div>
    </div>
    <div class="home-tools">
    <div id="home-empty" class="home-empty" hidden>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span>
      <p id="home-empty-line">No room yet.</p>
      <p id="home-empty-aside" class="empty-aside">A meeting or a channel that keeps a decision adds the room.</p>
    </div>
    <div id="home-stats">
      <div id="counts" class="counts"></div>
    </div>
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
      <div class="page-head"><div><p class="page-title">Status</p><p class="page-lede">Which tools Sederunt can use, and how the meeting guest listens.</p></div><div class="page-actions"></div></div>
      ${secretCard}
      <p id="connector-split"></p>
      <div class="settings-card" id="meeting-card"${state.meeting ? " hidden" : ""}>
        <p class="section-label">Meeting</p>
        <p id="meeting-card-copy" class="card-help">${state.meeting ? "A meeting is in use." : "No meeting is in use."}</p>
      </div>
      <div class="settings-card" id="tools-card">
      <p class="section-label">Tools</p>
      <p class="card-help">A tool that is not connected cannot be used from this page.</p>
      <div class="connectors">
        <div class="explorer-head status-head">
          <span data-col="mark"></span>
          <span data-col="tool">Tool</span>
          <span data-col="action"></span>
        </div>
        <div class="conn" id="cal-status-row">
          ${calendarIcon}
          <div class="set-copy">
            <strong>Calendar</strong>
            <p id="cal-conn" class="conn-state off">Not connected</p>
            <p id="cal-line" class="sr">Calendar runs automatically.</p>
          </div>
          <button type="button" class="conn-connect" id="cal-connect" data-connect="calendar">Connect</button>
        </div>
        <div class="conn" id="lin-status-row">
          ${linearIcon}
          <div class="set-copy">
            <strong>Linear</strong>
            <p id="lin-conn" class="conn-state off">Not connected</p>
            <p id="lin-line" class="sr">Linear runs automatically.</p>
          </div>
          <button type="button" class="conn-connect" id="lin-connect" data-connect="linear">Connect</button>
        </div>
        <div class="conn" id="slack-status-row">
          ${channelIcon}
          <div class="set-copy">
            <strong>Slack</strong>
            <p id="slack-conn" class="conn-state off">Not connected</p>
            <p id="slack-note" class="sr">Sederunt answers in a channel it has already joined.</p>
          </div>
          <button type="button" class="conn-connect" id="slack-connect" data-connect="slack">Connect</button>
        </div>
      </div>
      </div>
      <div class="settings-card" id="ask-block">
        <p class="section-label">Before sending a change</p>
        <p id="ask-help" class="card-help">On means a change runs as soon as it is asked.</p>
        <div class="conn ask-quiet" id="cal-ask-row">
          <div class="set-copy"><span class="ask-name">Run automatically</span><span class="ask-tool"> for Calendar</span></div>
          <div class="conn-ask"><label class="switch"><input id="cal-ask" type="checkbox" checked aria-label="Run automatically for Calendar" aria-describedby="ask-help"></label></div>
        </div>
        <div class="conn ask-quiet" id="lin-ask-row">
          <div class="set-copy"><span class="ask-name">Run automatically</span><span class="ask-tool"> for Linear</span></div>
          <div class="conn-ask"><label class="switch"><input id="lin-ask" type="checkbox" checked aria-label="Run automatically for Linear" aria-describedby="ask-help"></label></div>
        </div>
      </div>
      <div class="settings-card" id="hearing-block">
        <p class="section-label">Meeting guest</p>
        <p id="hearing-help">The guest uses this name in the meeting. A line is kept when someone says the name, or one of the trigger words or sentences.</p>
        <div class="hearing-grid">
        <div class="hearing-field">
          <label for="hearing-name">Name</label>
          <p>Shown on the guest's camera.</p>
          <input id="hearing-name" name="hearing-name" maxlength="40" value="" placeholder="Maple" autocomplete="off">
        </div>
        <div class="hearing-field">
          <label for="hearing-triggers">Triggers</label>
          <p>One word or sentence on each line.</p>
          <textarea id="hearing-triggers" name="hearing-triggers" rows="4" placeholder="keep this"></textarea>
        </div>
        </div>
        <p class="section-next"><button id="hearing-save" class="primary" type="button">Save the guest</button></p>
        <p id="hearing-note"></p>
      </div>
      <p id="connector-who"></p>
      <p id="custom-how" class="sr">A tool other than Calendar, Linear, or Slack cannot be connected from this page.</p>
      <p id="prefs" class="sr">Calendar is on Ask. Linear is on Ask.</p>
    </div>
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
      <div class="explorer">
        <div class="explorer-head">
          ${ROOM_COLUMNS.map((label, index) => `<span data-col="${["room", "platform", "speakers", "status", "started", "action"][index]}">${escapeHtml(label)}</span>`).join("")}
        </div>
        <div id="room-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span><p class="empty-title" id="room-empty-line">No room yet.</p><p id="room-empty-aside">Bring Sederunt into a meeting or a channel.</p><button type="button" id="clear-filters" hidden>Clear filters</button></div>
        <div id="room-list"></div>
        <div id="room-foot" class="explorer-foot" hidden><span id="room-count"></span><span class="pager"><button id="room-prev" type="button" aria-label="Previous page">‹</button><button id="room-next" type="button" aria-label="Next page">›</button></span></div>
      </div>
      <div id="personal-notes" hidden>
        <p id="personal-empty">A private note is not a room.</p>
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
      <div class="page-head"><div><p class="page-title">Chat</p><p class="page-lede">Ask what this workspace already kept. Chat does not keep a decision.</p></div></div>
      <div class="talk-panel ai-chat">
        <div class="thread" id="chat-log">
          <div id="chat-empty" class="chat-hello">
            <p class="empty-title">Nothing has been asked yet.</p>
            <div class="suggests" id="chat-suggests"></div>
          </div>
          <p id="chat-purpose"></p>
        </div>
        <p id="chat-next-row" class="section-next"><button id="chat-next" class="primary" type="button" hidden>New room</button></p>
        <form id="chat-form" class="composer">
          <label><span class="sr">Ask the workspace</span><textarea id="chat-text" name="chat" rows="1" placeholder="Ask about a room's decision"></textarea></label>
          <button class="primary" type="submit" aria-label="Ask">Ask</button>
        </form>
        <p class="composer-hint">Enter sends. Shift+Enter adds a line.</p>
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
      <div class="page-head"><div><p class="page-title">Account</p><p class="page-lede">Who is signed in, and how long this sign-in lasts.</p></div></div>
      <div class="account-layout">
        <div class="overview-card account-hero" id="account-card">
          <span id="account-page-avatar" class="account-avatar lg" aria-hidden="true">${escapeHtml(accountInitials(accountName))}</span>
          <div>
            <p id="account-page-name" class="empty-title"></p>
            <p id="account-page-role" class="meta"></p>
          </div>
        </div>
        <div class="settings-card">
          <p class="section-label">Details</p>
          <dl class="kv account-kv">
            <dt class="account-name-row">Name</dt><dd id="account-detail-name" class="account-name-row"></dd>
            <dt>Workspace</dt><dd id="account-detail-workspace">Company</dd>
            <dt id="account-session-label">${state.accountExpiry ? "Expires" : "Session"}</dt><dd id="account-detail-expiry"${state.accountExpiry ? ` data-at="${escapeHtml(new Date(state.accountExpiry).toISOString())}" data-kind="expiry"` : ""}>${escapeHtml(signedIn ? "This sign-in does not list an expiry." : "Sign-in is not set up.")}</dd>
          </dl>
        </div>
        <div class="settings-card">
          <p class="section-label">Sessions</p>
          <p class="card-help">This browser keeps one sign-in for the workspace.</p>
          <div class="wait-actions">
            ${signedIn ? `<button type="button" class="primary" id="account-edit">Edit profile</button><button type="button" class="danger" id="account-signout">Sign out</button>` : `<p class="meta">Sign-in is not set up.</p>`}
          </div>
        </div>
      </div>
    </section>
    <section id="page-missing" class="empty-state" hidden>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13 13"/></svg></span>
      <p class="empty-title">Page not found</p>
      <p>That page is not in this workspace.</p>
      <a class="secondary" href="/console"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>Back to Home</a>
    </section>
    <section id="people" hidden>
      <div class="page-head"><div><p class="page-title">People</p><p class="page-lede">Names heard in a room.</p></div></div>
      <div class="toolbar page-toolbar" id="people-toolbar">
        <label class="search">${searchIcon}<span class="sr">Search people</span><input id="people-search" type="search" placeholder="Search" autocomplete="off"></label>
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
          <p id="file-title" class="page-title"></p>
          <div class="meta-strip" id="file-meta">
            <button type="button" id="file-id-chip" class="id-chip"><span id="file-id" class="mono"></span></button>
            <span class="meta-item header-only" hidden><span class="meta-label">Status</span><span id="file-status-badge" class="badge"></span></span>
            <span class="meta-item header-only" hidden><span class="meta-label">Platform</span><span id="file-platform-pill"></span></span>
            <span class="meta-item"><span class="meta-label">Started</span><span id="file-started" class="meta"></span></span>
            <span class="meta-item header-only" id="file-usage-item" hidden><span class="meta-label">Usage</span><span id="file-usage" class="usage-chip"></span></span>
            <p id="file-lead" class="page-lede" hidden></p>
            <p id="file-lead-status" class="meta"></p>
            <p id="file-proof" class="meta" hidden></p>
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
            <div id="left-transcript" class="tab-pane left-scroll">
              <div id="file-transcript"></div>
              <h2 class="pane-label">Speakers</h2>
              <div id="file-heard" class="faces"></div>
              <p id="file-present">The meeting has not sent who is there.</p>
            </div>
            <label class="search dock-search">${searchIcon}<span class="sr">Search the transcript</span><input id="transcript-search" type="search" placeholder="Search transcript" autocomplete="off"></label>
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
              <section class="artifacts" id="artifacts">
                <h2 class="artifact-title">Meeting artifacts</h2>
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
                  <div class="set-copy"><strong>Voice</strong></div>
                  <div class="choices voices" role="group" aria-label="How this room reads">
                    <button type="button" data-voice="short">Short</button>
                    <button type="button" data-voice="plain" aria-pressed="true">Plain</button>
                    <button type="button" data-voice="formal">Formal</button>
                  </div>
                </div>
                <div class="room-set">
                  <div class="set-copy">
                    <strong>Raise a clash</strong>
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
      <button id="meet-connectors" class="primary" type="button"${state.meeting ? " hidden" : ""}>Open Status</button>
      <p id="join-hint" class="sr">Sederunt joins that meeting when Meet is ready. If Meet is not ready, the status line says so.</p>
    </form>
    <div id="channel-door" hidden>
      <p id="channel-setup"></p>
      <p>No channel is in use.<br>Slack is the channel tool. Status shows whether it is connected.</p>
      <button id="channel-connectors" type="button">Open Status</button>
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
    <p id="decision-proof"></p>
    <p id="decision-epoch" hidden></p>
    <div id="decision-other"></div>
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
import { formatActivitySentence, groupActivity, relativeTime, selectActivity, undoPrompt, zoneShortName } from "/console/activity.js";
import { rankDecisions } from "/console/room-match.js";
var sessionWhen = document.getElementById("account-detail-expiry");
if (sessionWhen && sessionWhen.dataset.at) {
  var sessionDate = new Date(sessionWhen.dataset.at);
  if (!isNaN(sessionDate.getTime())) {
    var sessionHours = sessionDate.getHours();
    var sessionMins = String(sessionDate.getMinutes());
    if (sessionMins.length < 2) sessionMins = "0" + sessionMins;
    var sessionClock = (sessionHours % 12 || 12) + ":" + sessionMins + (sessionHours >= 12 ? " PM" : " AM");
    var sessionNow = new Date();
    var sessionStart = new Date(sessionNow.getFullYear(), sessionNow.getMonth(), sessionNow.getDate()).getTime();
    var sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate()).getTime();
    var sessionText = sessionDay === sessionStart
      ? "Today at " + sessionClock
      : sessionDay === sessionStart - 86400000
        ? "Yesterday at " + sessionClock
        : sessionDay === sessionStart + 86400000
          ? "Tomorrow at " + sessionClock
          : sessionDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " at " + sessionClock;
    sessionWhen.textContent = sessionText;
  }
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
  var workspaceKind = "company";
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
    if (decision && typeof decision.checkpoint === "number") {
      return "Kept at checkpoint " + decision.checkpoint + ".";
    }
    return "No checkpoint was returned.";
  }

  function historyBody(decision) {
    var who = personLabel(decision.speaker) || "Someone";
    var when = whenLabel(decision.spokenAt);
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
    var failed = state && state.read === "failed";
    node.textContent = failed ? "Unknown" : (connected ? "Connected" : "Not connected");
    node.className = failed || !connected ? "conn-state off" : "conn-state";
    var connectId = id === "cal-conn" ? "cal-connect" : id === "lin-conn" ? "lin-connect" : id === "slack-conn" ? "slack-connect" : "";
    var connect = connectId ? document.getElementById(connectId) : null;
    if (connect) connect.hidden = failed || !!connected;
    var askId = id === "cal-conn" ? "cal-ask-row" : id === "lin-conn" ? "lin-ask-row" : "";
    var askRow = askId ? document.getElementById(askId) : null;
    if (askRow) askRow.classList.toggle("ask-quiet", !connected);
  }

  function roomTotal() {
    var rooms = (state && state.rooms) || [];
    var pending = (state && state.waiting) || [];
    return rooms.length + pending.length;
  }

  function syncHomeChrome() {
    var personal = workspaceKind === "personal";
    var pending = !state || state.reading === true;
    var emptyHome = !personal && !pending && roomTotal() === 0 && sectionName === "home";
    var homeEmpty = document.getElementById("home-empty");
    var blockedHome = !!(document.getElementById("meet-block") && document.getElementById("slack-block"));
    if (homeEmpty) homeEmpty.hidden = !emptyHome;
    var stats = document.getElementById("home-stats");
    if (stats) stats.hidden = sectionName !== "home" || (state && state.read === "failed");
    var note = document.getElementById("read-note");
    if (note) note.hidden = sectionName !== "home" || emptyHome;
    var explorer = document.querySelector(".explorer");
    if (explorer && !personal) explorer.hidden = pending || (sectionName === "home" && emptyHome);
    var line = document.getElementById("home-empty-line");
    var aside = document.getElementById("home-empty-aside");
    if (line) line.textContent = blockedHome ? "No meeting or channel is in use." : "No room yet.";
    if (aside) aside.textContent = blockedHome ? "Bring Sederunt into a meeting or a channel." : "A meeting or a channel that keeps a decision adds the room.";
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
    node.textContent = ready ? "Joining is available." : "Join turns on once Status lists a meeting.";
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
      var when = whenLabel(decision.spokenAt);
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
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
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
    var heard = hearing || { name: "Maple", triggers: [] };
    var name = document.getElementById("hearing-name");
    var triggers = document.getElementById("hearing-triggers");
    if (name && document.activeElement !== name) name.value = heard.name && heard.name !== "Maple" ? heard.name : "";
    if (triggers && document.activeElement !== triggers) triggers.value = (heard.triggers || []).join("\\n");
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
    var where = document.createElement("span");
    where.className = "where ex-plat";
    where.dataset.col = "platform";
    if (spec.where) where.append(platformBadge(spec.where));
    var heard = document.createElement("span");
    heard.className = "avatar-stack";
    heard.dataset.col = "speakers";
    var people = spec.people || [];
    heard.title = people.map(function (person) { return personLabel(person) || person; }).join(", ");
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

  function paintRooms() {
    clear("room-list");
    var personal = workspaceKind === "personal";
    syncNewRoom();
    var explorer = document.querySelector(".explorer");
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
        kept: rows.length > 0
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
    var pageSize = onHome ? 5 : roomPageSize;
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
    allRooms.hidden = !(onHome && shown > 5);
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
          : "No room yet.";
    }
    var aside = document.getElementById("room-empty-aside");
    if (aside) aside.textContent = failed
      ? "Home could not be loaded. Try again."
      : filteredOut
        ? "Clear the filters to see every room."
        : "Bring Sederunt into a meeting or a channel.";
    var clearFilters = document.getElementById("clear-filters");
    if (clearFilters) clearFilters.hidden = !filteredOut;
    var explorer = document.querySelector(".explorer");
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
    var title = roomName(room) || (room && room.id) || "Room";
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
    var bag = zoneParts(iso);
    var today = zoneParts(new Date().toISOString());
    if (!bag || !today) return "";
    var clock = bag.hour + ":" + bag.minute + " " + bag.dayPeriod;
    var key = bag.year + "-" + bag.month + "-" + bag.day;
    var nowKey = today.year + "-" + today.month + "-" + today.day;
    if (key === nowKey) return "Today at " + clock;
    return whenLabel(iso);
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
    if (decisionRoom.platform) roomCell.append(platformBadge(decisionRoom.platform));
    var roomText = document.createElement("span");
    roomText.className = "room-name";
    roomText.textContent = roomName(decisionRoom) || decisionRoom.id || "Room";
    roomText.title = roomText.textContent;
    roomCell.append(roomText);
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
    addCount(box, "Decisions kept", counts.kept || 0, "Sentences kept in this workspace.", null, false);
    addCount(box, "Actions today", counts.actionsToday || 0, "Changes that ran today.", null, false);
    if (counts.failed) addCount(box, "Failed actions", counts.failed, "A change did not go through.", null, "danger");
    if (counts.sent) addCount(box, "Sent", counts.sent, "The tool accepted the change.", null, false);
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
      else if (document.getElementById("meet-block") && document.getElementById("slack-block")) historyWords = "No shared history yet. See Status for whether a room is in use.";
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
        historyNext.textContent = "See Status";
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

  function paintSuggestions() {
    var box = document.getElementById("chat-suggests");
    if (!box) return;
    box.replaceChildren();
    var rooms = ((state && state.rooms) || []).filter(function (room) {
      return decisionsFor(room.id).length > 0;
    });
    rooms.slice(0, 3).forEach(function (room) {
      var title = roomIdentity(room, decisionsFor(room.id)).title || room.id || "";
      var shortName = String(title).split(":")[0].trim() || title;
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-suggest", "What did " + shortName + " decide?");
      button.textContent = "What did " + shortName + " decide?";
      box.append(button);
    });
  }

  function paint(next) {
    state = next;
    text("status", "");
    if (next.workspace === "personal" || next.workspace === "company") workspaceKind = next.workspace;
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
    if (errorBox && next.read === "failed") errorBox.classList.remove("state-info");
    showRetry(next.read === "failed", "Home could not be loaded. Try again.");
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
    paintConn("cal-conn", !!doors.calendar);
    paintConn("lin-conn", !!doors.linear);
    paintConn("slack-conn", next.slack === "ready");
    var slackNote = document.getElementById("slack-note");
    if (slackNote) slackNote.textContent = next.slack === "ready"
      ? "Sederunt answers in a channel it has already joined."
      : "";
    text("cal-line", calendarMode === "Ask" ? "Calendar waits before a change." : "Calendar runs automatically.");
    text("lin-line", linearMode === "Ask" ? "Linear waits before a change." : "Linear runs automatically.");
    text("prefs", "");
    var calAsk = document.getElementById("cal-ask");
    var linAsk = document.getElementById("lin-ask");
    if (calAsk) calAsk.checked = calendarMode !== "Ask";
    if (linAsk) linAsk.checked = linearMode !== "Ask";
    syncAskState(calAsk);
    syncAskState(linAsk);
    var calRow = document.getElementById("cal-ask-row");
    var linRow = document.getElementById("lin-ask-row");
    if (calRow) calRow.hidden = false;
    if (linRow) linRow.hidden = false;
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
    paintCounts();
    paintHistory();
    clear("record-list");
    clear("people-list");
    text("record-detail", "");
    (next.decisions || []).forEach(function (decision) {
      addDecisionRow(decision);
    });
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
        peopleNext.textContent = "See Status";
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
      if (next.read === "failed" && emptyLine) emptyLine.textContent = "Home could not be loaded. Try again.";
    }
    if (recordBoard) recordBoard.hidden = noKept;
    var recordFoot = document.getElementById("record-foot");
    var recordCount = document.getElementById("record-count");
    var keptCount = (next.decisions || []).length;
    if (recordFoot) recordFoot.hidden = noKept;
    if (recordCount && keptCount) recordCount.textContent = "1\u2013" + keptCount + " of " + keptCount;
    var chatNext = document.getElementById("chat-next");
    if (chatNext) chatNext.hidden = true;
    var chatForm = document.getElementById("chat-form");
    var chatButton = document.querySelector("#chat-form button");
    var chatInput = document.getElementById("chat-text");
    var chatEmpty = document.getElementById("chat-empty");
    if (chatEmpty) chatEmpty.hidden = document.querySelector("#chat-log .chat-turn") != null;
    paintSuggestions();
    if (chatForm) chatForm.hidden = false;
    if (chatButton) chatButton.disabled = noKept;
    if (chatInput) {
      chatInput.disabled = noKept;
      chatInput.placeholder = noKept ? "" : "Ask about a room's decision";
    }
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
    else if (sectionName === "account") head = document.querySelector("#account-page .page-head");
    else if (sectionName === "connectors") head = document.querySelector("#overview .page-head");
    else if (sectionName === "file") head = document.getElementById("file-head");
    if (head && head.parentNode) head.parentNode.insertBefore(box, head.nextSibling);
  }

  function sectionLabel(name) {
    if (name === "rooms") return "Rooms";
    if (name === "history") return "History";
    if (name === "chat") return "Chat";
    if (name === "record") return "Decisions";
    if (name === "people") return "People";
    if (name === "account") return "Account";
    if (name === "connectors") return "Status";
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
    button.hidden = workspaceKind === "personal" || !onList || (state && state.read === "failed");
    button.disabled = !state || state.reading === true || (state && state.read === "failed");
    placeNewRoom();
  }

  function showRetry(on, copy) {
    var box = document.getElementById("read-error");
    var button = document.getElementById("read-again");
    var line = document.getElementById("read-error-copy");
    if (box) box.hidden = !on;
    if (button) button.hidden = !on;
    if (on && copy && line) line.textContent = copy;
    if (button && on) button.disabled = false;
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
    if (name === "file" && fileRoom) return "/console/rooms/" + encodeURIComponent(fileRoom) + query;
    if (name === "rooms") return "/console/rooms" + query;
    if (name === "history") return "/console/history";
    if (name === "record") return "/console/decisions";
    if (name === "chat") return "/console/chat";
    if (name === "people") return "/console/people";
    if (name === "account") return "/console/account";
    if (name === "connectors") return "/console/status";
    if (name === "missing") return location.pathname;
    return "/console";
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
    if (path === "/console/chat") return "chat";
    if (path === "/console/people") return "people";
    if (path === "/console/account") return "account";
    if (path === "/console/status") return "connectors";
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
    var panels = ["rooms", "history", "chat", "record", "people", "account-page", "page-missing"];
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
      var key = id === "account-page" ? "account" : id === "page-missing" ? "missing" : id;
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
    var homeTools = document.querySelector(".home-tools");
    var homeStats = document.getElementById("home-stats");
    if (homeTools) homeTools.hidden = name !== "home";
    if (homeStats) homeStats.hidden = name !== "home";
    var label = onFile ? ((document.getElementById("file-title") || {}).textContent || "Room") : sectionLabel(name);
    setViewTitle(label);
    placeNotice();
    var pageName = document.getElementById("account-page-name");
    var shownName = member() || "Account";
    if (pageName) pageName.textContent = shownName;
    var pageRole = document.getElementById("account-page-role");
    var roleLine = (document.getElementById("account-line") || {}).textContent || "";
    if (pageRole) pageRole.textContent = roleLine;
    text("account-detail-role", roleLine);
    var avatar = document.getElementById("account-page-avatar");
    if (avatar) avatar.textContent = initials(shownName);
    var workspaceLabel = document.getElementById("account-detail-workspace");
    if (workspaceLabel) workspaceLabel.textContent = workspaceKind === "personal" ? "Personal" : "Company";
    placeNewRoom();
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
  }

  function closeNav() {
    document.body.classList.remove("nav-open");
    var toggle = document.getElementById("rail-toggle");
    if (!toggle || !window.matchMedia("(max-width: 1100px)").matches) return;
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Open the menu");
  }

  function dialogOpen() {
    var ids = ["profile-dialog", "decision-dialog", "create-dialog", "workspace-dialog"];
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
    var dialog = document.getElementById(id);
    if (!dialog || dialog.hidden) return;
    if (id === "file-dialog") {
      var decision = document.getElementById("decision-dialog");
      if (decision && !decision.hidden) closeDialog("decision-dialog");
      showSection(returnSection === "rooms" ? "rooms" : "home");
      syncPage();
      if (opener && opener.focus) opener.focus();
      return;
    }
    dialog.hidden = true;
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
    var proof = lead && typeof lead.checkpoint === "number" ? proofExplain(lead) : "";
    var ticket = lead ? ticketLine(lead) : "";
    showLine("file-proof", [proof, ticket].filter(Boolean).join(" "));
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

  function proseSpan(value) {
    var trimmed = String(value || "").replace(/\s+/g, " ").trim();
    if (!trimmed) return null;
    var span = document.createElement("span");
    span.className = "activity-prose";
    span.textContent = trimmed;
    return span;
  }

  function paintRich(parent, text, row) {
    var title = (row.target && row.target.title) || "";
    var id = (row.target && row.target.id) || "";
    var marks = [];
    if (title && text.indexOf(title) >= 0) marks.push({ at: text.indexOf(title), len: title.length, kind: "title" });
    if (id && text.indexOf(id) >= 0) marks.push({ at: text.indexOf(id), len: id.length, kind: "id" });
    marks.sort(function (a, b) { return a.at - b.at; });
    var cursor = 0;
    marks.forEach(function (mark) {
      if (mark.at < cursor) return;
      if (mark.at > cursor) {
        var lead = proseSpan(text.slice(cursor, mark.at));
        if (lead) parent.append(lead);
      }
      if (mark.kind === "title") {
        var named = proseSpan(title);
        if (named) parent.append(named);
      } else if (row.target && row.target.url) {
        var link = document.createElement("a");
        link.className = "entity-id";
        link.href = row.target.url;
        link.textContent = id;
        parent.append(link);
      } else if (id) {
        var plain = document.createElement("span");
        plain.className = "entity-id";
        plain.textContent = id;
        parent.append(plain);
      }
      cursor = mark.at + mark.len;
    });
    if (cursor < text.length) {
      var tail = proseSpan(text.slice(cursor));
      if (tail) parent.append(tail);
    }
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
      [["mark", ""], ["event", "Event"], ["when", "When"], ["room", "Room"], ["action", ""]].forEach(function (pair) {
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
        line.className = "activity-row" + (row.kind === "failure" ? " is-failure" : "") + (row.kind === "request" ? "" : " activity-child") + (row.superseded || row.outcome === "undone" || row.resolved ? " muted" : "");
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
        paintRich(copy, rest.trim(), row);
        var outcomeKind = group.rows.some(function (item) { return item.kind === "result"; }) ? "result" : "action";
        if (row.verb === "label" && row.kind === outcomeKind && row.changes && row.changes[0] && row.changes[0].to) {
          var labelWord = String(row.changes[0].to);
          var source = rest.trim();
          var labelAt = source.indexOf(labelWord);
          if (labelAt >= 0) {
            var before = source.slice(0, labelAt).trim();
            var after = source.slice(labelAt + labelWord.length).trim();
            copy.replaceChildren(who);
            paintRich(copy, before, row);
            var pill = document.createElement("span");
            pill.className = "label-pill";
            pill.textContent = labelWord;
            copy.append(pill);
            if (after) paintRich(copy, after, row);
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
          copy.append(document.createTextNode(" "));
          copy.append(seek);
        }
        text.append(copy);
        var meta = document.createElement("div");
        meta.className = "activity-meta";
        var time = document.createElement("time");
        if (row.ts) {
          time.dateTime = row.ts;
          time.title = new Date(row.ts).toLocaleString();
          time.textContent = relativeWhen(row.ts) || relativeTime(row.ts);
        }
        meta.append(time);
        var origin = row.origin || {};
        var suffix = document.createElement("span");
        suffix.className = "room-suffix";
        suffix.textContent = opts.showRoom ? (origin.roomName || "") : "";
        meta.append(suffix);
        if (row.target && row.target.url && row.target.system === "slack" && (row.kind === "action" || row.kind === "result")) {
          var open = document.createElement("a");
          open.className = "entity-id";
          open.href = row.target.url;
          open.rel = "noreferrer";
          open.textContent = "Open";
          text.append(document.createTextNode(" "));
          text.append(open);
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
          action.append(done);
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
    box.append(feed);
  }

  function renderWaiting() {
    var box = document.getElementById("file-waiting");
    var waitingRow = document.getElementById("waiting-row");
    if (waitingRow) waitingRow.hidden = false;
    paintActivity(box, [], { groups: selectActivity((state && state.activity) || [], { roomId: fileRoom }), viewRoom: fileRoom });
  }

  function openDecision(decision) {
    text("decision-state", humanStatus(decision.status || "recorded"));
    text("decision-sentence", decision.text || "");
    var heardWho = personLabel(decision.speaker);
    var heardWhen = whenLabel(decision.spokenAt);
    text("decision-heard", heardWho && heardWhen ? heardWho + " kept this on " + heardWhen + "." : heardWho ? heardWho + " kept this." : heardWhen ? "Kept on " + heardWhen + "." : "No one is recorded yet.");
    showLine("decision-file", fileLine(decision));
    showLine("decision-ticket", ticketLine(decision));
    showLine("decision-proof", proofExplain(decision));
    showLine("decision-epoch", epochLine(decision));
    clear("decision-other");
    if (decision.status === "clashing") {
      decisionsFor(decision.roomId).forEach(function (other) {
        if (other.id === decision.id || other.status !== "clashing") return;
        var line = document.createElement("p");
        line.textContent = other.text;
        document.getElementById("decision-other").append(line);
      });
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
    text("file-started", startedAt ? (relativeWhen(startedAt) || whenLabel(startedAt) || blankMark()) : blankMark());
    document.querySelectorAll("#file-meta .header-only").forEach(function (node) {
      if (node.id === "file-usage-item") return;
      node.hidden = !knownRoom;
    });
    text("file-summary", "");
    var outcome = document.getElementById("file-outcome");
    if (outcome) {
      outcome.hidden = true;
      outcome.textContent = "";
    }
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
      name.className = "utter-name " + toneClass(who);
      name.textContent = who;
      var time = document.createElement("time");
      time.textContent = past ? "" : clockText(start);
      head.append(name, time);
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
      empty.textContent = (rows && rows.length) ? "No matching lines." : "No transcript yet.";
      box.append(empty);
    }
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
    var search = document.querySelector(".dock-search");
    if (search) search.hidden = leftTab !== "transcript";
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
    var copy = "No recording was made";
    if (media && media.state === "processing") copy = "Recording is still processing.";
    else if (media && media.state === "expired") copy = "Recording expired";
    else if (media && media.state === "channel") copy = "Slack channels aren't recorded";
    else if (media && (media.state === "ready" || media.state === "novideo")) copy = "";
    if (note) note.textContent = copy;
    if (video && media && media.videoUrl && media.state === "ready") {
      if (video.getAttribute("src") !== media.videoUrl) video.src = media.videoUrl;
      video.hidden = false;
      if (fallback) fallback.hidden = true;
    } else if (video) {
      video.removeAttribute("src");
      video.hidden = true;
      if (fallback) fallback.hidden = false;
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
    ];
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
      } else {
        view.setAttribute("aria-disabled", "true");
        save.setAttribute("aria-disabled", "true");
        item.title = "No " + row[0].toLowerCase() + " for this room.";
      }
      actions.append(view, save);
      item.append(label, actions);
      list.append(item);
    });
  }

  function pct(seconds, duration) {
    if (!duration) return "0%";
    return Math.max(0, Math.min(100, seconds / duration * 100)) + "%";
  }

  function paintTimeline() {
    var timeline = document.getElementById("timeline");
    var useful = roomMediaState && (roomMediaState.state === "ready" || roomMediaState.state === "novideo" || (roomMediaState.segments || []).length);
    if (timeline) timeline.hidden = !useful;
    if (!useful) return;
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
    ((roomMediaState && roomMediaState.segments) || []).forEach(function (segment) {
      var block = document.createElement("span");
      block.className = "tl-seg " + toneClass(segment.speaker || "");
      block.style.left = pct(segment.start, duration);
      block.style.width = Math.max(0.6, ((segment.end - segment.start) / duration) * 100) + "%";
      block.title = segment.speaker || "";
      if (speakers) speakers.append(block);
    });
    ((roomMediaState && roomMediaState.events) || []).forEach(function (event) {
      var dot = document.createElement("span");
      dot.className = "tl-dot";
      dot.style.left = pct(event.at, duration);
      dot.title = (event.kind || "event") + " " + (event.name || "");
      if (events) events.append(dot);
    });
    if (fileRoom && roomMediaState && roomMediaState.startedAt) {
      var origin = Date.parse(roomMediaState.startedAt);
      decisionsFor(fileRoom).forEach(function (decision) {
        var at = Date.parse(decision.spokenAt || "");
        if (isNaN(origin) || isNaN(at)) return;
        var offset = (at - origin) / 1000;
        if (duration && offset > duration) return;
        var mark = document.createElement("span");
        mark.className = "tl-mark";
        mark.style.left = pct((at - origin) / 1000, duration);
        mark.title = decision.text || "";
        if (events) events.append(mark);
      });
    }
    placePlayhead(0, duration);
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
      paintTimeline();
      if (media.startedAt) {
        var roomLive = roomOf(fileRoom);
        if (roomLive) {
          roomLive.startedAt = media.startedAt;
          roomLive.recordingStart = media.startedAt;
        }
        var stamp = relativeWhen(media.startedAt) || whenLabel(media.startedAt) || blankMark();
        text("file-started", stamp);
        renderFacts(roomLive || room || {}, { when: media.startedAt }, fileRoom ? decisionsFor(fileRoom) : []);
      }
      renderTranscript(fileRoom ? decisionsFor(fileRoom) : []);
    }).catch(function () {
      roomMediaState = { state: "none" };
      paintPlayer(roomMediaState);
      paintArtifacts(roomMediaState);
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
    var box = document.getElementById(tool === "calendar" ? "cal-ask" : "lin-ask");
    var line = tool === "calendar" ? "cal-line" : "lin-line";
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
    button.textContent = "See Status";
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
    offerEmptyStatus(document.getElementById("chat-next"), "chat-empty");
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
    return "?workspace=" + encodeURIComponent(workspaceKind);
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
      var slowBox = document.getElementById("read-error");
      var loading = document.getElementById("loading");
      var homeBox = document.getElementById("home");
      var onboardBox = document.getElementById("onboard");
      if (slowBox) {
        slowBox.classList.add("state-info", "still-loading");
        if (homeBox && homeBox.hidden && onboardBox) onboardBox.append(slowBox);
        else if (loading) loading.insertBefore(slowBox, loading.firstChild);
      }
      showRetry(true, "Still loading…");
      var quiet = document.querySelector("#loading .sr");
      if (quiet) quiet.textContent = "Still loading…";
      var again = document.getElementById("read-again");
      if (again) {
        again.disabled = false;
        again.hidden = false;
        again.textContent = "Retry";
      }
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
      showRetry(true, "The account could not be read. Read the account again.");
      text("status", "The account could not be read. Read the account again.");
    });
  }

  document.querySelectorAll("[data-connect]").forEach(function (button) {
    button.addEventListener("click", function () {
      var which = button.getAttribute("data-connect");
      var url = "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server";
      if (which === "linear") url = "https://linear.app/docs/mcp";
      if (which === "slack") url = "https://docs.slack.dev/ai/slack-mcp-server";
      window.open(url, "_blank", "noopener");
      text("connector-who", "Allow the MCP in the window that opened, then come back. This page does not take a key.");
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
    openDialog("workspace-dialog");
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
  document.getElementById("new-room").addEventListener("click", function () {
    text("join-status", "");
    pickDoor(true);
    openDialog("create-dialog");
    var linkLabel = document.getElementById("meet-link-label");
    if (linkLabel && !linkLabel.hidden) document.getElementById("meet-link").focus();
  });
  document.getElementById("pick-meeting").addEventListener("click", function () { pickDoor(true); });
  document.getElementById("pick-channel").addEventListener("click", function () { pickDoor(false); });
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
    if (!document.getElementById("account-menu").hidden) closeAccountMenu();
    else if (!document.getElementById("profile-dialog").hidden) closeDialog("profile-dialog");
    else if (!document.getElementById("palette").hidden) closePalette();
    else if (!document.getElementById("decision-dialog").hidden) closeDialog("decision-dialog");
    else if (!document.getElementById("create-dialog").hidden) closeDialog("create-dialog");
    else if (!document.getElementById("file-dialog").hidden) closeDialog("file-dialog");
    else if (!document.getElementById("workspace-dialog").hidden) closeDialog("workspace-dialog");
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
    }).then(function (response) { return response.json(); }).then(function (result) {
      fillHearing(result.hearing);
      if (note) note.textContent = "";
      toast("Saved. The meeting guest is " + (result.hearing && result.hearing.name ? result.hearing.name : "Maple") + ".");
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
        button.textContent = "Retry";
      }
      return load();
    });
  });
  document.getElementById("chat-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var sentence = document.getElementById("chat-text").value;
    var emptyLine = document.getElementById("chat-empty");
    if (emptyLine) emptyLine.hidden = true;
    var askedNow = sentence.trim();
    lastQuestion = askedNow;
    addChatTurn("You", askedNow || "The question is missing.", "");
    addChatTurn("Sederunt", "Reading.", "");
    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sentence, workspace: workspaceKind })
    }).then(function (response) { return response.json(); }).then(function (result) {
      var answer = result.body || "";
      if (answer === "A decision is kept from a room.") {
        answer = "A decision is kept from a room. Chat does not keep a decision. Ask what was decided.";
      }
      var parts = chatParts(answer);
      var purpose = document.getElementById("chat-purpose");
      if (purpose) purpose.hidden = true;
      var reading = document.querySelector("#chat-log .chat-turn:last-child .chat-body > span");
      var pending = document.querySelector("#chat-log .chat-turn:last-child");
      if (pending) pending.classList.remove("chat-pending");
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
          var who = String(item.speaker || "someone").trim().toLowerCase() || "someone";
          chip.textContent = item.clock ? (who + " · " + item.clock) : who;
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
          var who = String(cite.speaker || "").trim().toLowerCase();
          var clock = cite.clock || "";
          if (who && clock) return who + " · " + clock;
          return cite.label || "";
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
      document.getElementById("chat-text").value = "";
      growChat();
      placeChatAnswer((pending && pending.querySelector(".cite-row")) || pending);
      return load();
    }).catch(function () {
      var pending = document.querySelector("#chat-log .chat-turn.chat-pending");
      var reading = pending ? pending.querySelector(".chat-body > span") : null;
      if (reading) {
        reading.textContent = "The room did not answer. Send the sentence again.";
        pending.classList.remove("chat-pending");
      } else addChatTurn("Sederunt", "The room did not answer. Send the sentence again.");
    });
  });
  document.getElementById("meet-form").addEventListener("submit", function (event) {
    event.preventDefault();
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
    var all = (cites || []).filter(function (cite) { return cite && cite.label; });
    if (!all.length) return;
    var row = document.createElement("span");
    row.className = "cite-row";
    var limit = 2;
    function addChip(cite) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cite-chip";
      var citeWhen = relativeWhen(cite.spokenAt) || whenLabel(cite.spokenAt);
      var citeRoom = String(cite.label || "").split(" · ")[0];
      chip.textContent = citeWhen ? (citeRoom + " · " + citeWhen) : cite.label;
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
    var line = document.createElement("p");
    line.className = who === "You" ? "chat-turn chat-you" : "chat-turn chat-bot";
    if (value === "Reading.") line.classList.add("chat-pending");
    var label = document.createElement("strong");
    label.textContent = who;
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
      if (pageAvatar) pageAvatar.textContent = initials(shown);
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
    var button = event.target.closest("[data-suggest]");
    if (!button) return;
    var input = document.getElementById("chat-text");
    if (!input || input.disabled) return;
    input.value = button.getAttribute("data-suggest") || "";
    growChat();
    var form = document.getElementById("chat-form");
    if (form && form.requestSubmit) form.requestSubmit();
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
      if (event.repeat || chatBox.disabled) return;
      var form = document.getElementById("chat-form");
      if (form && form.requestSubmit) form.requestSubmit();
      else if (form) form.dispatchEvent(new Event("submit", { cancelable: true }));
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
    [["home", "Home"], ["rooms", "Rooms"], ["history", "History"], ["record", "Decisions"], ["chat", "Chat"], ["connectors", "Status"], ["account", "Account"], ["people", "People"]].forEach(function (page) {
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
  load();
  syncRail();
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
  if (/^U[A-Z0-9_]{2,}$/.test(value)) return "";
  if (/^0x[0-9a-fA-F]+$/.test(value)) return "";
  return value;
}

function accountInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || "?";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
