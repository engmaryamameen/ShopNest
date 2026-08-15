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
      <p className="text-[18px] font-bold text-admin-heading font-lato">{label}</p>
      {sublabel && <p className="text-sm text-admin-muted font-lato mt-1">{sublabel}</p>}
      <div className="flex items-center gap-4 mt-3">
        <p className="text-[32px] font-bold text-admin-ink font-lato leading-none">{value}</p>
        {changePercent !== undefined && <TrendBadge percent={changePercent} />}
      </div>
    </div>
  );
}
