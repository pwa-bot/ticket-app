import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — ticket.app",
  description: "Documentation for the Ticket Protocol and CLI.",
};

export default function DocsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Docs
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Documentation is coming soon. In the meantime:
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        <li>
          <Link
            href="/protocol"
            className="text-brand underline underline-offset-4 hover:text-brand/80"
          >
            Read the Protocol
          </Link>
        </li>
        <li>
          <Link
            href="/cli"
            className="text-brand underline underline-offset-4 hover:text-brand/80"
          >
            CLI reference
          </Link>
        </li>
        <li>
          <Link
            href="https://github.com/nickarilla/ticket-app"
            className="text-brand underline underline-offset-4 hover:text-brand/80"
          >
            GitHub repository
          </Link>
        </li>
      </ul>
    </section>
  );
}
