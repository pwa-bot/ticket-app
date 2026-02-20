"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePendingChangesSafe } from "@/lib/pending-changes";
import { getApiErrorMessage } from "@/lib/api/client";
import PendingBadge from "@/components/pending-badge";
import { EditableSelect, EditableText } from "@/components/editable-field";
import type { TicketState } from "@ticketdotapp/core";
import type { TicketChangePatch } from "@ticketdotapp/core";

interface TicketDetail {
  id: string;
  display_id: string;
  repo: string;
  path: string;
  html_url: string | null;
  frontmatter: {
    id: string;
    title: string;
    state: TicketState;
    priority: string;
    labels: string[];
    assignee?: string;
    reviewer?: string;
    [key: string]: unknown;
  };
  body: string | null;
  linked_prs: Array<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    mergeable?: boolean;
    checks_status?: "pending" | "success" | "failure";
    review_status?: "approved" | "changes_requested" | "pending";
  }>;
}

interface InitialTicketData {
  id: string;
  short_id?: string;
  display_id?: string;
  title: string;
  state: string;
  priority: string;
  labels?: string[];
  assignee?: string | null;
  reviewer?: string | null;
  path?: string;
}

interface TicketDetailModalProps {
  repo: string;
  ticketId: string;
  onClose: () => void;
  initialData?: InitialTicketData;
}

const STATE_COLORS: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-700",
  ready: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  p0: "bg-red-100 text-red-700 border-red-200",
  p1: "bg-orange-100 text-orange-700 border-orange-200",
  p2: "bg-yellow-100 text-yellow-700 border-yellow-200",
  p3: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function TicketDetailModal({ repo, ticketId, onClose, initialData }: TicketDetailModalProps) {
  // Initialize with data from board index if available
  const [ticket, setTicket] = useState<TicketDetail | null>(
    initialData ? {
      id: initialData.id,
      display_id: initialData.display_id || `TK-${(initialData.short_id || initialData.id.slice(0, 8)).toUpperCase()}`,
      repo,
      path: initialData.path || `.tickets/tickets/${initialData.id}.md`,
      html_url: null,
      frontmatter: {
        id: initialData.id,
        title: initialData.title,
        state: initialData.state as TicketState,
        priority: initialData.priority,
        labels: initialData.labels || [],
        assignee: initialData.assignee ?? undefined,
        reviewer: initialData.reviewer ?? undefined,
      },
      body: null, // Will be loaded
      linked_prs: [],
    } : null
  );
  const [loadingBody, setLoadingBody] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pendingChanges = usePendingChangesSafe();
  const [owner, repoName] = repo.split("/");

  const pendingChange = ticket && pendingChanges ? pendingChanges.getPendingChange(ticket.id) : null;

  // Save a field change
  const saveChange = useCallback(async (patch: TicketChangePatch) => {
    if (!ticket || !pendingChanges) return;
    await pendingChanges.createChange({
      owner,
      repo: repoName,
      ticketId: ticket.id,
      patch,
      currentState: ticket.frontmatter.state,
    });
  }, [ticket, owner, repoName, pendingChanges]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTicketBody() {
      setLoadingBody(true);
      setError(null);

      try {
        const response = await fetch(`/api/ticket/${encodeURIComponent(ticketId)}?repo=${encodeURIComponent(repo)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(getApiErrorMessage(data, "Failed to load ticket detail"));
        }

        const data = (await response.json()) as TicketDetail;
        setTicket(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingBody(false);
        }
      }
    }

    void loadTicketBody();

    return () => controller.abort();
  }, [repo, ticketId]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const handleCopyLink = useCallback(() => {
    const [owner, repoName] = repo.split("/");
    const url = `${window.location.origin}/space/${owner}/${repoName}/${ticketId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [repo, ticketId]);

  const displayId = ticket?.display_id || `TK-${ticketId.slice(0, 8)}`;
  const fm = ticket?.frontmatter;
  const templateValue = fm
    ? (typeof fm.template === "string" && fm.template.trim()
        ? fm.template.trim().toLowerCase()
        : fm.labels?.find((label) => label.startsWith("template:"))?.slice("template:".length))
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50" onClick={onClose}>
      {/* Side panel - slides in from right */}
      <div
        className="h-full w-full max-w-2xl overflow-y-auto overscroll-contain bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-slate-500">{displayId}</span>
                <span className="text-slate-300">•</span>
                <span className="truncate text-xs text-slate-500">{repo}</span>
                {pendingChange && (
                  <PendingBadge change={pendingChange} />
                )}
              </div>
              {fm && (
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{fm.title}</h2>
              )}
              {fm && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EditableSelect
                    value={fm.state}
                    options={[
                      { value: "backlog", label: "Backlog" },
                      { value: "ready", label: "Ready" },
                      { value: "in_progress", label: "In Progress" },
                      { value: "blocked", label: "Blocked" },
                      { value: "done", label: "Done" },
                    ]}
                    onSave={async (value) => saveChange({ state: value as TicketState })}
                    disabled={!!pendingChange}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_COLORS[fm.state] || "bg-slate-100"}`}
                    renderValue={(v) => v.replace("_", " ")}
                  />
                  <EditableSelect
                    value={fm.priority}
                    options={[
                      { value: "p0", label: "P0", className: "text-red-700 font-bold" },
                      { value: "p1", label: "P1", className: "text-orange-700 font-semibold" },
                      { value: "p2", label: "P2", className: "text-yellow-700" },
                      { value: "p3", label: "P3", className: "text-slate-600" },
                    ]}
                    onSave={async (value) => saveChange({ priority: value as "p0" | "p1" | "p2" | "p3" })}
                    disabled={!!pendingChange}
                    className={`rounded border px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_COLORS[fm.priority] || "bg-slate-100"}`}
                    renderValue={(v) => v.toUpperCase()}
                  />
                  {fm.labels?.filter((label) => !label.startsWith("template:")).map((label) => (
                    <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {label}
                    </span>
                  ))}
                  {templateValue && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      template:{templateValue}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Close (Esc)"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy link
                </>
              )}
            </button>
            {ticket?.html_url && (
              <a
                href={ticket.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                View on GitHub
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
              {error.includes("not found") && (
                <p className="mt-2 text-xs">Try running <code className="rounded bg-red-100 px-1">ticket rebuild-index</code> and push.</p>
              )}
            </div>
          )}

          {!error && ticket && (
            <div className="space-y-6">
              {/* Linked PRs */}
              {ticket.linked_prs.length > 0 && (
                <section>
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Linked Pull Requests</h4>
                  <div className="space-y-2">
                    {ticket.linked_prs.map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${pr.state === "open" ? "bg-green-500" : pr.state === "merged" ? "bg-purple-500" : "bg-red-500"}`} />
                          <span className="font-medium">#{pr.number}</span>
                          <span className="text-slate-600">{pr.title}</span>
                        </div>
                        <span className="rounded border border-slate-200 px-2 py-0.5 text-xs uppercase text-slate-500">
                          {pr.state}
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Ticket Body */}
              <section>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Description</h4>
                <article className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 p-4 prose-slate prose-headings:text-slate-900 prose-a:text-blue-600">
                  {loadingBody && !ticket.body ? (
                    <p className="text-slate-500">Loading...</p>
                  ) : ticket.body ? (
                    <ReactMarkdown>{ticket.body}</ReactMarkdown>
                  ) : (
                    <p className="italic text-slate-500">No description provided.</p>
                  )}
                </article>
              </section>

              {/* Metadata */}
              <section>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Details</h4>
                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <dt className="text-slate-500">Assignee</dt>
                  <dd className="font-medium text-slate-900">
                    <EditableText
                      value={fm?.assignee}
                      placeholder="Unassigned"
                      onSave={async (value) => saveChange({ assignee: value ? `human:${value}` as const : null })}
                      disabled={!!pendingChange}
                    />
                  </dd>
                  <dt className="text-slate-500">Reviewer</dt>
                  <dd className="font-medium text-slate-900">
                    <EditableText
                      value={fm?.reviewer}
                      placeholder="No reviewer"
                      onSave={async (value) => saveChange({ reviewer: value ? `human:${value}` as const : null })}
                      disabled={!!pendingChange}
                    />
                  </dd>
                  <dt className="text-slate-500">File</dt>
                  <dd className="truncate font-mono text-xs text-slate-600">{ticket.path}</dd>
                </dl>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
