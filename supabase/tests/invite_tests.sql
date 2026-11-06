-- Invite flow tests; rolls itself back via RAISE EXCEPTION.
do $test$
declare
  alice uuid := '00000000-0000-4000-a000-00000000a11c';
  carol uuid := '00000000-0000-4000-a000-0000000ca201';
  eve   uuid := '00000000-0000-4000-a000-000000000e0e';
  acme uuid; tok text; got uuid; ok boolean; n int; r jsonb := '[]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.test', '', now(), '{}', now(), now()),
         (carol, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@example.test', '', now(), '{}', now(), now()),
         (eve,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eve@example.test',   '', now(), '{}', now(), now());
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  acme := public.create_tenant('team', 'Acme');
  tok := public.create_invite(acme, 'carol@example.test', 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'email', 'eve@example.test')::text, true);
  begin perform public.accept_invite(tok); ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','token sent to carol is refused for eve','pass', ok);
  select count(*) into n from public.invites;
  r := r || jsonb_build_object('t','eve cannot list invites','pass', n = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated', 'email', 'carol@example.test')::text, true);
  select count(*) into n from public.invites;
  r := r || jsonb_build_object('t','carol sees her pending invite','pass', n = 1);
  got := public.accept_invite(tok);
  select count(*) into n from public.memberships where tenant_id = acme and user_id = carol and role = 'admin';
  r := r || jsonb_build_object('t','carol accepts and becomes admin','pass', got = acme and n = 1);
  begin perform public.accept_invite(tok); ok := false;
  exception when invalid_parameter_value then ok := true; end;
  r := r || jsonb_build_object('t','token cannot be reused','pass', ok);
  update public.memberships set role = 'admin' where tenant_id = acme and user_id = alice;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('t','admin cannot demote the owner','pass', n = 0);
  delete from public.memberships where tenant_id = acme and user_id = alice;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('t','admin cannot remove the owner','pass', n = 0);
  begin perform public.accept_invite('nope'); ok := false;
  exception when invalid_parameter_value then ok := true; end;
  r := r || jsonb_build_object('t','bad token rejected','pass', ok);
  execute 'reset role';
  raise exception 'INVITE_RESULTS %', r::text;
end
$test$;
