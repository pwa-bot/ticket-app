"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type SavedView,
  buildShareUrl,
  deleteView,
  getViewsForRepo,
  renameView,
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
  const [editingView, setEditingView] = useState<SavedView | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copyLinkCopied, setCopyLinkCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setShowShareDialog(false);
    },
    [currentQuery, repo]
  );

  const handleRenameView = useCallback(
    (name: string) => {
      if (!editingView) return;
      renameView(editingView.id, name);
      setViews(getViewsForRepo(repo));
      setEditingView(null);
    },
    [editingView, repo]
  );

  const triggerCopiedFeedback = useCallback(() => {
    setCopyLinkCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopyLinkCopied(false), 2000);
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const url = buildShareUrl(basePath, currentQuery);
    void navigator.clipboard.writeText(url).then(() => triggerCopiedFeedback());
    setIsOpen(false);
  }, [basePath, currentQuery, triggerCopiedFeedback]);

  const handleOpenShareDialog = useCallback(() => {
    setIsOpen(false);
    setShowShareDialog(true);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Find if current query matches a saved view
  const activeView = views.find((v) => v.query === currentQuery);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span className="max-w-[140px] truncate">
          {activeView ? activeView.name : currentQuery ? "Custom filter" : "All tickets"}
        </span>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div role="listbox" aria-label="Saved views" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <button
              type="button"
              role="option"
              aria-selected={!currentQuery}
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
                    role="option"
                    aria-selected={activeView?.id === view.id}
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
                    <div className="ml-2 hidden items-center gap-1 group-hover:flex">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingView(view);
                          setIsOpen(false);
                        }}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        title="Rename view"
                        aria-label={`Rename ${view.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2M5 19h2m8-14 4 4M5 19l4-1 9-9-3-3-9 9-1 4z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteView(e, view.id)}
                        className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete view"
                        aria-label={`Delete ${view.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {currentQuery && (
              <>
                <div className="my-2 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setShowSaveModal(true);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                >
                  + Save current view
                </button>
                <button
                  type="button"
                  onClick={handleOpenShareDialog}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                >
                  Share link…
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Copy confirmation toast */}
      {copyLinkCopied && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute right-0 top-full z-50 mt-1 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 shadow"
        >
          Link copied!
        </div>
      )}

      {showSaveModal && (
        <SaveViewModal
          mode="save"
          onSave={handleSaveView}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {editingView && (
        <SaveViewModal
          mode="rename"
          initialName={editingView.name}
          onSave={handleRenameView}
          onClose={() => setEditingView(null)}
        />
      )}

      {showShareDialog && currentQuery && (
        <ShareViewDialog
          url={buildShareUrl(basePath, currentQuery)}
          isAlreadySaved={!!activeView}
          onClose={() => setShowShareDialog(false)}
          onCopy={triggerCopiedFeedback}
          onSave={() => {
            setShowShareDialog(false);
            setShowSaveModal(true);
          }}
        />
      )}

      {/* Click outside to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Share dialog ─────────────────────────────────────────────────────────────

interface ShareViewDialogProps {
  url: string;
  isAlreadySaved: boolean;
  onClose: () => void;
  onCopy: () => void;
  onSave: () => void;
}

function ShareViewDialog({ url, isAlreadySaved, onClose, onCopy, onSave }: ShareViewDialogProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      onCopy();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [url, onCopy]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h3 id="share-dialog-title" className="text-lg font-semibold text-slate-900">Share this view</h3>
        <p className="mt-1 text-sm text-slate-500">
          Anyone with this link can see the same filtered queue.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="url"
            readOnly
            value={url}
            aria-label="Shareable link"
            className="min-w-0 flex-1 truncate rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              copied
                ? "border border-green-300 bg-green-50 text-green-700"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {!isAlreadySaved ? (
            <button
              type="button"
              onClick={onSave}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              + Save to my views
            </button>
          ) : (
            <span className="text-sm text-slate-400">Already saved to your views</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Save / Rename modal ──────────────────────────────────────────────────────

interface SaveViewModalProps {
  mode: "save" | "rename";
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

function SaveViewModal({ mode, initialName, onSave, onClose }: SaveViewModalProps) {
  const [name, setName] = useState(initialName ?? "");

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-view-dialog-title"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h3 id="save-view-dialog-title" className="text-lg font-semibold text-slate-900">
          {mode === "save" ? "Save view" : "Rename view"}
        </h3>
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
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {mode === "save" ? "Save" : "Rename"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Save-view banner (for shared URL recipients) ─────────────────────────────

interface SaveViewBannerProps {
  /** The current query string (from searchParams.toString()) */
  currentQuery: string;
  /** The repo context (null = portfolio / all repos) */
  repo: string | null;
  /** The base path for building the share URL */
  basePath: string;
}

/**
 * Shown when a user arrives via a shared URL that has query params but
 * those params don't match any of their saved views. They can dismiss it
 * or save the view with one click.
 */
export function SaveViewBanner({ currentQuery, repo, basePath }: SaveViewBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    setViews(getViewsForRepo(repo));
  }, [repo]);

  // Re-check when query changes
  const activeView = views.find((v) => v.query === currentQuery);

  if (!currentQuery || dismissed || saved || activeView) {
    return null;
  }

  function handleSave(name: string) {
    saveView(name, currentQuery, repo);
    setSaved(true);
    setShowNameModal(false);
  }

  const shareUrl = buildShareUrl(basePath, currentQuery);

  return (
    <>
      <div
        role="banner"
        className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
      >
        <div className="flex items-center gap-2 text-blue-800">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Viewing a shared queue filter</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNameModal(true)}
            className="rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Save to my views
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
            }}
            className="rounded-md border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
            title="Copy share link"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showNameModal && (
        <SaveViewModal
          mode="save"
          onSave={handleSave}
          onClose={() => setShowNameModal(false)}
        />
      )}
    </>
  );
}
