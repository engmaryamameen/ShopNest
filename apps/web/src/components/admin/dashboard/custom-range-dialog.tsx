'use client';

import { useEffect, useRef, useState } from 'react';

const dayMs = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const today = () => iso(new Date());

export function CustomRangeDialog({ initial, onApply, onClose }: { initial: string; onApply: (range: string) => void; onClose: () => void }) {
  const existing = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(initial);
  const [start, setStart] = useState(existing?.[1] ?? '');
  const [end, setEnd] = useState(existing?.[2] ?? '');
  const [preview, setPreview] = useState('');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMonth = new Date(`${existing?.[1] ?? today()}T00:00:00Z`);
  const [month, setMonth] = useState(() => new Date(Date.UTC(initialMonth.getUTCFullYear(), initialMonth.getUTCMonth(), 1)));
  const dialog = useRef<HTMLDialogElement>(null);
  const previousMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));

  useEffect(() => { dialog.current?.showModal(); return () => { if (closeTimer.current) clearTimeout(closeTimer.current); }; }, []);
  function close(action: () => void) {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeTimer.current = setTimeout(action, reducedMotion ? 0 : 200);
  }
  function select(date: string) {
    if (!start || end) { setStart(date); setEnd(''); setPreview(''); }
    else if (date < start) { setEnd(start); setStart(date); setPreview(''); }
    else { setEnd(date); setPreview(''); }
  }
  function moveMonth(delta: number) { setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1))); }

  return <dialog ref={dialog} aria-labelledby="range-title" onCancel={(event) => { event.preventDefault(); close(onClose); }} onClick={(event) => { if (event.target === event.currentTarget) close(onClose); }} data-range-dialog data-closing={closing || undefined} className="fixed inset-0 m-auto animate-[range-dialog-in_200ms_ease-out] data-[closing]:animate-[range-dialog-out_200ms_ease-in_forwards] motion-reduce:animate-none motion-reduce:data-[closing]:animate-none max-sm:animate-[range-sheet-in_200ms_ease-out] max-sm:data-[closing]:animate-[range-sheet-out_200ms_ease-in_forwards] m-auto max-h-[100dvh] w-full max-w-[720px] overflow-y-auto rounded-2xl border-0 bg-white p-5 text-[#1c1c1c] shadow-xl backdrop:bg-slate-950/45 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl">
    <div className="flex items-start justify-between gap-3"><div><h2 id="range-title" className="text-base font-semibold">Custom date range</h2><p className="mt-1 text-xs text-slate-600">Select a start and end date. Reporting uses UTC.</p></div><button type="button" onClick={() => close(onClose)} aria-label="Close date range" className="grid size-9 place-items-center rounded-lg text-xl text-slate-600 hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]">×</button></div>
    <div className="mt-4 flex items-center justify-between">
      <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]"><svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true"><path d="M13.4881 6.48812 12.25 5.25 7 10.5l5.25 5.25 1.2381-1.2381L9.47625 10.5z" /></svg></button>
      <span className="text-xs text-slate-500">Select a date range</span>
      <button type="button" onClick={() => moveMonth(1)} aria-label="Next month" disabled={month.getUTCFullYear() === new Date().getUTCFullYear() && month.getUTCMonth() === new Date().getUTCMonth()} className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#0077b6]"><svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true"><path d="m8.74997 5.25-1.23813 1.23813L11.5237 10.5l-4.01186 4.0119 1.23813 1.2381L14 10.5z" /></svg></button>
    </div>
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {[previousMonth, month].map((visibleMonth, monthIndex) => {
        const title = visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const firstDay = new Date(visibleMonth.getTime() - visibleMonth.getUTCDay() * dayMs);
        const dates = Array.from({ length: 42 }, (_, index) => new Date(firstDay.getTime() + index * dayMs));
        return <section key={iso(visibleMonth)} aria-label={title} className={monthIndex === 0 ? 'hidden sm:block' : ''}>
          <h3 className="mb-3 text-center text-sm font-medium" aria-live="polite">{title}</h3>
          <div className="grid grid-cols-7 rounded bg-[#f5f7fa] text-center text-xs text-slate-600">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day} className="py-3">{day}</span>)}</div>
          <div className="grid grid-cols-7">{dates.map((date) => {
            const value = iso(date);
            const selected = value === start || value === end;
            const previewEnd = !end ? preview : '';
            const lower = start && previewEnd && previewEnd < start ? previewEnd : start;
            const upper = end || (previewEnd && previewEnd < start ? start : previewEnd);
            const between = !!lower && !!upper && value >= lower && value <= upper && !selected;
            const muted = date.getUTCMonth() !== visibleMonth.getUTCMonth();
            return <button key={value} type="button" disabled={value > today()} onClick={() => select(value)} onMouseEnter={() => { if (start && !end) setPreview(value); }} onFocus={() => { if (start && !end) setPreview(value); }} aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })} aria-pressed={selected} className={`relative min-h-10 font-poppins text-sm leading-[21px] font-normal focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:text-slate-300 ${selected ? 'rounded-lg bg-[#0077b6] text-white' : between ? 'bg-[#e6f4fb] text-slate-700 enabled:hover:rounded enabled:hover:bg-[#e7eff3] enabled:hover:text-[#494e50]' : muted ? 'text-slate-400 enabled:hover:rounded enabled:hover:bg-[#e7eff3] enabled:hover:text-[#494e50]' : 'text-[#494e50] enabled:hover:rounded enabled:hover:bg-[#e7eff3]'}`}>{date.getUTCDate()}{value === today() && <span className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-[#0077b6]'}`} />}</button>;
          })}</div>
        </section>;
      })}
    </div>
    <p className="mt-4 text-sm text-slate-600" aria-live="polite">{start ? `${start} – ${end || 'Select an end date'}` : 'Select a start date'}</p>
    <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => close(onClose)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-[#0077b6]">Cancel</button><button type="button" disabled={!start || !end} onClick={() => close(() => onApply(`custom:${start}:${end}`))} className="rounded-lg bg-[#0077b6] px-4 py-2 text-sm font-medium text-white hover:bg-[#006a9b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Apply</button></div>
  </dialog>;
}
