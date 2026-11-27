import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment.types';
import { MockPaymentAdapter } from './mock-payment.adapter';

@Module({
  providers: [
    MockPaymentAdapter,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentAdapter },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
