import type { SyncHealthSnapshot } from "@/lib/sync-health";
import { formatDurationShort } from "@/lib/sync-health";

function stateClass(state: SyncHealthSnapshot["state"]): string {
  switch (state) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "stale":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "error":
      return "border-red-200 bg-red-50 text-red-700";
    case "syncing":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function stateLabel(state: SyncHealthSnapshot["state"]): string {
  switch (state) {
    case "healthy":
      return "Healthy";
    case "stale":
      return "Stale";
    case "error":
      return "Error";
    case "syncing":
      return "Syncing";
    default:
      return "Never synced";
  }
}

function stateDetail(health: SyncHealthSnapshot): string {
  if (health.state === "never_synced") {
    return "no successful sync yet";
  }
  if (health.state === "error") {
    return health.errorMessage ?? "sync failed";
  }
  return `age ${formatDurationShort(health.ageMs)}`;
}

export function SyncHealthBadge({ health }: { health: SyncHealthSnapshot }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${stateClass(health.state)}`}
      title={stateDetail(health)}
    >
      <span>{stateLabel(health.state)}</span>
      <span aria-hidden="true">·</span>
      <span>{stateDetail(health)}</span>
    </span>
  );
}
