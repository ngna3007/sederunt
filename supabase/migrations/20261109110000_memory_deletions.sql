create table public.memory_deletions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  room_key text not null check (room_key ~ '^[0-9a-f]{64}$'),
  target_kind text not null check (target_kind in ('source','decision')),
  target_key text not null check (target_key ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending' check (state in ('pending','running','failed','done')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,room_key,target_kind,target_key)
);
alter table public.memory_deletions enable row level security;
revoke all on public.memory_deletions from public,anon,authenticated;
create index memory_deletions_claim on public.memory_deletions (next_attempt_at) where state <> 'done';

create function public.memory_deletion_request(p_targets jsonb) returns setof public.memory_deletions
language plpgsql security definer set search_path='' as $$
begin
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) not between 1 and 100 then
    raise exception 'Invalid deletion targets';
  end if;
  return query
  insert into public.memory_deletions(tenant_id,room_key,target_kind,target_key)
  select (t->>'tenantId')::uuid,t->>'roomKey',t->>'targetKind',t->>'targetKey'
  from jsonb_array_elements(p_targets) t
  on conflict (tenant_id,room_key,target_kind,target_key) do update
    set updated_at=memory_deletions.updated_at
  returning *;
end $$;
create function public.memory_deletion_list(p_tenant_id uuid) returns setof public.memory_deletions
language sql security definer set search_path='' stable as $$
  select * from public.memory_deletions where tenant_id=p_tenant_id;
$$;
create function public.memory_deletion_claim(p_limit integer default 10,p_lease_seconds integer default 60)
returns setof public.memory_deletions language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 100 or p_lease_seconds is null or p_lease_seconds not between 1 and 300 then
    raise exception 'Invalid deletion claim bounds';
  end if;
  return query
  with candidates as (
    select id from public.memory_deletions
    where (state in ('pending','failed') and next_attempt_at <= now())
       or (state='running' and lease_until <= now())
    order by next_attempt_at,id for update skip locked limit p_limit
  )
  update public.memory_deletions d
  set state='running',attempts=d.attempts+1,lease_token=gen_random_uuid(),
      lease_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  from candidates c where d.id=c.id returning d.*;
end $$;
create function public.memory_deletion_finish(p_id uuid,p_token uuid,p_success boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if p_success is null then raise exception 'Invalid deletion result'; end if;
  update public.memory_deletions set state=case when p_success then 'done' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,power(2,least(attempts,12)))::integer),
    lease_token=null,lease_until=null,updated_at=now()
  where id=p_id and state='running' and lease_token=p_token and lease_until>now();
  get diagnostics affected = row_count;
  return affected=1;
end $$;
revoke all on function public.memory_deletion_request(jsonb),public.memory_deletion_list(uuid),public.memory_deletion_claim(integer,integer),public.memory_deletion_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.memory_deletion_request(jsonb),public.memory_deletion_list(uuid),public.memory_deletion_claim(integer,integer),public.memory_deletion_finish(uuid,uuid,boolean) to service_role;
