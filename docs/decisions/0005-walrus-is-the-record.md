# 0005 — Walrus is the record

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

A decision has to outlive the process. A database next to Walrus becomes a second source of truth. Gas and storage also have to be paid. Walrus Memory's public relayer pays WAL and SUI for a memory write. Walrus Console pays for its own files and sponsors the private-folder transaction through Enoki. Sui's native sponsored transactions pay gas only, and Walrus has no primitive where a user signs a store while someone else pays the gas.

## Decision

We store the decision in Walrus Memory through the public relayer. We store a file in a private Walrus Console folder. We do not add a database as the record, and we do not run a gas sponsor. A derived index of invite sets and delivery ids may live in memory. It must be rebuildable by reading the account.

## Alternatives Considered

- Postgres as the record, Walrus as a backup — a restart or a second reader can disagree with the chain.
- Sederunt sponsors transactions — Memory and Console already pay for the writes this product makes.
- The agent holds WAL and SUI — the delegate key would become a treasury.

## Consequences

- The chain stamp is the checkpoint of the write, read back through Tatum. A date inside the blob is not the stamp. When the recalled sentence and the object disagree, the object wins. When Tatum fails, the status is unknown. There is no public-fullnode fallback.
- Console renews its files. A memory lasts for the epochs the relayer paid. The owner-token API has no renew scope, so this process does not extend blobs.
- The landing and this process do not load an owner key. They do not render an account id.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-2, SED-5, SED-6, SED-7.6
- Designs: [docs/design/record.md](../design/record.md), [docs/design/system.md](../design/system.md)
