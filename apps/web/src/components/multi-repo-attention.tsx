"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttentionTable from "@/components/attention-table";
import TicketDetailModal from "@/components/ticket-detail-modal";
import type { LinkedPrSummary } from "@/components/pr-status-badge";
import {
  getCreatedTimestamp,
  priorityRank,
  type AttentionRow,
  type AttentionTicket,
  type CiStatus,
} from "@/lib/attention";
import type { Priority, TicketIndex, TicketState } from "@ticketdotapp/core";
import { BOARD_LABELS, BOARD_STATES } from "@/lib/utils";
import { unwrapApiData } from "@/lib/api/client";

interface MultiRepoAttentionProps {
  repos: string[];
}

type RepoIndex = TicketIndex & {
  generated_at?: string;
  generated?: string;
};

interface TicketPrEntry {
  ticketId: string;
  prs: LinkedPrSummary[];
}

function prKey(repo: string, ticketId: string): string {
  return `${repo}:${ticketId}`;
}

function extractTicketDates(ticket: AttentionTicket): Pick<AttentionTicket, "created" | "updated"> {
  const record = ticket as AttentionTicket & {
    extras?: Record<string, unknown>;
  };

  const createdValue =
    typeof record.created === "string"
      ? record.created
      : typeof record.extras?.created === "string"
        ? record.extras.created
        : undefined;

  const updatedValue =
    typeof record.updated === "string"
      ? record.updated
      : typeof record.extras?.updated === "string"
        ? record.extras.updated
        : undefined;

  return {
    created: createdValue,
    updated: updatedValue,
  };
}

export default function MultiRepoAttention({ repos }: MultiRepoAttentionProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [indexes, setIndexes] = useState<Record<string, RepoIndex>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prMap, setPrMap] = useState<Record<string, LinkedPrSummary[]>>({});
  const [ciMap, setCiMap] = useState<Record<string, CiStatus>>({});

  const loadTickets = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const responses = await Promise.all(
          repos.map(async (repo) => {
            const params = new URLSearchParams({ repo });
            if (forceRefresh) {
              params.set("refresh", "1");
            }

            const response = await fetch(`/api/tickets?${params.toString()}`, { cache: forceRefresh ? "no-store" : "default" });
            if (!response.ok) {
              throw new Error(`Failed to load ${repo}`);
            }

            const data = (await response.json()) as RepoIndex;
            return { repo, index: data };
          }),
        );

        const nextIndexes: Record<string, RepoIndex> = {};
        responses.forEach(({ repo, index }) => {
          nextIndexes[repo] = index;
        });

        setIndexes(nextIndexes);
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
    [repos],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    async function loadPrLinks() {
      try {
        const results = await Promise.all(
          repos.map(async (fullRepo) => {
            const [owner, name] = fullRepo.split("/");
            if (!owner || !name) {
              return { repo: fullRepo, links: [] as TicketPrEntry[] };
            }

            const response = await fetch(`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/prs`, {
              cache: "default",
            });

            if (!response.ok) {
              return { repo: fullRepo, links: [] as TicketPrEntry[] };
            }

            const json = await response.json();
            const links = unwrapApiData<{ entries: TicketPrEntry[] }>(json).entries ?? [];
            return { repo: fullRepo, links };
          }),
        );

        if (cancelled) {
          return;
        }

        const nextPrMap: Record<string, LinkedPrSummary[]> = {};
        const nextCiMap: Record<string, CiStatus> = {};

        results.forEach(({ repo, links }) => {
          links.forEach((entry) => {
            const key = prKey(repo, entry.ticketId);
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
  }, [loading, repos]);

  const rows = useMemo<AttentionRow[]>(() => {
    return repos.flatMap((repo) => {
      const index = indexes[repo];
      if (!index) {
        return [];
      }

      return index.tickets.map((ticket) => {
        const normalizedTicket: AttentionTicket = {
          ...ticket,
          ...extractTicketDates(ticket as AttentionTicket),
        };

        return {
          repo,
          generatedAt: index.generated_at ?? index.generated,
          ticket: normalizedTicket,
        };
      });
    });
  }, [indexes, repos]);

  const stateFilter = searchParams.get("state");
  const priorityFilter = searchParams.get("priority");
  const labelFilter = searchParams.get("label");

  const activeStateFilter = BOARD_STATES.includes(stateFilter as TicketState) ? (stateFilter as TicketState) : null;
  const activePriorityFilter = ["p0", "p1", "p2", "p3"].includes(priorityFilter ?? "")
    ? (priorityFilter as Priority)
    : null;
  const activeLabelFilter = labelFilter && labelFilter.length > 0 ? labelFilter : null;

  const labelOptions = useMemo(() => {
    return Array.from(new Set(rows.flatMap((row) => row.ticket.labels))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (activeStateFilter && row.ticket.state !== activeStateFilter) {
          return false;
        }
        if (activePriorityFilter && row.ticket.priority !== activePriorityFilter) {
          return false;
        }
        if (activeLabelFilter && !row.ticket.labels.includes(activeLabelFilter)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const priorityDiff = priorityRank(a.ticket.priority) - priorityRank(b.ticket.priority);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return getCreatedTimestamp(a) - getCreatedTimestamp(b);
      });
  }, [activeLabelFilter, activePriorityFilter, activeStateFilter, rows]);

  const selectedTicketId = searchParams.get("ticket");
  const selectedTicketRepo = searchParams.get("ticketRepo");

  function setQueryParam(key: "state" | "priority" | "label" | "view" | "ticket" | "ticketRepo", value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function onOpenTicket(repo: string, ticketId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ticket", ticketId);
    params.set("ticketRepo", repo);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onCloseTicket() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ticket");
    params.delete("ticketRepo");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const generatedLabel = useMemo(() => {
    const timestamps = Object.values(indexes)
      .map((index) => index.generated_at ?? index.generated)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));

    if (timestamps.length === 0) {
      return "—";
    }

    const latest = Math.max(...timestamps);
    return new Date(latest).toLocaleString();
  }, [indexes]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attention</h1>
          <p className="mt-1 text-sm text-slate-600">{repos.length} repos selected</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Board view disabled for multi-repo — only show toggle for single repo */}
          <button
            type="button"
            onClick={() => void loadTickets({ forceRefresh: true })}
            disabled={refreshing || loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <Link
            href="/space"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Change repos
          </Link>
          <a
            href="/api/auth/logout"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Log out
          </a>
        </div>
      </header>

      <div className="mb-4 text-xs uppercase tracking-wider text-slate-500">Generated {generatedLabel}</div>

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">State</span>
          <select
            value={activeStateFilter ?? ""}
            onChange={(event) => setQueryParam("state", event.target.value)}
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
            onChange={(event) => setQueryParam("priority", event.target.value)}
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
            onChange={(event) => setQueryParam("label", event.target.value)}
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

      {loading && <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading tickets...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <>
          <div className="mb-4 text-sm text-slate-600">
            Showing {filteredRows.length} of {rows.length} tickets
          </div>
          <AttentionTable rows={filteredRows} multiRepo={repos.length > 1} onOpenTicket={onOpenTicket} prMap={prMap} ciMap={ciMap} />
        </>
      )}

      {selectedTicketId && selectedTicketRepo ? (
        <TicketDetailModal repo={selectedTicketRepo} ticketId={selectedTicketId} onClose={onCloseTicket} />
      ) : null}
    </div>
  );
}
