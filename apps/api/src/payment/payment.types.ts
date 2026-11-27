export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeResult {
  providerRef: string;
}

export interface RefundResult {
  providerRef: string;
}

export interface PaymentProvider {
  /** Throws PaymentDeclinedException on decline — never returns a
   * "declined" result object, so a caller can't forget to check it. */
  charge(params: { orderId: string; amountCents: number; currency: string }): Promise<ChargeResult>;
  refund(params: { orderId: string; amountCents: number; currency: string; chargeRef: string | null }): Promise<RefundResult>;
}
