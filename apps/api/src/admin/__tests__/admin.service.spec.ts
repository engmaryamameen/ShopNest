import { ConflictException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';

function makePrismaMock() {
  return {
    user: {
      groupBy: jest.fn().mockResolvedValue([
        { role: 'CUSTOMER', _count: 10 },
        { role: 'VENDOR', _count: 3 },
        { role: 'ADMIN', _count: 1 },
        { role: 'SUPER_ADMIN', _count: 1 },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vendor: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'PENDING', _count: 2 },
        { status: 'APPROVED', _count: 5 },
      ]),
    },
    product: {
      groupBy: jest.fn().mockResolvedValue([
        { publishStatus: 'PUBLISHED', _count: 40 },
        { publishStatus: 'DRAFT', _count: 4 },
      ]),
    },
    order: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'DELIVERED', _count: 12 },
        { status: 'CANCELLED', _count: 2 },
      ]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCents: 500000 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orderItem: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    cart: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'new-admin-id', email: 'new-admin@shopnest.dev', role: 'ADMIN' }) },
        cart: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }),
  };
}

describe('AdminService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let auth: { requestPasswordReset: jest.Mock };
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrismaMock();
    auth = { requestPasswordReset: jest.fn().mockResolvedValue(undefined) };
    service = new AdminService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  });

  describe('getDashboardSummary', () => {
    it('aggregates user/vendor/product/order counts and revenue from real groupBy queries', async () => {
      const summary = await service.getDashboardSummary();

      expect(summary.users).toEqual({ total: 15, customers: 10, vendorsRole: 3, admins: 2 });
      expect(summary.vendors.pending).toBe(2);
      expect(summary.vendors.approved).toBe(5);
      expect(summary.products.published).toBe(40);
      expect(summary.orders.byStatus).toEqual({ DELIVERED: 12, CANCELLED: 2 });
      expect(summary.orders.totalRevenueCents).toBe(500000);
      expect(summary.pendingVendorApplications).toBe(2);
    });

    it('excludes cancelled orders from the revenue aggregate query', async () => {
      await service.getDashboardSummary();
      expect(prisma.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { not: 'CANCELLED' } } }),
      );
    });

    it('buckets real orders into a 7-entry weekly trend, oldest first, with correct per-day totals', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      prisma.order.findMany.mockResolvedValue([
        { createdAt: today, totalCents: 1000 },
        { createdAt: today, totalCents: 500 },
        { createdAt: yesterday, totalCents: 2000 },
      ]);

      const summary = await service.getDashboardSummary();

      expect(summary.weeklyTrend).toHaveLength(7);
      const todayBucket = summary.weeklyTrend[summary.weeklyTrend.length - 1];
      const yesterdayBucket = summary.weeklyTrend[summary.weeklyTrend.length - 2];
      expect(todayBucket).toEqual(expect.objectContaining({ orderCount: 2, revenueCents: 1500 }));
      expect(yesterdayBucket).toEqual(expect.objectContaining({ orderCount: 1, revenueCents: 2000 }));
      // The five days before that had no real orders — zero, not omitted.
      expect(summary.weeklyTrend.slice(0, 5).every((d) => d.orderCount === 0 && d.revenueCents === 0)).toBe(true);
    });

    it('computes a real week-over-week revenue/order change from the prior 7 days', async () => {
      const today = new Date();
      const eightDaysAgo = new Date(today);
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      prisma.order.findMany.mockResolvedValue([
        { createdAt: today, totalCents: 20000 }, // this week: $200
        { createdAt: eightDaysAgo, totalCents: 10000 }, // prior week: $100
      ]);

      const summary = await service.getDashboardSummary();

      expect(summary.revenueChangePercent).toBe(100); // doubled
      expect(summary.orderCountChangePercent).toBe(0); // 1 order both weeks
    });

    it('reports null change percentages rather than 0% or Infinity% when the prior week had no activity', async () => {
      const today = new Date();
      prisma.order.findMany.mockResolvedValue([{ createdAt: today, totalCents: 5000 }]);

      const summary = await service.getDashboardSummary();

      expect(summary.revenueChangePercent).toBeNull();
      expect(summary.orderCountChangePercent).toBeNull();
    });

    it('ranks topProducts from real OrderItem aggregation, scoped to the last 30 days and non-cancelled orders', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productSlug: 'wireless-mouse', productName: 'Wireless Mouse', _sum: { quantity: 42 }, _avg: { unitPriceCents: 2550 } },
      ]);

      const summary = await service.getDashboardSummary();

      expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ order: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
          take: 5,
        }),
      );
      expect(summary.topProducts).toEqual([
        { productSlug: 'wireless-mouse', productName: 'Wireless Mouse', unitsSold: 42, averageUnitPriceCents: 2550 },
      ]);
    });
  });

  describe('createAdmin', () => {
    it('rejects an email that already has an account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.createAdmin('taken@shopnest.dev')).rejects.toThrow(ConflictException);
    });

    it('creates the account atomically with a cart, and issues a real password-reset email — never a known password', async () => {
      const result = await service.createAdmin('new-admin@shopnest.dev');

      expect(result).toEqual({ id: 'new-admin-id', email: 'new-admin@shopnest.dev', role: 'ADMIN' });
      expect(auth.requestPasswordReset).toHaveBeenCalledWith('new-admin@shopnest.dev');
    });
  });

  describe('listAuditLogs', () => {
    it('paginates and forwards action/targetType filters to the query', async () => {
      await service.listAuditLogs({ page: 2, limit: 10, action: 'ADMIN_VENDOR_APPROVE', targetType: 'Vendor' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'ADMIN_VENDOR_APPROVE', targetType: 'Vendor' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });
});
