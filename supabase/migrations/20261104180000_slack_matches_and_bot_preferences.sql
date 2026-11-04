-- Invitee email → Slack user cache, and bot preferences.
-- Lookup rows are written by the server (service role bypasses RLS).
-- Authenticated owners and admins write overrides only.
-- A user reads and writes their own preference rows. Admins manage
-- workspace rows (user_id is null). Members can read those workspace rows.

-- ---------------------------------------------------------------- slack_user_matches
create table public.slack_user_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  external_workspace_id text not null default '',
  email text not null check (email = lower(email) and email like '%_@_%'),
  slack_user_id text check (slack_user_id is null or slack_user_id ~ '^[UW][A-Z0-9]+$'),
  source text not null check (source in ('lookup', 'override', 'none')),
  overridden_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- none has no Slack user; lookup found one; override may point at a user or clear one
  constraint slack_user_matches_source_shape check (
    (source = 'none' and slack_user_id is null and overridden_by is null)
    or (source = 'lookup' and slack_user_id is not null and overridden_by is null)
    or (source = 'override' and overridden_by is not null)
  ),
  unique (tenant_id, external_workspace_id, email)
);
create index slack_user_matches_tenant_id_idx on public.slack_user_matches (tenant_id);
create index slack_user_matches_overridden_by_idx on public.slack_user_matches (overridden_by);
create trigger slack_user_matches_set_updated_at before update on public.slack_user_matches
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- bot_preferences
-- user_id null is the workspace preference. A person's row overrides it in the app.
create table public.bot_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  pref_key text not null check (char_length(pref_key) between 1 and 80 and pref_key = lower(pref_key)),
  pref_value text not null check (char_length(pref_value) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bot_preferences_workspace_key on public.bot_preferences (tenant_id, pref_key) where user_id is null;
create unique index bot_preferences_user_key on public.bot_preferences (tenant_id, user_id, pref_key) where user_id is not null;
create index bot_preferences_tenant_id_idx on public.bot_preferences (tenant_id);
create index bot_preferences_user_id_idx on public.bot_preferences (user_id);
create trigger bot_preferences_set_updated_at before update on public.bot_preferences
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.slack_user_matches enable row level security;
alter table public.bot_preferences enable row level security;

create policy slack_user_matches_select on public.slack_user_matches
  for select to authenticated
  using (tenant_id in (select private.user_tenant_ids()));

create policy slack_user_matches_insert_override on public.slack_user_matches
  for insert to authenticated
  with check (
    tenant_id in (select private.admin_tenant_ids())
    and source = 'override'
    and overridden_by = (select auth.uid())
  );

create policy slack_user_matches_update_override on public.slack_user_matches
  for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids()))
  with check (
    tenant_id in (select private.admin_tenant_ids())
    and source = 'override'
    and overridden_by = (select auth.uid())
  );

create policy slack_user_matches_delete_override on public.slack_user_matches
  for delete to authenticated
  using (
    tenant_id in (select private.admin_tenant_ids())
    and source = 'override'
  );

create policy bot_preferences_select on public.bot_preferences
  for select to authenticated
  using (
    tenant_id in (select private.user_tenant_ids())
    and (user_id is null or user_id = (select auth.uid()))
  );

create policy bot_preferences_insert_own on public.bot_preferences
  for insert to authenticated
  with check (
    tenant_id in (select private.user_tenant_ids())
    and user_id = (select auth.uid())
  );

create policy bot_preferences_update_own on public.bot_preferences
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()))
  with check (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()));

create policy bot_preferences_delete_own on public.bot_preferences
  for delete to authenticated
  using (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()));

create policy bot_preferences_insert_workspace on public.bot_preferences
  for insert to authenticated
  with check (
    tenant_id in (select private.admin_tenant_ids())
    and user_id is null
  );

create policy bot_preferences_update_workspace on public.bot_preferences
  for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids()) and user_id is null)
  with check (tenant_id in (select private.admin_tenant_ids()) and user_id is null);

create policy bot_preferences_delete_workspace on public.bot_preferences
  for delete to authenticated
  using (tenant_id in (select private.admin_tenant_ids()) and user_id is null);

-- ---------------------------------------------------------------- grants
revoke all on public.slack_user_matches, public.bot_preferences from public, anon, authenticated;

grant select on public.slack_user_matches to authenticated;
grant insert (tenant_id, external_workspace_id, email, slack_user_id, source, overridden_by, checked_at)
  on public.slack_user_matches to authenticated;
grant update (slack_user_id, source, overridden_by, checked_at)
  on public.slack_user_matches to authenticated;
grant delete on public.slack_user_matches to authenticated;

grant select on public.bot_preferences to authenticated;
grant insert (tenant_id, user_id, pref_key, pref_value) on public.bot_preferences to authenticated;
grant update (pref_value) on public.bot_preferences to authenticated;
grant delete on public.bot_preferences to authenticated;
