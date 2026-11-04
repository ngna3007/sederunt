/**
 * Where minutes go, and the text they use.
 *
 * A channel post and a DM-to-everyone are never both used. A private 1:1
 * never posts to a channel. People who were invited and did not attend
 * only see a channel post. Until an email sender exists, an invitee with
 * no Slack match is listed in the minutes as not reached instead of emailed.
 */

const SECTION_CAP = 5;

export function renderMinutes({ tldr = "", decisions = [], actions = [], questions = [], notReached = [] } = {}) {
  const lines = [`TL;DR: ${String(tldr || "").trim() || "No summary."}`];
  pushSection(lines, "Decisions", decisions.slice(0, SECTION_CAP).map((item) => decisionBullet(item)));
  pushSection(lines, "Action items", actions.slice(0, SECTION_CAP).map((item) => actionBullet(item)));
  pushSection(lines, "Open questions", questions.slice(0, SECTION_CAP).map((item) => `• ${String(item.text || item).trim()}`).filter((line) => line !== "•"));
  const missed = (notReached || []).map((person) => String(person.email || person).trim()).filter(Boolean);
  if (missed.length) lines.push("", `Not reached: ${missed.join(", ")}`);
  return lines.join("\n");
}

function pushSection(lines, title, bullets) {
  const kept = bullets.filter(Boolean);
  if (kept.length === 0) return;
  lines.push("", `*${title}*`, ...kept);
}

function decisionBullet(item) {
  const text = String(item?.text || "").trim();
  if (!text) return "";
  const time = stamp(item.at);
  return time ? `• ${text} ${time}` : `• ${text}`;
}

function actionBullet(item) {
  const text = String(item?.text || "").trim();
  if (!text) return "";
  const owner = ownerToken(item.ownerSlackId);
  const due = String(item?.due || "").trim() || "due?";
  const time = stamp(item.at);
  return `• ${text} — ${owner}, ${due}${time ? ` ${time}` : ""}`;
}

function ownerToken(id) {
  const clean = String(id || "").replace(/[<>@]/g, "").trim();
  if (!/^U[A-Z0-9]+$/.test(clean)) return "owner?";
  return `<@${clean}>`;
}

function stamp(at) {
  const match = String(at || "").match(/\b\d{1,2}:\d{2}\b/);
  return match ? `(${match[0]})` : "";
}

/**
 * @param {{
 *   privateOneToOne?: boolean,
 *   bindingChannelId?: string,
 *   inviteChannelId?: string,
 *   emailSending?: boolean,
 *   people?: Array<{ email: string, slackUserId?: string | null, attended?: boolean }>,
 * }} meeting
 */
export function decideMinutesDelivery(meeting = {}) {
  const people = Array.isArray(meeting.people) ? meeting.people : [];
  const emailSending = meeting.emailSending === true;
  const channelId = meeting.privateOneToOne
    ? ""
    : String(meeting.bindingChannelId || meeting.inviteChannelId || "").trim();
  const source = meeting.privateOneToOne
    ? ""
    : (meeting.bindingChannelId ? "binding" : (meeting.inviteChannelId ? "invite" : ""));
  const postToChannel = channelId ? { channelId, source } : null;
  const dms = [];
  const email = [];
  const notReached = [];

  for (const person of people) {
    const emailAddress = String(person.email || "").trim().toLowerCase();
    const slackUserId = person.slackUserId || null;
    const attended = person.attended === true;
    if (postToChannel) {
      if (!slackUserId && emailAddress) pushUnmatched({ email, notReached, emailSending, emailAddress });
      continue;
    }
    if (attended && slackUserId) dms.push({ email: emailAddress, slackUserId });
    else if (attended && !slackUserId && emailAddress) pushUnmatched({ email, notReached, emailSending, emailAddress });
  }

  if (postToChannel) return { postToChannel, dms: [], email, notReached };
  return { postToChannel: null, dms, email, notReached };
}

function pushUnmatched({ email, notReached, emailSending, emailAddress }) {
  if (emailSending) email.push({ email: emailAddress });
  else notReached.push({ email: emailAddress });
}

/**
 * @param {{ meeting: object, minutes: object, slack: { openConversation: Function, postMessage: Function }, emailSender?: Function }} input
 */
export async function sendMinutes({ meeting, minutes, slack, emailSender }) {
  const plan = decideMinutesDelivery(meeting);
  const text = renderMinutes({ ...(minutes || {}), notReached: plan.notReached });
  const sent = [];
  if (plan.postToChannel) {
    const posted = await slack.postMessage({ channel: plan.postToChannel.channelId, text });
    sent.push({ kind: "channel", channel: plan.postToChannel.channelId, ts: posted?.ts || "" });
  } else {
    for (const dm of plan.dms) {
      const opened = await slack.openConversation({ users: dm.slackUserId });
      const channel = opened.channel?.id || opened.channel;
      const posted = await slack.postMessage({ channel, text });
      sent.push({ kind: "dm", channel, slackUserId: dm.slackUserId, ts: posted?.ts || "" });
    }
  }
  const emailed = [];
  if (plan.email.length && typeof emailSender === "function") {
    for (const row of plan.email) {
      await emailSender({ to: row.email, text });
      emailed.push(row.email);
    }
  }
  return { plan, text, sent, emailed };
}
