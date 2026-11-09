-- Service-only execution and delivery state; semantic memory stays in Walrus.
create table public.meeting_followups (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  meeting_id text not null check (char_length(meeting_id) between 1 and 255),
  kind text not null check (kind in ('outcome','action','delivery')),
  status text not null check (status in ('pending','editing','running','done','skipped','failed','outcome_unknown','not_reached')),
  data jsonb not null default '{}',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,id),
  check (octet_length(data::text) <= 524288)
);
alter table public.meeting_followups enable row level security;
revoke all on public.meeting_followups from public,anon,authenticated;
grant select on public.meeting_followups to service_role;
create index meeting_followups_pending on public.meeting_followups(status,updated_at) where status in ('pending','failed','running');

create function public.meeting_followup_put(p_tenant uuid,p_id text,p_meeting text,p_kind text,p_status text,p_data jsonb)
returns public.meeting_followups language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.meeting_followups;
begin
  insert into public.meeting_followups(tenant_id,id,meeting_id,kind,status,data)
    values(p_tenant,p_id,p_meeting,p_kind,p_status,p_data) on conflict do nothing;
  select * into result from public.meeting_followups where tenant_id=p_tenant and id=p_id;
  if result.meeting_id<>p_meeting or result.kind<>p_kind then raise exception 'Follow-up identity conflict'; end if;
  return result;
end $$;
create function public.meeting_followup_change(p_tenant uuid,p_id text,p_revision bigint,p_status text,p_data jsonb)
returns public.meeting_followups language sql security definer set search_path=public,pg_temp as $$
  update public.meeting_followups set status=p_status,data=p_data,revision=revision+1,updated_at=now()
    where tenant_id=p_tenant and id=p_id and revision=p_revision returning *;
$$;
revoke all on function public.meeting_followup_put(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.meeting_followup_change(uuid,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.meeting_followup_put(uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.meeting_followup_change(uuid,text,bigint,text,jsonb) to service_role;
