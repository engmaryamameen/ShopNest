import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { OrdersService } from '../orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../../cart/cart.service';

const PRODUCT_ID_A = '00000000-0000-4000-a000-000000000001';
const PRODUCT_ID_B = '00000000-0000-4000-a000-000000000002';
const USER_ID = '00000000-0000-4000-b000-000000000001';
const ORDER_ID = '00000000-0000-4000-c000-000000000001';
const IDEMPOTENCY_KEY = '00000000-0000-4000-d000-000000000001';

const mockProduct = (id: string, overrides = {}) => ({
  id,
  priceCents: 1000,
  name: `Product ${id}`,
  slug: `product-${id}`,
  stockQuantity: 10,
  isActive: true,
  ...overrides,
});

const mockCartItem = (productId: string, quantity = 2) => ({
  id: `ci-${productId}`,
  cartId: 'cart-id',
  productId,
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
    },
    orderStatusHistory: { create: jest.fn() },
    orderItem: { findMany: jest.fn() },
    product: { update: jest.fn() },
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
  return { lockCart: jest.fn().mockResolvedValue({ id: 'cart-id' }) };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let cartService: ReturnType<typeof makeCartServiceMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    cartService = makeCartServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CartService, useValue: cartService },
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
      prisma.order.findUnique
        .mockResolvedValueOnce(null) // outside tx: miss
        .mockResolvedValueOnce({ id: ORDER_ID }); // inside tx: hit

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          order: { findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID }) },
          cartItem: { findMany: jest.fn() },
          $queryRaw: jest.fn(),
        };
        cartService.lockCart.mockResolvedValue({ id: 'cart-id' });
        return fn(txMock);
      });

      const result = await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });
      expect(result).toEqual({ id: ORDER_ID });
    });

    it('throws BadRequestException for empty cart', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          order: { findUnique: jest.fn().mockResolvedValue(null) },
          cartItem: { findMany: jest.fn().mockResolvedValue([]) },
          $queryRaw: jest.fn(),
        };
        return fn(txMock);
      });

      await expect(
        service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if stock insufficient at lock time', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          order: { findUnique: jest.fn().mockResolvedValue(null) },
          cartItem: { findMany: jest.fn().mockResolvedValue([mockCartItem(PRODUCT_ID_A, 100)]) },
          $queryRaw: jest.fn().mockResolvedValue([
            // Product locked but only 5 in stock, cart wants 100
            mockProduct(PRODUCT_ID_A, { stockQuantity: 5 }),
          ]),
          $executeRaw: jest.fn(),
        };
        return fn(txMock);
      });

      await expect(
        service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('checkout inventory decrement', () => {
    it('decrements stock for each product exactly once', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      let executeRawCallCount = 0;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          order: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: ORDER_ID, items: [], statusHistory: [] }),
          },
          cartItem: {
            findMany: jest.fn().mockResolvedValue([
              mockCartItem(PRODUCT_ID_A, 2),
              mockCartItem(PRODUCT_ID_B, 1),
            ]),
            deleteMany: jest.fn(),
          },
          $queryRaw: jest.fn().mockResolvedValue([
            mockProduct(PRODUCT_ID_A, { stockQuantity: 10 }),
            mockProduct(PRODUCT_ID_B, { stockQuantity: 5 }),
          ]),
          $executeRaw: jest.fn().mockImplementation(() => {
            executeRawCallCount++;
            return 1; // affected rows
          }),
        };
        return fn(txMock);
      });

      await service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY });
      expect(executeRawCallCount).toBe(2); // one per product
    });

    it('throws ConflictException if conditional UPDATE returns 0 affected rows', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          order: { findUnique: jest.fn().mockResolvedValue(null) },
          cartItem: {
            findMany: jest.fn().mockResolvedValue([mockCartItem(PRODUCT_ID_A, 2)]),
          },
          $queryRaw: jest.fn().mockResolvedValue([mockProduct(PRODUCT_ID_A, { stockQuantity: 10 })]),
          $executeRaw: jest.fn().mockResolvedValue(0), // race condition
        };
        return fn(txMock);
      });

      await expect(
        service.checkout(USER_ID, { idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('order state transitions', () => {
    it('customer can cancel a PENDING order', async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: ORDER_ID, status: OrderStatus.PENDING, userId: USER_ID },
          ]),
          order: { update: jest.fn().mockResolvedValue({ id: ORDER_ID, status: OrderStatus.CANCELLED }) },
          orderStatusHistory: { create: jest.fn() },
          orderItem: { findMany: jest.fn().mockResolvedValue([]) },
          product: { update: jest.fn() },
        };
        return fn(txMock);
      });

      const result = await service.cancelMyOrder(USER_ID, ORDER_ID);
      expect((result as { status: OrderStatus }).status).toBe(OrderStatus.CANCELLED);
    });

    it('customer cannot cancel a CONFIRMED order', async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: ORDER_ID, status: OrderStatus.CONFIRMED, userId: USER_ID },
          ]),
          order: { update: jest.fn() },
          orderStatusHistory: { create: jest.fn() },
          orderItem: { findMany: jest.fn() },
          product: { update: jest.fn() },
        };
        return fn(txMock);
      });

      await expect(service.cancelMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(BadRequestException);
    });

    it("customer cannot cancel another user's order", async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: ORDER_ID, status: OrderStatus.PENDING, userId: 'other-user-id' },
          ]),
        };
        return fn(txMock);
      });

      await expect(service.cancelMyOrder(USER_ID, ORDER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('restores inventory on cancellation', async () => {
      const items = [
        { id: 'oi-1', productId: PRODUCT_ID_A, quantity: 3, orderId: ORDER_ID, unitPriceCents: 1000, productName: 'A', productSlug: 'a' },
      ];

      let productUpdated = false;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: ORDER_ID, status: OrderStatus.PENDING, userId: USER_ID },
          ]),
          order: {
            update: jest.fn().mockResolvedValue({ id: ORDER_ID, status: OrderStatus.CANCELLED }),
          },
          orderStatusHistory: { create: jest.fn() },
          orderItem: { findMany: jest.fn().mockResolvedValue(items) },
          product: {
            update: jest.fn().mockImplementation(() => {
              productUpdated = true;
            }),
          },
        };
        return fn(txMock);
      });

      await service.cancelMyOrder(USER_ID, ORDER_ID);
      expect(productUpdated).toBe(true);
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
