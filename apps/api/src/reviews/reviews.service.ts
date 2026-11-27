import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { PublicReviewDto } from './dto/public-review.dto';

const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

type PublicReviewRow = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(
    slug: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: PublicReviewDto[]; total: number; page: number; limit: number }> {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const where = { productId: product.id, status: ReviewStatus.PUBLISHED };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_REVIEW_SELECT,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items: items.map((row) => this.toPublicReview(row)), total, page, limit };
  }

  /** Whether the caller can review this product, and which delivered
   * order item they'd review it against. Caps at one review per product
   * regardless of order count (see the unique constraint). */
  async getMyEligibility(userId: string, slug: string) {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const alreadyReviewed = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId: product.id } },
    });
    if (alreadyReviewed) return { eligible: false as const, orderItemId: null };

    const orderItem = await this.prisma.orderItem.findFirst({
      where: {
        order: { userId },
        vendorOffer: { productId: product.id },
        vendorOrder: { status: 'DELIVERED' },
        review: null,
      },
      select: { id: true },
    });

    return orderItem
      ? { eligible: true as const, orderItemId: orderItem.id }
      : { eligible: false as const, orderItemId: null };
  }

  async create(userId: string, slug: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: {
        order: { select: { userId: true } },
        vendorOrder: { select: { status: true } },
        vendorOffer: { select: { productId: true } },
      },
    });
    // 404, not 403 — same enumeration-prevention pattern used for vendor
    // ownership: don't confirm an order item exists to someone who
    // doesn't own it.
    if (!orderItem || orderItem.order.userId !== userId) {
      throw new NotFoundException('Order item not found');
    }
    if (orderItem.vendorOffer.productId !== product.id) {
      throw new BadRequestException('This order item is not for this product');
    }
    if (orderItem.vendorOrder.status !== 'DELIVERED') {
      throw new BadRequestException('You can only review delivered items');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            productId: product.id,
            userId,
            orderItemId: dto.orderItemId,
            rating: dto.rating,
            title: dto.title,
            body: dto.body,
          },
        });
        await this.recomputeRating(tx, product.id);
        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }
  }

  adminList(page = 1, limit = 25, status?: ReviewStatus) {
    const where = status ? { status } : {};
    return Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, limit }));
  }

  async adminSetStatus(reviewId: string, status: ReviewStatus) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({ where: { id: reviewId }, data: { status } });
      await this.recomputeRating(tx, review.productId);
      return updated;
    });
  }

  private toPublicReview(row: PublicReviewRow): PublicReviewDto {
    return {
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
    };
  }

  /** Derived-only — never hand-set elsewhere. */
  private async recomputeRating(tx: Prisma.TransactionClient, productId: string): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId, status: ReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: true,
    });
    await tx.product.update({
      where: { id: productId },
      data: { ratingAverage: agg._avg.rating ?? 0, ratingCount: agg._count },
    });
  }
}
