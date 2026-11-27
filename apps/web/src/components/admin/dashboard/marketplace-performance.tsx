'use client';

import { useState } from 'react';
import type { PerformancePoint } from '@/lib/api-types';
import { formatPrice } from '@/lib/format-price';

type Metric = 'sales' | 'revenue' | 'orders' | 'customers' | 'vendors';
const metrics: { key: Metric; label: string }[] = [
  { key: 'sales', label: 'Sales' }, { key: 'revenue', label: 'Revenue' },
  { key: 'orders', label: 'Orders' }, { key: 'customers', label: 'Customers' }, { key: 'vendors', label: 'Vendors' },
];

export function MarketplacePerformance({ current, previous, timezone }: { current: PerformancePoint[]; previous: PerformancePoint[] | null; timezone: string }) {
  const [metric, setMetric] = useState<Metric>('sales');
  const [active, setActive] = useState<number | null>(null);
  const format = (value: number) => metric === 'sales' ? formatPrice(value) : new Intl.NumberFormat('en-US').format(value);
  const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  const periodLabel = (point: PerformancePoint) => point.start === point.end ? date(point.start) : `${date(point.start)} – ${date(point.end)}`;
  const values = metric === 'revenue' ? [] : current.map((point) => point[metric]);
  const previousValues = metric === 'revenue' ? [] : previous?.map((point) => point[metric]) ?? [];
  const dataMax = Math.max(0, ...values, ...previousValues);
  const max = Math.max(1, dataMax);
  const ticks = dataMax === 0 ? [0] : [...new Set([0, Math.round(max / 2), max])];
  const x = (index: number) => values.length === 1 ? 350 : 48 + index * 624 / (values.length - 1);
  const y = (value: number) => 190 - value / max * 150;
  const path = (series: number[]) => series.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ');
  const value = active === null ? null : current[active];
  const old = active === null ? null : previous?.[active];

  return <section className="rounded-lg border border-slate-100 bg-[#f9fafb] p-5 sm:p-6" aria-label="Marketplace performance">
    <h2 className="font-['Inter_Variable',sans-serif] text-sm font-semibold text-[#1c1c1c]">Marketplace Performance</h2>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-200" role="tablist" aria-label="Performance metric">
      {metrics.map((item) => <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} onClick={() => { setMetric(item.key); setActive(null); }} className={`border-0 border-b-2 bg-transparent px-0 pb-2 text-sm focus-visible:outline-2 focus-visible:outline-[#0077b6] ${metric === item.key ? 'border-[#0077b6] font-semibold text-[#1c1c1c]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">{metric === 'sales' ? 'Simulated merchandise value, excluding cancelled orders' : metric === 'customers' ? 'New customer registrations' : metric === 'vendors' ? 'New vendor registrations' : metric === 'orders' ? 'Orders placed' : 'Commission and fees'} · {timezone.replaceAll('_', ' ')}</p>
    {metric === 'revenue' ? <p className="py-16 text-center text-sm text-slate-500">Revenue data is not available.</p> : current.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No data is available for this period.</p> : <>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600"><span><span className="mr-1 inline-block w-4 border-t-2 border-[#0077b6] align-middle" /> Current period</span>{previous && <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[#a8bfcb] align-middle" /> Previous period</span>}</div>
      <div className="relative mt-3 overflow-x-auto"><svg viewBox="0 0 700 225" className="h-auto max-h-[250px] min-w-[440px] w-full" role="group" aria-label={`${metrics.find((item) => item.key === metric)?.label} by reporting period`}>
        {ticks.map((tick) => <g key={tick}><line x1="48" x2="672" y1={y(tick)} y2={y(tick)} stroke="#e8edf0" strokeWidth="1" /><text x="42" y={y(tick) + 4} textAnchor="end" fill="#7b8791" fontSize="10">{format(tick)}</text></g>)}
        {values.length > 1 && <path d={`${path(values)} L ${x(values.length - 1)} 190 L ${x(0)} 190 Z`} fill="#0077b6" fillOpacity="0.06" />}
        {previousValues.length > 0 && <path d={path(previousValues)} fill="none" stroke="#a8bfcb" strokeWidth="1.5" strokeDasharray="4 4" />}
        <path d={path(values)} fill="none" stroke="#0077b6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {current.map((point, index) => <g key={point.start}><rect x={x(index) - Math.min(28, 312 / Math.max(1, values.length - 1))} y="35" width={Math.min(56, 624 / Math.max(1, values.length - 1))} height="155" fill="transparent" tabIndex={0} role="button" aria-label={`${periodLabel(point)}: ${format(values[index])}`} onMouseEnter={() => setActive(index)} onClick={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} /><circle cx={x(index)} cy={y(values[index])} r={active === index || values.length === 1 ? 3 : 0} fill="#0077b6" pointerEvents="none" />{(index === 0 || index === values.length - 1 || index % Math.ceil(values.length / 5) === 0) && <text x={x(index)} y="213" textAnchor="middle" fill="#7b8791" fontSize="10">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${point.start}T00:00:00Z`))}</text>}</g>)}
      </svg></div>
      <div aria-live="polite" className="min-h-10 text-xs text-slate-600">{value && <><span className="font-medium text-slate-800">{periodLabel(value)}: {format(values[active!])}</span>{old && <span className="ml-3">Previous ({periodLabel(old)}): {format(previousValues[active!])}</span>}</>}</div>
    </>}
  </section>;
}
