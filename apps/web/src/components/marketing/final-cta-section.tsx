import Link from "next/link";

export function FinalCTASectionV2() {
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Make your backlog something agents can operate reliably.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/cli"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            Install CLI
          </Link>
          <Link
            href="/protocol"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Read Protocol
          </Link>
          <Link
            href="/api/auth/github"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Connect GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
