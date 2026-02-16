import Link from "next/link";

const quickLinks = [
  {
    title: "Getting started",
    href: "/docs/getting-started",
    points: ["Install CLI", "ticket init", "Create your first ticket"],
  },
  {
    title: "Ticket format",
    href: "/docs/format",
    points: ["YAML frontmatter rules", "Required fields", "Template conventions"],
  },
  {
    title: "Workflow",
    href: "/docs/workflow",
    points: ["States and transitions", "Terminal state behavior"],
  },
  {
    title: "index.json",
    href: "/docs/index-json",
    points: ["Why it exists", "How it is generated", "Rebuild and recovery"],
  },
  {
    title: "CLI reference",
    href: "/docs/cli",
    points: ["Commands", "--ci mode for agents", "Exit codes"],
  },
  {
    title: "PR linking",
    href: "/docs/pr-linking",
    points: ["Branch and PR title conventions", "Auto-link behavior"],
  },
];

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Docs</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Everything you need to adopt the Ticket protocol, run it with agents, and optionally use the dashboard.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {quickLinks.map((item) => (
          <article key={item.href} className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link href={item.href} className="mt-4 inline-block text-sm font-medium text-indigo-600">
              Read {item.title.toLowerCase()}
            </Link>
          </article>
        ))}
      </section>

      <p className="mt-10 text-sm text-slate-500">
        Tickets live in your repo. If you stop using the dashboard, nothing breaks.
      </p>
    </main>
  );
}
