-- Runtime-only operations. Existing normalized tables remain authoritative.
alter table public.files add column owner_name text not null default '';
alter table public.files add column slack_file_id text;
alter table public.file_jobs add column claim_token uuid;
alter table public.file_jobs add column lease_until timestamptz;

-- Pending upload bytes are bounded by the files.size_bytes constraint and are
-- removed after activation/deletion. No client role can read this staging area.
create table public.file_upload_staging (
 file_id uuid primary key references public.files(id) on delete cascade,
 bytes bytea not null check (octet_length(bytes) between 1 and 104857600),
 created_at timestamptz not null default now()
);
alter table public.file_upload_staging enable row level security;
revoke all on public.file_upload_staging from public,anon,authenticated;
create policy file_upload_staging_no_client_access on public.file_upload_staging
 as restrictive for all to anon,authenticated using(false) with check(false);

create function public.files_runtime_claim(p_lease_seconds integer default 300)
returns setof public.file_jobs language sql volatile security definer set search_path='' as $$
 with candidate as (
  select id from public.file_jobs
  where ((status in ('queued','failed') and run_after<=now())
    or (status='running' and lease_until<now())) and attempts<12
  and (kind<>'delete_blob' or not exists(select 1 from public.file_jobs uploading where uploading.file_id=file_jobs.file_id and uploading.kind='upload' and uploading.status='running' and uploading.lease_until>now()))
  order by run_after,id for update skip locked limit 1
 )
 update public.file_jobs j set status='running',attempts=attempts+1,
  claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>greatest(1,least(p_lease_seconds,3600)))
 from candidate c where j.id=c.id returning j.*
$$;

create function public.files_runtime_settle(p_id bigint,p_token uuid,p_status text,p_error text default null,p_delay_ms integer default 60000)
returns setof public.file_jobs language plpgsql volatile security definer set search_path='' as $$
begin
 if p_status not in ('done','skipped','failed') then raise exception 'invalid job status'; end if;
 return query update public.file_jobs set
  status=case when p_status='failed' and attempts>=12 then 'dead' else p_status end,
  last_error=left(p_error,400),
  run_after=case when p_status='failed' then now()+make_interval(secs=>greatest(0,least(p_delay_ms,21600000))::double precision/1000) else run_after end,
  claim_token=null,lease_until=null
 where id=p_id and claim_token=p_token and status='running' and lease_until>now() returning *;
end $$;

-- One transaction establishes visibility, stages bytes and queues the upload.
create function public.files_runtime_upload(p_actor uuid,p_file jsonb,p_bytes text)
returns public.files language plpgsql volatile security definer set search_path='' as $$
declare v public.files%rowtype; c public.channels%rowtype; v_message uuid; v_binding uuid;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select * into c from public.channels where id=(p_file->>'channelId')::uuid and archived_at is null;
 if not found or c.id not in(select private.visible_channel_ids()) then
  raise exception 'not found' using errcode='P0002';
 end if;
 if (p_file->>'tenantId')::uuid<>c.tenant_id or (p_file->>'ownerUserId')::uuid is distinct from p_actor then
  raise exception 'not allowed' using errcode='42501';
 end if;
 if coalesce(p_file->>'externalWorkspaceId','')<>'' then
  select id into v_binding from public.channel_bindings where provider='slack' and status='active' and channel_id=c.id
   and external_workspace_id=p_file->>'externalWorkspaceId' and external_channel_id=p_file->>'externalChannelId';
  if v_binding is null then raise exception 'binding not found' using errcode='P0002'; end if;
 end if;
 v_message:=(p_file->>'messageId')::uuid;
 if v_message is not null then
  if not exists(select 1 from public.messages where id=v_message and channel_id=c.id and tenant_id=c.tenant_id and deleted_at is null) then
   raise exception 'not found' using errcode='P0002';
  end if;
 else
  insert into public.messages(tenant_id,channel_id,author_user_id,body_redacted,category,tier,external_message_id,binding_id)
   values(c.tenant_id,c.id,p_actor,'','file','long',p_file->>'externalMessageId',v_binding) returning id into v_message;
 end if;
 insert into public.files(id,tenant_id,channel_id,message_id,owner_user_id,owner_name,name,mime_type,size_bytes,sha256,slack_file_id)
 values((p_file->>'id')::uuid,c.tenant_id,c.id,v_message,p_actor,coalesce(p_file->>'ownerName',''),p_file->>'name',p_file->>'mimeType',
  (p_file->>'sizeBytes')::bigint,decode(p_file->>'sha256','hex'),p_file->>'slackFileId') returning * into v;
 if octet_length(decode(p_bytes,'base64'))<>v.size_bytes or extensions.digest(decode(p_bytes,'base64'),'sha256')<>v.sha256 then
  raise exception 'upload checksum mismatch' using errcode='23514';
 end if;
 insert into public.file_upload_staging(file_id,bytes) values(v.id,decode(p_bytes,'base64'));
 insert into public.file_jobs(file_id,kind) values(v.id,'upload');
 return v;
end $$;

-- Service callers pass an authenticated actor. Existing authorization functions
-- run with that actor, never the service role's empty auth.uid().
create function public.files_runtime_action(p_actor uuid,p_action text,p_id uuid,p_input jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.files%rowtype; r public.file_delete_requests%rowtype; result jsonb; v_request uuid;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null then raise exception 'sign in first' using errcode='42501'; end if;
 if not exists(select 1 from public.memberships m where m.user_id=p_actor and m.tenant_id=(
  select f.tenant_id from public.files f where f.id=p_id union all
  select q.tenant_id from public.file_delete_requests q where q.id=p_id limit 1
 )) then raise exception 'not found' using errcode='P0002'; end if;
 if p_action='delete' then
  perform private.delete_file(p_id,p_input->>'reason');
  select to_jsonb(f) into result from public.files f where id=p_id;
 elsif p_action='request' then
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text, 9711));
  v_request:=private.request_file_delete(p_id,p_input->>'reason');
  select to_jsonb(q) into result from public.file_delete_requests q where id=v_request;
 elsif p_action='answer' then
  perform private.answer_file_delete(p_id,(p_input->>'approve')::boolean);
  select * into r from public.file_delete_requests where id=p_id;
  select to_jsonb(f) into result from public.files f where id=r.file_id;
  result:=jsonb_build_object('request',to_jsonb(r),'file',result);
 elsif p_action='dismiss' then
  if not exists(select 1 from public.file_delete_requests where id=p_id and created_at<=now()-interval '72 hours') then
   raise exception 'request is not overdue' using errcode='42501';
  end if;
  perform private.dismiss_file_delete(p_id);
  select to_jsonb(q) into result from public.file_delete_requests q where id=p_id;
 elsif p_action='discard' then
  select * into v from public.files where id=p_id for update;
  if not found or v.owner_user_id<>p_actor or v.status<>'failed' or v.channel_id not in(select private.visible_channel_ids()) then
   raise exception 'not found' using errcode='P0002';
  end if;
  -- A failed upload may already have been accepted remotely; keep cleanup owed.
  update public.files set status='pending_delete',delete_reason='owner',pending_delete_at=now(),updated_at=now() where id=p_id;
  insert into public.file_jobs(file_id,kind) values(p_id,'delete_memory'),(p_id,'delete_blob');
  delete from public.file_upload_staging where file_id=p_id;
  select to_jsonb(f) into result from public.files f where id=p_id;
 else raise exception 'unknown file action'; end if;
 return result;
end $$;

-- Worker mutations are fenced by a live claim. A delayed worker cannot commit
-- after another process has reclaimed the job or a deletion has hidden the file.
create function public.files_runtime_worker(p_id bigint,p_token uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.file_jobs%rowtype; v public.files%rowtype;
begin
 select * into j from public.file_jobs where id=p_id and claim_token=p_token and status='running' and lease_until>now() for update;
 if not found then raise exception 'file job lease lost' using errcode='PT409'; end if;
 select * into v from public.files where id=j.file_id for update;
 if p_action='accepted' and j.kind='upload' then
  update public.files set console_space_id=p_input->>'spaceId',console_folder_id=p_input->>'folderId',
   console_file_id=p_input->>'fileId',console_state='uploading',updated_at=now()
  where id=v.id and status in('uploading','pending_delete');
 elsif p_action='active' and j.kind='upload' then
  update public.files set console_space_id=p_input->>'spaceId',console_folder_id=p_input->>'folderId',
   console_file_id=p_input->>'fileId',console_state='active',status='active',updated_at=now()
  where id=v.id and status='uploading';
  delete from public.file_upload_staging where file_id=v.id;
 elsif p_action='deleted' and j.kind='delete_blob' then
  update public.files set status='deleted',console_state='deleted',deleted_at=now(),updated_at=now()
  where id=v.id and status='pending_delete';
  delete from public.file_upload_staging where file_id=v.id;
 elsif p_action='links' and j.kind='delete_memory' then
  update public.file_memory_links set status=p_input->>'status',reason=p_input->>'reason' where file_id=v.id;
 else raise exception 'invalid file worker transition'; end if;
 select * into v from public.files where id=j.file_id;
 return to_jsonb(v);
end $$;

create function public.files_runtime_view(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_actor is null then raise exception 'sign in first' using errcode='42501'; end if;
 return jsonb_build_object(
  'memberships',(select coalesce(jsonb_agg(m),'[]') from public.memberships m where user_id=p_actor),
  'channelMembers',(select coalesce(jsonb_agg(cm),'[]') from public.channel_members cm where user_id=p_actor),
  'channels',(select coalesce(jsonb_agg(c),'[]') from public.channels c where archived_at is null and exists(select 1 from public.memberships m where m.tenant_id=c.tenant_id and m.user_id=p_actor)),
  'files',(select coalesce(jsonb_agg(f),'[]') from public.files f where exists(select 1 from public.memberships m where m.tenant_id=f.tenant_id and m.user_id=p_actor) and
   ((f.status='active' and exists(select 1 from public.channels c where c.id=f.channel_id and c.archived_at is null and (c.visibility='tenant' or exists(select 1 from public.channel_members cm where cm.channel_id=c.id and cm.user_id=p_actor))))
    or f.owner_user_id=p_actor or exists(select 1 from public.memberships m where m.tenant_id=f.tenant_id and m.user_id=p_actor and m.role in('owner','admin')))),
  'requests',(select coalesce(jsonb_agg(r),'[]') from public.file_delete_requests r where exists(select 1 from public.memberships m where m.tenant_id=r.tenant_id and m.user_id=p_actor) and
   (r.requested_by=p_actor or exists(select 1 from public.files f where f.id=r.file_id and f.owner_user_id=p_actor) or exists(select 1 from public.memberships m where m.tenant_id=r.tenant_id and m.user_id=p_actor and m.role in('owner','admin')))),
  'profile',(select coalesce(display_name,'') from public.profiles where id=p_actor)
 );
end $$;

-- Do not revive rows imported from stale Console metadata. Imports are explicit,
-- insert-only operations with a known channel/owner and a real content checksum.
create function public.files_runtime_import(p_file jsonb)
returns void language sql volatile security definer set search_path='' as $$
 insert into public.files(id,tenant_id,channel_id,owner_user_id,owner_name,name,mime_type,size_bytes,sha256,status,console_space_id,console_folder_id,console_file_id,console_state,created_at)
 select (p_file->>'id')::uuid,(p_file->>'tenantId')::uuid,(p_file->>'channelId')::uuid,(p_file->>'ownerUserId')::uuid,coalesce(p_file->>'ownerName',''),
 p_file->>'name',coalesce(p_file->>'mimeType','application/octet-stream'),(p_file->>'sizeBytes')::bigint,decode(p_file->>'sha256','hex'),'active',
 p_file->>'consoleSpaceId',p_file->>'consoleFolderId',p_file->>'consoleFileId','active',coalesce((p_file->>'createdAt')::timestamptz,now())
 where p_file->>'sha256' ~ '^[0-9a-f]{64}$' and exists(select 1 from public.channels c join public.memberships m on m.tenant_id=c.tenant_id
  where c.id=(p_file->>'channelId')::uuid and c.tenant_id=(p_file->>'tenantId')::uuid and m.user_id=(p_file->>'ownerUserId')::uuid)
 on conflict(id) do nothing
$$;

revoke all on function public.files_runtime_claim(integer),public.files_runtime_settle(bigint,uuid,text,text,integer),
 public.files_runtime_upload(uuid,jsonb,text),public.files_runtime_action(uuid,text,uuid,jsonb),
 public.files_runtime_worker(bigint,uuid,text,jsonb),public.files_runtime_view(uuid),public.files_runtime_import(jsonb)
 from public,anon,authenticated;
grant execute on function public.files_runtime_claim(integer),public.files_runtime_settle(bigint,uuid,text,text,integer),
 public.files_runtime_upload(uuid,jsonb,text),public.files_runtime_action(uuid,text,uuid,jsonb),
 public.files_runtime_worker(bigint,uuid,text,jsonb),public.files_runtime_view(uuid),public.files_runtime_import(jsonb)
 to service_role;
grant select,insert,update,delete on public.files,public.file_jobs,public.file_upload_staging,public.file_memory_links,
 public.console_folders,public.console_folder_credentials,public.console_tenant_folders to service_role;
grant select,insert,update on public.channels to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.files_runtime_message_deleted(p_workspace text,p_channel text,p_external_id text)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_binding uuid; v_count integer;
begin
 if coalesce(p_workspace,'')='' or coalesce(p_channel,'')='' then raise exception 'Slack binding required' using errcode='42501'; end if;
 select id into v_binding from public.channel_bindings where provider='slack' and external_workspace_id=p_workspace
  and external_channel_id=p_channel and status='active';
 if v_binding is null then return 0; end if;
 -- The existing trigger hides related files and queues their deletion atomically.
 update public.messages set deleted_at=now() where binding_id=v_binding and external_message_id=p_external_id and deleted_at is null;
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.files_runtime_message_deleted(text,text,text) from public,anon,authenticated;
grant execute on function public.files_runtime_message_deleted(text,text,text) to service_role;
grant select on public.channel_bindings,public.identities to service_role;

-- Message deletion also cancels an upload that is still in flight. Otherwise a
-- delayed activation could make a deleted Slack attachment visible again.
create or replace function private.files_on_message_deleted()
returns trigger language plpgsql security definer set search_path='' as $$
declare f uuid;
begin
 if old.deleted_at is not null or new.deleted_at is null then return new; end if;
 for f in select id from public.files where message_id=new.id and status in('active','uploading','failed') for update loop
  update public.files set status='pending_delete',pending_delete_at=now(),updated_at=now(),delete_reason='message_deleted',deleted_by=auth.uid() where id=f;
  update public.file_delete_requests set status='moot',decided_at=now() where file_id=f and status='open';
  insert into public.file_jobs(file_id,kind) values(f,'delete_memory'),(f,'delete_blob');
 end loop;
 return new;
end $$;

create function public.files_runtime_renew(p_id bigint,p_token uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 with renewed as (
  update public.file_jobs set lease_until=now()+interval '5 minutes'
  where id=p_id and claim_token=p_token and status='running' and lease_until>now() returning id
 ) select exists(select 1 from renewed)
$$;
revoke all on function public.files_runtime_renew(bigint,uuid) from public,anon,authenticated;
grant execute on function public.files_runtime_renew(bigint,uuid) to service_role;
