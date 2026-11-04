import assert from "node:assert/strict";
import test from "node:test";
import { checkReply } from "../src/bot/persona.js";
import {
  actionChecklistBlocks,
  actionLine,
  createMemoryActionStore,
  extractActions,
  handleActionPayload,
  parseActionPayload,
  runApprovedAction,
  sendActionDms,
  validateActions,
} from "../src/meeting/actions.js";

const formItem = {
  id: "form-retro",
  kind: "create_form",
  requester: "Lan",
  requesterSlackId: "U04LAN",
  summary: "Create Google Form 'Retro'",
  where: "your Google Drive",
  tool: "create_form",
  args: { title: "Retro" },
};

function scriptedLlm(payload) {
  return { async complete() { return { text: typeof payload === "string" ? payload : JSON.stringify(payload) }; } };
}

test("extraction keeps who asked and rejects a bad item", async () => {
  const extracted = await extractActions({
    transcript: "Lan: please make a retro form",
    llm: scriptedLlm({
      items: [
        { ...formItem },
        { kind: "edit_calendar", requester: "", summary: "Move retro", where: "the calendar" },
        { kind: "nope", requester: "Mai", summary: "X", where: "Y" },
      ],
    }),
  });
  assert.equal(extracted.ok, false);
  assert.equal(extracted.items.length, 1);
  assert.equal(extracted.items[0].requester, "Lan");
  assert.equal(extracted.items[0].kind, "create_form");
  const fenced = await extractActions({
    transcript: "x",
    llm: scriptedLlm("```json\n{\"items\":[]}\n```"),
  });
  assert.equal(fenced.ok, true);
  assert.deepEqual(fenced.items, []);
  const broken = await extractActions({ transcript: "x", llm: scriptedLlm("not json") });
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.errors, ["json"]);
  assert.equal(validateActions({ items: [{ kind: "assign_task", requester: "Mai", summary: "File\nthe ticket", where: "Linear" }] }).ok, false);
});

test("the checklist is one line per item with Approve, Edit, and Skip", () => {
  const line = actionLine(formItem);
  assert.equal(line, "Create Google Form 'Retro' in your Google Drive");
  const blocks = actionChecklistBlocks([formItem]);
  const reply = { text: line, blocks };
  const checked = checkReply(reply, { mode: "slack", kind: "action_dm", wherePhrase: "in your Google Drive" });
  assert.equal(checked.ok, true, JSON.stringify(checked.violations));
  assert.equal(blocks[1].elements.map((element) => element.value).join(","), "form-retro,form-retro,form-retro");
});

test("only Approve runs the item, and only the requester can approve", async () => {
  const store = createMemoryActionStore();
  const posts = [];
  const modals = [];
  const runs = [];
  const slack = {
    async openConversation() { return { channel: { id: "D1" } }; },
    async postMessage(body) { posts.push(body); return { ts: "1710000000.000200" }; },
    async openModal(body) { modals.push(body); },
  };
  const connectors = {
    async run(item) {
      runs.push(item.id);
      return { ok: true, link: "https://docs.google.com/forms/d/retro", text: "created" };
    },
  };
  const sent = await sendActionDms({ items: [formItem, { ...formItem, id: "no-slack", requesterSlackId: "" }], slack, store });
  assert.deepEqual(sent.undelivered, ["no-slack"]);
  assert.equal(runs.length, 0);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].channel, "D1");
  assert.equal(posts[0].username, "Adam");
  const stored = await store.get("form-retro");
  assert.equal(stored.status, "pending");
  assert.equal(stored.botName, "Adam");
  assert.equal(stored.threadTs, "1710000000.000200");

  const stranger = await handleActionPayload({
    payload: payload("approve:form-retro", "UOTHER"),
    store,
    slack,
    connectors,
  });
  assert.equal(stranger.error, "not_requester");
  assert.equal(stranger.ran, false);
  assert.equal(runs.length, 0);

  const skipped = await handleActionPayload({
    payload: payload("skip:form-retro", "U04LAN"),
    store,
    slack,
    connectors,
  });
  assert.equal(skipped.ran, false);
  assert.equal((await store.get("form-retro")).status, "skipped");
  assert.equal(posts.at(-1).thread_ts, "1710000000.000200");
  assert.match(posts.at(-1).text, /Skipped/);
  assert.equal(posts.at(-1).username, "Adam");
  assert.equal(runs.length, 0);

  await store.update("form-retro", { status: "pending" });
  const edited = await handleActionPayload({
    payload: payload("edit:form-retro", "U04LAN"),
    store,
    slack,
    connectors,
  });
  assert.equal(edited.modal, true);
  assert.equal(edited.ran, false);
  assert.equal(modals[0].view.callback_id, "edit:form-retro");
  assert.equal(runs.length, 0);

  const approved = await handleActionPayload({
    payload: payload("approve:form-retro", "U04LAN"),
    store,
    slack,
    connectors,
  });
  assert.equal(approved.ran, true);
  assert.equal(approved.status, "done");
  assert.equal(runs.length, 1);
  assert.equal(posts.at(-1).thread_ts, "1710000000.000200");
  assert.match(posts.at(-1).text, /https:\/\/docs\.google\.com\/forms\/d\/retro/);

  const again = await handleActionPayload({
    payload: payload("approve:form-retro", "U04LAN"),
    store,
    slack,
    connectors,
  });
  assert.equal(again.error, "closed");
  assert.equal(runs.length, 1);
});

test("edit without a modal asks in the same thread and does not run", async () => {
  const store = createMemoryActionStore();
  await store.put({ ...formItem, status: "pending", channelId: "D1", threadTs: "171.1" });
  const posts = [];
  const slack = { async postMessage(body) { posts.push(body); return { ts: "171.2" }; } };
  let ran = false;
  const result = await handleActionPayload({
    payload: { type: "block_actions", user: { id: "U04LAN" }, channel: { id: "D1" }, message: { ts: "171.1" }, actions: [{ action_id: "edit:form-retro", value: "form-retro" }] },
    store,
    slack,
    connectors: { async run() { ran = true; return { ok: true }; } },
  });
  assert.equal(result.modal, false);
  assert.equal(ran, false);
  assert.match(posts[0].text, /What should change/);
  assert.equal(posts[0].thread_ts, "171.1");
});

test("action posts use the workspace bot name and leave the line unchanged", async () => {
  const store = createMemoryActionStore();
  const posts = [];
  const slack = {
    async openConversation() { return { channel: { id: "D9" } }; },
    async postMessage(body) { posts.push(body); return { ts: "171.9" }; },
  };
  await sendActionDms({ items: [formItem], slack, store, botName: "Lan" });
  assert.equal(posts[0].username, "Lan");
  assert.equal(posts[0].text.includes("Lan"), false);
  assert.equal((await store.get("form-retro")).botName, "Lan");
  await handleActionPayload({
    payload: { type: "block_actions", user: { id: "U04LAN" }, channel: { id: "D9" }, message: { ts: "171.9" }, actions: [{ action_id: "skip:form-retro", value: "form-retro" }] },
    store,
    slack,
    connectors: { async run() { return { ok: true }; } },
    botName: "Mai",
  });
  assert.equal(posts.at(-1).username, "Mai");
  assert.match(posts.at(-1).text, /Skipped/);
});

test("a form-encoded payload is accepted", () => {
  const parsed = parseActionPayload("payload=" + encodeURIComponent(JSON.stringify({ actions: [{ value: "form-retro" }] })));
  assert.equal(parsed.actions[0].value, "form-retro");
});

test("runApprovedAction uses the injected connector and calendar ports", async () => {
  const calls = [];
  const form = await runApprovedAction(formItem, {
    formsConnector: { url: "https://forms.example/mcp" },
    callTool: async (connector, name, args) => {
      calls.push({ connector, name, args });
      return { ok: true, text: "Created https://docs.google.com/forms/d/abc" };
    },
  });
  assert.equal(form.ok, true);
  assert.equal(form.link, "https://docs.google.com/forms/d/abc");
  assert.equal(calls[0].name, "create_form");
  const calendar = await runApprovedAction(
    { ...formItem, id: "cal", kind: "edit_calendar", tool: "update_event", args: { id: "evt" } },
    { calendar: { async updateEventDetails(args) { calls.push(args); return { htmlLink: "https://calendar.google.com/event?eid=evt" }; } } },
  );
  assert.equal(calendar.link, "https://calendar.google.com/event?eid=evt");
  const missing = await runApprovedAction({ ...formItem, kind: "other", tool: "custom_tool" }, { callTool: async () => ({ ok: true, text: "" }) });
  assert.equal(missing.ok, false);
  assert.match(missing.next, /Connect the tool/);
});

function payload(actionId, userId) {
  return {
    type: "block_actions",
    trigger_id: "trigger-1",
    user: { id: userId },
    channel: { id: "D1" },
    message: { ts: "1710000000.000200" },
    actions: [{ action_id: actionId, value: "form-retro" }],
  };
}
