import { eq, lte, sql } from "drizzle-orm";
import { db, getDb, schema } from "@/db/client";
import { createOpaqueToken } from "@/lib/security/cookies";

const REQUIRED_COLUMNS = [
  "id",
  "user_id",
  "github_login",
  "access_token_encrypted",
  "expires_at",
  "last_seen_at",
  "created_at",
  "updated_at",
] as const;

const REQUIRED_INDEXES = ["auth_sessions_user_idx", "auth_sessions_expires_idx"] as const;

export interface AuthSessionHealthReport {
  ok: boolean;
  checkedAt: string;
  schema: {
    tableExists: boolean;
    missingColumns: string[];
    missingIndexes: string[];
    hasPrimaryKey: boolean;
    hasExpiryCheckConstraint: boolean;
  };
  roundtrip: {
    attempted: boolean;
    inserted: boolean;
    readBack: boolean;
    deleted: boolean;
  };
  repair: {
    dryRun: boolean;
    expiredSessionsFound: number;
    expiredSessionsRemoved: number;
  };
}

export async function runAuthSessionHealthProbe(input?: { includeRoundtrip?: boolean }): Promise<AuthSessionHealthReport> {
  const includeRoundtrip = input?.includeRoundtrip !== false;

  const columnsRows = await getDb().execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_sessions'
  `);
  const columnNames = new Set(columnsRows.rows.map((row) => String((row as { column_name: string }).column_name)));
  const tableExists = columnNames.size > 0;

  const missingColumns = REQUIRED_COLUMNS.filter((name) => !columnNames.has(name));

  const indexRows = await getDb().execute(sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'auth_sessions'
  `);
  const indexNames = new Set(indexRows.rows.map((row) => String((row as { indexname: string }).indexname)));
  const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexNames.has(name));

  const pkRows = await getDb().execute(sql`
    select count(*)::int as count
    from pg_constraint
    where conrelid = 'public.auth_sessions'::regclass
      and contype = 'p'
  `);
  const hasPrimaryKey = Number((pkRows.rows[0] as { count: number } | undefined)?.count ?? 0) > 0;

  const constraintRows = await getDb().execute(sql`
    select count(*)::int as count
    from pg_constraint
    where conrelid = 'public.auth_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%expires_at%'
  `);
  const hasExpiryCheckConstraint = Number((constraintRows.rows[0] as { count: number } | undefined)?.count ?? 0) > 0;

  const roundtrip = {
    attempted: includeRoundtrip,
    inserted: false,
    readBack: false,
    deleted: false,
  };

  if (includeRoundtrip && tableExists && missingColumns.length === 0) {
    const probeId = `probe_${createOpaqueToken(18)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await getDb().transaction(async (tx) => {
      await tx.insert(schema.authSessions).values({
        id: probeId,
        userId: "auth_probe",
        githubLogin: "auth-probe",
        accessTokenEncrypted: "probe-redacted-token",
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      roundtrip.inserted = true;

      const row = await tx.query.authSessions.findFirst({
        where: eq(schema.authSessions.id, probeId),
      });
      roundtrip.readBack = Boolean(row?.id === probeId);

      await tx.delete(schema.authSessions).where(eq(schema.authSessions.id, probeId));
      roundtrip.deleted = true;
    });
  }

  const ok =
    tableExists &&
    missingColumns.length === 0 &&
    missingIndexes.length === 0 &&
    hasPrimaryKey &&
    (!includeRoundtrip || (roundtrip.inserted && roundtrip.readBack && roundtrip.deleted));

  return {
    ok,
    checkedAt: new Date().toISOString(),
    schema: {
      tableExists,
      missingColumns: [...missingColumns],
      missingIndexes: [...missingIndexes],
      hasPrimaryKey,
      hasExpiryCheckConstraint,
    },
    roundtrip,
    repair: {
      dryRun: true,
      expiredSessionsFound: 0,
      expiredSessionsRemoved: 0,
    },
  };
}

export async function repairExpiredAuthSessions(input?: { dryRun?: boolean }): Promise<AuthSessionHealthReport["repair"]> {
  const dryRun = input?.dryRun !== false;
  const now = new Date();

  const expiredRows = await db.query.authSessions.findMany({
    where: lte(schema.authSessions.expiresAt, now),
  });

  let removed = 0;
  if (!dryRun && expiredRows.length > 0) {
    await db.delete(schema.authSessions).where(lte(schema.authSessions.expiresAt, now));
    removed = expiredRows.length;
  }

  return {
    dryRun,
    expiredSessionsFound: expiredRows.length,
    expiredSessionsRemoved: removed,
  };
}
