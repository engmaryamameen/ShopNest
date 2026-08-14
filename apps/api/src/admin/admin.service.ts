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
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getDashboardSummary(): Promise<DashboardSummary> {
    const [
      userCounts,
      vendorCounts,
      productCounts,
      orderCounts,
      revenue,
      recentAuditLogs,
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
    ]);

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
