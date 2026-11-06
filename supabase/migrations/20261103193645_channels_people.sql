-- Sederunt identity and tenancy, part 2: channels (Sederunt-owned ids), bindings to
-- chat tools, channel members, guests and provider identities.

-- ---------------------------------------------------------------- channels
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'channel' check (kind in ('channel', 'meeting_series')),
  visibility text not null default 'invited' check (visibility in ('invited', 'tenant')),
  remember_messages boolean not null default true,   -- per-channel switch, on by default
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, tenant_id)                             -- target for tenant-consistent child FKs
);
create index channels_tenant_id_idx on public.channels (tenant_id);
create index channels_created_by_idx on public.channels (created_by);
create trigger channels_set_updated_at before update on public.channels
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- channel_bindings
-- 0..n per channel. Removing a binding never deletes the channel or its history.
create table public.channel_bindings (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  tenant_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),  -- slack, teams, email, webhook, recall...
  external_workspace_id text not null default '',
  external_channel_id text not null check (char_length(external_channel_id) between 1 and 255),
  direction text not null default 'both' check (direction in ('in', 'out', 'both')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  foreign key (channel_id, tenant_id) references public.channels (id, tenant_id) on delete cascade
);
-- One live binding per external channel, so inbound events resolve to one Sederunt channel.
create unique index channel_bindings_external_live on public.channel_bindings
  (provider, external_workspace_id, external_channel_id) where status <> 'removed';
create index channel_bindings_channel_tenant_idx on public.channel_bindings (channel_id, tenant_id);
create index channel_bindings_tenant_id_idx on public.channel_bindings (tenant_id);

-- ---------------------------------------------------------------- channel_members
create table public.channel_members (
  channel_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  source text not null default 'sederunt' check (source ~ '^[a-z][a-z0-9_]{1,31}$'), -- sederunt, slack, guest_merge...
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  foreign key (channel_id, tenant_id) references public.channels (id, tenant_id) on delete cascade,
  -- leaving the tenant removes channel membership too
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);
create index channel_members_user_id_idx on public.channel_members (user_id);
create index channel_members_channel_tenant_idx on public.channel_members (channel_id, tenant_id);
create index channel_members_tenant_user_idx on public.channel_members (tenant_id, user_id);

-- ---------------------------------------------------------------- guests
-- A chat-tool member who has not signed up. Sees nothing; merges on signup.
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  email text check (email is null or email = lower(email)),  -- verified email from the provider
  merged_into uuid references auth.users (id) on delete set null,
  merged_at timestamptz,
  created_at timestamptz not null default now()
);
create index guests_tenant_id_idx on public.guests (tenant_id);
create index guests_merged_into_idx on public.guests (merged_into);
create index guests_open_email_idx on public.guests (email) where merged_into is null;

create table public.channel_guests (
  channel_id uuid not null,
  tenant_id uuid not null,
  guest_id uuid not null references public.guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, guest_id),
  foreign key (channel_id, tenant_id) references public.channels (id, tenant_id) on delete cascade
);
create index channel_guests_guest_id_idx on public.channel_guests (guest_id);
create index channel_guests_channel_tenant_idx on public.channel_guests (channel_id, tenant_id);

-- ---------------------------------------------------------------- identities
-- One platform id (Slack U123 in workspace T1, Teams aad id...). Pending while it
-- points only at a guest; linked once user_id is set.
create table public.identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  external_workspace_id text not null default '',
  external_user_id text not null check (char_length(external_user_id) between 1 and 255),
  user_id uuid references auth.users (id) on delete cascade,
  guest_id uuid references public.guests (id) on delete set null,
  email text check (email is null or email = lower(email)),
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  unique (provider, external_workspace_id, external_user_id),
  constraint identities_has_owner check (user_id is not null or guest_id is not null)
);
create index identities_user_id_idx on public.identities (user_id);
create index identities_guest_id_idx on public.identities (guest_id);

-- ---------------------------------------------------------------- helper
create or replace function private.visible_channel_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id
  from public.channels c
  join public.memberships m on m.tenant_id = c.tenant_id and m.user_id = (select auth.uid())
  where c.visibility = 'tenant'
     or exists (select 1 from public.channel_members cm
                where cm.channel_id = c.id and cm.user_id = (select auth.uid()))
$$;
revoke all on function private.visible_channel_ids() from public, anon;
grant execute on function private.visible_channel_ids() to authenticated;

-- ---------------------------------------------------------------- RLS + policies
alter table public.channels enable row level security;
alter table public.channel_bindings enable row level security;
alter table public.channel_members enable row level security;
alter table public.guests enable row level security;
alter table public.channel_guests enable row level security;
alter table public.identities enable row level security;

-- Admins see every channel row (to manage it); content stays gated per message.
create policy channels_select on public.channels for select to authenticated
  using (id in (select private.visible_channel_ids())
         or tenant_id in (select private.admin_tenant_ids()));
create policy channels_insert on public.channels for insert to authenticated
  with check (tenant_id in (select private.admin_tenant_ids())
              and created_by = (select auth.uid()));
create policy channels_update on public.channels for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids()))
  with check (tenant_id in (select private.admin_tenant_ids()));
-- No delete policy: channels are archived, not deleted, from the browser.

-- Bindings are written by the server (connector install flow); readable alongside the channel.
create policy channel_bindings_select on public.channel_bindings for select to authenticated
  using (channel_id in (select private.visible_channel_ids())
         or tenant_id in (select private.admin_tenant_ids()));

create policy channel_members_select on public.channel_members for select to authenticated
  using (channel_id in (select private.visible_channel_ids())
         or tenant_id in (select private.admin_tenant_ids()));
create policy channel_members_insert on public.channel_members for insert to authenticated
  with check (tenant_id in (select private.admin_tenant_ids()));
create policy channel_members_delete on public.channel_members for delete to authenticated
  using (tenant_id in (select private.admin_tenant_ids()) or user_id = (select auth.uid()));

-- Guests are shown in People to tenant members; written by the server only.
create policy guests_select on public.guests for select to authenticated
  using (tenant_id in (select private.user_tenant_ids()));
create policy channel_guests_select on public.channel_guests for select to authenticated
  using (channel_id in (select private.visible_channel_ids())
         or tenant_id in (select private.admin_tenant_ids()));

-- A user sees only their own linked identities; linking happens on the server after OAuth.
create policy identities_select on public.identities for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- grants
revoke all on public.channels, public.channel_bindings, public.channel_members,
  public.guests, public.channel_guests, public.identities from anon, authenticated;
grant select on public.channels, public.channel_bindings, public.channel_members,
  public.guests, public.channel_guests, public.identities to authenticated;
grant insert (tenant_id, name, kind, visibility, remember_messages) on public.channels to authenticated;
grant update (name, visibility, remember_messages, archived_at) on public.channels to authenticated;
grant insert (channel_id, tenant_id, user_id) on public.channel_members to authenticated;
grant delete on public.channel_members to authenticated;
