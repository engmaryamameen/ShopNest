import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartService } from '../cart.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PromotionsService } from '../../promotions/promotions.service';

const USER_ID = '00000000-0000-4000-a000-000000000001';
const OFFER_ID = '00000000-0000-4000-b000-000000000001';
const CART_ID = '00000000-0000-4000-c000-000000000001';

function makeTxMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: CART_ID, appliedPromotionId: null }]),
    vendorOffer: { findUnique: jest.fn() },
    cartItem: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    cart: { update: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    cart: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

function makeConfigMock(maxQty = 10) {
  return { get: jest.fn().mockReturnValue(maxQty) };
}

function makePromotionsServiceMock() {
  return {
    resolveForApply: jest.fn(),
    computeDiscountCents: jest.fn().mockReturnValue(0),
  };
}

describe('CartService', () => {
  let service: CartService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let config: ReturnType<typeof makeConfigMock>;
  let promotions: ReturnType<typeof makePromotionsServiceMock>;

  beforeEach(async () => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    config = makeConfigMock();
    promotions = makePromotionsServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: PromotionsService, useValue: promotions },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  describe('getCart', () => {
    it('throws NotFoundException when the user has no cart row', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      await expect(service.getCart(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('flattens each item\'s vendorOffer/product into the response and drops items whose offer was deleted', async () => {
      const cart = {
        id: CART_ID,
        userId: USER_ID,
        updatedAt: new Date(),
        items: [
          {
            id: 'item-1',
            quantity: 2,
            addedAt: new Date(),
            updatedAt: new Date(),
            vendorOffer: {
              id: OFFER_ID,
              priceCents: 999,
              stockQuantity: 5,
              status: 'ACTIVE',
              vendor: { id: 'v1', name: 'ShopNest Direct', slug: 'shopnest-direct' },
              product: { id: 'p1', name: 'Widget', slug: 'widget', media: [{ url: 'https://x/y.jpg' }] },
            },
          },
          // Defensive case: FK is Restrict so this shouldn't happen, but a
          // null vendorOffer must never crash the response, only be dropped.
          { id: 'item-2', quantity: 1, addedAt: new Date(), updatedAt: new Date(), vendorOffer: null },
        ],
      };
      prisma.cart.findUnique.mockResolvedValue(cart);

      const result = await service.getCart(USER_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        vendorOfferId: OFFER_ID,
        quantity: 2,
        priceCents: 999,
        stockQuantity: 5,
        vendor: { name: 'ShopNest Direct' },
        product: { name: 'Widget', imageUrl: 'https://x/y.jpg' },
      });
    });
  });

  describe('upsertItem', () => {
    it('rejects a quantity above the configured per-listing maximum before touching the database', async () => {
      config.get.mockReturnValue(5);

      await expect(
        service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 6 } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an offer that does not exist', async () => {
      tx.vendorOffer.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 1 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an offer that is not ACTIVE', async () => {
      tx.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, status: 'INACTIVE', stockQuantity: 10 });

      await expect(
        service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 1 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when requested quantity exceeds available stock', async () => {
      tx.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, status: 'ACTIVE', stockQuantity: 2 });

      await expect(
        service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 3 } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('updates the existing cart item (sets quantity, not delta) when one already exists', async () => {
      tx.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, status: 'ACTIVE', stockQuantity: 10 });
      tx.cartItem.findUnique.mockResolvedValue({ id: 'existing-item', quantity: 1 });
      tx.cartItem.update.mockResolvedValue({ id: 'existing-item', quantity: 4 });

      await service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 4 } as never);

      expect(tx.cartItem.update).toHaveBeenCalledWith({ where: { id: 'existing-item' }, data: { quantity: 4 } });
      expect(tx.cartItem.create).not.toHaveBeenCalled();
    });

    it('creates a new cart item when none exists yet for this offer', async () => {
      tx.vendorOffer.findUnique.mockResolvedValue({ id: OFFER_ID, status: 'ACTIVE', stockQuantity: 10 });
      tx.cartItem.findUnique.mockResolvedValue(null);
      tx.cartItem.create.mockResolvedValue({ id: 'new-item', quantity: 2 });

      await service.upsertItem(USER_ID, { vendorOfferId: OFFER_ID, quantity: 2 } as never);

      expect(tx.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: CART_ID, vendorOfferId: OFFER_ID, quantity: 2 },
      });
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when the item is not in the cart', async () => {
      tx.cartItem.findUnique.mockResolvedValue(null);
      await expect(service.removeItem(USER_ID, OFFER_ID)).rejects.toThrow(NotFoundException);
      expect(tx.cartItem.delete).not.toHaveBeenCalled();
    });

    it('deletes the item when it exists', async () => {
      tx.cartItem.findUnique.mockResolvedValue({ id: 'item-1' });
      await service.removeItem(USER_ID, OFFER_ID);
      expect(tx.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    });
  });

  describe('clearCart', () => {
    it('deletes every item belonging to the locked cart', async () => {
      await service.clearCart(USER_ID);
      expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: CART_ID } });
    });
  });

  describe('lockCart', () => {
    it('throws NotFoundException when the user has no cart row to lock', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(service.lockCart(tx as never, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyPromotion / removePromotion', () => {
    it('applyPromotion resolves the code, sets it on the locked cart, then returns the fresh cart', async () => {
      promotions.resolveForApply.mockResolvedValue({ id: 'promo-1', code: 'SAVE10' });
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID, userId: USER_ID, updatedAt: new Date(), items: [] });

      await service.applyPromotion(USER_ID, { code: 'SAVE10' } as never);

      expect(promotions.resolveForApply).toHaveBeenCalledWith('SAVE10');
      expect(tx.cart.update).toHaveBeenCalledWith({ where: { id: CART_ID }, data: { appliedPromotionId: 'promo-1' } });
    });

    it('applyPromotion propagates without touching the cart when the code itself is invalid', async () => {
      promotions.resolveForApply.mockRejectedValue(new BadRequestException('This promotion code is not currently valid'));

      await expect(service.applyPromotion(USER_ID, { code: 'EXPIRED' } as never)).rejects.toThrow(BadRequestException);
      expect(tx.cart.update).not.toHaveBeenCalled();
    });

    it('removePromotion clears the applied promotion on the locked cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID, userId: USER_ID, updatedAt: new Date(), items: [] });

      await service.removePromotion(USER_ID);

      expect(tx.cart.update).toHaveBeenCalledWith({ where: { id: CART_ID }, data: { appliedPromotionId: null } });
    });
  });

  describe('getCart discount preview', () => {
    it('computes a PLATFORM-scope preview over every item, and omits it when no promotion is applied', async () => {
      const cart = {
        id: CART_ID,
        userId: USER_ID,
        updatedAt: new Date(),
        appliedPromotion: { id: 'promo-1', code: 'SAVE10', type: 'PERCENT', value: 10, scope: 'PLATFORM', vendorId: null },
        items: [
          {
            id: 'item-1',
            quantity: 2,
            addedAt: new Date(),
            updatedAt: new Date(),
            vendorOffer: {
              id: OFFER_ID,
              priceCents: 1000,
              stockQuantity: 5,
              status: 'ACTIVE',
              vendor: { id: 'v1', name: 'ShopNest Direct', slug: 'shopnest-direct' },
              product: { id: 'p1', name: 'Widget', slug: 'widget', media: [] },
            },
          },
        ],
      };
      prisma.cart.findUnique.mockResolvedValue(cart);
      promotions.computeDiscountCents.mockReturnValue(200);

      const result = await service.getCart(USER_ID);

      expect(promotions.computeDiscountCents).toHaveBeenCalledWith(cart.appliedPromotion, 2000);
      expect(result.appliedPromotion).toEqual({ code: 'SAVE10', discountPreviewCents: 200 });
    });

    it('omits appliedPromotion entirely when the cart has none applied', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID, userId: USER_ID, updatedAt: new Date(), items: [] });

      const result = await service.getCart(USER_ID);

      expect(result.appliedPromotion).toBeNull();
      expect(promotions.computeDiscountCents).not.toHaveBeenCalled();
    });
  });
});
