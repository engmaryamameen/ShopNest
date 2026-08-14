import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { assertValidTransition } from './order-state-machine';

interface LockedOffer {
  id: string;
  priceCents: number;
  stockQuantity: number;
  vendorId: string;
  productId: string;
  productName: string;
  productSlug: string;
  vendorName: string;
}

const ORDER_INCLUDE = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  vendorOrders: { include: { vendor: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.OrderInclude;

/** Simple ordinal for the linear part of the state machine — CANCELLED is
 * handled separately since it isn't "behind" DELIVERED, it's terminal. */
const STATUS_RANK: Record<Exclude<OrderStatus, 'CANCELLED'>, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  SHIPPED: 2,
  DELIVERED: 3,
};

/** `Order.status` is a denormalized aggregate over its VendorOrders — an
 * order isn't "SHIPPED" until every vendor represented in it has shipped
 * their part. Rule: CANCELLED only if every VendorOrder is CANCELLED
 * (a partially-cancelled order is not itself cancelled); otherwise the
 * *least*-progressed status among the still-active VendorOrders. Recomputed
 * transactionally every time any VendorOrder transitions — see
 * DECISIONS.md for the invariant and why (multi-vendor fulfilment is
 * inherently uneven; this project keeps the aggregation rule deliberately
 * simple rather than modeling partial-shipment order states).
 */
export function aggregateOrderStatus(vendorOrderStatuses: OrderStatus[]): OrderStatus {
  if (vendorOrderStatuses.length === 0) return OrderStatus.PENDING;
  if (vendorOrderStatuses.every((s) => s === OrderStatus.CANCELLED)) return OrderStatus.CANCELLED;

  const active = vendorOrderStatuses.filter((s) => s !== OrderStatus.CANCELLED);
  return active.reduce((min, s) => (STATUS_RANK[s] < STATUS_RANK[min] ? s : min), active[0]);
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const existingOrder = await this.prisma.order.findUnique({
      where: { Order_userId_idempotencyKey_key: { userId, idempotencyKey: dto.idempotencyKey } },
      include: ORDER_INCLUDE,
    });
    if (existingOrder) return existingOrder;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const cart = await this.cartService.lockCart(tx, userId);

          const doubleCheck = await tx.order.findUnique({
            where: { Order_userId_idempotencyKey_key: { userId, idempotencyKey: dto.idempotencyKey } },
            include: ORDER_INCLUDE,
          });
          if (doubleCheck) return doubleCheck;

          const cartItems = await tx.cartItem.findMany({ where: { cartId: cart.id } });
          const validItems = cartItems.filter((i) => i.vendorOfferId);
          if (validItems.length === 0) throw new BadRequestException('Cart is empty');

          const offerIds = validItems.map((i) => i.vendorOfferId!);

          // Deterministic lock order (ORDER BY id) across every implicated
          // VendorOffer — identical discipline to the pre-Phase-2 Product
          // lock, just against the table that now owns price/stock.
          // `FOR UPDATE OF o` locks only VendorOffer rows, not the joined
          // Product/Vendor rows (read-only here, never mutated by checkout).
          const lockedOffers = await tx.$queryRaw<LockedOffer[]>(
            Prisma.sql`
              SELECT o.id, o."priceCents", o."stockQuantity", o."vendorId", o."productId",
                     p.name AS "productName", p.slug AS "productSlug", v.name AS "vendorName"
              FROM   "VendorOffer" o
              JOIN   "Product" p ON p.id = o."productId"
              JOIN   "Vendor" v ON v.id = o."vendorId"
              WHERE  o.id IN (${Prisma.join(offerIds.map((id) => Prisma.sql`${id}::uuid`))})
                AND  o.status = 'ACTIVE'
              ORDER  BY o.id
              FOR    UPDATE OF o
            `,
          );

          const offerMap = new Map(lockedOffers.map((o) => [o.id, o]));
          for (const item of validItems) {
            const offer = offerMap.get(item.vendorOfferId!);
            if (!offer) throw new BadRequestException(`Listing ${item.vendorOfferId} is unavailable`);
            if (offer.stockQuantity < item.quantity) {
              throw new ConflictException(`Insufficient stock for ${offer.productName}`);
            }
          }

          // One VendorOrder per distinct vendor represented in the cart.
          const byVendor = new Map<string, typeof validItems>();
          for (const item of validItems) {
            const offer = offerMap.get(item.vendorOfferId!)!;
            const list = byVendor.get(offer.vendorId) ?? [];
            list.push(item);
            byVendor.set(offer.vendorId, list);
          }

          const totalCents = validItems.reduce((sum, item) => {
            const offer = offerMap.get(item.vendorOfferId!)!;
            return sum + offer.priceCents * item.quantity;
          }, 0);

          const order = await tx.order.create({
            data: { userId, totalCents, currency: 'USD', idempotencyKey: dto.idempotencyKey },
          });

          for (const [vendorId, items] of byVendor) {
            const subtotalCents = items.reduce((sum, item) => {
              const offer = offerMap.get(item.vendorOfferId!)!;
              return sum + offer.priceCents * item.quantity;
            }, 0);

            const vendorOrder = await tx.vendorOrder.create({
              data: { orderId: order.id, vendorId, subtotalCents },
            });

            for (const item of items) {
              const offer = offerMap.get(item.vendorOfferId!)!;

              await tx.orderItem.create({
                data: {
                  orderId: order.id,
                  vendorOrderId: vendorOrder.id,
                  vendorOfferId: offer.id,
                  quantity: item.quantity,
                  unitPriceCents: offer.priceCents,
                  productName: offer.productName,
                  productSlug: offer.productSlug,
                  vendorName: offer.vendorName,
                },
              });

              const affected = await tx.$executeRaw`
                UPDATE "VendorOffer"
                SET    "stockQuantity" = "stockQuantity" - ${item.quantity}
                WHERE  id = ${offer.id}::uuid
                  AND  "stockQuantity" >= ${item.quantity}
              `;
              if (affected === 0) {
                throw new ConflictException(`Race condition: stock changed for ${offer.productName}`);
              }

              await tx.inventoryAdjustment.create({
                data: {
                  vendorOfferId: offer.id,
                  delta: -item.quantity,
                  reason: 'SALE',
                  reference: order.id,
                },
              });
            }
          }

          await tx.cartItem.deleteMany({ where: { id: { in: validItems.map((i) => i.id) } } });

          return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (err) {
      const prismaErr = err as Prisma.PrismaClientKnownRequestError | undefined;
      if (prismaErr?.code === 'P2034') {
        throw new ConflictException('Transaction conflict — retry with the same idempotency key');
      }
      throw err;
    }
  }

  async listMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    return order;
  }

  async cancelMyOrder(userId: string, orderId: string) {
    return this.transitionStatus(orderId, OrderStatus.CANCELLED, userId, Role.CUSTOMER);
  }

  async adminListOrders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: { ...ORDER_INCLUDE, user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adminGetOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { ...ORDER_INCLUDE, user: { select: { id: true, email: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async adminUpdateOrderStatus(orderId: string, dto: UpdateOrderStatusDto, adminId: string) {
    return this.transitionStatus(orderId, dto.status, adminId, Role.ADMIN);
  }

  /**
   * Applies `toStatus` to every VendorOrder under this Order — today that's
   * always exactly one (only the system vendor exists until Phase 3), but
   * the loop is correct for the real multi-vendor case too: all-or-nothing,
   * the same way a single customer/admin action has always applied to "the
   * order" as a whole. Per-vendor-only transitions (one seller ships while
   * another hasn't) are the vendor app's job (Phase 3), operating on a
   * single VendorOrder instead of looping every one under the order.
   */
  private async transitionStatus(
    orderId: string,
    toStatus: OrderStatus,
    actorId: string,
    role: Role,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const orderRows = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
        SELECT id, "userId" FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE
      `;
      if (orderRows.length === 0) throw new NotFoundException('Order not found');
      const order = orderRows[0];

      if (role === Role.CUSTOMER && order.userId !== actorId) {
        throw new ForbiddenException('Not your order');
      }

      const vendorOrders = await tx.vendorOrder.findMany({ where: { orderId }, select: { id: true, status: true } });
      if (vendorOrders.length === 0) throw new NotFoundException('Order has no vendor fulfilments');

      for (const vo of vendorOrders) {
        assertValidTransition(vo.status, toStatus, role);
      }

      for (const vo of vendorOrders) {
        await tx.vendorOrder.update({ where: { id: vo.id }, data: { status: toStatus } });

        await tx.orderStatusHistory.create({
          data: { orderId, vendorOrderId: vo.id, changedById: actorId, fromStatus: vo.status, toStatus },
        });

        // Restore inventory on cancellation — inside the same transaction,
        // exactly once, with a matching InventoryAdjustment per item.
        if (toStatus === OrderStatus.CANCELLED) {
          const items = await tx.orderItem.findMany({ where: { vendorOrderId: vo.id } });
          for (const item of items) {
            if (!item.vendorOfferId) continue;
            await tx.vendorOffer.update({
              where: { id: item.vendorOfferId },
              data: { stockQuantity: { increment: item.quantity } },
            });
            await tx.inventoryAdjustment.create({
              data: {
                vendorOfferId: item.vendorOfferId,
                delta: item.quantity,
                reason: 'RETURN',
                reference: orderId,
              },
            });
          }
        }
      }

      return this.recomputeOrderStatus(tx, orderId);
    });
  }

  /** Reads every VendorOrder's *current* status for this order and writes
   * the aggregate onto Order.status — shared by every code path that
   * changes a VendorOrder's status (today: transitionStatus above, which
   * moves every VendorOrder under an order together; Phase 3's vendor-app
   * fulfilment updates will move exactly one and call this same helper
   * afterward, so the aggregation logic is written once). */
  private async recomputeOrderStatus(tx: Prisma.TransactionClient, orderId: string) {
    const vendorOrders = await tx.vendorOrder.findMany({ where: { orderId }, select: { status: true } });
    const nextStatus = aggregateOrderStatus(vendorOrders.map((vo) => vo.status));

    return tx.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
      include: ORDER_INCLUDE,
    });
  }
}
