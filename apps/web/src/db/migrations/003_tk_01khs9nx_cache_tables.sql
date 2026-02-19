-- TK-01KHS9NX: webhook-derived cache alignment

alter table repos add column if not exists head_sha text;
alter table repos add column if not exists webhook_synced_at timestamptz;

alter table tickets add column if not exists head_sha text;

create table if not exists ticket_prs (
  repo_full_name text not null,
  ticket_id text not null,
  pr_number int not null,
  pr_url text not null,
  title text,
  state text,
  merged boolean,
  mergeable_state text,
  head_ref text,
  head_sha text,
  checks_state text not null default 'unknown', -- pass|fail|running|unknown
  updated_at timestamptz not null default now(),
  primary key (repo_full_name, ticket_id, pr_number)
);

create index if not exists idx_ticket_prs_repo_ticket on ticket_prs(repo_full_name, ticket_id);
create index if not exists idx_ticket_prs_repo_pr on ticket_prs(repo_full_name, pr_number);
