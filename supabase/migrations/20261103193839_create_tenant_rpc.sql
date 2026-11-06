-- INSERT ... RETURNING on tenants fails RLS for the creator: the SELECT policy is
-- checked before the after-insert trigger adds the owner membership. Provide an
-- invoker RPC that inserts with a pre-generated id and no RETURNING. Direct inserts
-- still work with Prefer: return=minimal (supabase-js .insert() without .select()).
grant insert (id, kind, name) on public.tenants to authenticated;

create or replace function public.create_tenant(p_kind text, p_name text)
returns uuid language plpgsql volatile security invoker set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.tenants (id, kind, name) values (v_id, p_kind, p_name);
  return v_id;
end $$;
revoke all on function public.create_tenant(text, text) from public, anon;
grant execute on function public.create_tenant(text, text) to authenticated;
