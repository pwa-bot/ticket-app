"use client";

import { Fragment, useMemo } from "react";
import CiStatusIcon from "@/components/ci-status-icon";
import PrStatusBadge, { type LinkedPrSummary } from "@/components/pr-status-badge";
import { EditableSelect } from "@/components/editable-field";
import { BOARD_LABELS, PRIORITY_STYLES } from "@/lib/utils";
import {
  getActorDisplay,
  getAgeShort,
  getDisplayId,
  getUpdatedLabel,
  type AttentionRow,
  type CiStatus,
} from "@/lib/attention";
import type { TicketChangePatch } from "@ticketdotapp/core";

interface AttentionTableProps {
  rows: AttentionRow[];
  multiRepo: boolean;
  onOpenTicket: (repo: string, ticketId: string) => void;
  onChangeField?: (repo: string, ticketId: string, patch: TicketChangePatch) => Promise<void>;
  pendingTicketIds?: Set<string>;
  prMap: Record<string, LinkedPrSummary[]>;
  ciMap: Record<string, CiStatus>;
  showPrCi?: boolean;
  reasonMap?: Record<string, string[]>;
  reasonLabels?: Record<string, string>;
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

const STATE_PILL_STYLES: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-700 border-slate-300",
  ready: "bg-blue-50 text-blue-700 border-blue-300",
  in_progress: "bg-amber-50 text-amber-700 border-amber-300",
  blocked: "bg-red-50 text-red-700 border-red-300",
  done: "bg-green-50 text-green-700 border-green-300",
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
  let hash = 0;
  for (let i = 0; i < repo.length; i++) {
    hash = ((hash << 5) - hash) + repo.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function AttentionTable({ 
  rows, 
  multiRepo, 
  onOpenTicket, 
  onChangeField,
  pendingTicketIds = new Set(),
  prMap, 
  ciMap,
  showPrCi = true,
  reasonMap,
  reasonLabels = {},
}: AttentionTableProps) {
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

  const showReasons = !!reasonMap && Object.keys(reasonMap).length > 0;
  const colCount = (multiRepo ? 9 : 8) + (showPrCi ? 2 : 0) + (showReasons ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[1050px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Ticket</th>
            <th className="px-3 py-2">Title</th>
            {multiRepo ? <th className="px-3 py-2">Repo</th> : null}
            {showReasons ? <th className="px-3 py-2">Reasons</th> : null}
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Assignee</th>
            <th className="px-3 py-2">Reviewer</th>
            {showPrCi ? <th className="px-3 py-2">PR</th> : null}
            {showPrCi ? <th className="px-3 py-2">CI</th> : null}
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
                  const isPending = pendingTicketIds.has(row.ticket.id);
                  const canEdit = !!onChangeField && !isPending;
                  const reasons = reasonMap?.[ticketKey] ?? [];

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
                          <span className={`inline-block truncate max-w-[220px] rounded-full border px-2 py-0.5 text-xs font-medium ${getRepoColor(row.repo)}`} title={row.repo}>
                            {row.repo}
                          </span>
                        </td>
                      ) : null}
                      {showReasons ? (
                        <td className="px-3 py-2">
                          {reasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {reasons.map((reason) => (
                                <span
                                  key={`${ticketKey}:${reason}`}
                                  className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                                >
                                  {reasonLabels[reason] ?? reason}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <EditableSelect
                            value={row.ticket.state}
                            options={[
                              { value: "backlog", label: "Backlog" },
                              { value: "ready", label: "Ready" },
                              { value: "in_progress", label: "In Progress" },
                              { value: "blocked", label: "Blocked" },
                              { value: "done", label: "Done" },
                            ]}
                            onSave={async (v) => onChangeField(row.repo, row.ticket.id, { state: v as typeof row.ticket.state })}
                            className={`rounded border px-2 py-0.5 text-xs ${STATE_PILL_STYLES[row.ticket.state] || "border-slate-300"}`}
                            renderValue={(v) => BOARD_LABELS[v as keyof typeof BOARD_LABELS] || v}
                          />
                        ) : (
                          <span className={`rounded border px-2 py-0.5 text-xs ${STATE_PILL_STYLES[row.ticket.state] || "border-slate-300"} ${isPending ? "opacity-50" : ""}`}>
                            {BOARD_LABELS[row.ticket.state]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <EditableSelect
                            value={row.ticket.priority}
                            options={[
                              { value: "p0", label: "P0", className: "text-red-700 font-bold" },
                              { value: "p1", label: "P1", className: "text-orange-700 font-semibold" },
                              { value: "p2", label: "P2", className: "text-yellow-700" },
                              { value: "p3", label: "P3", className: "text-slate-600" },
                            ]}
                            onSave={async (v) => onChangeField(row.repo, row.ticket.id, { priority: v as typeof row.ticket.priority })}
                            className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLES[row.ticket.priority]}`}
                            renderValue={(v) => v.toUpperCase()}
                          />
                        ) : (
                          <span className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLES[row.ticket.priority]} ${isPending ? "opacity-50" : ""}`}>
                            {row.ticket.priority}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{getActorDisplay(row.ticket.assignee)}</td>
                      <td className="px-3 py-2 text-slate-700">{getActorDisplay(row.ticket.reviewer)}</td>
                      {showPrCi ? <td className="px-3 py-2"><PrStatusBadge prs={prs} /></td> : null}
                      {showPrCi ? <td className="px-3 py-2"><CiStatusIcon status={ci} /></td> : null}
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
