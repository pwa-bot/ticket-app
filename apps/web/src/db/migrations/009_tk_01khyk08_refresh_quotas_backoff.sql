-- TK-01KHYK08-3: refresh endpoint quotas + retry backoff scheduling

alter table if exists manual_refresh_jobs
  add column if not exists next_attempt_at timestamptz;

update manual_refresh_jobs
set next_attempt_at = created_at
where next_attempt_at is null;

alter table manual_refresh_jobs
  alter column next_attempt_at set default now();

create index if not exists manual_refresh_jobs_queued_next_attempt_idx
  on manual_refresh_jobs(status, next_attempt_at, created_at);

create index if not exists manual_refresh_jobs_user_created_idx
  on manual_refresh_jobs(requested_by_user_id, created_at);
