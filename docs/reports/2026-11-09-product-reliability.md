# Product reliability review — 2026-11-09

The product reliability branch adds Google-only member sign-in, scoped room and Ask reads, durable deletion intents, shared Files state, pinned connector transport, and persisted meeting follow-ups. Unset tool preferences remain `do`; inferred proposals require requester approval.

## Validation

- `npm test`: 909 tests, 897 passed, 12 skipped; `.local/tmp/admin-validation/fixes-full-final.log` in the original workspace. The Calendar adjustment after that run passed the 62-test focused meeting suite.
- `npm run check:integration`: 22 passed with disposable PostgreSQL, Redis and PostgREST; no skips. This includes action-claim concurrency and participant membership checks.
- `npm run check:syntax`: passed.
- `npm run check:audit`: no vulnerabilities at the configured high severity threshold.
- `npm run check:secrets`: passed a full Git-history scan with one exact, expiring exception for a synthetic value in the historical secret-redaction test. The exception does not suppress other findings.

## Remaining release evidence

A live Slack, Google Meet/Calendar and connector sandbox was not exercised. The opt-in Slack installation PostgreSQL/PostgREST integration test was not included in the disposable-service command. The skipped tests and live provider flow require verification before release. Configure and test Vercel's `CRON_SECRET` and `SEDERUNT_RECOVERY_SECRET` independently; apply migrations in order to a disposable environment and then a reviewed preview. Existing legacy learned material and Ask answers without provenance are excluded from the new read paths.

Do not roll back to an application version that bypasses access checks or deletion intents while retaining production traffic. Pause affected endpoints if a rollback would restore those paths. No production deployment or real customer data reset was performed as part of this work.
