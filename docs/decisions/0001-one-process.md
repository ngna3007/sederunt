# 0001 — One process, one gate

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

Meetings, channels, agents, Memory, Console, Tatum, and outside tools can each grow their own service. A second process would store a second copy of a decision or miss a delivery the first process already handled.

## Decision

We run one ESM Node process. Every door calls one gate. The gate is the only path that writes.

## Alternatives Considered

- A service per door — each door can drift, and a delivery can be handled twice.
- A web framework in front of the gate — the landing and the gate do not need one.

## Consequences

- Domain rules import nothing else in the program. The gate imports the domain and receives clients. An adapter imports its own SDK. The landing does not fetch.
- The server does not invent a status. Status comes from the domain.
- Adding a door means calling the gate, not copying it.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-1, SED-3.4, SED-4
- Designs: [docs/design/system.md](../design/system.md), [docs/design/actions.md](../design/actions.md)
