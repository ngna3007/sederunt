\set ON_ERROR_STOP on
begin;
insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
 ('11111111-1111-4111-a111-111111111111','demo@example.test','{"full_name":"Demo fixture","sederunt_onboarded":true}','{"providers":["google"]}'),
 ('22222222-2222-4222-a222-222222222222','other@example.test','{}','{}');
insert into public.tenants (id,kind,name,created_by) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','team','Disposable demo','11111111-1111-4111-a111-111111111111');
do $$ begin
 if to_regclass('public.slack_installations') is not null then
  perform public.slack_installation_save(
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','TSHARED','Shared fixture','UBOT','APP','','','{}',
   '11111111-1111-4111-a111-111111111111','\x01','\x02',1,false,null);
 end if;
end $$;
create temp table preview as select public.admin_account_plan('11111111-1111-4111-a111-111111111111') as value;
-- A new member after preview must prevent deletion.
insert into public.memberships (tenant_id,user_id,role) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','22222222-2222-4222-a222-222222222222','member');
do $$ begin
 begin
  perform public.admin_restart_demo('11111111-1111-4111-a111-111111111111',(select value from preview),'fixture-admin');
  raise exception 'stale plan accepted';
 exception when unique_violation then null; end;
 begin
  perform public.admin_restart_demo('11111111-1111-4111-a111-111111111111',public.admin_account_plan('11111111-1111-4111-a111-111111111111'),'fixture-admin');
  raise exception 'orphaned workspace accepted';
 exception when unique_violation then null; end;
end $$;
update public.memberships set role='owner' where user_id='22222222-2222-4222-a222-222222222222' and tenant_id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
select public.admin_restart_demo('11111111-1111-4111-a111-111111111111',public.admin_account_plan('11111111-1111-4111-a111-111111111111'),'fixture-admin');
do $$ begin
 if (select count(*) from auth.users) <> 2 then raise exception 'auth users changed'; end if;
 if (select count(*) from public.memberships where user_id='11111111-1111-4111-a111-111111111111') <> 1 then raise exception 'membership reset failed'; end if;
 if not exists(select 1 from public.tenants where id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa') then raise exception 'shared workspace deleted'; end if;
 if not exists(select 1 from public.memberships where user_id='22222222-2222-4222-a222-222222222222' and tenant_id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa') then raise exception 'other member affected'; end if;
 if exists(select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id where user_id='11111111-1111-4111-a111-111111111111' and t.kind<>'personal') then raise exception 'onboarding cannot restart'; end if;
 if (select raw_user_meta_data ? 'sederunt_onboarded' from auth.users where id='11111111-1111-4111-a111-111111111111') then raise exception 'onboarding flag kept'; end if;
end $$;
do $$ begin
 if to_regclass('public.slack_installations') is not null then
  if not exists(select 1 from public.slack_installations where tenant_id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' and team_id='TSHARED') then raise exception 'shared Slack installation deleted'; end if;
  if not exists(select 1 from public.slack_connection_state where tenant_id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' and mode='oauth') then raise exception 'shared Slack connection changed'; end if;
 end if;
end $$;
insert into public.tenants (id,kind,name,created_by) values ('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','team','Solo demo','11111111-1111-4111-a111-111111111111');
do $$ begin
 if to_regclass('public.slack_installations') is not null then
  perform public.slack_installation_save(
   'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','TSOLO','Solo fixture','UBOT','APP','','','{}',
   '11111111-1111-4111-a111-111111111111','\x03','\x04',1,false,null);
 end if;
end $$;
select public.admin_restart_demo('11111111-1111-4111-a111-111111111111',public.admin_account_plan('11111111-1111-4111-a111-111111111111'),'fixture-admin');
do $$ begin
 if exists(select 1 from public.tenants where id='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb') then raise exception 'solo workspace retained'; end if;
 if not public.admin_tenant_retired('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb') then raise exception 'missing tombstone'; end if;
 if (select count(*) from public.admin_actions) <> 2 then raise exception 'missing audits'; end if;
 if jsonb_array_length(public.admin_accounts('demo@example.test',0)) <> 1 then raise exception 'search failed'; end if;
 if jsonb_array_length(public.admin_accounts('%',0)) <> 0 then raise exception 'wildcard not escaped'; end if;
 if has_function_privilege('anon','public.admin_restart_demo(uuid,jsonb,text)','execute') then raise exception 'anon can reset'; end if;
 if has_function_privilege('authenticated','public.admin_accounts(text,integer)','execute') then raise exception 'members can list users'; end if;
 if not has_function_privilege('service_role','public.admin_restart_demo(uuid,jsonb,text)','execute') then raise exception 'admin cannot reset'; end if;
 for i in 1..10 loop if not public.admin_login_attempt() then raise exception 'login limit too early'; end if; end loop;
 if public.admin_login_attempt() then raise exception 'login rate limit missing'; end if;
end $$;
do $$
declare fresh_tenant uuid; saved jsonb;
begin
 if to_regclass('public.slack_installations') is not null then
  if exists(select 1 from public.slack_installations where tenant_id='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb') then raise exception 'solo Slack installation retained'; end if;
  if exists(select 1 from public.slack_connection_state where tenant_id='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb') then raise exception 'solo Slack connection retained'; end if;
  select tenant_id into strict fresh_tenant from public.memberships where user_id='11111111-1111-4111-a111-111111111111';
  saved := public.slack_installation_save(
   fresh_tenant,'TSOLO','Reinstalled fixture','UBOT','APP','','','{}',
   '11111111-1111-4111-a111-111111111111','\x05','\x06',1,false,null);
  if saved->>'team_id' is distinct from 'TSOLO' then raise exception 'Slack team cannot be reinstalled: %',saved; end if;
  if not exists(select 1 from public.slack_connection_state where tenant_id=fresh_tenant and team_id='TSOLO' and mode='oauth') then raise exception 'new Slack connection missing'; end if;
 end if;
end $$;
select public.admin_issue_preview('cccccccc-cccc-4ccc-accc-cccccccccccc');
do $$ begin
 if not public.admin_consume_preview('cccccccc-cccc-4ccc-accc-cccccccccccc') then raise exception 'preview not consumed'; end if;
 if public.admin_consume_preview('cccccccc-cccc-4ccc-accc-cccccccccccc') then raise exception 'preview replayed'; end if;
end $$;
rollback;
