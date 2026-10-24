# 0004 — A write tool has a preference

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

Some people want the agent to wait before it changes a tool. Some people want an explicit request to be enough. A single spoken yes, required for every write, fits only the first group.

## Decision

Each write tool has a preference stored with the account: `ask` or `do`. A new tool starts at `ask`. A room may override that preference for itself. Reads ignore the preference. Under both values the agent does not invent an action, and a missing fact stops the action.

When the preference is `ask`, Sederunt states the one action and waits. Confirmation covers that action only. When the preference is `do`, an explicit request is enough, and there is no pending confirmation.

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
