import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OfferPriceEstimate } from './offer-price-estimate';
import { api } from '@/lib/api';
import type { PriceQuote, PricingSettings } from '@/lib/api-types';

jest.mock('@/lib/api', () => ({ api: { priceQuote: jest.fn() } }));
const settings: PricingSettings = {
  taxable: true,
  priceIncludesTax: false,
  discountEnabled: true,
  discountType: 'PERCENT',
  discountValue: 10,
};
const quote: PriceQuote = {
  regularSubtotalCents: 3000,
  directDiscountCents: 300,
  automaticDiscountCents: 0,
  couponDiscountCents: 0,
  subtotalCents: 2700,
  taxCents: 270,
  netCents: 2700,
  shippingCents: 0,
  totalCents: 2970,
};

it('shows loading instead of stale prices and ignores an older response after settings change', async () => {
  jest.useFakeTimers();
  try {
    let resolveFirst!: (value: PriceQuote) => void;
    let resolveSecond!: (value: PriceQuote) => void;
    jest
      .mocked(api.priceQuote)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const view = render(<OfferPriceEstimate value={settings} priceCents={2000} plain />);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    view.rerender(<OfferPriceEstimate value={settings} priceCents={3000} plain />);
    expect(screen.getByRole('status')).toHaveTextContent('Updating price estimate');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      resolveSecond(quote);
    });
    expect(screen.getByText('$29.70')).toBeInTheDocument();
    await act(async () => {
      resolveFirst({ ...quote, totalCents: 1980 });
    });
    expect(screen.getByText('$29.70')).toBeInTheDocument();
    expect(screen.queryByText('$19.80')).not.toBeInTheDocument();
    expect(api.priceQuote).toHaveBeenLastCalledWith({ ...settings, priceCents: 3000 });
  } finally {
    jest.useRealTimers();
  }
});
