create table public.verified_room_participants (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id text not null check (char_length(room_id) between 1 and 255),
  member_id text not null check (char_length(member_id) between 1 and 255),
  email text not null check (char_length(email) between 3 and 320),
  verified_at timestamptz not null default now(),
  primary key (tenant_id, room_id, member_id)
);
alter table public.verified_room_participants enable row level security;
revoke all on public.verified_room_participants from public, anon, authenticated;
grant all on public.verified_room_participants to service_role;

create function public.record_verified_participant(p_tenant uuid, p_room text, p_member text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.verified_room_participants(tenant_id, room_id, member_id, email)
  values(p_tenant, p_room, p_member, lower(trim(p_email)))
  on conflict (tenant_id, room_id, member_id) do update set verified_at = now()
  where public.verified_room_participants.email = excluded.email;
  if not found then raise exception 'participant identity changed'; end if;
end; $$;

create function public.verified_participants_for_user(p_tenant uuid, p_user uuid)
returns table ("roomId" text, "memberId" text)
language sql security definer set search_path = '' as $$
  select p.room_id, p.member_id from public.verified_room_participants p
  join auth.users u on u.id = p_user and lower(u.email) = p.email and u.email_confirmed_at is not null
  join public.memberships m on m.user_id = u.id and m.tenant_id = p.tenant_id
  where p.tenant_id = p_tenant;
$$;
revoke all on function public.record_verified_participant(uuid,text,text,text), public.verified_participants_for_user(uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_verified_participant(uuid,text,text,text), public.verified_participants_for_user(uuid,uuid) to service_role;
