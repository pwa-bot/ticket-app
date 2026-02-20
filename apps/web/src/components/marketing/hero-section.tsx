import Link from "next/link";
import { PillRow } from "./pill-row";

export function HeroSectionV2() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
        The open protocol for machine-readable work in Git
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
        Tickets are Markdown. State is YAML. History is Git. Agents use the CLI.
        Humans use a fast dashboard overlay.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-4">
        <Link
          href="/api/auth/github"
          className="rounded-lg bg-foreground px-8 py-4 text-base font-medium text-background transition-opacity hover:opacity-80"
        >
          Get Started with GitHub
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link
            href="/cli"
            className="text-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Install CLI
          </Link>
          <span className="text-border">•</span>
          <Link
            href="/protocol"
            className="text-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Read Protocol
          </Link>
        </div>
      </div>
      <p className="mt-6 text-xs text-subtle">
        Git is authoritative. Everything else is derived and disposable.
      </p>
      <div className="mt-10 flex justify-center">
        <PillRow
          items={[
            "OpenClaw",
            "Claude Code",
            "GitHub Actions",
            "Custom orchestrators",
          ]}
        />
      </div>
    </section>
  );
}
