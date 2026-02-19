"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttentionTable from "@/components/attention-table";
import TicketDetailModal from "@/components/ticket-detail-modal";
import type { LinkedPrSummary } from "@/components/pr-status-badge";
import type { CiStatus, AttentionRow } from "@/lib/attention";
import type { Actor } from "@/lib/types";
import type { AttentionItem, AttentionResponse, EnabledRepoSummary } from "@/app/api/space/attention/route";

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

const REASON_LABELS: Record<string, string> = {
  blocked: "Blocked",
  ci_failing: "CI failing",
  stale_in_progress: "Stale (>24h)",
  pr_waiting_review: "Open PR",
  pending_pr: "Pending change",
};

export default function PortfolioAttentionView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<AttentionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Repo filter from URL ?repos=... (optional)
  const repoParam = searchParams.get("repos");
  const selectedRepos = useMemo(() => {
    if (!repoParam) return null; // null = all repos
    return new Set(repoParam.split(",").map((r) => r.trim()).filter(Boolean));
  }, [repoParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (repoParam) params.set("repos", repoParam);
      const url = `/api/space/attention${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load attention data (${res.status})`);
      const json = (await res.json()) as AttentionResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [repoParam]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ticket modal
  const selectedTicketId = searchParams.get("ticket");
  const selectedTicketRepo = searchParams.get("ticketRepo");

  function setQueryParam(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function onOpenTicket(repo: string, ticketId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ticket", ticketId);
    params.set("ticketRepo", repo);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onCloseTicket() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ticket");
    params.delete("ticketRepo");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // Toggle a repo in the filter
  // Click = solo that repo (show only it). Click again = show all.
  function toggleRepo(fullName: string) {
    const current = data?.repos ?? [];
    const all = new Set(current.map((r) => r.fullName));
    const active = selectedRepos ?? all;

    // If this repo is the only one selected, deselect it (show all)
    if (active.size === 1 && active.has(fullName)) {
      setQueryParam("repos", undefined);
      return;
    }

    // Otherwise, solo this repo
    setQueryParam("repos", fullName);
  }

  const allRepos = data?.repos ?? [];
  const activeRepos = selectedRepos ?? new Set(allRepos.map((r) => r.fullName));

  // Filter items by selected repos
  const visibleItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => activeRepos.has(item.repoFullName));
  }, [data, activeRepos]);

  // Apply search filter
  const searchLower = search.toLowerCase();
  const filteredItems = useMemo(() => {
    if (!searchLower) return visibleItems;
    return visibleItems.filter(
      (item) =>
        item.title.toLowerCase().includes(searchLower) ||
        item.displayId.toLowerCase().includes(searchLower) ||
        item.repoFullName.toLowerCase().includes(searchLower) ||
        (item.assignee ?? "").toLowerCase().includes(searchLower),
    );
  }, [visibleItems, searchLower]);

  const rows = useMemo(() => filteredItems.map(itemToAttentionRow), [filteredItems]);
  const prMap = useMemo(() => itemToPrMap(filteredItems), [filteredItems]);
  const ciMap = useMemo(() => itemToCiMap(filteredItems), [filteredItems]);

  const loadedAt = data?.loadedAt ? new Date(data.loadedAt).toLocaleString() : null;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attention</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "Loading…" : `${filteredItems.length} items needing attention`}
            {loadedAt ? (
              <span className="ml-2 text-slate-400">· cached {loadedAt}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <a
            href="/space/settings"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Settings
          </a>
          <a
            href="/api/auth/logout"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Log out
          </a>
        </div>
      </header>

      {/* Controls: repo filter + search */}
      <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
        {/* Repo selector */}
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Repositories</p>
          <div className="flex flex-wrap gap-2">
            {allRepos.length === 0 && !loading && (
              <span className="text-sm text-slate-500">No enabled repos found.</span>
            )}
            {allRepos.map((r) => {
              const isActive = activeRepos.has(r.fullName);
              return (
                <button
                  key={r.fullName}
                  type="button"
                  onClick={() => toggleRepo(r.fullName)}
                  className={`max-w-[240px] rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title={r.fullName}
                >
                  <span className="block truncate">{r.fullName}</span>
                </button>
              );
            })}
            {allRepos.length > 1 && (
              <button
                type="button"
                onClick={() => setQueryParam("repos", undefined)}
                className="text-xs text-slate-400 underline hover:text-slate-600"
              >
                Show all
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="w-64">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Search</p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title, ID, repo…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Reason legend */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="font-medium">Attention reasons:</span>
          {Object.entries(REASON_LABELS).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <AttentionTable
          rows={rows}
          multiRepo={activeRepos.size > 1 || allRepos.length > 1}
          onOpenTicket={onOpenTicket}
          prMap={prMap}
          ciMap={ciMap}
        />
      )}

      {/* Empty state when loading */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading attention items…
        </div>
      )}

      {/* No items state */}
      {!loading && !error && filteredItems.length === 0 && allRepos.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-lg font-medium text-green-800">All clear!</p>
          <p className="mt-1 text-sm text-green-700">No tickets need attention right now.</p>
        </div>
      )}

      {/* No repos enabled */}
      {!loading && !error && allRepos.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No enabled repositories found.</p>
          <p className="mt-1 text-sm text-slate-500">
            Enable a repository in{" "}
            <a href="/space/settings" className="text-blue-600 underline">
              Settings
            </a>{" "}
            to see attention items.
          </p>
        </div>
      )}

      {/* Ticket modal */}
      {selectedTicketId && selectedTicketRepo ? (
        <TicketDetailModal repo={selectedTicketRepo} ticketId={selectedTicketId} onClose={onCloseTicket} />
      ) : null}
    </div>
  );
}
