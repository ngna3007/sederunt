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
});
