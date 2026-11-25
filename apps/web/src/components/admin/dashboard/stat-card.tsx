import { TrendBadge } from './trend-badge';

export function StatCard({
  label,
  sublabel,
  value,
  changePercent,
}: {
  label: string;
  sublabel?: string;
  value: string | number;
  changePercent?: number | null;
}) {
  return (
    <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
      <p className="font-['Inter_Variable',sans-serif] text-sm leading-5 font-semibold text-black [font-feature-settings:'ss01'_on,'cv01'_on]">{label}</p>
      {sublabel && <p className="mt-1 font-['Inter_Variable',sans-serif] text-xs leading-[18px] font-normal text-admin-muted">{sublabel}</p>}
      <div className="flex items-center gap-4 mt-3">
        <p className="font-[family-name:var(--font-stat-value)] text-[24px] leading-[36px] font-[600] text-[#1c1c1c]">{value}</p>
        {changePercent !== undefined && <TrendBadge percent={changePercent} />}
      </div>
    </div>
  );
}
