"use client";

import { useState } from "react";

interface FAQItem {
  q: string;
  a: string;
}

export function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium transition-colors hover:bg-surface"
          >
            {item.q}
            <span className="ml-4 shrink-0 text-subtle">
              {openIndex === i ? "\u2212" : "+"}
            </span>
          </button>
          {openIndex === i && (
            <div className="px-6 pb-4 text-sm leading-relaxed text-muted">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
