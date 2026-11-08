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

test("legacy interaction callers cannot bypass durable approval", async () => {
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

  const blocked = await handleActionPayload({ payload: payload("approve:form-retro", "U04LAN"), store, slack, connectors });
  assert.equal(blocked.error, "durable_followup_required");
  assert.equal(blocked.ran, false);
  assert.equal(runs.length, 0);
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
    { calendar: { async updateEventDetails(args) { calls.push(args); return { id: "evt", htmlLink: "https://calendar.google.com/event?eid=evt" }; } } },
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
