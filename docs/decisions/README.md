# Decisions

Architecture Decision Records: the choices that shape this system, with the
context and consequences that make them reviewable later.

## Conventions

- Name entries `NNNN-<slug>.md`; numbers are monotonic and never reused.
- Record a decision that shapes system structure, crosses a component
  boundary, or is costly to reverse — before the code that depends on it.
  Implementation details and library picks are not decisions; they belong in
  [`../design/`](../design/) or the change itself.
- Start from [`../templates/adr.md`](../templates/adr.md).
- Status moves `Proposed → Accepted → (Superseded by NNNN)`. Never delete a
  superseded record — mark it and link forward; keep this index's one-liners
  current.
- Progress-neutral and tracker-neutral wording: no ticket IDs, no delivery
  status.
- Declare links: name the upstream docs this satisfies and the downstream docs
  it constrains.
- Update an entry in place while the decision holds; when the choice itself
  changes, add a new entry that supersedes it.

## Records

- [0001-one-process.md](./0001-one-process.md) — one Node process and one write gate.
- [0002-two-accounts.md](./0002-two-accounts.md) — company and personal are two MemWal accounts.
- [0003-room-membership.md](./0003-room-membership.md) — the room's member id is the authorization.
- [0004-write-preference.md](./0004-write-preference.md) — each write tool is ask or do.
- [0005-walrus-is-the-record.md](./0005-walrus-is-the-record.md) — Walrus is the record. This process does not sponsor gas.

## When to read

Before proposing an architecture change — to find the constraint you are about
to break.
