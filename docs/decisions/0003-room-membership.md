# 0003 — The room is the membership

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

Someone has to be allowed to hear a decision. A Sederunt password, a Google button, or a wallet connection would invent an account the meeting already has. Walrus Memory and Walrus Console already sign their own operators in with zkLogin. Those addresses are different from each other, and neither is the member in the room.

## Decision

We authorize a caller by the member id the room platform assigned. The decision stores the ids of the people present while the bot was there. A caller with no member id is refused. A caller whose id is absent from that decision is refused. Members do not sign in to Sederunt.

## Alternatives Considered

- zkLogin inside Sederunt — a third Sui address, and it still would not match the meeting's participant id.
- A web2 login — a user table that the room does not use.
- A wallet connection — members do not hold SUI, and the product does not spend.

## Consequences

- The operator signs in once on Walrus Memory, outside this process, and registers the delegate key there.
- The landing has no login and no `/record` page.
- A local MCP client carries one member id in its configuration. That id must be one of the ids stored with the decision.
- A later hosted MCP server mints a short-lived credential after seeing the person in a room. The credential is bound to the member id. The server still holds the only delegate key.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-3
- Designs: [docs/design/access.md](../design/access.md), [docs/design/entities.md](../design/entities.md)
