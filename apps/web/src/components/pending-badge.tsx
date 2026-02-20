"use client";

import type { PendingChange, PendingChangeStatus } from "@ticketdotapp/core";

interface PendingBadgeProps {
  change: PendingChange;
  onCancel?: () => void;
  onRetry?: () => void;
}

const STATUS_CONFIG: Record<
  PendingChangeStatus,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  creating_pr: {
    label: "Creating PR…",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    icon: "⏳",
  },
  pending_checks: {
    label: "Pending checks",
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200",
    icon: "⏳",
  },
  waiting_review: {
    label: "Waiting review",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
    icon: "👤",
  },
  mergeable: {
    label: "Ready to merge",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    icon: "✅",
  },
  auto_merge_enabled: {
    label: "Auto-merge enabled",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    icon: "🔀",
  },
  merged: {
    label: "Merged",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    icon: "✅",
  },
  conflict: {
    label: "Conflict",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    icon: "⚠️",
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    icon: "❌",
  },
};

export default function PendingBadge({ change, onCancel, onRetry }: PendingBadgeProps) {
  const config = STATUS_CONFIG[change.status];
  const showActions = change.status === "failed" || change.status === "conflict";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      <span>{config.icon}</span>
      <span>{change.summary}</span>
      <span className="opacity-60">({config.label})</span>

      {change.prUrl && change.status !== "creating_pr" && (
        <a
          href={change.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 opacity-60 hover:opacity-100"
          title={`PR #${change.prNumber}`}
        >
          🔗
        </a>
      )}

      {showActions && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 opacity-60 hover:opacity-100"
          title="Retry (close PR and try again)"
        >
          ↻
        </button>
      )}

      {showActions && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="ml-1 opacity-60 hover:opacity-100"
          title="Cancel (close PR)"
        >
          ✕
        </button>
      )}

      {change.error && (
        <span className="ml-1 opacity-60" title={change.error.message}>
          ⓘ
        </span>
      )}
    </div>
  );
}
