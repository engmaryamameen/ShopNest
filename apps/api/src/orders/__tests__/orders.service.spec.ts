import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService, aggregateOrderStatus } from '../orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../../cart/cart.service';
import { PromotionsService } from '../../promotions/promotions.service';
import { PAYMENT_PROVIDER } from '../../payment/payment.types';
import { PaymentDeclinedException } from '../../payment/payment-declined.exception';

const OFFER_ID_A = '00000000-0000-4000-a000-000000000001';
const OFFER_ID_B = '00000000-0000-4000-a000-000000000002';
const VENDOR_ID_1 = '00000000-0000-4000-a000-000000000010';
const VENDOR_ID_2 = '00000000-0000-4000-a000-000000000020';
const USER_ID = '00000000-0000-4000-b000-000000000001';
const ORDER_ID = '00000000-0000-4000-c000-000000000001';
const IDEMPOTENCY_KEY = '00000000-0000-4000-d000-000000000001';

const mockOffer = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  priceCents: 1000,
  stockQuantity: 10,
  vendorId: VENDOR_ID_1,
  productId: `product-for-${id}`,
  productName: `Product ${id}`,
  productSlug: `product-${id}`,
  vendorName: 'ShopNest Direct',
  ...overrides,
});

const mockCartItem = (vendorOfferId: string, quantity = 2) => ({
  id: `ci-${vendorOfferId}`,
  cartId: 'cart-id',
  vendorOfferId,
  quantity,
  addedAt: new Date(),
  updatedAt: new Date(),
});

function makePrismaMock() {
  return {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    orderStatusHistory: { create: jest.fn() },
    orderItem: { findMany: jest.fn(), create: jest.fn() },
    vendorOrder: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    vendorOffer: { update: jest.fn() },
    inventoryAdjustment: { create: jest.fn() },
    cartItem: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
}

function makeCartServiceMock() {
  return { lockCart: jest.fn().mockResolvedValue({ id: 'cart-id', appliedPromotionId: null }) };
}

function makePromotionsServiceMock() {
  return { validateAndReserve: jest.fn() };
}

function makePaymentProviderMock() {
  return { charge: jest.fn().mockResolvedValue({ providerRef: 'mock_charge_test' }), refund: jest.fn() };
}

/** A fresh transaction-client mock matching every model the checkout path
 * touches — individual tests override just the calls they care about. */
function makeCheckoutTxMock() {
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: ORDER_ID }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: ORDER_ID, items: [], statusHistory: [], vendorOrders: [] }),
    },
    vendorOrder: { create: jest.fn().mockResolvedValue({ id: 'vo-1', vendorId: VENDOR_ID_1, subtotalCents: 0 }) },
    orderItem: { create: jest.fn() },
    inventoryAdjustment: { create: jest.fn() },
    cartItem: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    cart: { update: jest.fn() },
    promotionRedemption: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

describe('aggregateOrderStatus', () => {
  it('is PENDING for zero vendor orders (defensive default)', () => {
    expect(aggregateOrderStatus([])).toBe(OrderStatus.PENDING);
  });

  it('is CANCELLED only when every vendor order is CANCELLED', () => {
    expect(aggregateOrderStatus([OrderStatus.CANCELLED, OrderStatus.CANCELLED])).toBe(OrderStatus.CANCELLED);
  });

  it('is not CANCELLED when only some vendor orders are cancelled — a partial cancellation is not a full one', () => {
    expect(aggregateOrderStatus([OrderStatus.CANCELLED, OrderStatus.SHIPPED])).toBe(OrderStatus.SHIPPED);
  });

  it('is the least-progressed status among the still-active vendor orders', () => {
    expect(aggregateOrderStatus([OrderStatus.SHIPPED, OrderStatus.CONFIRMED, OrderStatus.DELIVERED])).toBe(
      OrderStatus.CONFIRMED,
    );
  });
});

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let cartService: ReturnType<typeof makeCartServiceMock>;
  let promotionsService: ReturnType<typeof makePromotionsServiceMock>;
  let paymentProvider: ReturnType<typeof makePaymentProviderMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    cartService = makeCartServiceMock();
    promotionsService = makePromotionsServiceMock();
    paymentProvider = makePaymentProviderMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CartService, useValue: cartService },
        { provide: PromotionsService, useValue: promotionsService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('checkout idempotency', () => {
    it('returns existing order if idempotency key already used (pre-check)', async () => {
      const existingOrder = { id: ORDER_ID, status: OrderStatus.PENDING };
      prisma.order.findUnique.mockResolvedValue(existingOrder);

      const result = await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });
      expect(result).toBe(existingOrder);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns existing order from inside transaction (double-check after cart lock)', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null); // outside tx: miss

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.order.findUnique.mockResolvedValue({ id: ORDER_ID }); // inside tx: hit
        return fn(tx);
      });

      const result = await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });
      expect(result).toEqual({ id: ORDER_ID });
    });

    it('throws BadRequestException for an empty cart', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeCheckoutTxMock()));

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException if stock insufficient at lock time', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 100)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A, { stockQuantity: 5 })]);
        return fn(tx);
      });

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws BadRequestException when the locked offer is no longer ACTIVE (excluded by the WHERE clause, so absent from the lock query result)', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1)]);
        tx.$queryRaw.mockResolvedValue([]); // offer not returned — inactive or gone
        return fn(tx);
      });

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkout inventory decrement', () => {
    it('decrements stock for each offer exactly once and records a matching InventoryAdjustment', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      let executeRawCallCount = 0;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 2), mockCartItem(OFFER_ID_B, 1)]);
        tx.$queryRaw.mockResolvedValue([
          mockOffer(OFFER_ID_A, { stockQuantity: 10 }),
          mockOffer(OFFER_ID_B, { stockQuantity: 5 }),
        ]);
        tx.$executeRaw.mockImplementation(() => {
          executeRawCallCount++;
          return 1;
        });
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });
      expect(executeRawCallCount).toBe(2); // one per offer
    });

    it('throws ConflictException if the conditional UPDATE returns 0 affected rows (race)', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 2)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A, { stockQuantity: 10 })]);
        tx.$executeRaw.mockResolvedValue(0); // race condition
        return fn(tx);
      });

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('multi-vendor checkout split', () => {
    it('creates one VendorOrder per distinct vendor represented in the cart', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      const vendorOrderCalls: unknown[] = [];

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1), mockCartItem(OFFER_ID_B, 1)]);
        tx.$queryRaw.mockResolvedValue([
          mockOffer(OFFER_ID_A, { vendorId: VENDOR_ID_1 }),
          mockOffer(OFFER_ID_B, { vendorId: VENDOR_ID_2 }),
        ]);
        tx.vendorOrder.create.mockImplementation((args: unknown) => {
          vendorOrderCalls.push(args);
          return { id: `vo-${vendorOrderCalls.length}` };
        });
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(vendorOrderCalls).toHaveLength(2);
      const vendorIds = vendorOrderCalls.map((c) => (c as { data: { vendorId: string } }).data.vendorId).sort();
      expect(vendorIds).toEqual([VENDOR_ID_1, VENDOR_ID_2].sort());
    });

    it('groups items from the same vendor into a single VendorOrder, not one each', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      let vendorOrderCreateCount = 0;
      let orderItemCreateCount = 0;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1), mockCartItem(OFFER_ID_B, 1)]);
        tx.$queryRaw.mockResolvedValue([
          mockOffer(OFFER_ID_A, { vendorId: VENDOR_ID_1 }),
          mockOffer(OFFER_ID_B, { vendorId: VENDOR_ID_1 }), // same vendor
        ]);
        tx.vendorOrder.create.mockImplementation(() => {
          vendorOrderCreateCount++;
          return { id: 'vo-1' };
        });
        tx.orderItem.create.mockImplementation(() => {
          orderItemCreateCount++;
        });
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(vendorOrderCreateCount).toBe(1);
      expect(orderItemCreateCount).toBe(2);
    });
  });

  describe('payment boundary', () => {
    it('charges the payment provider for the post-discount total before creating the order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 2)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A, { priceCents: 1000 })]);
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(paymentProvider.charge).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 2000, currency: 'USD' }),
      );
    });

    it('a declined charge propagates and nothing downstream (order/vendorOrder/stock) is written', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      paymentProvider.charge.mockRejectedValue(new PaymentDeclinedException());

      let orderCreated = false;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A)]);
        tx.order.create.mockImplementation(() => {
          orderCreated = true;
          return { id: ORDER_ID };
        });
        return fn(tx);
      });

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(
        PaymentDeclinedException,
      );
      expect(orderCreated).toBe(false);
    });
  });

  describe('promotion at checkout', () => {
    it('applies the discount returned by PromotionsService to the charged/stored total', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cartService.lockCart.mockResolvedValue({ id: 'cart-id', appliedPromotionId: 'promo-1' });
      promotionsService.validateAndReserve.mockResolvedValue({
        promotion: { id: 'promo-1' },
        discountCents: 300,
        vendorOrderId: undefined,
      });

      let orderCreateArgs: unknown;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 2)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A, { priceCents: 1000 })]);
        tx.order.create.mockImplementation((args: unknown) => {
          orderCreateArgs = args;
          return { id: ORDER_ID };
        });
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(paymentProvider.charge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1700 }));
      expect((orderCreateArgs as { data: { totalCents: number; discountCents: number } }).data.totalCents).toBe(1700);
      expect((orderCreateArgs as { data: { totalCents: number; discountCents: number } }).data.discountCents).toBe(300);
    });

    it("records a PromotionRedemption and clears the cart's applied promotion on success", async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cartService.lockCart.mockResolvedValue({ id: 'cart-id', appliedPromotionId: 'promo-1' });
      promotionsService.validateAndReserve.mockResolvedValue({
        promotion: { id: 'promo-1' },
        discountCents: 100,
        vendorOrderId: undefined,
      });

      let redemptionCreated = false;
      let cartCleared = false;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A)]);
        tx.promotionRedemption.create.mockImplementation(() => {
          redemptionCreated = true;
        });
        tx.cart.update.mockImplementation((args: unknown) => {
          if ((args as { data: { appliedPromotionId: null } }).data.appliedPromotionId === null) cartCleared = true;
        });
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(redemptionCreated).toBe(true);
      expect(cartCleared).toBe(true);
    });

    it('a promotion that fails validation aborts checkout — no charge, no order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cartService.lockCart.mockResolvedValue({ id: 'cart-id', appliedPromotionId: 'promo-1' });
      promotionsService.validateAndReserve.mockRejectedValue(new BadRequestException('Applied promotion is no longer valid'));

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A)]);
        return fn(tx);
      });

      await expect(service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY })).rejects.toThrow(BadRequestException);
      expect(paymentProvider.charge).not.toHaveBeenCalled();
    });

    it('does not call PromotionsService at all when the cart has no applied promotion', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeCheckoutTxMock();
        tx.cartItem.findMany.mockResolvedValue([mockCartItem(OFFER_ID_A, 1)]);
        tx.$queryRaw.mockResolvedValue([mockOffer(OFFER_ID_A)]);
        return fn(tx);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });

      expect(promotionsService.validateAndReserve).not.toHaveBeenCalled();
    });
  });

  describe('order state transitions', () => {
    it('customer can cancel a PENDING order', async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: ORDER_ID, userId: USER_ID }]),
          vendorOrder: {
            findMany: jest
              .fn()
              .mockResolvedValueOnce([{ id: 'vo-1', status: OrderStatus.PENDING }]) // pre-transition read
              .mockResolvedValueOnce([{ status: OrderStatus.CANCELLED }]), // recomputeOrderStatus read
            update: jest.fn(),
          },
          orderStatusHistory: { create: jest.fn() },
          orderItem: { findMany: jest.fn().mockResolvedValue([]) },
          vendorOffer: { update: jest.fn() },
          inventoryAdjustment: { create: jest.fn() },
          order: { update: jest.fn().mockResolvedValue({ id: ORDER_ID, status: OrderStatus.CANCELLED }) },
        };
        return fn(tx);
      });

      const result = await service.cancelMyOrder(USER_ID, ORDER_ID);
      expect((result as { status: OrderStatus }).status).toBe(OrderStatus.CANCELLED);
    });

    it('customer cannot cancel a CONFIRMED order', async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: ORDER_ID, userId: USER_ID }]),
          vendorOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'vo-1', status: OrderStatus.CONFIRMED }]) },
        };
        return fn(tx);
      });

      await expect(service.cancelMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(BadRequestException);
    });

    it("customer cannot cancel another user's order", async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: ORDER_ID, userId: 'other-user-id' }]) };
        return fn(tx);
      });

      await expect(service.cancelMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('restores inventory (with a matching InventoryAdjustment) on cancellation', async () => {
      const items = [{ id: 'oi-1', vendorOfferId: OFFER_ID_A, quantity: 3 }];
      let offerUpdated = false;
      let adjustmentCreated = false;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: ORDER_ID, userId: USER_ID }]),
          vendorOrder: {
            findMany: jest
              .fn()
              .mockResolvedValueOnce([{ id: 'vo-1', status: OrderStatus.PENDING }])
              .mockResolvedValueOnce([{ status: OrderStatus.CANCELLED }]),
            update: jest.fn(),
          },
          orderStatusHistory: { create: jest.fn() },
          orderItem: { findMany: jest.fn().mockResolvedValue(items) },
          vendorOffer: {
            update: jest.fn().mockImplementation(() => {
              offerUpdated = true;
            }),
          },
          inventoryAdjustment: {
            create: jest.fn().mockImplementation((args: unknown) => {
              adjustmentCreated = true;
              expect((args as { data: { delta: number } }).data.delta).toBe(3); // positive — stock restored
            }),
          },
          order: { update: jest.fn().mockResolvedValue({ id: ORDER_ID, status: OrderStatus.CANCELLED }) },
        };
        return fn(tx);
      });

      await service.cancelMyOrder(USER_ID, ORDER_ID);
      expect(offerUpdated).toBe(true);
      expect(adjustmentCreated).toBe(true);
    });
  });

  describe('getMyOrder', () => {
    it('throws NotFoundException for non-existent order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.getMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when accessing another user's order", async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, userId: 'other-user' });
      await expect(service.getMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
