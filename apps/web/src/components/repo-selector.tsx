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
  
  // All useMemo hooks MUST be before early returns (React hooks rules)
  const installationLogins = useMemo(
    () => new Set(installations.map((i) => i.accountLogin.toLowerCase())),
    [installations]
  );
  
  // Unused computed value - commented out to fix linting
  // const repoOwners = useMemo(() => {
  //   const owners = new Map<string, { count: number; hasApp: boolean }>();
  //   for (const repo of repos) {
  //     const owner = repo.full_name.split("/")[0];
  //     if (!owner) continue;
  //     const existing = owners.get(owner) || { count: 0, hasApp: false };
  //     existing.count++;
  //     existing.hasApp = installationLogins.has(owner.toLowerCase());
  //     owners.set(owner, existing);
  //   }
  //   return owners;
  // }, [repos, installationLogins]);

  // Unused computed value - commented out to fix linting
  // const ownersNeedingInstall = useMemo(() => 
  //   Array.from(repoOwners.entries())
  //     .filter(([, info]) => !info.hasApp)
  //     .map(([owner]) => owner),
  //   [repoOwners]
  // );

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
    return owner ? installationLogins.has(owner) : false;
  }

  return (
    <div className="space-y-4">
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
                    {hasApp ? (
                      <span title="GitHub App connected" className="text-sm">⚡</span>
                    ) : (
                      <span title="OAuth only" className="text-sm opacity-40">⚡</span>
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
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600">{selected.length} selected</p>
          <button
            type="button"
            onClick={() => {
              if (selected.length === repos.length) {
                setSelected([]);
              } else {
                setSelected(repos.map((r) => r.full_name));
              }
            }}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 underline"
          >
            {selected.length === repos.length ? "Deselect all" : "Select all"}
          </button>
        </div>
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
