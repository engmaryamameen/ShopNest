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
      this.prisma.$queryRaw<Array<{ netCents: bigint }>>`
        SELECT COALESCE(SUM(CASE WHEN i."pricingSnapshot" IS NOT NULL
          THEN i."totalCents" - i."taxCents" ELSE i."unitPriceCents" * i.quantity END), 0) AS "netCents"
        FROM "OrderItem" i JOIN "VendorOrder" o ON o.id = i."vendorOrderId"
        WHERE o."vendorId" = ${vendorId}::uuid AND o.status <> 'CANCELLED'
      `,
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

    const ordersByStatus = Object.fromEntries(
      orderCounts.map((r) => [r.status, r._count]),
    ) as Partial<Record<OrderStatus, number>>;
    const offersByStatus = Object.fromEntries(offerCounts.map((r) => [r.status, r._count]));

    return {
      totalRevenueCents: Number(revenue[0]?.netCents ?? 0),
      totalOrders: orderCounts.reduce((sum, r) => sum + r._count, 0),
      ordersAwaitingFulfilment: ordersByStatus.PENDING ?? 0,
      ordersByStatus,
      offersByStatus,
    };
  }
}
