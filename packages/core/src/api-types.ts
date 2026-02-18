import type { TicketErrorCode } from "./errors.js";

/**
 * API error codes extend TicketErrorCode with additional HTTP-level errors
 */
export type ApiErrorCode =
  | TicketErrorCode
  | "not_git_repo"
  | "not_initialized"
  | "github_permission_denied"
  | "branch_create_failed"
  | "commit_failed"
  | "pr_create_failed"
  | "unknown";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: ApiError; warnings?: string[] };

// PR Status types
export type PendingChangeStatus =
  | "creating_pr"
  | "pending_checks"
  | "waiting_review"
  | "mergeable"
  | "auto_merge_enabled"
  | "merged"
  | "conflict"
  | "failed";

export type CiStatusSummary = "pass" | "fail" | "running" | "unknown";

export type CreateChangePrResponse = {
  pr_url: string;
  pr_number: number;
  branch: string;
  status: PendingChangeStatus;
};

export type PrStatusResponse = {
  pr_url: string;
  pr_number: number;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string | null;
  checks: {
    state: CiStatusSummary;
  };
  reviews: {
    required: boolean;
    required_reviewers?: string[];
    approvals_count?: number;
  };
};

// UI Data Models
export type PendingChangeType = "state_change" | "metadata_change";

export type MergeSignals = {
  ciStatus: CiStatusSummary;
  reviewRequired: boolean;
  requiredReviewers?: string[];
  approvalsCount?: number;
  blockReason?: string;
};

export type PendingChange = {
  type: PendingChangeType;
  summary: string;
  prUrl: string;
  prNumber: number;
  status: PendingChangeStatus;
  error?: { code: string; message: string };
  createdAt: string;
  mergeSignals?: MergeSignals;
};
