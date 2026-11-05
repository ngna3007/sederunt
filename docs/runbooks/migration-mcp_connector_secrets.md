# Dry-run: mcp_connector_secrets

**Status:** NOT applied. Waiting for Hai Ken approval before any migration apply.

**File:** `supabase/migrations/20261104143000_mcp_connector_secrets.sql`

## What it does

Creates `public.mcp_connector_secrets` for server-only ciphertext of custom MCP connector secrets:

- Columns: `connector_id` (PK), `tenant_id`, `ciphertext`, `nonce`, `key_version`, `updated_at`.
- FK to `mcp_connectors (id, tenant_id)` with cascade delete.
- RLS enabled with **no** policies for `anon` / `authenticated` (they cannot read or write).
- Revokes table grants from `public`, `anon`, `authenticated`. Service role keeps access by bypassing RLS.

## Why

Phase 4/5 custom MCP connectors need sealed secrets at rest (`MCP_SECRETS_KEY_V1`). Without the table, secret persistence is incomplete.

## Risk

- Low for empty projects: create table + RLS lock-down.
- Does not migrate or expose existing secrets.
- App code that expects the table will no-op or fail closed until applied — connectors still degrade with clear empty states.

## How to apply (after approval)

```bash
less supabase/migrations/20261104143000_mcp_connector_secrets.sql
# Apply only after Hai Ken approves this migration by name
```

Do **not** apply until Hai Ken says yes to this specific migration.
