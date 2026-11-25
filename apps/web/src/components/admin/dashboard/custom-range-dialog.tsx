'use client';

import { useEffect, useRef, useState } from 'react';

const dayMs = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const today = () => iso(new Date());

export function CustomRangeDialog({ initial, onApply, onClose }: { initial: string; onApply: (range: string) => void; onClose: () => void }) {
  const existing = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(initial);
  const [start, setStart] = useState(existing?.[1] ?? '');
  const [end, setEnd] = useState(existing?.[2] ?? '');
  const initialMonth = new Date(`${existing?.[1] ?? today()}T00:00:00Z`);
  const [month, setMonth] = useState(() => new Date(Date.UTC(initialMonth.getUTCFullYear(), initialMonth.getUTCMonth(), 1)));
  const dialog = useRef<HTMLDialogElement>(null);
  const title = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const firstDay = new Date(month.getTime() - month.getUTCDay() * dayMs);
  const dates = Array.from({ length: 42 }, (_, index) => new Date(firstDay.getTime() + index * dayMs));

  useEffect(() => { dialog.current?.showModal(); }, []);
  function select(date: string) {
    if (!start || end || date < start) { setStart(date); setEnd(''); }
    else setEnd(date);
  }
  function moveMonth(delta: number) { setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1))); }

  return <dialog ref={dialog} aria-labelledby="range-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[100dvh] w-full max-w-[460px] overflow-y-auto rounded-2xl border-0 bg-white p-5 text-[#1c1c1c] shadow-xl backdrop:bg-slate-950/45 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl">
    <div className="flex items-start justify-between gap-3"><div><h2 id="range-title" className="text-base font-semibold">Custom date range</h2><p className="mt-1 text-xs text-slate-600">Select a start and end date. Reporting uses UTC.</p></div><button type="button" onClick={onClose} aria-label="Close date range" className="grid size-9 place-items-center rounded-lg text-xl text-slate-600 hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]">×</button></div>
    <div className="mt-4 flex items-center justify-between"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="size-10 rounded-lg text-xl hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]">‹</button><h3 aria-live="polite" className="text-sm font-medium">{title}</h3><button type="button" onClick={() => moveMonth(1)} aria-label="Next month" disabled={month.getUTCFullYear() === new Date().getUTCFullYear() && month.getUTCMonth() === new Date().getUTCMonth()} className="size-10 rounded-lg text-xl hover:text-[#0077b6] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#0077b6]">›</button></div>
    <div className="grid grid-cols-7 rounded bg-[#f5f7fa] text-center text-xs text-slate-600">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day} className="py-3">{day}</span>)}</div>
    <div className="grid grid-cols-7" aria-label={title}>{dates.map((date) => { const value = iso(date); const selected = value === start || value === end; const between = !!start && !!end && value > start && value < end; return <button key={value} type="button" disabled={value > today()} onClick={() => select(value)} aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })} aria-pressed={selected} className={`relative min-h-10 text-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:text-slate-300 ${selected ? 'rounded-lg bg-[#0077b6] text-white' : between ? 'bg-[#e6f4fb] text-slate-700' : date.getUTCMonth() !== month.getUTCMonth() ? 'text-slate-400 hover:text-[#0077b6]' : 'text-slate-700 hover:text-[#0077b6]'}`}>{date.getUTCDate()}{value === today() && <span className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-[#0077b6]'}`} />}</button>; })}</div>
    <p className="mt-4 text-sm text-slate-600" aria-live="polite">{start ? `${start} – ${end || 'Select an end date'}` : 'Select a start date'}</p>
    <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-[#0077b6]">Cancel</button><button type="button" disabled={!start || !end} onClick={() => onApply(`custom:${start}:${end}`)} className="rounded-lg bg-[#0077b6] px-4 py-2 text-sm font-medium text-white hover:bg-[#006a9b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Apply</button></div>
  </dialog>;
}
