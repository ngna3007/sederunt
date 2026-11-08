create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  user_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from public, anon, authenticated;

create table public.admin_retired_tenants (
  tenant_id uuid primary key,
  user_id uuid not null,
  retired_at timestamptz not null default now()
);
alter table public.admin_retired_tenants enable row level security;
revoke all on public.admin_retired_tenants from public, anon, authenticated;

create table public.admin_login_windows (
  bucket bigint primary key,
  attempts integer not null
);
alter table public.admin_login_windows enable row level security;
revoke all on public.admin_login_windows from public, anon, authenticated;

create table public.admin_previews (
  nonce uuid primary key,
  expires_at timestamptz not null
);
alter table public.admin_previews enable row level security;
revoke all on public.admin_previews from public, anon, authenticated;

create function public.admin_issue_preview(p_nonce uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.admin_previews where expires_at < now();
  insert into public.admin_previews values (p_nonce, now() + interval '5 minutes');
$$;

create function public.admin_consume_preview(p_nonce uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_nonce uuid;
begin
  delete from public.admin_previews where nonce = p_nonce and expires_at > now() returning nonce into v_nonce;
  return v_nonce is not null;
end $$;

create function public.admin_login_attempt()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_bucket bigint := floor(extract(epoch from now()) / 600); v_count integer;
begin
  delete from public.admin_login_windows where bucket < v_bucket - 1;
  insert into public.admin_login_windows values (v_bucket, 1)
    on conflict (bucket) do update set attempts = public.admin_login_windows.attempts + 1
    returning attempts into v_count;
  return v_count <= 10;
end $$;

create function public.admin_accounts(p_query text default '', p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (
    select u.id, u.email, coalesce(p.display_name, u.raw_user_meta_data->>'full_name', u.email) as name,
      u.created_at, u.last_sign_in_at,
      coalesce(u.raw_app_meta_data->'providers', jsonb_build_array(u.raw_app_meta_data->>'provider')) as providers,
      (select count(*) from public.memberships m join public.tenants t on t.id = m.tenant_id
        where m.user_id = u.id and t.kind <> 'personal') as workspaces
    from auth.users u left join public.profiles p on p.id = u.id
    where coalesce(u.email, '') ilike '%' || replace(replace(replace(left(p_query, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or coalesce(p.display_name, '') ilike '%' || replace(replace(replace(left(p_query, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by u.created_at desc, u.id limit 26 offset greatest(p_offset, 0)
  ) a;
$$;

create function public.admin_account_plan(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'email', u.email,
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'kind', t.kind, 'role', m.role,
      'members', (select count(*) from public.memberships x where x.tenant_id = t.id),
      'otherOwners', (select count(*) from public.memberships x where x.tenant_id = t.id and x.user_id <> u.id and x.role = 'owner')
    ) order by t.id) from public.memberships m join public.tenants t on t.id = m.tenant_id where m.user_id = u.id), '[]'::jsonb))
    from auth.users u where u.id = p_user_id;
$$;

create function public.admin_restart_demo(p_user_id uuid, p_expected jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan jsonb; v_space jsonb; v_personal uuid; v_deleted uuid[] := '{}';
begin
  -- Serialize membership changes so a new member cannot arrive after preview validation.
  lock table public.memberships in share row exclusive mode;
  perform 1 from auth.users where id = p_user_id for update;
  perform 1 from public.tenants where id in
    (select tenant_id from public.memberships where user_id = p_user_id) for update;
  v_plan := public.admin_account_plan(p_user_id);
  if v_plan is null or v_plan is distinct from p_expected then
    raise exception using errcode = '23505', message = 'Account changed; preview again';
  end if;
  for v_space in select * from jsonb_array_elements(v_plan->'workspaces') loop
    if v_space->>'role' = 'owner' and (v_space->>'members')::integer > 1
        and (v_space->>'otherOwners')::integer = 0 then
      raise exception using errcode = '23505', message = 'Transfer workspace ownership before reset';
    end if;
    if (v_space->>'members')::integer = 1 and v_space->>'role' = 'owner' then
      v_deleted := array_append(v_deleted, (v_space->>'id')::uuid);
    end if;
  end loop;
  insert into public.admin_retired_tenants (tenant_id, user_id) select unnest(v_deleted), p_user_id on conflict do nothing;
  delete from public.person_google_grants where person_id = p_user_id::text;
  delete from public.bot_preferences where user_id = p_user_id;
  delete from public.channel_members where user_id = p_user_id;
  delete from public.memberships where user_id = p_user_id;
  delete from public.tenants where id = any(v_deleted);
  insert into public.tenants (kind, name, personal_owner, created_by)
    values ('personal', 'Personal', p_user_id, p_user_id) returning id into v_personal;
  update public.profiles set personal_tenant_id = v_personal where id = p_user_id;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}')
    - 'sederunt_onboarded' - 'sederunt_auto_join' - 'sederunt_tool_prefs' - 'sederunt_fake_tools'
    where id = p_user_id;
  insert into public.admin_actions (actor, user_id, action, details)
    values (p_actor, p_user_id, 'restart-demo', v_plan);
  return jsonb_build_object('deletedTenants', to_jsonb(v_deleted), 'personalTenantId', v_personal);
end $$;

create function public.admin_record_action(p_actor text, p_user_id uuid, p_action text)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions (actor, user_id, action) values (p_actor, p_user_id, p_action);
$$;

create function public.admin_tenant_retired(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_retired_tenants where tenant_id = p_tenant_id);
$$;

create function public.admin_retired_for_user(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tenant_id order by retired_at), '[]'::jsonb)
    from public.admin_retired_tenants where user_id = p_user_id;
$$;

revoke all on function public.admin_accounts(text, integer) from public, anon, authenticated;
revoke all on function public.admin_account_plan(uuid) from public, anon, authenticated;
revoke all on function public.admin_restart_demo(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_record_action(text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_login_attempt() from public, anon, authenticated;
revoke all on function public.admin_tenant_retired(uuid) from public, anon, authenticated;
revoke all on function public.admin_retired_for_user(uuid) from public, anon, authenticated;
revoke all on function public.admin_issue_preview(uuid) from public, anon, authenticated;
revoke all on function public.admin_consume_preview(uuid) from public, anon, authenticated;
grant execute on function public.admin_accounts(text, integer), public.admin_account_plan(uuid),
  public.admin_restart_demo(uuid, jsonb, text), public.admin_record_action(text, uuid, text),
  public.admin_login_attempt(), public.admin_tenant_retired(uuid), public.admin_issue_preview(uuid),
  public.admin_consume_preview(uuid), public.admin_retired_for_user(uuid) to service_role;
