import { Temporal } from '@js-temporal/polyfill';

type Event = { createdAt: Date; value: number };
type Bucket = { start: string; end: string; value: number };

/** Groups events into equally sized calendar-day buckets in the reporting zone. */
export function performanceBuckets(events: Event[], start: Date, end: Date, timezone: string, bucketDays: number): Bucket[] {
  const localDate = (date: Date) => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone).toPlainDate();
  const first = localDate(start);
  const exclusiveEnd = localDate(end);
  const days = first.until(exclusiveEnd, { largestUnit: 'days' }).days;
  if (days <= 0 || !Number.isInteger(bucketDays) || bucketDays < 1) return [];
  const buckets: Bucket[] = [];
  for (let offset = 0; offset < days; offset += bucketDays) {
    const from = first.add({ days: offset });
    const to = first.add({ days: Math.min(offset + bucketDays, days) });
    buckets.push({ start: from.toString(), end: to.subtract({ days: 1 }).toString(), value: 0 });
  }
  for (const event of events) {
    if (event.createdAt < start || event.createdAt >= end) continue;
    const index = Math.floor(first.until(localDate(event.createdAt), { largestUnit: 'days' }).days / bucketDays);
    if (buckets[index]) buckets[index].value += event.value;
  }
  return buckets;
}

export function performanceBucketDays(days: number): number {
  return Math.max(1, Math.ceil(days / 12));
}
