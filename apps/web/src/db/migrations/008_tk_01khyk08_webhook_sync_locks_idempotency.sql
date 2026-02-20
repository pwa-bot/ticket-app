-- TK-01KHYK08: per-repo sync locks + webhook idempotency keys

create table if not exists repo_sync_locks (
  repo_full_name text primary key,
  locked_at timestamptz not null default now()
);

create index if not exists repo_sync_locks_locked_idx
  on repo_sync_locks(locked_at);

create table if not exists webhook_idempotency_keys (
  idempotency_key text primary key,
  event text not null,
  repo_full_name text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_idempotency_keys_repo_created_idx
  on webhook_idempotency_keys(repo_full_name, created_at);

create index if not exists webhook_idempotency_keys_created_idx
  on webhook_idempotency_keys(created_at);
