interface ViewToggleProps {
  view: "board" | "table";
  onChange: (view: "board" | "table") => void;
  boardDisabled?: boolean;
}

export default function ViewToggle({ view, onChange, boardDisabled = false }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-1 text-sm">
      <button
        type="button"
        disabled={boardDisabled}
        onClick={() => onChange("board")}
        className={`rounded px-3 py-1.5 font-medium ${
          view === "board" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Board
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={`rounded px-3 py-1.5 font-medium ${
          view === "table" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        Table
      </button>
    </div>
  );
}
