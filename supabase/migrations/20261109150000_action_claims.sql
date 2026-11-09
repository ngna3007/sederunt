-- A claim means a provider call may have been made. Never release it after a timeout.
create table public.action_execution_claims (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  claim_key text not null check (claim_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, claim_key)
);
alter table public.action_execution_claims enable row level security;
revoke all on public.action_execution_claims from public, anon, authenticated;
grant select on public.action_execution_claims to service_role;

create function public.claim_action_execution(p_tenant uuid, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.action_execution_claims(tenant_id, claim_key)
    values (p_tenant, p_key) on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.claim_action_execution(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_action_execution(uuid, text) to service_role;
