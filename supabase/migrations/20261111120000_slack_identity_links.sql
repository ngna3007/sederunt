-- Slack identities and channel bindings, written by the server only.
--
-- identities (provider slack) and channel_bindings existed, and the Files
-- ingest required both, but nothing created them, so Slack files never reached
-- Walrus and Slack askers never matched Meet-room memory. These two functions
-- are the only writers. Each re-checks that the Slack team belongs to the
-- tenant (its OAuth installation, or its enrolled legacy connection) so a
-- caller cannot link or bind across tenants. service_role only.

create or replace function private.slack_team_owned_by(p_tenant uuid, p_team text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.slack_installations i where i.tenant_id = p_tenant and i.team_id = p_team)
      or exists (
        select 1 from public.slack_connection_state s
        where s.tenant_id = p_tenant and s.team_id = p_team and s.mode = 'legacy'
          and not exists (select 1 from public.slack_installations i where i.tenant_id = p_tenant or i.team_id = p_team));
$$;
revoke all on function private.slack_team_owned_by(uuid, text) from public, anon, authenticated;

-- Link a Slack user to the one confirmed account with that email that is a
-- member of this tenant. No email, no match, or more than one match removes a
-- previous user link for that Slack user (a guest-owned row keeps only its guest).
-- Returns the linked user id, or null.
create or replace function public.slack_identity_link(
  p_tenant uuid, p_team text, p_slack_user text, p_email text, p_display text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ids uuid[];
  v_user uuid;
begin
  if p_tenant is null or coalesce(p_team, '') !~ '^[TE][A-Z0-9]{2,}$'
     or coalesce(p_slack_user, '') !~ '^[UW][A-Z0-9]{2,}$' then
    return null;
  end if;
  if not private.slack_team_owned_by(p_tenant, p_team) then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('slack-identity:' || p_team || ':' || p_slack_user, 0));
  if position('@' in v_email) > 1 then
    select array_agg(distinct u.id) into v_ids
    from auth.users u
    join public.memberships m on m.user_id = u.id and m.tenant_id = p_tenant
    where lower(u.email) = v_email and u.email_confirmed_at is not null
      and u.deleted_at is null and coalesce(u.is_anonymous, false) = false;
  end if;
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    delete from public.identities
    where provider = 'slack' and external_workspace_id = p_team and external_user_id = p_slack_user and guest_id is null;
    -- A guest-owned row that was later linked keeps its guest, never the stale user.
    update public.identities set user_id = null, linked_at = null
    where provider = 'slack' and external_workspace_id = p_team and external_user_id = p_slack_user
      and guest_id is not null and user_id is not null;
    return null;
  end if;
  v_user := v_ids[1];
  insert into public.identities (provider, external_workspace_id, external_user_id, user_id, email, display_name, linked_at)
  values ('slack', p_team, p_slack_user, v_user, v_email, nullif(left(coalesce(p_display, ''), 120), ''), now())
  on conflict (provider, external_workspace_id, external_user_id) do update set
    user_id = excluded.user_id,
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.identities.display_name),
    linked_at = case when public.identities.user_id is distinct from excluded.user_id or public.identities.linked_at is null
                     then now() else public.identities.linked_at end;
  return v_user;
end $$;
revoke all on function public.slack_identity_link(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.slack_identity_link(uuid, text, text, text, text) to service_role;

-- Bind a Slack channel to the tenant's shared Files channel (created with
-- tenant visibility when missing; the same space Console Files uses). An
-- external channel with a live (active or paused) binding is never re-pointed;
-- a binding owned by another tenant or paused returns null.
create or replace function public.slack_channel_bind(p_tenant uuid, p_team text, p_channel text, p_channel_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.channel_bindings%rowtype;
  c public.channels%rowtype;
begin
  if p_tenant is null or p_channel_id is null or coalesce(p_team, '') !~ '^[TE][A-Z0-9]{2,}$'
     or coalesce(p_channel, '') !~ '^[CG][A-Z0-9]{2,}$' then
    return null;
  end if;
  if not private.slack_team_owned_by(p_tenant, p_team) then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('slack-bind:' || p_team || ':' || p_channel, 0));
  select * into b from public.channel_bindings
  where provider = 'slack' and external_workspace_id = p_team and external_channel_id = p_channel and status <> 'removed'
  limit 1;
  if found then
    return case when b.tenant_id = p_tenant and b.status = 'active' then b.channel_id else null end;
  end if;
  insert into public.channels (id, tenant_id, name, visibility)
  select p_channel_id, t.id, left(t.name, 120), 'tenant' from public.tenants t where t.id = p_tenant
  on conflict (id) do nothing;
  select * into c from public.channels where id = p_channel_id;
  if not found or c.tenant_id <> p_tenant or c.archived_at is not null then return null; end if;
  insert into public.channel_bindings (channel_id, tenant_id, provider, external_workspace_id, external_channel_id)
  values (c.id, p_tenant, 'slack', p_team, p_channel);
  return c.id;
end $$;
revoke all on function public.slack_channel_bind(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.slack_channel_bind(uuid, text, text, uuid) to service_role;
