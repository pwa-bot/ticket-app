"use client";

import type { PendingChange } from "@ticketdotapp/core";
import PendingBadge from "./pending-badge";
import { PRIORITY_STYLES } from "@/lib/utils";

interface TicketCardProps {
  ticket: {
    id: string;
    display_id?: string;
    title: string;
    state: string;
    priority: string;
    labels: string[];
  };
  pendingChange?: PendingChange;
  onOpen: (id: string) => void;
  onCancelPending?: () => void;
  onRetryPending?: () => void;
}

function getDisplayId(ticket: { id: string; display_id?: string }): string {
  return ticket.display_id ?? `TK-${ticket.id.slice(0, 8)}`;
}

export default function TicketCard({
  ticket,
  pendingChange,
  onOpen,
  onCancelPending,
  onRetryPending,
}: TicketCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{getDisplayId(ticket)}</p>
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${
            PRIORITY_STYLES[ticket.priority as keyof typeof PRIORITY_STYLES] ?? "bg-slate-50 text-slate-700 border-slate-200"
          }`}
        >
          {ticket.priority}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-800">{ticket.title}</p>

      {ticket.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {ticket.labels.map((label) => (
            <span key={label} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {label}
            </span>
          ))}
        </div>
      )}

      {pendingChange && (
        <div className="mt-3">
          <PendingBadge change={pendingChange} onCancel={onCancelPending} onRetry={onRetryPending} />
        </div>
      )}
    </button>
  );
}
