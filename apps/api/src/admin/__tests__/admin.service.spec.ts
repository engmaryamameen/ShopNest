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
