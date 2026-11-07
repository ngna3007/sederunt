-- Per-tenant Slack app installations (Add to Slack, oauth.v2.access).
-- One installation per tenant (primary key) and one tenant per Slack team
-- (unique team_id): a team installed for another tenant is a conflict, never
-- a silent reassignment. The bot token is AES-256-GCM ciphertext sealed with
-- MCP_SECRETS_KEY_V1. RLS is on with no policies; only the service role reads.

create table public.slack_installations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  team_id text not null unique check (team_id ~ '^[TE][A-Z0-9]{2,}$'),
  team_name text not null default '' check (char_length(team_name) <= 200),
  bot_user_id text not null default '' check (char_length(bot_user_id) <= 40),
  app_id text not null default '' check (char_length(app_id) <= 40),
  channel_id text not null default '' check (char_length(channel_id) <= 40),
  channel_name text not null default '' check (char_length(channel_name) <= 200),
  scopes text[] not null default '{}',
  installed_by uuid references auth.users (id) on delete set null,
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.slack_installations enable row level security;

revoke all on public.slack_installations from public, anon, authenticated;
