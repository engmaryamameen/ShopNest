import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { dashboardPeriod, previousDashboardPeriod } from './dashboard-period';
import { performanceBuckets, performanceBucketDays } from './performance-buckets';
import { Temporal } from '@js-temporal/polyfill';

export interface DashboardSummary {
  users: { total: number; customers: number; vendorsRole: number; admins: number };
  vendors: { pending: number; approved: number; suspended: number; rejected: number };
  products: { draft: number; published: number; archived: number };
  orders: { byStatus: Partial<Record<string, number>>; totalRevenueCents: number };
  comparison: { start: Date; end: Date; currentStart: Date; currentEnd: Date; salesCents: number; orders: number; pending: number; cancelled: number } | null;
  periodOrderStatuses: Partial<Record<string, number>>;
  periodNewCustomers: number;
  periodOrders: number;
  periodMerchandiseCents: number;
  performance: { current: PerformancePoint[]; previous: PerformancePoint[] | null; timezone: string };
  pendingVendorApplications: number;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    createdAt: Date;
    actor: { id: string; email: string } | null;
  }>;
  /** Real per-day order count/revenue for the last 7 days, oldest first —
   * never fabricated, cancelled orders excluded (matches totalRevenueCents'
   * own definition of revenue above). */
  weeklyTrend: Array<{ date: string; label: string; orderCount: number; revenueCents: number }>;
  /** This week vs. the prior 7 days. `null` when the prior week had zero
   * activity — a percentage change from zero is not a meaningful number,
   * not "0%" or "∞%" that would read as real data. */
  revenueChangePercent: number | null;
  orderCountChangePercent: number | null;
  /** Top 5 products by units sold in the last 30 days, ranked from real
   * OrderItem rows — never a placeholder list. */
  topProducts: Array<{ productSlug: string; productName: string; unitsSold: number; averageUnitPriceCents: number }>;
}

type PerformancePoint = { start: string; end: string; sales: number; orders: number; customers: number; vendors: number };

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getDashboardSummary(days = 7, range?: string, timezone = 'UTC'): Promise<DashboardSummary> {
    // UTC throughout, deliberately — day-key strings below are also
    // UTC-derived (toISOString()), and mixing a server-local midnight with
    // UTC day keys would misbucket every order near a day boundary on any
    // server not running in UTC.
    const now = new Date();
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { timezone = 'UTC'; }
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const fourteenDaysAgo = new Date(startOfToday);
    fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - (days * 2 - 1));
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - (days - 1));

    const period = range === undefined ? { start: thirtyDaysAgo, end: new Date(startOfToday.getTime() + 86400000) } : dashboardPeriod(range, now, timezone);
    const previous = previousDashboardPeriod(period, timezone);
    const periodDates = { ...(period.start ? { gte: period.start } : {}), lt: period.end };

    const [
      userCounts,
      periodNewCustomers,
      vendorCounts,
      productCounts,
      orderCounts,
      revenue,
      recentAuditLogs,
      recentOrders,
      periodOrderCount,
      periodStatuses,
      merchandiseItems,
      topProductRows,
      previousOrders,
      previousStatuses,
      previousItems,
      performanceOrders,
      performanceCustomers,
      performanceVendors,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.user.count({ where: { role: Role.CUSTOMER, createdAt: periodDates } }),
      this.prisma.vendor.groupBy({ by: ['status'], _count: true }),
      this.prisma.product.groupBy({ by: ['publishStatus'], _count: true }),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      // Sum non-cancelled order totals, including pending orders. This is not collected revenue.
      this.prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      this.prisma.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, email: true } } },
      }),
      // Raw rows for the last 14 days (this week + the prior week to
      // compare against) — bucketed and diffed in JS below rather than a
      // second round-trip per day; demo-scale order volume makes this
      // simpler than raw SQL date-bucketing for no real cost.
      this.prisma.order.findMany({
        where: { createdAt: { gte: fourteenDaysAgo }, status: { not: 'CANCELLED' } },
        select: { createdAt: true, totalCents: true },
      }),
      this.prisma.order.count({ where: { createdAt: periodDates } }),
      this.prisma.order.groupBy({ by: ['status'], _count: true, where: { createdAt: periodDates } }),
      this.prisma.orderItem.findMany({
        where: { order: { createdAt: periodDates, status: { not: 'CANCELLED' } } },
        select: { quantity: true, unitPriceCents: true, totalCents: true, taxCents: true, pricingSnapshot: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productSlug', 'productName'],
        where: { order: { createdAt: periodDates, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true },
        _avg: { unitPriceCents: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      previous ? this.prisma.order.count({ where: { createdAt: { gte: previous.start, lt: previous.end } } }) : null,
      previous ? this.prisma.order.groupBy({ by: ['status'], _count: true, where: { createdAt: { gte: previous.start, lt: previous.end } } }) : [],
      previous ? this.prisma.orderItem.findMany({ where: { order: { createdAt: { gte: previous.start, lt: previous.end }, status: { not: 'CANCELLED' } } }, select: { quantity: true, unitPriceCents: true, totalCents: true, taxCents: true, pricingSnapshot: true } }) : [],
      this.prisma.order.findMany({ where: { createdAt: { ...(previous ? { gte: previous.start } : period.start ? { gte: period.start } : {}), lt: period.end } }, select: { createdAt: true, status: true, items: { select: { quantity: true, unitPriceCents: true, totalCents: true, taxCents: true, pricingSnapshot: true } } } }),
      this.prisma.user.findMany({ where: { role: Role.CUSTOMER, createdAt: { ...(previous ? { gte: previous.start } : period.start ? { gte: period.start } : {}), lt: period.end } }, select: { createdAt: true } }),
      this.prisma.vendor.findMany({ where: { createdAt: { ...(previous ? { gte: previous.start } : period.start ? { gte: period.start } : {}), lt: period.end } }, select: { createdAt: true } }),
    ]);

    const { weeklyTrend, revenueChangePercent, orderCountChangePercent } = this.buildWeeklyTrend(
      recentOrders,
      startOfToday,
      days,
    );
    const topProducts = topProductRows.map((row) => ({
      productSlug: row.productSlug,
      productName: row.productName,
      unitsSold: row._sum.quantity ?? 0,
      averageUnitPriceCents: Math.round(row._avg.unitPriceCents ?? 0),
    }));

    const usersByRole = Object.fromEntries(userCounts.map((r) => [r.role, r._count]));
    const vendorsByStatus = Object.fromEntries(vendorCounts.map((r) => [r.status, r._count]));
    const productsByStatus = Object.fromEntries(productCounts.map((r) => [r.publishStatus, r._count]));
    const ordersByStatus = Object.fromEntries(orderCounts.map((r) => [r.status, r._count]));

    const allDates = [...performanceOrders, ...performanceCustomers, ...performanceVendors].map((row) => row.createdAt.getTime());
    const localDate = (date: Date) => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone).toPlainDate();
    const start = period.start ?? (allDates.length ? new Date(localDate(new Date(allDates.reduce((earliest, value) => Math.min(earliest, value), Infinity))).toZonedDateTime(timezone).epochMilliseconds) : new Date(localDate(period.end).subtract({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds));
    const bucketDays = performanceBucketDays(localDate(start).until(localDate(period.end), { largestUnit: 'days' }).days);
    const sales = performanceOrders.map((order) => ({ createdAt: order.createdAt, value: order.status === 'CANCELLED' ? 0 : order.items.reduce((total, item) => total + merchandiseValue(item), 0) }));
    const orderEvents = performanceOrders.map((order) => ({ createdAt: order.createdAt, value: 1 }));
    const customerEvents = performanceCustomers.map((customer) => ({ createdAt: customer.createdAt, value: 1 }));
    const vendorEvents = performanceVendors.map((vendor) => ({ createdAt: vendor.createdAt, value: 1 }));
    const points = (from: Date, to: Date): PerformancePoint[] => {
      const series = [sales, orderEvents, customerEvents, vendorEvents].map((events) => performanceBuckets(events, from, to, timezone, bucketDays));
      return series[0].map((bucket, index) => ({ start: bucket.start, end: bucket.end, sales: bucket.value, orders: series[1][index].value, customers: series[2][index].value, vendors: series[3][index].value }));
    };

    return {
      users: {
        total: userCounts.reduce((sum, r) => sum + r._count, 0),
        customers: usersByRole['CUSTOMER'] ?? 0,
        vendorsRole: usersByRole['VENDOR'] ?? 0,
        admins: (usersByRole['ADMIN'] ?? 0) + (usersByRole['SUPER_ADMIN'] ?? 0),
      },
      vendors: {
        pending: vendorsByStatus['PENDING'] ?? 0,
        approved: vendorsByStatus['APPROVED'] ?? 0,
        suspended: vendorsByStatus['SUSPENDED'] ?? 0,
        rejected: vendorsByStatus['REJECTED'] ?? 0,
      },
      products: {
        draft: productsByStatus['DRAFT'] ?? 0,
        published: productsByStatus['PUBLISHED'] ?? 0,
        archived: productsByStatus['ARCHIVED'] ?? 0,
      },
      orders: {
        byStatus: ordersByStatus,
        totalRevenueCents: revenue._sum.totalCents ?? 0,
      },
      comparison: previous && period.start && previousOrders !== null ? { start: previous.start, end: previous.end, currentStart: period.start, currentEnd: period.end, salesCents: previousItems.reduce((sum, item) => sum + merchandiseValue(item), 0), orders: previousOrders, pending: previousStatuses.find((row) => row.status === 'PENDING')?._count ?? 0, cancelled: previousStatuses.find((row) => row.status === 'CANCELLED')?._count ?? 0 } : null,
      periodOrderStatuses: Object.fromEntries(periodStatuses.map((row) => [row.status, row._count])),
      periodNewCustomers,
      periodOrders: periodOrderCount,
      periodMerchandiseCents: merchandiseItems.reduce((sum, item) => sum + merchandiseValue(item), 0),
      performance: { current: points(start, period.end), previous: previous ? points(previous.start, previous.end) : null, timezone },
      pendingVendorApplications: vendorsByStatus['PENDING'] ?? 0,
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        createdAt: log.createdAt,
        actor: log.actor,
      })),
      weeklyTrend,
      revenueChangePercent,
      orderCountChangePercent,
      topProducts,
    };
  }

  /** Buckets real order rows into the last 7 days and the 7 before that,
   * for a genuine day-by-day trend plus a real week-over-week comparison —
   * never interpolated or estimated. */
  private buildWeeklyTrend(
    orders: Array<{ createdAt: Date; totalCents: number }>,
    startOfToday: Date,
    days: number,
  ): {
    weeklyTrend: DashboardSummary['weeklyTrend'];
    revenueChangePercent: number | null;
    orderCountChangePercent: number | null;
  } {
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const byDay = new Map<string, { orderCount: number; revenueCents: number }>();
    for (const order of orders) {
      const key = dayKey(order.createdAt);
      const entry = byDay.get(key) ?? { orderCount: 0, revenueCents: 0 };
      entry.orderCount++;
      entry.revenueCents += order.totalCents;
      byDay.set(key, entry);
    }

    const bucketFor = (daysAgo: number) => {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      const key = dayKey(d);
      const entry = byDay.get(key) ?? { orderCount: 0, revenueCents: 0 };
      // timeZone: 'UTC' — d is already a UTC-midnight instant; formatting
      // it in the server's local zone could shift the weekday label across
      // a day boundary depending on where the process happens to run.
      return { date: key, label: d.toLocaleDateString('en-US', days <= 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }), ...entry };
    };

    const weeklyTrend = Array.from({ length: days }, (_, i) => bucketFor(days - 1 - i));
    const priorWeek = Array.from({ length: days }, (_, i) => bucketFor(days * 2 - 1 - i));

    const sum = (rows: Array<{ orderCount: number; revenueCents: number }>, key: 'orderCount' | 'revenueCents') =>
      rows.reduce((total, row) => total + row[key], 0);

    const thisWeekRevenue = sum(weeklyTrend, 'revenueCents');
    const thisWeekOrders = sum(weeklyTrend, 'orderCount');
    const priorWeekRevenue = sum(priorWeek, 'revenueCents');
    const priorWeekOrders = sum(priorWeek, 'orderCount');

    return {
      weeklyTrend,
      revenueChangePercent: priorWeekRevenue > 0 ? ((thisWeekRevenue - priorWeekRevenue) / priorWeekRevenue) * 100 : null,
      orderCountChangePercent: priorWeekOrders > 0 ? ((thisWeekOrders - priorWeekOrders) / priorWeekOrders) * 100 : null,
    };
  }

  async listAuditLogs(params: { page: number; limit: number; action?: string; targetType?: string }) {
    const { page, limit, action, targetType } = params;
    const where = {
      ...(action ? { action: action as never } : {}),
      ...(targetType ? { targetType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async listAdmins() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true, createdAt: true },
    });
  }

  /**
   * Creates a new admin account with no password the creator ever knows —
   * a random, immediately-discarded value is hashed and stored purely to
   * satisfy the NOT NULL column, then a real password-reset email (the
   * same flow and token infrastructure as "forgot password") is sent so
   * the new admin sets their own credential. Mirrors the vendor-staff
   * invite pattern: the account that grants access never gets to know or
   * choose the password of the account it's granting access to.
   */
  async createAdmin(email: string): Promise<{ id: string; email: string; role: Role }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const throwawayPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await argon2.hash(throwawayPassword, { type: argon2.argon2id });

    const admin = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash, role: Role.ADMIN, emailVerifiedAt: new Date() },
      });
      await tx.cart.create({ data: { userId: u.id } });
      return u;
    });

    await this.auth.requestPasswordReset(email);

    return { id: admin.id, email: admin.email, role: admin.role };
  }
}

function merchandiseValue(item: { quantity: number; unitPriceCents: number; totalCents?: number; taxCents?: number; pricingSnapshot?: unknown }): number {
  return item.pricingSnapshot && item.totalCents !== undefined ? item.totalCents - (item.taxCents ?? 0) : item.quantity * item.unitPriceCents;
}
