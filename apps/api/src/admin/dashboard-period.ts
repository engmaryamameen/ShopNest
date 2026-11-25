import { Temporal } from '@js-temporal/polyfill';

export function dashboardPeriod(value: string | undefined, now = new Date(), zone = 'UTC'): { start?: Date; end: Date } {
  let timeZone = zone;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(now); } catch { timeZone = 'UTC'; }
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone).toPlainDate();
  const boundary = (date: Temporal.PlainDate) => new Date(date.toZonedDateTime(timeZone).epochMilliseconds);
  const nextDay = boundary(today.add({ days: 1 }));
  const period = value ?? '30';
  if (period === 'all') return { end: nextDay };
  if (period === 'yesterday') return { start: boundary(today.subtract({ days: 1 })), end: boundary(today) };
  if (period === 'month') return { start: boundary(today.with({ day: 1 })), end: nextDay };
  if (period === 'last-month') return { start: boundary(today.with({ day: 1 }).subtract({ months: 1 })), end: boundary(today.with({ day: 1 })) };
  if (period === 'year') return { start: boundary(today.with({ month: 1, day: 1 })), end: nextDay };
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (custom) {
    try {
      const start = Temporal.PlainDate.from(custom[1]);
      const last = Temporal.PlainDate.from(custom[2]);
      if (Temporal.PlainDate.compare(start, last) <= 0 && Temporal.PlainDate.compare(last, today) <= 0) return { start: boundary(start), end: boundary(last.add({ days: 1 })) };
    } catch { /* Invalid input falls back to the default period. */ }
  }
  const days = ['1', '7', '30', '90'].includes(period) ? Number(period) : 30;
  return { start: boundary(today.subtract({ days: days - 1 })), end: nextDay };
}
