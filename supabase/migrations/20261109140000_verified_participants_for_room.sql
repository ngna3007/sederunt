create function public.verified_participants_for_room(p_tenant uuid, p_room text)
returns table ("roomId" text, "memberId" text, email text, "userId" uuid)
language sql security definer set search_path = '' as $$
  select p.room_id, p.member_id, p.email, u.id
  from public.verified_room_participants p
  join auth.users u on lower(u.email) = p.email and u.email_confirmed_at is not null
  join public.memberships m on m.user_id = u.id and m.tenant_id = p.tenant_id
  where p.tenant_id = p_tenant and p.room_id = p_room;
$$;
revoke all on function public.verified_participants_for_room(uuid, text) from public, anon, authenticated;
grant execute on function public.verified_participants_for_room(uuid, text) to service_role;
