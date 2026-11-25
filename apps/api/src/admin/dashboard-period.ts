export function dashboardPeriod(value: string | undefined, now = new Date()): { start?: Date; end: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextDay = new Date(today.getTime() + 86400000);
  const period = value ?? '30';
  if (period === 'all') return { end: nextDay };
  if (period === 'yesterday') return { start: new Date(today.getTime() - 86400000), end: today };
  if (period === 'month') return { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), end: nextDay };
  if (period === 'last-month') return { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)), end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)) };
  if (period === 'year') return { start: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), end: nextDay };
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (custom) {
    const start = new Date(`${custom[1]}T00:00:00.000Z`);
    const last = new Date(`${custom[2]}T00:00:00.000Z`);
    if (!Number.isNaN(start.valueOf()) && !Number.isNaN(last.valueOf()) && start.toISOString().slice(0, 10) === custom[1] && last.toISOString().slice(0, 10) === custom[2] && start <= last && last <= today) return { start, end: new Date(last.getTime() + 86400000) };
  }
  const days = ['1', '7', '30', '90'].includes(period) ? Number(period) : 30;
  return { start: new Date(today.getTime() - (days - 1) * 86400000), end: nextDay };
}
