# Design: Actions

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-10-21
**Scope:** System-wide

## Mission

Turn one explicit request into one connector call, or into a waiting action, according to the tool's preference.

## Preference

The live `ToolPreference` for the tool is the account value, unless the room has an override. A missing document means `do`. `ask` records the request and does not call the connector. There is no confirm step. The activity log is the record of both. See [activity-log.md](./activity-log.md). [0004](../decisions/0004-write-preference.md) still describes the earlier ask default.

| Value | What the gate does |
|---|---|
| `ask` | States the one action. Stores it as `waiting`. Does not call the connector |
| `do` | Calls the connector as part of this delivery. Stores no waiting confirmation |

Reads, including "what is on Thursday" and a list of open tasks, ignore the preference and do not create an action.

A missing fact sets `missingFact` and skips the call under both values. The gate does not fill the fact in.

Confirmation under `ask` names that action's id. It does not cover a second action. Dismiss sets `dismissed`. A connector id from a later attempt is the only thing that closes the action.

## One delivery, one call

The delivery id is the idempotency key of the action, trimmed to 255 bytes. Handling a delivery that already has an action returns `duplicate-delivery` and does not call.

The call happens only when:

- the member passed the invite check
- the preference allows the call now (`do`, or `ask` after confirmation of this action)
- `missingFact` is empty
- the action has no `connectorId`

The connector is called after the action is stored. The id is written onto the action when it returns. A call that fails or returns an empty id leaves the action `available`. The next confirmation, or the next handling of a `do` delivery that is not yet closed, may call again. Two successful calls still cannot result from one delivery id.

`filed` and `updated` are computed by the domain from `edit` and `connectorId`. The gate does not set those words itself.

## Connectors

The MCP door's `act` tool submits the utterance to the gate. The gate's connector adapter performs the outside call.

Linear: one create or one update. The issue id is the connector id. The token is read inside the adapter and is absent from the response and the log.

Calendar: a write is one edit, such as moving a named event. The event id is the connector id. The tool name comes from the live Calendar MCP list. The Recall calendar API is not this connector.

A new tool starts at `ask` until a preference document replaces that default.

## Status words

| Word | When the screen or the answer may use it |
|---|---|
| `recorded` | The decision or action is stored, and no connector id applies |
| `filed` | A create returned an id |
| `updated` | An update returned an id |
| `current` | A decision with no predecessor and no live contradiction, or the replacement of one that is now replaced |
| `clashing` | Two unreplaced decisions contradict each other. Both stay |
| `replaced` | `replacedBy` is set. The text stays |
| `unknown` | The Tatum read failed |

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-4, SED-5.4
- Decisions: [0001](../decisions/0001-one-process.md), [0004](../decisions/0004-write-preference.md)
- Entities: [docs/design/entities.md](./entities.md)
- Access: [docs/design/access.md](./access.md)
- System: [docs/design/system.md](./system.md)
