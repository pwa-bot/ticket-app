import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { computeSyncHealth } from "@/lib/sync-health";
import type { ConnectionFailureReasonCode } from "@/lib/connection-state";

export type RepoIssueReasonCode =
  | "REPO_INSTALLATION_NULL"
  | "REPO_INSTALLATION_MISSING"
  | "OWNER_MATCHED_INSTALLATION_RELINKED"
  | "NO_MATCHING_INSTALLATION_FOR_OWNER"
  | "MULTIPLE_MATCHING_INSTALLATIONS"
  | "INSTALLATION_NOT_LINKED_TO_USER";

export interface ConnectionDiagnosticSnapshot {
  session: {
    userId: string | null;
    githubLogin: string | null;
    oauthTokenPresent: boolean;
  };
  user: {
    exists: boolean;
  };
  linkedInstallations: {
    totalLinks: number;
    validCount: number;
    staleLinkCount: number;
    ids: number[];
    githubInstallationIds: number[];
    accounts: Array<{ id: number; githubInstallationId: number; accountLogin: string; accountType: string }>;
  };
  enabledRepos: {
    totalEnabled: number;
    linkedCount: number;
    nullInstallationCount: number;
    missingInstallationCount: number;
    mismatchCount: number;
    unresolved: Array<{ fullName: string; owner: string; repo: string; reasonCode: RepoIssueReasonCode; detail?: string }>;
  };
  counts: {
    staleUserInstallationLinks: number;
    enabledRepoMismatch: number;
  };
  syncHealthSummary: {
    total: number;
    healthy: number;
    stale: number;
    error: number;
    syncing: number;
    neverSynced: number;
    staleThresholdMs: number;
  };
  connection: {
    ok: boolean;
    reasonCode: ConnectionFailureReasonCode | null;
    status: "ready" | "action_required";
  };
}

export interface RepairResult {
  removedStaleUserInstallationLinks: Array<{ userId: string; installationId: number }>;
  relinkedRepos: Array<{ fullName: string; fromInstallationId: number | null; toInstallationId: number; reasonCode: "OWNER_MATCHED_INSTALLATION_RELINKED" }>;
  unresolvedRepos: Array<{ fullName: string; owner: string; repo: string; reasonCode: RepoIssueReasonCode; detail?: string }>;
}

function summarizeConnection(snapshot: ConnectionDiagnosticSnapshot): ConnectionDiagnosticSnapshot["connection"] {
  const { session, user, linkedInstallations, enabledRepos } = snapshot;

  if (!session.userId) return { ok: false, reasonCode: "AUTH_REQUIRED", status: "action_required" };
  if (!session.oauthTokenPresent) return { ok: false, reasonCode: "OAUTH_TOKEN_MISSING", status: "action_required" };
  if (!user.exists) return { ok: false, reasonCode: "USER_RECORD_MISSING", status: "action_required" };
  if (linkedInstallations.validCount === 0) return { ok: false, reasonCode: "GITHUB_APP_NOT_INSTALLED", status: "action_required" };
  if (linkedInstallations.staleLinkCount > 0) return { ok: false, reasonCode: "INSTALLATION_STATE_STALE", status: "action_required" };
  if (enabledRepos.linkedCount === 0 && enabledRepos.mismatchCount > 0) {
    return { ok: false, reasonCode: "INSTALLATION_REPO_MISMATCH", status: "action_required" };
  }
  if (enabledRepos.linkedCount === 0) return { ok: false, reasonCode: "REPO_NOT_ENABLED", status: "action_required" };

  return { ok: true, reasonCode: null, status: "ready" };
}

export async function getConnectionDiagnosticSnapshot(input: {
  userId: string | null;
  githubLogin: string | null;
  oauthTokenPresent: boolean;
}): Promise<ConnectionDiagnosticSnapshot> {
  const defaultHealth = computeSyncHealth({}, { nowMs: Date.now() });

  if (!input.userId) {
    const base: ConnectionDiagnosticSnapshot = {
      session: {
        userId: null,
        githubLogin: input.githubLogin,
        oauthTokenPresent: input.oauthTokenPresent,
      },
      user: { exists: false },
      linkedInstallations: {
        totalLinks: 0,
        validCount: 0,
        staleLinkCount: 0,
        ids: [],
        githubInstallationIds: [],
        accounts: [],
      },
      enabledRepos: {
        totalEnabled: 0,
        linkedCount: 0,
        nullInstallationCount: 0,
        missingInstallationCount: 0,
        mismatchCount: 0,
        unresolved: [],
      },
      counts: {
        staleUserInstallationLinks: 0,
        enabledRepoMismatch: 0,
      },
      syncHealthSummary: {
        total: 0,
        healthy: 0,
        stale: 0,
        error: 0,
        syncing: 0,
        neverSynced: 0,
        staleThresholdMs: defaultHealth.staleAfterMs,
      },
      connection: { ok: false, reasonCode: "AUTH_REQUIRED", status: "action_required" },
    };

    return base;
  }

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, input.userId) });

  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, input.userId),
  });
  const linkIds = userInstallations.map((row) => row.installationId);

  const installations = linkIds.length
    ? await db.query.installations.findMany({ where: inArray(schema.installations.id, linkIds) })
    : [];

  const validInstallationIdSet = new Set(installations.map((inst) => inst.id));
  const staleLinks = userInstallations.filter((row) => !validInstallationIdSet.has(row.installationId));

  const enabledRepos = await db.query.repos.findMany({
    where: and(eq(schema.repos.enabled, true), eq(schema.repos.owner, user?.githubLogin ?? "__missing_user__")),
  });

  const linkedEnabledRepos = enabledRepos.filter((repo) => repo.installationId !== null && validInstallationIdSet.has(repo.installationId));
  const nullInstallationRepos = enabledRepos.filter((repo) => repo.installationId === null);
  const missingInstallationRepos = enabledRepos.filter((repo) => repo.installationId !== null && !validInstallationIdSet.has(repo.installationId));

  const unresolved: ConnectionDiagnosticSnapshot["enabledRepos"]["unresolved"] = [
    ...nullInstallationRepos.map((repo) => ({
      fullName: repo.fullName,
      owner: repo.owner,
      repo: repo.repo,
      reasonCode: "REPO_INSTALLATION_NULL" as const,
      detail: "Enabled repo has null installation_id.",
    })),
    ...missingInstallationRepos.map((repo) => ({
      fullName: repo.fullName,
      owner: repo.owner,
      repo: repo.repo,
      reasonCode: "REPO_INSTALLATION_MISSING" as const,
      detail: `Enabled repo points to missing installation_id=${String(repo.installationId)}.`,
    })),
  ];

  const syncSummary = enabledRepos.reduce(
    (acc, repo) => {
      const health = computeSyncHealth(
        {
          syncStatus: repo.syncStatus,
          syncError: repo.syncError,
          lastSyncedAt: repo.lastSyncedAt,
        },
        { nowMs: Date.now() },
      );
      acc.total += 1;
      if (health.state === "healthy") acc.healthy += 1;
      if (health.state === "stale") acc.stale += 1;
      if (health.state === "error") acc.error += 1;
      if (health.state === "syncing") acc.syncing += 1;
      if (health.state === "never_synced") acc.neverSynced += 1;
      return acc;
    },
    {
      total: 0,
      healthy: 0,
      stale: 0,
      error: 0,
      syncing: 0,
      neverSynced: 0,
      staleThresholdMs: defaultHealth.staleAfterMs,
    },
  );

  const snapshot: ConnectionDiagnosticSnapshot = {
    session: {
      userId: input.userId,
      githubLogin: input.githubLogin,
      oauthTokenPresent: input.oauthTokenPresent,
    },
    user: { exists: Boolean(user) },
    linkedInstallations: {
      totalLinks: userInstallations.length,
      validCount: installations.length,
      staleLinkCount: staleLinks.length,
      ids: installations.map((inst) => inst.id),
      githubInstallationIds: installations.map((inst) => inst.githubInstallationId),
      accounts: installations.map((inst) => ({
        id: inst.id,
        githubInstallationId: inst.githubInstallationId,
        accountLogin: inst.githubAccountLogin,
        accountType: inst.githubAccountType,
      })),
    },
    enabledRepos: {
      totalEnabled: enabledRepos.length,
      linkedCount: linkedEnabledRepos.length,
      nullInstallationCount: nullInstallationRepos.length,
      missingInstallationCount: missingInstallationRepos.length,
      mismatchCount: unresolved.length,
      unresolved,
    },
    counts: {
      staleUserInstallationLinks: staleLinks.length,
      enabledRepoMismatch: unresolved.length,
    },
    syncHealthSummary: syncSummary,
    connection: { ok: false, reasonCode: null, status: "action_required" },
  };

  snapshot.connection = summarizeConnection(snapshot);
  return snapshot;
}

export async function repairConnectionState(input: { userId: string; dryRun?: boolean }): Promise<RepairResult> {
  const dryRun = input.dryRun ?? false;

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, input.userId) });
  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, input.userId),
  });

  const linkedIds = userInstallations.map((row) => row.installationId);
  const installations = linkedIds.length
    ? await db.query.installations.findMany({ where: inArray(schema.installations.id, linkedIds) })
    : [];
  const validInstallationIds = new Set(installations.map((inst) => inst.id));

  const staleLinks = userInstallations.filter((link) => !validInstallationIds.has(link.installationId));

  if (!dryRun && staleLinks.length > 0) {
    for (const link of staleLinks) {
      await db
        .delete(schema.userInstallations)
        .where(and(eq(schema.userInstallations.userId, link.userId), eq(schema.userInstallations.installationId, link.installationId)));
    }
  }

  const ownerToInstallations = new Map<string, number[]>();
  for (const inst of installations) {
    const key = inst.githubAccountLogin.toLowerCase();
    const list = ownerToInstallations.get(key) ?? [];
    list.push(inst.id);
    ownerToInstallations.set(key, list);
  }

  const enabledRepos = user?.githubLogin
    ? await db.query.repos.findMany({
      where: and(eq(schema.repos.enabled, true), eq(schema.repos.owner, user.githubLogin)),
    })
    : [];

  const relinkedRepos: RepairResult["relinkedRepos"] = [];
  const unresolvedRepos: RepairResult["unresolvedRepos"] = [];

  for (const repo of enabledRepos) {
    const hasValidLink = repo.installationId !== null && validInstallationIds.has(repo.installationId);
    if (hasValidLink) continue;

    const matches = ownerToInstallations.get(repo.owner.toLowerCase()) ?? [];

    if (matches.length === 1) {
      const toInstallationId = matches[0]!;
      relinkedRepos.push({
        fullName: repo.fullName,
        fromInstallationId: repo.installationId,
        toInstallationId,
        reasonCode: "OWNER_MATCHED_INSTALLATION_RELINKED",
      });
      if (!dryRun) {
        await db
          .update(schema.repos)
          .set({ installationId: toInstallationId, updatedAt: new Date() })
          .where(eq(schema.repos.id, repo.id));
      }
      continue;
    }

    if (matches.length > 1) {
      unresolvedRepos.push({
        fullName: repo.fullName,
        owner: repo.owner,
        repo: repo.repo,
        reasonCode: "MULTIPLE_MATCHING_INSTALLATIONS",
        detail: `Owner matched ${matches.length} installations; manual choice required.`,
      });
      continue;
    }

    unresolvedRepos.push({
      fullName: repo.fullName,
      owner: repo.owner,
      repo: repo.repo,
      reasonCode: "NO_MATCHING_INSTALLATION_FOR_OWNER",
      detail: "No linked installation found for repo owner.",
    });
  }

  return {
    removedStaleUserInstallationLinks: staleLinks.map((link) => ({ userId: link.userId, installationId: link.installationId })),
    relinkedRepos,
    unresolvedRepos,
  };
}
