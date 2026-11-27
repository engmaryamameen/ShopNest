import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Promotion, PromotionScope, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculatePrices,
  discountAmount,
  PriceInput,
  PricingPromotion,
} from '../pricing/price-calculator';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

export interface DiscountResult {
  promotion: Promotion;
  discountCents: number;
  /** Set only for a VENDOR-scope code — which VendorOrder the discount
   * (and the redemption row) belongs to. */
  vendorOrderId?: string;
}

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pure — percent rounds down, and a discount never exceeds the base
   * it's applied against (a FIXED_AMOUNT code larger than the order is
   * capped, not a negative total). */
  computeDiscountCents(promotion: Pick<Promotion, 'type' | 'value'>, baseCents: number): number {
    return discountAmount(promotion, Math.max(0, baseCents));
  }

  validateConfiguration(data: CreatePromotionDto) {
    if (new Date(data.endsAt) <= new Date(data.startsAt))
      throw new BadRequestException('endsAt must be after startsAt');
    if (data.type === 'PERCENT' && (data.value < 1 || data.value > 100))
      throw new BadRequestException("A PERCENT promotion's value must be between 1 and 100");
    if (data.automatic && (data.maxRedemptions || data.maxRedemptionsPerUser))
      throw new BadRequestException(
        'Usage limits apply to coupon codes. Use dates and targeting for automatic promotions.',
      );
  }

  async assignProducts(
    promotionId: string,
    productIds: string[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Promotion> {
    if ('$transaction' in client)
      return this.prisma.$transaction((tx) => this.assignProducts(promotionId, productIds, tx));
    const [promotion] = await client.$queryRaw<
      Promotion[]
    >`SELECT * FROM "Promotion" WHERE id = ${promotionId}::uuid FOR UPDATE`;
    if (!promotion || promotion.scope !== 'PLATFORM')
      throw new BadRequestException('Select a platform promotion.');
    if (
      (await client.product.count({ where: { id: { in: productIds } } })) !==
      new Set(productIds).size
    )
      throw new BadRequestException('Some selected products no longer exist.');
    if (
      [promotion.brandIds, promotion.categoryIds, promotion.vendorIds, promotion.productTypes].some(
        (targets) => targets.length,
      )
    )
      throw new BadRequestException(
        'This promotion uses targeting rules. Manage its eligible brands, categories, types or vendors in Promotions.',
      );
    if (!promotion.productIds.length) return promotion;
    return client.promotion.update({
      where: { id: promotion.id },
      data: { productIds: [...new Set([...promotion.productIds, ...productIds])] },
    });
  }

  /** Apply-time sanity check — not the authoritative validation (that
   * happens locked, at checkout, in validateAndReserve below). Gives the
   * customer immediate feedback instead of only failing at checkout. */
  async resolveForApply(code: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findUnique({ where: { code } });
    if (!promotion || promotion.automatic) throw new NotFoundException('No such promotion code');
    const now = new Date();
    if (!promotion.isActive || now < promotion.startsAt || now > promotion.endsAt) {
      throw new BadRequestException('This promotion code is not currently valid');
    }
    return promotion;
  }

  /** The authoritative check — called inside the checkout transaction,
   * after locking the Promotion row (so a concurrent checkout redeeming
   * the same code serializes here, making the redemption counts below
   * accurate). Throws on anything that makes the code inapplicable right
   * now; the caller is expected to clear the cart's applied code on that
   * outcome, not silently drop the discount. */
  async validateAndReserve(
    tx: Prisma.TransactionClient,
    promotionId: string,
    params: {
      userId: string;
      platformSubtotalCents: number;
      eligibleSubtotalCents?: number;
      vendorOrders: Array<{ vendorId: string; vendorOrderId?: string; subtotalCents: number }>;
    },
    lockedPromotion?: Promotion,
  ): Promise<DiscountResult> {
    const promotion = lockedPromotion ?? (await this.lockPromotion(tx, promotionId));

    const now = new Date();
    if (!promotion.isActive || now < promotion.startsAt || now > promotion.endsAt) {
      throw new BadRequestException('Applied promotion is no longer valid');
    }

    let baseCents: number;
    let vendorOrderId: string | undefined;
    if (promotion.scope === PromotionScope.PLATFORM) {
      baseCents = params.platformSubtotalCents;
    } else {
      const match = params.vendorOrders.find((v) => v.vendorId === promotion.vendorId);
      if (!match) throw new BadRequestException('Applied promotion no longer applies to this cart');
      vendorOrderId = match.vendorOrderId;
      baseCents = match.subtotalCents;
    }

    baseCents = params.eligibleSubtotalCents ?? baseCents;
    if (promotion.minSubtotalCents !== null && baseCents < promotion.minSubtotalCents) {
      throw new BadRequestException("Order no longer meets this promotion's minimum subtotal");
    }

    if (promotion.maxRedemptions !== null) {
      const total = await tx.promotionRedemption.count({ where: { promotionId } });
      if (total >= promotion.maxRedemptions) {
        throw new BadRequestException('This promotion has reached its redemption limit');
      }
    }
    if (promotion.maxRedemptionsPerUser !== null) {
      const mine = await tx.promotionRedemption.count({
        where: { promotionId, userId: params.userId },
      });
      if (mine >= promotion.maxRedemptionsPerUser) {
        throw new BadRequestException(
          'You have already used this promotion the maximum number of times',
        );
      }
    }

    const discountCents = Math.min(
      this.computeDiscountCents(promotion, baseCents),
      promotion.maxDiscountCents ?? baseCents,
    );
    // A PERCENT code can floor to 0 on a small enough base — treat that
    // the same as "doesn't apply" rather than recording a zero-amount
    // redemption (PromotionRedemption.amountCents is CHECKed > 0).
    if (discountCents <= 0) {
      throw new BadRequestException('This promotion would not discount the current order');
    }
    return { promotion, discountCents, vendorOrderId };
  }

  async lockPromotion(tx: Prisma.TransactionClient, promotionId: string): Promise<Promotion> {
    const [promotion] = await tx.$queryRaw<
      Promotion[]
    >`SELECT * FROM "Promotion" WHERE id = ${promotionId}::uuid FOR UPDATE`;
    if (!promotion) throw new BadRequestException('Applied promotion no longer exists');
    return promotion;
  }

  async activeAutomatic(client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const now = new Date();
    const promotions = await client.promotion.findMany({
      where: { automatic: true, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { id: 'asc' },
    });
    return this.expandCategories(promotions, client);
  }

  async expandCategories<T extends PricingPromotion>(
    promotions: T[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<T[]> {
    if (!promotions.some((p) => p.categoryIds?.length)) return promotions;
    const categories = await client.category.findMany({ select: { id: true, parentId: true } });
    return promotions.map((promotion) => {
      if (!promotion.categoryIds?.length) return promotion;
      const ids = new Set(promotion.categoryIds);
      for (let changed = true; changed; ) {
        changed = false;
        for (const c of categories)
          if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
            ids.add(c.id);
            changed = true;
          }
      }
      return { ...promotion, categoryIds: [...ids] };
    });
  }

  async quote(
    inputs: PriceInput[],
    coupon?: PricingPromotion | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return calculatePrices(
      inputs,
      await this.activeAutomatic(client),
      coupon ? (await this.expandCategories([coupon], client))[0] : null,
    );
  }

  // ── Admin (PLATFORM scope) ──────────────────────────────────────────────

  async createPlatform(
    adminUserId: string,
    dto: CreatePromotionDto,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return this.create(
      { ...dto, scope: PromotionScope.PLATFORM, vendorId: null, createdByUserId: adminUserId },
      client,
    );
  }

  listPlatform() {
    return this.prisma.promotion.findMany({
      where: { scope: PromotionScope.PLATFORM },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePlatform(id: string, dto: UpdatePromotionDto) {
    const promotion = await this.owned(id, { scope: PromotionScope.PLATFORM });
    return this.prisma.promotion.update({
      where: { id: promotion.id },
      data: this.updateData(dto),
    });
  }

  // ── Vendor (VENDOR scope) ────────────────────────────────────────────────

  async createVendor(vendorId: string, userId: string, dto: CreatePromotionDto) {
    return this.create({ ...dto, scope: PromotionScope.VENDOR, vendorId, createdByUserId: userId });
  }

  listVendor(vendorId: string) {
    return this.prisma.promotion.findMany({
      where: { scope: PromotionScope.VENDOR, vendorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateVendor(vendorId: string, id: string, dto: UpdatePromotionDto) {
    const promotion = await this.owned(id, { scope: PromotionScope.VENDOR, vendorId });
    return this.prisma.promotion.update({
      where: { id: promotion.id },
      data: this.updateData(dto),
    });
  }

  private async create(
    data: CreatePromotionDto & {
      code: string;
      type: PromotionType;
      value: number;
      startsAt: string;
      endsAt: string;
      maxRedemptions?: number;
      maxRedemptionsPerUser?: number;
      minSubtotalCents?: number;
      scope: PromotionScope;
      vendorId: string | null;
      createdByUserId: string;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    this.validateConfiguration(data);
    const existing = await client.promotion.findUnique({ where: { code: data.code } });
    if (existing) throw new BadRequestException('That code is already in use');

    return client.promotion.create({
      data: {
        automatic: data.automatic ?? false,
        productIds: data.productIds,
        brandIds: data.brandIds,
        categoryIds: data.categoryIds,
        vendorIds: data.vendorIds,
        productTypes: data.productTypes,
        maxDiscountCents: data.maxDiscountCents,
        code: data.code,
        type: data.type,
        value: data.value,
        scope: data.scope,
        vendorId: data.vendorId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        maxRedemptions: data.maxRedemptions,
        maxRedemptionsPerUser: data.maxRedemptionsPerUser,
        minSubtotalCents: data.minSubtotalCents,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  private updateData(dto: UpdatePromotionDto): Prisma.PromotionUpdateInput {
    const data: Prisma.PromotionUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.maxRedemptions !== undefined) data.maxRedemptions = dto.maxRedemptions;
    if (dto.maxRedemptionsPerUser !== undefined)
      data.maxRedemptionsPerUser = dto.maxRedemptionsPerUser;
    if (dto.minSubtotalCents !== undefined) data.minSubtotalCents = dto.minSubtotalCents;
    return data;
  }

  private async owned(
    id: string,
    expect: { scope: PromotionScope; vendorId?: string },
  ): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promotion || promotion.scope !== expect.scope)
      throw new NotFoundException('Promotion not found');
    if (expect.vendorId !== undefined && promotion.vendorId !== expect.vendorId) {
      throw new ForbiddenException('Not your promotion');
    }
    return promotion;
  }
}
