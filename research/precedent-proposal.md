# Software Proposal and Requirements

| | |
| --- | --- |
| Product | Sederunt |
| Document | Proposal and software requirements |
| Version | 0.5 Draft |
| Date | 20 October 2026 |
| Status | Draft. Not approved for build. |
| Contest | Tatum × Walrus Total Recall |
| Track | Smart Agents for Real Life. Best Walrus Memory is a bonus on this one entry. |
| Standard | Adapted from ISO/IEC/IEEE 29148 and IEEE 830. Requirements use shall / shall not and are written so a demo can pass or fail them. |
| Priority | MoSCoW: Must, Should, Could, Won't. |

The public name is Sederunt. Precedent was the working title. It is already used by a Slack decision-memory project, an npm instruction-conflict tool, and legal-research products.

Version 0.5 makes the company agent a connector host. A member connects an app with a remote MCP server, or with OAuth when that app has no MCP server. The agent reads a connected app when asked. It edits only when a member has allowed that write. The contest demo connects Linear and Google Calendar. Adding another app is the same screen.

## 1. Executive summary

Sederunt is a meeting participant that keeps the company memory. The closest public shape is Quorum, https://devpost.com/software/quorum-vntz2e (29 March 2026): a named participant on Meet, Zoom, or Teams that speaks, reads tools, and remembers decisions. Sederunt takes that participant. A read needs no allow. A write waits for an allow. The status word comes from the Sui object through Tatum, and a second agent recalls the same notes from Walrus.

It joins the call under its own name, with a camera tile and a voice. It hears the meeting and writes notes as the conversation moves. A member can talk to it: "What did we say about the trip?", "What is open in Linear?", "What is on the calendar Thursday?" It answers out loud, from the company memory, from Linear, or from the calendar.

It can also change Linear or the calendar, and only when that change is allowed. An allow is either a spoken yes in the meeting or a standing permission a member set beforehand. Until the allow exists, it says what it would change and waits. The status on the screen becomes `filed` or `updated` only after Linear or the calendar accepts the change.

After the meeting, Claude Code and the web chatbot answer from the same memory. Walrus holds the notes, the questions, the allows, and the results. Tatum reads the Sui object that says what is current. The agent cannot set that word.

## 2. Problem

A meeting decides a trip, opens work, and moves a date. The next session of Claude Code was not in the room. A private chat on one laptop was not either.

A silent transcript does not answer "what is on Thursday?" and it cannot file the ticket the room just agreed to. An agent that edits Linear or the calendar on its own can file the wrong thing because the room was still talking. The record has to show what was heard, what was allowed, and what the outside system actually accepted.

## 3. Proposed product

The agent has three powers. Hearing and answering are on. Editing is off until a member allows it.

| Power | Example | What happens |
| --- | --- | --- |
| Note | The room talks through a Da Nang trip for December. | The agent writes the note without waiting for "note this." |
| Answer | "What is on the calendar Thursday?" "Which Linear tickets are open for the trip?" | It looks up the calendar or Linear and speaks the answer. It also answers from notes it already kept. |
| Edit, if allowed | "File a venue ticket." "Move Thursday's review to Friday." | With an allow, it makes the change and says what came back. Without an allow, it states the change and waits. |

A decision is a note the room treats as the plan. If a later note contradicts a current decision, both stay visible until a member resolves them.

### 3.1 In the meeting

The agent joins a call the team invited it to. On entry it says it is in the meeting, it will take notes, and it will not change Linear or the calendar unless someone allows it.

It hears the whole call. As topics settle, it writes a note: the trip, the date, who is going, the open question. It speaks when someone addresses it, when it kept a note worth confirming, or when it needs an allow.

A member can interrupt it. "What did we just agree?" It answers from the notes. "What is open in Linear?" and "What is on Thursday?" go to whichever apps are connected. The agent does not have Linear or the calendar built in. It calls the connector the company turned on.

"File the venue ticket" and "Move Thursday to Friday" are writes. If that connector's write is allowed, the agent calls the tool, speaks the id that comes back, and the item becomes `filed` or `updated` only then. If the allow is off, it says what it would change and waits.

### 3.2 Allows

An allow is a record, not a sentence the model remembers.

| Allow | What it unlocks | What stays locked |
| --- | --- | --- |
| Spoken yes | The one change just proposed | The next change, until someone says yes again |
| Standing allow | That kind of change, for this company, until a member turns it off | Every other kind |

Each connected app brings its own tools. A tool is a read or a write. Reads need no allow. A write, including a delete, needs an allow for that tool. The demo turns on writes for creating and updating a Linear issue, and for creating and moving a calendar event. Other write tools stay off until a member allows them.

The standing allow is set by a member on the web app. The agent cannot connect an app and cannot turn an allow on. The connection, the allow, the request, and the result are separate memories.

### 3.3 After the meeting

Claude Code and the web chatbot use the same read as the meeting agent. "What did we say about the trip?" returns the notes, the status from the Sui object, and the Linear or calendar link when a change was accepted.

A member can correct a note on the web app. A correction is a new memory that names the one it replaces. The old words stay visible.

A second agent, given only the company account, returns the same notes. An agent without that key is refused. Removing the meeting agent's key makes its next write fail. Notes already written stay.

### 3.4 Week one and week four

Week one, the agent notes the Da Nang trip, answers a calendar question, and files a venue ticket after a spoken yes.

Week four, a later note says the offsite is postponed, and the venue ticket is closed in Linear. Asked again, the agent says the trip was postponed. It does not quote Da Nang as the plan, and it does not open a second ticket. The same question went in. The answer changed because of the notes and the object.

## 4. Users

| User | Need |
| --- | --- |
| Person in the meeting | Talk normally, then ask the agent what was said or what Linear and the calendar show. |
| Member | Allow one edit, or leave a standing allow on. Resolve a clash. Correct a note. |
| Teammate, later | Ask Claude Code or the web chatbot and get the same notes. |
| Agent | Hear, note, answer, and edit only inside an allow. Never set status, and never invent a Linear id or a calendar event id. |
| Judge | Hear it answer from Linear and the calendar, hear it wait when an edit is not allowed, then see the same note in Claude Code. |

## 5. Scope

### 5.1 In scope

- One speaking participant in one invited meeting. It hears the call and writes notes.
- A connector list. A member adds an app by its remote MCP server URL and signs in, or by OAuth when the app has an API and no MCP server.
- Spoken questions answered from the notes and from any connected app's read tools.
- Writes only through an allow on that tool. The demo allows two apps: Linear's MCP server and Google Calendar's MCP server.
- Company MemWal account for the meeting notes and the connector record. One personal account for a note a member marks private.
- One Sui object per item, read by Tatum.
- Web app: the notes, the connected apps, the allows, a chatbot, and clash resolution.
- One MCP server of our own, so Claude Code can recall the company memory.
- At least ten Walrus Memory records on Sui Mainnet. Seeded records are labeled.

### 5.2 Out of scope

A scraped login or a shared password. A custom screen for every new app. A person leaderboard. Cursor and Codex packaging. A live feed of every Sui checkpoint. Re-encryption of historical blobs. An organization chart of every team.

The contest demo connects two apps. A third app is the same add-connector screen, not a new feature, provided it has a remote MCP server or an OAuth API.

A typed question on the web app shall use the same read and the same allow gate, so a demo can run if the call fails.

## 6. Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | The meeting agent shall join as a named participant, hear the call, and speak answers in the call. | Must |
| FR-02 | The agent shall write notes from the meeting without waiting for a "note this" command. Each note shall name the topic, the words, and the speaker when the transcript provides one. | Must |
| FR-03 | The agent shall answer a spoken question from the meeting notes or from a read tool on a connected app. | Must |
| FR-04 | A member shall connect an app by a remote MCP server URL with OAuth, or by OAuth to that app's API when no MCP server exists. The agent shall not add a connection. | Must |
| FR-05 | A read tool shall not require an allow. A write tool, including a delete, shall not run unless an allow covers that tool. | Must |
| FR-06 | A spoken yes shall allow only the write the agent just proposed. | Must |
| FR-07 | A member shall be able to set or remove a standing allow per write tool. The agent shall not set an allow. | Must |
| FR-08 | After an allowed write, the item shall become `filed` or `updated` only when the connector returns an id. The agent shall speak that id. If the connector refuses, the status shall stay `recorded` and the agent shall say the edit did not happen. | Must |
| FR-09 | The demo connections shall be Linear's remote MCP server and Google Calendar's remote MCP server. A third connection shall use the same screen and the same allow gate. | Must |
| FR-10 | The system shall store three kinds of item: note, ticket, and decision. A ticket or calendar change is an edit of an item. A decision is a note marked as the plan. | Must |
| FR-11 | The system shall show one status word set in code from the Sui object: `recorded`, `filed`, `updated`, `current`, `clashing`, or `replaced`. The model shall not set it. | Must |
| FR-12 | A new decision that contradicts the current decision in the same area shall set `clashing` and show both. Only a member shall resolve it. | Must |
| FR-13 | The system shall not treat the newest note as the winner. A replacement shall keep the old note visible and marked `replaced`. | Must |
| FR-14 | The web chatbot and the Claude Code connector shall use the same read and the same allow gate as the meeting agent. | Must |
| FR-15 | Before answering what is current, filed, or updated, the read shall load the object through Tatum `LedgerService/GetObject`. If recall and the object disagree, the answer shall follow the object. | Must |
| FR-16 | The system shall stamp each note, allow, and accepted edit with the checkpoint sequence of the transaction that recorded it. | Must |
| FR-17 | The system shall write the notes, the questions it answered, the allows, and the edit results to Walrus Memory. The demo shall hold at least ten Mainnet memories. Seeded rows shall be labeled seeded. | Must |
| FR-18 | An agent given only the company account id and a delegate key shall return the same trip note and the same ticket as the web app. | Must |
| FR-19 | An agent whose key is not a delegate of a second account shall be refused on that account. | Must |
| FR-20 | After the owner removes a delegate, the next relayer write from that key shall fail. The product shall not say that older notes were deleted. | Must |
| FR-21 | On entry the agent shall say that it takes notes and that edits wait for an allow. | Must |
| FR-22 | The main screen shall list the meeting notes, the allows that are on, and the Linear or calendar link for an accepted edit. It shall not show keys or account ids. | Must |
| FR-23 | The proof page shall show the Tatum read, the account, the checkpoint sequence, and whether each edit had an allow. | Should |
| FR-24 | A note a member marks private shall stay on that member's account and shall not appear in company recall. | Should |
| FR-25 | A typed question shall use the same read and the same allow gate as a spoken one. | Must |

### 6.1 Acceptance

| Story | Pass when |
| --- | --- |
| Notes | The room discusses the Da Nang trip without saying "note this." The note is in the company memory. |
| Answer | "What is on Thursday?" is answered from the calendar, in the call. |
| Linear read | "What tickets are open for the trip?" is answered from Linear, with no edit. |
| Edit refused | With ticket creation off, "file the venue ticket" produces no Linear issue. The agent asks for a yes. |
| Edit allowed | After a spoken yes, Linear returns an id, the agent speaks it, and the status is `filed`. |
| Calendar edit | After an allow, Thursday's review moves to Friday and the event id is stored. |
| Clash | A contradicting decision stays `clashing` until a member resolves it. |
| Week four | After the postponement, the agent does not quote Da Nang as the plan and does not open a second ticket. |
| Second agent | A new process with the company key returns the same notes. |

## 7. Non-functional requirements

| ID | Class | Requirement | Priority |
| --- | --- | --- | --- |
| NFR-01 | Integrity | Status shall be a function of the Sui object and the id returned by Linear or the calendar. The prompt shall not be an input. | Must |
| NFR-02 | Integrity | An edit request, its allow, and its result shall be separate records. A missing allow shall make the edit function return without calling the outside API. | Must |
| NFR-03 | Security | Company notes and a private note shall use two MemWal accounts. A namespace shall not be the privacy boundary. | Must |
| NFR-04 | Security | The meeting agent shall hold the company delegate key. Connector tokens shall stay in the server vault. The agent shall not hold a second memory account's key, and a token shall not be written into a Walrus memory. | Must |
| NFR-05 | Security | The owner key that adds and removes delegates shall stay off the server. | Must |
| NFR-06 | Security | The product shall say that the managed Walrus relayer can see the notes, because it sees plaintext. | Must |
| NFR-07 | Security | Key removal shall be described as loss of future relayer access. Older blobs stay readable with the older key until re-encrypted. | Must |
| NFR-08 | Privacy | The agent shall join only a call the team invited it to. On entry it shall say it can hear the meeting. | Must |
| NFR-09 | Privacy | The product shall not score a person. | Must |
| NFR-10 | Honesty | The product shall not show an accuracy number it has not measured. Seeded rows shall be labeled. | Must |
| NFR-11 | Honesty | The product shall not say that Walrus provides meetings, tickets, calendars, or allows. Those are this application. | Must |
| NFR-12 | Honesty | The product shall not promise deletion. A correction is a new memory. | Must |
| NFR-13 | Honesty | The product shall not claim that every app connects, or that Recall's calendar API edits events. A connection requires a remote MCP server or an OAuth API. | Must |
| NFR-14 | Reliability | If the Tatum read fails, the agent shall say the status is unknown. It shall not answer "filed" or "current" from recall alone, and it shall not fall back to a public Sui node. | Must |
| NFR-15 | Reliability | The submitted demo shall use Tatum Sui gRPC. | Must |
| NFR-16 | Reliability | If the meeting call fails, the typed path shall still note, answer, and edit through the same gate. | Must |
| NFR-17 | Usability | A reader shall see the trip, the ticket link, and which allows are on without reading an account id. | Must |
| NFR-18 | Usability | The main screen shall be readable at desktop width and at 390 pixels. | Should |
| NFR-19 | Compatibility | The speaking path shall use Recall.ai Output Media on Zoom, Google Meet, Microsoft Teams, or Webex. | Must |
| NFR-20 | Compatibility | Claude Code shall use one MCP server. The web chatbot shall use the same functions. | Must |
| NFR-21 | Maintainability | Status, clash, allow check, and filed-versus-recorded shall be pure functions with tests that do not call Walrus, Tatum, Linear, the calendar, or a model. | Must |
| NFR-22 | Cost | The demo call shall stay within Recall.ai's published recording rate. The bot's billed time includes waiting in the lobby. | Must |
| NFR-23 | Capacity | The demo shall be one company account, one personal account, one meeting, one calendar, one Linear team, and fewer than twenty delegates. | Must |

No availability percentage is promised. This is a contest demo.

## 8. External interfaces

| System | Use | Not used for |
| --- | --- | --- |
| Walrus Memory | The notes, the questions, the allows, and the edit results. | Status. Deciding that an edit succeeded. |
| Tatum Sui gRPC | `LedgerService/GetObject` for each item. Checkpoint sequence for the stamp. | A meeting API or a clash stream. |
| Sui Mainnet | One object per item. Two MemWal accounts. | A second copy of the allow list. The allow is also a memory. The object says what is current. |
| Remote MCP | The company agent calls tools on apps the member connected. Demo servers: Linear at `https://mcp.linear.app/mcp`, Google Calendar at `https://calendarmcp.googleapis.com/mcp/v1`. | Our memory. Connecting an app. |
| OAuth API | The fallback connector when an app has an API and no remote MCP server. Same allow gate. | A custom screen per app. |
| Our MCP server | Claude Code and the web chatbot recall company memory. | Calling Linear or the calendar. That direction is the row above. |
| Recall.ai calendar | Read which meeting to join. Send the bot to that meeting. Read-only. | Creating or moving events. Calendar edits go through the Calendar MCP connector. |
| Recall.ai Output Media | The participant's camera and voice. Transcript of the call, including the agent's own speech when configured. | Memory and edits. |
| MCP | Note, ask, allow, edit, recall. | A second store. |

Recall.ai's pricing page lists $0.50 per recording hour. Their bot-usage doc has also stated $0.70. The demo budget follows the invoice.

## 9. Constraints

- Submissions close 10 November 2026 at 17:00 UTC. One submission.
- Walrus Memory on Sui Mainnet, at least ten memories, Tatum on the read that decides the screen, a public repository, a working demo, a two-to-three minute video, and a blog post on how it learned.
- One MemWal account per Sui address. Any delegate on an account can read every namespace on that account.
- The managed relayer sees plaintext.
- Output Media speaks on Zoom, Google Meet, Microsoft Teams, and Webex. Slack Huddles are not a speaking platform.
- Linear's remote MCP server is `https://mcp.linear.app/mcp`, with a read-only endpoint at `https://mcp.linear.app/mcp/readonly`. Checked 20 October 2026.
- Google Calendar's remote MCP server is `https://calendarmcp.googleapis.com/mcp/v1`, documented 12 October 2026, OAuth, Streamable HTTP. It is a Developer Preview.
- Recall's calendar scope for sending the bot is `calendar.events.readonly`. That connection does not edit the calendar.
- The product must be renamed before the video.
- The agent hears the people in the invited call. The entry line says so.

## 10. Assumptions

- The team can create two Sui addresses, two MemWal accounts, a Tatum key, a Linear API key, a Recall.ai key, and one calendar connection with a write scope for the demo account.
- One scripted meeting is enough. The typed path is the backup.
- Week-four notes may be seeded if labeled. The live demo still notes a trip, answers one calendar question, and files one ticket after a yes.
- Further tools stay behind the same allow. They are not part of this build.

## 11. Deliverables

| Deliverable | Done when |
| --- | --- |
| Web app | The notes, the allow switches, the chatbot, and clash resolution meet FR-11, FR-14, and FR-22. |
| Meeting agent | It hears the scripted meeting, speaks an answer, refuses one edit, and completes one allowed edit. |
| MCP connector | Claude Code meets FR-14 and FR-18. |
| Sui objects | Each demo item has an object a public explorer can open. |
| Mainnet memories | FR-17, seeded rows labeled. |
| Tests | NFR-21 covers status, the allow check, clash, and filed-versus-recorded. |
| Video, 2–3 minutes | The trip is noted without a command, a calendar answer, a refused edit, an allowed Linear ticket, then Claude Code recalling the postponement. |
| Blog | What the agent answers in week one and in week four, and which rows were seeded. |
| Repository | Public. No owner key, Linear key, calendar token, or Recall key in the repo. |

## 12. Schedule

| When | Work |
| --- | --- |
| Week of 20 October 2026 | Notes, the allow check, and the status tests. Two accounts. Sui object. Linear read, and Linear create behind an allow. |
| Week of 27 October 2026 | Calendar read and one calendar edit behind an allow. Clash and replacement. Tatum `GetObject`. Web list, allow switches, chatbot, and MCP. |
| Week of 3 November 2026 | Speaking participant that hears the call and answers. Second-agent demo. Ten Mainnet memories. Video and blog. |

The typed path ships before the speaking bot. If the call slips, the entry still notes, answers, and edits through FR-25.

## 13. Verification

Pure tests cover status, the missing-allow refusal, clash, and filed-versus-recorded. Those tests do not call Linear or the calendar. A Mainnet transaction covers the stamp. The video covers the spoken answer, the refused edit, the allowed edit, and the second agent. A requirement with no check is removed rather than described as done.

## 14. References

- ISO/IEC/IEEE 29148 and IEEE 830, adapted for this draft.
- Total Recall, https://tatum.io/hackathon/total-recall
- Walrus Memory, https://docs.wal.app/walrus-memory
- Tatum Sui gRPC, https://docs.tatum.io/reference/rpc-sui
- Recall.ai Output Media, https://docs.recall.ai/docs/stream-media
- Recall.ai Calendar V2, https://docs.recall.ai/docs/calendar-v2-integration-guide
- Recall.ai Google Calendar scopes, https://docs.recall.ai/docs/calendar-v2-google-calendar
- Local research: `research/precedent-strength.md`, `research/precedent-angles.md`

## 15. Approval

The public name is Sederunt. This draft does not authorize implementation. Build starts after this Must set is accepted.
