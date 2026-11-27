import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorOrdersService } from '../vendor-orders.service';
import { VendorMembershipService } from '../vendor-membership.service';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = 'user-1';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const VENDOR_ORDER_ID = 'vo-1';
const ORDER_ID = 'order-1';

function makeTxMock() {
  return {
    $queryRaw: jest.fn(),
    vendorOrder: { update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    vendorOrder: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('VendorOrdersService', () => {
  let service: VendorOrdersService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let membership: { requireMembership: jest.Mock };
  let ordersService: { recomputeOrderStatus: jest.Mock };

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    membership = { requireMembership: jest.fn().mockResolvedValue({ vendorId: VENDOR_A, memberRole: 'OWNER' }) };
    ordersService = { recomputeOrderStatus: jest.fn() };
    service = new VendorOrdersService(
      prisma as unknown as PrismaService,
      ordersService as unknown as OrdersService,
      membership as unknown as VendorMembershipService,
    );
  });

  describe('cross-vendor denial', () => {
    it('getOne() 404s (not 403s) on a VendorOrder owned by a different vendor', async () => {
      prisma.vendorOrder.findUnique.mockResolvedValue({ id: VENDOR_ORDER_ID, vendorId: VENDOR_B });
      await expect(service.getOne(USER_ID, VENDOR_ORDER_ID)).rejects.toThrow(NotFoundException);
    });

    it('updateStatus() 404s on a VendorOrder owned by a different vendor', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: VENDOR_ORDER_ID, orderId: ORDER_ID, vendorId: VENDOR_B, status: 'PENDING' },
      ]);
      await expect(service.updateStatus(USER_ID, VENDOR_ORDER_ID, 'CONFIRMED' as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.vendorOrder.update).not.toHaveBeenCalled();
    });

    it('updateStatus() 404s when the VendorOrder does not exist at all', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(service.updateStatus(USER_ID, 'missing', 'CONFIRMED' as never)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus transitions', () => {
    it('allows PENDING -> CONFIRMED for the owning vendor', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: VENDOR_ORDER_ID, orderId: ORDER_ID, vendorId: VENDOR_A, status: 'PENDING' },
      ]);
      tx.vendorOrder.update.mockResolvedValue({ id: VENDOR_ORDER_ID, status: 'CONFIRMED' });

      await service.updateStatus(USER_ID, VENDOR_ORDER_ID, 'CONFIRMED' as never);

      expect(tx.vendorOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VENDOR_ORDER_ID }, data: { status: 'CONFIRMED' } }),
      );
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderId: ORDER_ID, vendorOrderId: VENDOR_ORDER_ID, fromStatus: 'PENDING', toStatus: 'CONFIRMED' }),
        }),
      );
      expect(ordersService.recomputeOrderStatus).toHaveBeenCalledWith(tx, ORDER_ID);
    });

    it('rejects PENDING -> SHIPPED (must confirm first) — vendors cannot skip steps', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: VENDOR_ORDER_ID, orderId: ORDER_ID, vendorId: VENDOR_A, status: 'PENDING' },
      ]);
      await expect(service.updateStatus(USER_ID, VENDOR_ORDER_ID, 'SHIPPED' as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a vendor trying to cancel an order — outside vendor authority', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: VENDOR_ORDER_ID, orderId: ORDER_ID, vendorId: VENDOR_A, status: 'PENDING' },
      ]);
      await expect(service.updateStatus(USER_ID, VENDOR_ORDER_ID, 'CANCELLED' as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a vendor trying to mark an order DELIVERED — not the seller\'s event', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: VENDOR_ORDER_ID, orderId: ORDER_ID, vendorId: VENDOR_A, status: 'SHIPPED' },
      ]);
      await expect(service.updateStatus(USER_ID, VENDOR_ORDER_ID, 'DELIVERED' as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
