'use client';

import { useEffect, useRef, useState } from 'react';

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const zones = Array.from(new Set(['UTC', value, ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Karachi', 'America/New_York', 'Europe/London'])]));
  const matches = zones.filter((zone) => zone.replaceAll('_', ' ').toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function dismiss(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return <div ref={container} className="relative w-full max-w-56 font-['Inter_Variable',sans-serif]" onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    <button type="button" aria-label={`Reporting time zone: ${value}`} aria-expanded={open} onClick={() => { setQuery(''); setOpen(!open); }} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#e5e7f0] bg-[#f5f7fa] px-3 text-left text-xs text-[#494e50] focus-visible:outline-2 focus-visible:outline-[#0077b6]">
      <span className="truncate">{value.replaceAll('_', ' ')}</span><span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
    </button>
    {open && <div className="absolute right-0 bottom-[calc(100%+6px)] z-50 w-[min(280px,80vw)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      <input ref={search} type="search" aria-label="Search time zones" placeholder="Search time zones" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-[#0077b6]" />
      <div className="mt-1 max-h-44 overflow-y-auto" aria-label="Time zones">
        {matches.map((zone) => <button key={zone} type="button" aria-pressed={zone === value} onClick={() => { onChange(zone); setOpen(false); }} className={`block w-full rounded-md px-2 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-[#0077b6] ${zone === value ? 'bg-[#e4f3fa] text-[#006a9b]' : 'text-slate-700 hover:bg-slate-100'}`}>{zone.replaceAll('_', ' ')}</button>)}
        {matches.length === 0 && <p className="p-2 text-xs text-slate-500">No matching time zones.</p>}
      </div>
    </div>}
  </div>;
}
