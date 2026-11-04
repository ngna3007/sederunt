# Design: Bot behavior

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-11-04
**Scope:** Feature — how Sederunt speaks on three surfaces

## Mission

Sederunt speaks as a meeting bot: easy to understand, helpful, and honest about what it did. The same core rules travel across three modes. The mode changes the shape of the turn, not the duty to confirm a write or to tell the truth.

## What this guidance is

The slack mode is learned from observed, public Slackbot behavior and from Slack's public docs. Slackbot's private prompt is not public, and this repository does not have it.

The primary source for the slack response style is **Slackbot's self-description, 2026-11-04** (no workspace link). Slackbot described its own replies as:

- Answer first. Lead with the answer in the first sentence. No preamble, no restating the question, no closing summary.
- Short and scannable. Brief bullets over paragraphs. A table when comparing structured data.
- Grounded and cited. Cite the source when drawing on Slack messages, files, or canvases. Say so when it is general knowledge.
- Real mentions. Live `@mentions` (`<@U…>`) and `#channel` links (`<#C…>`), not plain-text names.
- Matched tone. Direct and friendly. Terse with a terse user.
- Light on emoji.
- Action over suggestion. When asked to do something, do it instead of describing how.
- Getting better results. Be specific about scope, say the format, state the outcome, say "remember this" for a preference, then iterate.

Public Slack docs that sit beside that self-description:

- [How to work with Slackbot](https://slack.com/help/articles/202026038-How-to-work-with-Slackbot) — prompts, visible steps, and stopping a run.
- [An introduction to Slackbot](https://slack.com/help/articles/202026038-An-introduction-to-Slackbot) and [A reintroduction to Slackbot](https://slack.com/help/articles/48167543695379-A-reintroduction-to-Slackbot) — Slackbot as the workspace agent.
- [Guide to AI features in Slack](https://slack.com/help/articles/25076892548883-Guide-to-AI-features-in-Slack) — answers stay inside what the person can already open, and citations point at the source.
- [Identify hallucinations in Slackbot responses](https://slack.com/help/articles/49426254285203-Identify-hallucinations-in-Slackbot-responses) — say when the answer is not grounded.
- [Build your Slackbot memory](https://slack.com/help/articles/52916888307091-Build-your-Slackbot-memory) — preferences are remembered separately from topics.
- [Agent design](https://docs.slack.dev/ai/agent-design) — show that the speaker is an agent, stay inside the invoker's access, and reply in thread when mentioned.
- [Building agents for Slack](https://docs.slack.dev/ai/agents) — a real-world write asks for explicit confirmation.
- [Interaction surfaces](https://docs.slack.dev/ai/agent-entry-and-interaction) — `thread_ts ?? event.ts`.
- [AI app best practices](https://docs.slack.dev/ai/ai-apps-best-practices) and [governance](https://docs.slack.dev/ai/agent-governance) — cite sources, use Block Kit for a choice, and say what failed.

## Three modes

`buildSystemPrompt({ mode, preferences, language, botName })` in `src/bot/persona.js` builds the prompt. `botName` wins when it is passed. Otherwise the prompt uses `preferences.workspace.bot_name`, then Adam. `BOT_SYSTEM_PROMPT` is the slack mode with no stored preferences, so the persona is Adam. `checkReply(reply, context)` enforces the rules for that mode. It does not call a model.

All three modes share: answer first (a live acknowledgement may lead a spoken turn), be honest about what happened and what did not, confirm before a write, ask one short question when the instruction is ambiguous, never use `@channel` / `@here` / `<!channel>` / `<!here>` / `<!everyone>`, and reply in the user's language. This team uses Vietnamese and English.

| Mode | When | Shape |
|---|---|---|
| `live_voice` | Speaking in the meeting | Natural speech. No sentence-count limit. No lists, markdown, URLs, or ids |
| `meeting_chat` | The in-meeting text chat | A short reply. A link when it helps. No long post |
| `slack` | Slack threads, minutes, and action DMs | The Slackbot style above, plus the meeting rules below |

### Slack additions

- Reply in the thread (`thread_ts` set), except a minutes post or the root of an action DM.
- Minutes: a TL;DR line, then Decisions, Action items, and Open questions. About five bullets in a section. Omit an empty section. Each decision and action item cites the transcript as `(12:04)`. The owner is a Slack mention plus a due date. Unclear owner or date is `owner?` and `due?`. Never invent either.
- An action DM is one line per item, verb plus object, with Approve, Edit, and Skip. The line says what will happen and where.
- After a write runs, the result includes a link.
- A failure names what failed and the next step.
- "remember this" is stored per workspace and per user. The user value wins. See [meeting follow-ups](./meeting-followups.md).

### Meeting chat

Short enough to read without scrolling the meeting. A single link is useful. A heading wall is not.

### Live voice

Spoken turns are sized to the moment: "Sure." when that is the whole answer, and a fuller explanation when someone asks for one. There is no sentence cap.

The live style is distilled from published voice-agent prompting guidance:

- [OpenAI voice agents](https://platform.openai.com/docs/guides/voice-agents) and the [Realtime API](https://platform.openai.com/docs/guides/realtime) — prompt the speaking style, not only the facts. [Voice activity detection](https://platform.openai.com/docs/guides/realtime-vad) is how a session yields when the person starts talking.
- [ElevenLabs prompting guide](https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide) — separate personality from guardrails, and normalize anything that would be read aloud badly.
- [Vapi prompting guide](https://docs.vapi.ai/prompting-guide) — contractions, one question at a time, spoken forms for times and numbers, no markdown lists.
- [Retell prompting principles](https://docs.retellai.com/build/prompt-engineering-guide) and the [agent handbook](https://docs.retellai.com/build/agent-handbook) — short turns, spoken times ("half past two"), fillers used sparingly, and no stock lines such as "Certainly!".
- [LiveKit agent prompting](https://docs.livekit.io/agents/start/prompting/) — plain text for speech, no lists or urls read as syntax.
- [Pipecat](https://docs.pipecat.ai/guides/learn/overview) — the pipeline yields the turn; the prompt must not monologue over the user.
- [Hume EVI prompting](https://dev.hume.ai/docs/speech-to-speech-evi/guides/prompting) — voice-only output, with natural fillers, and no text formatting.
- [Sesame, crossing the uncanny valley of voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice) — conversational speech is duplex: refer back to what was just said, and stop when interrupted.

Live rules the checker enforces:

- Contractions and spoken phrasing. A light filler ("sure", "right, so") is allowed. "Task queued." and "Request acknowledged." are not.
- No bullets, markdown, URLs, emoji, or ids read aloud.
- Times are spoken ("half past two"), not `14:30`.
- Speak only when addressed by name. On an interruption, stop. Do not continue the monologue.
- A write is not done on the call. Say it goes for approval afterwards. Never claim it is done.

Good:

> Lan: Adam, send the notes to Mai.
> Adam: Sure, I'll send that to Mai for approval after the call.

Bad:

> Adam: Task queued. Done, I sent it. See https://docs.google.com/document/d/abc at 14:30.

## Preferences

`src/bot/preferences.js` stores a key and a value. A workspace row has no user. A user row belongs to one person. `loadPreferences` returns both, and `applied` lets the user value replace the workspace value for the same key. The prompt lists `applied`, except `bot_name` and `wake_phrases`, which are the workspace persona and are not a spoken preference. An utterance that says "remember this" is the write. "for the workspace" / "for everyone" / "for the team" marks a workspace row. The table and its RLS are in [meeting follow-ups](./meeting-followups.md).

## Bot name and wake phrases

The product name stays Sederunt. Each workspace sets the bot's display name. The default is Adam. A missing `bot_name` row means Adam, so the default is not stored. The name is what Recall shows as `bot_name`. The camera page still uses the hearing guest name. Slack posts, minutes, and action DMs send the name as the Slack `username`. The minutes text and the action line stay unchanged.

Wake phrases default to `Hey {name}` and `{name}` when the name is at least two characters. A one-character name uses only `Hey {name}`, because a phrase is at least two characters. Phrases are stored only after someone customizes them. A rename with no custom phrases follows the new name. There are at most five phrases. Each one is 2–40 characters, unique ignoring case, and contains the bot name as whole words. `Adamant` does not contain `Adam`.

The Account page has a Bot card. An owner or admin can edit it. A member sees the same card with the fields locked. The first welcome step has an optional name, prefilled Adam. Leaving it as Adam stores nothing. Joining an existing workspace does not rename the bot.

`detectWake` in `src/bot/wake.js` decides whether an utterance addresses the bot. It triggers when a wake phrase is at the start of a clause, when the name itself starts a clause, when the name is vocative, or when the name is a question tag at the end (`What time is it, Adam?`). Vocative means a comma before the name, a comma after the name when the name starts the clause, or one of hey, hi, ok, okay, này, hây, ơi, or à beside the name. `anh Adam ơi` and `anh, Adam` count. `anh Adam nói là` does not.

It does not trigger for a mid-sentence mention (`I told Adam yesterday`, `tôi nói với Adam hôm qua`), a possessive (`Adam's report`), or a title used as a reference (`anh Adam nói là`).

Matching ignores case and punctuation. Diacritics fold, and đ folds to d, so `Ê đam`, `A đam`, and `Hây Adam` can match Adam. A name of three or more characters may be one substitution away on a token of the same length (`Adum`, `Edam`) or split into two pieces (`a dam`, `Ad am`).

Limits:

- This is not a grammar parser. `please ask Adam` does not wake. `Edam cheese` at the start of a clause can wake, because Edam is one edit from Adam. The same is true of any same-length neighbor, such as Atom.
- A two-token split at the start of a clause wakes, including `a dam report`.
- Fuzzy matching is for detection only. A stored phrase must contain the exact name.
- `à` is the character à. A plain "a" is not that particle. Inside a stored phrase, text is folded, so `à` and `a` look the same.
- `hây` folds to `hay`, and `hay` is treated as hey. The English word "hay" beside the name can wake the bot.
- Names shorter than three characters match only exactly. An extra or missing letter (`Addam`) does not match, because the lengths differ.
- `ok` or `hey` beside the name counts even in the middle of a sentence.

## Checker

`checkReply` returns `{ ok, violations: [{ rule, detail }] }`. A rule runs only in the mode and context where it applies, so a spoken turn is not graded as a Slack thread. The eval set in `test/fixtures/bot-evals/` has a good and a bad conversation for every rule. A fake model returns the scripted assistant turn. The test asserts the good turn passes and the bad turn is flagged for that rule.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — the bot speaks for the meeting, and a write waits for an allow
- Decisions: [0004](../decisions/0004-write-preference.md) — a write is confirmed before it runs
- Follow-ups: [meeting-followups.md](./meeting-followups.md) — action DMs, minutes delivery, and matching
- Actions: [actions.md](./actions.md) — the gate's write preference
