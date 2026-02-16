"use client";

import type { TicketIndex, TicketIndexEntry, TicketState } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import TicketDetailModal from "@/components/ticket-detail-modal";
import { BOARD_LABELS, BOARD_STATES, PRIORITY_STYLES, groupTicketsForBoard } from "@/lib/utils";

interface BoardProps {
  repo: string;
}

type BoardTicket = TicketIndexEntry & {
  display_id?: string;
};

type BoardIndex = TicketIndex & {
  generated_at?: string;
  generated?: string;
  tickets: BoardTicket[];
};

function getDisplayId(ticket: BoardTicket): string {
  return ticket.display_id ?? `TK-${ticket.id.slice(0, 8)}`;
}

function TicketCard({ ticket, onOpen }: { ticket: BoardTicket; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{getDisplayId(ticket)}</p>
        <span className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLES[ticket.priority]}`}>
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
    </button>
  );
}

function Column({
  state,
  tickets,
  onOpen,
}: {
  state: TicketState;
  tickets: BoardTicket[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="flex min-h-[240px] flex-col rounded-xl border border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">{BOARD_LABELS[state]}</h3>
        <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">{tickets.length}</span>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
        {tickets.length === 0 && <p className="p-2 text-xs text-slate-500">No tickets</p>}
      </div>
    </section>
  );
}

export default function Board({ repo }: BoardProps) {
  const [index, setIndex] = useState<BoardIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTickets() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/tickets?repo=${encodeURIComponent(repo)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load tickets");
        }

        const data = (await response.json()) as BoardIndex;
        setIndex(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadTickets();

    return () => controller.abort();
  }, [repo]);

  const grouped = useMemo(() => groupTicketsForBoard(index?.tickets ?? []), [index]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kanban Board</h1>
          <p className="mt-1 text-sm text-slate-600">{repo}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/repos"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Change repo
          </a>
          <a
            href="/api/auth/logout"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Log out
          </a>
        </div>
      </header>

      {loading && <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading board...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && index && (
        <>
          <div className="mb-4 text-xs uppercase tracking-wider text-slate-500">
            Generated {new Date(index.generated_at ?? index.generated ?? Date.now()).toLocaleString()}
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {BOARD_STATES.map((state) => (
              <Column key={state} state={state} tickets={grouped[state]} onOpen={setSelectedTicketId} />
            ))}
          </div>
        </>
      )}

      {selectedTicketId && <TicketDetailModal repo={repo} ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />}
    </div>
  );
}
