"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type SavedView,
  deleteView,
  getViewsForRepo,
  saveView,
} from "@/lib/saved-views";

interface SavedViewsDropdownProps {
  repo: string | null;
  basePath: string;
}

export function SavedViewsDropdown({ repo, basePath }: SavedViewsDropdownProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Load views on mount and when repo changes
  useEffect(() => {
    setViews(getViewsForRepo(repo));
  }, [repo]);

  const currentQuery = searchParams.toString();

  const handleSelectView = useCallback(
    (view: SavedView) => {
      router.push(`${basePath}?${view.query}`);
      setIsOpen(false);
    },
    [router, basePath]
  );

  const handleDeleteView = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteView(id);
      setViews(getViewsForRepo(repo));
    },
    [repo]
  );

  const handleClearFilters = useCallback(() => {
    router.push(basePath);
    setIsOpen(false);
  }, [router, basePath]);

  const handleSaveView = useCallback(
    (name: string) => {
      if (!currentQuery) return;
      saveView(name, currentQuery, repo);
      setViews(getViewsForRepo(repo));
      setShowSaveModal(false);
    },
    [currentQuery, repo]
  );

  const handleCopyShareLink = useCallback(() => {
    const url = `${window.location.origin}${basePath}?${currentQuery}`;
    navigator.clipboard.writeText(url);
  }, [basePath, currentQuery]);

  // Find if current query matches a saved view
  const activeView = views.find((v) => v.query === currentQuery);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {activeView ? activeView.name : currentQuery ? "Custom filter" : "All tickets"}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <button
              type="button"
              onClick={handleClearFilters}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                !currentQuery ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
              }`}
            >
              All tickets
            </button>

            {views.length > 0 && (
              <>
                <div className="my-2 border-t border-slate-100" />
                <div className="px-3 py-1 text-xs font-medium text-slate-500">Saved views</div>
                {views.map((view) => (
                  <div
                    key={view.id}
                    className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                      activeView?.id === view.id ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectView(view)}
                      className="flex-1 text-left"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteView(e, view.id)}
                      className="ml-2 hidden text-slate-400 hover:text-red-500 group-hover:block"
                      title="Delete view"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </>
            )}

            {currentQuery && (
              <>
                <div className="my-2 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => setShowSaveModal(true)}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                >
                  + Save current view
                </button>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                >
                  Copy share link
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showSaveModal && (
        <SaveViewModal
          onSave={handleSaveView}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

interface SaveViewModalProps {
  onSave: (name: string) => void;
  onClose: () => void;
}

function SaveViewModal({ onSave, onClose }: SaveViewModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Save view</h3>
        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name (e.g., My P0s)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
