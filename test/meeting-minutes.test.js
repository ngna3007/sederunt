import assert from "node:assert/strict";
import test from "node:test";
import { checkReply } from "../src/bot/persona.js";
import { decideMinutesDelivery, renderMinutes, sendMinutes } from "../src/meeting/minutes.js";

const people = [
  { email: "a@ex.com", slackUserId: "UA", attended: true },
  { email: "b@ex.com", slackUserId: "UB", attended: true },
  { email: "c@ex.com", slackUserId: null, attended: true },
  { email: "d@ex.com", slackUserId: "UD", attended: false },
  { email: "e@ex.com", slackUserId: null, attended: false },
];

function ids(list, key = "email") {
  return list.map((row) => row[key]);
}

function assertNeverBoth(plan) {
  if (plan.postToChannel) assert.deepEqual(plan.dms, []);
}

test("minutes lead with a TL;DR and omit empty sections", () => {
  const text = renderMinutes({
    tldr: "Ship the booth on Friday.",
    decisions: [
      { text: "Ship the booth on Friday.", at: "12:04" },
      { text: "Keep the map.", at: "12:05" },
      { text: "Three.", at: "12:06" },
      { text: "Four.", at: "12:07" },
      { text: "Five.", at: "12:08" },
      { text: "Six should drop.", at: "12:09" },
    ],
    actions: [{ text: "Order the banners", ownerSlackId: "U04MAI", due: "Thursday", at: "12:10" }],
    questions: [],
    notReached: [{ email: "c@ex.com" }],
  });
  assert.match(text, /^TL;DR: Ship the booth on Friday\./);
  assert.match(text, /\*Decisions\*/);
  assert.match(text, /\*Action items\*/);
  assert.doesNotMatch(text, /\*Open questions\*/);
  assert.doesNotMatch(text, /Six should drop/);
  assert.match(text, /• Order the banners — <@U04MAI>, Thursday \(12:10\)/);
  assert.match(text, /Not reached: c@ex.com/);
  const unclear = renderMinutes({
    tldr: "Someone should order banners.",
    decisions: [{ text: "Order banners later", at: "12:04" }],
    actions: [{ text: "Order the banners", ownerName: "Mai" }],
  });
  assert.match(unclear, /• Order banners later \(12:04\)/);
  assert.match(unclear, /• Order the banners — owner\?, due\?$/m);
  assert.doesNotMatch(unclear, /<@/);
  const checked = checkReply({ text }, { mode: "slack", kind: "minutes" });
  assert.equal(checked.ok, true, JSON.stringify(checked.violations));
  const unclearCheck = checkReply({ text: unclear }, { mode: "slack", kind: "minutes", unclearOwner: true, unclearDue: true });
  assert.equal(unclearCheck.violations.some((item) => item.rule === "cite_transcript"), true);
  assert.equal(unclearCheck.violations.some((item) => item.rule === "no_invented_owner"), false);
});

test("the delivery table never posts to a channel and DMs everyone", () => {
  const cases = [
    {
      name: "binding channel",
      meeting: { bindingChannelId: "C_BIND", inviteChannelId: "C_INVITE", people },
      channel: "C_BIND",
      source: "binding",
      dms: [],
      notReached: ["c@ex.com", "e@ex.com"],
    },
    {
      name: "invite channel only",
      meeting: { inviteChannelId: "C_INVITE", people },
      channel: "C_INVITE",
      source: "invite",
      dms: [],
      notReached: ["c@ex.com", "e@ex.com"],
    },
    {
      name: "no channel DMs attendees only",
      meeting: { people },
      channel: "",
      dms: ["UA", "UB"],
      notReached: ["c@ex.com"],
      absent: ["d@ex.com", "e@ex.com"],
    },
    {
      name: "private 1:1 ignores a named channel",
      meeting: { privateOneToOne: true, bindingChannelId: "C_BIND", inviteChannelId: "C_INVITE", people: people.slice(0, 3) },
      channel: "",
      dms: ["UA", "UB"],
      notReached: ["c@ex.com"],
    },
    {
      name: "email sender takes unmatched attendees",
      meeting: { emailSending: true, people },
      channel: "",
      dms: ["UA", "UB"],
      email: ["c@ex.com"],
      notReached: [],
    },
    {
      name: "email sender with a channel still does not DM",
      meeting: { emailSending: true, bindingChannelId: "C_BIND", people },
      channel: "C_BIND",
      dms: [],
      email: ["c@ex.com", "e@ex.com"],
      notReached: [],
    },
  ];
  for (const item of cases) {
    const plan = decideMinutesDelivery(item.meeting);
    assertNeverBoth(plan);
    assert.equal(plan.postToChannel?.channelId || "", item.channel, item.name);
    if (item.source) assert.equal(plan.postToChannel.source, item.source, item.name);
    assert.deepEqual(ids(plan.dms, "slackUserId"), item.dms, item.name);
    assert.deepEqual(ids(plan.notReached), item.notReached, item.name);
    if (item.email) assert.deepEqual(ids(plan.email), item.email, item.name);
    else assert.deepEqual(plan.email, [], item.name);
    const delivered = new Set([...ids(plan.dms), ...ids(plan.email), ...ids(plan.notReached)]);
    for (const email of item.absent || []) assert.equal(delivered.has(email), false, item.name);
  }
});

test("sendMinutes posts once to the channel, or DMs attendees, and does not email yet", async () => {
  const minutes = {
    tldr: "Ship the booth on Friday.",
    decisions: [{ text: "Ship the booth on Friday.", at: "12:04" }],
    actions: [{ text: "Order the banners", ownerSlackId: "U04MAI", due: "Thursday", at: "12:10" }],
  };
  const channelCalls = [];
  const channelSlack = {
    async openConversation() { channelCalls.push("open"); return { channel: "DNO" }; },
    async postMessage(body) { channelCalls.push(body); return { ts: "1.2" }; },
  };
  const posted = await sendMinutes({
    meeting: { bindingChannelId: "C_BIND", people },
    minutes,
    slack: channelSlack,
    emailSender: async () => { throw new Error("email should not run"); },
  });
  assert.equal(posted.plan.postToChannel.channelId, "C_BIND");
  assert.equal(posted.sent.length, 1);
  assert.equal(posted.sent[0].kind, "channel");
  assert.equal(channelCalls.filter((call) => call === "open").length, 0);
  assert.match(posted.text, /Not reached: c@ex.com, e@ex.com/);
  assert.equal(posted.emailed.length, 0);

  const dmCalls = [];
  const dmSlack = {
    async openConversation({ users }) { dmCalls.push(users); return { channel: { id: `D${users}` } }; },
    async postMessage(body) { dmCalls.push(body.channel); return { ts: "1.3" }; },
  };
  const dmed = await sendMinutes({ meeting: { people }, minutes, slack: dmSlack });
  assert.equal(dmed.plan.postToChannel, null);
  assert.deepEqual(dmCalls, ["UA", "DUA", "UB", "DUB"]);
  assert.match(dmed.text, /Not reached: c@ex.com/);
  assert.doesNotMatch(dmed.text, /d@ex.com/);

  const mailed = [];
  const emailed = await sendMinutes({
    meeting: { emailSending: true, people: [people[2]] },
    minutes,
    slack: { async openConversation() { throw new Error("no dm"); }, async postMessage() { throw new Error("no post"); } },
    emailSender: async ({ to }) => { mailed.push(to); },
  });
  assert.deepEqual(mailed, ["c@ex.com"]);
  assert.doesNotMatch(emailed.text, /Not reached/);
});
