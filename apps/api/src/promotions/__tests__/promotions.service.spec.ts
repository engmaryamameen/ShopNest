import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PromotionsService } from '../promotions.service';
import { PrismaService } from '../../prisma/prisma.service';

const PROMOTION_ID = 'promo-1';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const USER_ID = 'user-1';

function makePromotion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROMOTION_ID,
    code: 'SAVE10',
    type: 'PERCENT',
    value: 10,
    scope: 'PLATFORM',
    vendorId: null,
    startsAt: new Date('2020-01-01'),
    endsAt: new Date('2999-01-01'),
    maxRedemptions: null,
    maxRedemptionsPerUser: null,
    minSubtotalCents: null,
    isActive: true,
    createdByUserId: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTxMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([makePromotion()]),
    promotionRedemption: { count: jest.fn().mockResolvedValue(0) },
  };
}

function makePrismaMock() {
  return {
    promotion: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
}

describe('PromotionsService', () => {
  let service: PromotionsService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new PromotionsService(prisma as unknown as PrismaService);
  });

  describe('computeDiscountCents', () => {
    it('PERCENT rounds down', () => {
      expect(service.computeDiscountCents({ type: 'PERCENT', value: 33 } as never, 1000)).toBe(330);
      expect(service.computeDiscountCents({ type: 'PERCENT', value: 1 } as never, 150)).toBe(1); // floor(1.5) = 1
    });

    it('FIXED_AMOUNT never exceeds the base', () => {
      expect(service.computeDiscountCents({ type: 'FIXED_AMOUNT', value: 500 } as never, 300)).toBe(300);
      expect(service.computeDiscountCents({ type: 'FIXED_AMOUNT', value: 500 } as never, 1000)).toBe(500);
    });

    it('returns 0 for a non-positive base', () => {
      expect(service.computeDiscountCents({ type: 'PERCENT', value: 10 } as never, 0)).toBe(0);
    });
  });

  describe('resolveForApply', () => {
    it('throws NotFoundException for an unknown code', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      await expect(service.resolveForApply('NOPE')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for an inactive code', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion({ isActive: false }));
      await expect(service.resolveForApply('SAVE10')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException outside the active window', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion({ startsAt: new Date('2999-01-01') }));
      await expect(service.resolveForApply('SAVE10')).rejects.toThrow(BadRequestException);
    });

    it('returns the promotion when active and in-window', async () => {
      const promo = makePromotion();
      prisma.promotion.findUnique.mockResolvedValue(promo);
      await expect(service.resolveForApply('SAVE10')).resolves.toEqual(promo);
    });
  });

  describe('validateAndReserve', () => {
    it('locks the promotion row via FOR UPDATE, not a plain SELECT', async () => {
      const tx = makeTxMock();
      await service.validateAndReserve(tx as never, PROMOTION_ID, {
        userId: USER_ID,
        platformSubtotalCents: 1000,
        vendorOrders: [],
      });
      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it('throws when the locked row no longer exists', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([]);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 1000, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when inactive or outside the window, even though apply-time already passed', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ isActive: false })]);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 1000, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PLATFORM scope discounts the whole cart subtotal', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ type: 'PERCENT', value: 10 })]);
      const result = await service.validateAndReserve(tx as never, PROMOTION_ID, {
        userId: USER_ID,
        platformSubtotalCents: 2000,
        vendorOrders: [{ vendorId: VENDOR_A, vendorOrderId: 'vo-1', subtotalCents: 500 }],
      });
      expect(result.discountCents).toBe(200); // 10% of the platform subtotal, not the vendor one
      expect(result.vendorOrderId).toBeUndefined();
    });

    it("VENDOR scope discounts only that vendor's subtotal, and returns its vendorOrderId", async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ scope: 'VENDOR', vendorId: VENDOR_A, type: 'FIXED_AMOUNT', value: 300 })]);
      const result = await service.validateAndReserve(tx as never, PROMOTION_ID, {
        userId: USER_ID,
        platformSubtotalCents: 5000,
        vendorOrders: [
          { vendorId: VENDOR_A, vendorOrderId: 'vo-a', subtotalCents: 1000 },
          { vendorId: VENDOR_B, vendorOrderId: 'vo-b', subtotalCents: 2000 },
        ],
      });
      expect(result.discountCents).toBe(300);
      expect(result.vendorOrderId).toBe('vo-a');
    });

    it('VENDOR scope throws when that vendor is no longer in the cart', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ scope: 'VENDOR', vendorId: VENDOR_A })]);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, {
          userId: USER_ID,
          platformSubtotalCents: 5000,
          vendorOrders: [{ vendorId: VENDOR_B, vendorOrderId: 'vo-b', subtotalCents: 2000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the base no longer meets minSubtotalCents', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ minSubtotalCents: 5000 })]);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 1000, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws once the global redemption limit is reached', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ maxRedemptions: 5 })]);
      tx.promotionRedemption.count.mockResolvedValue(5);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 1000, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws once this user's per-user redemption limit is reached, independent of the global count", async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ maxRedemptionsPerUser: 1 })]);
      tx.promotionRedemption.count.mockResolvedValueOnce(1); // per-user count
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 1000, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws instead of returning a zero-cent redemption when a PERCENT code floors to 0', async () => {
      const tx = makeTxMock();
      tx.$queryRaw.mockResolvedValue([makePromotion({ type: 'PERCENT', value: 1 })]);
      await expect(
        service.validateAndReserve(tx as never, PROMOTION_ID, { userId: USER_ID, platformSubtotalCents: 50, vendorOrders: [] }),
      ).rejects.toThrow(BadRequestException); // floor(50 * 1/100) = 0
    });
  });

  describe('create (shared by createPlatform/createVendor)', () => {
    it('rejects endsAt at or before startsAt', async () => {
      await expect(
        service.createPlatform('admin-1', {
          code: 'X',
          type: 'FIXED_AMOUNT',
          value: 100,
          startsAt: '2025-01-02T00:00:00.000Z',
          endsAt: '2025-01-01T00:00:00.000Z',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a PERCENT value outside 1-100', async () => {
      await expect(
        service.createPlatform('admin-1', {
          code: 'X',
          type: 'PERCENT',
          value: 150,
          startsAt: '2025-01-01T00:00:00.000Z',
          endsAt: '2025-02-01T00:00:00.000Z',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate code', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion());
      await expect(
        service.createPlatform('admin-1', {
          code: 'SAVE10',
          type: 'FIXED_AMOUNT',
          value: 100,
          startsAt: '2025-01-01T00:00:00.000Z',
          endsAt: '2025-02-01T00:00:00.000Z',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("createVendor forces scope=VENDOR and the caller's own vendorId, ignoring anything else in the DTO", async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      await service.createVendor(VENDOR_A, USER_ID, {
        code: 'VSAVE',
        type: 'FIXED_AMOUNT',
        value: 100,
        startsAt: '2025-01-01T00:00:00.000Z',
        endsAt: '2025-02-01T00:00:00.000Z',
      } as never);
      expect(prisma.promotion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scope: 'VENDOR', vendorId: VENDOR_A }) }),
      );
    });
  });

  describe('ownership isolation between scopes', () => {
    it('updatePlatform 404s on a VENDOR-scope promotion (wrong scope for this endpoint)', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion({ scope: 'VENDOR', vendorId: VENDOR_A }));
      await expect(service.updatePlatform(PROMOTION_ID, { isActive: false })).rejects.toThrow(NotFoundException);
    });

    it('updateVendor 403s when the promotion belongs to a different vendor', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion({ scope: 'VENDOR', vendorId: VENDOR_B }));
      await expect(service.updateVendor(VENDOR_A, PROMOTION_ID, { isActive: false })).rejects.toThrow(ForbiddenException);
    });

    it('updateVendor succeeds for the owning vendor', async () => {
      prisma.promotion.findUnique.mockResolvedValue(makePromotion({ scope: 'VENDOR', vendorId: VENDOR_A }));
      await service.updateVendor(VENDOR_A, PROMOTION_ID, { isActive: false });
      expect(prisma.promotion.update).toHaveBeenCalledWith({ where: { id: PROMOTION_ID }, data: { isActive: false } });
    });
  });
});
