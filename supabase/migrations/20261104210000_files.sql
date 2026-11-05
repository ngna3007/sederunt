-- Files on Walrus. Postgres is the access index: who may see a file, who asked
-- to delete it, and which chain jobs are still owed. The bytes live on Walrus.
-- RLS follows current channel membership. Owners also see their own row while
-- a delete is pending, so the Files page can say "Deleting…".
-- Every helper is security definer in private with an empty search_path.
-- The public functions are invoker wrappers.

-- ---------------------------------------------------------------- files
create table public.files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_id uuid not null,
  message_id uuid references public.messages (id) on delete set null,
  owner_user_id uuid references auth.users (id) on delete set null,
  owner_guest_id uuid references public.guests (id) on delete set null,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 255),
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  sha256 bytea not null,
  walrus_blob_id text,
  sui_object_id text,
  end_epoch integer,
  seal_id bytea,
  upload_step jsonb,
  status text not null default 'uploading'
    check (status in ('uploading', 'active', 'pending_delete', 'deleted', 'failed')),
  delete_reason text check (delete_reason in (
    'message_deleted', 'owner', 'moderation', 'request_approved', 'expired', 'account_deleted'
  )),
  deleted_by uuid references auth.users (id) on delete set null,
  delete_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pending_delete_at timestamptz,
  deleted_at timestamptz,
  foreign key (channel_id, tenant_id) references public.channels (id, tenant_id) on delete cascade,
  constraint files_has_owner check (owner_user_id is not null or owner_guest_id is not null),
  constraint files_active_has_blob check (
    status <> 'active' or (walrus_blob_id is not null and sui_object_id is not null)
  )
);
create index files_channel_idx on public.files (channel_id, tenant_id, created_at desc) where status = 'active';
create index files_owner_idx on public.files (owner_user_id);
create index files_message_idx on public.files (message_id);
create index files_pending_idx on public.files (pending_delete_at) where status = 'pending_delete';
create index files_renew_idx on public.files (end_epoch) where status = 'active';
create trigger files_set_updated_at before update on public.files
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- delete requests
create table public.file_delete_requests (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'open'
    check (status in ('open', 'approved', 'declined', 'withdrawn', 'moot', 'dismissed')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index file_delete_requests_one_open
  on public.file_delete_requests (file_id, requested_by) where status = 'open';
create index file_delete_requests_file_idx on public.file_delete_requests (file_id);
create index file_delete_requests_open_idx
  on public.file_delete_requests (tenant_id, created_at) where status = 'open';

-- ---------------------------------------------------------------- memory links
-- One namespace per file (sederunt-file-<id>). Server only.
create table public.file_memory_links (
  file_id uuid not null references public.files (id) on delete cascade,
  memory_blob_id text not null,
  memory_object_id text,
  namespace text not null,
  status text not null default 'live'
    check (status in ('live', 'forgotten', 'deleted', 'failed', 'skipped')),
  reason text,
  created_at timestamptz not null default now(),
  primary key (file_id, memory_blob_id)
);

-- ---------------------------------------------------------------- jobs
create table public.file_jobs (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files (id) on delete cascade,
  kind text not null check (kind in ('upload', 'delete_blob', 'delete_memory', 'renew')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'dead', 'skipped')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index file_jobs_due_idx on public.file_jobs (run_after) where status in ('queued', 'failed');

-- ---------------------------------------------------------------- RLS
alter table public.files enable row level security;
alter table public.file_delete_requests enable row level security;
alter table public.file_memory_links enable row level security;
alter table public.file_jobs enable row level security;

create policy files_select on public.files for select to authenticated
  using (status = 'active' and channel_id in (select private.visible_channel_ids()));
create policy files_select_own_pending on public.files for select to authenticated
  using (owner_user_id = (select auth.uid()) and status = 'pending_delete');

create policy file_delete_requests_select on public.file_delete_requests for select to authenticated
  using (
    requested_by = (select auth.uid())
    or exists (
      select 1 from public.files f
      where f.id = file_id and f.owner_user_id = (select auth.uid())
    )
    or tenant_id in (select private.admin_tenant_ids())
  );

-- No client policies. The restrictive deny keeps a later grant from opening them.
create policy file_memory_links_no_client_access on public.file_memory_links
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy file_jobs_no_client_access on public.file_jobs
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------- hide + queue
-- Idempotent when the row is missing or no longer active. Owner delete records
-- 'owner' unless the owner is approving a request. Anyone else who is allowed
-- is an owner/admin of the workspace, and that is moderation.
create or replace function private.delete_file(p_file uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.files%rowtype;
  v_uid uuid := (select auth.uid());
  v_reason text;
begin
  select * into v from public.files where id = p_file for update;
  if not found or v.status <> 'active' then
    return;
  end if;
  if v_uid is null or not (
    v.owner_user_id = v_uid or v.tenant_id in (select private.admin_tenant_ids())
  ) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  v_reason := case
    when p_reason = 'request_approved' and v.owner_user_id = v_uid then 'request_approved'
    when v.owner_user_id = v_uid then 'owner'
    else 'moderation'
  end;
  update public.files set
    status = 'pending_delete',
    pending_delete_at = now(),
    deleted_by = v_uid,
    delete_reason = v_reason
  where id = p_file;
  update public.file_delete_requests set status = 'moot', decided_at = now(), decided_by = v_uid
  where file_id = p_file and status = 'open';
  insert into public.file_jobs (file_id, kind) values
    (p_file, 'delete_memory'),
    (p_file, 'delete_blob');
end $$;

-- A current channel member who is not the owner may ask. One open request per
-- file and person, and at most ten open requests a day.
create or replace function private.request_file_delete(p_file uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.files%rowtype;
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'reason is too long' using errcode = 'check_violation';
  end if;
  select * into v from public.files where id = p_file;
  if not found or v.status <> 'active' or v.channel_id not in (select private.visible_channel_ids()) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
  if v.owner_user_id = v_uid then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.file_delete_requests r
    where r.file_id = p_file and r.requested_by = v_uid and r.status = 'open'
  ) then
    raise exception 'a delete request is already open' using errcode = 'unique_violation';
  end if;
  if (
    select count(*) from public.file_delete_requests r
    where r.requested_by = v_uid and r.status = 'open' and r.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'too many open delete requests' using errcode = 'check_violation';
  end if;
  insert into public.file_delete_requests (file_id, tenant_id, requested_by, reason)
  values (p_file, v.tenant_id, v_uid, p_reason)
  returning id into v_id;
  return v_id;
end $$;

-- The owner answers. Approve marks the request first, then hides the file, so
-- delete_file does not turn the approved row into moot.
create or replace function private.answer_file_delete(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.file_delete_requests%rowtype;
  v_owner uuid;
  v_uid uuid := (select auth.uid());
begin
  select * into v from public.file_delete_requests where id = p_request for update;
  if not found or v.status <> 'open' then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
  select f.owner_user_id into v_owner from public.files f where f.id = v.file_id;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.file_delete_requests set
    status = case when p_approve then 'approved' else 'declined' end,
    decided_by = v_uid,
    decided_at = now()
  where id = p_request;
  if p_approve then
    perform private.delete_file(v.file_id, 'request_approved');
  end if;
end $$;

-- An admin clears an open request without deleting the file.
create or replace function private.dismiss_file_delete(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.file_delete_requests%rowtype;
  v_uid uuid := (select auth.uid());
begin
  select * into v from public.file_delete_requests where id = p_request for update;
  if not found or v.status <> 'open' then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
  if v_uid is null or v.tenant_id not in (select private.admin_tenant_ids()) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.file_delete_requests set
    status = 'dismissed',
    decided_by = v_uid,
    decided_at = now()
  where id = p_request;
end $$;

-- Open requests older than 72 hours, for workspace owners and admins.
create or replace function private.unanswered_file_deletes()
returns setof public.file_delete_requests
language sql stable security definer set search_path = '' as $$
  select r.*
  from public.file_delete_requests r
  where r.status = 'open'
    and r.created_at < now() - interval '72 hours'
    and r.tenant_id in (select private.admin_tenant_ids())
$$;

-- ---------------------------------------------------------------- message delete hides the file
create or replace function private.files_on_message_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  if old.deleted_at is not null or new.deleted_at is null then
    return new;
  end if;
  for f in
    select id from public.files where message_id = new.id and status = 'active' for update
  loop
    update public.files set
      status = 'pending_delete',
      pending_delete_at = now(),
      delete_reason = 'message_deleted',
      deleted_by = (select auth.uid())
    where id = f;
    update public.file_delete_requests set status = 'moot', decided_at = now()
    where file_id = f and status = 'open';
    insert into public.file_jobs (file_id, kind) values (f, 'delete_memory'), (f, 'delete_blob');
  end loop;
  return new;
end $$;
create trigger files_hide_on_message_deleted
  after update of deleted_at on public.messages
  for each row execute function private.files_on_message_deleted();

-- ---------------------------------------------------------------- worker claim
-- One worker takes a due job. skip locked lets another worker pass a locked row.
create or replace function private.claim_file_jobs(p_limit integer)
returns setof public.file_jobs
language plpgsql security definer set search_path = '' as $$
declare r public.file_jobs%rowtype;
begin
  for r in
    select * from public.file_jobs
    where status in ('queued', 'failed') and run_after <= now()
    order by run_after, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 8), 50))
  loop
    update public.file_jobs
      set status = 'running', attempts = attempts + 1
      where id = r.id;
    r.status := 'running';
    r.attempts := r.attempts + 1;
    return next r;
  end loop;
end $$;

create or replace function private.finish_file_job(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.file_jobs set status = 'done', last_error = null where id = p_id;
end $$;

create or replace function private.skip_file_job(p_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.file_jobs set status = 'skipped', last_error = left(coalesce(p_reason, ''), 400)
  where id = p_id;
end $$;

-- attempts is already incremented by claim. Twelve failures mark the job dead.
create or replace function private.fail_file_job(p_id bigint, p_error text, p_delay interval)
returns void language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.file_jobs where id = p_id for update;
  if not found then return; end if;
  if v_attempts >= 12 then
    update public.file_jobs set status = 'dead', last_error = left(coalesce(p_error, ''), 400) where id = p_id;
  else
    update public.file_jobs set
      status = 'failed',
      last_error = left(coalesce(p_error, ''), 400),
      run_after = now() + coalesce(p_delay, interval '1 minute')
    where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------- guest merge also moves file ownership
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
    update public.files set owner_user_id = p_user, owner_guest_id = null
      where owner_guest_id = g.id and owner_user_id is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------- public wrappers
create or replace function public.delete_file(p_file uuid, p_reason text default null)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform private.delete_file(p_file, p_reason);
end $$;

create or replace function public.request_file_delete(p_file uuid, p_reason text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.request_file_delete(p_file, p_reason)
$$;

create or replace function public.answer_file_delete(p_request uuid, p_approve boolean)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform private.answer_file_delete(p_request, p_approve);
end $$;

create or replace function public.dismiss_file_delete(p_request uuid)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform private.dismiss_file_delete(p_request);
end $$;

create or replace function public.unanswered_file_deletes()
returns setof public.file_delete_requests
language sql stable security invoker set search_path = '' as $$
  select * from private.unanswered_file_deletes()
$$;

-- ---------------------------------------------------------------- grants
revoke all on public.files, public.file_delete_requests, public.file_memory_links, public.file_jobs
  from anon, authenticated;
grant select on public.files, public.file_delete_requests to authenticated;

revoke all on function
  private.delete_file(uuid, text),
  private.request_file_delete(uuid, text),
  private.answer_file_delete(uuid, boolean),
  private.dismiss_file_delete(uuid),
  private.unanswered_file_deletes(),
  private.files_on_message_deleted(),
  private.claim_file_jobs(integer),
  private.finish_file_job(bigint),
  private.skip_file_job(bigint, text),
  private.fail_file_job(bigint, text, interval)
  from public, anon;
grant execute on function
  private.delete_file(uuid, text),
  private.request_file_delete(uuid, text),
  private.answer_file_delete(uuid, boolean),
  private.dismiss_file_delete(uuid),
  private.unanswered_file_deletes()
  to authenticated;

revoke all on function
  public.delete_file(uuid, text),
  public.request_file_delete(uuid, text),
  public.answer_file_delete(uuid, boolean),
  public.dismiss_file_delete(uuid),
  public.unanswered_file_deletes()
  from public, anon;
grant execute on function
  public.delete_file(uuid, text),
  public.request_file_delete(uuid, text),
  public.answer_file_delete(uuid, boolean),
  public.dismiss_file_delete(uuid),
  public.unanswered_file_deletes()
  to authenticated;
