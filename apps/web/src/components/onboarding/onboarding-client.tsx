"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiErrorMessage } from "@/lib/api/client";

type Installation = {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
};

type RepoItem = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  enabled: boolean;
  hasTicketsIndex: boolean | null;
  sync?: {
    status: "ok" | "syncing" | "error";
    lastSyncedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  } | null;
};

export default function OnboardingClient() {
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<number | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  // Load installations on mount
  useEffect(() => {
    (async () => {
      try {
        const [iRes, uRes] = await Promise.all([
          fetch("/api/github/installations"),
          fetch("/api/github/app/install-url"),
        ]);
        
        const iJson = await iRes.json();
        const uJson = await uRes.json();
        
        setInstallations(iJson.installations ?? []);
        setInstallUrl(uJson.url ?? null);
        
        // Auto-select if only one installation
        if ((iJson.installations ?? []).length === 1) {
          setSelectedInstallationId(iJson.installations[0].installationId);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load repos when installation is selected
  useEffect(() => {
    if (!selectedInstallationId) return;
    
    setLoadingRepos(true);
    (async () => {
      try {
        const res = await fetch(`/api/github/installations/${selectedInstallationId}/repos`);
        const json = await res.json();
        setRepos(json.repos ?? []);
      } finally {
        setLoadingRepos(false);
      }
    })();
  }, [selectedInstallationId]);

  const enabledCount = useMemo(() => repos.filter((r) => r.enabled).length, [repos]);

  async function toggleRepo(owner: string, repo: string, enabled: boolean) {
    const key = `${owner}/${repo}`;
    setBusyRepo(key);
    
    try {
      const res = await fetch("/api/repos/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, enabled }),
      });
      
      const json = await res.json();
      if (!json.ok) throw new Error(getApiErrorMessage(json, "Failed to update"));
      
      // Optimistic update
      setRepos((prev) =>
        prev.map((r) => (r.owner === owner && r.repo === repo ? { ...r, enabled } : r))
      );
      
      // Refresh after a delay to get sync status
      if (enabled) {
        setTimeout(async () => {
          const res = await fetch(`/api/github/installations/${selectedInstallationId}/repos`);
          const json = await res.json();
          setRepos(json.repos ?? []);
        }, 2000);
      }
    } catch (error) {
      console.error("Toggle error:", error);
    } finally {
      setBusyRepo(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading...
      </div>
    );
  }

  const hasInstallations = installations.length > 0;

  const currentStep = useMemo(() => {
    if (!hasInstallations) return 1;
    if (enabledCount === 0) return 2;
    return 3;
  }, [hasInstallations, enabledCount]);

  return (
    <div className="space-y-8">
      {/* Progress Indicator */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-900">Setup Progress</span>
          <div className="flex-1 bg-slate-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
          <span className="text-sm text-slate-600">{currentStep}/3</span>
        </div>
      </div>

      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Connect GitHub
        </h1>
        <p className="text-slate-600">
          Install the Ticket GitHub App and enable repositories. Ticket syncs via webhooks — Git remains authoritative.
        </p>
      </header>

      {/* Step Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StepCard
          step={1}
          title="Sign in"
          description="You're signed in with GitHub."
          status="done"
        />
        <StepCard
          step={2}
          title="Install GitHub App"
          description="Install on your account or organization."
          status={hasInstallations ? "done" : "todo"}
          action={
            installUrl ? (
              <a
                href={installUrl}
                className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {hasInstallations ? "Add another" : "Install App"}
              </a>
            ) : null
          }
        />
        <StepCard
          step={3}
          title="Enable repos"
          description="Choose which repos to index."
          status={hasInstallations ? (enabledCount > 0 ? "done" : "todo") : "locked"}
        />
      </div>

      {/* No installations message */}
      {!hasInstallations && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-800">
            <strong>No GitHub App installation found.</strong> Click &quot;Install App&quot; above to get started.
          </p>
        </div>
      )}

      {/* Installation & Repos */}
      {hasInstallations && (
        <div className="space-y-4">
          {/* Installation selector */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Installation</div>
              <div className="text-xs text-slate-500">Select where the app is installed</div>
            </div>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={selectedInstallationId ?? ""}
              onChange={(e) => setSelectedInstallationId(Number(e.target.value))}
            >
              <option value="" disabled>
                Select...
              </option>
              {installations.map((i) => (
                <option key={i.installationId} value={i.installationId}>
                  {i.accountLogin} ({i.accountType})
                </option>
              ))}
            </select>
          </div>

          {/* Repos list */}
          {selectedInstallationId && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-medium text-slate-900">Repositories</div>
                <div className="text-xs text-slate-500">{enabledCount} enabled</div>
              </div>

              {loadingRepos ? (
                <div className="p-6 text-sm text-slate-600">Loading repos...</div>
              ) : repos.length === 0 ? (
                <div className="p-6 text-sm text-slate-600">
                  No repos found. Make sure the app has access to your repositories.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {repos.map((r) => {
                    const key = `${r.owner}/${r.repo}`;
                    const isBusy = busyRepo === key;
                    
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {r.fullName}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {r.hasTicketsIndex === true && (
                              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                has .tickets/
                              </span>
                            )}
                            {r.hasTicketsIndex === false && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                no .tickets/
                              </span>
                            )}
                            {r.sync?.status === "syncing" && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                syncing...
                              </span>
                            )}
                            {r.sync?.status === "error" && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                                sync error
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={r.enabled}
                            disabled={isBusy}
                            onChange={(e) => toggleRepo(r.owner, r.repo, e.target.checked)}
                          />
                          <span className="text-sm text-slate-600">
                            {r.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Continue button */}
          <div className="flex justify-end">
            <Link
              href="/space"
              className="inline-flex rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Continue to Dashboard →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
  status,
  action,
}: {
  step: number;
  title: string;
  description: string;
  status: "todo" | "done" | "locked";
  action?: React.ReactNode;
}) {
  const statusColors = {
    todo: "border-slate-200 bg-white",
    done: "border-green-200 bg-green-50",
    locked: "border-slate-200 bg-slate-50 opacity-60",
  };

  const statusLabels = {
    todo: "To do",
    done: "Done",
    locked: "Locked",
  };

  return (
    <div className={`rounded-xl border p-5 ${statusColors[status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          {step}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            status === "done"
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {statusLabels[status]}
        </span>
      </div>
      <h3 className="mt-3 font-medium text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
