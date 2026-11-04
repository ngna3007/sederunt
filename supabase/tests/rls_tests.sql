-- RLS tests for the Sederunt identity/tenancy schema.
-- Runs as one DO block and ends with RAISE EXCEPTION carrying the results, so
-- every row it creates (including the fake auth.users) is rolled back.
do $test$
declare
  alice uuid := '00000000-0000-4000-a000-00000000a11c';
  bob   uuid := '00000000-0000-4000-a000-000000000b0b';
  acme uuid; secretco uuid; ch uuid; ch_off uuid; conn uuid; guest uuid; bind uuid;
  r jsonb := '[]';
  n int; ok boolean; v text; tok text;

  -- helper lambdas are not available in plpgsql, so switching is inline:
  -- as(user):  role authenticated + request.jwt.claims
begin
  ---------------------------------------------------------------- setup as postgres
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'alice@example.test', '', now(),
          '{"provider":"google","providers":["google"]}',
          '{"full_name":"Alice Test","avatar_url":"https://example.test/a.png"}', now(), now());

  select count(*) into n from public.tenants where personal_owner = alice and kind = 'personal';
  r := r || jsonb_build_object('t','signup creates personal tenant','pass', n = 1);
  select count(*) into n from public.profiles where id = alice and display_name = 'Alice Test'
     and avatar_url = 'https://example.test/a.png' and personal_tenant_id is not null;
  r := r || jsonb_build_object('t','signup creates profile from OAuth name/avatar','pass', n = 1);
  select count(*) into n from public.memberships m join public.tenants t on t.id = m.tenant_id
   where m.user_id = alice and m.role = 'owner' and t.kind = 'personal';
  r := r || jsonb_build_object('t','signup creates owner membership','pass', n = 1);

  ---------------------------------------------------------------- Alice creates tenants (as authenticated)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated',
                     'email', 'alice@example.test')::text, true);
  acme := public.create_tenant('team', 'Acme');
  secretco := public.create_tenant('company', 'Alice Secret Co');
  select count(*) into n from public.memberships where tenant_id in (acme, secretco) and user_id = alice and role = 'owner';
  r := r || jsonb_build_object('t','create_tenant makes creator owner','pass', n = 2);

  begin
    perform public.create_tenant('personal', 'Second personal');
    ok := false;
  exception when others then ok := true; end;
  r := r || jsonb_build_object('t','cannot create a second personal tenant','pass', ok);

  insert into public.channels (tenant_id, name) values (acme, 'general') returning id into ch;
  insert into public.channels (tenant_id, name, remember_messages) values (acme, 'off-record', false) returning id into ch_off;
  insert into public.channel_members (channel_id, tenant_id, user_id) values (ch, acme, alice);
  tok := public.create_invite(acme, 'Carol@Example.test');
  r := r || jsonb_build_object('t','admin create_invite returns token, stores only hash','pass',
        tok is not null and not exists (select 1 from public.invites where encode(token_hash,'hex') = tok));

  ---------------------------------------------------------------- server side (service role = postgres here)
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into public.tenant_connectors (tenant_id, provider, external_workspace_id, display_name, installed_by)
    values (acme, 'slack', 'T_ACME', 'Acme Slack', alice) returning id into conn;
  insert into public.connector_secrets (tenant_id, tenant_connector_id, ciphertext, nonce)
    values (acme, conn, '\xdeadbeef', '\x00');
  begin
    insert into public.tenant_connectors (tenant_id, provider, external_workspace_id, config)
      values (acme, 'teams', 'X', '{"bot_token":"x"}');
    ok := false;
  exception when check_violation then ok := true; end;
  r := r || jsonb_build_object('t','non-secret config rejects secret-looking keys','pass', ok);

  insert into public.channel_bindings (channel_id, tenant_id, provider, external_workspace_id, external_channel_id)
    values (ch, acme, 'slack', 'T_ACME', 'C_GENERAL') returning id into bind;
  -- Bob is in Slack but has not signed up: guest + pending identity
  insert into public.guests (tenant_id, display_name, email) values (acme, 'Bob (Slack)', 'bob@example.test')
    returning id into guest;
  insert into public.identities (provider, external_workspace_id, external_user_id, guest_id, email)
    values ('slack', 'T_ACME', 'U_BOB', guest, 'bob@example.test');
  insert into public.channel_guests (channel_id, tenant_id, guest_id) values (ch, acme, guest);
  insert into public.messages (tenant_id, channel_id, binding_id, external_message_id, author_guest_id,
                               body_redacted, category, invite_user_ids, invite_guest_ids)
    values (acme, ch, bind, '1700000000.0001', guest, 'We ship v2 on Friday', 'decision',
            array[alice], array[guest]);
  insert into public.messages (tenant_id, channel_id, author_user_id, body_redacted, category, invite_user_ids)
    values (acme, ch, alice, 'thanks!', 'chatter', array[alice]);   -- Bob was not present
  select count(*) into n from public.messages where tier = 'long' and expires_at is null and category = 'decision';
  select count(*) + n * 10 into n from public.messages where tier = 'short' and category = 'chatter'
     and expires_at between now() + interval '29 days' and now() + interval '31 days';
  r := r || jsonb_build_object('t','category sets tier and expiry (decision long, chatter 30d)','pass', n = 11);
  begin
    insert into public.messages (tenant_id, channel_id, body_redacted, category) values (acme, ch_off, 'x', 'update');
    ok := false;
  exception when check_violation then ok := true; end;
  r := r || jsonb_build_object('t','remember_messages=false blocks storing','pass', ok);

  ---------------------------------------------------------------- Bob signs up -> guest merge
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'Bob@Example.test', '', now(), '{"provider":"google","providers":["google"]}',
          '{"name":"Bob Test","picture":"https://example.test/b.png"}', now(), now());
  select count(*) into n from public.guests where id = guest and merged_into = bob;
  r := r || jsonb_build_object('t','merge: guest.merged_into = bob','pass', n = 1);
  select count(*) into n from public.identities where guest_id = guest and user_id = bob;
  r := r || jsonb_build_object('t','merge: pending Slack identity linked to bob','pass', n = 1);
  select count(*) into n from public.memberships where tenant_id = acme and user_id = bob and role = 'member';
  r := r || jsonb_build_object('t','merge: bob becomes Acme member','pass', n = 1);
  select count(*) into n from public.channel_members where channel_id = ch and user_id = bob and source = 'guest_merge';
  r := r || jsonb_build_object('t','merge: bob keeps channel access','pass', n = 1);
  select count(*) into n from public.messages where author_user_id = bob and invite_user_ids @> array[bob];
  r := r || jsonb_build_object('t','merge: authorship and invite snapshot move to bob','pass', n = 1);

  ---------------------------------------------------------------- as Bob (member)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated',
                     'email', 'bob@example.test')::text, true);
  select string_agg(name, ',' order by name) into v from public.tenants;
  r := r || jsonb_build_object('t','bob sees only own tenants (Acme + his Personal)','pass',
        v = 'Acme,Personal' and not exists (select 1 from public.tenants where id = secretco), 'saw', v);
  select count(*) into n from public.tenants where personal_owner = alice;
  r := r || jsonb_build_object('t','bob cannot see alice personal tenant','pass', n = 0);
  select count(*) into n from public.my_tenants;
  r := r || jsonb_build_object('t','my_tenants view (security_invoker) shows 2 for bob','pass', n = 2);
  begin
    perform 1 from public.connector_secrets;
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','member cannot read connector_secrets (42501)','pass', ok);
  select count(*) into n from public.tenant_connectors;
  r := r || jsonb_build_object('t','member cannot see tenant_connectors (admin only)','pass', n = 0);
  update public.memberships set role = 'owner' where tenant_id = acme and user_id = bob;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('t','member cannot promote self','pass', n = 0);
  begin
    insert into public.memberships (tenant_id, user_id, role) values (secretco, bob, 'member');
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','member cannot insert memberships','pass', ok);
  begin
    perform public.create_invite(acme, 'mallory@example.test');
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','member cannot create invites','pass', ok);
  select count(*) into n from public.messages;
  r := r || jsonb_build_object('t','bob sees only messages he was present for (1 of 2)','pass', n = 1);
  select count(*) into n from public.profiles;
  r := r || jsonb_build_object('t','bob sees own + co-member profiles (2)','pass', n = 2);
  select count(*) into n from public.identities;
  r := r || jsonb_build_object('t','bob sees his own identity only','pass', n = 1);
  begin
    update public.profiles set personal_tenant_id = acme where id = bob;
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','profile column grants block personal_tenant_id edit','pass', ok);

  ---------------------------------------------------------------- as Alice (owner)
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated',
                     'email', 'alice@example.test')::text, true);
  select count(*) into n from public.tenants;
  r := r || jsonb_build_object('t','alice sees her 3 tenants, not bob personal','pass', n = 3);
  begin
    perform 1 from public.connector_secrets;
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','even owner cannot read connector_secrets','pass', ok);
  select count(*) into n from public.tenant_connectors;
  r := r || jsonb_build_object('t','owner sees tenant_connectors (non-secret)','pass', n = 1);
  select count(*) into n from public.messages;
  r := r || jsonb_build_object('t','alice sees both messages she was present for','pass', n = 2);
  update public.channels set remember_messages = false where id = ch;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('t','admin can flip remember_messages','pass', n = 1);

  ---------------------------------------------------------------- anon
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform 1 from public.tenants;
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('t','anon has no table access','pass', ok);

  execute 'reset role';
  raise exception 'RLS_RESULTS %', r::text;
end
$test$;
