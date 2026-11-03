# Design: Activity log

**Status:** draft
**Owner:** @ngna3007
**Last updated:** 2026-11-03
**Scope:** Feature-level

## Mission

Every request and its effect is one append-only event. The console shows those events as one feed. A new integration adds data, not a new component.

## Design Principles

- One event shape. Linear, Calendar, Slack, Recall, and a later MCP tool fill the same fields.
- The sentence is rendered from the fields and one verb table. No integration owns a sentence template.
- A request and its action, result, or failure share `requestId`. The feed groups on that id.
- The log stores display names. It refuses secrets and raw account ids on write.

## Event

| Field | Meaning |
|---|---|
| `id` | This row |
| `requestId` | Pairs the request with the action, result, failure, or undo |
| `ts` | When it was recorded |
| `kind` | `request`, `action`, `result`, `failure`, or `undo` |
| `actor` | `{ type: person \| sederunt \| integration, name, via? }` |
| `verb` | One of the controlled verbs below |
| `target` | `{ system, type, id, title, url }` |
| `changes` | `[{ field, from, to }]` |
| `tool` | `{ name, server }` when an MCP tool did the work. `name` is `act` for the gate |
| `origin` | `{ roomId, roomName, at?, messageUrl? }` |
| `outcome` | `ok`, `failed`, or `undone` |
| `error` | A human sentence when `outcome` is `failed` |
| `undo` | `{ available, until }` on a successful action that can be reversed |

`actor.via` is `Google Meet`, `Slack`, `MCP: <client name>`, or `Console`.

`target.system` is `linear`, `calendar`, `slack`, `recall`, or a later system name. `target.type` is `issue`, `event`, `message`, `bot`, or a later type.

Controlled verbs: `create`, `update`, `assign`, `unassign`, `move`, `label`, `unlabel`, `link`, `comment`, `post`, `schedule`, `reschedule`, `cancel`, `join`, `leave`.

## Sentence grammar

One renderer fills this pattern from the verb table:

`{actor} {verbPhrase} {target} {changesPhrase} {viaPhrase} · {relTime}`

A request appends the origin (`room name` and transcript offset, or the channel) before the relative time. A failure appends `Retry` instead of the time. The relative time is `just now`, `2m ago`, `1h ago`, `3d ago`, or `6w ago`.

| Verb | Request | Action or result | Failure | Undo |
|---|---|---|---|---|
| assign | asked to assign {id} {title} to {to} | assigned {id} to {to} via {via} | couldn't assign {id} | undid assigning {id} |
| move, reschedule | asked to move {title} to {to} | moved {title} from {from} to {to} on {system} via {via} | couldn't move {title} | undid moving {title} |
| post | asked to post {title} in {room} | posted {title} in {room} via {system} | couldn't post {title} | undid posting {title} |
| other verbs | asked to {verb} {title} | {past} {title} via {via} | couldn't {verb} {title} | undid {verb} {title} |

`{via}` is `MCP` when `actor.via` starts with `MCP`. `{system}` is the product name (`Google Calendar`, `Slack`, `Linear`, `Recall`).

Examples, all from that table:

- Daniel asked to assign ABC-123 Fix booth signage to Rowan · Booth planning 0:22 · 2m ago
- Sederunt assigned ABC-123 to Rowan via MCP · 2m ago
- Mina asked to move Design crit to 3 PM tomorrow · #sederunt-demo · 1h ago
- Sederunt moved Design crit from 2:00 PM to 3:00 PM on Google Calendar via MCP · 1h ago
- Sederunt couldn't move Design crit: the calendar is read-only · Retry
- Rowan undid moving Design crit · just now
- Sederunt posted a summary in #sederunt-demo via Slack

## Feed

Rows that share `requestId` render as one group. The request is the first row. The action, result, or failure sits under it, indented, on the same vertical line. The icon comes from a verb map. A failure uses the error icon. A small system mark is a badge beside the icon, not a separate row component.

Undo is offered on an action while `undo.available` is true and `undo.until` is still ahead. Choosing it appends an `undo` event and sets the action's outcome to `undone`.

## Write path

`logRequest`, `logAction`, `logResult`, `logFailure`, and `logUndo` are the only writers. The typed gate and the MCP `act` tool both call them. A write that contains a secret or a raw account id is refused and is not stored. Display names are what the log keeps.

The events live on the session and are appended to the company memory as `kind: activity`. A restart reads them back. The text stored beside the document is the rendered sentence, not a token or an account id.

## Preference

A missing tool preference runs the connector. `ask` records the request and does not call. There is no confirm step. This is the operator default the console toggle exposes as "Run automatically".

[0004](../decisions/0004-write-preference.md) still says a missing preference is `ask` and that `ask` waits for a confirm. The activity log and the gate now follow the default above. The decision record is unchanged until it is revised.

## Security

- Secrets and raw ids are rejected at the writer. Redaction is not a second copy of the same value.
- `target.url` is kept only when it is an `https://linear.app/` or `https://slack.com/` link with the query string removed.
- The feed never shows a member id, a bot token, or a memory key.

## Open Points

- Whether `result` stays distinct from `action` for a tool that reports progress after the call. Today a finished call is an `action`.
- The undo call back to Linear or Calendar is not defined yet. The log records the undo either way.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-4
- Decisions: [0004](../decisions/0004-write-preference.md)
- Actions: [docs/design/actions.md](./actions.md)
- Workspace: [docs/design/workspace.md](./workspace.md)
