import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { ChargeResult, PaymentProvider, RefundResult } from './payment.types';
import { PaymentDeclinedException } from './payment-declined.exception';

/** No real gateway credentials in this scope (see DECISIONS.md) — this is
 * the only PaymentProvider today, selected the same way SmtpMailAdapter
 * would be if it existed. Charges succeed synchronously; an amount that
 * exactly matches the configured decline amount throws instead, so the
 * decline path is directly testable without relying on randomness. */
@Injectable()
export class MockPaymentAdapter implements PaymentProvider {
  constructor(private readonly config: ConfigService) {}

  async charge(params: { orderId: string; amountCents: number; currency: string }): Promise<ChargeResult> {
    const declineAt = this.config.get<number>('app.paymentMockDeclineCents', 66600);
    if (params.amountCents === declineAt) {
      throw new PaymentDeclinedException();
    }
    return { providerRef: `mock_charge_${randomUUID()}` };
  }

  // No decline path on refunds in this scope — a mock gateway always
  // honors a refund request.
  async refund(_params: { orderId: string; amountCents: number; currency: string; chargeRef: string | null }): Promise<RefundResult> {
    return { providerRef: `mock_refund_${randomUUID()}` };
  }
}
