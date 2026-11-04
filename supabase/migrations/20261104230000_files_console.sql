-- Channel files move from a testnet Walrus blob to one Walrus Console folder.
-- Postgres stays the visibility index. 20261104210000_files.sql is already
-- applied; this follow-up only adds the Console columns and the folder map.
-- The folder map is server-only. A pinned CONSOLE_FOLDER_ID is not inserted here.

alter table public.files drop constraint if exists files_active_has_blob;
drop index if exists public.files_renew_idx;

alter table public.files
  drop column if exists walrus_blob_id,
  drop column if exists sui_object_id,
  drop column if exists end_epoch,
  drop column if exists seal_id,
  drop column if exists upload_step;

alter table public.files
  add column console_space_id text,
  add column console_folder_id text,
  add column console_file_id text,
  add column console_state text;

alter table public.files
  add constraint files_console_state_known check (
    console_state is null
    or console_state in ('uploading', 'active', 'deleting', 'deleted', 'failed')
  );

-- Existing active rows were stored before these columns existed, so the check
-- is not validated against them. New inserts and updates are checked.
alter table public.files
  add constraint files_active_has_console check (
    status <> 'active'
    or (
      console_space_id is not null
      and console_folder_id is not null
      and console_file_id is not null
    )
  ) not valid;

create index files_console_file_idx on public.files (console_file_id);

-- One private folder per Console space and name. The service account writes this.
create table public.console_folders (
  space_id text not null,
  name text not null check (char_length(name) between 1 and 80),
  folder_id text not null,
  seal_policy_id text,
  created_at timestamptz not null default now(),
  primary key (space_id, name)
);

alter table public.console_folders enable row level security;

create policy console_folders_no_client_access on public.console_folders
  as restrictive for all to anon, authenticated
  using (false) with check (false);

revoke all on public.console_folders from public, anon, authenticated;

-- file_jobs.kind still allows 'renew'. The worker skips that kind: Console
-- renews storage on its own.
