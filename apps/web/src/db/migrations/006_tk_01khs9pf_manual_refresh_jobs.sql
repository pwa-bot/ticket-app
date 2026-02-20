-- TK-01KHS9PF-3: manual refresh endpoint + background job queue

create table if not exists manual_refresh_jobs (
  id text primary key,
  repo_id text not null,
  repo_full_name text not null,
  requested_by_user_id text not null,
  force boolean not null default true,
  status text not null default 'queued', -- queued|running|succeeded|failed
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_refresh_jobs_repo_status_created_idx
  on manual_refresh_jobs(repo_id, status, created_at);

create index if not exists manual_refresh_jobs_status_created_idx
  on manual_refresh_jobs(status, created_at);
