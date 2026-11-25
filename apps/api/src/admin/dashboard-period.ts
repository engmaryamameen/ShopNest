import { Temporal } from '@js-temporal/polyfill';
import { dateRange } from '../common/dates/date-range';

export function dashboardPeriod(value: string | undefined, now = new Date(), zone = 'UTC'): { start?: Date; end: Date } {
  let timeZone = zone;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(now); } catch { timeZone = 'UTC'; }
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone).toPlainDate();
  const range = (start?: Temporal.PlainDate, end = today) => dateRange(start, end, timeZone);
  const period = value ?? '30';
  if (period === 'all') return range();
  if (period === 'yesterday') return range(today.subtract({ days: 1 }), today.subtract({ days: 1 }));
  if (period === 'month') return range(today.with({ day: 1 }));
  if (period === 'last-month') return range(today.with({ day: 1 }).subtract({ months: 1 }), today.with({ day: 1 }).subtract({ days: 1 }));
  if (period === 'year') return range(today.with({ month: 1, day: 1 }));
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (custom) {
    try {
      const start = Temporal.PlainDate.from(custom[1]);
      const last = Temporal.PlainDate.from(custom[2]);
      if (Temporal.PlainDate.compare(start, last) <= 0 && Temporal.PlainDate.compare(last, today) <= 0) return range(start, last);
    } catch { /* Invalid input falls back to the default period. */ }
  }
  const days = ['1', '7', '30', '90'].includes(period) ? Number(period) : 30;
  return range(today.subtract({ days: days - 1 }));
}

export function previousDashboardPeriod(current: { start?: Date; end: Date }, zone = 'UTC'): { start: Date; end: Date } | null {
  if (!current.start) return null;
  let timeZone = zone;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(current.start); } catch { timeZone = 'UTC'; }
  const localDay = (date: Date) => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone).toPlainDate();
  const startDay = localDay(current.start);
  const endDay = localDay(current.end);
  const count = startDay.until(endDay, { largestUnit: 'days' }).days;
  return dateRange(startDay.subtract({ days: count }), startDay.subtract({ days: 1 }), timeZone) as { start: Date; end: Date };
}
