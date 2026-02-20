-- TK-01KHT40S-2: Slack integration v1

create table if not exists slack_workspaces (
  id serial primary key,
  user_id text not null,
  team_id text not null,
  team_name text not null,
  bot_user_id text,
  bot_token_encrypted text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists slack_workspaces_user_uidx on slack_workspaces(user_id);
create index if not exists slack_workspaces_team_idx on slack_workspaces(team_id);

create table if not exists slack_notification_channels (
  id serial primary key,
  user_id text not null,
  scope text not null, -- portfolio|repo
  repo_full_name text,
  channel_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists slack_notification_channels_user_scope_repo_uidx
  on slack_notification_channels(user_id, scope, repo_full_name);
create index if not exists slack_notification_channels_user_idx
  on slack_notification_channels(user_id);

create table if not exists slack_notification_events (
  id serial primary key,
  user_id text not null,
  team_id text not null,
  channel_id text not null,
  event_type text not null, -- digest|review_reminder
  dedupe_key text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists slack_notification_events_dedupe_uidx
  on slack_notification_events(dedupe_key);
create index if not exists slack_notification_events_channel_sent_idx
  on slack_notification_events(channel_id, sent_at);
create index if not exists slack_notification_events_user_sent_idx
  on slack_notification_events(user_id, sent_at);
