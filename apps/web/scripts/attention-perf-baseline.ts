import { neon } from "@neondatabase/serverless";
import { summarizeExplainPlan } from "../src/lib/perf/explain-plan";

type PlanRow = { "QUERY PLAN": string };

function toPlanLines(rows: unknown[]): string[] {
  return (rows as PlanRow[]).map((row) => row["QUERY PLAN"]);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }
  const sql = neon(process.env.DATABASE_URL);

  const userId = process.env.ATTENTION_PERF_USER_ID
    ?? (await sql`
      select user_id
      from user_installations
      group by user_id
      order by count(*) desc, user_id asc
      limit 1
    `)[0]?.user_id;

  if (!userId) {
    throw new Error("No user_installations rows found. Set ATTENTION_PERF_USER_ID explicitly.");
  }

  const installs = await sql`select installation_id from user_installations where user_id = ${userId}`;
  const installationIds = installs.map((row) => row.installation_id);
  if (installationIds.length === 0) {
    throw new Error(`No installation IDs found for user ${userId}`);
  }

  const repos = await sql`select full_name from repos where enabled = true and installation_id = any(${installationIds})`;
  const repoFullNames = repos.map((row) => row.full_name);
  if (repoFullNames.length === 0) {
    throw new Error(`No enabled repos found for user ${userId}`);
  }

  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const planQueries: Array<{ name: string; rows: unknown[] }> = [
    {
      name: "repos_enabled",
      rows: await sql`explain (analyze, buffers, format text)
        select * from repos
        where enabled = true and installation_id = any(${installationIds})
      `,
    },
    {
      name: "tickets_old_all_by_repo",
      rows: await sql`explain (analyze, buffers, format text)
        select * from tickets
        where repo_full_name = any(${repoFullNames})
      `,
    },
    {
      name: "tickets_new_attention_prefilter",
      rows: await sql`explain (analyze, buffers, format text)
        select t.*
        from tickets t
        where t.repo_full_name = any(${repoFullNames})
          and (
            t.state = 'blocked'
            or (t.state = 'in_progress' and t.cached_at < ${staleThreshold}::timestamptz)
            or exists (
              select 1 from pending_changes pc
              where pc.repo_full_name = t.repo_full_name
                and pc.ticket_id = t.id
                and pc.status <> 'merged'
                and pc.status <> 'closed'
            )
            or exists (
              select 1 from ticket_prs tp
              where tp.repo_full_name = t.repo_full_name
                and tp.ticket_id = t.id
                and tp.state = 'open'
                and coalesce(tp.merged, false) = false
            )
            or exists (
              select 1 from ticket_prs tp
              where tp.repo_full_name = t.repo_full_name
                and tp.ticket_id = t.id
                and tp.checks_state = 'fail'
            )
          )
      `,
    },
    {
      name: "ticket_prs_old_all_by_repo",
      rows: await sql`explain (analyze, buffers, format text)
        select * from ticket_prs
        where repo_full_name = any(${repoFullNames})
      `,
    },
    {
      name: "ticket_prs_new_joined_attention_only",
      rows: await sql`explain (analyze, buffers, format text)
        select tp.*
        from ticket_prs tp
        where tp.repo_full_name = any(${repoFullNames})
          and exists (
            select 1
            from tickets t
            where t.repo_full_name = tp.repo_full_name
              and t.id = tp.ticket_id
              and (
                t.state = 'blocked'
                or (t.state = 'in_progress' and t.cached_at < ${staleThreshold}::timestamptz)
                or exists (
                  select 1 from pending_changes pc
                  where pc.repo_full_name = t.repo_full_name
                    and pc.ticket_id = t.id
                    and pc.status <> 'merged'
                    and pc.status <> 'closed'
                )
                or exists (
                  select 1 from ticket_prs tp2
                  where tp2.repo_full_name = t.repo_full_name
                    and tp2.ticket_id = t.id
                    and tp2.state = 'open'
                    and coalesce(tp2.merged, false) = false
                )
                or exists (
                  select 1 from ticket_prs tp3
                  where tp3.repo_full_name = t.repo_full_name
                    and tp3.ticket_id = t.id
                    and tp3.checks_state = 'fail'
                )
              )
          )
      `,
    },
    {
      name: "pending_old_active_by_repo",
      rows: await sql`explain (analyze, buffers, format text)
        select * from pending_changes
        where repo_full_name = any(${repoFullNames})
          and status <> 'merged'
          and status <> 'closed'
      `,
    },
    {
      name: "pending_new_active_joined_attention_only",
      rows: await sql`explain (analyze, buffers, format text)
        select pc.*
        from pending_changes pc
        where pc.repo_full_name = any(${repoFullNames})
          and pc.status <> 'merged'
          and pc.status <> 'closed'
          and exists (
            select 1
            from tickets t
            where t.repo_full_name = pc.repo_full_name
              and t.id = pc.ticket_id
              and (
                t.state = 'blocked'
                or (t.state = 'in_progress' and t.cached_at < ${staleThreshold}::timestamptz)
                or exists (
                  select 1 from pending_changes pc2
                  where pc2.repo_full_name = t.repo_full_name
                    and pc2.ticket_id = t.id
                    and pc2.status <> 'merged'
                    and pc2.status <> 'closed'
                )
                or exists (
                  select 1 from ticket_prs tp
                  where tp.repo_full_name = t.repo_full_name
                    and tp.ticket_id = t.id
                    and tp.state = 'open'
                    and coalesce(tp.merged, false) = false
                )
                or exists (
                  select 1 from ticket_prs tp2
                  where tp2.repo_full_name = t.repo_full_name
                    and tp2.ticket_id = t.id
                    and tp2.checks_state = 'fail'
                )
              )
          )
      `,
    },
  ];

  console.log(`Attention baseline user: ${userId}`);
  console.log(`Enabled repos: ${repoFullNames.length}`);
  console.log(`Stale threshold: ${staleThreshold}`);
  console.log("");
  console.log("| Query | Exec (ms) | Plan (ms) | Seq | Index | Bitmap |");
  console.log("|---|---:|---:|:---:|:---:|:---:|");

  for (const item of planQueries) {
    const metrics = summarizeExplainPlan(toPlanLines(item.rows));
    console.log(
      `| ${item.name} | ${metrics.executionTimeMs ?? "n/a"} | ${metrics.planningTimeMs ?? "n/a"} | ${metrics.hasSeqScan ? "Y" : "N"} | ${metrics.hasIndexScan ? "Y" : "N"} | ${metrics.hasBitmapScan ? "Y" : "N"} |`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
