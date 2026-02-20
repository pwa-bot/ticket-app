-- TK-01KHW6EY: attention endpoint query/index tuning

-- Enabled repos lookup by installation IDs
create index if not exists repos_enabled_installation_idx
  on repos (installation_id)
  where enabled = true;

-- Attention candidate filtering from tickets table
create index if not exists tickets_repo_state_cached_idx
  on tickets (repo_full_name, state, cached_at);

-- Fast EXISTS probes for attention PR conditions
create index if not exists ticket_prs_open_ticket_idx
  on ticket_prs (repo_full_name, ticket_id)
  where state = 'open' and coalesce(merged, false) = false;

create index if not exists ticket_prs_failing_checks_ticket_idx
  on ticket_prs (repo_full_name, ticket_id)
  where checks_state = 'fail';

-- Fast EXISTS probes for pending-change conditions
create index if not exists pending_changes_active_ticket_idx
  on pending_changes (repo_full_name, ticket_id)
  where status <> 'merged' and status <> 'closed';

create index if not exists pending_changes_waiting_review_pr_idx
  on pending_changes (repo_full_name, pr_number)
  where status = 'waiting_review';
