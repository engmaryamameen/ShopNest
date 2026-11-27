import { performanceBucketDays, performanceBuckets } from './performance-buckets';

describe('performance buckets', () => {
  it('uses local calendar days across daylight saving time and excludes the end boundary', () => {
    const start = new Date('2024-03-09T05:00:00Z');
    const end = new Date('2024-03-12T04:00:00Z');
    const events = [
      { createdAt: new Date('2024-03-10T04:59:59Z'), value: 2 },
      { createdAt: new Date('2024-03-10T05:00:00Z'), value: 3 },
      { createdAt: end, value: 100 },
    ];
    expect(performanceBuckets(events, start, end, 'America/New_York', 1)).toEqual([
      { start: '2024-03-09', end: '2024-03-09', value: 2 },
      { start: '2024-03-10', end: '2024-03-10', value: 3 },
      { start: '2024-03-11', end: '2024-03-11', value: 0 },
    ]);
  });
  it('limits the number of buckets for longer periods', () => {
    expect(performanceBucketDays(7)).toBe(1);
    expect(performanceBucketDays(90)).toBe(8);
  });
});
