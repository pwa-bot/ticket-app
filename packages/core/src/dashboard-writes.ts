/**
 * Dashboard Write Actions - Types and Interfaces
 * PR-based ticket changes from dashboard
 */

import type { Actor, Priority, TicketState } from './index.js';

// ---------------------------------------------------------------------------
// Patch Types
// ---------------------------------------------------------------------------

export type TicketChangePatch = {
  state?: TicketState;
  priority?: Priority;
  // Label patch modes (use one style per request)
  labels_add?: string[];
  labels_remove?: string[];
  labels_replace?: string[];
  clear_labels?: boolean;
  assignee?: Actor | null;
  reviewer?: Actor | null;
  // Optional title edit (affects branch slug - use carefully)
  title?: string;
};

// ---------------------------------------------------------------------------
// API Error Types
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'not_git_repo'
  | 'not_initialized'
  | 'ticket_not_found'
  | 'ambiguous_id'
  | 'index_missing'
  | 'index_invalid_format'
  | 'index_missing_ticket_entry'
  | 'frontmatter_missing'
  | 'frontmatter_invalid_yaml'
  | 'frontmatter_invalid_required_fields'
  | 'invalid_transition'
  | 'invalid_state'
  | 'invalid_priority'
  | 'invalid_labels_patch'
  | 'invalid_label'
  | 'invalid_actor'
  | 'github_permission_denied'
  | 'branch_create_failed'
  | 'commit_failed'
  | 'pr_create_failed'
  | 'unknown';

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: ApiError; warnings?: string[] };

// ---------------------------------------------------------------------------
// PR Status Types
// ---------------------------------------------------------------------------

export type PendingChangeStatus =
  | 'creating_pr'
  | 'pending_checks'
  | 'waiting_review'
  | 'mergeable'
  | 'auto_merge_enabled'
  | 'merged'
  | 'conflict'
  | 'failed';

export type CiStatusSummary = 'pass' | 'fail' | 'running' | 'unknown';

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

// ---------------------------------------------------------------------------
// UI Data Models
// ---------------------------------------------------------------------------

export type PendingChangeType = 'state_change' | 'metadata_change';

export type MergeSignals = {
  ciStatus: CiStatusSummary;
  reviewRequired: boolean;
  requiredReviewers?: string[];
  approvalsCount?: number;
  blockReason?: string;
};

export type PendingChange = {
  type: PendingChangeType;
  summary: string; // e.g., "ready → in_progress"
  prUrl: string;
  prNumber: number;
  status: PendingChangeStatus;
  error?: { code: string; message: string };
  createdAt: string; // ISO 8601
  mergeSignals?: MergeSignals;
};

// ---------------------------------------------------------------------------
// Frontmatter Patch Algorithm Types
// ---------------------------------------------------------------------------

export type FrontmatterPatchResult =
  | { ok: true; content: string }
  | { ok: false; error: ApiError };

export type IndexPatchResult =
  | { ok: true; content: string }
  | { ok: false; error: ApiError };

// ---------------------------------------------------------------------------
// State Ordering (for deterministic sorting)
// ---------------------------------------------------------------------------

export const STATE_ORDER: Record<TicketState, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  blocked: 3,
  done: 4,
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

// ---------------------------------------------------------------------------
// Known frontmatter keys (for stable serialization order)
// ---------------------------------------------------------------------------

export const FRONTMATTER_KEY_ORDER = [
  'id',
  'title',
  'state',
  'priority',
  'labels',
  'assignee',
  'reviewer',
  'x_ticket',
] as const;
