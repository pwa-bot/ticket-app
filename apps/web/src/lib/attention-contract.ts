import type { MergeReadiness } from "@/lib/attention";

export type AttentionReason = "pending_pr" | "pr_waiting_review" | "ci_failing" | "blocked" | "stale_in_progress";

export interface AttentionReasonDetail {
  code: AttentionReason;
  label: string;
  description: string;
  rank: number;
}

export const ATTENTION_REASON_META: Record<AttentionReason, Omit<AttentionReasonDetail, "code">> = {
  blocked: {
    label: "Blocked",
    description: "Ticket state is blocked and needs unblocking work.",
    rank: 0,
  },
  ci_failing: {
    label: "CI failing",
    description: "At least one linked open PR has failing checks.",
    rank: 1,
  },
  stale_in_progress: {
    label: "Stale (>24h)",
    description: "Ticket is in progress and cache data is older than 24 hours.",
    rank: 2,
  },
  pr_waiting_review: {
    label: "Open PR",
    description: "Ticket has an open linked PR that likely needs reviewer attention.",
    rank: 3,
  },
  pending_pr: {
    label: "Pending change",
    description: "A pending ticket-change PR exists and has not merged yet.",
    rank: 4,
  },
};

export function toReasonDetails(reasons: AttentionReason[]): AttentionReasonDetail[] {
  return Array.from(new Set(reasons))
    .map((reason) => ({ code: reason, ...ATTENTION_REASON_META[reason] }))
    .sort((a, b) => a.rank - b.rank);
}

export function getReasonCatalog(): AttentionReasonDetail[] {
  return toReasonDetails(Object.keys(ATTENTION_REASON_META) as AttentionReason[]);
}

interface SortableAttentionItem {
  primaryReason: AttentionReason;
  mergeReadiness: MergeReadiness;
  priority: string;
  createdAt?: string | null;
}

const PRIORITY_ORDER: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const MERGE_READINESS_ORDER: Record<MergeReadiness, number> = {
  CONFLICT: 0,
  FAILING_CHECKS: 1,
  WAITING_REVIEW: 2,
  UNKNOWN: 3,
  MERGEABLE_NOW: 4,
};

export function compareAttentionItems(a: SortableAttentionItem, b: SortableAttentionItem): number {
  const aReason = ATTENTION_REASON_META[a.primaryReason].rank;
  const bReason = ATTENTION_REASON_META[b.primaryReason].rank;
  if (aReason !== bReason) {
    return aReason - bReason;
  }

  const aReadiness = MERGE_READINESS_ORDER[a.mergeReadiness];
  const bReadiness = MERGE_READINESS_ORDER[b.mergeReadiness];
  if (aReadiness !== bReadiness) {
    return aReadiness - bReadiness;
  }

  const aPriority = PRIORITY_ORDER[a.priority] ?? 99;
  const bPriority = PRIORITY_ORDER[b.priority] ?? 99;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
}
