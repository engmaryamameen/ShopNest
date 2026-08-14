import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartService } from '../cart.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = '00000000-0000-4000-a000-000000000001';
const OFFER_ID = '00000000-0000-4000-b000-000000000001';
const CART_ID = '00000000-0000-4000-c000-000000000001';

function makeTxMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: CART_ID }]),
    vendorOffer: { findUnique: jest.fn() },
    cartItem: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
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

describe('CartService', () => {
  let service: CartService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let config: ReturnType<typeof makeConfigMock>;

  beforeEach(async () => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    config = makeConfigMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
});
