"use client";

import { useState } from "react";

export function CodeCard({
  children,
  label,
  lang,
}: {
  children: string;
  label?: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {label && (
        <div className="flex items-center justify-between border-b border-white/10 bg-code-bg px-4 py-2">
          <span className="text-xs text-code-fg/60">{label}</span>
          <button
            onClick={copy}
            className="text-xs text-code-fg/40 transition-colors hover:text-code-fg/80"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto bg-code-bg p-4">
        <code className="font-mono text-sm leading-relaxed text-code-fg">
          {children}
        </code>
      </pre>
      {!label && (
        <button
          onClick={copy}
          className="absolute right-3 top-3 text-xs text-code-fg/40 transition-colors hover:text-code-fg/80"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}
