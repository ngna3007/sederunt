# Admin recovery production rollout, 8 November 2026

User approval authorized the admin migration, production credentials and deployment. No account reset or quota reset was authorized or executed during rollout.

- App: https://sederunt.vercel.app/admin
- Production deployment: `dpl_2XD3v7gNNydK4WWJLAKXQ1sYF1VQ`, READY.
- Immutable deployment URL: https://sederunt-qgmue9dlg-nguyn-ngc-anhs-projects.vercel.app
- Deployed source: local release commit `18ad5b5` on `feat/admin-demo-recovery`, based on `54cab8e56a3bfdc0dc2a482089565afb075787db`. Deployed with Vercel CLI from the isolated worktree; no Git push or main merge was performed.
- Supabase project: `ltfhvngxlsvvwswseerw`. Applied only the new `admin_demo_reset` migration. Historical migrations were not replayed.
- Configured the three production admin environment variables. Password hash and session secret values are excluded from this report.
- Database permission check: anonymous reset denied, service-role reset allowed.
- Database check after smoke test: zero rows in `admin_actions`; protected historical workspace still exists.

## Live browser evidence

- Unauthenticated admin redirects to sign-in.
- Requested credentials open the live account directory.
- Account details load real workspace memberships and AI quota.
- Production cookie is HttpOnly, Secure and SameSite Strict.
- Desktop and mobile have no horizontal overflow.
- Sign-out removes access to the directory API.
- Ordinary Google sign-in remains available.
- No browser JavaScript errors.

No destructive actions were executed. Live reset execution remains unexercised on real accounts; its scope, shared-workspace preservation, Slack reinstall and Redis cleanup passed disposable local integration checks. The selected release suite passed 110 tests with no failures or skips. Existing full-suite failures documented in the recovery runbook were not resolved by this release.

## Operator entry points

Use the [admin recovery runbook](../runbooks/admin-demo-recovery.md) for exact controls and reset scope. Use the [new-user demo runbook](../runbooks/new-user-live-demo.md) for the recording, with Ask AI before Slack. Keep the admin password and production account data out of recordings.
