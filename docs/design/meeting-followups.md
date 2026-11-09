# Design: Meeting follow-ups

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-11-04
**Scope:** Feature — matching invitees to Slack, the action DM, and minutes delivery

## Mission

After a meeting, Sederunt asks the person who requested a write before it runs, and it delivers minutes to one place. A channel post and a direct message to every attendee are never both used.

## Links

- Behavior: [bot-behavior.md](./bot-behavior.md) — the words on the DM, the minutes, and the three speaking modes
- Actions: [actions.md](./actions.md) — a write still goes through the gate
- Decisions: [0004](../decisions/0004-write-preference.md)
- Access: [access.md](./access.md) — who may hear a sentence

## People matching

`src/slack/match.js` looks up each invitee with Slack `users.lookupByEmail`. The method needs the `users:read.email` scope ([method](https://docs.slack.dev/reference/methods/users.lookupByEmail), [scope](https://docs.slack.dev/reference/scopes/users.read.email)). The call goes through an injected `fetch`.

| Slack result | Stored source | Delivery |
|---|---|---|
| User id returned | `lookup` | `slack` |
| `users_not_found` | `none` | `email` |
| `missing_scope` | not stored | the batch stops; the scope is named |
| HTTP 429 or `ratelimited` | not stored until a later attempt succeeds | wait `Retry-After`, then retry ([rate limits](https://docs.slack.dev/apis/web-api/rate-limits)) |

The cache is `public.slack_user_matches`, one row per tenant, Slack workspace, and lowercased email. An admin override (`source = override`) wins over lookup and is not refreshed. `upsertLookup` will not replace an override. Members of the tenant can read. Only an owner or admin (`private.admin_tenant_ids()`) can insert, update, or delete an override. Lookup rows are written with the service role, which bypasses RLS. The client cannot insert a `lookup` row.

The Account page card "People matching" (`src/console/people-matching.js`) lists email, Slack user, and source. The override control renders only when the viewer is an admin.

## Preferences

`public.bot_preferences` stores one key and value. `user_id` null is the workspace row. A row with a user id belongs to that person.

| Who | Workspace row | Own row | Someone else's row |
|---|---|---|---|
| Member | read | read and write | no |
| Owner or admin | read and write | read and write their own | no |

`src/bot/preferences.js` is the API. The in-memory store is the stand-in the tests use. The prompt receives the applied map: workspace first, then that user's keys.

`bot_name` and `wake_phrases` are workspace rows (`user_id` null). A missing name means Adam. Wake phrases are stored only when someone customizes them; otherwise they are `Hey {name}` and `{name}`. A member cannot put those keys on their own row: the check constraint requires `user_id` null, and the value has to be a real name or a JSON list of phrases. The prompt ignores both keys, so a user preference cannot rename the bot. See [bot behavior](./bot-behavior.md).

## Action DM

`src/meeting/actions.js` asks an injected model for structured JSON and validates it. An item is one of `assign_task`, `create_form`, `edit_calendar`, or `other`. Each item names who asked, a one-line summary, and where the write would happen. A missing requester, a multiline summary, or an unknown kind is rejected.

The requester gets one DM (`conversations.open`, then `chat.postMessage`). The Block Kit checklist is one section per item and one actions row: Approve, Edit, Skip. `action_id` is `approve:<id>`, `edit:<id>`, or `skip:<id>`. `value` is the item id. The line is the verb, the object, and the place, for example `Create Google Form 'Retro' in your Google Drive`.

The interactivity payload is handled as a parsed body or as the form field `payload`.

| Button | What runs | Reply |
|---|---|---|
| Approve | The connector, and only if the actor is the requester and the item is still open | Result in the same DM, `thread_ts` = the checklist message. A success includes the link. A failure names the next step |
| Edit | Nothing | A modal when `trigger_id` and `openModal` exist. Otherwise a thread reply that asks what should change |
| Skip | Nothing | The item is `skipped`, and the thread says it did not run |

A second Approve on a done or skipped item does not call the connector. Someone who is not the requester cannot change the item.

`runApprovedAction` sends Forms and custom tools through `callTool` in `src/connectors/client.js` (`create_form` on the Forms preset, or the item's tool on a custom connector). Calendar uses the injected port's `updateEventDetails`, the write on `src/calendar/mcp.js`. The item store is in memory (`createMemoryActionStore`: `get`, `put`, `update`). A durable store implements that same interface.

## Minutes

`renderMinutes` in `src/meeting/minutes.js` writes a TL;DR line, then Decisions, Action items, and Open questions. An empty section is omitted. A section keeps at most five bullets. A decision cites `(12:04)` when the transcript time was passed in. An action item is `• <text> — <@U…>, <due> (12:04)`. A missing Slack owner is `owner?`. A missing due date is `due?`. A display name is not turned into a mention. People who were not reached are listed as `Not reached: …`.

`decideMinutesDelivery` chooses the door. `sendMinutes` performs it. With no email sender, unmatched people stay in `notReached` and nothing is emailed. When a sender is passed and `emailSending` is set, those addresses are handed to the sender once and are not listed as not reached.

### Decision table

People in the examples: A and B attended and have Slack ids. C attended and has no Slack id. D did not attend and has a Slack id. E did not attend and has no Slack id.

| Meeting | Channel post | DMs | Email or not reached |
|---|---|---|---|
| Room binding `C_BIND`, even if the invite also names a channel | `C_BIND` only | none | C and E not reached (they cannot see the channel). D sees the channel |
| No binding, invite names `C_INVITE` | `C_INVITE` only | none | C and E not reached |
| No channel | none | A and B only | C not reached. D and E get nothing: they did not attend, and there is no channel |
| Private 1:1, even with a binding and an invite channel | none | attended people who match | an unmatched attendee is not reached |
| No channel, and an email sender is configured | none | A and B | C is emailed once, and is not listed as not reached |
| Channel, and an email sender is configured | the one channel | none | C and E are emailed once |

A channel post and a DM list are never both set. Invitees who did not attend are not direct-messaged. Private two-person minutes never go to a channel.

## Live testing still needed

The unit tests use a fake Slack client, a fake model, and fake connectors. They do not open a network connection. A real workspace still has to show:

- `users:read.email` is granted, `users.lookupByEmail` returns a user, and `users_not_found` stays on `email`.
- An admin override on the Account card wins over the next lookup.
- `im:write` and `chat:write` let the bot open the requester's DM and post the checklist.
- The interactivity URL receives Approve, Edit, and Skip. Approve runs only that requester's item. The result lands in the same DM thread.
- Minutes with a bound channel post once in that channel. Minutes with no channel DM only the people who attended and matched. A private 1:1 does not hit a channel.
- `bot_preferences` lets a member save their own row and lets an admin save the workspace row.

## Links to code

- `src/slack/match.js`, `src/console/people-matching.js`
- `src/bot/preferences.js`, `src/bot/persona.js`
- `src/meeting/actions.js`, `src/meeting/minutes.js`
- `supabase/migrations/20261104102057_slack_matches_and_bot_preferences.sql`

## Durable runtime contract (2026-11-09)

`src/meeting/followups.js` coordinates runtime jobs. Apply
`20261109130000_meeting_followups.sql` before enabling the server integration.
The service-role store uses tenant-scoped insert-once records and revision
compare-and-swap. Browser roles cannot read or mutate the queue. The memory
store is for tests and must not be selected in production.

The meeting-end adapter supplies trusted `tenantId`, `meetingId`, `teamId`,
verified `memberIds`, and attributed `sources`. Each source has an immutable
`id`, `text`, `memberId`, optional `slackUserId`, `inviteMemberIds`, and a trusted
`action` containing `kind`, `tool`, `args`, `where`, `explicit`, and any
`existingActionId` or completed `connectorId`. Model proposals select only
`sourceId`; model-supplied requester, tool, and arguments are ignored. Completed
sources are excluded. Supported pairs are `assign_task/create_issue`,
`create_form/create_form`, and `edit_calendar/update_event`.

`enqueue(input)` saves an outcome; `drain({tenantId,limit})` materializes and
claims bounded batches. Duplicate meeting-end events do not create another
checklist or minutes message. Revised minutes update the original message.
Verified minutes must summarize only the supplied source evidence. A channel
is eligible only when the caller verified every channel recipient may read
every source (`channelAuthorized`). Private 1:1 minutes always use DMs. DM
recipients must be verified attendees permitted by every source. No email is
sent. The injected `authorizeDelivery({record})` must recheck current access
before sending or updating; absence or rejection closes delivery as not reached.

Slack interactivity must verify the signature over the raw request body before
calling `interact`. Input contains trusted tenant/workspace IDs, authenticated
`actorSlackId`, actual `channelId`, original checklist `threadTs`, versioned
button `value`, and `verb`. All must match stored state. `authorize({record,
actorSlackId})` checks current invitation and membership. A modal submit uses
its versioned metadata only to look up the record; channel and thread come
from persistence. `validateEdit(data,edit)` returns `{ok,args,summary}` only
after required tool fields and connector authority are checked. Saving bumps
the argument version and requires another approval. Closed messages lose their
buttons. Results are queued in the same DM thread and rebuilt after restart.

Approval calls `handleUtterance` with intent `followup-approve`. The domain must
call `authorizeExecution(input)` before allowing a write. It verifies the
persisted immutable claim, lease, requester, source, arguments and version,
rechecks current authorization, and consumes the permit once with CAS. The
domain then applies its allow gate. Explicit paused actions reuse their
existing ID. AI-inferred actions require the requester's approval. An unset
explicit tool preference remains Run automatically, by product decision.
`runApprovedAction` is a low-level adapter for the gated domain only; legacy
`handleActionPayload` fails closed.

A connector receipt is mandatory for `done`. A known pre-submission failure
may be approved again. A timeout, exception after submission, missing receipt,
or expired running lease becomes `outcome_unknown`; neither connector writes
nor uncertain Slack sends retry automatically. Operators must inspect the
external service and reconcile the stored receipt before creating a replacement.
Successful receipts persist before result delivery, so notification failure
cannot cause a connector replay. Outcome-only materialization can retry with
bounded backoff; it has no external side effect itself.

Real PostgreSQL tests exercise concurrent claims in separate sessions,
restart-visible receipts, role restrictions, identity conflicts, and tenant
cascade deletion. Coordinator tests exercise forged evidence, actor/workspace/
DM/thread/version mismatches, single-use permits, edited approvals, unknown
results, duplicate events, closed checklists, and amended minutes. Real Slack
and connector end-to-end validation still requires a configured workspace.

Run one bounded recovery batch with
`node scripts/drain-meeting-followups.mjs`. Configure
`SEDERUNT_RECOVERY_ORIGIN` and `SEDERUNT_RECOVERY_SECRET` in the operator's
shell. The script calls `POST /api/recovery/drain`, sends a maximum limit of
10, does not accept a tenant override, refuses remote plain HTTP, and never
prints the secret or response body. The server endpoint authenticates the
secret and owns tenant selection. A completed batch does not mean every job
is delivered; inspect remaining states and reconcile unknown outcomes.
