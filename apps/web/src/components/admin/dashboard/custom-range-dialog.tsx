'use client';

import { useEffect, useRef, useState } from 'react';

const dayMs = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const todayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function CustomRangeDialog({ initial, initialTimezone, onApply, onClose }: { initial: string; initialTimezone: string; onApply: (range: string, timezone: string) => void; onClose: () => void }) {
  const existing = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(initial);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [start, setStart] = useState(existing?.[1] ?? '');
  const [end, setEnd] = useState(existing?.[2] ?? '');
  const [preview, setPreview] = useState('');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDay = todayIn(timezone);
  const initialMonth = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); };
  const [months, setMonths] = useState(() => {
    const right = initialMonth(existing?.[2] ?? currentDay);
    const left = existing ? initialMonth(existing[1]) : new Date(Date.UTC(right.getUTCFullYear(), right.getUTCMonth() - 1, 1));
    return [left >= right ? new Date(Date.UTC(right.getUTCFullYear(), right.getUTCMonth() - 1, 1)) : left, right];
  });
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      root.style.overflow = previousOverflow;
      root.style.scrollbarGutter = previousGutter;
    };
  }, []);
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
  function moveMonth(index: number, delta: number) {
    setMonths((current) => {
      const changed = new Date(Date.UTC(current[index].getUTCFullYear(), current[index].getUTCMonth() + delta, 1));
      const next = [...current];
      next[index] = changed;
      if (index === 0 && changed >= next[1]) next[1] = new Date(Date.UTC(changed.getUTCFullYear(), changed.getUTCMonth() + 1, 1));
      if (index === 1 && changed <= next[0]) next[0] = new Date(Date.UTC(changed.getUTCFullYear(), changed.getUTCMonth() - 1, 1));
      return next;
    });
  }

  return <dialog ref={dialog} aria-labelledby="range-title" onCancel={(event) => { event.preventDefault(); close(onClose); }} onClick={(event) => { if (event.target === event.currentTarget) close(onClose); }} data-range-dialog data-closing={closing || undefined} className="fixed inset-0 m-auto animate-[range-dialog-in_200ms_ease-out] data-[closing]:animate-[range-dialog-out_200ms_ease-in_forwards] motion-reduce:animate-none motion-reduce:data-[closing]:animate-none max-sm:animate-[range-sheet-in_200ms_ease-out] max-sm:data-[closing]:animate-[range-sheet-out_200ms_ease-in_forwards] m-auto max-h-[100dvh] w-full max-w-[720px] overflow-y-auto rounded-2xl border-0 bg-white p-5 text-[#1c1c1c] shadow-xl backdrop:bg-slate-950/45 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl">
    <div className="flex items-start justify-between gap-3"><div><h2 id="range-title" className="text-base font-semibold">Custom date range</h2><p className="mt-1 text-xs text-slate-600">Select a start and end date. Dates use the selected time zone.</p></div><button type="button" onClick={() => close(onClose)} aria-label="Close date range" className="grid size-9 place-items-center rounded-lg text-xl text-slate-600 hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]">×</button></div>
    <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {months.map((visibleMonth, monthIndex) => {
        const title = visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const firstDay = new Date(visibleMonth.getTime() - visibleMonth.getUTCDay() * dayMs);
        const dates = Array.from({ length: 42 }, (_, index) => new Date(firstDay.getTime() + index * dayMs));
        return <section key={monthIndex} aria-label={title} className={monthIndex === 0 ? 'hidden sm:block' : ''}>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth(monthIndex, -1)} aria-label={`Previous month for ${monthIndex === 0 ? 'start' : 'end'} calendar`} className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]"><svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true"><path d="M13.4881 6.48812 12.25 5.25 7 10.5l5.25 5.25 1.2381-1.2381L9.47625 10.5z" /></svg></button>
            <h3 className="text-center text-sm font-medium" aria-live="polite">{title}</h3>
            <button type="button" onClick={() => moveMonth(monthIndex, 1)} aria-label={`Next month for ${monthIndex === 0 ? 'start' : 'end'} calendar`} disabled={iso(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + (monthIndex === 0 ? 1 : 0), 1))).slice(0, 7) >= currentDay.slice(0, 7)} className="grid size-10 place-items-center rounded-lg text-[#494e50] hover:text-[#0077b6] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#0077b6]"><svg width="21" height="21" viewBox="0 0 21 21" fill="currentColor" aria-hidden="true"><path d="m8.74997 5.25-1.23813 1.23813L11.5237 10.5l-4.01186 4.0119 1.23813 1.2381L14 10.5z" /></svg></button>
          </div>
          <div className="grid grid-cols-7 rounded bg-[#f5f7fa] text-center text-xs text-slate-600">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day} className="py-3">{day}</span>)}</div>
          <div className="grid grid-cols-7">{dates.map((date) => {
            const value = iso(date);
            const selected = value === start || value === end;
            const previewEnd = !end ? preview : '';
            const lower = start && previewEnd && previewEnd < start ? previewEnd : start;
            const upper = end || (previewEnd && previewEnd < start ? start : previewEnd);
            const between = !!lower && !!upper && value >= lower && value <= upper && !selected;
            const muted = date.getUTCMonth() !== visibleMonth.getUTCMonth();
            return <button key={value} type="button" disabled={value > currentDay} onClick={() => select(value)} onMouseEnter={() => { if (start && !end) setPreview(value); }} onFocus={() => { if (start && !end) setPreview(value); }} aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })} aria-pressed={selected} className={`relative min-h-10 font-['Inter_Variable',sans-serif] text-sm leading-[21px] font-normal focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:text-slate-300 ${selected ? 'rounded-lg bg-[#0077b6] text-white' : between ? 'bg-[#e6f4fb] text-slate-700 enabled:hover:rounded enabled:hover:bg-[#e7eff3] enabled:hover:text-[#494e50]' : muted ? 'text-slate-400 enabled:hover:rounded enabled:hover:bg-[#e7eff3] enabled:hover:text-[#494e50]' : 'text-[#494e50] enabled:hover:rounded enabled:hover:bg-[#e7eff3]'}`}>{date.getUTCDate()}{value === currentDay && <span className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-[#0077b6]'}`} />}</button>;
          })}</div>
        </section>;
      })}
    </div>
    <div className="mt-4 flex justify-end">
      <label className="sr-only" htmlFor="reporting-timezone">Reporting time zone</label>
      <select id="reporting-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="max-w-full rounded border border-[#e5e7f0] bg-[#f5f7fa] px-2 py-1.5 font-['Inter_Variable',sans-serif] text-sm text-[#494e50] focus-visible:outline-2 focus-visible:outline-[#0077b6]">
        {Array.from(new Set(['UTC', initialTimezone, ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Karachi', 'America/New_York', 'Europe/London'])])).map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </select>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[#e5e7f0] pt-3 font-['Inter_Variable',sans-serif] text-sm">
      <p className="mr-auto text-[#494e50]" aria-live="polite">{start ? `${start} – ${end || 'Select an end date'}` : 'Select a start date'}</p>
      <button type="button" onClick={() => close(onClose)} className="rounded bg-[#f5f7fa] px-3 py-1.5 text-[#494e50] hover:bg-slate-200">Cancel</button>
      <button type="button" disabled={!start || !end || end > currentDay} onClick={() => close(() => onApply(`custom:${start}:${end}`, timezone))} className="rounded bg-[#0077b6] px-3 py-1.5 text-white hover:bg-[#006a9b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Apply</button>
    </div>
  </dialog>;
}
