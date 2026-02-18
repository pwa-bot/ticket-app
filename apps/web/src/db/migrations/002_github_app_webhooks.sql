-- Migration: GitHub App + Webhooks + Derived Cache
-- Date: 2026-02-18

-- installations
create table if not exists installations (
  id bigserial primary key,
  github_installation_id bigint not null unique,
  github_account_login text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- repos (replaces or extends existing repos table)
-- Note: we already have a repos table, this adds installation_id
alter table repos add column if not exists installation_id bigint references installations(id) on delete set null;
alter table repos add column if not exists enabled boolean not null default true;

-- sync state (separate from repos for clarity)
create table if not exists repo_sync_state (
  repo_id bigint primary key,
  head_sha text,
  last_webhook_delivery_id text,
  last_synced_at timestamptz,
  status text not null default 'ok', -- ok|syncing|error
  error_code text,
  error_message text
);

-- index snapshots (store only latest per repo, or keep history)
create table if not exists ticket_index_snapshots (
  id bigserial primary key,
  repo_id bigint not null,
  head_sha text not null,
  generated_at timestamptz,
  index_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(repo_id, head_sha)
);

-- PR cache
create table if not exists pr_cache (
  id bigserial primary key,
  repo_id bigint not null,
  pr_number int not null,
  pr_url text not null,
  head_ref text,
  title text,
  state text,
  merged boolean,
  mergeable_state text,
  linked_ticket_short_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique(repo_id, pr_number)
);

-- PR checks cache
create table if not exists pr_checks_cache (
  repo_id bigint not null,
  pr_number int not null,
  status text not null, -- pass|fail|running|unknown
  details jsonb,
  updated_at timestamptz not null default now(),
  primary key (repo_id, pr_number)
);

-- webhook delivery dedupe
create table if not exists webhook_deliveries (
  delivery_id text primary key,
  event text not null,
  received_at timestamptz not null default now()
);

-- indexes
create index if not exists idx_repos_installation on repos(installation_id);
create index if not exists idx_snapshots_repo_created on ticket_index_snapshots(repo_id, created_at desc);
create index if not exists idx_pr_cache_repo on pr_cache(repo_id);
create index if not exists idx_webhook_deliveries_received on webhook_deliveries(received_at);
