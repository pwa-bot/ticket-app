import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security — ticket.app",
  description: "How ticket.app handles your data and repository access.",
};

export default function SecurityPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Security
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Ticket.app is read-only by default. Your tickets live in Git. The
        dashboard reads selected repos via GitHub OAuth and respects GitHub
        permissions.
      </p>
      <div className="mt-10 space-y-8">
        <div>
          <h2 className="text-xl font-semibold">Data ownership</h2>
          <p className="mt-2 text-sm text-muted">
            All ticket data lives in your Git repository. The dashboard does not
            store ticket content. Git is authoritative.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Repository access</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-success">&check;</span>
              Repo allowlist — only repos you explicitly select
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-success">&check;</span>
              OAuth tokens stored securely with AES-256-GCM encryption
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-success">&check;</span>
              Read-only access in v1 — no writes to your repo
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Questions?</h2>
          <p className="mt-2 text-sm text-muted">
            Reach out at{" "}
            <Link
              href="mailto:security@ticket.app"
              className="text-brand underline underline-offset-4 hover:text-brand/80"
            >
              security@ticket.app
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
