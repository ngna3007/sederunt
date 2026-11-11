# Demo video plan

Shot-by-shot plan for a live, unedited recording of the real Sederunt workflow: join a Google Meet from the console, keep a silent fact, file a Linear issue and schedule a Calendar event by voice, then show the meeting record and close the loop in Slack (including a file kept on Walrus).

This is the live workflow, not the seeded memory walkthrough in [`hackathon-video.md`](./hackathon-video.md). The first-time-user onboarding procedure remains [`runbooks/new-user-live-demo.md`](./runbooks/new-user-live-demo.md).

Record against production at [sederunt.vercel.app/console](https://sederunt.vercel.app/console), signed into the company workspace (not Personal). Production tip at the time of writing is `933a1fd` on `feat/meeting-agent-page`. Do not show keys, tokens, account ids, a terminal that has printed them, or the admin page.

Final upload: the Tatum × Walrus Total Recall Drive folder, [1NkoZZYQ56DwNKRIwWKMy0aiOehBjDcm3](https://drive.google.com/drive/folders/1NkoZZYQ56DwNKRIwWKMy0aiOehBjDcm3?usp=sharing).

## What this recording shows

1. From console Home, start an immediate Google Meet, paste the link into **Add to a meeting**, click **Join now**, and admit Adam.
2. Once Adam is in the call: one fact he should keep and not reply to; then two tool tasks — create a Linear issue, and schedule a meeting on Google Calendar. **Step 2 is the checkpoint.**
3. Back on Home, open that meeting's detail and show the video, transcript, and activities. This clip may be recorded later and edited in. Do not redo step 2 if this fails.
4. In the connected Slack workspace, DM Adam and ask about activities in that specific meeting.
5. Add Adam to a Slack channel and post an announcement with a file attached.
6. Back in the DM, ask about that announcement. Adam should summarize it and return the same file (pulled from Walrus Console).

Steps 1–2 are one continuous take. Step 3 may be a second clip, after Recall has finished processing the recording. Steps 4–6 can continue from step 3 or be a third clip if Slack is already connected.

## How the product behaves today

Grounded in `933a1fd`. Read this before recording; several behaviors are not obvious from the UI.

### Voice Linear files during the call

A spoken "create a Linear issue" uses the builtin `act` tool or `linear__create_issue`. Those two names are the only writes that skip approval (`filesWithoutApproval` in `src/meeting/agent-http.js`). Adam should speak a confirmation such as `I filed ROW-72, 'Fix the onboarding email before launch'.` (`filedVoiceLine` in `src/meeting/agent.js`). Approval is not required.

If the title is missing or vague, he asks `What should the issue say?` and waits up to 90 seconds for the next line from the same speaker. A solo-call "Thanks, Adam." gets `You're welcome.` without a model round trip.

### Voice Calendar is not filed during the call

Calendar events and other non-Linear writes still wait for approval. A Calendar connector tool (for example `google-calendar__create_event`) is held with status `waiting_for_approval`, and Adam should say `I've drafted that request. Approve it in the Sederunt console, under Activity.` (`DRAFTED_LINE` / `draftedLine` in `src/meeting/agent.js`). The event is not created on Google Calendar until a person approves it.

That draft path is also fragile. See [Pre-recording fixes needed](#pre-recording-fixes-needed). Until those are fixed, treat a clean Calendar create-during-the-call as **not yet demo-ready**. The fallback is a truthful draft plus later approval in the console, and only if a hold actually lands.

The typed meeting door (`parseUtterance` in `src/parse.js`) has no "schedule a meeting" pattern. It only recognizes a calendar *edit* of the form `move the review to Thursday`. A spoken schedule request that only goes through the Recall webhook is stored as a decision note, not a calendar write. The live tool path is the voice agent on the output-media page (`src/meeting/agent-http.js`).

### A silent fact must be a "remember this" line, and must not address Adam

The Recall webhook sends every final transcript line through `handleUtterance` with `door: "meeting"` (`src/meeting/recall.js`, `src/server.js`). On that door, `enters()` in `src/typed-path.js` stores a decision only when:

- the line addresses Adam or Maple, or
- the line is a `remember this: …` keep (`isRememberThisKeep` in `src/hearing.js`), or
- a short hearing hold from a previous address is still open.

A bare "Heads up, the design review moved to Thursday" with no "remember this" and no name is **transcript-only**. It will show in the room transcript later, but it is not written as a Walrus decision and Slack recall will not treat it as a kept fact.

The voice agent answers a line when `meetingLineShouldAnswer` is true (`src/meeting/voice.js`): the line addresses Adam, it looks like a direct request, or the speaker still holds the floor. After Adam answers, that speaker keeps the floor for 20 seconds (`CONVERSATION_MS` in `src/meeting/speech-gate.js`). In a solo call, a later line from the same person in that window will get a reply even without the name.

So the silent fact must be said **first**, before any "Hey Adam", in the form `Remember this: …`, without saying Adam.

### Meeting detail shows video, transcript, decisions, and activity

The room page is `/console/rooms/<id>` (`src/console-page.js`).

- Left: the recording player (`#player-video`), then tabs **Transcript**, **Config**, and **Raw**.
- Right: **Overview**, **Decisions**, **Activity**, and **History**.
- **Activity** (`data-right-tab="waiting"`) renders the room's activity feed (requests, filings, failures, and anything still waiting). **History** shows the same feed, or falls back to timed transcript lines if there is no activity yet. **Decisions** lists kept sentences for the room, including a successful "remember this" fact.
- After the call, media may be `processing` ("Recording is still processing.") until Recall exposes a `videoUrl` (`src/meeting/recall.js`). Transcript lines from the webhook can appear before the video is ready. That is why step 3 may be a separate clip.

### Slack: DMs ask, channel posts keep, files come back from Console then Slack

`slackDelivery` in `src/slack/sign.js`: a DM (`channel_type` `im` / `mpim`, or a channel id starting with `D`) is always an ask (recall). A channel message is an ask only when it @mentions the bot. Every other channel message is kept, including an announcement with a file.

After a keep with a file, Adam posts `Kept <filename>.` (`keptNotice` in `src/server.js`). Bytes are ingested toward Walrus Console when the Slack channel is bound to a Sederunt channel (`ingestSlackFile` in `src/files/slack.js`). A later DM ask uses `storedFileBytes` in `src/server.js`: download from Walrus Console first, and if that copy is missing, fetch the original from Slack by the stored file id.

Do not @mention Adam in the channel announcement. That would turn the post into an ask, and the file would not be kept.

## Pre-recording fixes needed

These are product gaps, not recording workarounds. Fix and redeploy before a take that must look fully smooth. File references are on `933a1fd`.

1. **Voice Calendar create does not run during the call, and often will not even draft.** Only `act` and `linear__create_issue` file without approval (`filesWithoutApproval` in `src/meeting/agent-http.js`). A Calendar write, if it is held at all, waits for console approval. Worse, every voice write requires `concreteTitle(args.title || args.text)` in `runWrite` (`src/meeting/agent-http.js` around the `needs_title` branch), while Calendar `create_event` takes `summary`, `startTime`, and `endTime` (`src/connectors/calendar-fake.js`). A correct Calendar tool call is likely to return `needs_title`, and Adam will ask `What should the issue say?` If the model uses builtin `act` instead, `fileVoiceLinear` will try to file a Linear issue with that title. The voice tool cap is six extra tools after `recall` and `act`, with Linear create/update reserved first (`meetingTools` in `src/meeting/agent.js`); `google-calendar__create_event` may not even be in the list unless `SEDERUNT_VOICE_TOOLS` allow-lists it. `ACTION_KINDS` in `src/meeting/actions.js` has `edit_calendar` but no create-calendar kind. `parseUtterance` in `src/parse.js` has no schedule/create-event pattern. **Needed for a smooth step 2:** a voice Calendar create that either files during the call (like Linear) or reliably drafts a real calendar hold from `summary`/`start`/`end`, without falling through to Linear, and with the tool present in the voice list.

2. **A casual fact is not kept, and naming Adam makes him reply.** `enters()` in `src/typed-path.js` and `isRememberThisKeep` in `src/hearing.js` require `remember this: …` (or an address / open hold). `meetingLineShouldAnswer` in `src/meeting/voice.js` plus the 20-second floor in `src/meeting/speech-gate.js` mean "Adam, remember this…" or a fact said just after "Hey Adam" will get a spoken reply. Until this is relaxed, the script must use the wording and order in step 2. A nicer product fix would keep a clear unaddressed fact (for example a "heads up" about a moved review) and stay silent even shortly after a prior turn.

3. **`agentPersona` in `src/meeting/agent.js` still tells the model that a write is never done until someone approves it.** Linear filing already overrides the spoken line (`filedVoiceLine`), so this is not a Linear blocker, but it can make Calendar or mixed-tool speech hedge incorrectly. Update the persona once Calendar policy is decided.

4. **Walrus Console ingest can skip the announcement file.** `ingestSlackFile` in `src/files/slack.js` returns `skipped` when the Slack channel is not bound to a Sederunt channel, or when a durable store cannot link the Slack user to a workspace member. The DM can still resend bytes from Slack (`storedFileBytes` fallback in `src/server.js`), but that is not "pulled from Walrus Console." Before recording, confirm the demo channel is bound and a keep actually stores a Console file id. If ingest is still skipping, bind the channel (or fix the link) first.

5. **The current `say.sh` clips are the Linear-only live-test script.** Generate new clips for the lines in [Voice clips](#voice-clips) before the take. Existing files under `/workspace/sederunt-live-test/lines/` (`01`–`05`) do not cover the silent fact, the one-shot Linear request, or the Calendar request.

None of these are reasons to skip a dry run. They are reasons not to promise a fully smooth Calendar-during-the-call shot until (1) is fixed.

## Pre-flight checklist

Do this off camera.

- Signed into [sederunt.vercel.app/console](https://sederunt.vercel.app/console) on the company workspace. Linear, Google Calendar, and Slack show as connected under Setup / Connectors.
- Recalling a recent fact in Ask AI or a Slack DM already works, so memory is warm.
- Meeting join is ready (the **Join now** button is enabled; the dialog does not say join is not set up).
- Virtual mic is up (`/workspace/sederunt-live-test/vmic-setup.sh`). Meet's microphone is the Virtual Mic source, not the real one. Adam's output can be checked with `parecord --device=speakers.monitor` if needed, off camera.
- New `say.sh` clips exist for the lines below.
- A short unique announcement file is on disk, for example `launch-sync-note.txt`, with two or three sentences that are easy to summarize. Do not reuse an already-kept Northline attachment unless you want that older file to come back.
- The Slack demo channel exists. Prefer one already bound to a Sederunt channel. Adam is not yet a member if step 5 should show the invite.
- Google Calendar is on the intended time zone (workspace default, or `CALENDAR_TIME_ZONE`; this demo uses Asia/Saigon, UTC+7). "Tomorrow at 10am" means 10:00 in that zone.
- Browser windows: console Home at 1920×1200, a Meet tab, later the Slack workspace. Close terminals, admin, and any tab that could show secrets. Native pointer, no on-screen teleprompter.
- If Calendar create-during-the-call is required, the fixes in item 1 are deployed and a dry run has passed. Otherwise plan to accept a draft, or cut Calendar from the spoken take.

## Shot list

### 1. Start an immediate call

**On screen.** Console Home (`/console`). The lede is "Meetings, decisions, and follow-ups for this workspace." If there are earlier rooms, they appear under **Recent rooms**. The header action is **Add to a meeting** (`#home-add-to-meeting`). If Home is empty, the primary control is **Add Sederunt to a meeting**.

**Actions.**

1. Switch to Google Meet and start an instant meeting. Copy the `meet.google.com/…` link.
2. Back on Home, click **Add to a meeting**. The dialog title is **Add to a meeting**, with the line "Join a call that is happening now."
3. Paste the link into **Meeting link** (`#meet-link`; placeholder: "Paste a Zoom, Google Meet, Teams, or Webex link").
4. Click **Join now**. The button reads **Joining…** and the status reads "Sederunt is joining that meeting…"
5. On success the dialog closes and the page status is "Sederunt is on the way to the meeting." (`src/console-page.js`, `#meet-form` submit).
6. Return to Meet. When Adam (the Recall bot) appears in the waiting room, admit him. Wait until he is clearly in the call (tile visible, not still "waiting").

**Spoken / typed.** None in this step. Do not greet Adam yet. The silent fact in step 2 has to come first.

**Pass.** Join status is `sent`, Adam is in the call, the console did not show "Sederunt could not join that meeting" or "Meet is not ready."

**Risks and fallbacks.** A bad or Slack-huddle link is rejected in the dialog. If join fails, end the Meet, fix Setup, and restart step 1. If Adam never appears, leave the call and check Recall; do not start speaking.

### 2. One silent fact, then two tool tasks (checkpoint)

Stay in the Meet window. Play clips into the virtual mic with `/workspace/sederunt-live-test/say.sh`. Leave a little air after Adam finishes each reply. Do not say "Hey Adam" before the fact.

#### 2a. Fact, keep, no reply

**Say.** `Remember this: the design review moved to Thursday.`

Do not say Adam. Do not start with "Heads up" unless you also keep the `Remember this:` prefix — a bare heads-up will not enter the meeting door (`enters()` in `src/typed-path.js`).

**Expected.** Adam stays silent. The turn log, if you check later off camera, should show `answered: false`. The webhook still stores a company decision for the room (`storeDecision` / `keepDecision` in `src/typed-path.js`).

**Pass.** No audio from Adam for several seconds. (Confirmation that the fact was kept is in steps 3 and 4, not here.)

**Risks and fallbacks.** If you already greeted him, wait at least 20 seconds for the floor to close, then say the remember-this line without his name. If STT drops "remember this," the line will not be stored as a decision; the transcript may still show it. If he answers, the take is no longer a silent keep — stop and redo from a fresh Meet, or accept a spoken ack and say so in the edit notes.

#### 2b. Create a Linear issue

**Say, in one breath.** `Adam, create a Linear issue: fix the onboarding email before launch.`

That wording is one turn, so he should not need to ask for a title. If you split it ("Adam, create a task on Linear." then the title), that also works: he asks `What should the issue say?`, then you say `Fix the onboarding email before launch.`

**Expected.** After a short pause he speaks a filing line, including the issue key when Linear returns one, for example `I filed ROW-72, 'Fix the onboarding email before launch'.` Speech-to-text often hears "fix" as "Fixed"; the current tip already restores a leading past-tense slip (`imperativeTitle` in `src/meeting/agent.js`).

**Pass.** He claims a filed issue (not a draft, not "approve it in the console"), and a matching issue exists in the connected Linear workspace, once. If he asks for a title, answer it and still count the take if he then files.

**Risks and fallbacks.** If he drafts instead of filing, or files twice, or stays silent, end the meeting immediately (Recall `leave_call` is the fastest way) to save credits, then investigate. Do not keep talking. "Thanks, Adam" is optional after a clean filing; in a solo call he should reply `You're welcome.` Save it for after the Calendar request if you use it at all, so it does not open the floor before Calendar.

#### 2c. Schedule a Calendar event

**Say.** `Adam, schedule a launch sync tomorrow at 10am.`

**Expected, after the fixes in item 1.** He files or clearly confirms the event during the call (preferred for a smooth demo), or he drafts it and tells you to approve it in the Sederunt console under Activity.

**Expected today, before those fixes.** Unreliable. Likely outcomes: he asks `What should the issue say?`; he files a Linear issue titled like a launch sync; he speaks a generic draft line with no hold; or he only acknowledges. A drafted hold, if one lands, does **not** create the Google Calendar event until someone approves it in the console.

**Pass (strict).** A "Launch sync" event exists on the connected Google Calendar for tomorrow 10:00 in the workspace zone, created during the call, and Adam says so.

**Pass (fallback, only if you accepted this before recording).** He clearly says he drafted the request and points at Activity in the console, and a waiting row for that event appears under the room's **Activity** tab. You may approve it later, off the continuous take or in a short cutaway.

**Risks and fallbacks.** If he starts filing another Linear issue, end the meeting. If he asks for a title, you can say `Launch sync tomorrow at 10am` once; if he still does not draft or file a calendar event, treat step 2 as failed for Calendar and stop. Do not improvise a third tool request on this take.

**Checkpoint.** When 2a is silent, 2b has filed once, and 2c has either filed or (agreed fallback) drafted, leave the Meet. That is the end of the continuous take for steps 1–2. Ending the call starts Recall processing for step 3.

### 3. Meeting detail — video, transcript, activities

May be a separate clip. Do not rerun step 2 if the recording is still processing.

**On screen.** Console Home. Under **Recent rooms**, click the meeting you just ran. The room opens at `/console/rooms/<id>`.

**Show, in this order.**

1. The player on the left. If the copy is "Recording is still processing," wait off camera and resume when the video is ready. Play a short stretch that includes the Linear request and Adam's filing line.
2. The **Transcript** tab. Scroll far enough to show the remember-this line, the Linear request, Adam's reply, and the Calendar request.
3. Right-hand **Decisions**. The Thursday design-review sentence should be there. A Verified-on-Walrus badge may appear after the proof is checked; do not wait forever for it on camera.
4. Right-hand **Activity**. The Linear filing should show as a completed request. A Calendar draft, if one was held, should appear as waiting here (this tab is the "Activity" label on the waiting pane). **History** is the backup if Activity looks empty.

**Spoken / typed.** None required. A short voice-over is optional and should not cover the transcript.

**Pass.** The room is the one from step 2, the transcript matches what was said, Decisions includes the silent fact, and Activity (or History) shows the Linear filing. Video is present, or this clip is postponed until it is.

**Risks and fallbacks.** "No recording for this room" or a stuck "processing" state: wait and recapture only this step. "No transcript yet" while the video is already ready: refresh; webhook lines sometimes arrive first, artifact transcripts later. A missing decision usually means the remember-this phrasing failed in step 2 — show the transcript line and note the gap; do not pretend it was kept.

### 4. Slack DM — ask about that meeting

**On screen.** The connected Slack workspace. Open a DM with Adam (the Sederunt bot).

**Type.** Something that names the meeting, for example:

`What happened in the Google Meet we just had?`

or, more specific:

`What did we decide in that meeting, and what did you file?`

**Expected.** Adam answers from memory. The reply should mention the design review moving to Thursday, and the Linear issue (title and, if he has it, the issue key). He may also mention the Calendar request if it was kept or drafted. This is a DM, so it is always an ask (`slackAsks` / `isDirectMessage` in `src/slack/sign.js`).

**Pass.** The answer is about *this* meeting, not a generic or stale memory, and it includes the silent fact and the Linear filing.

**Risks and fallbacks.** If he seems to recall an older meeting, ask a follow-up that uses a unique phrase from step 2, such as "the onboarding email before launch." If he knows nothing, memory write or tenant routing failed — stop and investigate; do not improvise new facts in the DM.

### 5. Add Adam to a channel and post an announcement with a file

**On screen.** A public Slack channel in the same workspace (for example a demo or ops channel). If he is not already a member, add him with Slack's invite / "Add apps" flow so the membership is visible.

**Type,** in the channel, **without @mentioning Adam**, and attach the prepared file (for example `launch-sync-note.txt`):

`Launch sync note — design review moved to Thursday, and the onboarding email is in Linear. Please keep this announcement and the file.`

A file attachment is already treated as an explicit keep (`isExplicitKeep` in `src/server.js`). "Please keep" is still useful if STT or Slack's file event is messy.

**Expected.** Adam posts `Kept launch-sync-note.txt.` (or the actual filename). He should not answer as if asked a question.

**Pass.** The keep ack names the same file you attached. Off camera, confirm a Console / Walrus file id was stored if you need the strict step 6 story.

**Risks and fallbacks.** If you @mention him, the message becomes an ask and the file is not kept — delete or ignore that post and retry without a mention. If he says he could not see who is in the channel, the membership list failed; invite him again and retry. If he says "The file did not arrive," Slack's file payload may have landed as a later `message_changed` event; wait a moment for a second keep, or post once more. If ingest skipped because the channel is not bound, the keep ack can still appear, but step 6 may resend from Slack rather than Walrus — fix the binding before a strict take.

### 6. DM — summarize the announcement and return the file

**On screen.** The same Adam DM as step 4.

**Type.**

`Can you summarize the launch sync announcement I just posted in the channel, and send me the file?`

**Expected.** Adam replies with a short summary of the announcement (Thursday design review, Linear onboarding email, or whatever the file actually said) and attaches the **same filename**. Bytes are read from Walrus Console when `storedFileBytes` finds a `consoleFileId`, otherwise from Slack.

**Pass.** The summary is recognizably that announcement, and the attached file is the same one from step 5, not a different older attachment.

**Risks and fallbacks.** If the summary is right but there is no file, ask once more by filename: `Please resend launch-sync-note.txt.` Summarize/resend wording is treated as an ask (`looksLikeRecallAsk` in `src/parse.js`; question-named files are preferred in `src/slack/reply.js`). If he attaches the wrong file, say the exact filename again. If nothing comes back, check that the keep in step 5 actually stored file metadata, then stop.

## Voice clips

Generate new 48 kHz clips and play them with `/workspace/sederunt-live-test/say.sh`. Suggested numbering (do not overwrite the old Linear-test `01`–`05` until you are done with those retests):

| Clip | Line |
| --- | --- |
| 11 | Remember this: the design review moved to Thursday. |
| 12 | Adam, create a Linear issue: fix the onboarding email before launch. |
| 13 | Adam, schedule a launch sync tomorrow at 10am. |
| 14 | Thanks, Adam. |

Use 12 as one breath so he does not have to ask for a title. Keep 14 optional, after Calendar, only in a solo call.

## Recording notes

- Unedited continuous screen recording of the real workflow. Native mouse movement. `draw_mouse 1`. No jump cuts inside steps 1–2.
- Capture at 1920×1200. The tested continuous command template is `/workspace/sederunt-demo-video/pacing-diagnostics-20261107-155629/best-continuous-command-template.txt`. Copy it, give the output a new unique path, and do not reuse a previous filename (`-n` will refuse an overwrite).
- The template grabs `:2.0+0,0` for video and `speakers.monitor` for audio, so the recording includes Adam's voice and the system/Meet audio on that display. Speech you play into `vmic_sink` is not on `speakers.monitor`; Meet's far-end playback of your clips should still be audible on the speaker monitor if Meet is outputting there. Do a five-second audio check before the take.
- Steps 1–2 are one file. Step 3 may be a second file once the recording is ready. Steps 4–6 may continue on the same display or be a third file. Assemble later; do not redo the checkpoint.
- No terminal, no `.env`, no Network tab, no admin, no account ids, no blob or wallet addresses unless you are deliberately showing a public Verified-on-Walrus proof dialog already used in [`hackathon-video.md`](./hackathon-video.md).
- If step 2 fails, end the Meet immediately rather than improvising. Then fix, redeploy if needed, and start a new take from step 1.
- Upload the final cut (and, if useful, the raw checkpoint take) to the hackathon Drive folder linked at the top of this document.

## Related docs

- [`hackathon-video.md`](./hackathon-video.md) — shorter seeded-memory / Tatum proof shot list.
- [`hackathon.md`](./hackathon.md) — architecture of Walrus Memory and Tatum reads.
- [`runbooks/new-user-live-demo.md`](./runbooks/new-user-live-demo.md) — first-time-user onboarding recording.
- [`demo-pack/`](./demo-pack/) — optional Northline announcement copy and attachments, if the Slack story should reuse that pack instead of a fresh short file.
