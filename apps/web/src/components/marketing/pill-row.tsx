export function PillRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Works with</span>
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
