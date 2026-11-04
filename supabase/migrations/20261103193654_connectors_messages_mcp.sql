-- Sederunt identity and tenancy, part 3: tenant connectors (non-secret config),
-- server-only secrets, the messages index with category and retention, MCP
-- connectors and tools, guest merge on signup, and a security_invoker view.

-- Reject secret-looking keys in config that the browser can read.
create or replace function private.has_secret_keys(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p) = 'object' and exists (
    select 1 from jsonb_object_keys(p) k
    where lower(k) ~ '(token|secret|password|passwd|authorization|api[_-]?key|cookie|private[_-]?key|client[_-]?secret)'
  ), false)
$$;
revoke all on function private.has_secret_keys(jsonb) from public, anon;
grant execute on function private.has_secret_keys(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- tenant_connectors
-- One install per provider workspace (a Slack team, a Teams tenant...). Tokens live
-- in connector_secrets, never here.
create table public.tenant_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  external_workspace_id text not null check (char_length(external_workspace_id) between 1 and 255),
  display_name text check (char_length(display_name) <= 120),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  config jsonb not null default '{}' check (not private.has_secret_keys(config)),
  scopes text[] not null default '{}',
  installed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, external_workspace_id)
);
-- A provider workspace belongs to one tenant at a time, so inbound events route unambiguously.
create unique index tenant_connectors_workspace_live on public.tenant_connectors
  (provider, external_workspace_id) where status <> 'removed';
create index tenant_connectors_installed_by_idx on public.tenant_connectors (installed_by);
create trigger tenant_connectors_set_updated_at before update on public.tenant_connectors
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- mcp_connectors
create table public.mcp_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  preset text check (preset is null or preset ~ '^[a-z0-9][a-z0-9_-]{0,47}$'),
  transport text not null check (transport in ('streamable_http', 'sse', 'stdio')),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 2048)),
  command jsonb,                                -- stdio only, preset-defined, server-set
  auth_type text not null default 'none' check (auth_type in ('none', 'bearer', 'oauth', 'google_oauth')),
  headers_public jsonb not null default '{}' check (not private.has_secret_keys(headers_public)),
  scopes text[] not null default '{}',
  enabled boolean not null default true,        -- admin kill switch
  status text not null default 'draft' check (status in ('draft', 'connected', 'needs_auth', 'error', 'disabled')),
  last_tested_at timestamptz,
  last_error text,
  server_info jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (id, tenant_id),
  -- stdio only for vetted presets; remote transports need an https url
  constraint mcp_connectors_transport_shape check (
    (transport = 'stdio' and preset is not null and url is null)
    or (transport <> 'stdio' and url is not null and command is null))
);
create index mcp_connectors_created_by_idx on public.mcp_connectors (created_by);

-- Changing where or how we connect sends the connector back to draft until retested.
create or replace function private.mcp_connector_reset_on_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.url, new.transport, new.auth_type) is distinct from (old.url, old.transport, old.auth_type) then
    new.status := 'draft';
    new.last_tested_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger mcp_connectors_reset_on_change before update on public.mcp_connectors
  for each row execute function private.mcp_connector_reset_on_change();

-- ---------------------------------------------------------------- mcp_tools
create table public.mcp_tools (
  connector_id uuid not null,
  tenant_id uuid not null,
  name text not null check (char_length(name) between 1 and 128),
  title text,
  description text,
  input_schema jsonb not null default '{}',
  annotations jsonb not null default '{}',
  action_class text not null default 'write' check (action_class in ('read', 'write', 'delete')),
  enabled boolean not null default false,       -- off until an admin approves
  definition_hash text not null,
  approved_hash text,                           -- definition_hash at approval time
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (connector_id, name),
  foreign key (connector_id, tenant_id) references public.mcp_connectors (id, tenant_id) on delete cascade
);
create index mcp_tools_connector_tenant_idx on public.mcp_tools (connector_id, tenant_id);
create index mcp_tools_tenant_id_idx on public.mcp_tools (tenant_id);

-- Approval pins the definition; a changed definition (rug pull) disables the tool.
create or replace function private.mcp_tool_pin_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.enabled and not coalesce(old.enabled, false) then
    new.approved_hash := new.definition_hash;
  end if;
  if new.enabled and new.approved_hash is distinct from new.definition_hash then
    new.enabled := false;
  end if;
  return new;
end $$;
create trigger mcp_tools_pin_approval before insert or update on public.mcp_tools
  for each row execute function private.mcp_tool_pin_approval();

-- ---------------------------------------------------------------- connector_secrets
-- Server-only. RLS on with no policies and no grants to anon/authenticated:
-- only the service role (which bypasses RLS) can read or write.
create table public.connector_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tenant_connector_id uuid unique references public.tenant_connectors (id) on delete cascade,
  mcp_connector_id uuid unique references public.mcp_connectors (id) on delete cascade,
  ciphertext bytea not null,                    -- AES-GCM, app-side envelope encryption
  nonce bytea not null,
  key_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint connector_secrets_one_owner check (num_nonnulls(tenant_connector_id, mcp_connector_id) = 1)
);
create index connector_secrets_tenant_id_idx on public.connector_secrets (tenant_id);

-- ---------------------------------------------------------------- messages
-- Every message in a channel the bot is in, after redact(). Category sets the tier;
-- the tier sets retention. Long-term rows point at the Walrus Memory record.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_id uuid not null,
  binding_id uuid references public.channel_bindings (id) on delete set null,  -- null for in-app posts
  external_message_id text,                     -- Slack ts etc., for edits and deletes
  author_user_id uuid references auth.users (id) on delete set null,
  author_guest_id uuid references public.guests (id) on delete set null,
  body_redacted text not null check (char_length(body_redacted) <= 40000),
  category text not null check (category in ('decision', 'action_item', 'question', 'update', 'file', 'link', 'chatter')),
  category_source text not null default 'rule' check (category_source in ('rule', 'model', 'person')),
  category_confidence real check (category_confidence between 0 and 1),
  tier text not null check (tier in ('long', 'medium', 'short')),
  expires_at timestamptz,                       -- null only for long-term
  invite_user_ids uuid[] not null default '{}', -- ADR 0003 snapshot: who was present
  invite_guest_ids uuid[] not null default '{}',
  memory_blob_id text,                          -- Walrus Memory pointer once promoted
  sent_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (channel_id, tenant_id) references public.channels (id, tenant_id) on delete cascade,
  unique (binding_id, external_message_id),
  constraint messages_expiry_matches_tier check ((tier = 'long') = (expires_at is null))
);
create index messages_channel_sent_idx on public.messages (channel_id, tenant_id, sent_at desc);
create index messages_author_user_idx on public.messages (author_user_id);
create index messages_author_guest_idx on public.messages (author_guest_id);
create index messages_invite_users_gin on public.messages using gin (invite_user_ids);
create index messages_invite_guests_gin on public.messages using gin (invite_guest_ids);
create index messages_expires_at_idx on public.messages (expires_at) where expires_at is not null;

-- Fill tier and expiry from category (decision/action_item long; question/update/
-- file/link 180 days; chatter 30 days) and honour the channel's remember switch.
create or replace function private.messages_apply_retention()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.channels c
                   where c.id = new.channel_id and c.remember_messages and c.archived_at is null) then
      raise exception 'channel % does not remember messages', new.channel_id
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' or new.category is distinct from old.category or new.tier is distinct from old.tier then
    if new.tier is null or (tg_op = 'UPDATE' and new.category is distinct from old.category
                            and new.tier is not distinct from old.tier) then
      new.tier := case when new.category in ('decision', 'action_item') then 'long'
                       when new.category = 'chatter' then 'short'
                       else 'medium' end;
    end if;
    new.expires_at := case new.tier when 'long' then null
                                    when 'medium' then new.sent_at + interval '180 days'
                                    else new.sent_at + interval '30 days' end;
  end if;
  return new;
end $$;
create trigger messages_apply_retention before insert or update on public.messages
  for each row execute function private.messages_apply_retention();

-- Purge job body (schedule with pg_cron or the server; scheduling is deferred).
create or replace function private.purge_expired_messages()
returns integer language sql security definer set search_path = '' as $$
  with gone as (delete from public.messages where expires_at < now() returning 1)
  select count(*)::integer from gone
$$;

-- ---------------------------------------------------------------- guest merge on signup
-- When a user with a confirmed email exists, every unmerged guest with that email
-- becomes theirs: identities link, tenant membership (member), channel access, and
-- message authorship and invite snapshots move over. Never blocks signup.
create or replace function private.merge_guests_for_user(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_count integer := 0;
  g record;
begin
  select lower(u.email) into v_email from auth.users u
  where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  for g in select gu.id, gu.tenant_id from public.guests gu
           join public.tenants t on t.id = gu.tenant_id and t.kind <> 'personal'
           where gu.email = v_email and gu.merged_into is null
           for update of gu
  loop
    update public.guests set merged_into = p_user, merged_at = now() where id = g.id;
    update public.identities set user_id = p_user, linked_at = now()
      where guest_id = g.id and user_id is null;
    insert into public.memberships (tenant_id, user_id, role)
      values (g.tenant_id, p_user, 'member') on conflict (tenant_id, user_id) do nothing;
    insert into public.channel_members (channel_id, tenant_id, user_id, source)
      select cg.channel_id, cg.tenant_id, p_user, 'guest_merge'
      from public.channel_guests cg where cg.guest_id = g.id
      on conflict (channel_id, user_id) do nothing;
    update public.messages set author_user_id = p_user
      where author_guest_id = g.id and author_user_id is null;
    update public.messages set invite_user_ids = array_append(invite_user_ids, p_user)
      where invite_guest_ids @> array[g.id] and not (invite_user_ids @> array[p_user]);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function private.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.merge_guests_for_user(new.id);
  exception when others then
    raise warning 'guest merge failed for user %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
-- Runs after on_auth_user_created (trigger names fire in alphabetical order).
create trigger on_auth_user_merge_guests after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function private.handle_user_confirmed();
create trigger on_auth_user_merge_guests_on_confirm after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_user_confirmed();

-- ---------------------------------------------------------------- view
create view public.my_tenants with (security_invoker = true) as
  select t.id, t.kind, t.name, m.role, t.created_at
  from public.tenants t
  join public.memberships m on m.tenant_id = t.id and m.user_id = (select auth.uid());

-- ---------------------------------------------------------------- RLS + policies
alter table public.tenant_connectors enable row level security;
alter table public.mcp_connectors enable row level security;
alter table public.mcp_tools enable row level security;
alter table public.connector_secrets enable row level security;
alter table public.messages enable row level security;

create policy tenant_connectors_select on public.tenant_connectors for select to authenticated
  using (tenant_id in (select private.admin_tenant_ids()));
-- Install, pause and remove run on the server with the OAuth flow.

create policy mcp_connectors_select on public.mcp_connectors for select to authenticated
  using (tenant_id in (select private.admin_tenant_ids()));
create policy mcp_connectors_insert on public.mcp_connectors for insert to authenticated
  with check (tenant_id in (select private.admin_tenant_ids()) and created_by = (select auth.uid()));
create policy mcp_connectors_update on public.mcp_connectors for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids()))
  with check (tenant_id in (select private.admin_tenant_ids()));
create policy mcp_connectors_delete on public.mcp_connectors for delete to authenticated
  using (tenant_id in (select private.admin_tenant_ids()));

create policy mcp_tools_select on public.mcp_tools for select to authenticated
  using (tenant_id in (select private.admin_tenant_ids()));
create policy mcp_tools_update on public.mcp_tools for update to authenticated
  using (tenant_id in (select private.admin_tenant_ids()))
  with check (tenant_id in (select private.admin_tenant_ids()));
-- Tool discovery inserts and deletes rows from the server.

-- connector_secrets: intentionally no policies.

-- Read only what you were present for, in a channel you can see, while not expired.
create policy messages_select on public.messages for select to authenticated
  using (channel_id in (select private.visible_channel_ids())
         and invite_user_ids @> array[(select auth.uid())]
         and deleted_at is null
         and (expires_at is null or expires_at > now()));
-- Ingest, retag and delete run on the server after redact() and the gate.

-- ---------------------------------------------------------------- grants
revoke all on public.tenant_connectors, public.mcp_connectors, public.mcp_tools,
  public.connector_secrets, public.messages, public.my_tenants from anon, authenticated;
grant select on public.tenant_connectors, public.mcp_connectors, public.mcp_tools,
  public.messages, public.my_tenants to authenticated;
grant insert (tenant_id, slug, display_name, preset, transport, url, auth_type, headers_public, scopes)
  on public.mcp_connectors to authenticated;
grant update (display_name, url, transport, auth_type, headers_public, scopes, enabled)
  on public.mcp_connectors to authenticated;
grant delete on public.mcp_connectors to authenticated;
grant update (enabled) on public.mcp_tools to authenticated;

revoke all on function private.mcp_connector_reset_on_change(), private.mcp_tool_pin_approval(),
  private.messages_apply_retention(), private.purge_expired_messages(),
  private.merge_guests_for_user(uuid), private.handle_user_confirmed() from public, anon, authenticated;
grant execute on function private.purge_expired_messages(), private.merge_guests_for_user(uuid) to service_role;
