# Design

Distilled system and feature design: how a subsystem works and why it is
shaped that way.

## Conventions

- One file per subsystem or feature: `<topic>.md`; system-wide design lives in
  `system.md`.
- Start from [`../templates/design.md`](../templates/design.md).
- Progress-neutral and tracker-neutral wording: no ticket IDs, no delivery
  status.
- Declare links: name the upstream docs this satisfies and the downstream docs
  it constrains.
- Distilled, not raw: a design doc is the curated source of truth, not a
  transcript of the exploration behind it.

## Documents

- [system.md](./system.md) — the process, the doors, and the gate. Read first.
- [walrus-files.md](./walrus-files.md) — channel files on Walrus Console: shared folder by default, optional isolated folder, Postgres visibility, deletion, memory cleanup.
- [console-mint-plan.md](./console-mint-plan.md) — out-of-band mint of an isolated workspace key. Not executed by the runtime.
- [entities.md](./entities.md) — the records and their invariants.
- [access.md](./access.md) — who may hear a sentence.
- [record.md](./record.md) — Walrus Memory, Walrus Console, and the Tatum proof.
- [actions.md](./actions.md) — write preference and connector calls.
- [activity-log.md](./activity-log.md) — one event shape for every request and its effect.
- [workspace.md](./workspace.md) — the operator workspace. Shell, home, and history.
- [rooms.md](./rooms.md) — bringing the bot into a room, and the room dialog.
- [design-system.md](./design-system.md) — tokens and components for the console, sign-in, and onboarding.

## When to read

Before implementing or changing a subsystem — and read
[`../decisions/`](../decisions/) for the constraints it must honor.
