import { FAQAccordion } from "./faq-accordion";

const faqs = [
  {
    q: "Do I need ticket.app to use Ticket?",
    a: "No. Tickets live in your repo. The CLI works independently.",
  },
  {
    q: "Who owns the data?",
    a: "You do. Git is authoritative.",
  },
  {
    q: "Does this replace Linear?",
    a: "If you use agents, it replaces the parts that break: durable backlog state, automation safety, and per-seat scaling.",
  },
];

export function FAQSection() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">
          FAQ
        </h2>
        <FAQAccordion items={faqs} />
      </div>
    </section>
  );
}
