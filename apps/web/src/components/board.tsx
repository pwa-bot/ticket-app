"use client";

import type { Priority, TicketIndex, TicketIndexEntry, TicketState } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttentionTable from "@/components/attention-table";
import TicketDetailModal from "@/components/ticket-detail-modal";
import ViewToggle from "@/components/view-toggle";
import { getCreatedTimestamp, priorityRank, type AttentionRow, type CiStatus } from "@/lib/attention";
import { BOARD_LABELS, BOARD_STATES, PRIORITY_STYLES, groupTicketsForBoard } from "@/lib/utils";
import type { LinkedPrSummary } from "@/components/pr-status-badge";

interface BoardProps {
  owner: string;
  repo: string;
  ticketId?: string;
}

type BoardTicket = TicketIndexEntry & {
  display_id?: string;
  created?: string;
  updated?: string;
};

type BoardIndex = TicketIndex & {
  generated_at?: string;
  generated?: string;
  tickets: BoardTicket[];
};

interface TicketPrEntry {
  ticketId: string;
  prs: LinkedPrSummary[];
}

function withTicketDates(ticket: BoardTicket): BoardTicket {
  const extras = ticket.extras as Record<string, unknown> | undefined;
  const createdFromExtras = typeof extras?.created === "string" ? extras.created : undefined;
  const updatedFromExtras = typeof extras?.updated === "string" ? extras.updated : undefined;

  return {
    ...ticket,
    created: ticket.created ?? createdFromExtras,
    updated: ticket.updated ?? updatedFromExtras,
  };
}

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
      <div className="flex max-h-[calc(100vh-200px)] flex-1 flex-col gap-3 overflow-y-auto p-3">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
        {tickets.length === 0 && <p className="p-2 text-xs text-slate-500">No tickets</p>}
      </div>
    </section>
  );
}

function getViewFromQuery(value: string | null): "board" | "table" | null {
  if (value === "board" || value === "table") {
    return value;
  }

  return null;
}

function getPrKey(repoName: string, ticketId: string): string {
  return `${repoName}:${ticketId}`;
}

export default function Board({ owner, repo, ticketId }: BoardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fullRepo = `${owner}/${repo}`;
  const [index, setIndex] = useState<BoardIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(ticketId ?? null);
  const [view, setView] = useState<"board" | "table">("board");
  const [prMap, setPrMap] = useState<Record<string, LinkedPrSummary[]>>({});
  const [ciMap, setCiMap] = useState<Record<string, CiStatus>>({});

  useEffect(() => {
    setSelectedTicketId(ticketId ?? null);
  }, [ticketId]);

  useEffect(() => {
    const queryView = getViewFromQuery(searchParams.get("view"));
    if (queryView) {
      setView(queryView);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ticket_view", queryView);
      }
      return;
    }

    if (typeof window !== "undefined") {
      const stored = getViewFromQuery(window.localStorage.getItem("ticket_view"));
      if (stored) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("view", stored);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
        setView(stored);
      }
    }
  }, [pathname, router, searchParams]);

  const loadTickets = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ repo: fullRepo });
        if (forceRefresh) {
          params.set("refresh", "1");
        }

        const response = await fetch(`/api/tickets?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load tickets");
        }

        const data = (await response.json()) as BoardIndex;
        setIndex(data);
        if (forceRefresh) {
          setPrMap({});
          setCiMap({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fullRepo],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (view !== "table" || !index) {
      return;
    }

    let cancelled = false;

    async function loadPrLinks() {
      try {
        const response = await fetch(`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/prs`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load PR links");
        }

        const links = (await response.json()) as TicketPrEntry[];
        if (cancelled) {
          return;
        }

        const nextPrMap: Record<string, LinkedPrSummary[]> = {};
        const nextCiMap: Record<string, CiStatus> = {};
        links.forEach((entry) => {
          const key = getPrKey(fullRepo, entry.ticketId);
          nextPrMap[key] = entry.prs;
          const ci = entry.prs.some((pr) => pr.checks === "failure")
            ? "failure"
            : entry.prs.some((pr) => pr.checks === "pending")
              ? "pending"
              : entry.prs.some((pr) => pr.checks === "success")
                ? "success"
                : "unknown";
          nextCiMap[key] = ci;
        });

        setPrMap(nextPrMap);
        setCiMap(nextCiMap);
      } catch {
        if (!cancelled) {
          setPrMap({});
          setCiMap({});
        }
      }
    }

    void loadPrLinks();

    return () => {
      cancelled = true;
    };
  }, [fullRepo, index, owner, repo, view]);

  function getSearchQuery(next?: URLSearchParams) {
    const query = (next ?? new URLSearchParams(searchParams.toString())).toString();
    return query ? `?${query}` : "";
  }

  function openTicket(id: string) {
    setSelectedTicketId(id);
    router.push(`/space/${owner}/${repo}/${id}${getSearchQuery()}`);
  }

  function closeTicket() {
    setSelectedTicketId(null);
    router.push(`/space/${owner}/${repo}${getSearchQuery()}`);
  }

  const stateFilter = searchParams.get("state");
  const priorityFilter = searchParams.get("priority");
  const labelFilter = searchParams.get("label");

  const activeStateFilter = BOARD_STATES.includes(stateFilter as TicketState) ? (stateFilter as TicketState) : null;
  const activePriorityFilter = ["p0", "p1", "p2", "p3"].includes(priorityFilter ?? "")
    ? (priorityFilter as Priority)
    : null;
  const activeLabelFilter = labelFilter && labelFilter.length > 0 ? labelFilter : null;

  const allTickets = index?.tickets ?? [];

  const labelOptions = useMemo(() => {
    return Array.from(new Set(allTickets.flatMap((ticket) => ticket.labels))).sort((a, b) => a.localeCompare(b));
  }, [allTickets]);

  const filteredTickets = useMemo(() => {
    return allTickets.filter((ticket) => {
      if (activeStateFilter && ticket.state !== activeStateFilter) {
        return false;
      }
      if (activePriorityFilter && ticket.priority !== activePriorityFilter) {
        return false;
      }
      if (activeLabelFilter && !ticket.labels.includes(activeLabelFilter)) {
        return false;
      }

      return true;
    });
  }, [activeLabelFilter, activePriorityFilter, activeStateFilter, allTickets]);

  const grouped = useMemo(() => groupTicketsForBoard(filteredTickets), [filteredTickets]);

  const attentionRows = useMemo(() => {
    return filteredTickets
      .map((ticket) => ({
        repo: fullRepo,
        generatedAt: index?.generated_at ?? index?.generated,
        ticket: withTicketDates(ticket),
      }))
      .sort((a, b) => {
        const priorityDiff = priorityRank(a.ticket.priority) - priorityRank(b.ticket.priority);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return getCreatedTimestamp(a) - getCreatedTimestamp(b);
      }) as AttentionRow[];
  }, [filteredTickets, fullRepo, index?.generated, index?.generated_at]);

  function setFilterParam(key: "state" | "priority" | "label" | "view", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function onViewChange(nextView: "board" | "table") {
    setView(nextView);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ticket_view", nextView);
    }
    setFilterParam("view", nextView);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{fullRepo}</h1>
          <p className="mt-1 text-sm text-slate-600">Dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onChange={onViewChange} />
          <button
            type="button"
            onClick={() => void loadTickets({ forceRefresh: true })}
            disabled={refreshing || loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <a
            href="/space"
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
          <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">State</span>
              <select
                value={activeStateFilter ?? ""}
                onChange={(event) => setFilterParam("state", event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">All states</option>
                {BOARD_STATES.map((state) => (
                  <option key={state} value={state}>
                    {BOARD_LABELS[state]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Priority</span>
              <select
                value={activePriorityFilter ?? ""}
                onChange={(event) => setFilterParam("priority", event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">All priorities</option>
                <option value="p0">P0</option>
                <option value="p1">P1</option>
                <option value="p2">P2</option>
                <option value="p3">P3</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Label</span>
              <select
                value={activeLabelFilter ?? ""}
                onChange={(event) => setFilterParam("label", event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">All labels</option>
                {labelOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mb-4 text-sm text-slate-600">
            Showing {filteredTickets.length} of {allTickets.length} tickets
          </div>
          {view === "board" ? (
            <div className="grid gap-4 lg:grid-cols-5">
              {BOARD_STATES.map((state) => (
                <Column key={state} state={state} tickets={grouped[state]} onOpen={openTicket} />
              ))}
            </div>
          ) : (
            <AttentionTable rows={attentionRows} multiRepo={false} onOpenTicket={(_repoName, id) => openTicket(id)} prMap={prMap} ciMap={ciMap} />
          )}
        </>
      )}

      {selectedTicketId && <TicketDetailModal repo={fullRepo} ticketId={selectedTicketId} onClose={closeTicket} />}
    </div>
  );
}
