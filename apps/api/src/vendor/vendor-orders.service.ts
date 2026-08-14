import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { assertValidTransition } from '../orders/order-state-machine';
import { VendorMembershipService } from './vendor-membership.service';

const VENDOR_ORDER_INCLUDE = {
  items: true,
  order: { select: { id: true, createdAt: true, currency: true, user: { select: { id: true, email: true } } } },
} as const;

@Injectable()
export class VendorOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly membership: VendorMembershipService,
  ) {}

  async list(userId: string, status?: OrderStatus) {
    const { vendorId } = await this.membership.requireMembership(userId);
    return this.prisma.vendorOrder.findMany({
      where: { vendorId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: VENDOR_ORDER_INCLUDE,
    });
  }

  async getOne(userId: string, vendorOrderId: string) {
    const { vendorId } = await this.membership.requireMembership(userId);
    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: { ...VENDOR_ORDER_INCLUDE, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    // 404, not 403, for another vendor's order — see VendorOffersService's
    // ownedOffer for the same reasoning.
    if (!vendorOrder || vendorOrder.vendorId !== vendorId) {
      throw new NotFoundException('Order not found');
    }
    return vendorOrder;
  }

  async updateStatus(userId: string, vendorOrderId: string, toStatus: OrderStatus) {
    const { vendorId } = await this.membership.requireMembership(userId);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; orderId: string; vendorId: string; status: OrderStatus }>>`
        SELECT id, "orderId", "vendorId", status FROM "VendorOrder" WHERE id = ${vendorOrderId}::uuid FOR UPDATE
      `;
      if (rows.length === 0 || rows[0].vendorId !== vendorId) {
        throw new NotFoundException('Order not found');
      }
      const vendorOrder = rows[0];

      assertValidTransition(vendorOrder.status, toStatus, Role.VENDOR);

      const updated = await tx.vendorOrder.update({
        where: { id: vendorOrderId },
        data: { status: toStatus },
        include: VENDOR_ORDER_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: vendorOrder.orderId,
          vendorOrderId,
          changedById: userId,
          fromStatus: vendorOrder.status,
          toStatus,
        },
      });

      await this.ordersService.recomputeOrderStatus(tx, vendorOrder.orderId);

      return updated;
    });
  }
}
