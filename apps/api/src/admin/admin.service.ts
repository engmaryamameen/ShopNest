import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export interface DashboardSummary {
  users: { total: number; customers: number; vendorsRole: number; admins: number };
  vendors: { pending: number; approved: number; suspended: number; rejected: number };
  products: { draft: number; published: number; archived: number };
  orders: { byStatus: Partial<Record<string, number>>; totalRevenueCents: number };
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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getDashboardSummary(): Promise<DashboardSummary> {
    // UTC throughout, deliberately — day-key strings below are also
    // UTC-derived (toISOString()), and mixing a server-local midnight with
    // UTC day keys would misbucket every order near a day boundary on any
    // server not running in UTC.
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const fourteenDaysAgo = new Date(startOfToday);
    fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

    const [
      userCounts,
      vendorCounts,
      productCounts,
      orderCounts,
      revenue,
      recentAuditLogs,
      recentOrders,
      topProductRows,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.vendor.groupBy({ by: ['status'], _count: true }),
      this.prisma.product.groupBy({ by: ['publishStatus'], _count: true }),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      // Revenue counts every non-cancelled order — a cancelled order never
      // took payment, so it isn't revenue by any definition worth showing.
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
      this.prisma.orderItem.groupBy({
        by: ['productSlug', 'productName'],
        where: { order: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true },
        _avg: { unitPriceCents: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    const { weeklyTrend, revenueChangePercent, orderCountChangePercent } = this.buildWeeklyTrend(
      recentOrders,
      startOfToday,
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
      return { date: key, label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), ...entry };
    };

    const weeklyTrend = Array.from({ length: 7 }, (_, i) => bucketFor(6 - i));
    const priorWeek = Array.from({ length: 7 }, (_, i) => bucketFor(13 - i));

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
