-- Sederunt identity and tenancy, part 1: private helpers, tenants, memberships,
-- profiles, invites, signup trigger (profile + personal tenant + owner membership).
-- Walrus stays the record for decisions (ADR 0005); this database holds identity,
-- tenancy, channels, settings and a rebuildable index only.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------- shared trigger
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- tenants
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'team', 'company')),
  name text not null check (char_length(name) between 1 and 120),
  -- set only for kind = 'personal'; deleting the user deletes their personal space
  personal_owner uuid unique references auth.users (id) on delete cascade,
  allowed_domain text check (allowed_domain is null or allowed_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  recording_retention_hours integer not null default 168
    check (recording_retention_hours between 0 and 8760),   -- Recall recording_config.retention
  memory_mode text not null default 'managed' check (memory_mode in ('managed', 'byo_account')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_personal_owner_matches_kind check ((kind = 'personal') = (personal_owner is not null))
);
create index tenants_created_by_idx on public.tenants (created_by);
create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- memberships
create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  email text,                                   -- copy of auth.users.email, for People lists
  personal_tenant_id uuid references public.tenants (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_personal_tenant_id_idx on public.profiles (personal_tenant_id);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- invites
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash bytea not null unique,             -- sha256 of the token; the token itself is never stored
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index invites_one_open_per_email on public.invites (tenant_id, email) where accepted_at is null;
create index invites_email_idx on public.invites (email);
create index invites_invited_by_idx on public.invites (invited_by);
create index invites_accepted_by_idx on public.invites (accepted_by);

-- ---------------------------------------------------------------- RLS helpers
-- Security definer so policies on memberships do not recurse. Kept in the
-- private schema, which the Data API does not expose.
create or replace function private.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())
$$;
create or replace function private.admin_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m
  where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
$$;
create or replace function private.owner_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m
  where m.user_id = (select auth.uid()) and m.role = 'owner'
$$;
create or replace function private.co_member_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct other.user_id
  from public.memberships mine
  join public.memberships other on other.tenant_id = mine.tenant_id
  where mine.user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------- tenant triggers
-- Whoever creates a tenant becomes its owner (personal: the personal owner).
create or replace function private.tenant_add_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.personal_owner, new.created_by) is not null then
    insert into public.memberships (tenant_id, user_id, role)
    values (new.id, coalesce(new.personal_owner, new.created_by), 'owner')
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
end $$;
create trigger tenants_add_owner after insert on public.tenants
  for each row execute function private.tenant_add_owner();

-- A personal tenant has exactly one member: its owner.
create or replace function private.guard_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_kind text;
begin
  select t.kind, t.personal_owner into v_kind, v_owner from public.tenants t where t.id = new.tenant_id;
  if v_kind = 'personal' and (new.user_id is distinct from v_owner or new.role <> 'owner') then
    raise exception 'personal tenants have a single owner and no other members'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger memberships_guard before insert or update on public.memberships
  for each row execute function private.guard_membership();

-- ---------------------------------------------------------------- signup trigger
-- Name and avatar come from the OAuth identity (raw_user_meta_data). They are
-- display data only and are never used for authorization.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''));
  v_avatar text := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', ''));
  v_tenant uuid;
begin
  insert into public.tenants (kind, name, personal_owner, created_by)
  values ('personal', 'Personal', new.id, new.id)
  returning id into v_tenant;                    -- tenants_add_owner adds the owner membership

  insert into public.profiles (id, display_name, avatar_url, email, personal_tenant_id)
  values (new.id, left(v_name, 120), left(v_avatar, 2048), lower(new.email), v_tenant);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the profile email in step with auth.users.
create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------------------------------------------------------------- invite RPCs
-- Accepting needs to write a membership the caller cannot write directly, so the
-- definer part lives in private and a thin invoker wrapper is exposed.
create or replace function private.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select lower(u.email) into v_email from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  select * into v_invite from public.invites i
  where i.token_hash = extensions.digest(p_token, 'sha256') for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'invite is invalid or expired' using errcode = 'invalid_parameter_value';
  end if;
  if v_email is null or v_email <> v_invite.email then
    raise exception 'invite was sent to a different email' using errcode = 'insufficient_privilege';
  end if;
  insert into public.memberships (tenant_id, user_id, role)
  values (v_invite.tenant_id, v_uid, v_invite.role)
  on conflict (tenant_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;
  return v_invite.tenant_id;
end $$;

create or replace function public.accept_invite(p_token text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.accept_invite(p_token)
$$;

-- Admins create invites through RLS (invoker); returns the token once.
create or replace function public.create_invite(p_tenant_id uuid, p_email text, p_role text default 'member')
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.invites (tenant_id, email, role, token_hash)
  values (p_tenant_id, lower(trim(p_email)), p_role, extensions.digest(v_token, 'sha256'));
  return v_token;
end $$;

-- ---------------------------------------------------------------- RLS + policies
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (id in (select private.user_tenant_ids()));
create policy tenants_insert on public.tenants for insert to authenticated
  with check (kind in ('team', 'company') and personal_owner is null
              and created_by = (select auth.uid()));
create policy tenants_update on public.tenants for update to authenticated
  using (id in (select private.admin_tenant_ids()))
  with check (id in (select private.admin_tenant_ids()));
create policy tenants_delete on public.tenants for delete to authenticated
  using (kind <> 'personal' and id in (select private.owner_tenant_ids()));

create policy memberships_select on public.memberships for select to authenticated
  using (tenant_id in (select private.user_tenant_ids()));
-- Admins change roles; only owners grant or change the owner role.
create policy memberships_update on public.memberships for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids())
         and (role <> 'owner' or tenant_id in (select private.owner_tenant_ids())))
  with check (tenant_id in (select private.admin_tenant_ids())
              and (role <> 'owner' or tenant_id in (select private.owner_tenant_ids())));
-- Admins remove non-owners, owners remove anyone, anyone but an owner may leave.
create policy memberships_delete on public.memberships for delete to authenticated
  using ((tenant_id in (select private.admin_tenant_ids()) and role <> 'owner')
         or tenant_id in (select private.owner_tenant_ids())
         or (user_id = (select auth.uid()) and role <> 'owner'));
-- No insert policy: memberships come from tenant creation, invites and guest merge.

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id in (select private.co_member_ids()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy invites_select on public.invites for select to authenticated
  using (tenant_id in (select private.admin_tenant_ids())
         or email = lower((select auth.jwt()) ->> 'email'));
create policy invites_insert on public.invites for insert to authenticated
  with check (tenant_id in (select private.admin_tenant_ids())
              and invited_by = (select auth.uid())
              and exists (select 1 from public.tenants t where t.id = tenant_id and t.kind <> 'personal'));
create policy invites_delete on public.invites for delete to authenticated
  using (tenant_id in (select private.admin_tenant_ids()));

-- ---------------------------------------------------------------- grants
revoke all on public.tenants, public.memberships, public.profiles, public.invites from anon, authenticated;
grant select on public.tenants, public.memberships, public.profiles, public.invites to authenticated;
grant insert (kind, name) on public.tenants to authenticated;
grant update (name, allowed_domain, recording_retention_hours) on public.tenants to authenticated;
grant delete on public.tenants to authenticated;
grant update (role) on public.memberships to authenticated;
grant delete on public.memberships to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert (tenant_id, email, role, token_hash, expires_at) on public.invites to authenticated;
grant delete on public.invites to authenticated;

revoke all on function private.set_updated_at(), private.user_tenant_ids(), private.admin_tenant_ids(),
  private.owner_tenant_ids(), private.co_member_ids(), private.tenant_add_owner(),
  private.guard_membership(), private.handle_new_user(), private.handle_user_email_change(),
  private.accept_invite(text) from public, anon;
grant execute on function private.user_tenant_ids(), private.admin_tenant_ids(),
  private.owner_tenant_ids(), private.co_member_ids(), private.accept_invite(text) to authenticated;
revoke all on function public.accept_invite(text), public.create_invite(uuid, text, text) from public, anon;
grant execute on function public.accept_invite(text), public.create_invite(uuid, text, text) to authenticated;
