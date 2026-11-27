'use client';

export const calendarDialogStyle =
  'fixed inset-0 m-auto animate-[range-dialog-in_200ms_ease-out] data-[closing]:animate-[range-dialog-out_200ms_ease-in_forwards] motion-reduce:animate-none motion-reduce:data-[closing]:animate-none max-sm:animate-[range-sheet-in_200ms_ease-out] max-sm:data-[closing]:animate-[range-sheet-out_200ms_ease-in_forwards] max-h-[100dvh] w-full overflow-y-auto rounded-2xl border-0 bg-white p-5 text-[#1c1c1c] shadow-xl backdrop:bg-slate-950/45 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl';
export const calendarDate = (date: Date) => date.toISOString().slice(0, 10);
export const calendarMonth = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

export function CalendarMonth({
  month,
  start,
  end = '',
  preview = '',
  today,
  maxDate,
  nextDisabled = false,
  position = '',
  onMove,
  onSelect,
  onPreview,
}: {
  month: Date;
  start: string;
  end?: string;
  preview?: string;
  today: string;
  maxDate?: string;
  nextDisabled?: boolean;
  position?: string;
  onMove: (delta: number) => void;
  onSelect: (date: string) => void;
  onPreview?: (date: string) => void;
}) {
  const title = month.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const firstDay = new Date(month.getTime() - month.getUTCDay() * 86_400_000);
  const dates = Array.from(
    { length: 42 },
    (_, index) => new Date(firstDay.getTime() + index * 86_400_000),
  );
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMove(-1)}
          aria-label={`Previous month${position ? ` for ${position} calendar` : ''}`}
          className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]"
        >
          <svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true">
            <path d="M13.4881 6.48812 12.25 5.25 7 10.5l5.25 5.25 1.2381-1.2381L9.47625 10.5z" />
          </svg>
        </button>
        <h3 className="text-center text-sm font-medium" aria-live="polite">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onMove(1)}
          aria-label={`Next month${position ? ` for ${position} calendar` : ''}`}
          disabled={nextDisabled}
          className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#0077b6]"
        >
          <svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true">
            <path d="m8.74997 5.25-1.23813 1.23813L11.5237 10.5l-4.01186 4.0119 1.23813 1.2381L14 10.5z" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 rounded bg-[#f5f7fa] text-center text-xs text-slate-600">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <span key={day} className="py-3">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((date) => {
          const value = calendarDate(date);
          const selected = value === start || value === end;
          const previewEnd = !end ? preview : '';
          const lower = start && previewEnd && previewEnd < start ? previewEnd : start;
          const upper = end || (previewEnd && previewEnd < start ? start : previewEnd);
          const between = !!lower && !!upper && value >= lower && value <= upper && !selected;
          const muted = date.getUTCMonth() !== month.getUTCMonth();
          return (
            <button
              key={value}
              type="button"
              disabled={!!maxDate && value > maxDate}
              onClick={() => onSelect(value)}
              onMouseEnter={() => onPreview?.(value)}
              onFocus={() => onPreview?.(value)}
              aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })}
              aria-pressed={selected}
              className={`relative min-h-10 font-['Inter_Variable',sans-serif] text-sm leading-[21px] font-normal focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:text-slate-300 ${selected ? 'rounded-lg bg-[#0077b6] text-white' : between ? 'bg-[#e6f4fb] text-slate-700 enabled:hover:rounded enabled:hover:bg-[#e7eff3]' : muted ? 'text-slate-400 enabled:hover:rounded enabled:hover:bg-[#e7eff3]' : 'text-[#494e50] enabled:hover:rounded enabled:hover:bg-[#e7eff3]'}`}
            >
              {date.getUTCDate()}
              {value === today && (
                <span
                  className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-[#0077b6]'}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
