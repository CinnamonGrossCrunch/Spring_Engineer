interface Props {
  disabled?: boolean;
  onClick: () => void;
}

export function CandidateCsvButton({ disabled = false, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="export-candidate-csv-button"
      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
      title="Export the currently displayed candidate rows as CSV"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
        <path d="M8 12h8M8 15h8M8 18h5" />
      </svg>
      Export CSV
    </button>
  );
}
