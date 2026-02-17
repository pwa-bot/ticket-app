"use client";

import { useEffect, useState } from "react";

interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

export default function RepoPicker() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRepos() {
      try {
        const response = await fetch("/api/repos", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load repositories");
        }

        const data = (await response.json()) as { repos: RepoSummary[] };
        setRepos(data.repos);
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

    loadRepos();

    return () => controller.abort();
  }, []);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading repositories...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  }

  if (repos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No repositories with `.tickets/index.json` were found for this account.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {repos.map((repo) => {
        const [owner, name] = repo.full_name.split("/");
        if (!owner || !name) {
          return null;
        }

        return (
          <a
            key={repo.id}
            href={`/space/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <p className="text-lg font-semibold">{repo.full_name}</p>
            <p className="mt-2 text-sm text-slate-600">{repo.private ? "Private" : "Public"} repository</p>
            <p className="mt-3 text-xs text-slate-500">Open board</p>
          </a>
        );
      })}
    </div>
  );
}
