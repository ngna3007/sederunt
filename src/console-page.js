import { brandLogo } from "./brand-logos.js";

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
  const accountMenu = signedIn
    ? `<button type="button" role="menuitem" id="edit-profile">Edit profile</button><form id="sign-out-form" method="post" action="/console/sign-out"><button id="sign-out" type="submit" role="menuitem">Sign out</button></form>`
    : `<p class="account-note" role="note">Sign-in is not set up.</p>`;
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
  const panelIcon = glyph('<rect x="2.6" y="3" width="10.8" height="10" rx="1.4"/><path d="M6.4 3v10"/>');
  const plugIcon = glyph('<path d="M6 2.6v3M10 2.6v3M4.2 5.6h7.6v2.4a3.8 3.8 0 0 1-7.6 0V5.6Z"/><path d="M8 11.8V14"/>');
  const calendarIcon = brandLogo("google-calendar");
  const linearIcon = brandLogo("linear-icon");
  const channelIcon = brandLogo("slack-icon");
  const searchIcon = glyph('<circle cx="7" cy="7" r="3.2"/><path d="M9.4 9.4 12.5 12.5"/>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
<link rel="stylesheet" href="/console.css">
</head>
<body>
<div class="nav-scrim" id="nav-scrim"></div>
<div class="shell">
  <div class="rail-wrap">
    <div class="rail-head">
      <div class="brand-row">
      <p class="brand">Sederunt</p>
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
      <a href="/console" data-show="home">${homeIcon}Home</a>
      <a href="/console/rooms" data-show="rooms">${roomsIcon}Rooms</a>
      <a href="/console/history" data-show="history">${historyIcon}History</a>
      <a href="/console/decisions" data-show="record">${recordIcon}Decisions</a>
      <a href="/console/chat" data-show="chat">${chatIcon}Chat</a>
      <p class="rail-label">Setup</p>
      <a href="/console/status" id="show-connectors">${plugIcon}Status</a>
      <p class="rail-label">Account</p>
      <a href="/console/people" data-show="people">${peopleIcon}People</a>
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
  <div class="stage">
    <div class="topbar">
      <button id="rail-toggle" class="panel-btn" type="button" aria-pressed="false" aria-label="Hide the sidebar">${panelIcon}</button>
      <span class="topbar-rule" aria-hidden="true"></span>
      <nav class="crumb" aria-label="Breadcrumb">
        <button id="crumb-home" class="crumb-link" type="button" hidden>Home</button>
        <span id="crumb-sep" class="crumb-sep" hidden aria-hidden="true">&gt;</span>
        <span id="crumb-current" aria-current="page">Rooms</span>
      </nav>
      <span id="top-name" class="top-name"></span>
    </div>
    <h1 id="status-title" class="page-title" hidden>Status</h1>
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
    <div id="read-error" class="state-error" hidden>
      <p id="read-error-copy">The account could not be read.</p>
      <button id="read-again" type="button">Retry</button>
    </div>
    <div class="page-head" id="home-head">
    <div>
    <h1 id="home-title" class="page-title">Home</h1>
    <p class="page-lede">What is waiting, and which rooms heard a decision.</p>
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
    <div id="loading" class="skeletons" aria-busy="true">
      <span class="sr">Reading the account.</span>
      <span class="sk sk-h"></span>
      <span class="sk sk-l"></span>
      <span class="sk sk-b"></span>
    </div>
    <div id="overview" hidden>
      <div class="page-head"><div><h1 class="page-title">Status</h1><p class="page-lede">Which tools Sederunt can use, and how the meeting guest listens.</p></div><div class="page-actions"></div></div>
      <p id="connector-split"></p>
      <div class="settings-card" id="tools-card">
      <p class="section-label">Tools</p>
      <p class="card-help">A tool that is not connected cannot be used from this page.</p>
      <div class="connectors">
        <div class="conn" id="cal-status-row">
          ${calendarIcon}
          <div class="set-copy">
            <strong>Calendar</strong>
            <p id="cal-conn" class="conn-state off">Not connected.</p>
            <p id="cal-line" class="sr">Calendar is on Ask.</p>
          </div>
          <button type="button" class="conn-connect" id="cal-connect" data-connect="calendar">Connect</button>
        </div>
        <div class="conn" id="lin-status-row">
          ${linearIcon}
          <div class="set-copy">
            <strong>Linear</strong>
            <p id="lin-conn" class="conn-state off">Not connected.</p>
            <p id="lin-line" class="sr">Linear is on Ask.</p>
          </div>
          <button type="button" class="conn-connect" id="lin-connect" data-connect="linear">Connect</button>
        </div>
        <div class="conn" id="slack-status-row">
          ${channelIcon}
          <div class="set-copy">
            <strong>Slack</strong>
            <p id="slack-conn" class="conn-state off">Not connected.</p>
            <p id="slack-note">Sederunt answers in a channel it has already joined.</p>
          </div>
          <button type="button" class="conn-connect" id="slack-connect" data-connect="slack">Connect</button>
        </div>
      </div>
      </div>
      <div class="settings-card" id="ask-block">
        <p class="section-label">Before sending a change</p>
        <p id="ask-help" class="card-help">Waits for a confirm before a change is sent. Sends means the change goes out.</p>
        <div class="conn ask-quiet" id="cal-ask-row">
          <div class="set-copy"><span class="ask-name">Ask first</span><span class="ask-tool"> for Calendar</span></div>
          <div class="conn-ask"><span class="ask-state">Waits</span><label class="switch"><input id="cal-ask" type="checkbox" checked aria-describedby="ask-help"><span class="sr">Ask first for Calendar</span></label></div>
        </div>
        <div class="conn ask-quiet" id="lin-ask-row">
          <div class="set-copy"><span class="ask-name">Ask first</span><span class="ask-tool"> for Linear</span></div>
          <div class="conn-ask"><span class="ask-state">Waits</span><label class="switch"><input id="lin-ask" type="checkbox" checked aria-describedby="ask-help"><span class="sr">Ask first for Linear</span></label></div>
        </div>
      </div>
      <div class="settings-card" id="hearing-block">
        <p class="section-label">Meeting guest</p>
        <p id="hearing-help">The guest uses this name in the meeting. A line is kept when someone says the name, or one of the trigger words or sentences.</p>
        <div class="hearing-grid">
        <div class="hearing-field">
          <label for="hearing-name">Name</label>
          <p>Shown on the guest's camera.</p>
          <input id="hearing-name" name="hearing-name" maxlength="40" value="Maple" autocomplete="off">
        </div>
        <div class="hearing-field">
          <label for="hearing-triggers">Triggers</label>
          <p>One word or sentence on each line.</p>
          <textarea id="hearing-triggers" name="hearing-triggers" rows="4" placeholder="keep this"></textarea>
        </div>
        </div>
        <p class="section-next"><button id="hearing-save" type="button">Save the guest</button></p>
        <p id="hearing-note"></p>
      </div>
      <p id="connector-who"></p>
      <p id="custom-how" class="sr">A tool other than Calendar, Linear, or Slack cannot be connected from this page.</p>
      <p id="prefs" class="sr">Calendar is on Ask. Linear is on Ask.</p>
    </div>
    <section id="rooms">
      <div class="page-head" id="rooms-head" hidden>
        <div>
          <h1 class="page-title">Rooms</h1>
          <p class="page-lede">Meetings and channels this workspace has heard.</p>
        </div>
        <div class="page-actions"></div>
      </div>
      <div class="toolbar" id="room-toolbar" hidden>
        <label class="search">${searchIcon}<span class="sr">Search rooms</span><input id="room-search" type="search" placeholder="Search rooms" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filter rooms">
          <button type="button" class="chip-filter" data-room-filter="all" aria-pressed="true">All</button>
          <button type="button" class="chip-filter" data-room-filter="waiting">Waiting</button>
          <button type="button" class="chip-filter" data-room-filter="kept">Kept a decision</button>
        </div>
      </div>
      <div class="explorer">
        <div class="explorer-head">
          <span>Room</span>
          <span>Platform</span>
          <span>Speakers</span>
          <span>Waiting</span>
        </div>
        <div id="room-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span><p class="empty-title" id="room-empty-line">No room yet.</p><p id="room-empty-aside">Bring Sederunt into a meeting or a channel.</p><button type="button" id="clear-filters" hidden>Clear filters</button></div>
        <div id="room-list"></div>
        <p id="room-foot" class="explorer-foot" hidden></p>
      </div>
      <div id="personal-notes" hidden>
        <p id="personal-empty">A private note is not a room.</p>
        <div id="personal-list"></div>
      </div>
    </section>
    <section id="history" hidden>
      <div class="page-head"><div><h1 class="page-title">History</h1><p class="page-lede">What a room heard, and what is waiting on you.</p></div></div>
      <div class="choices" role="group" aria-label="Whose record">
        <button type="button" data-scope="group" aria-pressed="true">Company</button>
        <button type="button" data-scope="you" aria-pressed="false">You</button>
      </div>
      <div class="choices" role="group" aria-label="Kind of record">
        <button type="button" data-kind="all" aria-pressed="true">All</button>
        <button type="button" data-kind="question">Decisions</button>
        <button type="button" data-kind="action">Waiting</button>
        <button type="button" data-kind="other">Asks</button>
      </div>
      <div id="history-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4.6"/><path d="M8 5.6V8l1.7 1.1"/></svg></span><p class="empty-title">Nothing in this list.</p><p id="history-line">No company history yet. Questions and decisions from a room show up here.</p></div>
      <p class="section-next"><button id="history-next" class="primary" type="button" hidden>New room</button></p>
      <div id="history-list"></div>
    </section>
    <section id="chat" hidden>
      <div class="page-head"><div><h1 class="page-title">Chat</h1><p class="page-lede">Ask what this workspace already kept. Chat does not keep a decision.</p></div></div>
      <div class="talk-panel">
        <div class="thread" id="chat-log">
          <div id="chat-empty" class="empty-state"><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.4h10.8v6.4H6.2L2.6 12.6V3.4Z"/></svg></span><p class="empty-title">Nothing has been asked yet.</p><p>Ask what was decided.</p></div>
          <p id="chat-purpose"></p>
        </div>
        <p id="chat-next-row" class="section-next"><button id="chat-next" class="primary" type="button">New room</button></p>
        <form id="chat-form">
          <label><span class="sr">Ask the workspace</span><textarea id="chat-text" name="chat" rows="1" placeholder="Ask about a room's decision"></textarea></label>
          <button class="primary" type="submit">Ask</button>
        </form>
        <p class="composer-hint">Enter sends. Shift+Enter adds a line.</p>
      </div>
    </section>
    <section id="record" hidden>
      <div class="page-head"><div><h1 class="page-title">Decisions</h1><p class="page-lede">Sentences a room kept, with who kept each one and when.</p></div><div class="page-actions"></div></div>
      <div class="empty-state" id="record-empty"><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.8h10v10.4H3z"/><path d="M5 6h6M5 8.4h6M5 10.8h3.5"/></svg></span><p class="empty-title ledger">No decision yet.</p><p>A sentence kept in a room shows up here.</p></div>
      <p class="section-next"><button id="record-next" class="primary" type="button">New room</button></p>
      <div class="record-board">
        <div id="record-list"></div>
        <p id="record-detail"></p>
      </div>
    </section>
    <section id="people" hidden>
      <div class="page-head"><div><h1 class="page-title">People</h1><p class="page-lede">Names heard in a room.</p></div></div>
      <div id="people-empty" class="empty-state" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.2" r="2.2"/><path d="M3.4 12.6c.7-2 2.4-3 4.6-3s3.9 1 4.6 3"/></svg></span><p class="empty-title">No one is listed yet.</p><p>People from a meeting or a channel show up here.</p></div>
      <p class="section-next"><button id="people-next" class="primary" type="button" hidden>Open Home</button></p>
      <div id="people-list"></div>
    </section>
    <div id="file-dialog" class="dialog" hidden role="region" aria-labelledby="file-title">
      <div class="panel">
        <div class="page-head">
          <div class="file-name">
            <p id="file-kind" class="page-kicker"></p>
            <h1 id="file-title" class="page-title"></h1>
            <p id="file-lead" class="page-lede" hidden></p>
            <p id="file-lead-status" class="meta"></p>
            <p id="file-proof" class="meta" hidden></p>
          </div>
          <button type="button" class="close" data-close="file-dialog" aria-label="Close">${closeIcon}</button>
        </div>
        <div class="detail-split">
          <div class="detail-main">
            <section class="detail-block">
              <h2>Decision</h2>
              <div id="file-decisions"></div>
            </section>
            <section class="detail-block" id="waiting-row" hidden>
              <h2>Waiting changes</h2>
              <p id="file-action-note" class="meta"></p>
              <div id="file-waiting"></div>
            </section>
            <section class="detail-block">
              <h2>Speakers</h2>
              <div id="file-heard" class="faces"></div>
              <p id="file-present">The meeting has not sent who is there.</p>
            </section>
            <section class="detail-block" id="files-block">
              <h2 id="files-heading" hidden>Files</h2>
              <div id="file-files"></div>
            </section>
            <section class="detail-block" id="outside-block" hidden>
              <h2 id="outside-heading">Not invited</h2>
              <div id="file-outside"></div>
            </section>
          </div>
          <aside class="detail-side">
            <h2 id="settings-heading">Settings</h2>
            <div class="room-set">
              <div class="set-copy">
                <strong>Ask first</strong>
                <p id="room-edit-note"></p>
              </div>
              <label class="switch"><input id="ask-first" type="checkbox" checked><span class="sr">Ask first</span></label>
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
              <label class="switch"><input id="raise-clash" type="checkbox"><span class="sr">Raise a clash</span></label>
            </div>
          </aside>
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
      <p class="page-lede">This name is shown on the account. It does not change the member configured for this process.</p>
      <label>Display name <input id="profile-name" name="name" autocomplete="name" maxlength="80"></label>
      <p id="profile-note" class="page-lede"></p>
      <button class="primary" type="submit">Save</button>
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
<script>
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
  var slowTimer = null;
  var toastTimer = null;
  var workspaceKind = "company";
  var sectionName = "home";
  var returnSection = "home";
  var loadToken = 0;
  var opener = null;
  var roomFilter = "all";
  var roomQuery = "";
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
    return filed.length ? line + " Filed as " + filed[filed.length - 1] + "." : line;
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
    var row = input.closest(".conn");
    var word = row ? row.querySelector(".ask-state") : null;
    if (word) word.textContent = input.checked ? "Waits" : "Sends";
  }

  function paintConn(id, connected) {
    var node = document.getElementById(id);
    if (!node) return;
    var failed = state && state.read === "failed";
    node.textContent = failed ? "Unknown." : (connected ? "Connected." : "Not connected.");
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
    var emptyHome = !personal && roomTotal() === 0 && sectionName === "home";
    var homeEmpty = document.getElementById("home-empty");
    var blockedHome = !!(document.getElementById("meet-block") && document.getElementById("slack-block"));
    if (homeEmpty) homeEmpty.hidden = !emptyHome;
    var stats = document.getElementById("home-stats");
    if (stats) stats.hidden = sectionName !== "home" || emptyHome;
    var note = document.getElementById("read-note");
    if (note) note.hidden = sectionName !== "home" || emptyHome;
    var explorer = document.querySelector(".explorer");
    if (explorer && !personal) explorer.hidden = sectionName === "home" && emptyHome;
    var line = document.getElementById("home-empty-line");
    var aside = document.getElementById("home-empty-aside");
    if (line) line.textContent = blockedHome ? "No meeting or channel is in use." : "No room yet.";
    if (aside) aside.textContent = blockedHome ? "" : "A meeting or a channel that keeps a decision adds the room.";
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
    if (label) {
      label.hidden = !showFull;
      if (showFull) label.textContent = "Rooms";
    }
    if (meet) meet.hidden = !showFull;
    if (slack) slack.hidden = !showFull;
    var meetKicker = document.getElementById("meet-kicker");
    var channelKicker = document.getElementById("channel-kicker");
    if (meetKicker) meetKicker.hidden = !(showFull && meet);
    if (channelKicker) channelKicker.hidden = !(showFull && slack);
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
    if (statusTitle) statusTitle.hidden = !showFull;
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
      if (isStatusWord(trimmed) || trimmed.indexOf("preference ") === 0 || trimmed.indexOf("checkpoint ") === 0) return;
      if (/^ROW-[0-9]+$/.test(trimmed)) {
        flush(trimmed);
        return;
      }
      flush("");
      pending = trimmed;
    });
    flush("");
    if (facts.length > 1 || (facts.length === 1 && lastQuestion)) return rankAnswer(lastQuestion);
    if (facts.length === 1) return { answer: facts[0], detail: "" };
    var stored = rankAnswer(lastQuestion);
    if (stored.answer) return stored;
    var raw = String(body || "");
    if (raw.indexOf("missing-member") !== -1) return { answer: "This server has no member configured.", detail: "" };
    if (raw.indexOf("not-invited") !== -1) return { answer: "You were not in that room.", detail: "" };
    if (raw.indexOf("there are no notes yet") !== -1) return { answer: "There are no notes yet.", detail: "" };
    if (/(^|\\n)unknown(\\n|$)/.test(raw)) return { answer: "The account could not be read. Read it again.", detail: "" };
    return { answer: "Nothing is stored that you can read.", detail: "" };
  }

  function rankAnswer(question) {
    var stop = { what: 1, was: 1, were: 1, decided: 1, about: 1, the: 1, a: 1, an: 1, of: 1, to: 1, in: 1, on: 1, for: 1, and: 1, or: 1, is: 1, this: 1, that: 1, with: 1, from: 1, did: 1, does: 1 };
    var words = String(question || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (word) {
      return word.length > 2 && !stop[word];
    });
    var rows = ((state && state.decisions) || []).filter(function (decision) { return String(decision.text || "").trim(); });
    function hits(decision) {
      var text = String(decision.text || "").toLowerCase();
      var count = 0;
      words.forEach(function (word) { if (text.indexOf(word) !== -1) count += 1; });
      return count;
    }
    function line(decision) {
      var room = ((state && state.rooms) || []).filter(function (item) { return item.id === decision.roomId; })[0];
      var named = roomLabel(room || {}, decision);
      return decision.text + (named ? " (in " + named + ")" : "");
    }
    if (!rows.length) return { answer: "Nothing is stored that you can read.", detail: "" };
    var ranked = rows.map(function (decision) { return { decision: decision, score: hits(decision) }; });
    ranked.sort(function (a, b) {
      return b.score - a.score || String(b.decision.spokenAt || "").localeCompare(String(a.decision.spokenAt || ""));
    });
    var matched = ranked.filter(function (row) { return row.score > 0; }).slice(0, 3);
    if (!words.length || !matched.length) {
      var latest = rows.slice().sort(function (a, b) {
        return String(b.spokenAt || "").localeCompare(String(a.spokenAt || ""));
      }).slice(0, 3);
      return { answer: "Nothing stored matches that question.", detail: "Latest: " + latest.map(line).join(" ") };
    }
    return { answer: line(matched[0].decision), detail: matched.slice(1).map(function (row) { return line(row.decision); }).join(" ") };
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
    return date.getUTCDate() + " " + months[date.getUTCMonth()] + " " + date.getUTCFullYear();
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
    if (name && document.activeElement !== name) name.value = heard.name || "Maple";
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
    if (spec.title) card.title = spec.fullTitle || spec.title;
    if (spec.roomId) card.setAttribute("data-room", spec.roomId);
    if (spec.wait) card.setAttribute("data-wait", spec.wait);
    var roomCol = document.createElement("span");
    roomCol.className = "ex-room";
    var title = document.createElement("strong");
    title.textContent = spec.title;
    var count = document.createElement("span");
    count.className = "ex-count";
    count.textContent = spec.countLine;
    roomCol.append(title, count);
    var where = document.createElement("span");
    where.className = "where ex-plat";
    if (spec.where) {
      var mark = document.createElement("span");
      mark.className = "room-mark";
      mark.textContent = spec.where.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "M";
      var tones = {
        "Google Meet": "#174ea6",
        Zoom: "#084298",
        Teams: "#3b3f8f",
        Webex: "#0b5e4d",
        Slack: "#4a154b"
      };
      mark.style.background = tones[spec.where] || "#212529";
      var whereText = document.createElement("span");
      whereText.textContent = spec.where;
      where.append(mark, whereText);
    }
    var heard = document.createElement("span");
    heard.className = "faces ex-heard";
    var people = spec.people || [];
    people.slice(0, 4).forEach(function (person) { heard.append(face(person)); });
    if (people.length > 4) {
      var more = document.createElement("span");
      more.className = "more";
      more.textContent = "+" + (people.length - 4);
      heard.append(more);
    }
    var waitCol = document.createElement("span");
    waitCol.className = "ex-bot";
    waitCol.textContent = spec.waitingCount ? (String(spec.waitingCount) + " waiting") : "None";
    card.append(roomCol, where, heard, waitCol);
    card.addEventListener("click", function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (spec.wait) openWaiting(spec);
      else openFile(spec.roomId);
    });
    document.getElementById("room-list").append(card);
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
    var shown = 0;
    waiting.forEach(function (item) {
      if (!roomVisible(item)) return;
      shown += 1;
      addRoomCard(item);
    });
    rooms.forEach(function (room) {
      var rows = decisionsFor(room.id);
      var last = rows.length ? rows[rows.length - 1] : null;
      var spec = {
        roomId: room.id,
        title: roomLabel(room, last),
        fullTitle: last ? last.text : "",
        where: room.platform || "",
        countLine: rows.length ? roomCount(rows) : "Waiting for the meeting name",
        people: peopleFor(room.id),
        waitingCount: waitingFor(room.id).length,
        kept: rows.length > 0
      };
      if (!roomVisible(spec)) return;
      shown += 1;
      addRoomCard(spec);
    });
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
      ? "The account could not be read. Try again."
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
    if (foot) {
      foot.hidden = shown === 0;
      var noun = shown === 1 ? "room" : "rooms";
      foot.textContent = shown ? (shown === total ? (shown + " " + noun) : (shown + " of " + total + " rooms")) : "";
    }
  }

  function roomLabel(room, lead) {
    var when = lead ? whenLabel(lead.spokenAt) : "";
    if (room && room.platform && when) return room.platform + ", " + when;
    if (room && room.platform) return room.platform;
    var text = lead && lead.text ? String(lead.text) : "";
    if (text.length > 52) return text.slice(0, 49).trim() + "...";
    return text || "Room";
  }

  function roomVisible(spec) {
    var waitingOn = (spec.waitingCount || 0) > 0 || !!spec.wait;
    if (roomFilter === "waiting" && !waitingOn) return false;
    if (roomFilter === "kept" && !spec.kept) return false;
    if (!roomQuery) return true;
    var hay = String(spec.fullTitle || "") + " " + String(spec.title || "") + " " + String(spec.where || "");
    return hay.toLowerCase().indexOf(roomQuery) !== -1;
  }

  function addDecisionRow(decision) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "decision-row";
    var main = document.createElement("span");
    var heading = document.createElement("strong");
    heading.textContent = decision.text || "No decision yet.";
    var meta = document.createElement("span");
    meta.className = "meta";
    var who = personLabel(decision.speaker);
    var when = whenLabel(decision.spokenAt);
    var room = roomLabel((((state && state.rooms) || []).filter(function (item) { return item.id === decision.roomId; })[0]) || {}, decision);
    meta.textContent = [who, when, room].filter(Boolean).join(" · ");
    main.append(heading, meta);
    card.append(main);
    var status = decision.status || "";
    if (typeof decision.checkpoint === "number" || status === "clashing" || status === "unknown" || status === "replaced") {
      var badge = document.createElement("span");
      badge.className = status === "clashing" || status === "unknown" ? "badge bad" : "badge";
      badge.textContent = typeof decision.checkpoint === "number" ? ("Checkpoint " + decision.checkpoint) : statusLabel(status);
      card.append(badge);
    }
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
    if (!rows.length) return;
    var head = document.createElement("div");
    head.className = "people-head";
    ["Name", "Rooms", "Decisions", "Last heard"].forEach(function (label) {
      var cell = document.createElement("span");
      cell.textContent = label;
      head.append(cell);
    });
    list.append(head);
    rows.forEach(function (person) {
      var row = document.createElement("div");
      row.className = "people-row";
      [person.name, person.rooms.join(", ") || "Room", String(person.count), whenLabel(person.last) || ""].forEach(function (value) {
        var cell = document.createElement("span");
        cell.textContent = value;
        row.append(cell);
      });
      list.append(row);
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
    cell.className = attention ? "count attention" : "count";
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
    addCount(box, "Waiting on you", counts.waiting || 0, counts.waiting ? "Changes waiting for a confirm." : "Nothing is waiting.", (counts.waiting || 0) > 0 ? openWaitingList : null, (counts.waiting || 0) > 0);
    if (counts.sent) addCount(box, "Sent", counts.sent, "The tool accepted the change.", null, false);
    if (counts.failed) addCount(box, "Failed", counts.failed, "A change did not go through.", null, false);
  }

  function syncHistoryKinds() {
    var you = historyScope === "you";
    if (you && (historyKind === "question" || historyKind === "other")) historyKind = "all";
    if (!you && historyKind === "action") historyKind = "all";
    document.querySelectorAll("[data-kind]").forEach(function (button) {
      var kind = button.getAttribute("data-kind");
      var hide = you ? (kind === "question" || kind === "other") : (kind === "action");
      button.hidden = hide;
    });
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
    rows.forEach(function (row) {
      addLine("history-list", row.title, row.body, function () {
        if (row.decision) openDecision(row.decision);
        else if (row.roomId) openFile(row.roomId);
      });
    });
  }

  function paint(next) {
    state = next;
    text("status", "");
    if (next.workspace === "personal" || next.workspace === "company") workspaceKind = next.workspace;
    paintChip();
    document.getElementById("loading").hidden = !next.reading;
    document.body.classList.toggle("read-failed", next.read === "failed");
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
    showRetry(next.read === "failed", "The account could not be read. Try again.");
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
    text("cal-line", calendarMode === "Ask" ? "Calendar waits before a change." : "Calendar sends the change.");
    text("lin-line", linearMode === "Ask" ? "Linear waits before a change." : "Linear sends the change.");
    text("prefs", (calendarMode === "Ask" ? "Calendar waits before a change." : "Calendar sends the change.") + " " + (linearMode === "Ask" ? "Linear waits before a change." : "Linear sends the change."));
    var calAsk = document.getElementById("cal-ask");
    var linAsk = document.getElementById("lin-ask");
    if (calAsk) calAsk.checked = calendarMode === "Ask";
    if (linAsk) linAsk.checked = linearMode === "Ask";
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
    if (askHelp) askHelp.textContent = "Waits for a confirm before a change is sent. Sends means the change goes out.";
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
    var peopleCount = document.querySelectorAll("#people-list .people-row").length;
    document.getElementById("people-empty").hidden = peopleCount > 0;
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
    if (recordNext) recordNext.hidden = workspaceKind === "personal" || (next.decisions || []).length > 0 || (next.read === "failed");
    var recordBoard = document.querySelector(".record-board");
    var recordEmpty = document.getElementById("record-empty");
    var noKept = (next.decisions || []).length === 0;
    if (recordEmpty) {
      recordEmpty.hidden = !noKept;
      var emptyTitle = recordEmpty.querySelector(".empty-title");
      var emptyLine = recordEmpty.querySelector("p:last-child");
      if (next.read === "failed" && emptyTitle) emptyTitle.textContent = "Decisions are unavailable.";
      if (next.read === "failed" && emptyLine) emptyLine.textContent = "The account could not be read. Try again.";
    }
    if (recordBoard) recordBoard.hidden = noKept;
    var chatNext = document.getElementById("chat-next");
    if (chatNext) chatNext.hidden = !noKept || workspaceKind === "personal";
    var chatForm = document.getElementById("chat-form");
    var chatButton = document.querySelector("#chat-form button");
    var chatInput = document.getElementById("chat-text");
    var chatEmpty = document.getElementById("chat-empty");
    if (chatEmpty) chatEmpty.hidden = document.querySelector("#chat-log .chat-turn") != null;
    if (chatForm) chatForm.hidden = noKept;
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

  function sectionLabel(name) {
    if (name === "rooms") return "Rooms";
    if (name === "history") return "History";
    if (name === "chat") return "Chat";
    if (name === "record") return "Decisions";
    if (name === "people") return "People";
    if (name === "connectors") return "Status";
    return "Home";
  }

  function placeNewRoom() {
    var button = document.getElementById("new-room");
    if (!button) return;
    var hostId = sectionName === "rooms" ? "rooms-head" : sectionName === "record" ? "record" : "home-head";
    var host = hostId === "record"
      ? document.querySelector("#record .page-actions")
      : document.querySelector("#" + hostId + " .page-actions");
    if (host && button.parentNode !== host) host.appendChild(button);
  }

  function syncNewRoom() {
    var button = document.getElementById("new-room");
    if (!button) return;
    var onList = sectionName === "home" || sectionName === "rooms" || sectionName === "record";
    button.hidden = workspaceKind === "personal" || !onList || (state && state.read === "failed");
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
    toastTimer = setTimeout(function () { node.hidden = true; }, 4200);
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
    if (name === "connectors") return "/console/status";
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
    if (path === "/console/status") return "connectors";
    return "home";
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
    var homeTitle = document.getElementById("home-title");
    if (homeTitle) homeTitle.hidden = name !== "home";
    var panels = ["rooms", "history", "chat", "record", "people"];
    var onFile = name === "file";
    document.getElementById("overview").hidden = name !== "connectors";
    var crumbHome = document.getElementById("crumb-home");
    var crumbSep = document.getElementById("crumb-sep");
    if (crumbHome) crumbHome.hidden = true;
    if (crumbSep) crumbSep.hidden = true;
    if (onFile) {
      var kind = document.getElementById("file-kind");
      var crumb = (kind && kind.textContent) || "Room";
      text("crumb-current", crumb);
      if (file) file.hidden = false;
    } else {
      text("crumb-current", sectionLabel(name));
    }
    panels.forEach(function (id) {
      document.getElementById(id).hidden = onFile ? true : (name === "home" ? id !== "rooms" : id !== name);
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
    if (roomTools) roomTools.hidden = name !== "rooms";
    var homeHead = document.getElementById("home-head");
    if (homeHead) homeHead.hidden = name !== "home";
    var label = onFile ? ((document.getElementById("file-title") || {}).textContent || "Room") : sectionLabel(name);
    if (label.length > 48) label = label.slice(0, 45).trim() + "...";
    document.title = label + " · Sederunt";
    var topName = document.getElementById("top-name");
    if (topName && member()) topName.textContent = member();
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
    document.body.classList.remove("nav-open");
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
    var notable = lead && (lead.status === "clashing" || lead.status === "replaced" || lead.status === "unknown");
    if (status) {
      status.textContent = notable ? humanStatus(lead.status) : "";
      status.hidden = !status.textContent;
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
    if (filesBlock) filesBlock.hidden = names.length === 0;
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
      if (body.indexOf("The edit did not happen.") !== -1) note = "The edit did not happen.";
      else if (result && result.allow === "missing-member") note = "This server has no member configured.";
      else if (result && result.allow === "not-invited") note = "You were not in this room.";
      else if (kind === "confirm" && result && result.allow === "confirmed" && (result.status === "filed" || result.status === "updated")) {
        var ticket = (body.match(/ROW-[0-9]+/) || [])[0];
        var toolWord = /linear/i.test(body) ? "Linear" : /calendar/i.test(body) ? "Calendar" : "";
        note = ticket ? ("Filed as " + ticket + (toolWord ? " in " + toolWord : "") + ".") : "That change was confirmed.";
      }
      else if (kind === "dismiss" && wasWaiting && !waitingFor(fileRoom).some(function (item) { return item.id === actionId; })) note = "That change was dismissed.";
      text("file-action-note", note);
      if (note && note !== "That change is still waiting.") toast(note);
    }).catch(function () {
      button.disabled = false;
      text("file-action-note", "The account could not be read. Read the account again.");
    });
  }

  function renderWaiting() {
    var box = document.getElementById("file-waiting");
    clear("file-waiting");
    var rows = fileRoom ? waitingFor(fileRoom) : [];
    var waitingRow = document.getElementById("waiting-row");
    if (!rows.length) {
      if (waitingRow) waitingRow.hidden = true;
      return;
    }
    if (waitingRow) waitingRow.hidden = false;
    rows.forEach(function (action) {
      var row = document.createElement("div");
      row.className = "wait-card";
      var toolName = action.tool === "linear" ? "Linear ticket" : action.tool === "calendar" ? "Calendar event" : "Change";
      var tool = document.createElement("p");
      tool.className = "wait-tool";
      var mark = document.createElement("span");
      mark.className = "tool-logo " + (action.tool || "change");
      mark.textContent = toolName.slice(0, 1);
      var label = document.createElement("span");
      label.textContent = toolName;
      tool.append(mark, label);
      var line = document.createElement("p");
      line.textContent = action.statement || "A change is waiting.";
      var actions = document.createElement("div");
      actions.className = "wait-actions";
      var confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "primary";
      confirm.textContent = "Confirm";
      confirm.addEventListener("click", function () { sendAction("confirm", action.id, confirm); });
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "secondary";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", function () { sendAction("dismiss", action.id, dismiss); });
      actions.append(confirm, dismiss);
      row.append(tool, line, actions);
      box.append(row);
    });
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
    text("file-title", fileWait ? fileWait.title : (lead ? lead.text : "No decision yet."));
    renderLead();
    if (sectionName === "file") {
      var crumbKind = document.getElementById("file-kind");
      text("crumb-current", (crumbKind && crumbKind.textContent) || "Room");
    }
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
    var ask = document.getElementById("ask-first");
    ask.disabled = !fileRoom;
    if (room) ask.checked = room.ask !== false;
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
    var titledByRoom = Boolean(room && room.platform);
    rows.forEach(function (decision, index) {
      if (!titledByRoom && index === rows.length - 1) return;
      var line = document.createElement("p");
      line.textContent = decision.text || "No decision yet.";
      document.getElementById("file-decisions").append(line);
    });
    var decisionBlock = document.getElementById("file-decisions").parentNode;
    if (decisionBlock) decisionBlock.hidden = !document.getElementById("file-decisions").childElementCount;
    renderWaiting();
    renderFiles();
    renderOutside();
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
    var value = on ? "ask" : "do";
    text(line, "Saving Ask first.");
    fetch("/api/typed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "set " + tool + " to " + value })
    }).then(function (response) { return response.json(); }).then(function (result) {
      return load().then(function () { return result; });
    }).then(function (result) {
      if (!wrote(result)) {
        box.checked = !on;
        text(line, result && result.allow === "missing-member" ? "This server has no member configured." : "Ask first was not saved.");
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
    var value = on ? "ask" : "do";
    text("room-edit-note", "Saving Ask first.");
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
      else if (failed) text("room-edit-note", "Ask first was not saved.");
      else text("room-edit-note", on ? "This room waits before a change." : "This room sends the change.");
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

  function syncRoomLabels() {
    var blocked = !!(document.getElementById("meet-block") || document.getElementById("slack-block"));
    var homeLabel = document.querySelector("#new-room .room-label");
    var homeButton = document.getElementById("new-room");
    if (homeButton) homeButton.classList.add("primary");
    if (homeLabel) homeLabel.textContent = "New room";
    var plus = homeButton ? homeButton.querySelector(".ic") : null;
    if (plus) plus.hidden = false;
    var recordNext = document.getElementById("record-next");
    if (recordNext && blocked) {
      recordNext.hidden = false;
      recordNext.textContent = "See Status";
      recordNext.classList.remove("primary");
      recordNext.setAttribute("data-act", "status");
    }
    var chatNext = document.getElementById("chat-next");
    if (chatNext && blocked) {
      chatNext.hidden = false;
      chatNext.textContent = "See Status";
      chatNext.classList.remove("primary");
      chatNext.setAttribute("data-act", "status");
    }
    if (chatNext && !blocked && !chatNext.hidden) {
      chatNext.textContent = "New room";
      chatNext.setAttribute("data-act", "room");
    }
    var historyNext = document.getElementById("history-next");
    if (historyNext && blocked) {
      var historyEmpty = document.getElementById("history-empty");
      var needsName = historyScope === "you" && !member();
      var historyOpen = !!(historyEmpty && !historyEmpty.hidden);
      historyNext.hidden = !historyOpen;
      if (historyOpen && needsName) {
        historyNext.hidden = true;
      } else if (historyOpen) {
        historyNext.hidden = false;
        historyNext.textContent = "See Status";
        historyNext.classList.remove("primary");
        historyNext.setAttribute("data-act", "status");
      }
    }
    var peopleNext = document.getElementById("people-next");
    if (peopleNext && blocked) {
      var peopleEmpty = document.getElementById("people-empty");
      var peopleOpen = !!(peopleEmpty && !peopleEmpty.hidden);
      peopleNext.hidden = !peopleOpen;
      if (peopleOpen) {
        peopleNext.textContent = "See Status";
        peopleNext.classList.remove("primary");
        peopleNext.setAttribute("data-act", "status");
      }
    }
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
    clear("chat-log");
    var emptyChat = document.createElement("p");
    emptyChat.id = "chat-empty";
    emptyChat.textContent = "Nothing has been asked here yet.";
    document.getElementById("chat-log").append(emptyChat);
    document.getElementById("loading").hidden = false;
    load();
  }

  function armSlow() {
    if (slowTimer) return;
    slowTimer = setTimeout(function () {
      showRetry(true, "This is taking longer than usual. Try again.");
      var again = document.getElementById("read-again");
      if (again) {
        again.disabled = false;
        again.textContent = "Retry";
      }
    }, 12000);
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
    document.getElementById("loading").hidden = false;
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
      if (reading) reading.textContent = parts.answer || "The room did not answer.";
      if (reading && parts.detail) {
        var extra = document.createElement("span");
        extra.className = "chat-detail";
        extra.textContent = parts.detail;
        reading.parentNode.append(extra);
      }
      document.getElementById("chat-text").value = "";
      growChat();
      var log = document.getElementById("chat-log");
      log.scrollTop = log.scrollHeight;
      return load();
    }).catch(function () {
      addChatTurn("Sederunt", "The room did not answer. Send the sentence again.");
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
  function addChatTurn(who, value, detail) {
    var line = document.createElement("p");
    line.className = who === "You" ? "chat-turn chat-you" : "chat-turn chat-bot";
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
      var top = document.getElementById("top-name");
      if (top) top.textContent = shown;
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
    if (window.matchMedia("(max-width: 767px)").matches) {
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
    document.body.classList.remove("nav-open");
  });
  var chatBox = document.getElementById("chat-text");
  function growChat() {
    if (!chatBox) return;
    chatBox.style.height = "36px";
    var next = chatBox.scrollHeight;
    if (next > 160) {
      chatBox.style.height = "160px";
      chatBox.style.overflow = "auto";
    } else {
      chatBox.style.height = Math.max(36, next) + "px";
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
    if (items[paletteIndex].scrollIntoView) items[paletteIndex].scrollIntoView({ block: "nearest" });
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
    [["home", "Home"], ["rooms", "Rooms"], ["history", "History"], ["record", "Decisions"], ["chat", "Chat"], ["people", "People"], ["connectors", "Status"]].forEach(function (page) {
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
  routed = true;
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
