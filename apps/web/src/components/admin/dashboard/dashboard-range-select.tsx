'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CustomRangeDialog } from './custom-range-dialog';

const ranges = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

export function DashboardRangeSelect({ selected = '30', timezone = 'UTC' }: { selected?: string; timezone?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedValue = selected.startsWith('custom:') ? 'custom' : selected;
  const selectedIndex = ranges.findIndex((range) => range.value === selectedValue);
  const previousLabels: Record<string, string> = { yesterday: 'Yesterday', '90': 'Last 90 days', month: 'This month', 'last-month': 'Last month', year: 'This year' };
  const selectedLabel = ranges[selectedIndex]?.label ?? previousLabels[selected] ?? 'Last 30 days';

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function changeRange(value: string, zone = timezone) {
    document.cookie = `shopnest_dashboard_timezone=${encodeURIComponent(zone)}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `shopnest_dashboard_range=${value}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.searchParams.delete('range');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setOpen(false);
    trigger.current?.focus();
    router.refresh();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = options.current.findIndex((item) => item === document.activeElement);
      const next = current < 0 ? Math.max(0, selectedIndex) : (current + (event.key === 'ArrowDown' ? 1 : -1) + ranges.length) % ranges.length;
      setOpen(true);
      requestAnimationFrame(() => options.current[next]?.focus());
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={container} className="relative font-['Inter_Variable',sans-serif] [font-feature-settings:'ss01'_on,'cv01'_on]" onKeyDown={onKeyDown}>
      <button ref={trigger} type="button" aria-label={`Order reporting period (${timezone})`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-center text-xs leading-4 font-normal text-black hover:bg-black/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8a9aaa]">
        {selectedLabel}
        <svg className={`text-black/40 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div role="menu" aria-label="Order reporting period" aria-hidden={!open} inert={!open} className={`absolute right-0 top-[calc(100%+6px)] z-40 max-h-[min(75vh,36rem)] w-44 overflow-y-auto origin-top-right rounded-xl border border-[#e3e7eb] bg-white p-1 shadow-[0_8px_24px_rgb(15_23_42_/_12%)] transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none ${open ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none -translate-y-1 scale-95 opacity-0"}`}>
        {ranges.map((range, index) => <button key={range.value} ref={(element) => { options.current[index] = element; }} type="button" role="menuitemradio" aria-checked={range.value === (selected.startsWith('custom:') ? 'custom' : selected)} onClick={() => range.value === 'custom' ? (setOpen(false), setCustomOpen(true)) : changeRange(range.value)} className={`block w-full rounded-lg border-0 px-3 py-2 text-left text-xs leading-4 font-normal focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#0077b6] ${range.value === (selected.startsWith('custom:') ? 'custom' : selected) ? 'bg-transparent font-semibold text-[#0077b6]' : 'bg-transparent text-[#232b34] hover:text-[#0077b6]'}`}>
          {range.label}
        </button>)}

      </div>
      {customOpen && <CustomRangeDialog initial={selected} initialTimezone={timezone} rangeLabel={selected.startsWith('custom:') ? selected.slice(7).replace(':', ' – ') : selectedLabel} onClose={() => { setCustomOpen(false); trigger.current?.focus(); }} onApply={(range, zone) => { setCustomOpen(false); changeRange(range, zone); }} />}
    </div>
  );
}
