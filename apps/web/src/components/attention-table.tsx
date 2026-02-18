"use client";

import { Fragment, useMemo } from "react";
import CiStatusIcon from "@/components/ci-status-icon";
import PrStatusBadge, { type LinkedPrSummary } from "@/components/pr-status-badge";
import { BOARD_LABELS, PRIORITY_STYLES } from "@/lib/utils";
import {
  getActorDisplay,
  getAgeShort,
  getDisplayId,
  getUpdatedLabel,
  truncateTitle,
  type AttentionRow,
  type CiStatus,
} from "@/lib/attention";

interface AttentionTableProps {
  rows: AttentionRow[];
  multiRepo: boolean;
  onOpenTicket: (repo: string, ticketId: string) => void;
  prMap: Record<string, LinkedPrSummary[]>;
  ciMap: Record<string, CiStatus>;
}

function keyFor(repo: string, ticketId: string): string {
  return `${repo}:${ticketId}`;
}

// State order and styling for section headers
const STATE_ORDER = ["in_progress", "ready", "blocked", "backlog", "done"] as const;
const STATE_SECTION_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  in_progress: { bg: "bg-gradient-to-r from-amber-50 to-amber-100/50", border: "border-amber-300", text: "text-amber-900", icon: "🔨" },
  ready: { bg: "bg-gradient-to-r from-blue-50 to-blue-100/50", border: "border-blue-300", text: "text-blue-900", icon: "📋" },
  blocked: { bg: "bg-gradient-to-r from-red-50 to-red-100/50", border: "border-red-300", text: "text-red-900", icon: "🚫" },
  backlog: { bg: "bg-gradient-to-r from-slate-100 to-slate-50", border: "border-slate-300", text: "text-slate-800", icon: "📥" },
  done: { bg: "bg-gradient-to-r from-green-50 to-green-100/50", border: "border-green-300", text: "text-green-900", icon: "✅" },
};

// Generate consistent color for repo name
function getRepoColor(repo: string): string {
  const colors = [
    "bg-violet-100 text-violet-700 border-violet-200",
    "bg-sky-100 text-sky-700 border-sky-200",
    "bg-emerald-100 text-emerald-700 border-emerald-200",
    "bg-rose-100 text-rose-700 border-rose-200",
    "bg-amber-100 text-amber-700 border-amber-200",
    "bg-indigo-100 text-indigo-700 border-indigo-200",
    "bg-teal-100 text-teal-700 border-teal-200",
    "bg-pink-100 text-pink-700 border-pink-200",
  ];
  // Simple hash to pick consistent color
  let hash = 0;
  for (let i = 0; i < repo.length; i++) {
    hash = ((hash << 5) - hash) + repo.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function AttentionTable({ rows, multiRepo, onOpenTicket, prMap, ciMap }: AttentionTableProps) {
  // Group rows by state
  const groupedRows = useMemo(() => {
    const groups: Record<string, AttentionRow[]> = {};
    for (const row of rows) {
      const state = row.ticket.state;
      if (!groups[state]) groups[state] = [];
      groups[state].push(row);
    }
    return groups;
  }, [rows]);

  // Get ordered states that have tickets
  const orderedStates = useMemo(() => {
    return STATE_ORDER.filter(state => groupedRows[state]?.length > 0);
  }, [groupedRows]);

  const colCount = multiRepo ? 11 : 10;

  if (rows.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No tickets found.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[1050px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Ticket</th>
            <th className="px-3 py-2">Title</th>
            {multiRepo ? <th className="px-3 py-2">Repo</th> : null}
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Assignee</th>
            <th className="px-3 py-2">Reviewer</th>
            <th className="px-3 py-2">PR</th>
            <th className="px-3 py-2">CI</th>
            <th className="px-3 py-2">Age</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {orderedStates.map((state, stateIndex) => {
            const stateRows = groupedRows[state] || [];
            const styles = STATE_SECTION_STYLES[state] || STATE_SECTION_STYLES.backlog;
            const count = stateRows.length;

            return (
              <Fragment key={state}>
                {/* Section header row */}
                <tr className={`${styles.bg} ${stateIndex > 0 ? "border-t-4" : "border-t"} ${styles.border}`}>
                  <td colSpan={colCount} className={`px-3 py-2 font-semibold ${styles.text}`}>
                    <span className="mr-2">{styles.icon}</span>
                    {BOARD_LABELS[state] || state}
                    <span className="ml-2 font-normal text-slate-500">({count})</span>
                  </td>
                </tr>

                {/* Ticket rows */}
                {stateRows.map((row) => {
                  const ticketKey = keyFor(row.repo, row.ticket.id);
                  const prs = prMap[ticketKey] ?? [];
                  const ci = ciMap[ticketKey] ?? "unknown";

                  return (
                    <tr key={ticketKey} className="border-t border-slate-100 align-top hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenTicket(row.repo, row.ticket.id)}
                          className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                        >
                          {getDisplayId(row.ticket)}
                        </button>
                      </td>
                      <td className="max-w-[360px] px-3 py-2">
                        <span 
                          className="block truncate text-slate-800 cursor-default" 
                          title={row.ticket.title}
                        >
                          {row.ticket.title}
                        </span>
                      </td>
                      {multiRepo ? (
                        <td className="px-3 py-2">
                          <span className={`inline-block truncate max-w-[120px] rounded-full border px-2 py-0.5 text-xs font-medium ${getRepoColor(row.repo)}`} title={row.repo}>
                            {row.repo.split("/")[1] || row.repo}
                          </span>
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                          {BOARD_LABELS[row.ticket.state]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLES[row.ticket.priority]}`}>
                          {row.ticket.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{getActorDisplay(row.ticket.assignee)}</td>
                      <td className="px-3 py-2 text-slate-700">{getActorDisplay(row.ticket.reviewer)}</td>
                      <td className="px-3 py-2"><PrStatusBadge prs={prs} /></td>
                      <td className="px-3 py-2"><CiStatusIcon status={ci} /></td>
                      <td className="px-3 py-2 text-slate-700">{getAgeShort(row)}</td>
                      <td className="px-3 py-2 text-slate-700">{getUpdatedLabel(row)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
