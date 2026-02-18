"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RateLimitError, isRateLimitError } from "@/components/rate-limit-error";

interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

interface Installation {
  installationId: number;
  accountLogin: string;
  accountType: string;
}

export default function RepoSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const initial = searchParams
      .get("repos")
      ?.split(",")
      .map((repo) => repo.trim())
      .filter(Boolean);

    if (initial?.length) {
      setSelected(Array.from(new Set(initial)));
    }
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRepos() {
      try {
        const [reposResponse, installationsResponse] = await Promise.all([
          fetch("/api/repos", { signal: controller.signal, cache: "no-store" }),
          fetch("/api/github/installations", { signal: controller.signal }),
        ]);

        if (!reposResponse.ok) {
          throw new Error("Failed to load repositories");
        }

        const reposData = (await reposResponse.json()) as { repos: RepoSummary[] };
        setRepos(reposData.repos);
        
        if (installationsResponse.ok) {
          const installationsData = (await installationsResponse.json()) as { installations: Installation[] };
          setInstallations(installationsData.installations ?? []);
        }
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

    void loadRepos();

    return () => controller.abort();
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  
  // Check if a repo has GitHub App access (by matching owner to installation account)
  // Must be before early returns to satisfy React hooks rules
  const installationLogins = useMemo(
    () => new Set(installations.map((i) => i.accountLogin.toLowerCase())),
    [installations]
  );
  const hasAnyInstallation = installations.length > 0;

  function toggleRepo(fullName: string) {
    setSelected((current) => {
      if (current.includes(fullName)) {
        return current.filter((repo) => repo !== fullName);
      }

      return [...current, fullName];
    });
  }

  function viewSelected() {
    if (selected.length === 0) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("repos", selected.join(","));
    params.set("view", "table");
    params.delete("ticket");
    params.delete("ticketRepo");
    router.push(`/space?${params.toString()}`);
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading repositories...</div>;
  }

  if (error) {
    const isAuthError = error.includes("authentication") || error.includes("expired") || error.includes("401");
    
    if (isRateLimitError(error)) {
      return (
        <RateLimitError
          error={error}
          onRetry={() => window.location.reload()}
          
        />
      );
    }
    
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="text-sm font-medium text-amber-800">
          {isAuthError ? "GitHub connection expired" : "Failed to load repositories"}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {isAuthError 
            ? "Your GitHub authorization has expired. Click below to reconnect."
            : error
          }
        </p>
        {isAuthError && (
          <a
            href="/api/auth/reconnect"
            className="mt-4 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Reconnect GitHub
          </a>
        )}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No repositories with `.tickets/index.json` were found for this account.
      </div>
    );
  }

  function hasAppAccess(repoFullName: string): boolean {
    const owner = repoFullName.split("/")[0]?.toLowerCase();
    const hasAccess = owner ? installationLogins.has(owner) : false;
    return hasAccess;
  }

  // Compute which owners need installation
  const repoOwners = useMemo(() => {
    const owners = new Map<string, { count: number; hasApp: boolean }>();
    for (const repo of repos) {
      const owner = repo.full_name.split("/")[0];
      if (!owner) continue;
      const existing = owners.get(owner) || { count: 0, hasApp: false };
      existing.count++;
      existing.hasApp = installationLogins.has(owner.toLowerCase());
      owners.set(owner, existing);
    }
    return owners;
  }, [repos, installationLogins]);

  const ownersNeedingInstall = useMemo(() => 
    Array.from(repoOwners.entries())
      .filter(([_, info]) => !info.hasApp)
      .map(([owner]) => owner),
    [repoOwners]
  );

  const hasMismatch = hasAnyInstallation && ownersNeedingInstall.length > 0;

  return (
    <div className="space-y-4">
      {/* Mismatch banner - app installed but on wrong account */}
      {hasMismatch && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            GitHub App not installed on: {ownersNeedingInstall.join(", ")}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Your repos are owned by {ownersNeedingInstall.length === 1 ? "an account" : "accounts"} where the app isn't installed yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ownersNeedingInstall.map((owner) => (
              <a
                key={owner}
                href={`https://github.com/apps/ticketdotapp/installations/new/permissions?target_id=${owner}`}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Install on {owner}
              </a>
            ))}
            <a
              href="/space/settings"
              className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              View installations
            </a>
          </div>
        </div>
      )}
      
      {/* No app installed at all */}
      {!hasAnyInstallation && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">
            Install GitHub App for real-time sync
          </p>
          <p className="mt-1 text-sm text-blue-700">
            Your repos are owned by: {Array.from(repoOwners.keys()).join(", ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from(repoOwners.keys()).map((owner) => (
              <a
                key={owner}
                href="https://github.com/apps/ticketdotapp/installations/new"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Install on {owner}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {repos.map((repo) => {
            const hasApp = hasAppAccess(repo.full_name);
            
            return (
              <li key={repo.id} className="flex items-center justify-between gap-4 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(repo.full_name)}
                    onChange={() => toggleRepo(repo.full_name)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{repo.full_name}</span>
                    <span className="text-xs text-slate-500">{repo.private ? "Private" : "Public"}</span>
                    {!hasApp && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        needs app
                      </span>
                    )}
                  </span>
                </label>
                {(() => {
                  const [owner, name] = repo.full_name.split("/");
                  if (!owner || !name) {
                    return null;
                  }

                  return (
                    <a
                      href={`/space/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                      className="text-xs font-medium text-slate-600 underline"
                    >
                      Open board
                    </a>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{selected.length} selected</p>
        <button
          type="button"
          onClick={viewSelected}
          disabled={selected.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          View Selected
        </button>
      </div>
    </div>
  );
}
