"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiErrorMessage } from "@/lib/api/client";

type Installation = {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
};

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData().then(() => {
      // Auto-refresh if no installations found (user might have just installed)
      setTimeout(() => {
        refreshInstallations();
      }, 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const [iRes, uRes] = await Promise.all([
        fetch("/api/github/installations"),
        fetch("/api/github/app/install-url"),
      ]);

      const iJson = await iRes.json();
      const uJson = await uRes.json();

      setInstallations(iJson.installations ?? []);
      setInstallUrl(uJson.url ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshInstallations() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/github/installations/refresh", { method: "POST" });
      const json = await res.json();
      console.log("[Settings] Refresh response:", json);
      if (json.ok) {
        setInstallations(json.installations ?? []);
        if (json.installations?.length === 0) {
          setRefreshError("No installations found. Make sure you've installed the GitHub App on your account.");
        }
      } else {
        setRefreshError(getApiErrorMessage(json, "Failed to refresh. Try logging out and back in."));
      }
    } catch (err) {
      console.error("[Settings] Refresh error:", err);
      setRefreshError("Network error. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  const hasInstallations = installations.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your GitHub connection and app installation.
          </p>
        </div>
        <Link
          href="/space"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to boards
        </Link>
      </header>

      {/* GitHub App Installation */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-medium text-slate-900">GitHub App</h2>
          <p className="mt-1 text-sm text-slate-600">
            Install the Ticket GitHub App for real-time sync via webhooks and higher API limits.
          </p>
          <details className="mt-3">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
              Why do I need the app?
            </summary>
            <div className="mt-2 text-sm text-slate-600 space-y-2">
              <p>
                The GitHub App enables <strong>webhooks</strong> — when you push changes, your board updates automatically.
              </p>
              <p>
                Without the app, boards still work. You&apos;ll just need to refresh manually to see changes.
              </p>
            </div>
          </details>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-slate-600">Loading...</p>
          ) : hasInstallations ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">App installed</span>
              </div>
              
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
                {installations.map((inst) => (
                  <div key={inst.installationId} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="font-medium text-slate-900">{inst.accountLogin}</span>
                      <span className="ml-2 text-xs text-slate-500">{inst.accountType}</span>
                    </div>
                    <a
                      href={inst.accountType === "Organization" 
                        ? `https://github.com/organizations/${inst.accountLogin}/settings/installations/${inst.installationId}`
                        : `https://github.com/settings/installations/${inst.installationId}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-600 hover:text-slate-900 underline"
                    >
                      Manage
                    </a>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {installUrl && (
                  <a
                    href={installUrl}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add another account
                  </a>
                )}
                <button
                  onClick={refreshInstallations}
                  disabled={refreshing}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-sm font-medium text-amber-700">App not installed</span>
              </div>
              
              <p className="text-sm text-slate-600">
                Install the GitHub App to unlock:
              </p>
              <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                <li><strong>Real-time sync</strong> — changes appear instantly via webhooks</li>
                <li><strong>Higher API limits</strong> — no more rate limit errors</li>
                <li><strong>Background updates</strong> — board stays fresh automatically</li>
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                {installUrl && (
                  <a
                    href={installUrl}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Install GitHub App
                  </a>
                )}
                <button
                  onClick={refreshInstallations}
                  disabled={refreshing}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {refreshing ? "Checking..." : "Refresh"}
                </button>
              </div>
              
              {refreshError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {refreshError}
                  <div className="mt-2">
                    <a
                      href="/api/auth/reconnect"
                      className="text-sm font-medium text-red-800 underline hover:text-red-900"
                    >
                      Reconnect GitHub account →
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Account */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-medium text-slate-900">Account</h2>
        </div>
        <div className="p-6">
          <a
            href="/api/auth/logout"
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Log out
          </a>
        </div>
      </section>
    </div>
  );
}
