import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getAppInstallUrl } from "@/lib/github-app";
import { getSession } from "@/lib/auth";

export type ConnectionFailureReasonCode =
  | "AUTH_REQUIRED"
  | "OAUTH_TOKEN_MISSING"
  | "USER_RECORD_MISSING"
  | "GITHUB_APP_NOT_INSTALLED"
  | "INSTALLATION_STATE_STALE"
  | "REPO_NOT_ENABLED"
  | "INSTALLATION_REPO_MISMATCH";

export interface ConnectionState {
  ok: boolean;
  reasonCode: ConnectionFailureReasonCode | null;
  status: "ready" | "action_required";
  authenticated: boolean;
  oauthConnected: boolean;
  githubAppInstalled: boolean;
  installationCount: number;
  enabledRepoCount: number;
  staleInstallationLinkCount: number;
  mismatchRepoCount: number;
  installUrl: string;
}

export async function getConnectionState(): Promise<ConnectionState> {
  const session = await getSession();
  if (!session?.userId) {
    return {
      ok: false,
      reasonCode: "AUTH_REQUIRED",
      status: "action_required",
      authenticated: false,
      oauthConnected: false,
      githubAppInstalled: false,
      installationCount: 0,
      enabledRepoCount: 0,
      staleInstallationLinkCount: 0,
      mismatchRepoCount: 0,
      installUrl: getAppInstallUrl(),
    };
  }

  if (!session.token) {
    return {
      ok: false,
      reasonCode: "OAUTH_TOKEN_MISSING",
      status: "action_required",
      authenticated: true,
      oauthConnected: false,
      githubAppInstalled: false,
      installationCount: 0,
      enabledRepoCount: 0,
      staleInstallationLinkCount: 0,
      mismatchRepoCount: 0,
      installUrl: getAppInstallUrl(),
    };
  }

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) });
  if (!user) {
    return {
      ok: false,
      reasonCode: "USER_RECORD_MISSING",
      status: "action_required",
      authenticated: true,
      oauthConnected: true,
      githubAppInstalled: false,
      installationCount: 0,
      enabledRepoCount: 0,
      staleInstallationLinkCount: 0,
      mismatchRepoCount: 0,
      installUrl: getAppInstallUrl(),
    };
  }

  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, session.userId),
  });

  if (userInstallations.length === 0) {
    return {
      ok: false,
      reasonCode: "GITHUB_APP_NOT_INSTALLED",
      status: "action_required",
      authenticated: true,
      oauthConnected: true,
      githubAppInstalled: false,
      installationCount: 0,
      enabledRepoCount: 0,
      staleInstallationLinkCount: 0,
      mismatchRepoCount: 0,
      installUrl: getAppInstallUrl(),
    };
  }

  const installationIds = userInstallations.map((row) => row.installationId);
  const installations = await db.query.installations.findMany({
    where: inArray(schema.installations.id, installationIds),
  });
  const staleInstallationLinkCount = Math.max(0, installationIds.length - installations.length);

  const enabledLinkedRepos = await db.query.repos.findMany({
    where: and(
      eq(schema.repos.enabled, true),
      inArray(schema.repos.installationId, installationIds),
    ),
  });

  const mismatchRepos = await db.query.repos.findMany({
    where: and(
      eq(schema.repos.enabled, true),
      eq(schema.repos.owner, user.githubLogin),
      isNull(schema.repos.installationId),
    ),
  });

  const mismatchRepoCount = mismatchRepos.length;

  if (staleInstallationLinkCount > 0) {
    return {
      ok: false,
      reasonCode: "INSTALLATION_STATE_STALE",
      status: "action_required",
      authenticated: true,
      oauthConnected: true,
      githubAppInstalled: installations.length > 0,
      installationCount: installations.length,
      enabledRepoCount: enabledLinkedRepos.length,
      staleInstallationLinkCount,
      mismatchRepoCount,
      installUrl: getAppInstallUrl(),
    };
  }

  if (enabledLinkedRepos.length === 0) {
    return {
      ok: false,
      reasonCode: mismatchRepoCount > 0 ? "INSTALLATION_REPO_MISMATCH" : "REPO_NOT_ENABLED",
      status: "action_required",
      authenticated: true,
      oauthConnected: true,
      githubAppInstalled: installations.length > 0,
      installationCount: installations.length,
      enabledRepoCount: 0,
      staleInstallationLinkCount,
      mismatchRepoCount,
      installUrl: getAppInstallUrl(),
    };
  }

  return {
    ok: true,
    reasonCode: null,
    status: "ready",
    authenticated: true,
    oauthConnected: true,
    githubAppInstalled: true,
    installationCount: installations.length,
    enabledRepoCount: enabledLinkedRepos.length,
    staleInstallationLinkCount,
    mismatchRepoCount,
    installUrl: getAppInstallUrl(),
  };
}
