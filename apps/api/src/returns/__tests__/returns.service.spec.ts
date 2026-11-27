import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReturnsService } from '../returns.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaymentProvider } from '../../payment/payment.types';

const ORDER_ITEM_ID = 'item-1';
const RETURN_ID = 'return-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const ADMIN_ID = 'admin-1';

function makeOrderItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORDER_ITEM_ID,
    orderId: 'order-1',
    vendorOfferId: 'offer-1',
    vendorOrderId: 'vo-1',
    quantity: 2,
    unitPriceCents: 1000,
    order: { userId: USER_ID },
    vendorOrder: { status: 'DELIVERED', vendorId: VENDOR_A },
    ...overrides,
  };
}

function makeReturnRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RETURN_ID,
    status: 'REQUESTED',
    orderItem: makeOrderItem(),
    ...overrides,
  };
}

function makeTxMock() {
  return {
    returnRequest: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(makeReturnRequest()) },
    vendorOffer: { update: jest.fn() },
    inventoryAdjustment: { create: jest.fn() },
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-1', paymentRef: 'mock_charge_x', currency: 'USD' }) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    orderItem: { findUnique: jest.fn() },
    returnRequest: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

function makePaymentMock(): jest.Mocked<PaymentProvider> {
  return { charge: jest.fn(), refund: jest.fn().mockResolvedValue({ providerRef: 'mock_refund_x' }) };
}

describe('ReturnsService', () => {
  let service: ReturnsService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let payment: ReturnType<typeof makePaymentMock>;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    payment = makePaymentMock();
    service = new ReturnsService(prisma as unknown as PrismaService, payment);
  });

  describe('request', () => {
    it('throws NotFoundException when the item does not belong to the caller', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(makeOrderItem({ order: { userId: OTHER_USER_ID } }));
      await expect(service.request(USER_ID, ORDER_ITEM_ID, { reason: 'DEFECTIVE' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the item has not been delivered yet', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(makeOrderItem({ vendorOrder: { status: 'SHIPPED', vendorId: VENDOR_A } }));
      await expect(service.request(USER_ID, ORDER_ITEM_ID, { reason: 'DEFECTIVE' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when a return already exists for this item', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(makeOrderItem());
      prisma.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await expect(service.request(USER_ID, ORDER_ITEM_ID, { reason: 'DEFECTIVE' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates the request for a delivered item owned by the caller', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(makeOrderItem());
      prisma.returnRequest.findUnique.mockResolvedValue(null);
      await service.request(USER_ID, ORDER_ITEM_ID, { reason: 'DEFECTIVE', note: 'broken' } as never);
      expect(prisma.returnRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { orderItemId: ORDER_ITEM_ID, userId: USER_ID, reason: 'DEFECTIVE', note: 'broken' } }),
      );
    });
  });

  describe('deciding (approve/reject) — shared by vendor and admin paths', () => {
    it('throws NotFoundException for an unknown request', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(null);
      await expect(service.adminApprove(ADMIN_ID, RETURN_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('vendor path 403s when the request belongs to a different vendor', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await expect(service.vendorApprove(VENDOR_B, RETURN_ID, ADMIN_ID, {})).rejects.toThrow(ForbiddenException);
    });

    it('admin path has no vendor restriction', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await expect(service.adminApprove(ADMIN_ID, RETURN_ID, {})).resolves.toBeDefined();
    });

    it('rejects deciding an already-decided request (terminal state)', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest({ status: 'REFUNDED' }));
      await expect(service.adminApprove(ADMIN_ID, RETURN_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('approve restores inventory with the exact returned quantity', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await service.adminApprove(ADMIN_ID, RETURN_ID, {});
      expect(tx.vendorOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { stockQuantity: { increment: 2 } },
      });
      expect(tx.inventoryAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vendorOfferId: 'offer-1', delta: 2, reason: 'RETURN' }) }),
      );
    });

    it("approve refunds exactly unitPriceCents × quantity against the order's payment reference", async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await service.adminApprove(ADMIN_ID, RETURN_ID, {});
      expect(payment.refund).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', amountCents: 2000, chargeRef: 'mock_charge_x' }),
      );
    });

    it('reject does not touch inventory or payment', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await service.adminReject(ADMIN_ID, RETURN_ID, { note: 'not eligible' });
      expect(tx.vendorOffer.update).not.toHaveBeenCalled();
      expect(payment.refund).not.toHaveBeenCalled();
      expect(tx.returnRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', decisionNote: 'not eligible' }) }),
      );
    });

    it('vendor path succeeds for the owning vendor', async () => {
      tx.returnRequest.findUnique.mockResolvedValue(makeReturnRequest());
      await expect(service.vendorApprove(VENDOR_A, RETURN_ID, 'vendor-user-1', {})).resolves.toBeDefined();
    });
  });
});
