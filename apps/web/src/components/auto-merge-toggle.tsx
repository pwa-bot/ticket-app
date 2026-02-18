"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRepoAutoMergeSetting,
  loadAutoMergeSettings,
  setGlobalAutoMerge,
  setRepoAutoMergeOverride,
} from "@/lib/auto-merge-settings";

interface AutoMergeToggleProps {
  repo: string;
}

export function AutoMergeToggle({ repo }: AutoMergeToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [repoSetting, setRepoSetting] = useState<{ value: boolean; source: "global" | "repo" }>({
    value: true,
    source: "global",
  });

  // Load settings on mount
  useEffect(() => {
    const settings = loadAutoMergeSettings();
    setGlobalEnabled(settings.globalDefault);
    setRepoSetting(getRepoAutoMergeSetting(repo));
  }, [repo]);

  const handleGlobalChange = useCallback((enabled: boolean) => {
    setGlobalAutoMerge(enabled);
    setGlobalEnabled(enabled);
    // Update repo setting display if it's using global
    if (repoSetting.source === "global") {
      setRepoSetting({ value: enabled, source: "global" });
    }
  }, [repoSetting.source]);

  const handleRepoChange = useCallback((value: "global" | "enabled" | "disabled") => {
    if (value === "global") {
      setRepoAutoMergeOverride(repo, null);
      setRepoSetting({ value: globalEnabled, source: "global" });
    } else {
      const enabled = value === "enabled";
      setRepoAutoMergeOverride(repo, enabled);
      setRepoSetting({ value: enabled, source: "repo" });
    }
  }, [repo, globalEnabled]);

  const currentStatus = repoSetting.value ? "Auto-merge on" : "Auto-merge off";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        title="Auto-merge settings"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className={repoSetting.value ? "text-green-600" : "text-slate-500"}>
          {currentStatus}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-slate-900">Auto-merge Settings</h4>
            <p className="mt-1 text-xs text-slate-500">
              Control whether ticket-change PRs auto-merge when checks pass.
            </p>

            {/* Global setting */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Global default</p>
                  <p className="text-xs text-slate-500">Applies to all repos</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleGlobalChange(!globalEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    globalEnabled ? "bg-green-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      globalEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Repo override */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">This repository</p>
              <p className="mb-2 text-xs text-slate-500">{repo}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRepoChange("global")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    repoSetting.source === "global"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Use global
                </button>
                <button
                  type="button"
                  onClick={() => handleRepoChange("enabled")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    repoSetting.source === "repo" && repoSetting.value
                      ? "bg-green-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Always on
                </button>
                <button
                  type="button"
                  onClick={() => handleRepoChange("disabled")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    repoSetting.source === "repo" && !repoSetting.value
                      ? "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Always off
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-md bg-slate-50 p-2">
              <p className="text-xs text-slate-600">
                {repoSetting.value ? (
                  <>
                    <span className="font-medium text-green-600">Auto-merge enabled.</span>{" "}
                    PRs will merge automatically when checks pass.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-slate-700">Auto-merge disabled.</span>{" "}
                    PRs will require manual merge.
                  </>
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
