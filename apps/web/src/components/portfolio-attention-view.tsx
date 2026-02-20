"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttentionTable from "@/components/attention-table";
import { SavedViewsDropdown } from "@/components/saved-views";
import TicketDetailModal from "@/components/ticket-detail-modal";
import type { LinkedPrSummary } from "@/components/pr-status-badge";
import type { AttentionRow, CiStatus, MergeReadiness } from "@/lib/attention";
import type { Actor } from "@/lib/types";
import type {
  AttentionItem,
  AttentionReasonDetail,
  AttentionResponse,
  EnabledRepoSummary,
} from "@/app/api/space/attention/route";
import type { SpaceTicketsResponse } from "@/app/api/space/tickets/route";

const TICKETS_PAGE_SIZE = 100;

function prKey(repo: string, ticketId: string): string {
  return `${repo}:${ticketId}`;
}

function itemToAttentionRow(item: AttentionItem): AttentionRow {
  return {
    repo: item.repoFullName,
    generatedAt: item.cachedAt,
    ticket: {
      id: item.ticketId,
      short_id: item.shortId,
      display_id: item.displayId,
      title: item.title,
      state: item.state as AttentionRow["ticket"]["state"],
      priority: item.priority as AttentionRow["ticket"]["priority"],
      labels: item.labels,
      path: item.path,
      assignee: (item.assignee ?? undefined) as Actor | undefined,
      reviewer: (item.reviewer ?? undefined) as Actor | undefined,
      created: item.createdAt ?? undefined,
    },
  };
}

function ticketToAttentionRow(item: SpaceTicketsResponse["tickets"][number]): AttentionRow {
  return {
    repo: item.repoFullName,
    generatedAt: item.cachedAt,
    ticket: {
      id: item.id,
      short_id: item.shortId,
      display_id: item.displayId,
      title: item.title,
      state: item.state as AttentionRow["ticket"]["state"],
      priority: item.priority as AttentionRow["ticket"]["priority"],
      labels: item.labels,
      path: item.path,
      assignee: (item.assignee ?? undefined) as Actor | undefined,
      reviewer: (item.reviewer ?? undefined) as Actor | undefined,
      created: item.createdAt ?? undefined,
    },
  };
}

function itemToPrMap(items: AttentionItem[]): Record<string, LinkedPrSummary[]> {
  const map: Record<string, LinkedPrSummary[]> = {};
  for (const item of items) {
    const key = prKey(item.repoFullName, item.ticketId);
    map[key] = item.prs.map((pr) => ({
      number: pr.prNumber,
      title: pr.title ?? "",
      state: pr.state ?? "open",
      html_url: pr.url,
      checks: pr.ciStatus,
    }));
  }
  return map;
}

function itemToCiMap(items: AttentionItem[]): Record<string, CiStatus> {
  const map: Record<string, CiStatus> = {};
  for (const item of items) {
    const key = prKey(item.repoFullName, item.ticketId);
    const ci = item.prs.some((p) => p.ciStatus === "failure")
      ? "failure"
      : item.prs.some((p) => p.ciStatus === "pending")
        ? "pending"
        : item.prs.some((p) => p.ciStatus === "success")
          ? "success"
          : "unknown";
    map[key] = ci;
  }
  return map;
}

function itemToReasonMap(items: AttentionItem[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of items) {
    map[prKey(item.repoFullName, item.ticketId)] = item.reasons;
  }
  return map;
}

function itemToReasonDetailsMap(items: AttentionItem[]): Record<string, AttentionReasonDetail[]> {
  const map: Record<string, AttentionReasonDetail[]> = {};
  for (const item of items) {
    map[prKey(item.repoFullName, item.ticketId)] = item.reasonDetails;
  }
  return map;
}

function itemToMergeReadinessMap(items: AttentionItem[]): Record<string, MergeReadiness> {
  const map: Record<string, MergeReadiness> = {};
  for (const item of items) {
    map[prKey(item.repoFullName, item.ticketId)] = item.mergeReadiness;
  }
  return map;
}

function filterItemsBySearch(items: AttentionItem[], search: string): AttentionItem[] {
  if (!search) {
    return items;
  }

  const lowered = search.toLowerCase();
  return items.filter((item) =>
    item.title.toLowerCase().includes(lowered) ||
    item.displayId.toLowerCase().includes(lowered) ||
    item.shortId.toLowerCase().includes(lowered) ||
    item.repoFullName.toLowerCase().includes(lowered) ||
    item.labels.some((label) => label.toLowerCase().includes(lowered)) ||
    (item.assignee ?? "").toLowerCase().includes(lowered) ||
    (item.reviewer ?? "").toLowerCase().includes(lowered),
  );
}

function normalizeJumpId(value: string): { shortId: string; displayId: string; raw: string } | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const uppercase = raw.toUpperCase();
  const shortId = uppercase.startsWith("TK-") ? uppercase.slice(3) : uppercase;
  if (!shortId) {
    return null;
  }

  return {
    shortId,
    displayId: `TK-${shortId}`,
    raw,
  };
}

export default function PortfolioAttentionView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get("tab") === "tickets" ? "tickets" : "attention";
  const repoParam = searchParams.get("repos");
  const searchQuery = searchParams.get("q") ?? "";

  const [attentionData, setAttentionData] = useState<AttentionResponse | null>(null);
  const [ticketsData, setTicketsData] = useState<SpaceTicketsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticketsOffset, setTicketsOffset] = useState(0);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);

  const selectedRepos = useMemo(() => {
    if (!repoParam) {
      return null;
    }

    return new Set(repoParam.split(",").map((repo) => repo.trim()).filter(Boolean));
  }, [repoParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (repoParam) {
        params.set("repos", repoParam);
      }

      if (activeTab === "tickets") {
        params.set("limit", String(TICKETS_PAGE_SIZE));
        params.set("offset", String(ticketsOffset));
        if (searchQuery) {
          params.set("q", searchQuery);
        }

        const url = `/api/space/tickets${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load tickets (${res.status})`);
        }

        const json = (await res.json()) as SpaceTicketsResponse;
        setTicketsData(json);
      } else {
        const url = `/api/space/attention${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load attention data (${res.status})`);
        }

        const json = (await res.json()) as AttentionResponse;
        setAttentionData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, repoParam, searchQuery, ticketsOffset]);

  useEffect(() => {
    if (activeTab === "tickets") {
      setTicketsOffset(0);
    }
  }, [activeTab, repoParam, searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTicketId = searchParams.get("ticket");
  const selectedTicketRepo = searchParams.get("ticketRepo");

  function setQueryParam(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function onOpenTicket(repo: string, ticketId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ticket", ticketId);
    params.set("ticketRepo", repo);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function onCloseTicket() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ticket");
    params.delete("ticketRepo");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const allRepos = (attentionData?.repos ?? ticketsData?.repos ?? []) as EnabledRepoSummary[];
  const allRepoNames = useMemo(() => new Set(allRepos.map((repo) => repo.fullName)), [allRepos]);
  const activeRepos = selectedRepos ?? allRepoNames;

  function toggleRepo(fullName: string) {
    const working = selectedRepos ? new Set(selectedRepos) : new Set(allRepos.map((repo) => repo.fullName));

    if (working.has(fullName)) {
      working.delete(fullName);
    } else {
      working.add(fullName);
    }

    if (working.size === 0 || working.size === allRepos.length) {
      setQueryParam("repos", undefined);
      return;
    }

    setQueryParam("repos", Array.from(working).sort().join(","));
  }

  const visibleAttentionItems = useMemo(() => {
    if (!attentionData) {
      return [];
    }

    return attentionData.items.filter((item) => activeRepos.has(item.repoFullName));
  }, [activeRepos, attentionData]);

  const filteredAttentionItems = useMemo(
    () => filterItemsBySearch(visibleAttentionItems, searchQuery),
    [searchQuery, visibleAttentionItems],
  );

  const attentionRows = useMemo(() => filteredAttentionItems.map(itemToAttentionRow), [filteredAttentionItems]);
  const ticketRows = useMemo(() => (ticketsData?.tickets ?? []).map(ticketToAttentionRow), [ticketsData?.tickets]);

  const activeRows = activeTab === "tickets" ? ticketRows : attentionRows;
  const prMap = useMemo(
    () => (activeTab === "attention" ? itemToPrMap(filteredAttentionItems) : {}),
    [activeTab, filteredAttentionItems],
  );
  const ciMap = useMemo(
    () => (activeTab === "attention" ? itemToCiMap(filteredAttentionItems) : {}),
    [activeTab, filteredAttentionItems],
  );
  const reasonMap = useMemo(
    () => (activeTab === "attention" ? itemToReasonMap(filteredAttentionItems) : {}),
    [activeTab, filteredAttentionItems],
  );
  const mergeReadinessMap = useMemo(
    () => (activeTab === "attention" ? itemToMergeReadinessMap(filteredAttentionItems) : {}),
    [activeTab, filteredAttentionItems],
  );
  const reasonDetailsMap = useMemo(
    () => (activeTab === "attention" ? itemToReasonDetailsMap(filteredAttentionItems) : {}),
    [activeTab, filteredAttentionItems],
  );
  const reasonLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const reason of attentionData?.reasonCatalog ?? []) {
      labels[reason.code] = reason.label;
    }
    return labels;
  }, [attentionData?.reasonCatalog]);

  const loadedAt = (activeTab === "tickets" ? ticketsData?.loadedAt : attentionData?.loadedAt) ?? null;

  const attentionTotals = attentionData?.totals;
  const reposEnabled = attentionTotals?.reposEnabled ?? allRepos.length;
  const ticketsTotal = attentionTotals?.ticketsTotal ?? 0;
  const ticketsAttention = attentionTotals?.ticketsAttention ?? 0;
  const attentionSearchDisabled = activeTab === "attention" && ticketsAttention === 0;
  const showNoReposEnabled = activeTab === "attention" && !loading && !error && reposEnabled === 0;
  const showNoTickets = activeTab === "attention" && !loading && !error && reposEnabled > 0 && ticketsTotal === 0;
  const showAllClear = activeTab === "attention" && !loading && !error && ticketsTotal > 0 && ticketsAttention === 0;
  const showNoResults =
    activeTab === "attention" && !loading && !error && ticketsAttention > 0 && filteredAttentionItems.length === 0;

  function onJumpToIdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJumpError(null);

    const normalized = normalizeJumpId(jumpValue);
    if (!normalized) {
      setJumpError("Enter a ticket ID like TK-ABC12345 or ABC12345.");
      return;
    }

    const ticketPool =
      activeTab === "attention"
        ? visibleAttentionItems.map((item) => ({
            repoFullName: item.repoFullName,
            ticketId: item.ticketId,
            shortId: item.shortId,
            displayId: item.displayId,
          }))
        : (ticketsData?.tickets ?? []).map((ticket) => ({
            repoFullName: ticket.repoFullName,
            ticketId: ticket.id,
            shortId: ticket.shortId,
            displayId: ticket.displayId,
          }));

    const match = ticketPool.find((ticket) => {
      const ticketShortId = ticket.shortId.toUpperCase();
      const ticketDisplayId = ticket.displayId.toUpperCase();
      return (
        ticketShortId === normalized.shortId ||
        ticketDisplayId === normalized.displayId ||
        ticket.ticketId === normalized.raw
      );
    });

    if (!match) {
      setJumpError("Not found in current repos.");
      return;
    }

    onOpenTicket(match.repoFullName, match.ticketId);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Space dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? "Loading…"
              : activeTab === "attention"
                ? `${filteredAttentionItems.length} items needing attention`
                : `${ticketsData?.pagination.total ?? 0} tickets`}
            {loadedAt ? <span className="ml-2 text-slate-400">· cached {new Date(loadedAt).toLocaleString()}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewsDropdown repo={null} basePath="/space" />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <Link
            href="/space/settings"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Settings
          </Link>
          <Link
            href="/api/auth/logout"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Log out
          </Link>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-1">
        <button
          type="button"
          onClick={() => setQueryParam("tab", "attention")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === "attention" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Attention
        </button>
        <button
          type="button"
          onClick={() => setQueryParam("tab", "tickets")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === "tickets" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          All Tickets
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Repositories</p>
          <div className="flex flex-wrap gap-2">
            {allRepos.length === 0 && !loading ? (
              <span className="text-sm text-slate-500">No enabled repos found.</span>
            ) : null}
            {allRepos.map((repo) => {
              const isActive = activeRepos.has(repo.fullName);
              return (
                <button
                  key={repo.fullName}
                  type="button"
                  onClick={() => toggleRepo(repo.fullName)}
                  className={`max-w-[240px] rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title={repo.fullName}
                >
                  <span className="block truncate">{repo.fullName}</span>
                </button>
              );
            })}
            {allRepos.length > 1 ? (
              <button
                type="button"
                onClick={() => setQueryParam("repos", undefined)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                All repos
              </button>
            ) : null}
          </div>
        </div>

        <div className="w-72">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Search</p>
          <div className="relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setQueryParam("q", event.target.value || undefined)}
              disabled={attentionSearchDisabled}
              placeholder={activeTab === "attention" ? "Filter attention items..." : "Search title, ID, labels..."}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setQueryParam("q", undefined)}
                disabled={attentionSearchDisabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Clear search"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
          </div>
          {attentionSearchDisabled ? (
            <p className="mt-2 text-xs text-slate-500">
              All clear. Search is disabled while there are no attention items.{" "}
              <button type="button" className="text-blue-600 underline" onClick={() => setQueryParam("tab", "tickets")}>
                Open All tickets
              </button>
              .
            </p>
          ) : null}
        </div>

        <div className="w-72">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Jump to ticket ID</p>
          <form onSubmit={onJumpToIdSubmit} className="flex gap-2">
            <input
              type="text"
              value={jumpValue}
              onChange={(event) => {
                setJumpValue(event.target.value);
                if (jumpError) {
                  setJumpError(null);
                }
              }}
              placeholder="TK-ABC12345 or ABC12345"
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open
            </button>
          </form>
          {jumpError ? (
            <p className="mt-2 text-xs text-slate-500">
              {jumpError}{" "}
              {jumpError === "Not found in current repos." ? (
                <button type="button" className="text-blue-600 underline" onClick={() => setQueryParam("tab", "tickets")}>
                  Switch to All tickets
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {activeTab === "tickets" ? "Loading tickets…" : "Loading attention items…"}
        </div>
      ) : null}

      {showNoReposEnabled ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No enabled repositories found.</p>
          <p className="mt-1 text-sm text-slate-500">
            Enable a repository in{" "}
            <Link href="/space/settings" className="text-blue-600 underline">
              Settings
            </Link>{" "}
            to see tickets.
          </p>
        </div>
      ) : null}

      {showNoTickets ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">No tickets found yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your enabled repositories are connected, but no tickets are currently indexed.
          </p>
          <div className="mt-5">
            <Link href="/space/settings" className="text-sm font-medium text-blue-600 underline">
              Open settings
            </Link>
          </div>
        </div>
      ) : null}

      {showAllClear ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">No attention items right now</h2>
          <p className="mt-2 text-sm text-slate-600">Attention items are created when tickets are:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>blocked</li>
            <li>CI failing</li>
            <li>in progress and stale for more than 24 hours</li>
            <li>linked to open PRs waiting review</li>
            <li>pending changes</li>
          </ul>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repo summary</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {allRepos.map((repo) => (
                <span
                  key={repo.fullName}
                  className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {repo.fullName}: {repo.attentionTickets}/{repo.totalTickets}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setQueryParam("tab", "tickets")}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              View all tickets
            </button>
          </div>
        </div>
      ) : null}

      {showNoResults ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No attention items match <span className="font-medium">{searchQuery}</span>.
        </div>
      ) : null}

      {!loading && !error && activeTab === "tickets" && activeRows.length === 0 && allRepos.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {searchQuery ? `No tickets match "${searchQuery}".` : "No tickets found for the selected repositories."}
        </div>
      ) : null}

      {!loading && !error && activeRows.length > 0 ? (
        <AttentionTable
          rows={activeRows}
          multiRepo={activeRepos.size > 1 || allRepos.length > 1}
          onOpenTicket={onOpenTicket}
          prMap={prMap}
          ciMap={ciMap}
          showPrCi={activeTab === "attention"}
          reasonMap={activeTab === "attention" ? reasonMap : undefined}
          reasonDetailsMap={activeTab === "attention" ? reasonDetailsMap : undefined}
          mergeReadinessMap={activeTab === "attention" ? mergeReadinessMap : undefined}
          reasonLabels={reasonLabels}
        />
      ) : null}

      {!loading && !error && activeTab === "tickets" && ticketsData ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Showing {ticketsData.tickets.length} of {ticketsData.pagination.total} tickets
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ticketsData.pagination.offset === 0}
              onClick={() => setTicketsOffset((value) => Math.max(0, value - TICKETS_PAGE_SIZE))}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!ticketsData.pagination.hasMore}
              onClick={() => setTicketsOffset((value) => value + TICKETS_PAGE_SIZE)}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {selectedTicketId && selectedTicketRepo ? (
        <TicketDetailModal repo={selectedTicketRepo} ticketId={selectedTicketId} onClose={onCloseTicket} />
      ) : null}
    </div>
  );
}
