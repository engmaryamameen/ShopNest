import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VendorOffersService } from '../vendor-offers.service';
import { VendorMembershipService } from '../vendor-membership.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = 'user-1';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const OFFER_ID = 'offer-1';
const PRODUCT_ID = 'product-1';

function prismaUniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.10.1' });
}

function makeTxMock() {
  return {
    vendorOffer: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    inventoryAdjustment: { create: jest.fn() },
    $executeRaw: jest.fn(),
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    product: { findUnique: jest.fn() },
    productVariant: { findUnique: jest.fn() },
    vendorOffer: { findUnique: jest.fn(), update: jest.fn() },
    inventoryAdjustment: { findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('VendorOffersService', () => {
  let service: VendorOffersService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let membership: { requireMembership: jest.Mock };

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    membership = { requireMembership: jest.fn().mockResolvedValue({ vendorId: VENDOR_A, memberRole: 'OWNER' }) };
    service = new VendorOffersService(
      prisma as unknown as PrismaService,
      membership as unknown as VendorMembershipService,
    );
  });

  describe('create', () => {
    it('rejects an offer for a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.create(USER_ID, { productId: PRODUCT_ID, vendorSku: 'sku-1', priceCents: 100, stockQuantity: 1 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a variantId that belongs to a different product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', productId: 'some-other-product' });
      await expect(
        service.create(USER_ID, {
          productId: PRODUCT_ID,
          variantId: 'v1',
          vendorSku: 'sku-1',
          priceCents: 100,
          stockQuantity: 1,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects compareAtPriceCents <= priceCents', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      await expect(
        service.create(USER_ID, {
          productId: PRODUCT_ID,
          vendorSku: 'sku-1',
          priceCents: 1000,
          compareAtPriceCents: 1000,
          stockQuantity: 1,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the offer under the caller\'s own vendorId — never a vendorId from the request', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      tx.vendorOffer.create.mockResolvedValue({ id: OFFER_ID });

      await service.create(USER_ID, {
        productId: PRODUCT_ID,
        vendorSku: 'sku-1',
        priceCents: 1000,
        stockQuantity: 5,
        // Even if a caller tried to smuggle a vendorId in, the DTO has no
        // such field — this line documents the intent, not a real field.
      } as never);

      expect(tx.vendorOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vendorId: VENDOR_A }) }),
      );
      expect(tx.inventoryAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ delta: 5, reason: 'RESTOCK' }) }),
      );
    });

    it('translates a unique-constraint race into 409 ConflictException', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      tx.vendorOffer.create.mockRejectedValue(prismaUniqueViolation());
      await expect(
        service.create(USER_ID, { productId: PRODUCT_ID, vendorSku: 'sku-1', priceCents: 100, stockQuantity: 1 } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cross-vendor denial', () => {
    it('update() 404s (not 403s) on an offer owned by a different vendor', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, vendorId: VENDOR_B, priceCents: 100 });
      await expect(service.update(USER_ID, OFFER_ID, { priceCents: 200 } as never)).rejects.toThrow(NotFoundException);
      expect(prisma.vendorOffer.update).not.toHaveBeenCalled();
    });

    it('adjustInventory() 404s on an offer owned by a different vendor', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, vendorId: VENDOR_B });
      await expect(
        service.adjustInventory(USER_ID, OFFER_ID, { delta: 5, reason: 'RESTOCK' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('listInventoryHistory() 404s on an offer owned by a different vendor', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, vendorId: VENDOR_B });
      await expect(service.listInventoryHistory(USER_ID, OFFER_ID)).rejects.toThrow(NotFoundException);
    });

    it('404s (not a raw null) on an offer that does not exist at all', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue(null);
      await expect(service.update(USER_ID, 'missing', { priceCents: 100 } as never)).rejects.toThrow(NotFoundException);
    });
  });

  describe('adjustInventory', () => {
    it('rejects an adjustment that would bring stock below zero (conditional UPDATE affects 0 rows)', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, vendorId: VENDOR_A });
      tx.$executeRaw.mockResolvedValue(0);
      await expect(
        service.adjustInventory(USER_ID, OFFER_ID, { delta: -100, reason: 'CORRECTION' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(tx.inventoryAdjustment.create).not.toHaveBeenCalled();
    });

    it('records the adjustment with the acting user as actor when stock allows it', async () => {
      prisma.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, vendorId: VENDOR_A });
      tx.$executeRaw.mockResolvedValue(1);
      tx.vendorOffer.findUniqueOrThrow.mockResolvedValue({ id: OFFER_ID, stockQuantity: 15 });

      await service.adjustInventory(USER_ID, OFFER_ID, { delta: 10, reason: 'RESTOCK', reference: 'PO-1' } as never);

      expect(tx.inventoryAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vendorOfferId: OFFER_ID, delta: 10, reason: 'RESTOCK', actorUserId: USER_ID }),
        }),
      );
    });
  });
});
