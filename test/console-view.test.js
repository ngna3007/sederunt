import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "../prototype/console.js");
const source = readFileSync(scriptPath, "utf8");

function load() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(source, context, { filename: "console.js" });
  return window.SederuntConsole;
}

test("window script loads with no node globals", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(vm.createContext({ window: {} }), "require"), false);
  const api = load();
  assert.equal(typeof api.mount, "function");
  assert.equal(typeof api.createState, "function");
  assert.equal(typeof api.reduce, "function");
  assert.equal(typeof api.view, "function");
  assert.equal(api.view(api.createState()).section, "home");
});

test("home is counts and rooms, history is a different cut, and actions stay scoped", () => {
  const api = load();
  let state = api.createState();
  const home = api.view(state);
  assert.equal(home.section, "home");
  assert.equal(home.modal, "onboarding");
  assert.deepEqual(Object.keys(home.counts).sort(), ["decisionsKept", "failed", "sentThisWeek", "waitingOnYou"]);
  assert.equal(home.events, undefined);
  assert.equal(home.rooms.some((room) => room.title === "Client call" && room.kind === "meeting"), true);
  assert.equal(home.rooms.some((room) => room.kind === "channel"), true);

  state = api.reduce(state, { type: "dismiss-modal" });
  const afterDismiss = api.view(state);
  assert.equal(afterDismiss.modal, null);
  assert.equal(afterDismiss.section, "home");
  assert.equal(afterDismiss.events, undefined);
  assert.ok(afterDismiss.counts.decisionsKept >= 0);

  state = api.reduce(state, { type: "open-section", section: "history" });
  state = api.reduce(state, { type: "history-cut", cut: "group" });
  const groupIds = api.view(state).events.map((event) => event.id);
  state = api.reduce(state, { type: "history-cut", cut: "you" });
  const youIds = api.view(state).events.map((event) => event.id);
  assert.equal(groupIds.includes("answer-call"), true);
  assert.equal(youIds.includes("answer-call"), false);
  assert.equal(youIds.includes("wait-eng"), true);
  assert.equal(groupIds.includes("wait-eng"), false);

  const companyTitles = groupIds.concat(youIds);
  assert.equal(companyTitles.includes("private-note"), false);
  let personal = api.reduce(api.createState(), { type: "open-workspace", id: "rowan" });
  personal = api.reduce(personal, { type: "open-section", section: "history" });
  personal = api.reduce(personal, { type: "history-cut", cut: "you" });
  const personalView = api.view(personal);
  assert.equal(personalView.workspaceName, "Rowan");
  assert.equal(personalView.events.some((event) => event.sentence === "Call the client back tomorrow."), true);
  assert.equal(personalView.rooms.some((room) => room.title === "Client call"), false);

  let created = api.reduce(api.createState(), { type: "create-workspace", name: "Studio" });
  const studio = created.workspaces.find((workspace) => workspace.name === "Studio");
  assert.ok(studio);
  created = api.reduce(created, { type: "open-workspace", id: studio.id });
  assert.equal(api.view(created).workspaceName, "Studio");

  let history = api.reduce(api.createState(), { type: "history-cut", cut: "group" });
  const refused = api.view(history).events.find((event) => event.kind === "access");
  assert.equal(refused.sentence, null);
  assert.equal(JSON.stringify(refused).includes("Mina took the call"), false);

  history = api.reduce(history, { type: "history-cut", cut: "you" });
  const waiting = api.view(history).events.filter((event) => event.state === "waiting");
  assert.ok(waiting.length >= 2);
  const first = waiting[0].id;
  const second = waiting[1].id;
  history = api.reduce(history, { type: "confirm", id: first });
  let events = api.view(history).events;
  assert.equal(events.find((event) => event.id === first).state, "sent");
  assert.equal(events.find((event) => event.id === second).state, "waiting");
  history = api.reduce(history, { type: "dismiss", id: second });
  events = api.view(history).events;
  assert.equal(events.find((event) => event.id === first).state, "sent");
  assert.equal(events.find((event) => event.id === second).state, "dismissed");

  const record = api.view(api.reduce(api.createState(), { type: "open-section", section: "record" }));
  assert.equal(JSON.stringify(record.clash), JSON.stringify(["Mina owns the notes.", "Noah owns the notes."]));
  assert.equal(record.fileName, "notes.pdf");
  assert.equal(record.bytes, undefined);
  assert.equal(record.proofs.includes("18442211"), true);
  assert.equal(record.proofs.includes("unknown"), true);
  const blob = JSON.stringify(record);
  assert.equal(/0x[0-9a-fA-F]{8,}/.test(blob), false);
  assert.equal(blob.includes("MEMWAL"), false);
  assert.equal(blob.includes("private key"), false);

  const el = {
    innerHTML: "",
    _fn: null,
    addEventListener(_type, fn) { this._fn = fn; },
    contains() { return true; }
  };
  api.mount(el);
  function fire(attrs) {
    el._fn({
      target: {
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
        parentNode: el
      }
    });
  }
  fire({ "data-act": "dismiss-modal" });
  assert.equal(el.innerHTML.includes('role="dialog"'), false);
  assert.equal(el.innerHTML.includes("<table"), false);
  const room = el.innerHTML.match(/data-act="select" data-id="([^"]+)"[^>]*>[\s\S]*?Client call/);
  assert.ok(room);
  assert.equal(el.innerHTML.includes("Google Meet"), true);
  assert.equal(el.innerHTML.includes("Bot Sederunt"), true);
  fire({ "data-act": "select", "data-id": room[1] });
  const detail = el.innerHTML.slice(el.innerHTML.indexOf('role="dialog"'));
  assert.equal(detail.includes("Client call"), true);
  assert.equal(detail.includes("meeting"), true);
  assert.equal(detail.includes("Mina took the call. Noah sent the notes that day."), true);
  assert.equal(detail.includes("Heard by Noah, Mina, Rowan"), true);

  fire({ "data-act": "open-section", "data-section": "rooms" });
  assert.equal(el.innerHTML.includes("Present while the bot was there"), true);
  assert.equal(el.innerHTML.includes('role="dialog"'), false);
  assert.equal(el.innerHTML.includes("<table"), false);
  assert.equal(el.innerHTML.includes("Google Meet"), true);
  assert.equal(el.innerHTML.includes("#design"), true);
  assert.equal(el.innerHTML.includes("Bot Sederunt"), true);
  const fromRooms = el.innerHTML.match(/data-act="select" data-id="([^"]+)"[^>]*>[\s\S]*?Client call/);
  assert.ok(fromRooms);
  fire({ "data-act": "select", "data-id": fromRooms[1] });
  const roomsDetail = el.innerHTML.slice(el.innerHTML.indexOf('role="dialog"'));
  assert.equal(roomsDetail.includes("Client call"), true);
  assert.equal(roomsDetail.includes("meeting"), true);
  assert.equal(roomsDetail.includes("Mina took the call. Noah sent the notes that day."), true);
  assert.equal(roomsDetail.includes("Heard by Noah, Mina, Rowan"), true);

  const joined = api.view(api.reduce(api.createState(), { type: "join-meeting", text: "https://meet.google.com/abc-defg-hij" }));
  const waitingRoom = joined.rooms.find((item) => item.title === "Waiting for the meeting name");
  assert.equal(waitingRoom.platformLabel, "Google Meet");
  assert.equal(waitingRoom.channel, "");
  assert.equal(waitingRoom.bot, "Sederunt");
  assert.equal(JSON.stringify(waitingRoom).includes("meet.google.com"), false);
});

test("a preset copies voice and clash onto one room, and history and empty paths stay", () => {
  const api = load();
  let state = api.reduce(api.createState(), { type: "select", id: "client-call" });
  let client = api.view(state).selected;
  assert.equal(client.voice, "plain");
  assert.equal(client.clashRaise, false);
  assert.equal(client.clashWhere, "room");
  assert.equal(client.preference, "ask");
  assert.equal(client.canMessage, false);

  state = api.reduce(state, { type: "apply-preset", id: "client-call", value: "formal" });
  client = api.view(state).selected;
  assert.equal(client.voice, "formal");
  assert.equal(client.clashRaise, true);
  assert.equal(client.clashWhere, "room");
  assert.equal(client.preference, "ask");
  assert.equal(api.view(state).preferences.linear, "ask");

  state = api.reduce(state, { type: "select", id: "design" });
  let design = api.view(state).selected;
  assert.equal(design.voice, "plain");
  assert.equal(design.clashRaise, false);
  assert.equal(design.preference, "ask");
  assert.equal(design.canMessage, true);

  state = api.reduce(state, { type: "apply-preset", id: "client-call", value: "custom" });
  state = api.reduce(state, { type: "select", id: "client-call" });
  client = api.view(state).selected;
  assert.equal(client.voice, "formal");
  assert.equal(["short", "plain", "formal"].includes(client.voice), true);

  state = api.reduce(state, { type: "set-room-preference", id: "client-call", value: "do" });
  client = api.view(state).selected;
  assert.equal(client.preference, "do");
  assert.equal(client.voice, "formal");
  state = api.reduce(state, { type: "set-clash-raise", id: "client-call", value: "off" });
  client = api.view(state).selected;
  assert.equal(client.clashRaise, false);
  assert.equal(client.voice, "formal");
  assert.equal(client.preference, "do");
  state = api.reduce(state, { type: "apply-preset", id: "client-call", value: "short" });
  client = api.view(state).selected;
  assert.equal(client.voice, "short");
  assert.equal(client.clashRaise, false);
  assert.equal(client.preference, "do");
  state = api.reduce(state, { type: "set-clash-where", id: "client-call", value: "person" });
  assert.equal(api.view(state).selected.clashWhere, "room");
  state = api.reduce(state, { type: "set-clash-where", id: "design", value: "person" });
  state = api.reduce(state, { type: "select", id: "design" });
  design = api.view(state).selected;
  assert.equal(design.clashWhere, "person");
  assert.equal(design.voice, "plain");
  assert.equal(design.preference, "ask");
  state = api.reduce(state, { type: "apply-preset", id: "design", value: "plain" });
  design = api.view(state).selected;
  assert.equal(design.voice, "plain");
  assert.equal(design.clashWhere, "room");
  assert.equal(design.clashRaise, false);

  state = api.reduce(api.createState(), { type: "open-section", section: "history" });
  state = api.reduce(state, { type: "history-cut", cut: "group" });
  state = api.reduce(state, { type: "history-kind", kind: "all" });
  const group = api.view(state).events;
  const questions = group.filter((event) => event.kind === "answer" || event.kind === "kept");
  const actions = group.filter((event) => event.kind === "change");
  const other = group.filter((event) => event.kind !== "answer" && event.kind !== "kept" && event.kind !== "change");
  assert.equal(questions.some((event) => event.sentence === "Mina took the call. Noah sent the notes that day."), true);
  assert.equal(questions.some((event) => event.sentence === "Mina owns the notes."), true);
  assert.equal(questions.some((event) => event.sentence === "Noah owns the notes."), true);
  assert.equal(actions.some((event) => event.sentence === "ENG-406 assigned to Rowan."), true);
  assert.equal(other.some((event) => event.kind === "access" && event.sentence === null), true);
  assert.equal(other.some((event) => event.kind === "change"), false);

  state = api.reduce(state, { type: "history-cut", cut: "you" });
  state = api.reduce(state, { type: "history-kind", kind: "question" });
  assert.equal(api.view(state).events.length, 0);

  let personal = api.reduce(api.createState(), { type: "open-workspace", id: "rowan" });
  personal = api.reduce(personal, { type: "open-section", section: "rooms" });
  assert.equal(api.view(personal).rooms.length, 0);
  personal = api.reduce(personal, { type: "open-section", section: "chat" });
  assert.equal(api.view(personal).chat.length, 0);
  personal = api.reduce(personal, { type: "send-chat", text: "  " });
  assert.equal(api.view(personal).notice, "The question is missing.");

  const bad = api.view(api.reduce(api.createState(), { type: "join-meeting", text: "https://example.com/meet" }));
  assert.equal(bad.notice, "That link is not Zoom, Google Meet, Teams, or Webex.");
  const huddle = api.view(api.reduce(api.createState(), { type: "join-meeting", text: "https://app.slack.com/huddle/T123" }));
  assert.equal(huddle.notice, "A Slack huddle is not a meeting. Add the bot to the channel.");
  assert.equal(source.includes("No rooms yet. Bring the bot into a meeting or a channel."), true);

  const el = {
    innerHTML: "",
    _fn: null,
    addEventListener(_type, fn) { this._fn = fn; },
    contains() { return true; }
  };
  api.mount(el);
  function fire(attrs) {
    el._fn({
      target: {
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
        parentNode: el
      }
    });
  }
  fire({ "data-act": "dismiss-modal" });
  assert.equal(el.innerHTML.includes("Sample record. This preview does not write."), true);
  fire({ "data-act": "open-section", "data-section": "history" });
  fire({ "data-act": "history-cut", "data-cut": "group" });
  fire({ "data-act": "history-kind", "data-kind": "all" });
  const page = el.innerHTML;
  const qAt = page.indexOf("<h3>Questions</h3>");
  const aAt = page.indexOf("<h3>Actions</h3>");
  const oAt = page.indexOf("<h3>Other</h3>");
  assert.ok(qAt > -1 && aAt > qAt && oAt > aAt);
  const questionHtml = page.slice(qAt, aAt);
  const actionHtml = page.slice(aAt, oAt);
  const otherHtml = page.slice(oAt);
  assert.equal(questionHtml.includes("Mina took the call. Noah sent the notes that day."), true);
  assert.equal(questionHtml.includes("Mina owns the notes."), true);
  assert.equal(questionHtml.includes("Noah owns the notes."), true);
  assert.equal(questionHtml.includes("ENG-406 assigned to Rowan."), false);
  assert.equal(actionHtml.includes("ENG-406 assigned to Rowan."), true);
  assert.equal(actionHtml.includes("The change is still open."), true);
  assert.equal(otherHtml.includes("Henry asked"), true);
  fire({ "data-act": "history-cut", "data-cut": "you" });
  fire({ "data-act": "history-kind", "data-kind": "question" });
  assert.equal(el.innerHTML.includes("Nothing in this view."), true);

  fire({ "data-act": "open-section", "data-section": "rooms" });
  const room = el.innerHTML.match(/data-act="select" data-id="([^"]+)"[^>]*>[\s\S]*?Client call/);
  assert.ok(room);
  fire({ "data-act": "select", "data-id": room[1] });
  const meet = el.innerHTML.slice(el.innerHTML.indexOf('role="dialog"'));
  assert.equal(meet.includes("Short"), true);
  assert.equal(meet.includes("Plain"), true);
  assert.equal(meet.includes("Formal"), true);
  assert.equal(meet.includes("Ask first"), true);
  assert.equal(meet.includes("Raise a clash"), true);
  assert.equal(el.innerHTML.includes("Sederunt"), true);
  assert.equal(/<textarea/i.test(meet), false);
  assert.equal(/prompt/i.test(meet), false);
  assert.equal(meet.includes("Direct message"), false);
  assert.equal(meet.includes("Mina owns the notes."), true);
  assert.equal(meet.includes("Noah owns the notes."), true);
  assert.equal(meet.includes('aria-label="Raise a clash"'), true);
  assert.equal(meet.includes('aria-checked="false"'), true);
  assert.equal(meet.includes("The decision, and who heard it."), true);

  fire({ "data-act": "apply-preset", "data-id": room[1], "data-value": "short" });
  const shortMeet = el.innerHTML.slice(el.innerHTML.indexOf('role="dialog"'));
  assert.equal(shortMeet.includes("One sentence."), true);
  assert.equal(shortMeet.includes('aria-pressed="true">Short'), true);
  assert.equal(shortMeet.includes('aria-checked="true" aria-label="Ask first"'), true);
  assert.equal(shortMeet.includes('aria-checked="false" aria-label="Raise a clash"'), true);
  assert.equal(shortMeet.includes("Direct message"), false);
  assert.equal(shortMeet.includes("Mina owns the notes."), true);
  assert.equal(shortMeet.includes("Noah owns the notes."), true);

  fire({ "data-act": "close-detail" });
  const slack = el.innerHTML.match(/data-act="select" data-id="([^"]+)"[^>]*>(?:(?!<\/button>)[\s\S])*?#design/);
  assert.ok(slack);
  fire({ "data-act": "select", "data-id": slack[1] });
  const channel = el.innerHTML.slice(el.innerHTML.indexOf('role="dialog"'));
  assert.equal(channel.includes("Direct message"), true);
  assert.equal(channel.includes("In the room"), true);
  assert.equal(/prompt/i.test(channel), false);
  assert.equal(channel.includes("The decision, and who heard it."), true);
  assert.equal(channel.includes("One sentence."), false);
  assert.equal(channel.includes('aria-pressed="true">Plain'), true);
  assert.equal(channel.includes('aria-checked="true" aria-label="Ask first"'), true);
  assert.equal(channel.includes('aria-checked="false" aria-label="Raise a clash"'), true);

  fire({ "data-act": "close-detail" });
  fire({ "data-act": "open-workspace", "data-id": "rowan" });
  fire({ "data-act": "open-section", "data-section": "rooms" });
  assert.equal(el.innerHTML.includes("Private notes stay in this workspace. They are never shared as rooms."), true);
  assert.equal(el.innerHTML.includes("New room"), false);
  fire({ "data-act": "open-section", "data-section": "chat" });
  assert.equal(el.innerHTML.includes("Nothing has been asked here yet."), true);
  fire({ "data-act": "send-chat" });
  assert.equal(el.innerHTML.includes("The question is missing."), true);
  fire({ "data-act": "open-workspace", "data-id": "acme" });
  fire({ "data-act": "open-section", "data-section": "rooms" });
  fire({ "data-act": "open-create" });
  fire({ "data-act": "join-meeting" });
  assert.equal(el.innerHTML.includes("Paste a Zoom, Google Meet, Teams, or Webex link."), true);
});
