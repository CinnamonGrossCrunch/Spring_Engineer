interface Props {
  onClick: () => void;
}

export function DataSheetButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="export-data-sheet-button"
      className="inline-flex items-center gap-1.5 rounded border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      title="Create a vendor-ready spring parameter and requirements sheet"
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
        <path d="M6 2.75h8l4 4V21.25H6z" />
        <path d="M14 2.75v4h4M9 11h6M9 14.5h6M9 18h4" />
      </svg>
      Export Data Sheet
    </button>
  );
}
