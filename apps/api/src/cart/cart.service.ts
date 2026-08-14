import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OfferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

const CART_INCLUDE = {
  items: {
    include: {
      vendorOffer: {
        include: {
          vendor: { select: { id: true, name: true, slug: true } },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              media: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
            },
          },
        },
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
    return this.toCartResponse(cart);
  }

  async upsertItem(userId: string, dto: UpsertCartItemDto) {
    const maxQty = this.config.get<number>('app.cartMaxQuantityPerProduct', 10);

    if (dto.quantity > maxQty) {
      throw new BadRequestException(`Maximum ${maxQty} units per listing`);
    }

    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);

      const offer = await tx.vendorOffer.findUnique({
        where: { id: dto.vendorOfferId },
        select: { id: true, status: true, stockQuantity: true },
      });
      if (!offer || offer.status !== OfferStatus.ACTIVE) throw new NotFoundException('Listing not found');
      if (offer.stockQuantity < dto.quantity) {
        throw new ConflictException('Insufficient stock');
      }

      const existing = await tx.cartItem.findUnique({
        where: { cartId_vendorOfferId: { cartId: cart.id, vendorOfferId: dto.vendorOfferId } },
      });

      const item = existing
        ? await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: dto.quantity } })
        : await tx.cartItem.create({
            data: { cartId: cart.id, vendorOfferId: dto.vendorOfferId, quantity: dto.quantity },
          });

      return item;
    });
  }

  async removeItem(userId: string, vendorOfferId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);
      const item = await tx.cartItem.findUnique({
        where: { cartId_vendorOfferId: { cartId: cart.id, vendorOfferId } },
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

  /** Flattens vendorOffer→{vendor,product} into the shape the frontend
   * already expects a cart item to have (productId/name/slug/imageUrl/
   * priceCents), plus the new vendor identity — grouping items by vendor
   * for split-checkout display is a frontend concern (Phase 5), this just
   * makes every field available. */
  private toCartResponse(cart: Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>) {
    return {
      id: cart.id,
      userId: cart.userId,
      updatedAt: cart.updatedAt,
      items: cart.items
        .filter((item) => item.vendorOffer !== null)
        .map((item) => {
          const offer = item.vendorOffer!;
          return {
            id: item.id,
            vendorOfferId: offer.id,
            quantity: item.quantity,
            addedAt: item.addedAt,
            updatedAt: item.updatedAt,
            priceCents: offer.priceCents,
            stockQuantity: offer.stockQuantity,
            offerStatus: offer.status,
            vendor: offer.vendor,
            product: {
              id: offer.product.id,
              name: offer.product.name,
              slug: offer.product.slug,
              imageUrl: offer.product.media[0]?.url ?? null,
            },
          };
        }),
    };
  }
}
