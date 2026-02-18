"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  PendingChange,
  PendingChangeStatus,
  TicketChangePatch,
  CreateChangePrResponse,
  PrStatusResponse,
  ApiEnvelope,
} from "@ticketdotapp/core";
import { shouldAutoMerge } from "@/lib/auto-merge-settings";

// Poll interval for checking PR status
const POLL_INTERVAL_MS = 15_000;

type PendingChangesState = {
  /** Map of ticketId -> pending change */
  changes: Map<string, PendingChange>;
  /** Create a new pending change (calls API) */
  createChange: (args: CreateChangeArgs) => Promise<void>;
  /** Load pending changes from open GitHub PRs (call on board mount to restore across refresh) */
  loadPendingFromGitHub: (owner: string, repo: string) => Promise<void>;
  /** Get pending change for a ticket */
  getPendingChange: (ticketId: string) => PendingChange | undefined;
  /** Dismiss a pending change (remove from UI without affecting Git) */
  dismissChange: (ticketId: string) => void;
  /** Cancel a pending change (close PR on GitHub and remove from UI) */
  cancelChange: (ticketId: string) => Promise<void>;
  /** Retry a pending change (close old PR and create new one) */
  retryChange: (args: CreateChangeArgs) => Promise<void>;
  /** Refresh index.json callback (called when PR merges) */
  onMerged?: () => void;
};

type CreateChangeArgs = {
  owner: string;
  repo: string;
  ticketId: string;
  patch: TicketChangePatch;
  currentState?: string;
};

const PendingChangesContext = createContext<PendingChangesState | null>(null);

export function PendingChangesProvider({
  children,
  onMerged,
}: {
  children: ReactNode;
  onMerged?: () => void;
}) {
  const [changes, setChanges] = useState<Map<string, PendingChange>>(new Map());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Create a new pending change
  const createChange = useCallback(async (args: CreateChangeArgs) => {
    const { owner, repo, ticketId, patch, currentState } = args;

    // Set initial "creating" state
    const initialChange: PendingChange = {
      type: patch.state ? "state_change" : "metadata_change",
      summary: buildSummary(patch, currentState),
      prUrl: "",
      prNumber: 0,
      status: "creating_pr",
      createdAt: new Date().toISOString(),
    };

    setChanges((prev) => new Map(prev).set(ticketId, initialChange));

    try {
      // Call API to create PR
      const fullRepo = `${owner}/${repo}`;
      const autoMerge = shouldAutoMerge(fullRepo);
      
      const response = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tickets/${encodeURIComponent(ticketId)}/changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: patch, autoMerge }),
        }
      );

      const result: ApiEnvelope<CreateChangePrResponse> = await response.json();

      if (!result.ok) {
        // Update with error
        setChanges((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(ticketId);
          if (existing) {
            updated.set(ticketId, {
              ...existing,
              status: "failed",
              error: { code: result.error.code, message: result.error.message },
            });
          }
          return updated;
        });
        return;
      }

      // Update with PR info
      setChanges((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(ticketId);
        if (existing) {
          updated.set(ticketId, {
            ...existing,
            prUrl: result.data.pr_url,
            prNumber: result.data.pr_number,
            status: result.data.status,
          });
        }
        return updated;
      });

      // If auto-merged, trigger board refresh
      if (result.data.status === "merged" && onMerged) {
        setTimeout(onMerged, 500);
      }
    } catch (e) {
      // Network error
      setChanges((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(ticketId);
        if (existing) {
          updated.set(ticketId, {
            ...existing,
            status: "failed",
            error: { code: "unknown", message: e instanceof Error ? e.message : "Network error" },
          });
        }
        return updated;
      });
    }
  }, [onMerged]);

  // Get pending change for a ticket
  const getPendingChange = useCallback(
    (ticketId: string) => changes.get(ticketId),
    [changes]
  );

  // Dismiss a pending change (UI only, doesn't affect GitHub)
  const dismissChange = useCallback((ticketId: string) => {
    setChanges((prev) => {
      const updated = new Map(prev);
      updated.delete(ticketId);
      return updated;
    });
  }, []);

  // Cancel a pending change (close PR on GitHub and remove from UI)
  const cancelChange = useCallback(async (ticketId: string) => {
    const change = changes.get(ticketId);
    if (!change || !change.prUrl || !change.prNumber) {
      dismissChange(ticketId);
      return;
    }

    // Extract owner/repo from prUrl
    const urlMatch = change.prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
    if (!urlMatch) {
      dismissChange(ticketId);
      return;
    }

    const [, owner, repo] = urlMatch;

    try {
      await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/prs/${change.prNumber}/status`,
        { method: "PATCH" }
      );
    } catch {
      // Best effort — still remove from UI
    }

    dismissChange(ticketId);
  }, [changes, dismissChange]);

  // Retry a pending change (close old PR and create new one)
  const retryChange = useCallback(async (args: CreateChangeArgs) => {
    const { ticketId } = args;
    
    // First cancel the existing change
    await cancelChange(ticketId);
    
    // Then create a new one
    await createChange(args);
  }, [cancelChange, createChange]);

  // Load pending changes from open GitHub PRs (restores state across page refresh)
  const loadPendingFromGitHub = useCallback(async (owner: string, repo: string) => {
    try {
      const response = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/ticket-prs`
      );
      const result: ApiEnvelope<{ prs: Array<{ ticketId: string; prNumber: number; prUrl: string; prTitle: string; status: PendingChangeStatus }> }> =
        await response.json();

      if (!result.ok) return;

      setChanges((prev) => {
        const updated = new Map(prev);
        for (const pr of result.data.prs) {
          // Don't overwrite an in-flight change created this session
          if (updated.has(pr.ticketId)) continue;
          updated.set(pr.ticketId, {
            type: "state_change",
            summary: parseSummaryFromPrTitle(pr.prTitle),
            prUrl: pr.prUrl,
            prNumber: pr.prNumber,
            status: pr.status,
            createdAt: new Date().toISOString(),
          });
        }
        return updated;
      });
    } catch {
      // Ignore errors — board still works, just without restored pending state
    }
  }, []);

  // Poll for PR status updates
  useEffect(() => {
    const pollStatus = async () => {
      const pendingPrs = Array.from(changes.entries()).filter(
        ([, change]) =>
          change.prNumber > 0 &&
          !["merged", "failed"].includes(change.status)
      );

      if (pendingPrs.length === 0) return;

      for (const [ticketId, change] of pendingPrs) {
        try {
          // Extract owner/repo from prUrl
          const urlMatch = change.prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
          if (!urlMatch) continue;

          const [, owner, repo] = urlMatch;
          const response = await fetch(
            `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/prs/${change.prNumber}/status`
          );

          const result: ApiEnvelope<PrStatusResponse> = await response.json();
          if (!result.ok) continue;

          const newStatus = mapPrStatusToChangeStatus(result.data);

          setChanges((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(ticketId);
            if (existing && existing.status !== newStatus) {
              updated.set(ticketId, {
                ...existing,
                status: newStatus,
                mergeSignals: {
                  ciStatus: result.data.checks.state,
                  reviewRequired: result.data.reviews.required,
                  requiredReviewers: result.data.reviews.required_reviewers,
                  approvalsCount: result.data.reviews.approvals_count,
                },
              });

              // If merged, trigger refresh
              if (newStatus === "merged" && onMerged) {
                setTimeout(onMerged, 500);
              }
            }
            return updated;
          });
        } catch {
          // Ignore poll errors
        }
      }
    };

    // Start polling
    pollIntervalRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);

    // Initial poll
    pollStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [changes, onMerged]);

  return (
    <PendingChangesContext.Provider
      value={{ changes, createChange, loadPendingFromGitHub, getPendingChange, dismissChange, cancelChange, retryChange, onMerged }}
    >
      {children}
    </PendingChangesContext.Provider>
  );
}

export function usePendingChanges() {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error("usePendingChanges must be used within PendingChangesProvider");
  }
  return context;
}

// Helper functions

function buildSummary(patch: TicketChangePatch, currentState?: string): string {
  if (patch.state && currentState) {
    return `${currentState} → ${patch.state}`;
  }
  if (patch.state) {
    return `state → ${patch.state}`;
  }
  if (patch.priority) {
    return `priority → ${patch.priority}`;
  }
  if (patch.labels_add?.length || patch.labels_remove?.length || patch.labels_replace?.length) {
    return "labels updated";
  }
  if (patch.assignee !== undefined) {
    return "assignee updated";
  }
  if (patch.reviewer !== undefined) {
    return "reviewer updated";
  }
  return "metadata updated";
}

function parseSummaryFromPrTitle(title: string): string {
  const match = title.match(/ticket change:\s*(.+)$/i);
  return match ? match[1].trim() : "pending change";
}

function mapPrStatusToChangeStatus(pr: PrStatusResponse): PendingChangeStatus {
  if (pr.merged) return "merged";
  if (pr.mergeable === false) return "conflict";
  if (pr.checks.state === "fail") return "pending_checks";
  if (pr.reviews.required && (pr.reviews.approvals_count ?? 0) < 1) return "waiting_review";
  if (pr.mergeable === true && pr.checks.state === "pass") return "mergeable";
  return "pending_checks";
}
