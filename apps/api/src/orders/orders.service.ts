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

interface LockedProduct {
  id: string;
  priceCents: number;
  name: string;
  slug: string;
  stockQuantity: number;
  isActive: boolean;
}

const ORDER_INCLUDE = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

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
          if (cartItems.length === 0) throw new BadRequestException('Cart is empty');

          const productIds = cartItems.map((i) => i.productId);

          const lockedProducts = await tx.$queryRaw<LockedProduct[]>(
            Prisma.sql`
              SELECT id, "priceCents", name, slug, "stockQuantity", "isActive"
              FROM   "Product"
              WHERE  id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
              ORDER  BY id
              FOR    UPDATE
            `,
          );

          const productMap = new Map(lockedProducts.map((p) => [p.id, p]));
          for (const item of cartItems) {
            const product = productMap.get(item.productId);
            if (!product || !product.isActive) {
              throw new BadRequestException(`Product ${item.productId} is unavailable`);
            }
            if (product.stockQuantity < item.quantity) {
              throw new ConflictException(`Insufficient stock for ${product.name}`);
            }
          }

          for (const item of cartItems) {
            const affected = await tx.$executeRaw`
              UPDATE "Product"
              SET    "stockQuantity" = "stockQuantity" - ${item.quantity}
              WHERE  id = ${item.productId}::uuid
                AND  "stockQuantity" >= ${item.quantity}
            `;
            if (affected === 0) {
              throw new ConflictException(`Race condition: stock changed for product ${item.productId}`);
            }
          }

          const totalCents = cartItems.reduce((sum, item) => {
            const p = productMap.get(item.productId)!;
            return sum + p.priceCents * item.quantity;
          }, 0);

          const order = await tx.order.create({
            data: {
              userId,
              totalCents,
              currency: 'USD',
              idempotencyKey: dto.idempotencyKey,
              items: {
                create: cartItems.map((item) => {
                  const p = productMap.get(item.productId)!;
                  return {
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPriceCents: p.priceCents,
                    productName: p.name,
                    productSlug: p.slug,
                  };
                }),
              },
            },
            include: ORDER_INCLUDE,
          });

          await tx.cartItem.deleteMany({ where: { id: { in: cartItems.map((i) => i.id) } } });

          return order;
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


  private async transitionStatus(
    orderId: string,
    toStatus: OrderStatus,
    actorId: string,
    role: Role,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus; userId: string }>>`
        SELECT id, status, "userId" FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE
      `;
      if (rows.length === 0) throw new NotFoundException('Order not found');
      const order = rows[0];

      if (role === Role.CUSTOMER && order.userId !== actorId) {
        throw new ForbiddenException('Not your order');
      }

      assertValidTransition(order.status, toStatus, role);

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: toStatus },
        include: ORDER_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actorId,
          fromStatus: order.status,
          toStatus,
        },
      });

      // Restore inventory on cancellation (inside same transaction — exactly once)
      if (toStatus === OrderStatus.CANCELLED) {
        const items = await tx.orderItem.findMany({ where: { orderId } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }

      return updated;
    });
  }
}
