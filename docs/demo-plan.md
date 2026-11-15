# Demo video plan

Shot-by-shot plan for a live, unedited recording of the real Sederunt workflow: join a Google Meet from the console, keep a silent fact, file a Linear issue and schedule a Calendar event by voice, then show the meeting record and close the loop in Slack (including a file kept on Walrus).

This is the live workflow, not the seeded memory walkthrough in [`hackathon-video.md`](./hackathon-video.md). The first-time-user onboarding procedure remains [`runbooks/new-user-live-demo.md`](./runbooks/new-user-live-demo.md).

Record against production at [sederunt.vercel.app/console](https://sederunt.vercel.app/console), signed into the company workspace (not Personal), after [PR 22](https://github.com/ngna3007/sederunt/pull/22) is merged and deployed on top of `feat/meeting-agent-page` (`afe0136`, which already includes the room-activity Redis mirror from PR 21). Do not record this take against the earlier `933a1fd` tip. Do not show keys, tokens, account ids, a terminal that has printed them, or the admin page.

Final upload: the Tatum × Walrus Total Recall Drive folder, [1NkoZZYQ56DwNKRIwWKMy0aiOehBjDcm3](https://drive.google.com/drive/folders/1NkoZZYQ56DwNKRIwWKMy0aiOehBjDcm3?usp=sharing).

## What this recording shows

1. From console Home, start an immediate Google Meet, paste the link into **Add to a meeting**, click **Join now**, and admit Adam.
2. Once Adam is in the call: one fact he should keep and not reply to; then two tool tasks — create a Linear issue, and schedule a meeting on Google Calendar. After each tool action, click the link Adam posts in the Meet chat (it opens in a new tab) to verify the Linear issue or Calendar event on camera, then return to the Meet tab before the next request. **Step 2 is the checkpoint.**
3. Back on Home, open that meeting's detail and show the video, transcript, and activities. This clip may be recorded later and edited in. Do not redo step 2 if this fails.
4. In the connected Slack workspace, DM Adam and ask about activities in that specific meeting.
5. Add Adam to a Slack channel and post an announcement with a file attached.
6. Back in the DM, ask about that announcement. Adam should summarize it and return the same file (pulled from Walrus Console).

Steps 1–2 are one continuous take. Step 3 may be a second clip, after Recall has finished processing the recording. Steps 4–6 can continue from step 3 or be a third clip if Slack is already connected.

## How the product behaves today

Grounded in [PR 22](https://github.com/ngna3007/sederunt/pull/22) on `feat/meeting-agent-page` (`afe0136`). Read this before recording; several behaviors are not obvious from the UI. Do not record until that PR is deployed.

### Voice Linear and Calendar both file during the call

A spoken "create a Linear issue" uses the builtin `act` tool or `linear__create_issue`. Adam should speak a confirmation such as `I filed ROW-72, 'Fix the onboarding email before launch'.` (`filedConfirmation` / the Linear line in `src/meeting/voice-write.js` and `src/meeting/agent.js`). Approval is not required.

A spoken schedule request such as `Adam, schedule a launch sync tomorrow at 10am` is parsed in `src/meeting/schedule.js` and filed during the call with `google-calendar__create_event` on the speaker's own Google grant in this tenant (the speaker must be bound to a workspace member; there is no fallback to a shared calendar) (`fileVoiceCalendar` in `src/meeting/agent-http.js`). Default zone is `Asia/Ho_Chi_Minh` (same as Asia/Saigon, UTC+7, no DST). Default duration is 30 minutes. Adam should say something like `I scheduled Launch sync for tomorrow at 10 AM.`

If a required detail is missing, he asks one follow-up and waits up to 90 seconds for the next line from the same speaker: `What should the issue say?` for a vague Linear title, or `When should it be?` if the schedule has no time. A missing calendar title can default from the utterance. A solo-call "Thanks, Adam." still gets `You're welcome.` without a model round trip.

The same in-call write path applies to other connector tools, including tenant-added custom MCP connectors. Required fields come from each tool's input schema. Only creates run at once (`writeRisk` in `src/meeting/voice-write.js`). Destructive tools (delete / remove, or `destructiveHint`) need a spoken yes (`Should I delete X?`). Sends, posts, payments, updates/overwrites and any unknown write also need a spoken yes (`Should I go ahead and send email 'X'?`). At most one write runs per spoken request. If Google Calendar is not connected, he says `Google Calendar is not connected.` and does not invent an event.

The meeting webhook door will not create a calendar event on its own (`voiceFile` is required in `src/typed-path.js`), so the voice agent and the transcript webhook cannot double-create.

### After each successful tool action, Adam posts the link in Meet chat

Once a write succeeds, Adam also posts a short message in the Google Meet chat via Recall (`sendChatMessage` in `src/meeting/recall.js`: `POST /api/v1/bot/<bot_id>/send_chat_message/` with `{ message, to: "everyone" }`). The post is fire-and-forget, so it may appear a beat after he finishes speaking. It does not delay the spoken line. Google Meet's 500-character cap is respected. Links come from the tool result, or for Linear from `https://linear.app/<workspace>/issue/<ID>` only when the workspace is known — he will not invent a URL.

Typical lines:

- `Filed ROW-72: Fix the onboarding email before launch https://linear.app/rowan3007/issue/ROW-72`
- `Scheduled Launch sync, Thu 10:00 ICT https://calendar.google.com/event?eid=…`

GMT+7 is labeled ICT. Use that chat link as the on-camera proof: click it so it opens in a new tab, show the Linear issue or Calendar event, then return to the Meet tab before the next request. See the mini-steps after 2b and 2c.

### A silent fact can be a heads-up in a solo call

The Recall webhook still sends every final transcript line through `handleUtterance` with `door: "meeting"`. After PR 22, `isQuietKeep` / `isDeclarativeFact` in `src/meeting/voice-write.js` and `src/typed-path.js` keep some facts silently, without a spoken reply, even inside the 20-second floor (`CONVERSATION_MS` in `src/meeting/speech-gate.js`):

- Explicit keeps — `Remember this: …`, `Note that …`, and a clear `Heads up, …` — are always stored, and Adam stays quiet, even if you just spoke to him or used his name.
- In a **solo** call (only you and Adam), a plain statement of fact on the open floor (for example `The design review moved to Thursday`) gets no spoken reply. It is not stored as a decision unless it has a keep cue, so use `Heads up` / `Remember this` / `Note that` for anything that must land in Decisions. Requests, questions, greetings, "can you hear me", thanks/bye and the answer to a question Adam just asked are still answered.
- In a **group** call, unaddressed chatter is not auto-kept. Pending answers and real questions or requests still get a reply, including a line like `please note the launch`.

The demo line `Heads up, the design review moved to Thursday` is therefore valid in this solo-call take. `Remember this: the design review moved to Thursday` still works and is the safer wording if anyone else is in the Meet. Prefer saying the fact first, before any "Hey Adam" or tool request, so the keep is visually clean on the transcript.

### Meeting detail shows video, transcript, decisions, and activity

The room page is `/console/rooms/<id>` (`src/console-page.js`).

- Left: the recording player (`#player-video`), then tabs **Transcript**, **Config**, and **Raw**.
- Right: **Overview**, **Decisions**, **Activity**, and **History**.
- **Activity** (`data-right-tab="waiting"`) renders the room's activity feed (requests, filings, failures, and anything still waiting). After PR 21, in-call actions are also mirrored in Redis (`sederunt:room-activity:<tenant>:<room>` via `mirrorRoomActivity` in `src/server.js`) so this pane does not depend on a Walrus Memory write having finished. Linear filings already flowed through that hook; PR 22 also records Calendar and other voice tool actions (`recordVoiceActivity` in `src/typed-path.js`). **History** shows the same feed, or falls back to timed transcript lines if there is no activity yet. **Decisions** lists kept sentences for the room, including the silent heads-up or "remember this" fact.
- After the call, media may be `processing` ("Recording is still processing.") until Recall exposes a `videoUrl` (`src/meeting/recall.js`). Transcript lines from the webhook can appear before the video is ready. That is why step 3 may be a separate clip.

### Slack: DMs ask, channel posts keep, files come back from Console then Slack
### Slack: DMs ask, channel posts keep, files come back from Console then Slack

`slackDelivery` in `src/slack/sign.js`: a DM (`channel_type` `im` / `mpim`, or a channel id starting with `D`) is always an ask (recall). A channel message is an ask only when it @mentions the bot. Every other channel message is kept, including an announcement with a file.

After a keep with a file, Adam posts `Kept <filename>.` (`keptNotice` in `src/server.js`). Bytes are ingested toward Walrus Console when the Slack channel is bound to a Sederunt channel (`ingestSlackFile` in `src/files/slack.js`). A later DM ask uses `storedFileBytes` in `src/server.js`: download from Walrus Console first, and if that copy is missing, fetch the original from Slack by the stored file id.

Do not @mention Adam in the channel announcement. That would turn the post into an ask, and the file would not be kept.

## Pre-recording fixes needed

Items 1–3 below were the blockers for a smooth step 2. They are fixed in [PR 22](https://github.com/ngna3007/sederunt/pull/22). Merge and deploy that PR, then dry-run step 2 once, before a take that must look fully smooth. Items 4–5 are still open.

1. **Voice Calendar create now runs during the call.** Fixed in PR 22 (`src/meeting/schedule.js`, `src/meeting/voice-write.js`, `fileVoiceCalendar` in `src/meeting/agent-http.js`). `Adam, schedule a launch sync tomorrow at 10am` files `create_event` once, speaks a confirmation, and posts the event link in Meet chat. Required fields come from the tool schema (`summary` / `startTime` / `endTime`, with aliases). A schedule request is not filed as a Linear issue. If the time is missing he asks `When should it be?` If Calendar is not connected he says so honestly. Do not record this shot until PR 22 is on production.

2. **A solo-call heads-up is kept silently.** Fixed in PR 22 (`isQuietKeep` / `isDeclarativeFact` in `src/meeting/voice-write.js`, wired in `src/meeting/voice.js` and `src/typed-path.js`). `Heads up, the design review moved to Thursday` and `Remember this: …` / `Note that …` are stored without a spoken reply, even within 20 seconds of a prior answer. A cue-less solo fact gets no reply but is not stored. Group-call unaddressed chatter is still not auto-kept. Real questions and requests still get answers.

3. **`agentPersona` in `src/meeting/agent.js` no longer says every write waits for approval.** Fixed in PR 22. The persona now says Linear issues and calendar events are filed during the call after the tool succeeds, that sends, updates and deletes wait for a spoken yes, and that he must not claim a write is done without a tool result.

4. **Walrus Console ingest can skip the announcement file.**
4. **Walrus Console ingest can skip the announcement file.** `ingestSlackFile` in `src/files/slack.js` returns `skipped` when the Slack channel is not bound to a Sederunt channel, or when a durable store cannot link the Slack user to a workspace member. The DM can still resend bytes from Slack (`storedFileBytes` fallback in `src/server.js`), but that is not "pulled from Walrus Console." Before recording, confirm the demo channel is bound and a keep actually stores a Console file id. If ingest is still skipping, bind the channel (or fix the link) first.

5. **The current `say.sh` clips are the Linear-only live-test script.** Generate new clips for the lines in [Voice clips](#voice-clips) before the take. Existing files under `/workspace/sederunt-live-test/lines/` (`01`–`05`) do not cover the heads-up fact, the one-shot Linear request, or the Calendar request.

Items 4–5 are not reasons to skip a dry run. They do not block step 2. A fully smooth Calendar-during-the-call shot still requires PR 22 to be deployed, with Meet chat visible in the Meet window and a passing dry run of 2a–2c including the chat click-throughs.

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
- [PR 22](https://github.com/ngna3007/sederunt/pull/22) is merged and deployed. A dry run of step 2 has passed: silent heads-up, Linear filed once, Calendar created during the call, and a Meet chat line with a clickable link after each tool action. Do not start the take if Calendar still drafts or if Meet chat is missing both links.
- The Meet window shows the in-call chat panel (open it before you admit Adam, so the chat lines are visible without hunting mid-take).

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

**Say.** `Heads up, the design review moved to Thursday.`

This is a solo-call declarative and is kept silently after PR 22. The safer equivalent, if anyone else might be in the Meet, is `Remember this: the design review moved to Thursday.` Either wording is fine. Prefer saying it first, before any "Hey Adam" or tool request.

**Expected.** Adam stays silent. The turn log, if you check later off camera, should show `answered: false`. The webhook stores a company decision for the room (`storeDecision` in `src/typed-path.js`, with the keep cue stripped so the stored text is `the design review moved to Thursday`).

**Pass.** No audio from Adam for several seconds. (Confirmation that the fact was kept is in steps 3 and 4, not here.)

**Risks and fallbacks.** If he answers, the take is no longer a silent keep — stop and redo from a fresh Meet, or accept a spoken ack and say so in the edit notes. If STT mangles the line, the transcript may still show it but Decisions might miss it; do not repeat the fact on this take.

#### 2b. Create a Linear issue

**Say, in one breath.** `Adam, create a Linear issue: fix the onboarding email before launch.`

That wording is one turn, so he should not need to ask for a title. If you split it ("Adam, create a task on Linear." then the title), that also works: he asks `What should the issue say?`, then you say `Fix the onboarding email before launch.`

**Expected.** After a short pause he speaks a filing line, including the issue key when Linear returns one, for example `I filed ROW-72, 'Fix the onboarding email before launch'.` Speech-to-text often hears "fix" as "Fixed"; the current tip already restores a leading past-tense slip (`imperativeTitle` in `src/meeting/agent.js`).

**Pass.** He claims a filed issue (not a draft, not "approve it in the console"), once. If he asks for a title, answer it and still count the take if he then files. On-camera proof of the issue itself is the chat click-through in 2b.1, not a separate Linear tab you open yourself.

**Risks and fallbacks.** If he drafts instead of filing, or files twice, or stays silent, end the meeting immediately (Recall `leave_call` is the fastest way) to save credits, then investigate. Do not keep talking. "Thanks, Adam" is optional after a clean filing; in a solo call he should reply `You're welcome.` Save it for after the Calendar request if you use it at all, so it does not open the floor before Calendar.

#### 2b.1 Click the Linear link in Meet chat

**On screen.** Stay in the Meet window. The in-call chat should already be open (see the pre-flight checklist). After Adam finishes the filing line, wait a beat for the chat message. It should look like `Filed ROW-72: Fix the onboarding email before launch https://linear.app/rowan3007/issue/ROW-72` (`actionChatLine` in `src/meeting/voice-write.js`).

**Actions.** Click the URL in that chat line so it opens in a **new tab**. Show the Linear issue page on camera (key and title should match what he just said). Then return to the Meet tab before starting 2c. Do not paste a URL into chat yourself, and do not leave the Meet tab hidden while you say the Calendar line.

**Pass.** The chat line appeared once, the link opened the matching Linear issue, and you are back on the Meet tab before the next request.

**Fallback if the chat link is missing.** Wait two or three seconds; the post is fire-and-forget and can lag the spoken line. If a chat line appears but has no URL (no workspace was known, or the tool result had no `url`), do not invent a link. You may briefly open Linear yourself from the spoken issue key if you can do it without leaving the take looking lost, then come back to Meet; otherwise skip the on-camera page and treat the spoken `I filed ROW-…` line as the proof. If no chat message appears at all, still continue to 2c as long as he clearly filed once — the click-through is verification, not a reason to end the meeting. Note the gap in the edit notes. If he did not file, end the meeting as in 2b.

#### 2c. Schedule a Calendar event

**Say.** `Adam, schedule a launch sync tomorrow at 10am.`

**Expected.** He creates the event during the call on the connected Google Calendar and speaks a confirmation such as `I scheduled Launch sync for tomorrow at 10 AM.` The event is tomorrow at 10:00 in Asia/Saigon (UTC+7), for 30 minutes. He should not ask `What should the issue say?`, should not file a Linear issue, and should not tell you to approve a draft in the console. If the time did not land in STT, he may ask `When should it be?` — answer `Tomorrow at 10am` once.

**Pass.** He claims the event was scheduled (not drafted), and the spoken title and time match the request. On-camera proof of the event itself is the chat click-through in 2c.1.

**Risks and fallbacks.** If he starts filing another Linear issue, or says `Google Calendar is not connected.`, end the meeting and fix the grant or the deployment before another take. If he asks for a time, answer it once; if he still does not file a calendar event, treat step 2 as failed for Calendar and stop. Do not improvise a third tool request on this take. Do not approve a leftover draft in the console as a substitute for an in-call create.

#### 2c.1 Click the Calendar link in Meet chat

**On screen.** Stay in the Meet window, chat panel still open. After he finishes the scheduling line, wait a beat for a chat message such as `Scheduled Launch sync, Thu 10:00 ICT https://calendar.google.com/event?eid=…`.

**Actions.** Click the URL in that chat line so it opens in a **new tab**. Show the Google Calendar event on camera (title Launch sync, tomorrow 10:00 in the workspace zone). Then return to the Meet tab before you leave the call or say thanks. Do not paste a URL into chat yourself.

**Pass.** The chat line appeared once, the link opened the matching Calendar event, and you are back on the Meet tab.

**Fallback if the chat link is missing.** Wait two or three seconds for the fire-and-forget post. If a chat line appears but has no URL, do not invent one. You may briefly open Google Calendar yourself and find "Launch sync" if that is quick and clean on camera, then return to Meet; otherwise skip the on-camera page and treat the spoken `I scheduled Launch sync…` line as the proof. If no chat message appears at all, still end the continuous take as long as he clearly scheduled the event — note the gap in the edit notes. If he did not schedule, end the meeting as in 2c.

**Checkpoint.** When 2a is silent, 2b has filed once, 2b.1 has shown the Linear issue (or used the missing-link fallback), 2c has scheduled the event during the call, and 2c.1 has shown the Calendar event (or used the missing-link fallback), leave the Meet. That is the end of the continuous take for steps 1–2. Ending the call starts Recall processing for step 3.

### 3. Meeting detail — video, transcript, activities

May be a separate clip. Do not rerun step 2 if the recording is still processing.

**On screen.** Console Home. Under **Recent rooms**, click the meeting you just ran. The room opens at `/console/rooms/<id>`.

**Show, in this order.**

1. The player on the left. If the copy is "Recording is still processing," wait off camera and resume when the video is ready. Play a short stretch that includes the Linear request and Adam's filing line.
2. The **Transcript** tab. Scroll far enough to show the remember-this line, the Linear request, Adam's reply, and the Calendar request.
3. Right-hand **Decisions**. The Thursday design-review sentence should be there (`the design review moved to Thursday`). A Verified-on-Walrus badge may appear after the proof is checked; do not wait forever for it on camera.
4. Right-hand **Activity**. The Linear filing and the Calendar schedule should both show as completed in-call actions (PR 21 Redis mirror plus PR 22 `recordVoiceActivity`). This tab is the "Activity" label on the waiting pane. **History** is the backup if Activity looks empty.

**Spoken / typed.** None required. A short voice-over is optional and should not cover the transcript.

**Pass.** The room is the one from step 2, the transcript matches what was said, Decisions includes the silent fact, and Activity (or History) shows both the Linear filing and the Calendar schedule. Video is present, or this clip is postponed until it is.

**Risks and fallbacks.** "No recording for this room" or a stuck "processing" state: wait and recapture only this step. "No transcript yet" while the video is already ready: refresh; webhook lines sometimes arrive first, artifact transcripts later. A missing decision usually means the remember-this phrasing failed in step 2 — show the transcript line and note the gap; do not pretend it was kept.

### 4. Slack DM — ask about that meeting

**On screen.** The connected Slack workspace. Open a DM with Adam (the Sederunt bot).

**Type.** Something that names the meeting, for example:

`What happened in the Google Meet we just had?`

or, more specific:

`What did we decide in that meeting, and what did you file?`

**Expected.** Adam answers from memory. The reply should mention the design review moving to Thursday, the Linear issue (title and, if he has it, the issue key), and the Launch sync calendar event. This is a DM, so it is always an ask (`slackAsks` / `isDirectMessage` in `src/slack/sign.js`).

**Pass.** The answer is about *this* meeting, not a generic or stale memory, and it includes the silent fact, the Linear filing, and the Calendar event.

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
| 11 | Heads up, the design review moved to Thursday. |
| 11b | Remember this: the design review moved to Thursday. |
| 12 | Adam, create a Linear issue: fix the onboarding email before launch. |
| 13 | Adam, schedule a launch sync tomorrow at 10am. |
| 14 | Thanks, Adam. |

Prefer 11 for this solo-call take; keep 11b as the safer wording if the Meet is not clearly solo. Use 12 as one breath so he does not have to ask for a title. Keep 14 optional, after Calendar and the 2c.1 click-through, only in a solo call.

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
