import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

const CART_INCLUDE = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, slug: true, priceCents: true, imageUrl: true, stockQuantity: true, isActive: true },
      },
    },
    orderBy: { addedAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  async upsertItem(userId: string, dto: UpsertCartItemDto) {
    const maxQty = this.config.get<number>('app.cartMaxQuantityPerProduct', 10);

    if (dto.quantity > maxQty) {
      throw new BadRequestException(`Maximum ${maxQty} units per product`);
    }

    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);

      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, isActive: true, stockQuantity: true },
      });
      if (!product || !product.isActive) throw new NotFoundException('Product not found');
      if (product.stockQuantity < dto.quantity) {
        throw new ConflictException('Insufficient stock');
      }

      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      });

      if (existing) {
        return tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: dto.quantity },
          include: { product: { select: { id: true, name: true, slug: true, priceCents: true } } },
        });
      }

      return tx.cartItem.create({
        data: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity },
        include: { product: { select: { id: true, name: true, slug: true, priceCents: true } } },
      });
    });
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);
      const item = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      if (!item) throw new NotFoundException('Cart item not found');
      await tx.cartItem.delete({ where: { id: item.id } });
    });
  }

  async clearCart(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });
  }

  async lockCart(tx: Prisma.TransactionClient, userId: string): Promise<{ id: string }> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Cart" WHERE "userId" = ${userId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Cart not found');
    return rows[0];
  }
}
