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
import { PromotionsService } from '../promotions/promotions.service';
import { ApplyPromotionDto } from '../promotions/dto/apply-promotion.dto';

const CART_INCLUDE = {
  items: {
    include: {
      vendorOffer: {
        include: {
          taxClass: true,
          variant: {
            include: {
              attributeValues: { include: { attributeDefinition: { select: { name: true } } } },
            },
          },
          vendor: { select: { id: true, name: true, slug: true } },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              brandId: true,
              categoryId: true,
              productType: true,
              media: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
    orderBy: { addedAt: 'asc' as const },
  },
  appliedPromotion: true,
} satisfies Prisma.CartInclude;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly promotions: PromotionsService,
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

      const offer = await tx.vendorOffer.findFirst({
        where: {
          id: dto.vendorOfferId,
          status: OfferStatus.ACTIVE,
          product: { publishStatus: 'PUBLISHED' },
          vendor: { status: 'APPROVED' },
        },
        select: { id: true, status: true, stockQuantity: true },
      });
      if (!offer || offer.status !== OfferStatus.ACTIVE)
        throw new NotFoundException('Listing not found');
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

  async applyPromotion(userId: string, dto: ApplyPromotionDto) {
    const promotion = await this.promotions.resolveForApply(dto.code);
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);
      const current = await tx.cart.findUniqueOrThrow({
        where: { id: cart.id },
        include: CART_INCLUDE,
      });
      const coupon = await this.promotions.lockPromotion(tx, promotion.id);
      const priced = await this.toCartResponse({ ...current, appliedPromotion: coupon }, tx);
      const vendors = new Map<string, number>();
      for (const item of current.items)
        if (item.vendorOffer)
          vendors.set(
            item.vendorOffer.vendorId,
            (vendors.get(item.vendorOffer.vendorId) ?? 0) +
              item.vendorOffer.priceCents * item.quantity,
          );
      await this.promotions.validateAndReserve(
        tx,
        coupon.id,
        {
          userId,
          platformSubtotalCents: priced.pricing.subtotalCents,
          eligibleSubtotalCents: priced.pricing.couponEligibleSubtotalCents,
          vendorOrders: [...vendors].map(([vendorId, subtotalCents]) => ({
            vendorId,
            subtotalCents,
          })),
        },
        coupon,
      );
      await tx.cart.update({ where: { id: cart.id }, data: { appliedPromotionId: promotion.id } });
      return priced;
    });
  }

  async removePromotion(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, userId);
      await tx.cart.update({ where: { id: cart.id }, data: { appliedPromotionId: null } });
    });
    return this.getCart(userId);
  }

  async lockCart(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ id: string; appliedPromotionId: string | null }> {
    const rows = await tx.$queryRaw<Array<{ id: string; appliedPromotionId: string | null }>>`
      SELECT id, "appliedPromotionId" FROM "Cart" WHERE "userId" = ${userId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Cart not found');
    return rows[0];
  }

  /** Flattens vendorOffer→{vendor,product} into the shape the frontend
   * already expects a cart item to have (productId/name/slug/imageUrl/
   * priceCents), plus the new vendor identity — grouping items by vendor
   * for split-checkout display is a frontend concern, this just makes
   * every field available. */
  private async toCartResponse(
    cart: Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const items = cart.items
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
          lineTotalCents: offer.priceCents * item.quantity,
          stockQuantity: offer.stockQuantity,
          offerStatus: offer.status,
          vendor: offer.vendor,
          variantLabel:
            offer.variant?.attributeValues
              .map((attribute) => `${attribute.attributeDefinition.name}: ${attribute.value}`)
              .join(' · ') ||
            offer.variant?.sku ||
            null,
          product: {
            id: offer.product.id,
            name: offer.product.name,
            slug: offer.product.slug,
            imageUrl: offer.product.media[0]?.url ?? null,
          },
        };
      });

    const validCoupon =
      cart.appliedPromotion &&
      cart.appliedPromotion.isActive &&
      new Date() >= cart.appliedPromotion.startsAt &&
      new Date() <= cart.appliedPromotion.endsAt
        ? cart.appliedPromotion
        : null;
    const quote = await this.promotions.quote(
      cart.items
        .filter((item) => item.vendorOffer)
        .map((item) => {
          const offer = item.vendorOffer!;
          return {
            ...offer,
            quantity: item.quantity,
            brandId: offer.product.brandId,
            categoryId: offer.product.categoryId,
            productType: offer.product.productType,
          };
        }),
      validCoupon,
      client,
    );
    for (const item of items) {
      const line = quote.lines.find((line) => line.id === item.vendorOfferId)!;
      item.lineTotalCents = line.totalCents;
      item.priceCents = Math.round(line.totalCents / item.quantity);
    }
    return {
      id: cart.id,
      userId: cart.userId,
      updatedAt: cart.updatedAt,
      items,
      pricing: quote,
      appliedPromotion: cart.appliedPromotion
        ? { code: cart.appliedPromotion.code, discountPreviewCents: quote.couponDiscountCents }
        : null,
    };
  }
}
