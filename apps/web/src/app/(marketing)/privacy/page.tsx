import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — ticket.app",
  description: "Privacy practices for ticket.app.",
};

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Privacy</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        ticket.app minimizes data collection. Ticket content stays in your Git repos.
      </p>
      <div className="mt-10 space-y-6 text-sm text-muted">
        <p>OAuth tokens are encrypted at rest and used only to read the repositories you authorize.</p>
        <p>We do not sell personal data, and we retain only operational metadata needed to run the service.</p>
      </div>
    </section>
  );
}
