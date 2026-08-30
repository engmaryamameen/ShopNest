import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReviewsService } from '../reviews.service';
import { PrismaService } from '../../prisma/prisma.service';

const PRODUCT_ID = 'product-1';
const USER_ID = 'user-1';
const ORDER_ITEM_ID = 'order-item-1';

function prismaUniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.10.1' });
}

function makeTxMock() {
  return {
    review: { create: jest.fn().mockResolvedValue({ id: 'review-1' }), aggregate: jest.fn(), update: jest.fn() },
    product: { update: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    product: { findUnique: jest.fn().mockResolvedValue({ id: PRODUCT_ID }) },
    orderItem: { findUnique: jest.fn(), findFirst: jest.fn() },
    review: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('ReviewsService', () => {
  let service: ReviewsService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    tx.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 2 });
    service = new ReviewsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const validOrderItem = {
      id: ORDER_ITEM_ID,
      order: { userId: USER_ID },
      vendorOrder: { status: 'DELIVERED' },
      vendorOffer: { productId: PRODUCT_ID },
    };

    it('404s on a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.create(USER_ID, 'missing', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s on an order item that does not belong to the caller — not 403', async () => {
      prisma.orderItem.findUnique.mockResolvedValue({ ...validOrderItem, order: { userId: 'someone-else' } });
      await expect(
        service.create(USER_ID, 'slug', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an order item for a different product', async () => {
      prisma.orderItem.findUnique.mockResolvedValue({ ...validOrderItem, vendorOffer: { productId: 'other-product' } });
      await expect(
        service.create(USER_ID, 'slug', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-delivered order item', async () => {
      prisma.orderItem.findUnique.mockResolvedValue({ ...validOrderItem, vendorOrder: { status: 'SHIPPED' } });
      await expect(
        service.create(USER_ID, 'slug', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the review and recomputes the product rating in the same transaction', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(validOrderItem);
      await service.create(USER_ID, 'slug', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great product' } as never);

      expect(tx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ productId: PRODUCT_ID, userId: USER_ID }) }),
      );
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { ratingAverage: 4.5, ratingCount: 2 },
      });
    });

    it('translates a duplicate review (already reviewed, or orderItemId reused) into 409', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(validOrderItem);
      tx.review.create.mockRejectedValue(prismaUniqueViolation());
      await expect(
        service.create(USER_ID, 'slug', { orderItemId: ORDER_ITEM_ID, rating: 5, body: 'great' } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getMyEligibility', () => {
    it('is ineligible if the user already reviewed this product', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'existing-review' });
      const result = await service.getMyEligibility(USER_ID, 'slug');
      expect(result).toEqual({ eligible: false, orderItemId: null });
      expect(prisma.orderItem.findFirst).not.toHaveBeenCalled();
    });

    it('is eligible when a delivered, unreviewed order item exists', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.orderItem.findFirst.mockResolvedValue({ id: ORDER_ITEM_ID });
      const result = await service.getMyEligibility(USER_ID, 'slug');
      expect(result).toEqual({ eligible: true, orderItemId: ORDER_ITEM_ID });
    });

    it('is ineligible when there is no delivered order item to review against', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.orderItem.findFirst.mockResolvedValue(null);
      const result = await service.getMyEligibility(USER_ID, 'slug');
      expect(result).toEqual({ eligible: false, orderItemId: null });
    });
  });

  describe('adminSetStatus', () => {
    it('404s on a review that does not exist', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.adminSetStatus('missing', 'HIDDEN')).rejects.toThrow(NotFoundException);
    });

    it('hides a review and recomputes the rating (hidden reviews drop out of the average)', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'review-1', productId: PRODUCT_ID });
      await service.adminSetStatus('review-1', 'HIDDEN');
      expect(tx.review.update).toHaveBeenCalledWith({ where: { id: 'review-1' }, data: { status: 'HIDDEN' } });
      expect(tx.review.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: PRODUCT_ID, status: 'PUBLISHED' } }),
      );
    });
  });
});
