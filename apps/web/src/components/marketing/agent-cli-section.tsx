import Link from "next/link";
import { CodeCard } from "./code-card";

const cliExample = `ticket init
ticket new "Add paywall experiment" --priority p1 --ci
ticket move TK-01ARZ3ND in_progress --ci
ticket validate --json --ci`;

export function AgentCLISection() {
  const bullets = [
    "Collision-free IDs (ULID filenames)",
    "Strict parsing and validation",
    "Machine-readable JSON output",
    "Works offline, commits changes atomically",
  ];

  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <CodeCard label="Agent workflow">{cliExample}</CodeCard>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Deterministic CLI, designed for automation.
            </h2>
            <p className="mt-4 text-muted">
              Ticket provides a strict CLI contract for agents. Use{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                --ci
              </code>{" "}
              mode for exact ID matching and structured output for reliable
              orchestration.
            </p>
            <ul className="mt-6 space-y-2">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-muted">
                  <span className="mt-0.5 text-success">&check;</span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link
                href="/cli"
                className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand/80"
              >
                CLI docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
