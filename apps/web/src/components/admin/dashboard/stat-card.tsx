import { TrendBadge } from './trend-badge';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  sublabel,
  value,
  changePercent,
  secondary,
  comparison,
  surface,
}: {
  label: string;
  sublabel?: string;
  value: string | number;
  changePercent?: number | null;
  secondary?: string;
  comparison?: ReactNode;
  surface?: 'blue' | 'indigo';
}) {
  return (
    <div className={`rounded-lg p-5 ${surface === 'blue' ? 'bg-[var(--overview-surface-blue)]' : surface === 'indigo' ? 'bg-[var(--overview-surface-indigo)]' : 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]'}`}>
      <p className="font-['Inter_Variable',sans-serif] text-sm leading-5 font-semibold text-black [font-feature-settings:'ss01'_on,'cv01'_on]">{label}</p>
      {sublabel && <p className="mt-1 font-['Inter_Variable',sans-serif] text-xs leading-[18px] font-normal text-admin-muted">{sublabel}</p>}
      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
        <p className="font-[family-name:var(--font-stat-value)] text-[24px] leading-[36px] font-[600] text-[#1c1c1c]">{value}</p>
        {changePercent !== undefined && <TrendBadge percent={changePercent} />}
        {comparison}
      </div>
      {secondary && <p className="mt-1 font-['Inter_Variable',sans-serif] text-xs leading-[18px] text-admin-muted">{secondary}</p>}
    </div>
  );
}
