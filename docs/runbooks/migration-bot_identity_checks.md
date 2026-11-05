# Dry-run: bot_identity_checks

**Status:** NOT applied. Waiting for Hai Ken approval before any `supabase db push` / migration apply.

**File:** `supabase/migrations/20261104110000_bot_identity_checks.sql`

## What it does

Adds Postgres check helpers and constraints so workspace bot preferences stay valid:

- `private.bot_name_text_ok(text)` — bot name is 1–32 characters, starts with a letter, allows spaces / hyphen / apostrophe (including Vietnamese casing).
- `private.wake_phrases_text_ok(text)` — wake phrases are a JSON array of 1–5 unique strings, each 2–40 characters.
- Constraints on `public.bot_preferences` so workspace-level (`user_id` null) `bot_name` and `wake_phrases` rows must pass those checks.
- Prevents a member's personal preference row from renaming the bot (workspace keys only).

## Why

PR #7 bot behavior (Adam + wake phrases) ships in code on `dev`. Without this migration, the DB does not enforce the same rules the app does.

## Risk

- Low. Functions are immutable helpers; constraints only reject bad new/updated rows.
- Existing bad rows (if any) would block the constraint add — dry-run / apply will fail loudly rather than corrupt data.
- No data rewrite; no RLS policy rewrite beyond the check.

## How to apply (after approval)

From the real checkout with Supabase linked (do not paste secrets):

```bash
# Review SQL first
less supabase/migrations/20261104110000_bot_identity_checks.sql
# Then apply only this migration with the project's usual approved flow
```

Do **not** apply until Hai Ken says yes to this specific migration.
