-- Per-tenant Slack app installations (Add to Slack, oauth.v2.access).
-- One installation per tenant (primary key) and one tenant per Slack team
-- (unique team_id): a team installed for another tenant is a conflict, never
-- a silent reassignment. The bot token is AES-256-GCM ciphertext sealed with
-- MCP_SECRETS_KEY_V1. RLS is on with no policies; only the service role reads.
-- Writes go through the two functions below so each decision is one atomic
-- statement (no read-then-write races between concurrent callbacks).

create table public.slack_installations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  team_id text not null unique check (team_id ~ '^[TE][A-Z0-9]{2,}$'),
  team_name text not null default '' check (char_length(team_name) <= 200),
  bot_user_id text not null default '' check (char_length(bot_user_id) <= 40),
  app_id text not null default '' check (char_length(app_id) <= 40),
  channel_id text not null default '' check (char_length(channel_id) <= 40),
  channel_name text not null default '' check (char_length(channel_name) <= 200),
  scopes text[] not null default '{}',
  installed_by uuid references auth.users (id) on delete set null,
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  generation uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.slack_installations enable row level security;
revoke all on public.slack_installations from public, anon, authenticated;

-- Durable authority for legacy compatibility. Absence is not authorization:
-- a verified legacy claim must enroll while its tenant exists. Once OAuth wins,
-- deleting/revoking the active installation never restores legacy eligibility.
create table public.slack_connection_state (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mode text not null check (mode in ('legacy', 'oauth', 'disconnected')),
  team_id text not null check (team_id ~ '^[TE][A-Z0-9]{2,}$'),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index slack_legacy_team_owner on public.slack_connection_state(team_id) where mode = 'legacy';
alter table public.slack_connection_state enable row level security;
revoke all on public.slack_connection_state from public, anon, authenticated;

-- The caller has already verified auth.test and exact legacy Redis ownership.
-- Tenant and team locks are shared with installation_save: Redis is only input
-- to enrollment, never the authority after migration/supersession.
create function public.slack_legacy_eligible(p_tenant_id uuid, p_team_id text, p_enroll boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_state public.slack_connection_state;
begin
  perform 1 from public.tenants where id = p_tenant_id for key share;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_team_id, 1));
  select * into current_state from public.slack_connection_state where tenant_id = p_tenant_id;
  if current_state.tenant_id is not null then
    return current_state.mode = 'legacy' and current_state.team_id = p_team_id
      and not exists (select 1 from public.slack_installations where tenant_id = p_tenant_id or team_id = p_team_id);
  end if;
  if p_enroll is not true or exists (select 1 from public.slack_installations where tenant_id = p_tenant_id or team_id = p_team_id)
    or exists (select 1 from public.slack_connection_state where team_id = p_team_id and mode = 'legacy') then return false; end if;
  insert into public.slack_connection_state(tenant_id, mode, team_id) values (p_tenant_id, 'legacy', p_team_id);
  return true;
end;
$$;

-- Only service_role may call these SECURITY INVOKER functions or access rows.
-- Serialize decisions for the same tenant, including an absent first install.
-- The unique team constraint arbitrates claims by different tenants.
create function public.slack_installation_save(
  p_tenant_id uuid, p_team_id text, p_team_name text, p_bot_user_id text, p_app_id text,
  p_channel_id text, p_channel_name text, p_scopes text[], p_installed_by uuid,
  p_ciphertext bytea, p_nonce bytea, p_key_version integer, p_replace boolean,
  p_expected_generation uuid
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_row public.slack_installations;
  saved public.slack_installations;
begin
  perform 1 from public.tenants where id = p_tenant_id for key share;
  if not found then return to_jsonb('missing-tenant'::text); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_team_id, 1));
  if exists (select 1 from public.slack_connection_state where team_id = p_team_id and mode = 'legacy' and tenant_id <> p_tenant_id) then
    return to_jsonb('conflict'::text);
  end if;
  select * into current_row from public.slack_installations where tenant_id = p_tenant_id for update;
  if current_row.tenant_id is not null and current_row.team_id <> p_team_id and not p_replace then
    return to_jsonb('different-team'::text);
  end if;
  if current_row.generation is distinct from p_expected_generation then
    return to_jsonb('stale'::text);
  end if;
  insert into public.slack_installations as s (
    tenant_id, team_id, team_name, bot_user_id, app_id, channel_id, channel_name,
    scopes, installed_by, ciphertext, nonce, key_version
  ) values (
    p_tenant_id, p_team_id, p_team_name, p_bot_user_id, p_app_id, p_channel_id, p_channel_name,
    p_scopes, p_installed_by, p_ciphertext, p_nonce, p_key_version
  ) on conflict (tenant_id) do update set
    team_id = excluded.team_id, team_name = excluded.team_name, bot_user_id = excluded.bot_user_id,
    app_id = excluded.app_id, channel_id = excluded.channel_id, channel_name = excluded.channel_name,
    scopes = excluded.scopes, installed_by = excluded.installed_by, ciphertext = excluded.ciphertext,
    nonce = excluded.nonce, key_version = excluded.key_version,
    generation = gen_random_uuid(), updated_at = clock_timestamp()
  returning * into saved;
  insert into public.slack_connection_state(tenant_id, mode, team_id) values (p_tenant_id, 'oauth', p_team_id)
    on conflict (tenant_id) do update set mode = 'oauth', team_id = excluded.team_id, updated_at = clock_timestamp();
  -- Return metadata only, not ciphertext or plaintext.
  return to_jsonb(saved) - 'ciphertext' - 'nonce' - 'key_version';
exception when unique_violation then
  return to_jsonb('conflict'::text);
end;
$$;

-- A lifecycle event lacks an installation id. Check app + bot (for revocation),
-- event time AND the generation observed by the handler. A reinstall can never
-- be deleted by an in-flight or delayed event. Ambiguous same-second events are
-- deliberately ignored (Slack event_time has second precision).
create function public.slack_installation_revoke(
  p_team_id text, p_app_id text, p_generation uuid, p_event_time timestamptz, p_bot_user_id text
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare removed integer; removed_tenant uuid;
begin
  delete from public.slack_installations
   where team_id = p_team_id and app_id = p_app_id and generation = p_generation
     and updated_at < p_event_time
     and (p_bot_user_id is null or bot_user_id = p_bot_user_id)
   returning tenant_id into removed_tenant;
  get diagnostics removed = row_count;
  if removed = 1 then
    update public.slack_connection_state set mode = 'disconnected', updated_at = clock_timestamp() where tenant_id = removed_tenant;
  end if;
  return removed;
end;
$$;

-- Explicit disconnect is monotonic too, including a legacy-only connection.
create function public.slack_installation_disconnect(p_tenant_id uuid, p_expected_generation uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_row public.slack_installations;
begin
  perform 1 from public.tenants where id = p_tenant_id for key share;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  select * into current_row from public.slack_installations where tenant_id = p_tenant_id for update;
  if current_row.generation is distinct from p_expected_generation then return false; end if;
  delete from public.slack_installations where tenant_id = p_tenant_id;
  update public.slack_connection_state set mode = 'disconnected', updated_at = clock_timestamp() where tenant_id = p_tenant_id;
  return found;
end;
$$;

-- Distributed single-use state. Nonce is random and hashed; the signed, expiring
-- browser cookie carries the user/tenant binding. Unique INSERT arbitrates all
-- app instances. Cleanup is safe because expired cookies cannot be accepted.
create table public.slack_oauth_consumed (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
create index slack_oauth_consumed_expiry on public.slack_oauth_consumed (expires_at);
alter table public.slack_oauth_consumed enable row level security;
revoke all on public.slack_oauth_consumed from public, anon, authenticated;
create function public.slack_oauth_consume(p_nonce_hash text, p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare touched integer;
begin
  if p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '11 minutes' then return false; end if;
  delete from public.slack_oauth_consumed where expires_at <= clock_timestamp();
  insert into public.slack_oauth_consumed values (p_nonce_hash, p_expires_at) on conflict do nothing;
  get diagnostics touched = row_count;
  return touched = 1;
end;
$$;

grant all on public.slack_installations, public.slack_oauth_consumed, public.slack_connection_state to service_role;
-- FOR KEY SHARE also requires UPDATE privilege on at least one column.
grant select, update (id) on public.tenants to service_role;
revoke all on function public.slack_installation_disconnect(uuid, uuid) from public, anon, authenticated;
grant execute on function public.slack_installation_disconnect(uuid, uuid) to service_role;
revoke all on function public.slack_legacy_eligible(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.slack_legacy_eligible(uuid, text, boolean) to service_role;
revoke all on function public.slack_installation_save(uuid, text, text, text, text, text, text, text[], uuid, bytea, bytea, integer, boolean, uuid) from public, anon, authenticated;
revoke all on function public.slack_installation_revoke(text, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.slack_oauth_consume(text, timestamptz) from public, anon, authenticated;
grant execute on function public.slack_installation_save(uuid, text, text, text, text, text, text, text[], uuid, bytea, bytea, integer, boolean, uuid) to service_role;
grant execute on function public.slack_installation_revoke(text, text, uuid, timestamptz, text) to service_role;
grant execute on function public.slack_oauth_consume(text, timestamptz) to service_role;
