# Supabase

SQL migrations and database tests for identity and tenancy.

Apply `migrations/` in filename order with the Supabase CLI or the hosted migration runner. `tests/` are self-rolling-back checks for a database that already has the auth schema. They are not migrations.

Sign-in, the publishable key, and the OAuth redirect URL are documented in [docs/auth-setup.md](../docs/auth-setup.md).
