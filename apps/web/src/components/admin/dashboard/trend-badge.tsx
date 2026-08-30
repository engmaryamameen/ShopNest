import { Icon } from '@iconify/react/offline';
import { ADMIN_ICONS } from '../icons/admin-icons';

/** `null` means "no prior-period data to compare against" — rendered as
 * nothing, never a fabricated 0%/∞%. */
export function TrendBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;

  const isUp = percent >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-medium font-lato ${isUp ? 'text-admin-success' : 'text-admin-danger-soft'}`}>
      <Icon icon={isUp ? ADMIN_ICONS.trendingUp : ADMIN_ICONS.trendingDown} width={16} height={16} />
      {Math.abs(percent).toFixed(1)}%
    </span>
  );
}
