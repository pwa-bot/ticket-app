"use client";

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

export default function AttentionTable({ rows, multiRepo, onOpenTicket, prMap, ciMap }: AttentionTableProps) {
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
          {rows.map((row) => {
            const ticketKey = keyFor(row.repo, row.ticket.id);
            const prs = prMap[ticketKey] ?? [];
            const ci = ciMap[ticketKey] ?? "unknown";

            return (
              <tr key={ticketKey} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpenTicket(row.repo, row.ticket.id)}
                    className="font-medium text-slate-900 underline"
                  >
                    {getDisplayId(row.ticket)}
                  </button>
                </td>
                <td className="max-w-[360px] px-3 py-2 text-slate-800" title={row.ticket.title}>
                  {truncateTitle(row.ticket.title, 60)}
                </td>
                {multiRepo ? <td className="px-3 py-2 text-slate-700">{row.repo}</td> : null}
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
        </tbody>
      </table>
    </div>
  );
}
