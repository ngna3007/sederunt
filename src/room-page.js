import { sederuntMark, FAVICON_LINK } from "./sederunt-mark.js";

/**
 * The meeting room. The ledger is the whole company room in this process.
 * A call join and a question do not become decisions.
 */
export function renderRoomPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${FAVICON_LINK}
<title>Sederunt</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500&family=Source+Sans+3:wght@400;600&display=swap">
<style>
  :root { color-scheme: light; }
  html { background: #f4f3ef; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    background: #f4f3ef;
    color: #081428;
    font-family: "Source Sans 3", "Avenir Next", "Segoe UI", sans-serif;
    font-size: 1rem;
    line-height: 1.4;
  }
  header, .workspace, .dock {
    box-sizing: border-box;
    width: min(40rem, calc(100% - 1.5rem));
    margin-left: auto;
    margin-right: auto;
  }
  header { padding: 0.75rem 0 0.25rem; }
  main { flex: 1; display: flex; flex-direction: column; width: 100%; }
  .mark {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin: 0;
    font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
  }
  .mark .sederunt-mark { flex: none; display: block; }
  h1 {
    margin: 0 0 0.35rem;
    font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif;
    font-weight: 500;
    font-size: clamp(1.5rem, 4vw, 2.4rem);
    letter-spacing: -0.04em;
    line-height: 1;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif;
    font-weight: 500;
    font-size: 1.2rem;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    margin: 0.55rem 0 0;
    padding: 0;
  }
  .pills li {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    margin: 0;
    padding: 0.2rem 0.65rem;
    border: 1px solid #172b76;
    border-radius: 8px;
    background: #fffcf8;
    color: #081428;
  }
  .pills li.wait { color: #7c4704; border-color: #7c4704; }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.55rem;
  }
  .tool { display: grid; gap: 0.15rem; }
  .tool > span { color: #172b76; }
  .workspace {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.6rem 0 0.75rem;
  }
  .ledger { min-width: 0; }
  #list, .say, .join-form, .dock, #pending, #reply { display: grid; gap: 0.5rem; }
  #list { list-style: none; margin: 0; padding: 0; }
  #list li { margin: 0; min-width: 0; }
  #empty, #setup, #tunnel, #status, #answer-text, .pending p, #reply-label { margin: 0; }
  #setup { color: #7c4704; }
  #tunnel, #empty, #reply-label { color: #172b76; }
  #answer {
    padding: 0.65rem 0.75rem;
    border: 1px solid #172b76;
    border-radius: 2px;
    background: #fffcf8;
  }
  #answer h2 { font-size: 1rem; }
  #answer-text { color: #081428; overflow-wrap: anywhere; }
  input, textarea, button {
    box-sizing: border-box;
    min-height: 44px;
    border: 1px solid #172b76;
    border-radius: 2px;
    background: #fff;
    color: #081428;
    font: inherit;
  }
  input, textarea { width: 100%; padding: 0.45rem 0.65rem; }
  textarea { resize: vertical; max-height: 6.5rem; }
  ::placeholder { color: #495057; opacity: 1; }
  button {
    background: #f4f3ef;
    color: #081428;
    cursor: pointer;
    padding: 0.4rem 0.7rem;
  }
  button:hover { background: #fffcf8; }
  button:active { background: #e7e2d8; }
  button.primary {
    width: auto;
    background: #2458f6;
    border-color: #2458f6;
    border-radius: 8px;
    color: #fff;
    padding: 0.4rem 0.9rem;
  }
  button.primary:hover { background: #1b46c4; border-color: #1b46c4; }
  button.strong { background: #172b76; border-color: #172b76; color: #f4f3ef; }
  button.strong:hover { background: #081428; border-color: #081428; }
  button:disabled, .seg button:disabled[aria-pressed="true"] {
    background: #e7e2d8;
    border-color: #495057;
    color: #495057;
    cursor: progress;
  }
  button.busy::before {
    content: "";
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.4rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    vertical-align: -0.1rem;
    animation: turn 0.8s linear infinite;
  }
  .seg { display: grid; grid-template-columns: 1fr 1fr; }
  .seg button { border-radius: 0; }
  .seg button:first-child { border-radius: 8px 0 0 8px; }
  .seg button:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
  .seg button[aria-pressed="true"] { background: #172b76; color: #f4f3ef; }
  .seg button[aria-pressed="true"]:hover { background: #081428; }
  .join-form, .say-row, .identity, .pair, .reply-head {
    display: grid;
    gap: 0.5rem;
    align-items: stretch;
  }
  .join-form, .say-row { grid-template-columns: minmax(0, 1fr) auto; }
  .identity { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.3fr); }
  .pair { grid-template-columns: 1fr 1fr; }
  .reply-head { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  #join-button, #cancel-reply, #send { width: auto; }
  #join-button { max-width: 11rem; white-space: normal; line-height: 1.15; }
  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
    width: 100%;
    text-align: left;
    padding: 0.7rem 0.75rem;
    border: 1px solid #5c6790;
    border-radius: 2px;
    background: #fffcf8;
    color: #081428;
  }
  .card:hover { background: #fff; }
  .card[aria-pressed="true"] {
    border-color: #172b76;
    box-shadow: inset 0 0 0 1px #172b76;
  }
  .who { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
  .avatar {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    background: #172b76;
    color: #f4f3ef;
    font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif;
  }
  .meta { display: flex; flex-wrap: wrap; gap: 0.35rem 0.6rem; align-items: baseline; min-width: 0; }
  .speaker { font-weight: 600; }
  .when, .link { color: #495057; }
  .state.clashing, .state.replaced, .link.clash { color: #7c4704; }
  .said, .link { display: block; overflow-wrap: anywhere; }
  .pending {
    display: grid;
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid #7c4704;
    border-radius: 2px;
    background: #fffcf8;
  }
  .dock {
    position: sticky;
    bottom: 0;
    z-index: 2;
    padding: 0.55rem 0 calc(0.55rem + env(safe-area-inset-bottom));
    background: #f4f3ef;
    border-top: 1px solid #172b76;
  }
  #answer[hidden], #reply[hidden], #setup[hidden], #tunnel[hidden], #empty[hidden], #pending[hidden], #pending:empty { display: none; }
  :focus-visible { outline: 2px solid #172b76; outline-offset: 2px; }
  @media (min-width: 40rem) {
    .join-form { grid-template-columns: minmax(0, 1fr) auto; }
  }
  @media (min-width: 64rem) {
    header, .workspace, .dock { width: min(68rem, calc(100% - 2rem)); }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
    .ledger { grid-column: 1; grid-row: 1; }
    .join-band { grid-column: 2; grid-row: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    button.busy::before { animation: none; }
  }
  @keyframes turn { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<header>
  <p class="mark">${sederuntMark({ size: 36 })}<span class="brand-word">Sederunt</span></p>
  <ul id="pills" role="status" aria-label="Connections">
    <li>Checking Meet, Calendar, and Linear.</li>
  </ul>
  <div class="tools">
    <div class="tool">
      <span id="linear-label">Linear</span>
      <div class="seg" role="group" aria-labelledby="linear-label">
        <button type="button" data-tool="linear" data-value="ask" aria-pressed="true">Ask</button>
        <button type="button" data-tool="linear" data-value="do" aria-pressed="false">Auto</button>
      </div>
    </div>
    <div class="tool">
      <span id="calendar-label">Calendar</span>
      <div class="seg" role="group" aria-labelledby="calendar-label">
        <button type="button" data-tool="calendar" data-value="ask" aria-pressed="true">Ask</button>
        <button type="button" data-tool="calendar" data-value="do" aria-pressed="false">Auto</button>
      </div>
    </div>
  </div>
</header>
<main>
  <div class="workspace">
    <section class="ledger" aria-labelledby="ledger-title">
      <h1 id="ledger-title">Decisions</h1>
      <p id="empty">Loading the room.</p>
      <ol id="list"></ol>
    </section>
    <section class="join-band" aria-labelledby="join-title">
      <h2 id="join-title">Call</h2>
      <form id="join-form" class="join-form" novalidate>
        <input id="meet" name="meet" type="text" inputmode="url" autocomplete="off" aria-label="Google Meet link" placeholder="Paste Google Meet link">
        <button type="submit" id="join-button" class="strong">Send bot to call</button>
      </form>
      <p id="setup" hidden>The public address is not set, so Sederunt cannot join yet. Set SEDERUNT_PUBLIC_ORIGIN to a public https address, then restart.</p>
      <p id="tunnel" hidden></p>
    </section>
  </div>
  <div class="dock">
    <p id="status" role="status"></p>
    <article id="answer" hidden>
      <h2>Answer</h2>
      <p id="answer-text"></p>
    </article>
    <div id="pending"></div>
    <div id="reply" hidden>
      <div class="reply-head">
        <p id="reply-label"></p>
        <button type="button" id="cancel-reply">Cancel</button>
      </div>
      <div class="pair">
        <button type="button" id="clash">Clash with this</button>
        <button type="button" id="replace">Replace this</button>
      </div>
    </div>
    <form id="say-form" class="say" novalidate>
      <div class="identity">
        <input id="member" name="member" autocomplete="name" maxlength="80" aria-label="Who is speaking" placeholder="Who is speaking">
        <div class="seg" role="group" aria-label="Composer">
          <button type="button" id="mode-record" aria-pressed="true">Record decision</button>
          <button type="button" id="mode-ask" aria-pressed="false">Ask Sederunt</button>
        </div>
      </div>
      <div class="say-row">
        <textarea id="sentence" name="sentence" rows="1" maxlength="500" aria-label="Say something" placeholder="Say something"></textarea>
        <button type="submit" id="send" class="primary">Send</button>
      </div>
    </form>
  </div>
</main>
<script>
const member = document.querySelector("#member");
const sentence = document.querySelector("#sentence");
const meet = document.querySelector("#meet");
const sendButton = document.querySelector("#send");
let requestSeq = 0;
let busy = false;
let busyButton = null;
let targetId = "";
let mode = "record";
let doorsKnown = false;
let doors = { meeting: false, calendar: false, linear: false };
let ledger = { decisions: [], waiting: [], preferences: { linear: "ask", calendar: "ask" } };

function looksLikeQuestion(text) {
  const value = text.trim();
  if (/what was decided|what happened/i.test(value)) return false;
  if (/what is on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(value)) return false;
  if (/what tickets are open for the trip/i.test(value)) return false;
  return /\\?$/.test(value) || /^(what|who|when|where|why|how|can|did)\\b/i.test(value);
}
function isCalendarRead(text) {
  return /what is on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text.trim());
}
function isTripRead(text) {
  return /what tickets are open for the trip/i.test(text.trim());
}
function isYes(text) {
  return /^yes[.!]?$/i.test(text.trim());
}
function say(text) {
  document.querySelector("#status").textContent = text;
}
function short(text) {
  const value = String(text || "");
  return value.length > 80 ? value.slice(0, 79) + "..." : value;
}
function initial(name) {
  const value = String(name || "").trim();
  return value ? value.slice(0, 1).toUpperCase() : "?";
}
function clock(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function savedName() {
  try { return localStorage.getItem("sederunt-speaker") || sessionStorage.getItem("sederunt-speaker") || ""; }
  catch (error) { return ""; }
}
function storeName(value) {
  try { localStorage.setItem("sederunt-speaker", value); }
  catch (error) { return; }
}
function isMeetLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "meet.google.com" && parsed.pathname.length > 1;
  } catch (error) {
    return false;
  }
}
function lock(on, button) {
  busy = on;
  document.querySelectorAll("button").forEach((node) => { node.disabled = on; });
  if (on && button) {
    button.classList.add("busy");
    button.setAttribute("aria-busy", "true");
    busyButton = button;
  }
  if (!on && busyButton) {
    busyButton.classList.remove("busy");
    busyButton.removeAttribute("aria-busy");
    busyButton = null;
  }
}
function hideAnswer() {
  document.querySelector("#answer").hidden = true;
  document.querySelector("#answer-text").textContent = "";
}
function clearSentence() {
  sentence.value = "";
  sentence.focus();
}
function payload(text, extra) {
  const name = member.value.trim();
  const body = {
    text: text,
    memberId: name,
    door: "meeting",
    addressed: true,
    deliveryId: "room-" + requestSeq + "-" + Date.now(),
    room: { id: "desk", kind: "meeting", source: "meet", botPresent: true, memberIds: [name] },
    participants: [name],
  };
  if (extra && extra.contradicts) body.decision = { contradicts: extra.contradicts };
  if (extra && extra.replaces) body.decision = { replaces: extra.replaces };
  return body;
}
function paintDoors() {
  const list = document.querySelector("#pills");
  list.replaceChildren();
  const rows = [
    ["Meet", doors.meeting ? "ready" : "waiting"],
    ["Calendar", doors.calendar ? "connected" : "not connected"],
    ["Linear", doors.linear ? "connected" : "not connected"],
  ];
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = row[0] + " " + row[1];
    if (row[1] !== "ready" && row[1] !== "connected") item.className = "wait";
    list.append(item);
  }
  const missing = doors.meeting !== true;
  document.querySelector("#setup").hidden = !missing;
  const tunnel = document.querySelector("#tunnel");
  tunnel.hidden = !missing;
  if (missing) {
    const port = location.port || "8787";
    tunnel.textContent = "Tunnel command: cloudflared tunnel --url http://127.0.0.1:" + port;
  }
}
function paintModes() {
  const prefs = ledger.preferences || { linear: "ask", calendar: "ask" };
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const pressed = prefs[button.dataset.tool] === button.dataset.value;
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
  });
  document.querySelector("#mode-record").setAttribute("aria-pressed", mode === "record" ? "true" : "false");
  document.querySelector("#mode-ask").setAttribute("aria-pressed", mode === "ask" ? "true" : "false");
  sendButton.textContent = mode === "ask" ? "Ask Sederunt" : "Send";
  sentence.placeholder = mode === "ask" ? "Ask a question" : "Say something";
  sentence.setAttribute("aria-label", mode === "ask" ? "Ask a question" : "Say something");
}
function partner(row) {
  const rows = ledger.decisions || [];
  for (const id of row.contradicts || []) {
    if (id === row.id) continue;
    const other = rows.find((item) => item.id === id);
    if (other) return other;
  }
  return rows.find((item) => item.id !== row.id && (item.contradicts || []).indexOf(row.id) !== -1) || null;
}
function paintList() {
  const list = document.querySelector("#list");
  const empty = document.querySelector("#empty");
  const rows = ledger.decisions || [];
  list.replaceChildren();
  if (rows.length === 0) {
    empty.hidden = false;
    empty.textContent = "No decision yet. Say one sentence. This list lives in the server process, so a restart clears it.";
    return;
  }
  empty.hidden = true;
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.setAttribute("aria-pressed", row.id === targetId ? "true" : "false");
    button.addEventListener("click", () => select(row.id));
    const who = document.createElement("span");
    who.className = "who";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = initial(row.speaker);
    const meta = document.createElement("span");
    meta.className = "meta";
    const speaker = document.createElement("span");
    speaker.className = "speaker";
    speaker.textContent = row.speaker || "Someone";
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = clock(row.spokenAt);
    const state = document.createElement("span");
    state.className = "state " + (row.status || "");
    state.textContent = row.status === "clashing" ? "Clashing" : row.status === "replaced" ? "Replaced" : row.status === "current" ? "Current" : "Kept";
    meta.append(speaker, when, state);
    who.append(avatar, meta);
    const said = document.createElement("span");
    said.className = "said";
    said.textContent = row.text;
    button.append(who, said);
    if (row.replaces && byId.get(row.replaces)) {
      const replaces = document.createElement("span");
      replaces.className = "link";
      replaces.textContent = "Replaces: " + byId.get(row.replaces).text;
      button.append(replaces);
    }
    if (row.replacedBy && byId.get(row.replacedBy)) {
      const replaced = document.createElement("span");
      replaced.className = "link";
      replaced.textContent = "Replaced by: " + byId.get(row.replacedBy).text;
      button.append(replaced);
    }
    const other = partner(row);
    if (other && other.id !== row.replaces && other.id !== row.replacedBy) {
      const clash = document.createElement("span");
      clash.className = "link clash";
      clash.textContent = "Clashes with: " + other.text;
      button.append(clash);
    }
    item.append(button);
    list.append(item);
  }
}
function paintWaiting() {
  const host = document.querySelector("#pending");
  const waiting = ledger.waiting || [];
  host.hidden = waiting.length === 0;
  host.replaceChildren();
  for (const action of waiting) {
    const card = document.createElement("article");
    card.className = "pending";
    const copy = document.createElement("p");
    const toolName = action.tool === "linear" ? "Linear" : "Calendar";
    copy.textContent = toolName + " change proposed: " + action.statement;
    const row = document.createElement("div");
    row.className = "pair";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "strong";
    confirm.textContent = "Confirm";
    confirm.addEventListener("click", () => onConfirm(action, confirm));
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => onDismiss(action, dismiss));
    row.append(confirm, dismiss);
    card.append(copy, row);
    host.append(card);
  }
}
function paintReply() {
  const bar = document.querySelector("#reply");
  const row = (ledger.decisions || []).find((item) => item.id === targetId);
  if (!row) {
    targetId = "";
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  document.querySelector("#reply-label").textContent = "Replying to " + (row.speaker || "someone") + ": " + short(row.text);
}
function paint() {
  if (doorsKnown) paintDoors();
  paintModes();
  paintList();
  paintWaiting();
  paintReply();
  if (busy) document.querySelectorAll("button").forEach((node) => { node.disabled = true; });
}
function select(id) {
  targetId = targetId === id ? "" : id;
  paintList();
  paintReply();
}
function clearReply() {
  targetId = "";
  paintList();
  paintReply();
}
async function postTyped(text, extra, button) {
  const seq = ++requestSeq;
  lock(true, button);
  try {
    const response = await fetch("/api/typed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(text, extra)),
    });
    if (!response.ok) throw new Error("room");
    const result = await response.json();
    if (seq !== requestSeq) return null;
    const room = await fetch("/api/room?room=desk");
    if (!room.ok) throw new Error("room");
    const next = await room.json();
    if (seq !== requestSeq) return null;
    ledger = next;
    paint();
    return result;
  } catch (error) {
    if (seq === requestSeq) say("The room did not answer. Send the sentence again.");
    return null;
  } finally {
    if (seq === requestSeq) lock(false);
  }
}
function showRead(body) {
  const lines = String(body || "").split("\\n").filter((line) => line && line !== "recorded" && line.indexOf("preference ") !== 0);
  document.querySelector("#answer").hidden = false;
  document.querySelector("#answer-text").textContent = lines.join(" ") || "No answer came back.";
}
function showRecall() {
  const current = (ledger.decisions || []).filter((row) => row.status === "current");
  document.querySelector("#answer").hidden = false;
  document.querySelector("#answer-text").textContent = current.length
    ? current.map((row) => (row.speaker || "Someone") + ": " + row.text).join(" ")
    : "No decision is in the room yet.";
  say("Showing what the room holds.");
}
function isDuplicate(text) {
  return (ledger.decisions || []).some((row) => row.text === text && row.status !== "replaced");
}
async function onAsk(text, button) {
  if (isCalendarRead(text) || isTripRead(text)) {
    const result = await postTyped(text, null, button);
    if (!result) return;
    showRead(result.body);
    clearSentence();
    return;
  }
  const seq = ++requestSeq;
  lock(true, button);
  try {
    const response = await fetch("/api/room?room=desk");
    if (!response.ok) throw new Error("room");
    const next = await response.json();
    if (seq !== requestSeq) return;
    ledger = next;
    paint();
    showRecall();
    clearSentence();
  } catch (error) {
    if (seq === requestSeq) say("The room did not answer. Send the sentence again.");
  } finally {
    if (seq === requestSeq) lock(false);
  }
}
async function onRecord(event) {
  event.preventDefault();
  if (busy) return;
  const name = member.value.trim();
  const text = sentence.value.trim();
  if (!name) { say("Say who is speaking first."); member.focus(); return; }
  storeName(name);
  if (!text) {
    say(mode === "ask" ? "Write a question first." : "Nothing was kept. Write a sentence first.");
    sentence.focus();
    return;
  }
  if (isYes(text)) {
    say((ledger.waiting || []).length
      ? "Yes does not confirm. Use Confirm on the proposed change."
      : "Yes did not confirm a change. Nothing was waiting.");
    return;
  }
  if (isCalendarRead(text) || isTripRead(text)) {
    hideAnswer();
    const read = await postTyped(text, null, sendButton);
    if (!read) return;
    showRead(read.body);
    clearSentence();
    return;
  }
  if (mode === "ask" && !looksLikeQuestion(text) && !/what was decided|what happened/i.test(text)) {
    say("That is a statement. Switch to Record decision to keep it.");
    return;
  }
  if (mode === "ask" || looksLikeQuestion(text) || /what was decided|what happened/i.test(text)) {
    hideAnswer();
    await onAsk(text, sendButton);
    return;
  }
  if (isDuplicate(text)) { say("That sentence is already in the list."); return; }
  hideAnswer();
  const result = await postTyped(text, null, sendButton);
  if (!result) return;
  if (result.outcome === "duplicate") { say("That sentence is already in the list."); return; }
  if (result.outcome === "question") { await onAsk(text, sendButton); return; }
  if (result.actionId && String(result.body || "").indexOf("Waiting for confirmation") !== -1) {
    say("Nothing changed yet. Confirm this change, or dismiss it.");
    clearSentence();
    return;
  }
  if (String(result.body || "").indexOf("The edit did not happen") !== -1) {
    say("The edit did not happen.");
    return;
  }
  say("Kept that sentence.");
  clearSentence();
  clearReply();
}
async function onClash(button) {
  if (busy) return;
  const name = member.value.trim();
  const text = sentence.value.trim();
  if (!targetId) { say("Select the decision this sentence answers."); return; }
  if (!name) { say("Say who is speaking first."); member.focus(); return; }
  if (!text) { say("Write the sentence that clashes."); sentence.focus(); return; }
  if (looksLikeQuestion(text) || isYes(text)) { say("A question cannot clash. Write the sentence you want kept."); return; }
  if (isDuplicate(text)) { say("That sentence is already in the list."); return; }
  storeName(name);
  hideAnswer();
  const result = await postTyped(text, { contradicts: [targetId] }, button);
  if (!result) return;
  if (result.outcome === "duplicate" || result.outcome === "question") {
    say(result.outcome === "question" ? "A question cannot clash. Write the sentence you want kept." : "That sentence is already in the list.");
    return;
  }
  say("Those sentences are clashing.");
  clearSentence();
  clearReply();
}
async function onReplace(button) {
  if (busy) return;
  const name = member.value.trim();
  const text = sentence.value.trim();
  if (!targetId) { say("Select the decision this sentence answers."); return; }
  if (!name) { say("Say who is speaking first."); member.focus(); return; }
  if (!text) { say("Write the sentence you want kept."); sentence.focus(); return; }
  if (looksLikeQuestion(text) || isYes(text)) { say("A question cannot replace a decision. Write the sentence you want kept."); return; }
  storeName(name);
  hideAnswer();
  const result = await postTyped(text, { replaces: targetId }, button);
  if (!result) return;
  if (result.outcome === "duplicate") { say("That sentence is already in the list."); return; }
  if (result.outcome === "question") { say("A question cannot replace a decision. Write the sentence you want kept."); return; }
  const currents = (ledger.decisions || []).filter((row) => row.status === "current").length;
  say(currents > 1
    ? "The earlier sentence is replaced. More than one sentence is still current."
    : "The earlier sentence is replaced. The new one is current.");
  clearSentence();
  clearReply();
}
async function onConfirm(action, button) {
  if (busy) return;
  if (!member.value.trim()) { say("Say who is speaking first."); member.focus(); return; }
  const result = await postTyped("confirm " + action.id, null, button);
  if (!result) return;
  if (result.status === "filed" && result.issueId) say("Filed as " + result.issueId + ".");
  else if (result.status === "updated") say("The event was updated.");
  else if (String(result.body || "").indexOf("The edit did not happen") !== -1) say("The edit did not happen.");
  else say("That change was sent.");
}
async function onDismiss(action, button) {
  if (busy) return;
  if (!member.value.trim()) { say("Say who is speaking first."); member.focus(); return; }
  const result = await postTyped("dismiss " + action.id, null, button);
  if (!result) return;
  say(action.tool === "linear" ? "Dismissed linear change." : "Dismissed calendar change.");
}
async function onJoin(event) {
  event.preventDefault();
  if (busy) return;
  const url = meet.value.trim();
  if (!url) { say("Paste a Google Meet link first."); meet.focus(); return; }
  if (!isMeetLink(url)) { say("That is not a Google Meet link. Paste a meet.google.com address."); meet.focus(); return; }
  const seq = ++requestSeq;
  lock(true, document.querySelector("#join-button"));
  try {
    const response = await fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url }),
    });
    if (!response.ok) throw new Error("room");
    const result = await response.json();
    if (seq !== requestSeq) return;
    if (result.join === "sent") {
      say("Sederunt is on the way to the meeting.");
      meet.value = "";
    } else if (result.join === "not-configured") {
      say(doors.meeting
        ? "That link is not a public https meeting address."
        : "The public address is not set, so Sederunt did not join.");
    } else {
      say("Sederunt did not join the meeting.");
    }
  } catch (error) {
    if (seq === requestSeq) say("The room did not answer. Send the sentence again.");
  } finally {
    if (seq === requestSeq) lock(false);
  }
}
async function setPref(button) {
  if (busy) return;
  const tool = button.dataset.tool;
  const value = button.dataset.value === "do" ? "do" : "ask";
  const current = (ledger.preferences || {})[tool] || "ask";
  if (current === value) {
    if (value === "do" && tool === "linear") say("Linear is set to Auto. A later ticket sentence will be filed.");
    else if (value === "do") say("Calendar is set to Auto. A later move will change the event.");
    else if (tool === "linear") say("Linear stays on Ask. A ticket sentence will wait.");
    else say("Calendar stays on Ask. A move will wait for you.");
    return;
  }
  const name = member.value.trim();
  if (!name) { say("Say who is speaking first."); member.focus(); return; }
  storeName(name);
  const result = await postTyped("set " + tool + " to " + value, null, button);
  if (!result) return;
  if (value === "do" && tool === "linear") say("Linear is set to Auto. A later ticket sentence will be filed.");
  else if (value === "do") say("Calendar is set to Auto. A later move will change the event.");
  else if (tool === "linear") say("Linear stays on Ask. A ticket sentence will wait.");
  else say("Calendar stays on Ask. A move will wait for you.");
}
document.querySelector("#say-form").addEventListener("submit", onRecord);
document.querySelector("#join-form").addEventListener("submit", onJoin);
document.querySelector("#clash").addEventListener("click", () => onClash(document.querySelector("#clash")));
document.querySelector("#replace").addEventListener("click", () => onReplace(document.querySelector("#replace")));
document.querySelector("#cancel-reply").addEventListener("click", clearReply);
document.querySelector("#mode-record").addEventListener("click", () => { mode = "record"; paintModes(); sentence.focus(); });
document.querySelector("#mode-ask").addEventListener("click", () => { mode = "ask"; paintModes(); sentence.focus(); });
document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => setPref(button));
});
member.addEventListener("change", () => storeName(member.value.trim()));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && targetId) clearReply();
});
const remembered = savedName();
if (remembered) member.value = remembered;
fetch("/api/ready").then(async (response) => {
  if (!response.ok) throw new Error("doors");
  doors = await response.json();
  doorsKnown = true;
  paintDoors();
}).catch(() => {
  const list = document.querySelector("#pills");
  list.replaceChildren();
  const item = document.createElement("li");
  item.textContent = "Door status did not load. Reload the page.";
  list.append(item);
});
fetch("/api/room?room=desk").then(async (response) => {
  if (!response.ok) throw new Error("room");
  const next = await response.json();
  if (requestSeq !== 0) return;
  ledger = next;
  paint();
}).catch(() => {
  document.querySelector("#empty").textContent = "The room did not load. Reload the page.";
});
</script>
</body>
</html>`;
}
