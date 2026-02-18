"use client";

import type { Priority, TicketIndex, TicketIndexEntry, TicketState } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttentionTable from "@/components/attention-table";
import TicketDetailModal from "@/components/ticket-detail-modal";
import ViewToggle from "@/components/view-toggle";
import PendingBadge from "@/components/pending-badge";
import { SavedViewsDropdown } from "@/components/saved-views";
import { AutoMergeToggle } from "@/components/auto-merge-toggle";
import { getCreatedTimestamp, priorityRank, type AttentionRow, type CiStatus } from "@/lib/attention";
import { BOARD_LABELS, BOARD_STATES, PRIORITY_STYLES, groupTicketsForBoard } from "@/lib/utils";
import { PendingChangesProvider, usePendingChanges } from "@/lib/pending-changes";
import { isValidTransition, type TicketChangePatch } from "@ticketdotapp/core";
import type { LinkedPrSummary } from "@/components/pr-status-badge";

// Format a date as "X ago" (e.g., "2m ago", "1h ago")
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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

function TicketCard({
  ticket,
  onOpen,
  owner,
  repo,
}: {
  ticket: BoardTicket;
  onOpen: (id: string) => void;
  owner: string;
  repo: string;
}) {
  const { getPendingChange, cancelChange, retryChange } = usePendingChanges();
  const pendingChange = getPendingChange(ticket.id);

  // Parse target state from pending change summary for retry
  const getRetryPatch = (): { state: TicketState } | null => {
    if (!pendingChange) return null;
    const match = pendingChange.summary.match(/→\s*(\w+)/);
    if (match && BOARD_STATES.includes(match[1] as TicketState)) {
      return { state: match[1] as TicketState };
    }
    return null;
  };

  const handleDragStart = (e: React.DragEvent) => {
    console.log("[drag] started:", ticket.id, ticket.state);
    e.dataTransfer.setData("text/plain", ticket.id);
    e.dataTransfer.setData("ticketId", ticket.id);
    e.dataTransfer.setData("fromState", ticket.state);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className={`w-full rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow ${
        pendingChange ? "opacity-75" : ""
      }`}
    >
      {/* Drag handle */}
      <div
        draggable={!pendingChange}
        onDragStart={handleDragStart}
        className={`flex items-center justify-center border-b border-slate-100 py-1 text-slate-400 ${
          pendingChange ? "" : "cursor-grab hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
        }`}
        title="Drag to move"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
      {/* Clickable content */}
      <button
        type="button"
        onClick={() => onOpen(ticket.id)}
        className="w-full p-4 text-left"
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
      {pendingChange && (
        <div className="px-4 pb-4">
          <PendingBadge
            change={pendingChange}
            onCancel={() => cancelChange(ticket.id)}
            onRetry={() => {
              const patch = getRetryPatch();
              if (patch) {
                void retryChange({ owner, repo, ticketId: ticket.id, patch, currentState: ticket.state });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function Column({
  state,
  tickets,
  onOpen,
  owner,
  repo,
  onStateChange,
}: {
  state: TicketState;
  tickets: BoardTicket[];
  onOpen: (id: string) => void;
  owner: string;
  repo: string;
  onStateChange: (ticketId: string, fromState: string, toState: TicketState) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragOver) {
      console.log("[drag] over column:", state);
    }
    setIsDragOver(true);
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const ticketId = e.dataTransfer.getData("ticketId");
    const fromState = e.dataTransfer.getData("fromState");
    console.log("[drag] dropped:", ticketId, fromState, "→", state);

    if (!ticketId || !fromState) return;
    if (fromState === state) return; // Same column, no-op

    // Validate transition
    if (!isValidTransition(fromState as TicketState, state)) {
      // Could show a toast here
      console.warn(`Invalid transition: ${fromState} → ${state}`);
      return;
    }

    onStateChange(ticketId, fromState, state);
  };

  return (
    <section
      className={`flex min-h-[240px] flex-col rounded-xl border ${
        isDragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"
      } transition-colors`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">{BOARD_LABELS[state]}</h3>
        <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">{tickets.length}</span>
      </header>
      <div className="flex max-h-[calc(100vh-200px)] flex-1 flex-col gap-3 overflow-y-auto p-3">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onOpen={onOpen} owner={owner} repo={repo} />
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

// Inner component that handles state changes (must be inside PendingChangesProvider)
function BoardGrid({
  owner,
  repo,
  grouped,
  openTicket,
}: {
  owner: string;
  repo: string;
  grouped: Record<TicketState, BoardTicket[]>;
  openTicket: (id: string) => void;
}) {
  const { createChange, loadPendingFromGitHub } = usePendingChanges();

  // Restore pending change indicators from open GitHub PRs on mount
  useEffect(() => {
    void loadPendingFromGitHub(owner, repo);
  }, [owner, repo, loadPendingFromGitHub]);

  const handleStateChange = async (ticketId: string, fromState: string, toState: TicketState) => {
    await createChange({
      owner,
      repo,
      ticketId,
      patch: { state: toState },
      currentState: fromState,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {BOARD_STATES.map((state) => (
        <Column
          key={state}
          state={state}
          tickets={grouped[state]}
          onOpen={openTicket}
          owner={owner}
          repo={repo}
          onStateChange={handleStateChange}
        />
      ))}
    </div>
  );
}

// Wrapper that provides context for board view
function BoardView({
  owner,
  repo,
  grouped,
  openTicket,
  loadTickets,
}: {
  owner: string;
  repo: string;
  grouped: Record<TicketState, BoardTicket[]>;
  openTicket: (id: string) => void;
  loadTickets: (opts?: { forceRefresh?: boolean }) => Promise<void>;
}) {
  return (
    <PendingChangesProvider onMerged={() => void loadTickets({ forceRefresh: true })}>
      <BoardGrid
        owner={owner}
        repo={repo}
        grouped={grouped}
        openTicket={openTicket}
      />
    </PendingChangesProvider>
  );
}

// Inner table component with access to pending changes context
function TableViewInner({
  owner,
  repo,
  rows,
  openTicket,
  prMap,
  ciMap,
}: {
  owner: string;
  repo: string;
  rows: AttentionRow[];
  openTicket: (id: string) => void;
  prMap: Record<string, LinkedPrSummary[]>;
  ciMap: Record<string, CiStatus>;
}) {
  const { createChange, changes } = usePendingChanges();
  
  const pendingTicketIds = useMemo(() => {
    const ids: string[] = [];
    changes.forEach((change, ticketId) => {
      // Any status that isn't merged or failed means change is still in progress
      if (change.status !== "merged" && change.status !== "failed") {
        ids.push(ticketId);
      }
    });
    return new Set(ids);
  }, [changes]);

  const handleChangeField = async (repoName: string, ticketId: string, patch: TicketChangePatch) => {
    const ticket = rows.find(r => r.ticket.id === ticketId)?.ticket;
    await createChange({
      owner,
      repo,
      ticketId,
      patch,
      currentState: ticket?.state,
    });
  };

  return (
    <AttentionTable 
      rows={rows} 
      multiRepo={false} 
      onOpenTicket={(_repoName, id) => openTicket(id)} 
      onChangeField={handleChangeField}
      pendingTicketIds={pendingTicketIds}
      prMap={prMap} 
      ciMap={ciMap} 
    />
  );
}

// Wrapper that provides context for table view
function TableView({
  owner,
  repo,
  rows,
  openTicket,
  loadTickets,
  prMap,
  ciMap,
}: {
  owner: string;
  repo: string;
  rows: AttentionRow[];
  openTicket: (id: string) => void;
  loadTickets: (opts?: { forceRefresh?: boolean }) => Promise<void>;
  prMap: Record<string, LinkedPrSummary[]>;
  ciMap: Record<string, CiStatus>;
}) {
  return (
    <PendingChangesProvider onMerged={() => void loadTickets({ forceRefresh: true })}>
      <TableViewInner
        owner={owner}
        repo={repo}
        rows={rows}
        openTicket={openTicket}
        prMap={prMap}
        ciMap={ciMap}
      />
    </PendingChangesProvider>
  );
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
  const [syncMeta, setSyncMeta] = useState<{
    source?: string;
    lastSyncedAt?: string;
    syncStatus?: string;
    syncError?: string;
    warning?: string;
  } | null>(null);
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

        const data = (await response.json()) as BoardIndex & { _meta?: typeof syncMeta };
        setIndex(data);
        if (data._meta) {
          setSyncMeta(data._meta);
        }
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
    // Update URL for sharing without triggering navigation
    window.history.replaceState(null, "", `/space/${owner}/${repo}/${id}${getSearchQuery()}`);
  }

  function closeTicket() {
    setSelectedTicketId(null);
    window.history.replaceState(null, "", `/space/${owner}/${repo}${getSearchQuery()}`);
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
          <p className="mt-1 text-sm text-slate-600">
            {syncMeta?.lastSyncedAt ? (
              <>
                Updated{" "}
                {formatTimeAgo(new Date(syncMeta.lastSyncedAt))}
                {syncMeta.source === "stale_cache" && (
                  <span className="ml-2 text-amber-600" title={syncMeta.syncError || "Using cached data"}>
                    (cached)
                  </span>
                )}
              </>
            ) : loading ? (
              "Loading..."
            ) : (
              "Dashboard"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewsDropdown repo={fullRepo} basePath={`/space/${owner}/${repo}`} />
          <AutoMergeToggle repo={fullRepo} />
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
            <BoardView
              owner={owner}
              repo={repo}
              grouped={grouped}
              openTicket={openTicket}
              loadTickets={loadTickets}
            />
          ) : (
            <TableView 
              owner={owner}
              repo={repo}
              rows={attentionRows}
              openTicket={openTicket}
              loadTickets={loadTickets}
              prMap={prMap}
              ciMap={ciMap}
            />
          )}
        </>
      )}

      {selectedTicketId && (
        <PendingChangesProvider onMerged={() => void loadTickets({ forceRefresh: true })}>
          <TicketDetailModal 
            repo={fullRepo} 
            ticketId={selectedTicketId} 
            onClose={closeTicket}
            initialData={index?.tickets.find(t => t.id === selectedTicketId || t.short_id === selectedTicketId)}
          />
        </PendingChangesProvider>
      )}
    </div>
  );
}
