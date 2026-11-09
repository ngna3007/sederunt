-- Per-tenant Linear MCP grants. One grant per tenant, one tenant per Linear
-- workspace. The access token and refresh token travel as one AES-256-GCM
-- ciphertext (MCP_SECRETS_KEY_V1). RLS is on with no policies. Service role only.

create table public.linear_installations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  workspace_id text not null unique check (workspace_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  workspace_key text not null check (workspace_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  workspace_name text not null default '' check (char_length(workspace_name) <= 200),
  team_key text not null check (team_key ~ '^[A-Za-z0-9]{1,20}$'),
  scopes text[] not null default '{}',
  installed_by uuid references auth.users (id) on delete set null,
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  expires_at timestamptz not null,
  generation uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linear_installations enable row level security;
revoke all on public.linear_installations from public, anon, authenticated;

create function public.linear_installation_save(
  p_tenant_id uuid, p_workspace_id text, p_workspace_key text, p_workspace_name text,
  p_team_key text, p_scopes text[], p_installed_by uuid, p_ciphertext bytea, p_nonce bytea,
  p_key_version integer, p_expires_at timestamptz, p_replace boolean, p_expected_generation uuid
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_row public.linear_installations;
  saved public.linear_installations;
begin
  perform 1 from public.tenants where id = p_tenant_id for key share;
  if not found then return to_jsonb('missing-tenant'::text); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id, 1));
  select * into current_row from public.linear_installations where tenant_id = p_tenant_id for update;
  if current_row.tenant_id is not null and current_row.workspace_id <> p_workspace_id and not p_replace then
    return to_jsonb('different'::text);
  end if;
  if current_row.generation is distinct from p_expected_generation then
    return to_jsonb('stale'::text);
  end if;
  insert into public.linear_installations as s (
    tenant_id, workspace_id, workspace_key, workspace_name, team_key, scopes, installed_by,
    ciphertext, nonce, key_version, expires_at
  ) values (
    p_tenant_id, p_workspace_id, p_workspace_key, p_workspace_name, p_team_key, p_scopes, p_installed_by,
    p_ciphertext, p_nonce, p_key_version, p_expires_at
  ) on conflict (tenant_id) do update set
    workspace_id = excluded.workspace_id,
    workspace_key = excluded.workspace_key,
    workspace_name = excluded.workspace_name,
    team_key = excluded.team_key,
    scopes = excluded.scopes,
    installed_by = excluded.installed_by,
    ciphertext = excluded.ciphertext,
    nonce = excluded.nonce,
    key_version = excluded.key_version,
    expires_at = excluded.expires_at,
    generation = gen_random_uuid(),
    updated_at = clock_timestamp()
  returning * into saved;
  return to_jsonb(saved) - 'ciphertext' - 'nonce' - 'key_version';
exception when unique_violation then
  return to_jsonb('conflict'::text);
end;
$$;

create table public.linear_oauth_consumed (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
create index linear_oauth_consumed_expiry on public.linear_oauth_consumed (expires_at);
alter table public.linear_oauth_consumed enable row level security;
revoke all on public.linear_oauth_consumed from public, anon, authenticated;

create function public.linear_oauth_consume(p_nonce_hash text, p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare touched integer;
begin
  if p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '11 minutes' then return false; end if;
  delete from public.linear_oauth_consumed where expires_at <= clock_timestamp();
  insert into public.linear_oauth_consumed values (p_nonce_hash, p_expires_at) on conflict do nothing;
  get diagnostics touched = row_count;
  return touched = 1;
end;
$$;

grant all on public.linear_installations, public.linear_oauth_consumed to service_role;
revoke all on function public.linear_installation_save(uuid, text, text, text, text, text[], uuid, bytea, bytea, integer, timestamptz, boolean, uuid) from public, anon, authenticated;
revoke all on function public.linear_oauth_consume(text, timestamptz) from public, anon, authenticated;
grant execute on function public.linear_installation_save(uuid, text, text, text, text, text[], uuid, bytea, bytea, integer, timestamptz, boolean, uuid) to service_role;
grant execute on function public.linear_oauth_consume(text, timestamptz) to service_role;
