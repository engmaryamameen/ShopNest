import { Inject, Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payment/payment.types';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { DecideReturnRequestDto } from './dto/decide-return-request.dto';

const RETURN_REQUEST_INCLUDE = {
  orderItem: { include: { vendorOrder: { include: { vendor: { select: { id: true, name: true, slug: true } } } } } },
  user: { select: { id: true, email: true } },
} as const;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly payment: PaymentProvider,
  ) {}

  /** DELIVERED is required on the order item's own VendorOrder, not the
   * aggregate Order — a return is about one seller's fulfilment, same
   * granularity as everything else post-checkout. */
  async request(userId: string, orderItemId: string, dto: CreateReturnRequestDto) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: { select: { userId: true } }, vendorOrder: { select: { status: true } } },
    });
    if (!item || item.order.userId !== userId) throw new NotFoundException('Order item not found');
    if (item.vendorOrder.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('This item has not been delivered yet');
    }

    const existing = await this.prisma.returnRequest.findUnique({ where: { orderItemId } });
    if (existing) throw new BadRequestException('A return has already been requested for this item');

    return this.prisma.returnRequest.create({
      data: { orderItemId, userId, reason: dto.reason, note: dto.note },
      include: RETURN_REQUEST_INCLUDE,
    });
  }

  listVendor(vendorId: string, status?: ReturnStatus) {
    return this.prisma.returnRequest.findMany({
      where: { status, orderItem: { vendorOrder: { vendorId } } },
      include: RETURN_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  listAdmin(status?: ReturnStatus) {
    return this.prisma.returnRequest.findMany({
      where: { status },
      include: RETURN_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async vendorApprove(vendorId: string, id: string, decidedByUserId: string, dto: DecideReturnRequestDto) {
    return this.decide(id, decidedByUserId, ReturnStatus.REFUNDED, dto, vendorId);
  }

  async vendorReject(vendorId: string, id: string, decidedByUserId: string, dto: DecideReturnRequestDto) {
    return this.decide(id, decidedByUserId, ReturnStatus.REJECTED, dto, vendorId);
  }

  async adminApprove(adminUserId: string, id: string, dto: DecideReturnRequestDto) {
    return this.decide(id, adminUserId, ReturnStatus.REFUNDED, dto);
  }

  async adminReject(adminUserId: string, id: string, dto: DecideReturnRequestDto) {
    return this.decide(id, adminUserId, ReturnStatus.REJECTED, dto);
  }

  /** Shared by both the vendor and admin decision endpoints — `vendorId`
   * set only by the vendor path, scoping which requests it may touch;
   * admin acts on any request (support override, same as everywhere else
   * in this app that distinguishes vendor-scoped vs. admin access). */
  private async decide(
    id: string,
    decidedByUserId: string,
    toStatus: Extract<ReturnStatus, 'REFUNDED' | 'REJECTED'>,
    dto: DecideReturnRequestDto,
    vendorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.returnRequest.findUnique({
        where: { id },
        include: { orderItem: { include: { vendorOrder: true } } },
      });
      if (!request) throw new NotFoundException('Return request not found');
      if (vendorId !== undefined && request.orderItem.vendorOrder.vendorId !== vendorId) {
        throw new ForbiddenException('Not your return request');
      }
      if (request.status !== ReturnStatus.REQUESTED) {
        throw new BadRequestException('This return request has already been decided');
      }

      if (toStatus === ReturnStatus.REFUNDED) {
        const item = request.orderItem;
        await tx.vendorOffer.update({
          where: { id: item.vendorOfferId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.inventoryAdjustment.create({
          data: { vendorOfferId: item.vendorOfferId, delta: item.quantity, reason: 'RETURN', reference: request.id },
        });

        const order = await tx.order.findUniqueOrThrow({ where: { id: item.orderId }, select: { id: true, paymentRef: true, currency: true } });
        const refundAmountCents = item.unitPriceCents * item.quantity;
        await this.payment.refund({
          orderId: order.id,
          amountCents: refundAmountCents,
          currency: order.currency,
          chargeRef: order.paymentRef,
        });
      }

      return tx.returnRequest.update({
        where: { id },
        data: { status: toStatus, decidedByUserId, decidedAt: new Date(), decisionNote: dto.note },
        include: RETURN_REQUEST_INCLUDE,
      });
    });
  }
}
