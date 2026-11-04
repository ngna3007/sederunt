-- Sederunt workspaces, part 5: one reusable join link per workspace and joining
-- by an approved email domain. Personal tenants stay single-owner (guard_membership).
-- Not applied to a live project by this change; apply with `supabase db push`.

create table public.tenant_join_links (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  -- Kept so admins can copy the same link again (Linear, Slack and Figma show a
  -- persistent link). Only admins read it, through the definer function below.
  token text not null unique check (char_length(token) between 32 and 128),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.tenant_join_links enable row level security;
revoke all on public.tenant_join_links from anon, authenticated;
-- No policies: the table is read and written only by the functions below.

-- Return the workspace link, creating it on first use. p_reset makes a new one.
create or replace function private.workspace_join_link(p_tenant_id uuid, p_reset boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin') and t.kind <> 'personal'
  ) then
    raise exception 'only an owner or admin can share the workspace link' using errcode = 'insufficient_privilege';
  end if;
  if p_reset then
    delete from public.tenant_join_links where tenant_id = p_tenant_id;
  end if;
  select l.token into v_token from public.tenant_join_links l where l.tenant_id = p_tenant_id;
  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.tenant_join_links (tenant_id, token) values (p_tenant_id, v_token);
  end if;
  return v_token;
end $$;

-- Anyone signed in with a confirmed email may join through the link as a member.
create or replace function private.accept_join_link(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_tenant uuid;
begin
  if v_uid is null or not exists (
    select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null
  ) then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select l.tenant_id into v_tenant from public.tenant_join_links l where l.token = p_token;
  if v_tenant is null then
    raise exception 'invite is invalid or expired' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.memberships (tenant_id, user_id, role)
  values (v_tenant, v_uid, 'member')
  on conflict (tenant_id, user_id) do nothing;
  return v_tenant;
end $$;

-- Workspaces whose approved domain matches the caller's confirmed email.
create or replace function private.joinable_tenants()
returns table (id uuid, name text) language sql stable security definer set search_path = '' as $$
  select t.id, t.name from public.tenants t
  join auth.users u on u.id = (select auth.uid()) and u.email_confirmed_at is not null
  where t.kind <> 'personal'
    and t.allowed_domain is not null
    and t.allowed_domain = lower(split_part(u.email, '@', 2))
    and not exists (select 1 from public.memberships m where m.tenant_id = t.id and m.user_id = u.id)
  order by t.name
  limit 20
$$;

create or replace function private.join_by_domain(p_tenant_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.joinable_tenants() j where j.id = p_tenant_id) then
    raise exception 'that workspace is not open to your email domain' using errcode = 'insufficient_privilege';
  end if;
  insert into public.memberships (tenant_id, user_id, role)
  values (p_tenant_id, (select auth.uid()), 'member')
  on conflict (tenant_id, user_id) do nothing;
  return p_tenant_id;
end $$;

create or replace function public.workspace_join_link(p_tenant_id uuid, p_reset boolean default false)
returns text language sql volatile security invoker set search_path = '' as $$
  select private.workspace_join_link(p_tenant_id, p_reset)
$$;
create or replace function public.accept_join_link(p_token text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.accept_join_link(p_token)
$$;
create or replace function public.joinable_tenants()
returns table (id uuid, name text) language sql stable security invoker set search_path = '' as $$
  select * from private.joinable_tenants()
$$;
create or replace function public.join_by_domain(p_tenant_id uuid)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.join_by_domain(p_tenant_id)
$$;

revoke all on function private.workspace_join_link(uuid, boolean), private.accept_join_link(text),
  private.joinable_tenants(), private.join_by_domain(uuid) from public, anon;
grant execute on function private.workspace_join_link(uuid, boolean), private.accept_join_link(text),
  private.joinable_tenants(), private.join_by_domain(uuid) to authenticated;
revoke all on function public.workspace_join_link(uuid, boolean), public.accept_join_link(text),
  public.joinable_tenants(), public.join_by_domain(uuid) from public, anon;
grant execute on function public.workspace_join_link(uuid, boolean), public.accept_join_link(text),
  public.joinable_tenants(), public.join_by_domain(uuid) to authenticated;
