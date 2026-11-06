-- One permissive policy per action on bot_preferences (advisor 0006).
-- A user writes their own row; an admin writes the workspace row (user_id null).
drop policy bot_preferences_insert_own on public.bot_preferences;
drop policy bot_preferences_insert_workspace on public.bot_preferences;
drop policy bot_preferences_update_own on public.bot_preferences;
drop policy bot_preferences_update_workspace on public.bot_preferences;
drop policy bot_preferences_delete_own on public.bot_preferences;
drop policy bot_preferences_delete_workspace on public.bot_preferences;

create policy bot_preferences_insert on public.bot_preferences
  for insert to authenticated
  with check (
    (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()))
    or (tenant_id in (select private.admin_tenant_ids()) and user_id is null)
  );

create policy bot_preferences_update on public.bot_preferences
  for update to authenticated
  using (
    (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()))
    or (tenant_id in (select private.admin_tenant_ids()) and user_id is null)
  )
  with check (
    (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()))
    or (tenant_id in (select private.admin_tenant_ids()) and user_id is null)
  );

create policy bot_preferences_delete on public.bot_preferences
  for delete to authenticated
  using (
    (tenant_id in (select private.user_tenant_ids()) and user_id = (select auth.uid()))
    or (tenant_id in (select private.admin_tenant_ids()) and user_id is null)
  );
