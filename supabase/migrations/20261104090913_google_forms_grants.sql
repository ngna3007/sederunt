-- Sealed Google refresh grants for one person in a space.
-- Access tokens are not stored. RLS is on and there are no policies.
-- anon and authenticated cannot read or write. The service role bypasses RLS.

create table public.person_google_grants (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  person_id text not null,
  provider text not null default 'google',
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, person_id, provider)
);

alter table public.person_google_grants enable row level security;

revoke all on public.person_google_grants from public, anon, authenticated;

comment on table public.person_google_grants is
  'Sealed Google refresh grants for one person in a space. Server-only. Access tokens are not stored.';

create trigger person_google_grants_set_updated_at
  before update on public.person_google_grants
  for each row execute function private.set_updated_at();
