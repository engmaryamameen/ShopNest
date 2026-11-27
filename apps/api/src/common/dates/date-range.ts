import { Temporal } from '@js-temporal/polyfill';

/** Converts inclusive calendar dates to a half-open interval in the reporting zone. */
export function dateRange(start: Temporal.PlainDate | undefined, end: Temporal.PlainDate, timezone = 'UTC'): { start?: Date; end: Date } {
  const boundary = (day: Temporal.PlainDate) => new Date(day.toZonedDateTime(timezone).epochMilliseconds);
  return { ...(start ? { start: boundary(start) } : {}), end: boundary(end.add({ days: 1 })) };
}
