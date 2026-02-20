# Attention Endpoint Perf Baselines (TK-01KHW6EY)

Date: 2026-02-19
Env: `apps/web/.env.local` Neon database

## Baseline (Before Changes)

Captured with `EXPLAIN (ANALYZE, BUFFERS)` on the original attention route query shapes:

| Query | Execution Time |
|---|---:|
| `user_installations by user_id` | 0.044 ms |
| `repos enabled by installation_ids` | 0.031 ms |
| `tickets by repo_full_name` | 0.040 ms |
| `ticket_prs by repo_full_name` | 0.037 ms |
| `pending_changes active by repo_full_name` | 0.039 ms |

Observed plan notes:
- `repos` and `tickets` used seq scans on a very small dataset.
- `ticket_prs` and `pending_changes` already used indexes.

## Post-Change Baseline

Captured with `pnpm --filter @ticket-app/web perf:attention-baseline` after applying migration `005_tk_01khw6ey_attention_indexes.sql`.

| Query | Exec (ms) | Seq | Index |
|---|---:|:---:|:---:|
| `repos_enabled` | 0.029 | Y | N |
| `tickets_old_all_by_repo` | 0.054 | Y | N |
| `tickets_new_attention_prefilter` | 0.072 | Y | Y |
| `ticket_prs_old_all_by_repo` | 0.037 | N | Y |
| `ticket_prs_new_joined_attention_only` | 0.071 | Y | Y |
| `pending_old_active_by_repo` | 0.035 | N | Y |
| `pending_new_active_joined_attention_only` | 0.110 | Y | Y |

Notes:
- This environment currently has low row counts and `attention_ticket_count = 0`, so absolute timings are dominated by planning overhead.
- The tuned route now avoids loading all PR/pending rows when no tickets qualify, and index-backed `EXISTS` probes are available for larger datasets.
- Query-plan validation is now scriptable (`apps/web/scripts/attention-perf-baseline.ts`) and parser-tested (`src/lib/perf/explain-plan.test.ts`).
