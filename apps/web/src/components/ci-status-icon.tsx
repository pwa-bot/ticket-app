interface CiStatusIconProps {
  status: "success" | "failure" | "pending" | "unknown";
}

const STATUS_STYLES: Record<CiStatusIconProps["status"], string> = {
  success: "text-emerald-700",
  failure: "text-red-700",
  pending: "text-amber-700",
  unknown: "text-slate-400",
};

const STATUS_LABELS: Record<CiStatusIconProps["status"], string> = {
  success: "Passing",
  failure: "Failing",
  pending: "Pending",
  unknown: "No checks",
};

const STATUS_SYMBOLS: Record<CiStatusIconProps["status"], string> = {
  success: "✓",
  failure: "✗",
  pending: "◐",
  unknown: "—",
};

export default function CiStatusIcon({ status }: CiStatusIconProps) {
  return (
    <span className={`inline-flex items-center text-sm font-semibold ${STATUS_STYLES[status]}`} title={STATUS_LABELS[status]}>
      {STATUS_SYMBOLS[status]}
    </span>
  );
}
