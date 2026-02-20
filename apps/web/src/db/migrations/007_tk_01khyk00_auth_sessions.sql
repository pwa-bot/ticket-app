-- TK-01KHYK00: replace client-stored GitHub token with opaque server session

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null,
  github_login text not null,
  access_token_encrypted text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx
  on auth_sessions(user_id);

create index if not exists auth_sessions_expires_idx
  on auth_sessions(expires_at);
