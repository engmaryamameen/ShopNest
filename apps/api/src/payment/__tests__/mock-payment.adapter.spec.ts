import { ConfigService } from '@nestjs/config';
import { MockPaymentAdapter } from '../mock-payment.adapter';
import { PaymentDeclinedException } from '../payment-declined.exception';

function build(declineAt = 66600) {
  const config = { get: jest.fn().mockReturnValue(declineAt) } as unknown as ConfigService;
  return new MockPaymentAdapter(config);
}

describe('MockPaymentAdapter', () => {
  it('charge() succeeds for an ordinary amount, returning a provider ref', async () => {
    const adapter = build();
    const result = await adapter.charge({ orderId: 'order-1', amountCents: 5000, currency: 'USD' });
    expect(result.providerRef).toMatch(/^mock_charge_/);
  });

  it('charge() declines when the amount exactly matches the configured decline amount', async () => {
    const adapter = build(66600);
    await expect(adapter.charge({ orderId: 'order-1', amountCents: 66600, currency: 'USD' })).rejects.toThrow(
      PaymentDeclinedException,
    );
  });

  it('refund() always succeeds, returning a provider ref', async () => {
    const adapter = build();
    const result = await adapter.refund({ orderId: 'order-1', amountCents: 5000, currency: 'USD', chargeRef: 'mock_charge_x' });
    expect(result.providerRef).toMatch(/^mock_refund_/);
  });
});
