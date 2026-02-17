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
    <div className="relative overflow-hidden rounded-lg border border-border">
      {label && (
        <div className="flex items-center justify-between border-b border-white/10 bg-code-bg px-4 py-2">
          <span className="text-xs text-code-fg/60">{label}</span>
          <button
            onClick={copy}
            className="rounded px-2 py-1 text-xs text-code-fg/60 transition-colors hover:bg-white/10 hover:text-code-fg"
          >
            {copied ? "Copied!" : "Copy"}
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
          className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-code-fg/60 transition-colors hover:bg-white/10 hover:text-code-fg"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      )}
      {copied && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background shadow-lg">
            Copied to clipboard
          </span>
        </div>
      )}
    </div>
  );
}
