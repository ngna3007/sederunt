# 0002 — Two accounts, not a namespace

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

A company record and a personal record must stay apart. A MemWal namespace does not do that. On one MemWal account, delegate access is account-wide, and any registered delegate can request any namespace. One Sui address owns one MemWal account.

## Decision

We keep two MemWal accounts. The company account holds the room record. The personal account holds a private note. A utterance prefixed `private:` or `private note:` is stored on the personal account. The company delegate is refused there.

## Alternatives Considered

- One account and a namespace per person — a delegate can read every namespace on that account.
- One account per meeting — the company record would fragment, and a later question would not have one place to look.

## Consequences

- The owner key that registers delegates stays off the server. The process holds delegate keys only.
- The personal account is the same shape as the company account: one owner, and the members of a private note are that owner.
- Namespace `sederunt` names the product's memories inside an account. It is not an access boundary.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-2.2, SED-7.1
- Designs: [docs/design/record.md](../design/record.md), [docs/design/entities.md](../design/entities.md)
