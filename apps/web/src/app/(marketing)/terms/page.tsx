import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — ticket.app",
  description: "Terms for using ticket.app.",
};

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Terms</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        By using ticket.app, you agree to use the service responsibly and in compliance with
        GitHub and applicable laws.
      </p>
      <div className="mt-10 space-y-6 text-sm text-muted">
        <p>Ticket data remains in your repositories. You are responsible for repository access and permissions.</p>
        <p>The service is provided as-is while we continue to improve the product.</p>
      </div>
    </section>
  );
}
