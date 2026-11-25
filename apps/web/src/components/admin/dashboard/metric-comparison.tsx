import { formatPrice } from '@/lib/format-price';

export function MetricComparison({ current, previous, start, end, currentStart, currentEnd, timezone, currency = false, lowerIsBetter = false }: {
  current: number | null; previous: number | null; start: string; end: string; currentStart: string; currentEnd: string; timezone: string; currency?: boolean; lowerIsBetter?: boolean;
}) {
  const format = (value: number) => currency ? formatPrice(value) : value.toLocaleString('en-US');
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return <span className="col-span-2 text-xs text-slate-500">Previous: —</span>;
  const delta = current - previous;
  const percent = previous === 0 ? null : delta / previous * 100;
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  const color = delta === 0 ? 'text-slate-500' : improving ? 'text-emerald-700' : 'text-red-700';
  const label = delta === 0 ? '→' : delta > 0 ? '↑' : '↓';
  const date = (value: Date) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(value);
  const lastDay = new Date(new Date(end).getTime() - 1);
  const details = `Change: ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))}. Current period: ${date(new Date(currentStart))} – ${date(new Date(new Date(currentEnd).getTime() - 1))}. Previous period: ${date(new Date(start))} – ${date(lastDay)} (${timezone}). Status counts reflect current status of orders placed in each period.`;
  return <span className="contents text-xs"><span tabIndex={0} title={details} aria-label={`${percent === null ? (delta === 0 ? 'No change' : 'Percentage change not available from zero') : `${Math.abs(percent).toFixed(1)} percent ${delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'change'}`}. ${details}`} className={`self-center justify-self-start rounded text-xs focus-visible:outline-2 focus-visible:outline-[#0077b6] ${color}`}>{label} {percent === null ? (delta === 0 ? 'No change' : 'New') : `${Math.abs(percent).toFixed(1)}%`}</span><span className="col-span-2 text-xs text-slate-500">Previous: {format(previous)}</span></span>;
}
