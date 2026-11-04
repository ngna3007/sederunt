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

  ---------------------------------------------------------------- files (current channel membership)
  declare
    fa uuid := '00000000-0000-4000-a000-00000000fa01';
    fb uuid := '00000000-0000-4000-a000-00000000fb02';
    fc uuid := '00000000-0000-4000-a000-00000000fc03';
    fd uuid := '00000000-0000-4000-a000-00000000fd04';
    fe uuid := '00000000-0000-4000-a000-00000000fe05';
    ff uuid := '00000000-0000-4000-a000-00000000ff06';
    fg uuid := '00000000-0000-4000-a000-00000000f907';
    ch_secret uuid;
    msg uuid;
    req uuid;
    old_req uuid;
    fresh_req uuid;
    guest_file uuid;
    carol uuid := '00000000-0000-4000-a000-000000000ca1';
    digest bytea := decode(repeat('ab', 32), 'hex');
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    update public.channels set remember_messages = true where id = ch;
    insert into public.channels (tenant_id, name, visibility)
      values (secretco, 'secret-room', 'invited') returning id into ch_secret;
    insert into public.channel_members (channel_id, tenant_id, user_id) values (ch_secret, secretco, alice);

    insert into public.files (id, tenant_id, channel_id, owner_user_id, name, mime_type, size_bytes, sha256, walrus_blob_id, sui_object_id, status)
      values
        (fa, acme, ch, alice, 'roadmap.pdf', 'application/pdf', 12, digest, 'blob-fa', '0xfa', 'active'),
        (fb, acme, ch, bob, 'notes.txt', 'text/plain', 8, digest, 'blob-fb', '0xfb', 'active'),
        (fc, acme, ch, alice, 'plan.pdf', 'application/pdf', 9, digest, 'blob-fc', '0xfc', 'active'),
        (fd, acme, ch, alice, 'stay.pdf', 'application/pdf', 10, digest, 'blob-fd', '0xfd', 'active'),
        (fe, secretco, ch_secret, alice, 'secret.pdf', 'application/pdf', 11, digest, 'blob-fe', '0xfe', 'active'),
        (ff, acme, ch, alice, 'old.pdf', 'application/pdf', 7, digest, 'blob-ff', '0xff', 'active');
    insert into public.messages (id, tenant_id, channel_id, author_user_id, body_redacted, category, invite_user_ids)
      values (gen_random_uuid(), acme, ch, alice, 'file message', 'file', array[alice, bob])
      returning id into msg;
    insert into public.files (id, tenant_id, channel_id, message_id, owner_user_id, name, mime_type, size_bytes, sha256, walrus_blob_id, sui_object_id, status)
      values (fg, acme, ch, msg, alice, 'attached.txt', 'text/plain', 4, digest, 'blob-fg', '0xfg', 'active');

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated',
                       'email', 'bob@example.test')::text, true);
    select count(*) into n from public.files where id in (fa, fb, fc, fd);
    r := r || jsonb_build_object('t','member reads active files in a channel they are in','pass', n = 4);
    select count(*) into n from public.files where id = fe;
    r := r || jsonb_build_object('t','other tenant file is hidden','pass', n = 0);
    begin
      perform public.delete_file(fa, null);
      ok := false;
    exception when insufficient_privilege then ok := true; end;
    r := r || jsonb_build_object('t','member cannot delete another person''s file','pass', ok);
    req := public.request_file_delete(fa, 'please');
    r := r || jsonb_build_object('t','member can request delete','pass', req is not null);
    begin
      perform public.request_file_delete(fa, 'again');
      ok := false;
    exception when others then ok := true; end;
    r := r || jsonb_build_object('t','a second open request on the same file is refused','pass', ok);

    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated',
                       'email', 'alice@example.test')::text, true);
    perform public.answer_file_delete(req, true);
    select count(*) into n from public.files where id = fa and status = 'pending_delete' and delete_reason = 'request_approved';
    r := r || jsonb_build_object('t','owner approve hides the file as request_approved','pass', n = 1);
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from public.file_jobs where file_id = fa and kind in ('delete_blob', 'delete_memory') and status = 'queued';
    r := r || jsonb_build_object('t','approve queues delete_blob and delete_memory','pass', n = 2);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated',
                       'email', 'bob@example.test')::text, true);
    select count(*) into n from public.files where id = fa;
    r := r || jsonb_build_object('t','pending delete is hidden from other members','pass', n = 0);
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated',
                       'email', 'alice@example.test')::text, true);
    select count(*) into n from public.files where id = fa and status = 'pending_delete';
    r := r || jsonb_build_object('t','owner still sees their pending file','pass', n = 1);
    perform public.delete_file(fc, null);
    select count(*) into n from public.files where id = fc and status = 'pending_delete' and delete_reason = 'owner';
    r := r || jsonb_build_object('t','owner delete records reason owner','pass', n = 1);
    perform public.delete_file(fb, null);
    -- An admin does not own fb, so RLS hides the pending row from them; check as postgres.
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from public.files where id = fb and status = 'pending_delete' and delete_reason = 'moderation';
    r := r || jsonb_build_object('t','admin delete records reason moderation','pass', n = 1);
    perform set_config('role', 'authenticated', true);

    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated',
                       'email', 'bob@example.test')::text, true);
    old_req := public.request_file_delete(ff, 'old ask');
    fresh_req := public.request_file_delete(fd, 'new ask');
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    update public.file_delete_requests set created_at = now() - interval '73 hours' where id = old_req;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated',
                       'email', 'alice@example.test')::text, true);
    select count(*) into n from public.unanswered_file_deletes() where id = old_req;
    r := r || jsonb_build_object('t','72h unanswered request is visible to an admin','pass', n = 1);
    select count(*) into n from public.unanswered_file_deletes() where id = fresh_req;
    r := r || jsonb_build_object('t','a fresh request is not in the unanswered list','pass', n = 0);
    perform public.dismiss_file_delete(old_req);
    select count(*) into n from public.unanswered_file_deletes() where id = old_req;
    r := r || jsonb_build_object('t','admin dismiss clears the unanswered request','pass', n = 0);
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated',
                       'email', 'bob@example.test')::text, true);
    select count(*) into n from public.unanswered_file_deletes();
    r := r || jsonb_build_object('t','a member does not see unanswered requests','pass', n = 0);
    delete from public.channel_members where channel_id = ch and user_id = bob;
    select count(*) into n from public.files where id = fd;
    r := r || jsonb_build_object('t','an ex-member cannot read the channel file','pass', n = 0);

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    insert into public.guests (tenant_id, display_name, email)
      values (acme, 'Carol Slack', 'carol@example.test') returning id into guest_file;
    insert into public.files (tenant_id, channel_id, owner_guest_id, name, mime_type, size_bytes, sha256, walrus_blob_id, sui_object_id, status)
      values (acme, ch, guest_file, 'guest.txt', 'text/plain', 3, digest, 'blob-guest', '0xg1', 'active');
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (carol, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'carol@example.test', '', now(), '{"provider":"google","providers":["google"]}',
              '{"name":"Carol Test"}', now(), now());
    select count(*) into n from public.files
      where name = 'guest.txt' and owner_user_id = carol and owner_guest_id is null;
    r := r || jsonb_build_object('t','guest merge moves file ownership to the new user','pass', n = 1);
    update public.messages set deleted_at = now() where id = msg;
    select count(*) into n from public.files
      where id = fg and status = 'pending_delete' and delete_reason = 'message_deleted';
    r := r || jsonb_build_object('t','deleting a message hides its file and queues deletion','pass', n = 1);
    select count(*) into n from public.file_jobs where file_id = fg and status = 'queued';
    r := r || jsonb_build_object('t','message delete queues two file jobs','pass', n = 2);
  end;

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
