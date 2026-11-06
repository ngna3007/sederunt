# 0004 — A write tool has a preference

- **Status**: Accepted
- **Date**: 2026-10-21
- **Updated**: 2026-11-03

## Context

Some people want the agent to wait before it changes a tool. Some people want an explicit request to be enough. A single spoken yes, required for every write, fits only the first group.

## Decision

Each write tool has a preference stored with the account: `ask` or `do`. A missing preference is `do`: the connector runs as part of the delivery. A room may override that preference for itself. Reads ignore the preference. Under both values the agent does not invent an action, and a missing fact stops the action.

When the preference is `ask`, Sederunt records the request and does not call the connector. There is no confirm step and no waiting action. When the preference is `do`, an explicit request is enough. The activity log records the request and the action, failure, or undo. See [activity-log.md](../design/activity-log.md).

## Alternatives Considered

- A required spoken yes for every write — people who want the action performed still have to confirm.
- A standing allow that is a phrase the parser matches — the preference is a setting, not a sentence.

## Consequences

- The same delivered utterance produces one connector call under both preferences. Delivery handling prevents the second call. The preference does not add a second confirmation on `do`.
- The action stays available until the connector returns an id. A failed call does not close it.
- Changing `do` back to `ask` stops the next action before the connector is called.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-4
- Designs: [docs/design/actions.md](../design/actions.md), [docs/design/entities.md](../design/entities.md)
