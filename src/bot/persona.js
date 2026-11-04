/**
 * The bot's speaking rules, learned from Slackbot's public self-description
 * and from public voice-agent guidance. Slackbot's private prompt is not
 * in this module. See docs/design/bot-behavior.md.
 *
 * The product is Sederunt. The persona name defaults to Adam and is the
 * workspace bot name when one is passed.
 *
 * `buildSystemPrompt({ mode, preferences, language, botName })` selects one surface.
 * `BOT_SYSTEM_PROMPT` is the slack-mode prompt with no stored preferences.
 * `checkReply` is a deterministic checker. It does not call a model.
 */

import { DEFAULT_BOT_NAME, normalizeBotName } from "./identity.js";

export const MODES = Object.freeze(["live_voice", "meeting_chat", "slack"]);

export const REPLY_RULES = Object.freeze([
  "answer_first",
  "scannable",
  "grounded",
  "real_mentions",
  "matched_tone",
  "light_emoji",
  "action_over_suggestion",
  "no_broadcast",
  "thread_reply",
  "one_question",
  "language",
  "confirm_writes",
  "honest",
  "failed_next",
  "minutes_shape",
  "cite_transcript",
  "no_invented_owner",
  "action_dm",
  "result_link",
  "preferences",
  "natural_speech",
  "contractions",
  "not_robotic",
  "spoken_time",
  "addressed_only",
  "yield_floor",
  "meeting_short",
]);

const CORE = `You are {{name}}, a meeting bot. Be easy to understand and helpful.
Be honest. Say what you did and what you did not do. When something fails, say what failed and the next step.
Writes (send, create, edit, delete) always need explicit confirmation before they run. After a write runs, report the result with a link.
When an instruction is ambiguous, ask one short question. Do not ask a second question in the same reply.
Never use @channel, @here, @everyone, <!channel>, <!here>, or <!everyone>.
Reply in the user's language. This team uses Vietnamese and English.
When someone says "remember this", that line is a preference. Apply stored preferences. A user preference wins over the workspace preference for that person.`;

const SLACK = `Mode: slack.
Answer first. Lead with the answer in the first sentence. No preamble, no restating the question, no closing summary.
Be short and scannable. Prefer brief bullets over paragraphs. Use a table when you compare structured data. Do not post a wall of headings.
When you draw on a Slack message, file, or canvas, cite it as (source: …). When you use general knowledge, say it is general knowledge.
Use live mentions: <@U…> for people and <#C…> for channels. Do not use plain-text names or plain #names.
Match the user's tone. Be direct and friendly. Be terse with a terse user. Use emoji lightly, or not at all.
When asked to do something, do it instead of describing how. A write still waits for confirmation.
Reply in the thread. Set thread_ts.
Minutes use this shape: a TL;DR line first, then the sections Decisions, Action items, and Open questions. About 5 bullets maximum in a section. Omit an empty section. Cite the transcript time like (12:04) on each decision and each action item. The owner is a Slack mention plus a due date. When the owner or the date is unclear, write owner? and due?. Never invent an owner or a date.
An action DM is one line per item: a verb and an object, then Approve, Edit, and Skip. Say exactly what will happen and where, for example: Create Google Form 'Retro' in your Google Drive.`;

const MEETING_CHAT = `Mode: meeting_chat.
Answer first, in a short reply. Include a link when it helps. Do not write a long post or a wall of headings.
Confirm before any write. Be honest. Ask one short question when the instruction is ambiguous. Never use @channel or @here. Match the room's language.`;

const LIVE_VOICE = `Mode: live_voice. You are speaking aloud in the meeting, the way people talk to each other.
There is no sentence-count limit. Match the turn to the moment: a quick acknowledgement when that fits, a fuller spoken explanation when someone asks.
Use contractions and natural spoken phrasing. A light filler is fine when it fits, such as "sure" or "right, so".
Refer back to what people said, by name.
Do not use lists, markdown, URLs, or read out ids. Say numbers and times the way people speak them, such as "half past two", not "14:30".
Check understanding the way a person would.
Yield the floor. Stop when interrupted. Do not monologue.
Speak only when someone addresses you as {{name}}. Do not interrupt.
Match the room's language and formality.
A write is not done during the call. Say that it goes for approval after the call, for example: Sure, I'll send that to Lan for approval after the call. Never claim a write is done.`;

const LANGUAGE_LINE = {
  vi: "Reply in Vietnamese.",
  en: "Reply in English.",
};

const IDENTITY_KEYS = new Set(["bot_name", "wake_phrases"]);

/**
 * @param {{ mode?: "live_voice" | "meeting_chat" | "slack", preferences?: { applied?: Record<string, string>, workspace?: Record<string, string>, user?: Record<string, string> } | null, language?: string, botName?: string }} [options]
 */
export function buildSystemPrompt({ mode = "slack", preferences = null, language = "", botName = "" } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  const name = normalizeBotName(botName) || normalizeBotName(preferences?.workspace?.bot_name) || DEFAULT_BOT_NAME;
  const surface = mode === "live_voice" ? LIVE_VOICE : mode === "meeting_chat" ? MEETING_CHAT : SLACK;
  const languageLine = LANGUAGE_LINE[language] || "Reply in the language of the latest user message.";
  const preferenceLine = formatPreferences(preferences);
  return [CORE, surface, languageLine, preferenceLine].filter(Boolean).join("\n\n").replaceAll("{{name}}", name);
}

export const BOT_SYSTEM_PROMPT = buildSystemPrompt({ mode: "slack" });

function formatPreferences(preferences) {
  const applied = appliedPreferences(preferences);
  const lines = Object.entries(applied).filter(([key, value]) => !IDENTITY_KEYS.has(key) && String(value || "").trim());
  if (lines.length === 0) return "";
  const body = lines.map(([key, value]) => `- ${key}: ${value}`).join("\n");
  return `Stored preferences (a user preference wins over the workspace preference):\n${body}`;
}

function appliedPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") return {};
  if (preferences.applied && typeof preferences.applied === "object") return preferences.applied;
  return { ...(preferences.workspace || {}), ...(preferences.user || {}) };
}

const PREAMBLE = /^(great question|good question|thanks for asking|thank you for asking|happy to help|i'd be happy|absolutely[,!]|certainly[,!]|of course[,!]|let me explain|sure thing|hi there|hello[!,]|as an ai)/i;
const RESTATE = /you asked|you wanted to know|to answer your question|rephrasing your|as you (just )?asked/i;
const CLOSING = /hope this helps|hope that helps|let me know if you need|in summary|to summarize|feel free to ask|to wrap up/i;
const BROADCAST = /<!channel>|<!here>|<!everyone>|@channel\b|@here\b|@everyone\b/i;
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const CONTRACTION = /\b(I'm|I've|I'll|I'd|it's|that's|we're|we'll|we've|don't|doesn't|didn't|can't|won't|you're|they're|let's|there's|here's|what's|isn't|aren't|couldn't|shouldn't)\b/;
const ROBOTIC = /task queued|request acknowledged|processing your request|as an ai language model/i;
const CLOCK = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
const DONE_CLAIM = /\b(i've|i have|i already)\s+(sent|created|deleted|updated|posted|filed)\b|\b(done|sent|created|deleted|updated)\b[,.!]|task queued|request acknowledged|all set|i sent it|i created|it's done/i;
const ASKS_CONFIRM = /confirm|approve|ok to|shall i|should i|once you|after you|want me to|for approval|after the call/i;
const HOW_TO = /here's how|here is how|you can (open|go|click)|you should open|first, open|step 1/i;
function emojiCount(text) {
  const found = String(text).match(/\p{Extended_Pictographic}/gu);
  return found ? found.length : 0;
}
const LIVE_MENTION = /<@U[A-Z0-9]+>/;
const LIVE_CHANNEL = /<#C[A-Z0-9]+(?:\|[^>]+)?>/;
const MARKDOWN = /```|\*\*|__|^#{1,6}\s|\[([^\]]+)\]\(https?:/m;
const BULLET = /^[\s]*([-*•]|\d+\.)\s/m;
const URL = /https?:\/\/\S+/;
const SLACK_ID = /<@[A-Z0-9]+>|<#C[A-Z0-9]+>|\b[UC][A-Z0-9]{8,}\b/;

/**
 * @param {string | { text?: string, thread_ts?: string, blocks?: unknown[] }} reply
 * @param {Record<string, unknown>} [context]
 * @returns {{ ok: boolean, violations: Array<{ rule: string, detail: string }> }}
 */
export function checkReply(reply, context = {}) {
  const mode = MODES.includes(context.mode) ? context.mode : "slack";
  const text = replyText(reply);
  const violations = [];
  const add = (rule, detail) => {
    if (!violations.some((item) => item.rule === rule)) violations.push({ rule, detail });
  };

  if (BROADCAST.test(text)) add("no_broadcast", "broadcast mention");

  if (mode === "live_voice" && context.addressed === false) {
    if (text.trim()) add("addressed_only", "spoke without being addressed");
    return finish(violations);
  }

  if (RESTATE.test(text) || CLOSING.test(text)) add("answer_first", "preamble, restatement, or closing summary");
  if (mode === "live_voice") {
    if (/great question|good question|thanks for asking|happy to help/i.test(text)) add("answer_first", "preamble");
  } else if (PREAMBLE.test(text.trim())) {
    add("answer_first", "preamble");
  }

  if (context.language === "vi" && !VIETNAMESE.test(text)) add("language", "expected Vietnamese");
  if (context.language === "en" && VIETNAMESE.test(text)) add("language", "expected English");

  if (context.ambiguous === true) {
    const questions = text.match(/\?/g) || [];
    const sentence = text.match(/[^.!\n]*\?/)?.[0] || "";
    if (questions.length !== 1 || sentence.trim().length > 140) add("one_question", "expected one short question");
  }

  if (context.writeRequested === true && context.confirmed !== true) {
    const asks = ASKS_CONFIRM.test(text);
    const claimsDone = DONE_CLAIM.test(text);
    if (!asks || claimsDone) add("confirm_writes", "write ran or was not offered for confirmation");
    if (mode === "live_voice" && !/after the call|for approval/i.test(text)) {
      add("confirm_writes", "a live write must wait for approval after the call");
    }
  }

  if (context.expectsAccounting === true) {
    const negative = /did not|didn't|have not|haven't|not done|i won't|i did not/i.test(text);
    const positive = /\b(i|i've)\s+(posted|sent|saved|recorded|updated|moved|created|noted|will|can|asked)\b/i.test(text);
    if (!negative || !positive) add("honest", "say what you did and what you did not do");
  }

  if (context.failed === true) {
    const failed = /couldn't|could not|failed|didn't work|can't|cannot/i.test(text);
    const next = /next:|retry|try again|then i'll|check the/i.test(text);
    if (!failed || !next) add("failed_next", "say what failed and the next step");
  }

  const mustSay = [].concat(context.mustSay || []).filter(Boolean);
  if (mustSay.some((phrase) => !text.includes(String(phrase)))) add("preferences", "stored preference missing from the reply");

  if (context.kind === "minutes") addMinutes(text, context, add);
  if (context.kind === "action_dm") addActionDm(reply, context, add);

  if (mode === "slack" && context.kind !== "minutes" && context.kind !== "action_dm" && context.requireThread !== false) {
    const thread = (reply && typeof reply === "object" && reply.thread_ts) || "";
    if (!String(thread).trim()) add("thread_reply", "thread_ts is not set");
  }

  if (mode === "slack" && context.kind !== "minutes" && context.kind !== "action_dm") {
    addScannable(text, context, add);
    addSlackTone(text, context, add);
  }

  if (mode === "meeting_chat") addMeetingShort(text, add);

  if (mode === "live_voice") addLiveVoice(text, context, add);

  if (context.afterWrite === true && mode !== "live_voice" && !URL.test(text)) {
    add("result_link", "the result has no link");
  }

  return finish(violations);
}

function finish(violations) {
  return { ok: violations.length === 0, violations };
}

function replyText(reply) {
  if (typeof reply === "string") return reply;
  return String(reply?.text || "");
}

function addScannable(text, context, add) {
  if (/^#{1,6}\s/m.test(text) || text.length > 1200) add("scannable", "heading wall or over the length cap");
  const sentences = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const hasBreak = BULLET.test(text) || text.includes("|") || text.includes("\n");
  if (sentences.length >= 5 && !hasBreak) add("scannable", "paragraph instead of bullets");
  if (context.compare === true && !text.includes("|")) add("scannable", "comparison is not a table");
}

function addSlackTone(text, context, add) {
  if (emojiCount(text) > 1) add("light_emoji", "more than one emoji");
  if (context.terseUser === true) {
    const sentences = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
    if (text.length > 80 || sentences.length > 2) add("matched_tone", "too long for a terse user");
  }
  if (context.expectsCitation === true && !/general knowledge/i.test(text) && !/\(source:[^)]+\)/i.test(text)) {
    add("grounded", "no source and not marked general knowledge");
  }
  const people = context.peopleNames || [];
  const channels = context.channelNames || [];
  if (people.length || channels.length) {
    const plainPerson = people.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text));
    const plainChannel = channels.some((name) => new RegExp(`(^|\\s)#${escapeRegExp(name)}\\b`).test(text));
    if ((people.length && (!LIVE_MENTION.test(text) || plainPerson)) || (channels.length && (!LIVE_CHANNEL.test(text) || plainChannel))) {
      add("real_mentions", "plain-text name instead of a live mention");
    }
  }
  if (context.askedToAct === true && HOW_TO.test(text)) add("action_over_suggestion", "described how instead of doing it");
}

function addMeetingShort(text, add) {
  if (text.length > 320 || text.split("\n").length > 4 || /^#{1,6}\s/m.test(text)) {
    add("meeting_short", "meeting chat reply is a long post");
  }
}

function addLiveVoice(text, context, add) {
  if (BULLET.test(text) || MARKDOWN.test(text) || URL.test(text) || SLACK_ID.test(text) || emojiCount(text) > 0) {
    add("natural_speech", "lists, markdown, URLs, ids, or emoji");
  }
  if (ROBOTIC.test(text)) add("not_robotic", "robotic acknowledgement");
  if (CLOCK.test(text)) add("spoken_time", "clock time instead of spoken time");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (context.language !== "vi" && words >= 8 && !CONTRACTION.test(text)) add("contractions", "no contraction in a spoken turn");
  if (context.interrupted === true && words > 12) add("yield_floor", "kept speaking after an interruption");
}

function addMinutes(text, context, add) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines[0] || !lines[0].startsWith("TL;DR")) add("minutes_shape", "TL;DR is not the first line");
  const headers = lines.filter((line) => /^\*[^*]+\*$/.test(line));
  const allowed = new Set(["*Decisions*", "*Action items*", "*Open questions*"]);
  if (headers.some((header) => !allowed.has(header))) add("minutes_shape", "unexpected section");
  for (const header of ["Decisions", "Action items", "Open questions"]) {
    const bullets = sectionBullets(text, header);
    const present = headers.includes(`*${header}*`);
    if (present && bullets.length === 0) add("minutes_shape", `${header} is empty`);
    if (bullets.length > 5) add("minutes_shape", `${header} has more than 5 bullets`);
  }
  const decisions = sectionBullets(text, "Decisions");
  const actions = sectionBullets(text, "Action items");
  const cited = [...decisions, ...actions];
  if (cited.length === 0 || cited.some((line) => !/\(\d{1,2}:\d{2}\)/.test(line))) {
    add("cite_transcript", "decision or action item has no transcript time");
  }
  if (actions.some((line) => !/(<@U[A-Z0-9]+>|owner\?)/.test(line) || !/(due\?|,\s+\S+)/.test(line))) {
    add("minutes_shape", "action item needs an owner mention and a due date");
  }
  if (context.unclearOwner === true && (!text.includes("owner?") || LIVE_MENTION.test(text))) {
    add("no_invented_owner", "owner was invented");
  }
  if (context.unclearDue === true && !text.includes("due?")) add("no_invented_owner", "due date was invented");
}

function addActionDm(reply, context, add) {
  const blocks = reply && typeof reply === "object" && Array.isArray(reply.blocks) ? reply.blocks : [];
  const sections = blocks.filter((block) => block?.type === "section");
  const rows = blocks.filter((block) => block?.type === "actions");
  if (sections.length === 0 || sections.length !== rows.length) {
    add("action_dm", "each item needs one line and Approve, Edit, Skip");
    return;
  }
  sections.forEach((section, index) => {
    const line = String(section.text?.text || "");
    if (!line || line.includes("\n") || line.length > 180) add("action_dm", "item is not one short line");
    const row = rows[index];
    const labels = (row.elements || []).map((element) => element.text?.text);
    if (labels.join(",") !== "Approve,Edit,Skip") add("action_dm", "Approve, Edit, and Skip are required");
    for (const element of row.elements || []) {
      if (!element.value || !/^(approve|edit|skip):/.test(String(element.action_id || ""))) {
        add("action_dm", "action_id and value must carry the item id");
      }
    }
  });
  const where = String(context.wherePhrase || "");
  const blob = sections.map((section) => section.text?.text || "").join(" ");
  if (where && !blob.includes(where)) add("action_dm", "the line does not say where the write happens");
}

function sectionBullets(text, title) {
  const match = text.match(new RegExp(`\\*${escapeRegExp(title)}\\*\\n([\\s\\S]*?)(?=\\n\\*|\\nNot reached:|$)`));
  const body = match?.[1] || "";
  return body.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("•"));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
