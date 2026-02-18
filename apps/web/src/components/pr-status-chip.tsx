"use client";

import type { MergeSignals, PendingChangeStatus } from "@ticketdotapp/core";

interface PRStatusChipProps {
  status: PendingChangeStatus;
  prNumber: number;
  prUrl: string;
  mergeSignals?: MergeSignals;
}

export default function PRStatusChip({ status, prNumber, prUrl, mergeSignals }: PRStatusChipProps) {
  const getIcon = () => {
    switch (status) {
      case "creating_pr":
        return "⏳";
      case "pending_checks":
        return mergeSignals?.ciStatus === "running" ? "⏳" : "⏳";
      case "waiting_review":
        return "👤";
      case "mergeable":
      case "auto_merge_enabled":
      case "merged":
        return "✅";
      case "conflict":
        return "⚠️";
      case "failed":
        return "❌";
      default:
        return "•";
    }
  };

  const getTooltip = () => {
    const lines: string[] = [`PR #${prNumber}`];

    if (mergeSignals) {
      if (mergeSignals.ciStatus) {
        lines.push(`CI: ${mergeSignals.ciStatus}`);
      }
      if (mergeSignals.reviewRequired) {
        lines.push(
          mergeSignals.requiredReviewers?.length
            ? `Reviews: ${mergeSignals.requiredReviewers.join(", ")}`
            : `Approvals: ${mergeSignals.approvalsCount ?? 0}`
        );
      }
      if (mergeSignals.blockReason) {
        lines.push(`Blocked: ${mergeSignals.blockReason}`);
      }
    }

    return lines.join("\n");
  };

  return (
    <a
      href={prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
      title={getTooltip()}
    >
      <span>{getIcon()}</span>
      <span>#{prNumber}</span>
    </a>
  );
}
