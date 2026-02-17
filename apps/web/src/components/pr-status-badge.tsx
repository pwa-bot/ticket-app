export interface LinkedPrSummary {
  number: number;
  title: string;
  state: string;
  html_url: string;
  checks: "success" | "failure" | "pending" | "unknown";
}

interface PrStatusBadgeProps {
  prs: LinkedPrSummary[];
}

export default function PrStatusBadge({ prs }: PrStatusBadgeProps) {
  if (prs.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const latest = prs[0];
  if (!latest) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  return (
    <a
      href={latest.html_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      title={latest.title}
    >
      PR #{latest.number}
      {prs.length > 1 ? <span className="text-slate-500">+{prs.length - 1}</span> : null}
    </a>
  );
}
