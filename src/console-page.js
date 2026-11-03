import { brandLogo } from "./brand-logos.js";

/**
 * The operator workspace. Onboard, home, rooms, history, chat, and record
 * read the process. The page has no key field.
 * The chip switches Company and Personal. Personal has no room.
 * The served console uses the Recall shell: one workspace switcher
 * sits at the top of the sidebar, and the breadcrumb sits over the content column.
 * The name field sits at the bottom of the rail.
 * The room file pins the decision. Each setting is a row, label then control.
 *
 * @param {{ meeting?: boolean, meetingSetup?: string, slackReady?: boolean }} [state]
 */
export function renderConsolePage(state = {}) {
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
<style>
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --sidebar: #fafafa;
    --fg: #020817;
    --muted: #64748b;
    --line: #e2e8f0;
    --side-line: #e5e7eb;
    --side-fg: #3f3f46;
    --side-accent: #f4f4f5;
    --primary: #2563eb;
    --ink: #1d4ed8;
    --tint: #f4f4f5;
    --amber: #7c4704;
    --ring: rgba(0, 0, 0, 0.12) 0px 1px 1px 0px, rgba(64, 68, 82, 0.16) 0px 0px 0px 1px, rgba(64, 68, 82, 0.08) 0px 2px 5px 0px;
    --ring-hover: rgba(0, 0, 0, 0.12) 0px 1px 1px 0px, rgba(64, 68, 82, 0.16) 0px 0px 0px 1px, rgba(64, 68, 82, 0.08) 0px 3px 9px 0px, rgba(64, 68, 82, 0.08) 0px 2px 5px 0px;
    --sans: ui-sans-serif, system-ui, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { margin: 0; background: var(--bg); color: var(--fg); overflow-x: clip; }
  body {
    height: 100dvh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  h1 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1; letter-spacing: -0.015em; }
  h2 { margin: 0 0 12px; font-size: 24px; font-weight: 500; line-height: 1.25; }
  h3 { margin: 20px 0 6px; font-size: 14px; font-weight: 600; }
  p { margin: 6px 0; }
  button, input, textarea { font: inherit; color: inherit; }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 8px 15px;
    border: 0;
    border-radius: 6px;
    background: #fff;
    font-weight: 500;
    cursor: pointer;
    box-shadow: var(--ring);
  }
  button:hover { box-shadow: var(--ring-hover); }
  button.primary { background: var(--primary); color: #fff; }
  button.primary:hover { background: var(--ink); color: #fff; }
  button.primary:disabled,
  button.primary:disabled:hover { background: #e2e8f0; color: #3f3f46; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  button.chip, button.crumb-link, .rail button, button.room, .menu button, .row-button, button.card, button.count, button.close, button.setup-toggle {
    box-shadow: none;
  }
  button.chip:hover, button.crumb-link:hover, .rail button:hover, button.room:hover, .menu button:hover, .row-button:hover, button.card:hover, button.count:hover, button.close:hover, button.setup-toggle:hover {
    box-shadow: none;
  }
  .ic { width: 16px; height: 16px; display: inline-grid; place-items: center; flex: 0 0 auto; }
  .ic svg { display: block; }
  button.close {
    width: 44px; height: 44px; padding: 0; background: transparent; color: var(--fg);
  }
  button.close:hover { background: var(--sidebar); }
  .brand-row {
    display: flex; flex-direction: column; align-items: stretch; gap: 2px;
    width: 100%; min-width: 0;
  }
  .brand-row h1 { padding: 2px 8px 0; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
  .chip-wrap { position: static; flex: 1; min-width: 0; }
  button.chip {
    width: 100%; justify-content: flex-start; gap: 8px;
    height: 48px; min-height: 48px; padding: 8px; border-radius: 6px; background: transparent;
  }
  button.chip:hover, button.chip.open { background: var(--side-accent); }
  button.chip .ic { margin-left: auto; color: var(--muted); }
  .ws-copy { display: grid; min-width: 0; flex: 1; text-align: left; line-height: 1.25; }
  #chip-name {
    font-size: 14px; font-weight: 600; color: var(--fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #chip-hint {
    font-size: 12px; font-weight: 400; color: var(--muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #chip-mark.tile-mark {
    width: 32px; height: 32px; border-radius: 8px; font-size: 14px;
  }
  #chip-mark.tile-mark.co { background: var(--primary); }
  .tile-mark {
    width: 22px; height: 22px; border-radius: 6px;
    display: inline-grid; place-items: center;
    color: #fff; font-weight: 700; font-size: 11px; flex: 0 0 auto;
  }
  .tile-mark.co { background: var(--ink); }
  .tile-mark.pe { background: #212529; }
  .menu {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5;
    width: auto; padding: 6px; display: grid; gap: 2px;
    background: #fff; border-radius: 6px; box-shadow: var(--ring);
  }
  .menu[hidden] { display: none; }
  .menu button { justify-content: flex-start; width: 100%; background: transparent; font-weight: 400; }
  .menu .menu-hint { color: var(--muted); font-size: 12px; font-weight: 400; }
  .menu-hint:empty, #chip-hint:empty { display: none; }
  .menu button:hover { background: var(--sidebar); }
  .menu button[aria-checked="true"] { background: var(--tint); color: var(--ink); font-weight: 700; }
  .menu button[aria-checked="true"] .tile-mark { box-shadow: inset 0 0 0 1px #fff; }
  .menu-rule { height: 1px; background: var(--line); margin: 4px; }
  input, textarea {
    width: 100%; min-height: 44px; padding: 8px 10px;
    border: 0; border-radius: 6px; background: #fff; box-shadow: var(--ring);
  }
  input[type="checkbox"] { width: 1.15rem; height: 1.15rem; min-height: 0; padding: 0; box-shadow: none; accent-color: var(--primary); }
  textarea { min-height: 6.5rem; }
  #chat-text { min-height: 44px; height: 44px; resize: none; }
  #chat-text:disabled { background: #f4f4f5; color: var(--muted); }
  #chat-off { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
  #status-title { margin: 16px 16px 0; }
  .notices {
    display: flex; flex-direction: column; align-items: stretch; gap: 0; flex: none;
    margin: 12px 16px 0; padding: 0; max-width: 40rem;
    background: #fff; border: 1px solid var(--line); border-radius: 8px;
    color: var(--fg); font-size: 13px; line-height: 1.45;
  }
  .notices:not(:has(#meet-block:not([hidden]), #slack-block:not([hidden]), #setup-toggle:not([hidden]))) { display: none; }
  .notices p, .ledger, #meet-block, #slack-block {
    margin: 0; max-width: none; background: transparent;
    border: 0; color: var(--muted);
  }
  .notices .setup-label { margin: 0; padding: 12px 16px 0; color: var(--fg); font-size: 14px; font-weight: 500; }
  #setup-label { padding: 12px 16px 4px; color: var(--fg); font-size: 16px; font-weight: 600; }
  #channel-kicker { border-top: 1px solid var(--line); }
  #meet-block, #slack-block { padding: 2px 16px 12px; color: var(--muted); font-size: 13px; font-weight: 500; }
  button.setup-toggle {
    justify-content: flex-start; width: auto; min-height: 44px; padding: 8px 0;
    background: transparent; color: #495057; font-weight: 500;
  }
  button.setup-toggle:hover { background: transparent; color: var(--fg); }
  #onboard {
    flex: 1; min-height: 0; overflow: auto;
    display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
    margin: 0; padding: 16px 20px 48px;
    background: transparent; border-radius: 0; box-shadow: none;
  }
  #onboard > .page-title { margin: 0; }
  #onboard .empty { margin: auto; }
  .empty {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    gap: 12px; width: min(100%, 28rem);
  }
  .empty-mark {
    width: 48px; height: 48px; display: grid; place-items: center;
    margin: 0 0 4px; color: var(--muted);
  }
  #onboard p {
    margin: 0; max-width: 28rem; color: var(--muted);
    font-size: 14px; font-weight: 500; line-height: 1.5;
  }
  #onboard .primary { min-width: 8rem; margin-top: 4px; }
  #onboard-ready { color: var(--fg); font-size: 16px; font-weight: 600; }
  #onboard-doors { display: flex; flex-direction: column; gap: 4px; width: 100%; color: var(--muted); font-size: 13px; }
  #onboard-doors:empty { display: none; }
  .shell {
    flex: 1 1 auto; display: flex; flex-direction: column;
    min-width: 0; min-height: 0; background: #fff;
  }
  .stage {
    display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: #fff;
  }
  #home:not([hidden]) {
    display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden;
  }
  .topbar {
    display: flex; align-items: center; gap: 8px;
    height: 64px; min-height: 64px; padding: 0 8px; flex: none;
    border-bottom: 1px solid var(--line); background: #fff;
  }
  button.panel-btn {
    width: 32px; height: 32px; min-height: 32px; padding: 0;
    background: transparent; color: var(--muted); box-shadow: none;
  }
  button.panel-btn:hover { background: var(--side-accent); box-shadow: none; }
  .topbar-rule { width: 1px; height: 16px; background: var(--side-line); flex: none; }
  .crumb { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; color: #495057; font-size: 14px; }
  button.crumb-link { min-height: 32px; padding: 0; background: transparent; color: #495057; font-weight: 400; }
  button.crumb-link:hover { background: transparent; color: var(--fg); }
  .crumb-sep { color: var(--muted); }
  .crumb-current { color: var(--fg); font-weight: 500; }
  .main {
    display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0;
    overflow-x: clip; overflow-y: auto; padding: 16px 16px 48px;
  }
  .main:has(#chat:not([hidden])) { overflow: hidden; }
  #overview h2 { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
  #overview p, #status, #loading, #read-note { color: var(--muted); }
  #connector-split { margin: 0; max-width: 40rem; font-size: 14px; line-height: 1.4; }
  #overview #tools-label { margin: 4px 0 8px; color: var(--fg); font-size: 16px; font-weight: 600; }
  #connector-who:empty, #slack-note:empty, #chat-purpose:empty, #tools-note:empty, #connector-split:empty { display: none; }
  #status:empty, #read-note:empty { display: none; }
  .connectors {
    align-self: stretch; width: 100%; max-width: 40rem; margin: 0 0 12px;
    border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden;
  }
  .conn {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 44px; padding: 12px 12px 12px 16px; border-top: 1px solid var(--line);
  }
  .conn:first-child { border-top: 0; }
  .conn-mark { color: var(--side-fg); flex: 0 0 auto; width: 20px; height: 20px; display: grid; place-items: center; }
  .brand-mark { display: block; width: 20px; height: 20px; }
  #cal-status-row, #lin-status-row, #slack-status-row { flex-wrap: nowrap; }
  .conn-connect { min-height: 36px; padding: 0 12px; box-shadow: inset 0 0 0 1px var(--line); background: #fff; }
  .conn .set-copy { min-width: 0; flex: 1; }
  .conn strong { font-size: 14px; font-weight: 500; color: var(--fg); }
  .conn p { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
  #overview .conn-state { margin: 2px 0 0; font-size: 13px; font-weight: 500; color: var(--muted); }
  #overview .conn-state.off { color: var(--fg); font-size: 16px; font-weight: 700; line-height: 1.15; background: none; padding: 0; }
  .ask-quiet .ask-name { color: var(--fg); font-weight: 500; font-size: 13px; white-space: nowrap; }
  #tools-note { margin: 0 0 4px; max-width: 40rem; font-size: 14px; line-height: 1.4; }
  .conn-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; margin-left: auto; }
  .conn-ask { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; color: var(--fg); font-size: 14px; }
  .conn-ask .ask-name { color: var(--fg); font-weight: 500; font-size: 13px; white-space: nowrap; }
  .conn .switch,
  .room-set .switch {
    width: 44px; height: 44px; margin: 0; padding: 0; flex: 0 0 auto;
    display: grid; place-items: center;
  }
  .conn .switch input,
  .room-set .switch input {
    appearance: none; width: 36px; height: 20px; margin: 0; padding: 0;
    border-radius: 999px; background: #e2e8f0; box-shadow: inset 0 0 0 1px var(--line);
    position: relative; cursor: pointer;
  }
  .conn .switch input::before,
  .room-set .switch input::before {
    content: ""; position: absolute; width: 16px; height: 16px; border-radius: 50%;
    background: #fff; top: 1px; left: 1px; box-shadow: 0 1px 2px rgba(2, 8, 23, 0.24);
  }
  .conn .switch input:checked,
  .room-set .switch input:checked { background: var(--primary); box-shadow: none; }

  .conn .switch input:checked::before,
  .room-set .switch input:checked::before { left: 19px; background: #fff; }
  .ask-state { display: inline; margin: 0; color: var(--fg); font-size: 13px; font-weight: 600; }
  .ask-tool { display: inline; }
  .ask-quiet .switch input:checked { background: #fff; box-shadow: inset 0 0 0 1.5px #64748b; }
  .ask-quiet .switch input:checked::before { background: #1e293b; left: 19px; box-shadow: none; }
  .name-field.name-needed input { box-shadow: 0 0 0 2px #2563eb; }
  .name-field.name-needed .name-purpose { color: var(--fg); font-weight: 500; }
  #ask-help, #custom-how, #record .ledger, #join-hint, #join-ready { max-width: 40rem; font-size: 13px; color: var(--muted); }
  #custom-how { margin: 8px 0 0; }
  #ask-block .ask-kicker, #hearing-block .hearing-kicker { margin: 0; padding: 12px 16px 0; border-top: 0; background: #fff; font-size: 13px; font-weight: 600; color: var(--fg); }
  #hearing-help { margin: 4px 16px 0; font-size: 14px; line-height: 1.45; }
  .hearing-field { display: flex; flex-direction: column; align-items: stretch; gap: 4px; margin: 12px 16px 0; }
  .hearing-field label { font-size: 14px; font-weight: 600; color: var(--fg); }
  .hearing-field p { margin: 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
  #hearing-triggers { min-height: 5.5rem; resize: vertical; }
  #hearing-note { margin: 8px 16px 0; font-size: 13px; }
  #hearing-note:empty { display: none; }
  #hearing-block .section-next { margin: 12px 16px 16px; }
  #ask-block #ask-help { margin: 0; padding: 4px 16px 10px; border: 0; background: #fff; color: var(--muted); }
  .ask-name { font-size: 13px; font-weight: 500; color: var(--fg); }
  #ask-block { display: flex; flex-direction: column; }
  #cal-conn, #lin-conn { white-space: nowrap; }
  #cal-ask-row, #lin-ask-row {
    justify-self: stretch; min-height: 44px; background: #fff; flex-wrap: nowrap;
  }
  #join-ready { margin: 8px 0; font-size: 14px; font-weight: 500; color: var(--fg); }
  #join-ready.off { color: var(--fg); }
  #create-dialog .panel { width: min(26rem, 100%); }
  #meet-form #join-submit,
  #channel-door #channel-connectors { width: 100%; }
  #join-submit:disabled,
  #join-submit:disabled:hover {
    background: #f8fafc; color: #64748b; box-shadow: inset 0 0 0 1px #cbd5e1; cursor: default;
  }
  .section-next { margin: 4px 0 0; }
  .talk-panel:has(#chat-empty:not([hidden])) .section-next { margin: 0; padding: 0 16px 16px; }
  #read-again { align-self: flex-start; }
  .rail-wrap {
    position: relative; z-index: 3;
    display: flex; flex-direction: column; flex: 0 0 auto;
    min-width: 0; margin: 0; padding: 8px 0 0;
    background: var(--sidebar); border-bottom: 1px solid var(--side-line);
  }
  .rail-head { position: relative; z-index: 2; display: flex; align-items: center; min-width: 0; padding: 4px 8px 0; }
  .rail-scroll { display: contents; }
  .rail { position: relative; z-index: 1; display: flex; flex-wrap: nowrap; gap: 2px; overflow-x: auto; min-width: 0; padding: 4px 8px 8px; }
  .rail-nudge {
    display: none; flex: 0 0 auto; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 0 8px; white-space: nowrap;
    background: var(--sidebar); color: var(--side-fg); font-size: 13px; font-weight: 500;
    box-shadow: none;
  }
  .rail-nudge { background: transparent; border-radius: 6px; }
  #rail-next::after { content: "›"; margin-left: 4px; }
  #rail-prev svg { display: none; }
  #rail-prev::after { content: " ›"; }
  .rail-nudge:hover { background: #e4e4e7; box-shadow: none; }
  .rail-foot {
    display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0;
    margin-top: 8px; padding: 8px 8px 12px; border-top: 1px solid var(--side-line);
  }
  .name-row { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  #name-cue { flex: 1 0 100%; margin: 0 0 2px; color: var(--fg); font-size: 13px; font-weight: 600; line-height: 1.3; }
  button.user-btn {
    width: 44px; height: 44px; min-height: 44px; padding: 0; flex: 0 0 auto;
    background: transparent; color: #495057; box-shadow: none;
  }
  button.user-btn:hover { background: var(--side-accent); box-shadow: none; }
  .rail-label { margin: 0; padding: 14px 8px 4px; color: var(--muted); font-size: 12px; font-weight: 500; }
  .rail-label:first-child { padding-top: 8px; }
  .rail button {
    flex: 0 0 auto; justify-content: flex-start; gap: 8px;
    min-height: 32px; background: transparent; color: var(--side-fg); font-weight: 400; font-size: 14px;
    padding: 4px 8px; border-radius: 6px;
  }
  .rail button .ic { color: var(--side-fg); }
  .rail button:hover { background: var(--side-accent); }
  .rail button.wait,
  .rail button.wait .ic { color: var(--muted); }
  .rail button[aria-current="page"] { background: var(--side-accent); color: #2563eb; font-weight: 500; }
  .rail button[aria-current="page"] .ic { color: #2563eb; }
  .rail button[aria-disabled="true"],
  .rail button[aria-disabled="true"]:hover {
    background: transparent; color: var(--muted); cursor: default;
  }
  .rail button[aria-disabled="true"] .ic { color: var(--muted); }
  .name-field {
    display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "label field" ". purpose";
    column-gap: 12px; row-gap: 6px; align-items: center;
    flex: 1; width: auto; margin: 0; min-width: 0;
    color: #495057; font-size: 12px; font-weight: 400; line-height: 1.2;
  }
  .name-label { grid-area: label; color: var(--fg); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .name-purpose {
    grid-area: purpose; justify-self: start; min-width: 0;
    color: #334155; font-size: 13px; font-weight: 500; line-height: 1.3;
    white-space: normal;
  }
  .name-field input {
    grid-area: field; min-height: 44px; height: 44px; padding: 4px 8px;
    color: var(--fg); font-size: 14px; font-weight: 600;
    background: #fff; border: 0; border-radius: 6px; box-shadow: var(--ring);
  }
  .name-field input::placeholder { color: var(--muted); font-weight: 400; }
  .name-field input:focus-visible { outline-offset: 0; }
  .counts { display: flex; flex-wrap: wrap; gap: 16px 20px; margin: 0; background: transparent; box-shadow: none; }
  .counts .count {
    display: inline-flex; align-items: baseline; gap: 6px;
    width: auto; margin: 0; min-height: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent; box-shadow: none;
    color: var(--muted); font-size: 14px; white-space: nowrap; text-align: left;
  }
  .counts .count strong { color: var(--fg); font-weight: 600; }
  button.count { min-height: 44px; }
  .counts .attention, .counts .attention strong { color: var(--amber); }
  .home-tools {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 12px 16px;
    margin: 0 0 12px;
  }
  .home-empty {
    display: flex; align-items: center; gap: 12px; flex: 0 1 auto; min-width: 0; margin: 0;
    color: var(--fg); font-size: 14px;
  }
  .home-empty .empty-mark { width: 32px; height: 32px; margin: 0; flex: 0 0 auto; }
  .page-title { margin: 0 0 12px; font-size: 20px; font-weight: 600; color: var(--fg); }
  .home-empty p { margin: 0; color: var(--muted); }
  .home-tools:not(:has(#home-stats:not([hidden]), #home-empty:not([hidden]), #new-room:not([hidden]))) { display: none; }
  .main:has(#home-empty:not([hidden])) { justify-content: flex-start; }
  .main:has(#home-empty:not([hidden])) #home-title { align-self: flex-start; }
  .main:has(#home-empty:not([hidden])) .home-tools {
    flex: 1; flex-direction: column; align-items: center; text-align: center;
    justify-content: center; width: min(100%, 32rem); min-height: 0; margin-inline: auto;
    padding: 0; border: 0; background: transparent;
  }
  .main:has(#home-empty:not([hidden])) .home-empty { flex-direction: column; gap: 16px; }
  .main:has(#home-empty:not([hidden])) .home-empty .empty-mark { width: 48px; height: 48px; }
  .main:has(#home-empty:not([hidden])) .home-empty .empty-mark svg { width: 40px; height: 40px; }
  .main:has(#home-empty:not([hidden])) .home-empty p { color: var(--fg); font-size: 24px; font-weight: 500; line-height: 1.25; text-wrap: balance; }
  .main:has(#home-empty:not([hidden])) .home-empty .empty-aside { color: var(--muted); font-size: 14px; font-weight: 400; line-height: 1.4; }
  #home-empty-aside:empty { display: none; }
  .main:has(#record:not([hidden]) .empty-mark:not([hidden])),
  .main:has(#history:not([hidden]) #history-empty:not([hidden])),
  .main:has(#people:not([hidden]) #people-empty:not([hidden])) { justify-content: center; }
  .rail-end { flex: 0 0 auto; width: 0; height: 1px; }
  #home-stats { flex: 1 1 auto; min-width: 0; margin-right: auto; }
  .rooms-bar {
    display: flex; justify-content: flex-end; align-items: center;
    min-height: 44px; margin: 0; flex: none;
  }
  .rooms-bar:has(#new-room[hidden]) { display: none; }
  .explorer { max-width: 100%; overflow: hidden; background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: none; }
  .explorer-head, button.room {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 0.8fr);
    align-items: center; gap: 16px; padding: 12px 16px;
  }
  .explorer-head {
    min-height: 40px; color: var(--muted); font-size: 14px; font-weight: 500;
    border-bottom: 1px solid var(--line);
  }
  #room-list { display: block; }
  button.room {
    width: 100%; min-height: 44px; border: 0; border-bottom: 1px solid var(--line);
    border-radius: 0; background: #fff; font-weight: 400; text-align: left; justify-content: stretch;
  }
  button.room:last-child { border-bottom: 0; }
  button.room:hover { background: var(--sidebar); }
  button.room:focus-visible { outline-offset: -2px; }
  .ex-room, .ex-plat, .ex-heard, .ex-bot { min-width: 0; }
  .ex-room { display: flex; flex-direction: column; align-items: flex-start; }
  .ex-room strong { font-size: 14px; font-weight: 500; }
  .ex-count, .ex-none, .where { color: var(--muted); font-size: 13px; }
  .ex-plat { display: inline-flex; align-items: center; gap: 8px; }
  .room-mark {
    width: 18px; height: 18px; border-radius: 4px; flex: 0 0 auto;
    display: inline-grid; place-items: center;
    color: #fff; font-size: 11px; font-weight: 700; line-height: 1;
  }
  #room-empty { margin: 0; min-height: 280px; padding: 48px 24px; text-align: center; color: var(--muted); }
  #room-empty:not([hidden]) {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  }
  #room-empty .empty-mark { width: 32px; height: 32px; margin: 0; }
  #room-empty .empty-mark svg { width: 28px; height: 28px; }
  .explorer-foot { margin: 0; min-height: 48px; padding: 8px 16px; border-top: 1px solid var(--line); color: #495057; font-size: 14px; }
  .faces { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .face, .more, .bot { width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; flex: 0 0 auto; }
  .face { color: #fff; font-size: 11px; font-weight: 700; }
  .more { color: var(--fg); background: var(--sidebar); font-size: 12px; box-shadow: var(--ring); }
  .bot { background: var(--ink); position: relative; }
  .bot::before { content: ""; width: 12px; height: 2px; background: #fff; box-shadow: 0 4px 0 #fff; }
  .bot-line { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .t0 { background: #4338ca; } .t1 { background: #0e7490; } .t2 { background: #0f6b3a; } .t3 { background: #b45309; }
  .t4 { background: #b91c1c; } .t5 { background: #7048e8; } .t6 { background: #1864ab; } .t7 { background: #be185d; }
  #history-list, #record-list, #people-list, #file-decisions, #file-waiting {
    background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: none; overflow: hidden;
  }
  #history-list:empty, #record-list:empty, #people-list:empty, #file-decisions:empty, #file-waiting:empty { border: 0; box-shadow: none; }
  button.card, .row-button {
    display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
    width: 100%; margin: 0; padding: 10px 12px;
    border: 0; border-bottom: 1px solid var(--line); border-radius: 0;
    background: #fff; text-align: left; font-weight: 400;
  }
  button.card:last-child, .row-button:last-child { border-bottom: 0; }
  button.card:hover, .row-button:hover { background: var(--sidebar); }
  button.card strong { font-weight: 500; }
  button.card p, .row-button { color: var(--fg); }
  button.card p { margin: 2px 0 0; color: var(--muted); }
  #people-list .card {
    display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px;
    padding: 10px 12px; border-bottom: 1px solid var(--line);
  }
  #people-list .card:last-child { border-bottom: 0; }
  #people-list .card p { margin: 0; }
  .people-note { margin: 0; max-width: 40rem; color: var(--muted); font-size: 13px; }
  #chat:not([hidden]) { flex: 1; display: flex; flex-direction: column; min-height: 0; width: 100%; }
  .talk-panel {
    flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column;
    border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; box-shadow: none;
  }
  .thread {
    flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column;
    gap: 8px; padding: 16px 16px 8px;
  }
  #chat-empty { margin: 0; color: var(--muted); font-size: 14px; font-weight: 400; }
  #chat-empty:not([hidden]) {
    display: flex; align-items: center; gap: 8px; padding: 8px 0;
  }
  #chat-empty .empty-mark { width: 28px; height: 28px; margin: 0; color: var(--muted); }
  #chat-purpose { margin: 0; color: var(--muted); font-size: 13px; }
  #chat-purpose:empty { display: none; }
  .chat-turn { margin: 0; display: flex; padding: 0; background: transparent; }
  .chat-you { justify-content: flex-end; }
  .chat-bot { justify-content: flex-start; }
  .chat-turn strong {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  .chat-body {
    min-width: 0; max-width: min(36rem, 85%);
    display: flex; flex-direction: column; gap: 4px;
    padding: 10px 14px; line-height: 1.45;
  }
  .chat-you .chat-body { background: var(--primary); color: #fff; border-radius: 16px 16px 4px 16px; }
  .chat-bot .chat-body { background: var(--sidebar); color: var(--fg); border-radius: 16px 16px 16px 4px; }
  .chat-body > span { white-space: pre-wrap; }
  .chat-you .chat-detail { color: rgba(255, 255, 255, 0.82); }
  .chat-bot .chat-detail { color: var(--muted); font-size: 13px; }
  #chat-next-row { margin: 0; padding: 0 16px 8px; }
  #chat-next-row:has(#chat-next[hidden]) { display: none; }
  #chat-form {
    display: flex; flex-direction: row; align-items: flex-end; gap: 8px;
    margin: 0; padding: 12px; border-top: 1px solid var(--line); background: #fff;
  }
  #chat-form[hidden] { display: none; }
  #chat-form label { flex: 1; min-width: 0; }
  #chat-form button { flex: 0 0 auto; min-width: 4.5rem; }
  #history .choices {
    display: inline-flex; width: auto; gap: 2px; margin: 0 0 8px; padding: 2px;
    background: var(--side-accent); border-radius: 8px;
  }
  #history .choices button { width: auto; background: transparent; box-shadow: none; border-radius: 6px; }
  #history .choices button[aria-pressed="true"] { background: #fff; color: var(--fg); box-shadow: none; font-weight: 600; }
  .record-board { display: grid; gap: 16px; align-items: start; max-width: 40rem; }
  #record:not([hidden]), #history:not([hidden]), #people:not([hidden]) {
    display: flex; flex-direction: column; align-items: flex-start; gap: 12px; min-width: 0;
  }
  #record:not([hidden]):has(.empty-mark:not([hidden])),
  #history:not([hidden]):has(#history-empty:not([hidden])),
  #people:not([hidden]):has(#people-empty:not([hidden])) {
    align-items: stretch; text-align: left; width: 100%; margin: 0; padding: 0;
    border: 0; background: transparent; min-height: 0; flex: 1; justify-content: flex-start;
  }
  #history:not([hidden]):has(#history-empty:not([hidden])) .choices { align-self: flex-start; }
  #history-empty:not([hidden]) {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    font-size: 16px; font-weight: 500; color: var(--fg);
  }
  #history-empty .empty-mark { width: 40px; height: 40px; margin: 0; }
  #history:not([hidden]):has(#history-empty:not([hidden])) #history-empty,
  #people:not([hidden]):has(#people-empty:not([hidden])) #people-empty,
  #record:not([hidden]):has(.empty-mark:not([hidden])) .ledger,
  #history:not([hidden]):has(#history-empty:not([hidden])) .section-next,
  #people:not([hidden]):has(#people-empty:not([hidden])) .section-next,
  #record:not([hidden]):has(.empty-mark:not([hidden])) .section-next {
    align-self: center; text-align: center; max-width: 28rem; text-wrap: balance;
  }
  #history:not([hidden]):has(#history-empty:not([hidden])) #history-empty,
  #people:not([hidden]):has(#people-empty:not([hidden])) #people-empty,
  #record:not([hidden]):has(.empty-mark:not([hidden])) .empty-mark { margin-top: auto; align-self: center; }

  #history:not([hidden]):has(#history-empty:not([hidden])) .section-next,
  #people:not([hidden]):has(#people-empty:not([hidden])) .section-next,
  #record:not([hidden]):has(.empty-mark:not([hidden])) .section-next { margin-bottom: auto; }

  #record:not([hidden]):has(.empty-mark:not([hidden])) .ledger { font-size: 16px; font-weight: 500; color: var(--fg); }
  #people-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  #people-empty .empty-aside { color: var(--muted); font-size: 14px; font-weight: 400; }
  #history-list, #people-list, .record-board { width: 100%; }
  #record:not([hidden]) h2, #history:not([hidden]) h2, #people:not([hidden]) h2, #chat:not([hidden]) h2 { margin-bottom: 0; }
  #record-detail { margin: 0; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: none; }
  #record-detail:empty { display: none; }
  #decision-file, #decision-epoch, .file-mark { font-family: var(--mono); }
  #file-proof { margin: 0; color: var(--muted); font-size: 13px; }
  #file-action-note:empty, #file-proof:empty { display: none; }
  #personal-notes { width: 100%; }
  #personal-empty { color: var(--muted); }
  #personal-list { width: 100%; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
  #personal-list:empty { display: none; }
  body.dialog-open { overflow: hidden; }
  .dialog { position: fixed; inset: 0; z-index: 6; display: grid; place-items: end center; padding: 12px; }
  .dialog[hidden] { display: none; }
  #file-dialog.dialog {
    position: static; z-index: auto; display: block; padding: 0; background: transparent;
  }
  #file-dialog .shade { display: none; }
  #file-dialog .panel {
    width: min(100%, 46rem); max-height: none; box-shadow: none;
    border: 1px solid var(--line); border-radius: 8px;
  }
  .shade { position: absolute; inset: 0; background: rgba(33, 37, 41, 0.92); }
  #workspace-dialog { place-items: start start; padding: 72px 0 0 8px; }
  #workspace-dialog .shade { background: transparent; }
  #workspace-dialog .panel { width: 240px; }
  .panel {
    position: relative; width: min(40rem, 100%);
    max-height: min(85dvh, 44rem); min-height: 0;
    display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border-radius: 8px; box-shadow: var(--ring);
  }
  .panel-bar {
    flex: 0 0 auto; display: flex; justify-content: space-between; align-items: flex-start;
    gap: 12px; background: #fff; padding: 8px 8px 8px 16px;
    border-bottom: 1px solid var(--line);
  }
  .panel-bar h2 { margin: 8px 0; font-size: 16px; font-weight: 600; line-height: 1.3; flex: 1; min-width: 0; }
  .panel-body { overflow: auto; min-height: 0; overscroll-behavior: contain; padding: 16px 16px 24px; }
  .panel-body > h3:first-child { margin-top: 0; }
  .file-bar h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.25; }
  .file-name { min-width: 0; flex: 1; padding: 6px 0; }
  .file-lead-bar {
    flex: 0 0 auto; padding: 8px 16px; background: #fff;
    border-bottom: 1px solid var(--line);
  }
  .file-lead-bar:not(:has(#file-lead-status:not([hidden]), #file-proof:not([hidden]))) { display: none; }
  #file-kind, #file-lead-status, #decision-state { margin: 0 0 2px; color: var(--muted); font-size: 12px; }
  #file-lead-status, #decision-state { font-size: 14px; color: #495057; }
  .lead, #decision-sentence { font-size: clamp(1.25rem, 2.4vw, 1.5rem); font-weight: 500; line-height: 1.3; margin: 0; color: var(--fg); }
  .panel .close { position: static; flex: 0 0 auto; }
  .panel-body > .switch { margin-top: 16px; }
  .choices { display: grid; gap: 4px; margin: 12px 0; padding: 4px; background: var(--side-accent); border-radius: 10px; }
  .choices button { width: 100%; background: transparent; box-shadow: none; color: var(--fg); font-weight: 500; }
  .choices button:hover { background: transparent; box-shadow: none; }
  .choices button[aria-pressed="true"],
  .choices button[aria-pressed="true"]:hover { background: #fff; color: var(--ink); box-shadow: var(--ring); font-weight: 600; }
  .switch { display: flex; gap: 10px; align-items: center; min-height: 44px; }
  .room-set {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    margin-top: 8px; padding: 4px 12px; border-radius: 8px; background: var(--sidebar);
  }
  .room-set .set-copy { min-width: 0; flex: 1; }
  .room-set .set-copy p { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
  .room-set .set-copy p:empty { display: none; }

  .voices {
    display: inline-flex; width: auto; flex: none; gap: 2px; margin: 0; padding: 2px;
    background: var(--side-accent); border-radius: 8px;
  }
  .voices button { width: auto; min-height: 44px; padding: 0 12px; background: transparent; box-shadow: none; border-radius: 6px; }
  .voices button[aria-pressed="true"] { background: #fff; color: var(--fg); box-shadow: none; font-weight: 600; }
  .voices button:hover, #history .choices button:hover { box-shadow: none; }
  .voices button[aria-pressed="true"]:hover, #history .choices button[aria-pressed="true"]:hover { background: #fff; }
  .file-ledger { margin-top: 16px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: none; background: #fff; }
  .ledger-row {
    display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: start;
    padding: 10px 12px; border-top: 1px solid var(--line);
  }
  .ledger-row:first-child { border-top: 0; }
  .ledger-k, .ledger-row h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); }
  .ledger-row:has(#outside-heading[hidden]) { display: none; }
  .file-ledger:not(:has(#waiting-row:not([hidden]), #outside-heading:not([hidden]))) { display: none; }
  .file-ledger #file-waiting, .file-ledger #file-outside { background: transparent; border: 0; box-shadow: none; border-radius: 0; }
  .file-ledger .card { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .file-ledger .card p { margin: 0; flex: 1 0 100%; }
  .sr {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  #status, #join-status, #room-edit-note { color: var(--muted); }
  .tile { text-align: left; }
  #file-files { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; max-width: 100%; }
  #file-files .tile, button.tile {
    display: flex; width: 100%; justify-content: flex-start; align-items: center; gap: 12px; margin: 0; max-width: 100%;
    min-height: 64px; padding: 10px 12px; border-radius: 8px; background: #fff; box-shadow: var(--ring);
    text-align: left; font-weight: 400;
  }
  button.tile:hover { box-shadow: var(--ring-hover); }
  #file-files .tile span:last-child { overflow-wrap: anywhere; }
  .file-mark {
    min-width: 1.75rem; height: 1.75rem; padding: 0 0.2rem;
    display: inline-grid; place-items: center;
    color: #fff; background: #212529; font-weight: 700; font-size: 11px; border-radius: 4px; flex: 0 0 auto;
  }
  @media (max-width: 639px) {
    .explorer-head { display: none; }
    button.room { grid-template-columns: minmax(0, 1fr); align-items: start; padding: 12px; }
    .ex-plat:empty, .ex-bot:empty { display: none; }
    .panel-bar { flex-wrap: wrap; }
    .panel-bar .close { order: 1; margin-left: auto; }
    .file-name, .panel-bar > h2 { order: 2; flex: 1 0 100%; }
    .room-set, .conn { flex-wrap: wrap; }
    .ledger-row { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 959px) {
    .rail-wrap { display: contents; }
    .rail-head { order: 1; background: var(--sidebar); }
    .rail-scroll { order: 2; background: var(--sidebar); }
    .stage { order: 3; overflow: hidden; }
    .rail-foot { order: 4; position: relative; z-index: 2; background: var(--sidebar); border-top: 1px solid var(--side-line); }
    .main { padding-bottom: 24px; }
    .rail-label {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    #rail-toggle, .topbar-rule { display: none; }
    .topbar { padding-left: 16px; }
    .rail-scroll { display: flex; align-items: stretch; min-width: 0; }
    .rail-nudge:not([hidden]) { display: inline-flex; }
  .rail-nudge svg { display: block; margin-right: 6px; }
  }
  @media (max-width: 719px) {
    .topbar { height: 48px; min-height: 48px; }
    .notices { margin: 12px 16px 0; }
    .rail { gap: 4px; }
    #overview .conn { min-height: 44px; padding-top: 0; padding-bottom: 0; }
    #overview #cal-status-row,
    #overview #lin-status-row,
    #overview #slack-status-row { min-height: 44px; padding-top: 4px; padding-bottom: 4px; }
    #ask-block { margin-top: 0; margin-bottom: 0; }
    #ask-block .ask-kicker { padding-top: 8px; }
    #ask-block #ask-help { padding: 4px 16px 8px; }
    .connectors { margin-bottom: 0; }
    #overview > .connectors + #ask-block { margin-top: 8px; }
    .notices { margin: 8px 16px 0; }
    .rail-scroll { padding-left: 8px; }
    #rail-prev { background: #fff; border-radius: 999px; box-shadow: inset 0 0 0 1px var(--line); }
    #overview #cal-ask-row,
    #overview #lin-ask-row { min-height: 44px; padding-top: 0; padding-bottom: 0; }
    #status-title { margin: 4px 16px 0; }
    .notices { margin-top: 0; }
    .notices .setup-label { padding: 2px 16px 0; }
    #overview #tools-label { margin-bottom: 2px; }
    #meet-block, #slack-block { padding: 0 16px 4px; }
    #tools-note { margin-bottom: 4px; }
    body:has(#overview:not([hidden])) .topbar { display: none; }
    #overview > #ask-help { margin: 0; padding: 0 2px; color: var(--fg); font-weight: 500; }
    #workspace-dialog { padding: 64px 16px 0; }
    #workspace-dialog .panel { width: min(240px, 100%); }
    .rail button {
      width: auto; min-width: 44px; min-height: 44px;
      padding: 8px 12px; justify-content: flex-start; font-size: 14px;
      white-space: nowrap;
    }
    .rail button .ic { font-size: 14px; }
    .rail-foot { align-items: center; padding: 8px 16px 8px; }
    .rail-foot > #ask-help { flex: 1 0 100%; margin: 0 0 6px; padding: 0; color: var(--fg); font-weight: 500; }
  }
  @media (min-width: 640px) {
    .notices { margin: 16px 20px 0; }
    .main { padding: 16px 20px 48px; }
    .choices { grid-template-columns: 1fr 1fr; }
    .dialog { place-items: center; }
  }
  @media (min-width: 960px) {
    .shell {
      display: grid;
      grid-template-columns: 256px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .rail-wrap {
      min-height: 0; height: 100%;
      padding: 8px 0 0; border-bottom: 0; border-right: 1px solid var(--side-line);
    }
    .name-field {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "label" "field" "purpose";
    }
    .rail {
      flex: 1 1 auto; flex-direction: column; overflow-x: hidden; overflow-y: auto; min-height: 0;
    }
    .rail-nudge { display: none !important; }
    .rail-foot { margin-top: 12px; }
    body.rail-collapsed .shell { grid-template-columns: 48px minmax(0, 1fr); }
    body.rail-collapsed .brand-row { flex-direction: column; align-items: center; gap: 4px; }
    body.rail-collapsed .brand-row h1,
    body.rail-collapsed .ws-copy,
    body.rail-collapsed .name-field,
    body.rail-collapsed .rail-label,
    body.rail-collapsed button.chip .ic {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    body.rail-collapsed button.chip { width: 32px; height: 32px; min-height: 32px; padding: 0; justify-content: center; }
    body.rail-collapsed .brand-row,
    body.rail-collapsed .rail-foot,
    body.rail-collapsed .rail button { justify-content: center; }
    body.rail-collapsed .rail button { width: 32px; font-size: 0; padding-left: 0; padding-right: 0; }
    body.rail-collapsed .rail button .ic { font-size: 14px; }
    .record-board { max-width: 40rem; }
  }

</style>
</head>
<body>
<div class="shell">
  <div class="rail-wrap">
    <div class="rail-head">
      <div class="brand-row">
      <h1>Sederunt</h1>
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
      </div>
    </div>
    <div class="rail-scroll">
    <button id="rail-prev" class="rail-nudge" type="button" hidden aria-label="More items: Home, Rooms, and History"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10"/></svg>Home and Rooms</button>
    <nav class="rail" aria-label="Workspace">
      <p class="rail-label">Platform</p>
      <button type="button" data-show="home" aria-disabled="true">${homeIcon}Home</button>
      <button type="button" data-show="rooms" aria-disabled="true">${roomsIcon}Rooms</button>
      <button type="button" data-show="history" aria-disabled="true">${historyIcon}History</button>
      <button type="button" data-show="record" aria-disabled="true">${recordIcon}Decisions</button>
      <button type="button" data-show="chat" aria-disabled="true">${chatIcon}Chat</button>
      <button type="button" data-show="people" aria-disabled="true">${peopleIcon}People</button>
      <p class="rail-label">Status</p>
      <button id="show-connectors" type="button" aria-disabled="true">${plugIcon}Status</button>
    </nav>
    <button id="rail-next" class="rail-nudge" type="button" hidden aria-label="More in the workspace">More</button>
    </div>
    <div class="rail-foot">
      <p id="name-cue" hidden>Enter your name to use this list.</p>
      <div id="name-row" class="name-row">
      <button id="member-open" class="user-btn" type="button" aria-label="Your name">${userIcon}</button>
      <label class="name-field">
        <span class="name-label">Your name</span>
        <input id="member" name="member" autocomplete="name" placeholder="Enter your name" aria-describedby="name-purpose">
        <span id="name-purpose" class="name-purpose">For history and changes.</span>
      </label>
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
    </div>
    <h2 id="status-title" class="page-title" hidden>Status</h2>
    <div class="notices">
      <p id="setup-label" class="setup-label">Rooms</p>
      <button id="setup-toggle" class="setup-toggle" type="button" aria-expanded="false" hidden>Setup is unfinished</button>
      <p id="meet-kicker" class="setup-label" hidden>Meeting</p>
${meet}
      <p id="channel-kicker" class="setup-label" hidden>Channel</p>
${slack}
    </div>
    <section id="onboard">
      <h2 class="page-title">Rooms</h2>
      <div class="empty">
        <span class="empty-mark" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6.2A1.2 1.2 0 0 1 5.2 5h7.1A1.2 1.2 0 0 1 13.5 6.2V21"/><path d="M13.5 10.2h4.3A1.2 1.2 0 0 1 19 11.4V21"/><path d="M3 21h18"/><path d="M7.2 8.4h2.6M7.2 12h2.6M7.2 15.6h2.6"/></svg></span>
        <h2 class="sr">Onboard</h2>
        <h2 id="onboard-heading">No meeting or channel is in use</h2>
        <p id="onboard-reading">Reading the account.</p>
        <p id="onboard-missing" hidden>The company account is not loaded. Add the delegate outside this page, then restart.</p>
        <p id="onboard-ready" hidden>A room appears when a meeting or a channel is in use.</p>
        <p id="onboard-next" hidden>Meeting and Channel were not turned on when Sederunt started.</p>
        <button id="open-connectors" type="button" hidden>Go to Status</button>
        <button id="continue" type="button">Go to Home</button>
        <div id="onboard-doors"></div>
      </div>
    </section>
    <div id="home" hidden>
      <div class="main">
    <h2 id="home-title" class="page-title">Home</h2>
    <div class="home-tools">
    <div id="home-empty" class="home-empty" hidden>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span>
      <p id="home-empty-line">No room yet.</p>
      <p id="home-empty-aside" class="empty-aside">A meeting or a channel that keeps a decision adds the room.</p>
    </div>
    <div id="home-stats">
      <div id="counts" class="counts"></div>
    </div>
    <div class="rooms-bar">
      <button id="new-room" class="primary" type="button">${plusIcon}<span class="room-label">New room</span><span class="sr">New room</span></button>
    </div>
    </div>
    <p id="status"></p>
    <p id="loading">Reading the account.</p>
    <div id="overview">
      <p id="connector-split"></p>
      <p id="tools-label">Tools</p>
      <p id="tools-note">Not connected means the tool is not available to Sederunt. Connect opens that product's MCP.</p>
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
      <div class="connectors" id="ask-block">
        <p class="ask-kicker">Before sending a change</p>
        <p id="ask-help">On waits for a confirm. Off sends the change.</p>
        <div class="conn ask-quiet" id="cal-ask-row">
          <div class="set-copy"><span class="ask-name">Ask first</span><span class="ask-tool"> for Calendar</span></div>
          <div class="conn-ask"><span class="ask-state">Waits</span><label class="switch"><input id="cal-ask" type="checkbox" checked aria-describedby="ask-help"><span class="sr">Ask first for Calendar</span></label></div>
        </div>
        <div class="conn ask-quiet" id="lin-ask-row">
          <div class="set-copy"><span class="ask-name">Ask first</span><span class="ask-tool"> for Linear</span></div>
          <div class="conn-ask"><span class="ask-state">Waits</span><label class="switch"><input id="lin-ask" type="checkbox" checked aria-describedby="ask-help"><span class="sr">Ask first for Linear</span></label></div>
        </div>
      </div>
      <div class="connectors" id="hearing-block">
        <p class="hearing-kicker">Meeting guest</p>
        <p id="hearing-help">The guest uses this name in the meeting. A line is kept when someone says the name, or one of the trigger words or sentences.</p>
        <div class="hearing-field">
          <label for="hearing-name">Name</label>
          <p>Shown on the guest's camera.</p>
          <input id="hearing-name" name="hearing-name" maxlength="40" value="Maple" autocomplete="off">
        </div>
        <div class="hearing-field">
          <label for="hearing-triggers">Triggers</label>
          <p>One word or sentence on each line.</p>
          <textarea id="hearing-triggers" name="hearing-triggers" rows="3" placeholder="keep this"></textarea>
        </div>
        <p class="section-next"><button id="hearing-save" type="button">Save the guest</button></p>
        <p id="hearing-note"></p>
      </div>
      <p id="connector-who"></p>
      <p id="custom-how" class="sr">A tool other than Calendar, Linear, or Slack cannot be connected from this page.</p>
      <p id="prefs" class="sr">Calendar is on Ask. Linear is on Ask.</p>
    </div>
    <section id="rooms">
      <div class="explorer">
        <div class="explorer-head">
          <span>Room</span>
          <span>Platform</span>
          <span>Speakers</span>
          <span>Waiting</span>
        </div>
        <p id="room-empty" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/></svg></span>No room yet. Bring Sederunt into a meeting or a channel.</p>
        <div id="room-list"></div>
        <p id="room-foot" class="explorer-foot" hidden></p>
      </div>
      <div id="personal-notes" hidden>
        <p id="personal-empty">A private note is not a room.</p>
        <div id="personal-list"></div>
      </div>
    </section>
    <section id="history" hidden>
      <h2 class="page-title">History</h2>
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
      <p id="history-empty" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4.6"/><path d="M8 5.6V8l1.7 1.1"/></svg></span><span id="history-line">No company history yet. Questions and decisions from a room show up here.</span></p>
      <p class="section-next"><button id="history-next" class="primary" type="button" hidden>New room</button></p>
      <div id="history-list"></div>
    </section>
    <section id="chat" hidden>
      <h2 class="page-title">Chat</h2>
      <div class="talk-panel">
        <div class="thread" id="chat-log">
          <p id="chat-empty"><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 3.4h10.8v6.4H6.2L2.6 12.6V3.4Z"/></svg></span>Ask what was decided.<span class="sr">Nothing has been asked here yet.</span></p>
          <p id="chat-purpose"></p>
        </div>
        <p id="chat-next-row" class="section-next"><button id="chat-next" class="primary" type="button">New room</button></p>
        <form id="chat-form">
          <label><span class="sr">Ask the workspace</span><textarea id="chat-text" name="chat" placeholder="Ask about a room's decision"></textarea></label>
          <button class="primary" type="submit">Ask</button>
        </form>
      </div>
    </section>
    <section id="record" hidden>
      <h2 class="page-title">Decisions</h2>
      <span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.8h10v10.4H3z"/><path d="M5 6h6M5 8.4h6M5 10.8h3.5"/></svg></span>
      <p class="ledger">No decision yet. The decision text from a room shows up here.<span class="sr">The sentence lives in Walrus Memory. This Console tab is the metadata list.</span></p>
      <p class="section-next"><button id="record-next" class="primary" type="button">New room</button></p>
      <div class="record-board">
        <div id="record-list"></div>
        <p id="record-detail"></p>
      </div>
    </section>
    <section id="people" hidden>
      <h2 class="page-title">People</h2>
      <p id="people-empty" hidden><span class="empty-mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.2" r="2.2"/><path d="M3.4 12.6c.7-2 2.4-3 4.6-3s3.9 1 4.6 3"/></svg></span>People from a meeting or a channel show up here.</p>
      <p class="section-next"><button id="people-next" class="primary" type="button" hidden>Open Home</button></p>
      <div id="people-list"></div>
      <p class="people-note">A display name is not an id. The name on a face is a label. It is not the member id.</p>
    </section>
    <div id="file-dialog" class="dialog" hidden role="region" aria-labelledby="file-title">
      <div class="shade" data-close="file-dialog"></div>
      <div class="panel">
        <div class="panel-bar file-bar">
          <div class="file-name">
            <p id="file-kind"></p>
            <h2 id="file-title"></h2>
          </div>
          <button type="button" class="close" data-close="file-dialog" aria-label="Close">${closeIcon}</button>
        </div>
        <div class="file-lead-bar">
          <p id="file-lead" class="lead" hidden></p>
          <p id="file-lead-status"></p>
          <p id="file-proof" hidden></p>
        </div>
        <div class="panel-body">
        <h3>Speakers</h3>
        <div id="file-heard" class="faces"></div>
        <p id="file-present">The meeting has not sent who is there.</p>
        <h3 id="settings-heading">Settings</h3>
        <div class="room-set">
          <div class="set-copy">
            <strong>Ask first</strong>
            <p id="room-edit-note"></p>
          </div>
          <label class="switch"><input id="ask-first" type="checkbox" checked><span class="sr">Ask first</span></label>
        </div>
        <div class="room-set">
          <div class="set-copy">
            <strong>Voice</strong>
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
            <p id="clash-note"></p>
          </div>
          <label class="switch"><input id="raise-clash" type="checkbox"><span class="sr">Raise a clash</span></label>
        </div>
        <h3 id="decisions-heading" hidden>Decisions kept</h3>
        <div id="file-decisions"></div>
        <h3 id="files-heading" hidden>Files</h3>
        <div id="file-files"></div>
        <div class="file-ledger">
          <div class="ledger-row" id="waiting-row" hidden>
            <span class="ledger-k">Waiting</span>
            <div>
              <p id="file-action-note"></p>
              <div id="file-waiting"></div>
            </div>
          </div>
          <div class="ledger-row">
            <h3 id="outside-heading" class="ledger-k" hidden>Not invited</h3>
            <div id="file-outside"></div>
          </div>
        </div>
        </div>
      </div>
    </div>
    <p id="read-note"></p>
    <button id="read-again" type="button" hidden>Read the account again</button>
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
  var workspaceKind = "company";
  var sectionName = "home";
  var returnSection = "home";
  var loadToken = 0;
  var opener = null;

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
      return "Proof is checkpoint " + decision.checkpoint + ", the point in Walrus Memory where this sentence was kept.";
    }
    return "Proof is unknown. The account did not return a checkpoint.";
  }

  function historyBody(decision) {
    var who = decision.speaker || "Someone";
    var status = decision.status || "recorded";
    if (status === "clashing") return who + " kept a sentence that clashes.";
    if (status === "replaced") return who + " kept a sentence that was replaced.";
    if (status === "current") return who + " kept this decision.";
    return who + " kept a recorded sentence.";
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
    node.textContent = connected ? "Connected." : "Not connected.";
    node.className = connected ? "conn-state" : "conn-state off";
    var connectId = id === "cal-conn" ? "cal-connect" : id === "lin-conn" ? "lin-connect" : id === "slack-conn" ? "slack-connect" : "";
    var connect = connectId ? document.getElementById(connectId) : null;
    if (connect) connect.hidden = !!connected;
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
      facts.push(issue ? "Decided: " + pending + " (" + issue + ")" : pending);
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
    return { answer: facts.join("\\n") || "Nothing is stored that you can read.", detail: "" };
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
    return document.getElementById("member").value.trim();
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
    var field = document.querySelector(".name-field");
    var cue = document.getElementById("name-cue");
    var needed = sectionName === "history" && historyScope === "you" && !member();
    placeAskHelp();
    placeNameRow();
    if (field) field.classList.toggle("name-needed", needed);
    var purpose = document.getElementById("name-purpose");
    if (purpose && !member()) purpose.textContent = "For history and changes.";
    var opener = document.getElementById("member-open");
    if (opener) opener.hidden = false;
    if (cue) cue.hidden = true;
    var line = document.getElementById("history-line");
    if (line) line.hidden = false;
    var historyPane = document.getElementById("history");
    if (historyPane) historyPane.classList.toggle("name-wait", needed);
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
    var card = document.createElement("button");
    card.type = "button";
    card.className = "room";
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
    waitCol.textContent = spec.waitingCount ? (String(spec.waitingCount) + " waiting") : "";
    card.append(roomCol, where, heard, waitCol);
    card.addEventListener("click", function () {
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
    waiting.forEach(function (item) { addRoomCard(item); });
    rooms.forEach(function (room) {
      var rows = decisionsFor(room.id);
      var last = rows.length ? rows[rows.length - 1] : null;
      addRoomCard({
        roomId: room.id,
        title: last ? last.text : "No decision yet.",
        where: room.platform || "",
        countLine: rows.length ? roomCount(rows) : "Waiting for the meeting name",
        people: peopleFor(room.id),
        waitingCount: waitingFor(room.id).length
      });
    });
    var total = rooms.length + waiting.length;
    document.getElementById("room-empty").hidden = total > 0;
    syncHomeChrome();
    var foot = document.getElementById("room-foot");
    if (foot) {
      foot.hidden = true;
      foot.textContent = "";
    }
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
      note.className = "sr";
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
    addCount(box, "Decisions kept", counts.kept || 0, "Decisions kept.", null, false);
    addCount(box, "Waiting on you", counts.waiting || 0, counts.waiting ? "Confirm one change" : "Nothing is waiting.", (counts.waiting || 0) > 0 ? openWaitingList : null, (counts.waiting || 0) > 0);
    addCount(box, "Sent", counts.sent || 0, counts.sent ? "The tool accepted it." : "Nothing has been sent.", null, false);
    addCount(box, "Failed", counts.failed || 0, counts.failed ? "A change failed." : "Nothing has failed.", null, false);
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
      if (historyScope === "you" && !member()) historyWords = "Your name identifies later activity from a room. Nothing is here until a room has been in use.";
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
        historyNext.textContent = "Enter your name";
        historyNext.setAttribute("data-act", "name");
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
    document.getElementById("loading").hidden = true;
    if (next.reading) {
      readingTries += 1;
      var missing = document.getElementById("onboard-missing");
      var still = document.getElementById("onboard-reading");
      if (readingTries >= 8) {
        if (still) still.hidden = true;
        if (missing) {
          missing.hidden = false;
          missing.textContent = "The account is taking too long. Read it again.";
        }
        document.getElementById("read-again").hidden = false;
        if (readingTimer) {
          clearTimeout(readingTimer);
          readingTimer = null;
        }
      } else {
        if (missing) missing.hidden = true;
        if (still) still.hidden = false;
        if (!readingTimer) readingTimer = setTimeout(function () { readingTimer = null; load(); }, 1500);
      }
      if (onboard) onboard.hidden = false;
      if (home) home.hidden = true;
      return;
    }
    readingTries = 0;
    if (readingTimer) {
      clearTimeout(readingTimer);
      readingTimer = null;
    }
    document.getElementById("read-again").hidden = next.read !== "failed";
    fillHearing(next.hearing);
    var loaded = next.companyLoaded === true;
    document.getElementById("onboard-missing").hidden = loaded;
    var reading = document.getElementById("onboard-reading");
    if (reading) reading.hidden = true;
    document.getElementById("onboard-ready").hidden = !loaded;
    syncJoinReady();
    if (!loaded) {
      home.hidden = true;
      onboard.hidden = false;
      lockNav(true);
      text("crumb-current", "Rooms");
      syncNotices();
      return;
    }
    lockNav(false);
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
    text("cal-line", "Calendar is on " + calendarMode + ".");
    text("lin-line", "Linear is on " + linearMode + ".");
    text("prefs", "Calendar is on " + calendarMode + ". Linear is on " + linearMode + ".");
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
    if (askHelp) askHelp.textContent = "On waits for a confirm. Off sends the change.";
    var note = next.message || "";
    if (!note && !member() && !(next.rooms || []).length && !(next.decisions || []).length) note = "Write your name to see the rooms you were in.";
    text("read-note", note);
    syncHomeChrome();
    paintRooms();
    paintCounts();
    paintHistory();
    clear("record-list");
    clear("people-list");
    text("record-detail", "");
    (next.decisions || []).forEach(function (decision) {
      var parts = [];
      var spoken = humanStatus(decision.status || "recorded");
      if (spoken) parts.push(spoken);
      if (decision.speaker) parts.push(decision.speaker + " spoke.");
      parts.push(proofExplain(decision));
      var named = fileLine(decision);
      if (named) parts.push(named);
      var ticket = ticketLine(decision);
      if (ticket) parts.push(ticket);
      var epoch = epochLine(decision);
      if (epoch) parts.push(epoch);
      addLine("record-list", decision.text || "No decision yet.", parts.join(" "), function () {
        openDecision(decision);
      });
    });
    syncNotices();
    (next.people || []).forEach(function (person) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "card";
      row.append(face(person));
      var name = document.createElement("strong");
      name.textContent = person;
      var heard = document.createElement("p");
      heard.textContent = workspaceKind === "personal" ? "Kept as a private note." : "Spoke in a room";
      row.append(name, heard);
      row.addEventListener("click", function () {
        document.getElementById("member").value = person;
        showSection("home");
        load();
      });
      document.getElementById("people-list").append(row);
    });
    var peopleCount = (next.people || []).length;
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
    var peopleNote = document.querySelector(".people-note");
    if (peopleNote) peopleNote.hidden = peopleCount === 0;
    var recordNext = document.getElementById("record-next");
    if (recordNext) recordNext.hidden = workspaceKind === "personal" || (next.decisions || []).length > 0;
    var recordBoard = document.querySelector(".record-board");
    var recordMark = document.querySelector("#record .empty-mark");
    var noKept = (next.decisions || []).length === 0;
    var ledger = document.querySelector("#record .ledger");
    if (ledger && noKept && document.getElementById("meet-block") && document.getElementById("slack-block")) {
      var ledgerText = ledger.firstChild;
      if (ledgerText && ledgerText.nodeType === 3) ledgerText.nodeValue = "No decisions yet. A room has to be in use before one can be recorded.";
    }
    if (recordBoard) recordBoard.hidden = noKept;
    if (recordMark) recordMark.hidden = !noKept;
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

  function syncNewRoom() {
    var button = document.getElementById("new-room");
    if (!button) return;
    var onList = sectionName === "home" || sectionName === "rooms";
    button.hidden = workspaceKind === "personal" || !onList;
  }

  function leaveOnboard() {
    if (!onboard || onboard.hidden) return;
    onboard.hidden = true;
    home.hidden = false;
    lockNav(false);
  }

  function lockNav(locked) {
    document.querySelectorAll(".rail [data-show], #show-connectors").forEach(function (button) {
      if (locked) {
        button.setAttribute("aria-disabled", "true");
        button.removeAttribute("aria-current");
      } else {
        button.removeAttribute("aria-disabled");
      }
    });
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
      var title = document.getElementById("file-title");
      text("crumb-current", (title && title.textContent) || "Room");
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
  }

  function dialogOpen() {
    var ids = ["decision-dialog", "create-dialog", "workspace-dialog"];
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
      var line = lead ? humanStatus(lead.status || "recorded") : "No decision is kept in this room yet.";
      status.textContent = line;
      status.hidden = !line;
    }
    var proof = lead ? proofExplain(lead) : "Proof is unknown. The account did not return a checkpoint.";
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
      else if (kind === "confirm" && result && result.allow === "confirmed" && (result.status === "filed" || result.status === "updated")) note = "That change was confirmed.";
      else if (kind === "dismiss" && wasWaiting && !waitingFor(fileRoom).some(function (item) { return item.id === actionId; })) note = "That change was dismissed.";
      text("file-action-note", note);
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
      row.className = "card";
      var line = document.createElement("p");
      line.textContent = action.statement || "A change is waiting.";
      var tool = document.createElement("p");
      tool.textContent = action.tool || "Change";
      var confirm = document.createElement("button");
      confirm.type = "button";
      confirm.textContent = "Confirm";
      confirm.addEventListener("click", function () { sendAction("confirm", action.id, confirm); });
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", function () { sendAction("dismiss", action.id, dismiss); });
      row.append(line, tool, confirm, dismiss);
      box.append(row);
    });
  }

  function openDecision(decision) {
    text("decision-state", humanStatus(decision.status || "recorded"));
    text("decision-sentence", decision.text || "");
    text("decision-heard", decision.speaker ? (decision.speaker + " spoke.") : "No one is recorded yet.");
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
    if (sectionName === "file") text("crumb-current", document.getElementById("file-title").textContent || "Room");
    clear("file-heard");
    var present = document.getElementById("file-present");
    if (!people.length) {
      text("file-heard", "No one is recorded yet.");
      if (present) present.hidden = false;
    } else {
      text("file-heard", "");
      people.forEach(function (person) { document.getElementById("file-heard").append(face(person)); });
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
    var decisionHeading = document.getElementById("decisions-heading");
    if (decisionHeading) decisionHeading.hidden = rows.length < 2;
    if (rows.length >= 2) {
      rows.slice(0, -1).forEach(function (decision) {
        var line = document.createElement("button");
        line.type = "button";
        line.className = "row-button";
        line.textContent = statusLabel(decision.status) + ". " + decision.text;
        line.addEventListener("click", function () { openDecision(decision); });
        document.getElementById("file-decisions").append(line);
      });
    }
    renderWaiting();
    renderFiles();
    renderOutside();
  }

  function outsideFor(roomId) {
    return ((state && state.access) || []).filter(function (row) { return row.roomId === roomId; });
  }

  function renderOutside() {
    var rows = fileRoom ? outsideFor(fileRoom) : [];
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

  function load() {
    var token = loadToken + 1;
    loadToken = token;
    return fetch("/api/console" + consoleQuery()).then(function (response) {
      if (!response.ok) throw new Error("unread");
      return response.json();
    }).then(function (next) {
      if (token !== loadToken) return;
      paint(next);
    }).catch(function () {
      if (token !== loadToken) return;
      document.getElementById("loading").hidden = true;
      document.getElementById("read-again").hidden = false;
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
      document.body.classList.remove("rail-collapsed");
      var toggle = document.getElementById("rail-toggle");
      if (toggle) {
        toggle.setAttribute("aria-pressed", "false");
        toggle.setAttribute("aria-label", "Hide the sidebar");
      }
      document.getElementById("member").focus();
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
  document.querySelectorAll(".rail [data-show]").forEach(function (button) {
    button.addEventListener("click", function () {
      leaveOnboard();
      if (home.hidden) return;
      showSection(button.getAttribute("data-show"));
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
    if (!document.getElementById("decision-dialog").hidden) closeDialog("decision-dialog");
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
      if (note) note.textContent = "The meeting guest is " + (result.hearing && result.hearing.name ? result.hearing.name : "Maple") + ".";
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
    var missing = document.getElementById("onboard-missing");
    var still = document.getElementById("onboard-reading");
    if (missing) missing.hidden = true;
    if (still) {
      still.hidden = false;
      still.textContent = "Reading the account.";
    }
    document.getElementById("loading").hidden = false;
    fetch("/api/console/read" + consoleQuery(), { method: "POST" }).then(load);
  });
  document.getElementById("chat-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var sentence = document.getElementById("chat-text").value;
    var emptyLine = document.getElementById("chat-empty");
    if (emptyLine) emptyLine.hidden = true;
    var askedNow = sentence.trim();
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

  document.getElementById("member-open").addEventListener("click", function () {
    document.body.classList.remove("rail-collapsed");
    var toggle = document.getElementById("rail-toggle");
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Hide the sidebar");
    document.getElementById("member").focus();
  });
  document.getElementById("show-connectors").addEventListener("click", function () {
    leaveOnboard();
    if (home.hidden) return;
    showSection("connectors");
  });
  document.getElementById("setup-toggle").addEventListener("click", function () {
    if (home.hidden) return;
    showSection("connectors");
  });
  document.getElementById("rail-toggle").addEventListener("click", function () {
    var on = document.body.classList.toggle("rail-collapsed");
    var button = document.getElementById("rail-toggle");
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute("aria-label", on ? "Show the sidebar" : "Hide the sidebar");
  });
  document.getElementById("member").addEventListener("change", function () {
    var purpose = document.getElementById("name-purpose");
    if (purpose) purpose.textContent = member() ? "Saved for history and changes." : "For history and changes.";
    syncNameCue();
    load();
  });
  load();
  syncRail();
})();
</script>
</body>
</html>`;
}
