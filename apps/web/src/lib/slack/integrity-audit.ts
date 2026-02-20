import type { SlackChannelConfig } from "@/lib/services/slack-notifications-service";

export type SlackChannelAuditSeverity = "error" | "warn";

export type SlackChannelAuditCode =
  | "invalid_scope"
  | "portfolio_scope_has_repo_name"
  | "duplicate_portfolio_scope"
  | "repo_scope_missing_repo_name"
  | "repo_scope_malformed_repo_name"
  | "duplicate_repo_scope_target"
  | "orphan_repo_name"
  | "repo_scope_repo_not_enabled";

export interface SlackChannelAuditIssue {
  severity: SlackChannelAuditSeverity;
  code: SlackChannelAuditCode;
  message: string;
  scope: string;
  channelId: string;
  repoFullName: string | null;
  index: number;
}

export interface SlackChannelIntegrityAuditReport {
  generatedAt: string;
  summary: {
    totalConfigs: number;
    portfolioConfigs: number;
    repoConfigs: number;
    issueCount: number;
    errorCount: number;
    warnCount: number;
    orphanRepoNames: string[];
    disabledRepoNames: string[];
  };
  issues: SlackChannelAuditIssue[];
}

export interface SlackChannelAuditInput {
  channels: SlackChannelConfig[];
  accessibleRepoFullNames: string[];
  enabledRepoFullNames: string[];
  now?: Date;
}

const REPO_FULL_NAME_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;

export function normalizeRepoFullName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isValidRepoFullName(value: string): boolean {
  return REPO_FULL_NAME_PATTERN.test(value);
}

export function auditSlackChannelConfigs(input: SlackChannelAuditInput): SlackChannelIntegrityAuditReport {
  const normalizedAccessible = new Set(input.accessibleRepoFullNames.map((repo) => repo.toLowerCase()));
  const normalizedEnabled = new Set(input.enabledRepoFullNames.map((repo) => repo.toLowerCase()));

  const issues: SlackChannelAuditIssue[] = [];
  const repoTargets = new Map<string, number>();
  const portfolioIndexes: number[] = [];
  let portfolioConfigs = 0;
  let repoConfigs = 0;

  for (const [index, channel] of input.channels.entries()) {
    const scope = channel.scope;
    const repoFullName = normalizeRepoFullName(channel.repoFullName);

    if (scope === "portfolio") {
      portfolioConfigs += 1;
      portfolioIndexes.push(index);

      if (repoFullName) {
        issues.push({
          severity: "error",
          code: "portfolio_scope_has_repo_name",
          message: "portfolio scope config must not set repoFullName",
          scope,
          channelId: channel.channelId,
          repoFullName: channel.repoFullName,
          index,
        });
      }
      continue;
    }

    if (scope !== "repo") {
      issues.push({
        severity: "error",
        code: "invalid_scope",
        message: "scope must be either portfolio or repo",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
      continue;
    }

    repoConfigs += 1;
    if (!repoFullName) {
      issues.push({
        severity: "error",
        code: "repo_scope_missing_repo_name",
        message: "repo scope config requires repoFullName",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
      continue;
    }

    if (!isValidRepoFullName(repoFullName)) {
      issues.push({
        severity: "error",
        code: "repo_scope_malformed_repo_name",
        message: "repoFullName must be owner/repo using [a-z0-9_.-]",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
      continue;
    }

    if (repoTargets.has(repoFullName)) {
      issues.push({
        severity: "error",
        code: "duplicate_repo_scope_target",
        message: "duplicate repo scope config for same repoFullName",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
    } else {
      repoTargets.set(repoFullName, index);
    }

    if (!normalizedAccessible.has(repoFullName)) {
      issues.push({
        severity: "error",
        code: "orphan_repo_name",
        message: "repo scope config references repo not accessible by user",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
      continue;
    }

    if (!normalizedEnabled.has(repoFullName)) {
      issues.push({
        severity: "warn",
        code: "repo_scope_repo_not_enabled",
        message: "repo scope config references repo that is accessible but not enabled",
        scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
    }
  }

  if (portfolioIndexes.length > 1) {
    for (const index of portfolioIndexes.slice(1)) {
      const channel = input.channels[index];
      issues.push({
        severity: "error",
        code: "duplicate_portfolio_scope",
        message: "only one portfolio scope channel config is allowed",
        scope: channel.scope,
        channelId: channel.channelId,
        repoFullName: channel.repoFullName,
        index,
      });
    }
  }

  const orphanRepoNames = Array.from(
    new Set(
      issues
        .filter((issue) => issue.code === "orphan_repo_name")
        .map((issue) => normalizeRepoFullName(issue.repoFullName))
        .filter((name): name is string => !!name),
    ),
  );

  const disabledRepoNames = Array.from(
    new Set(
      issues
        .filter((issue) => issue.code === "repo_scope_repo_not_enabled")
        .map((issue) => normalizeRepoFullName(issue.repoFullName))
        .filter((name): name is string => !!name),
    ),
  );

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    summary: {
      totalConfigs: input.channels.length,
      portfolioConfigs,
      repoConfigs,
      issueCount: issues.length,
      errorCount,
      warnCount,
      orphanRepoNames,
      disabledRepoNames,
    },
    issues,
  };
}
