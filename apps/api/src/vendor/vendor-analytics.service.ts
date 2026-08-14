import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VendorMembershipService } from './vendor-membership.service';

@Injectable()
export class VendorAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: VendorMembershipService,
  ) {}

  /** Deliberately basic — revenue/order counts and a fulfilment queue
   * size, not a dashboard-builder. Revenue counts every non-cancelled
   * VendorOrder (not just DELIVERED) since that's what the vendor is
   * actually owed/expecting; a finer "confirmed vs. paid-out" breakdown is
   * a payout-system concern this project's scope doesn't cover. */
  async summary(userId: string) {
    const { vendorId } = await this.membership.requireMembership(userId);

    const [revenue, orderCounts, offerCounts] = await Promise.all([
      this.prisma.vendorOrder.aggregate({
        where: { vendorId, status: { not: OrderStatus.CANCELLED } },
        _sum: { subtotalCents: true },
      }),
      this.prisma.vendorOrder.groupBy({
        by: ['status'],
        where: { vendorId },
        _count: true,
      }),
      this.prisma.vendorOffer.groupBy({
        by: ['status'],
        where: { vendorId },
        _count: true,
      }),
    ]);

    const ordersByStatus = Object.fromEntries(orderCounts.map((r) => [r.status, r._count])) as Partial<
      Record<OrderStatus, number>
    >;
    const offersByStatus = Object.fromEntries(offerCounts.map((r) => [r.status, r._count]));

    return {
      totalRevenueCents: revenue._sum.subtotalCents ?? 0,
      totalOrders: orderCounts.reduce((sum, r) => sum + r._count, 0),
      ordersAwaitingFulfilment: ordersByStatus.PENDING ?? 0,
      ordersByStatus,
      offersByStatus,
    };
  }
}
