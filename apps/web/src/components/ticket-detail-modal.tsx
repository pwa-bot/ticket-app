"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

interface TicketDetail {
  id: string;
  repo: string;
  path: string;
  html_url: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
}

interface TicketDetailModalProps {
  repo: string;
  ticketId: string;
  onClose: () => void;
}

export default function TicketDetailModal({ repo, ticketId, onClose }: TicketDetailModalProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTicket() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/ticket/${encodeURIComponent(ticketId)}?repo=${encodeURIComponent(repo)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load ticket detail");
        }

        const data = (await response.json()) as TicketDetail;
        setTicket(data);
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

    void loadTicket();

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

  const sortedFields = useMemo(() => {
    if (!ticket) {
      return [];
    }

    return Object.entries(ticket.frontmatter).sort(([a], [b]) => a.localeCompare(b));
  }, [ticket]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="text-lg font-semibold">Ticket {ticketId}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {loading && <div className="p-6 text-sm text-slate-600">Loading ticket...</div>}
        {error && <div className="p-6 text-sm text-red-700">{error}</div>}

        {!loading && !error && ticket && (
          <div className="space-y-6 p-6">
            <section>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Frontmatter</h4>
              <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                {sortedFields.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[120px_1fr] gap-3">
                    <dt className="font-medium text-slate-700">{key}</dt>
                    <dd className="break-all text-slate-900">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Markdown</h4>
              <article className="prose max-w-none rounded-lg border border-slate-200 bg-white p-4 prose-slate">
                <ReactMarkdown>{ticket.body}</ReactMarkdown>
              </article>
            </section>

            <section className="flex items-center justify-between text-sm text-slate-600">
              <p className="truncate">{ticket.path}</p>
              {ticket.html_url && (
                <a
                  href={ticket.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-900 underline"
                >
                  View on GitHub
                </a>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
