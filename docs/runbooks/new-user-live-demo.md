# New-user live demo: click-by-click runbook

Use this procedure to record one genuine, continuous Sederunt demo from a first-time user's view. The order is **sign in → onboard → connect tools → real meeting → Ask AI → Slack privacy and file resend → Files → final reload**. Read the screen title and control labels as you go; a live deployment may move a control without changing its name.

This runbook is the operator path. The [Northline story and file pack](../demo-pack/COMPANY.md) supply the fictional company details. The [older QA script](./live-demo-plan.md) is background, not a current build or credential checklist.

## Before opening the fresh Sederunt account

| Check | Where to look and what to do | Expected result | If it fails |
| --- | --- | --- | --- |
| Live build | In Vercel, open the Sederunt project → **Deployments** → the deployment aliased to `sederunt.vercel.app`. Read its Git commit. | The live build contains tenant-scoped **Add to Slack** from `54cab8e` or a later reviewed release. This runbook was written against that branch. `main` at `05e3667` does not contain it. | Do not record a new-user Slack install on the older build. Select a reviewed build and verify its alias before starting. |
| Fresh owner | In a separate browser profile, sign into the Google account that will play Northline's owner. Do not open Sederunt with it yet. | The account has never created or joined a Sederunt workspace, or has completed the explicit admin restart procedure. | Follow [admin demo recovery](./admin-demo-recovery.md), or use a fresh account. Clearing browser cookies does not reset server state. A restarted account is a fresh app attempt, not first-ever Google consent. |
| Demo Slack workspace | In Slack, confirm the owner can approve apps, has a channel such as `#ops-hq`, and a second Slack user can play the contractor. Keep the contractor out of the meeting. | Two distinct Slack identities are ready in separate browser profiles. | Arrange the identities and channel before using the fresh Sederunt account. Do not reuse another tenant's installation as proof. |
| Slack app configuration | In the Slack app dashboard, check **Manage Distribution**, OAuth redirect `https://sederunt.vercel.app/console/slack/callback`, Event Subscriptions request URL `https://sederunt.vercel.app/api/slack`, required bot scopes including `files:write`, and app lifecycle events. | The owner can reach a normal Slack **Allow** screen from Sederunt. A previous scope-change banner alone is not proof. | Fix distribution/redirect/scopes before the recording. Reauthorize through **Add to Slack** inside Sederunt. |
| Real meeting | In the fresh owner's Google Calendar, click **Create** → **Event**. Title it `Northline · Launch + D7 lock`, set its time near the recording, and add a Google Meet link. Copy that link. | A real Meet can be opened during the take; its link is ready for manual join if auto join is late. | Fix Calendar/Meet before starting. Do not substitute a seeded room. |
| File pack | Put [`northline-d7-floor-brief.txt`](../demo-pack/northline-d7-floor-brief.txt), [`northline-launch-gate.txt`](../demo-pack/northline-launch-gate.txt), and [`northline-ops-announcement.txt`](../demo-pack/northline-ops-announcement.txt) in an easy-to-find folder. Choose a new fictional staging unlock phrase. | The files are readable and the new phrase has not appeared in a public channel or an older demo. | Prepare the pack and phrase first. The old `cedar-92` value is retired. |
| Capture | Open the screen recorder's full-screen or browser capture settings. Capture the native pointer and microphone at about 1920 px width. Start with a signed-out Sederunt tab. | The first sign-in through final reload can be recorded without cuts. | Make a short local capture check, then restart the real take. Keep secrets and admin pages off screen. |

Use only the explicit [admin recovery procedure](./admin-demo-recovery.md) for an authorized demo-account restart before recording. Do not reset protected/shared production accounts, change protected tenant mappings, or run a database backfill to make this demo look fresh. Set aside any older screenshots or answers; they are not evidence for this take.

## Screen map

The console has a left sidebar. **Home**, **Rooms**, **Decisions**, **Ask AI**, and **Files** are under Work. **Setup** and **Connectors** are below that. The current workspace name is near the top of the sidebar. On a narrow browser, open the sidebar with the panel button at the top left.

Development screenshots show the placement of the [workspace step](../pr-screens/onboarding-1-workspace.png), [calendar step](../pr-screens/onboarding-2-calendar.png), [team step](../pr-screens/onboarding-4-team.png), and [empty Home](../pr-screens/onboarding-home-checklist.png). They are orientation aids, not screenshots of this live account.

## 1. Sign in and create Northline

1. **Open the app.** In the owner browser profile, type `https://sederunt.vercel.app/console` into the address bar. On the centered **Sign in** card, click **Continue with Google**. On Google's account chooser, select the fresh owner account and complete any consent page. **Expected:** Sederunt opens **Step 1 of 4**, titled **Create your workspace**. **If not:** read the visible sign-in error; do not use **Use a passphrase** for a Google new-user demo.
2. **Name the workspace.** In **Workspace name**, type `Northline`. In the optional **Bot name** field underneath, leave `Adam`. Click **Continue** at the lower right of the card. **Expected:** **Step 2 of 4 — Connect your calendar**. **If not:** correct the field marked in red. If **Your team is already here** appears, the account may be eligible to join an existing tenant; choose the create-new path for this story and verify Northline is a new workspace.

## 2. Connect Calendar, Slack, and the team

3. **Connect Calendar.** On **Connect your calendar**, find the **Google Calendar** row. Click **Connect Google Calendar** at the card's lower right. In Google, choose the same account and grant the requested Calendar access. Back on Sederunt, wait for **Connected** on the Calendar row. **Expected:** the Northline event may appear under **Coming up** if it falls inside the page's upcoming window. **If not:** retry the consent from this card or later from **Setup**; do not call Calendar connected while it says **Finish in Setup** or **Needs Google access**.
4. **Choose meeting join.** Below **Coming up**, turn on **Send Sederunt to my meetings automatically** if you want the scheduled Meet to summon Adam. Click **Continue** at the lower right. **Expected:** **Step 3 of 4 — Where should Sederunt post?** **If not:** leave auto join off and use the manual meeting-link route in step 13; record which route was used.
5. **Install Slack for Northline.** On **Where should Sederunt post?**, find the **Slack** row and click **Connect Slack** at the lower right. Slack opens its authorization screen. Choose the *demo* Slack workspace, select `#ops-hq` or the intended channel if asked, then click Slack's **Allow**. **Expected:** the browser returns to Sederunt; the Slack row says **Connected**. **If not:** use the displayed `slack` result or error to diagnose consent, scopes, distribution, or workspace ownership. A Slack dashboard reinstall by itself is not a Northline tenant connection.
6. **Continue to the team step.** Click **Continue** on the Slack card. On **Step 4 of 4 — Invite your team**, use **Email address**, **Role**, and the **Add** button beside them to add a genuine demo teammate as a **Member**. Check that the address appears in the list, then click **Invite 1 person** at the lower right. **Expected:** an **invite ready** screen with **Copy link** for that person and **Go to Home**. Sederunt does not send the email for you. **If no real teammate is available:** click **I'll do this later** at the lower left, then proceed. Do not enter an invented address or claim an email was sent.
7. **Check the first Home.** Click **Go to Home** if shown. The sidebar workspace name near the top should read **Northline**, with **Home** selected. The main area should show an empty meeting state and **Add Sederunt to a meeting**. **Expected:** no old rooms, decisions, or files from another tenant. **If old content appears:** stop the take and investigate tenant isolation before continuing.

## 3. Check the in-app tool surfaces

8. **Check Setup.** In the left sidebar, click **Setup**. In its tool rows, find **Google Calendar** and **Slack**; both should read **Connected**. In Slack, separately open `#ops-hq` → channel members and invite Adam if the app is absent. **Expected:** the channel is usable by the installed bot. **If Setup says Not connected or the bot is absent:** finish the relevant connection or channel invitation before the meeting.
9. **Set the meeting guest.** Still on **Setup**, scroll below the tool rows to **Meeting guest**. The **Name** field is the guest's camera label; set it to `Adam` if it differs. Leave **Triggers** as the intended wake phrases, one line per phrase, then click **Save the guest** beneath the fields. **Expected:** a saved confirmation appears. **If not:** correct the field shown by the page. The workspace **Bot name** and **Meeting guest Name** are separate controls.
10. **Add the preset connectors.** In the sidebar, click **Connectors**. Under **Presets**, click **Google Forms** and **Google Calendar**. If a card says **Needs Google access** or offers **Connect Google Forms/Calendar**, use that link, grant the scopes in Google, return, and add the preset. **Expected:** both preset cards remain **Connected** after a browser reload. **If not:** retry the missing consent; do not describe a preset as connected from its **Add** state alone.

## 4. Hold a real meeting

11. **Open Meet.** In the owner's Google Calendar, open `Northline · Launch + D7 lock` and click **Join with Google Meet**. Admit Adam if Meet places him in its waiting room. **Expected:** Adam is visibly present before any decision is spoken. **If he is absent:** use step 12.
12. **Manual join if needed.** In Sederunt **Home**, click the central **Add Sederunt to a meeting** button. In the **New room** dialog, select **Meeting** at the top, paste the real Meet URL into **Meeting link**, then click **Join with this link** at the bottom. Return to Meet and admit Adam. **Expected:** Sederunt says it is joining and Adam appears in Meet. **If it says Meet is not ready or could not join:** fix the meeting connection before speaking; a room row alone is not proof Adam heard anything.
13. **Speak three keeps.** As the owner in Meet, say each sentence clearly and pause after each:

   > Adam, remember this: our new Ho Chi Minh City office is District 7, Building B, floors eight and nine. Move-in is December second.

   > Adam, remember this: launch stays November eighteenth only if billing is green by November twelfth. Otherwise we move to November twenty-fifth.

   > Adam, remember this for ops only: the booth staging unlock is [new fictional phrase].

   **Expected:** Adam is still in the call; the contractor is not. If a proposed external write produces an **Allow**, **Approve**, or **Confirm** control, inspect it and use that control before expecting the action to run. **If speech recognition misses a line:** repeat it in the live call. Do not insert a synthetic memory.
14. **End and inspect.** End the Meet. In Sederunt's left sidebar, click **Rooms**, then click the new Northline meeting row. On the room page, use the **Transcript** pane on the left and **Decisions** on the right. **Expected:** complete office, launch, and private-phrase sentences, not just an address word such as “Adam.” **If a keep is missing:** note the failure. A later Slack catch-up can create a separate live source for office or launch facts, but cannot make a missed meeting keep pass.
15. **Show the record proof.** On the room page, click the **Verified on Walrus** badge near the meeting header if present. In the **Record** dialog, expand **Show technical details** and locate the blob/object, checkpoint, and **Read via Tatum gRPC** line. Click **Verify again** if desired; close with the **X** at the top right. **Expected:** the proof belongs to this new room and says verified. **If proof is unknown:** record that state and troubleshoot Tatum/Walrus separately; do not show an older room's proof as this meeting's.

## 5. Ask AI — before showing Slack

16. **Ask about the office.** In the sidebar, click **Ask AI**. The question field is at the bottom of the page, with placeholder **Ask about a meeting or decision** and a **Send** button to its right. Type “Where is the new HCMC office and when do we move in?” and click **Send**. **Expected:** a streamed answer naming District 7, Building B, floors 8–9, and 2 December, with source chips for this workspace. **If the answer is empty, unrelated, or cites old records:** stop and investigate the new tenant's record before continuing.
17. **Ask about the launch.** In the same bottom field, type “What is the November launch gate?” and click **Send**. **Expected:** 18 November if billing is green by 12 November, otherwise 25 November. The answer and citation chips should have readable labels and no raw Slack user IDs. **If not:** mark the Ask result failed; do not paraphrase a wrong answer as a pass.
18. **Show persistence and quota.** Point to the quota text beneath the composer, normally a count out of five questions for the day. Reload Ask AI and confirm the earlier turns remain. If time allows, submit a third real question and reload during its stream, then show it resuming. **Expected:** earlier answers persist and the quota matches the actual requests. **If a stream does not resume:** mark that specific check failed; preserve quota for the rest of the take.

## 6. Show Slack privacy and live file resend

19. **Test the contractor.** Switch to the contractor browser profile. In Slack's left sidebar, open the DM with Adam. Send: “What was the staging unlock from the Northline launch meeting?” **Expected:** no new phrase and no owner-only meeting content in Adam's response. A refusal or a “nothing you can read” answer is acceptable. **If the phrase appears:** stop; the privacy check failed.
20. **Post the announcement.** Return to the owner's Slack profile. In the left sidebar, open `#ops-hq`. Paste the body of [`northline-ops-announcement.txt`](../demo-pack/northline-ops-announcement.txt) into the message composer. Use Slack's attachment button beside the composer to attach [`northline-d7-floor-brief.txt`](../demo-pack/northline-d7-floor-brief.txt) and [`northline-launch-gate.txt`](../demo-pack/northline-launch-gate.txt), then send. **Expected:** one real channel message with both attachments, visible to the owner and Adam. A channel post may be kept without a bot reply; do not wait for or claim a visible “Kept” message unless one actually appears. **If the files do not upload:** retry the actual Slack upload before the DM test. Never post the private phrase in this channel.
21. **Ask Adam to resend.** In the owner's Slack left sidebar, open the DM with Adam. Send: “Send me the District 7 floor brief we kept.” **Expected:** exactly one new Adam reply, with the correct `northline-d7-floor-brief.txt` attachment or a working link. Open/download it to confirm the contents. **If Adam only names a file without bytes or a working link:** mark the resend failed; do not count an old reply from a previous take.

## 7. Show Files and finish the take

22. **Upload from the console.** In Sederunt's sidebar, click **Files**. At the upper right of the **Files** heading, choose `#ops-hq` in the **Channel** selector if it appears, then click **Upload file**. In the system file picker choose `northline-d7-floor-brief.txt`. **Expected:** its row appears, possibly first as **Uploading…**, then with **Verified on Walrus** beneath the filename. **If Upload file is hidden or the upload fails:** check that the Slack channel and Walrus Console file storage are ready; mark the Files step failed rather than substituting a screenshot.
23. **Inspect and download.** On that file's row, click **Verified on Walrus**. In the dialog, expand **Show technical details**; close with the top-right **X**. On the same row, click **Actions** at the far right, then **Download** in the menu. Open the downloaded file. **Expected:** the floor-brief contents match the source file. **If not:** mark the proof or download check failed separately.
24. **Delete only after the resend and download pass.** On the file row, click **Actions → Delete**. In the **Delete file** dialog, read the filename, then click the red **Delete** button at the lower right. **Expected:** **Deleting…** may appear briefly, then the row disappears. **If it remains:** wait for the worker/status to settle; do not claim deletion from the confirmation click alone.
25. **Final reload.** Click **Home**, then **Rooms** and **Decisions** in the sidebar, reloading each relevant page once. **Expected:** Northline still owns the new meeting and decisions; no other tenant's records appear; the deleted file stays gone from **Files**. Stop the recording after those results are on screen. **If any state changes unexpectedly:** keep the continuous recording as failure evidence and write down the exact screen and time.

## Capture notes and result record

Use a single, unedited recording of the fresh sign-in, real meeting, live Ask answers, live Slack messages, and Files proof. Native pointer movement should remain visible. Make any short promotional edit only after the continuous demo is complete. Keep credentials, invite links, raw private IDs, and the private phrase out of public notes.

After the take, record these fields in a private result note:

| Field | Value |
| --- | --- |
| Recording date/time and file | |
| Production deployment URL and Git SHA | |
| Fresh owner identity and new workspace name | |
| Slack workspace/channel and installation result | |
| Meeting title and start/end time | |
| Meeting keeps, proof, Ask, contractor privacy, resend, Files, final reload: pass/fail with timestamps | |
| Failures and exact visible error text | |

The demo is ready to share only when the first-time OAuth/install path, new-tenant isolation, real meeting keep, Ask grounding, contractor privacy, live file resend, and Files proof each have evidence in this take. A prior test pass or the historical export does not satisfy a live step.
