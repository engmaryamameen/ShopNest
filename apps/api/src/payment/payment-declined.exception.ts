import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentDeclinedException extends HttpException {
  constructor(message = 'Payment was declined') {
    super(message, HttpStatus.PAYMENT_REQUIRED);
  }
}
