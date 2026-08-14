import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VendorMembershipService } from './vendor-membership.service';
import { CreateVendorOfferDto } from './dto/create-vendor-offer.dto';
import { UpdateVendorOfferDto } from './dto/update-vendor-offer.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';

@Injectable()
export class VendorOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: VendorMembershipService,
  ) {}

  async list(userId: string) {
    const { vendorId } = await this.membership.requireMembership(userId);
    return this.prisma.vendorOffer.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, sku: true } },
      },
    });
  }

  async create(userId: string, dto: CreateVendorOfferDto) {
    const { vendorId } = await this.membership.requireMembership(userId);

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
      if (!variant || variant.productId !== dto.productId) {
        throw new BadRequestException('That variant does not belong to the specified product');
      }
    }

    if (dto.compareAtPriceCents !== undefined && dto.compareAtPriceCents <= dto.priceCents) {
      throw new BadRequestException('compareAtPriceCents must be greater than priceCents');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const offer = await tx.vendorOffer.create({
          data: {
            vendorId,
            productId: dto.productId,
            variantId: dto.variantId ?? null,
            vendorSku: dto.vendorSku,
            condition: dto.condition,
            priceCents: dto.priceCents,
            compareAtPriceCents: dto.compareAtPriceCents,
            stockQuantity: dto.stockQuantity,
            status: OfferStatus.DRAFT,
          },
        });

        if (dto.stockQuantity > 0) {
          await tx.inventoryAdjustment.create({
            data: {
              vendorOfferId: offer.id,
              delta: dto.stockQuantity,
              reason: 'RESTOCK',
              reference: 'initial-listing',
              actorUserId: userId,
            },
          });
        }

        return offer;
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'You already have an offer for this exact product/variant, or this SKU is already in use',
        );
      }
      throw err;
    }
  }

  async update(userId: string, offerId: string, dto: UpdateVendorOfferDto) {
    const { vendorId } = await this.membership.requireMembership(userId);
    const offer = await this.ownedOffer(vendorId, offerId);

    const data: Prisma.VendorOfferUpdateInput = {};
    if (dto.vendorSku !== undefined) data.vendorSku = dto.vendorSku;
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
    if (dto.compareAtPriceCents !== undefined) data.compareAtPriceCents = dto.compareAtPriceCents;
    if (dto.status !== undefined) data.status = dto.status;

    const nextPrice = dto.priceCents ?? offer.priceCents;
    const nextCompareAt = dto.compareAtPriceCents ?? offer.compareAtPriceCents;
    if (nextCompareAt !== null && nextCompareAt !== undefined && nextCompareAt <= nextPrice) {
      throw new BadRequestException('compareAtPriceCents must be greater than priceCents');
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    try {
      return await this.prisma.vendorOffer.update({ where: { id: offerId }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('That SKU is already in use for one of your other offers');
      }
      throw err;
    }
  }

  async adjustInventory(userId: string, offerId: string, dto: AdjustInventoryDto) {
    const { vendorId } = await this.membership.requireMembership(userId);
    await this.ownedOffer(vendorId, offerId);

    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE "VendorOffer"
        SET    "stockQuantity" = "stockQuantity" + ${dto.delta}
        WHERE  id = ${offerId}::uuid
          AND  "stockQuantity" + ${dto.delta} >= 0
      `;
      if (affected === 0) {
        throw new BadRequestException('This adjustment would bring stock below zero');
      }

      await tx.inventoryAdjustment.create({
        data: {
          vendorOfferId: offerId,
          delta: dto.delta,
          reason: dto.reason,
          reference: dto.reference,
          actorUserId: userId,
        },
      });

      return tx.vendorOffer.findUniqueOrThrow({ where: { id: offerId } });
    });
  }

  async listInventoryHistory(userId: string, offerId: string) {
    const { vendorId } = await this.membership.requireMembership(userId);
    await this.ownedOffer(vendorId, offerId);

    return this.prisma.inventoryAdjustment.findMany({
      where: { vendorOfferId: offerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async ownedOffer(vendorId: string, offerId: string) {
    const offer = await this.prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    // 404, not 403, for a real offer belonging to someone else — a vendor
    // shouldn't learn that an ID they don't own exists via a 403 vs. 404
    // distinction.
    if (offer.vendorId !== vendorId) throw new NotFoundException('Offer not found');
    return offer;
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
