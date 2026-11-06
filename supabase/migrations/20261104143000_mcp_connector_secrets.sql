-- Server-only ciphertext for custom MCP connectors.
-- RLS is on and there are no policies. anon and authenticated cannot read or write.
-- The service role bypasses RLS and keeps its table grant.

create table public.mcp_connector_secrets (
  connector_id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (connector_id, tenant_id) references public.mcp_connectors (id, tenant_id) on delete cascade
);

alter table public.mcp_connector_secrets enable row level security;

revoke all on public.mcp_connector_secrets from public, anon, authenticated;
