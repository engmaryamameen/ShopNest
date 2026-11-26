'use client';

export type ProductView = 'table' | 'grid';

export function ProductViewControls({
  view,
  onChange,
}: {
  view: ProductView;
  onChange: (view: ProductView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Product layout"
      className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5"
    >
      {(['table', 'grid'] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-label={`${item === 'table' ? 'Table' : 'Grid'} view`}
          title={`${item === 'table' ? 'Table' : 'Grid'} view`}
          aria-pressed={view === item}
          onClick={() => onChange(item)}
          className={`grid h-8 w-8 place-items-center rounded text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6] ${view === item ? 'bg-[var(--overview-surface-blue)] text-[#0077b6]' : 'hover:text-[#0077b6]'}`}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item === 'table' ? (
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18 M3 14.5h18 M9 9v11" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </>
            )}
          </svg>
        </button>
      ))}
    </div>
  );
}
