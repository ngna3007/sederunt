# Runbooks

Operational procedures: the steps for running, deploying, and recovering the
system.

## Conventions

- One file per procedure: `<procedure>.md` (for example `deploy.md`,
  `rollback.md`, `incident-response.md`).
- Every step states its expected result and its rollback path.
- Write for someone under time pressure who has read nothing else.

## When to read

While operating the system — deploying, rolling back, or responding to an
incident.

## Live demo / QA

- [new-user-live-demo.md](./new-user-live-demo.md) — screen-by-screen procedure for a continuous first-time-user recording (onboarding → meeting → Ask AI → Slack → Files).
- [admin-demo-recovery.md](./admin-demo-recovery.md) — locate an account, reset AI quota, or restart onboarding with the same Google login; includes deletion scope and deployment setup.
- [live-demo-plan.md](./live-demo-plan.md) — older Northline QA story and test prompts; use the click-by-click procedure above for a fresh recording.
