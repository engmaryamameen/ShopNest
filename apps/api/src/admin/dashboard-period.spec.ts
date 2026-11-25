import { dashboardPeriod } from './dashboard-period';

describe('dashboardPeriod', () => {
  const now = new Date('2026-03-15T10:30:00Z');
  it('uses inclusive UTC days for yesterday and last month', () => {
    expect(dashboardPeriod('yesterday', now)).toEqual({ start: new Date('2026-03-14T00:00:00Z'), end: new Date('2026-03-15T00:00:00Z') });
    expect(dashboardPeriod('last-month', now)).toEqual({ start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-03-01T00:00:00Z') });
  });
  it('validates custom dates and includes the last day', () => {
    expect(dashboardPeriod('custom:2026-03-01:2026-03-02', now)).toEqual({ start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-03T00:00:00Z') });
    expect(dashboardPeriod('custom:2026-02-30:2026-03-02', now)).toEqual(dashboardPeriod('30', now));
  });
  it('uses the selected time zone and daylight-saving boundaries', () => {
    expect(dashboardPeriod('custom:2026-03-08:2026-03-08', now, 'America/New_York')).toEqual({ start: new Date('2026-03-08T05:00:00Z'), end: new Date('2026-03-09T04:00:00Z') });
    expect(dashboardPeriod('custom:2026-03-14:2026-03-14', now, 'Asia/Karachi')).toEqual({ start: new Date('2026-03-13T19:00:00Z'), end: new Date('2026-03-14T19:00:00Z') });
  });
  it('falls back to UTC for an invalid time zone', () => {
    expect(dashboardPeriod('1', now, 'Invalid/Zone')).toEqual(dashboardPeriod('1', now));
  });
  it('uses all records through today for all time', () => {
    expect(dashboardPeriod('all', now)).toEqual({ end: new Date('2026-03-16T00:00:00Z') });
  });
});
