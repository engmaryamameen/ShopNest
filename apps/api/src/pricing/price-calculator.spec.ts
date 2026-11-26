import { calculatePrices, PriceInput, PricingPromotion } from './price-calculator';
const offer: PriceInput = {
  id: 'offer',
  productId: 'p1',
  vendorId: 'v1',
  categoryId: 'c1',
  brandId: 'b1',
  productType: 'Phone',
  priceCents: 11000,
  quantity: 1,
  taxable: true,
  taxClass: { name: 'Standard', rateBps: 1000 },
};
const promo = (id: string, overrides: Partial<PricingPromotion> = {}): PricingPromotion => ({
  id,
  code: id,
  type: 'PERCENT',
  value: 10,
  scope: 'PLATFORM',
  vendorId: null,
  ...overrides,
});
describe('marketplace price calculation', () => {
  it('distinguishes tax-inclusive, exclusive and exempt offers', () => {
    expect(calculatePrices([offer]).totalCents).toBe(12100);
    expect(calculatePrices([{ ...offer, priceIncludesTax: true }])).toMatchObject({
      totalCents: 11000,
      taxCents: 1000,
      netCents: 10000,
    });
    expect(calculatePrices([{ ...offer, taxable: false }])).toMatchObject({
      totalCents: 11000,
      taxCents: 0,
    });
  });
  it('applies direct discount, best automatic promotion, then targeted coupon before tax', () => {
    const result = calculatePrices(
      [
        {
          ...offer,
          priceCents: 10000,
          discountEnabled: true,
          discountType: 'PERCENT',
          discountValue: 10,
        },
      ],
      [promo('weak', { value: 5 }), promo('best', { value: 20 })],
      promo('coupon', { value: 10, brandIds: ['b1'] }),
    );
    expect(result).toMatchObject({
      directDiscountCents: 1000,
      automaticDiscountCents: 1800,
      couponDiscountCents: 720,
      taxCents: 648,
      totalCents: 7128,
    });
    expect(result.lines[0].promotionIds).toEqual(['best', 'coupon']);
  });
  it('allocates a fixed coupon exactly across mixed inclusive/exclusive lines', () => {
    const result = calculatePrices(
      [
        { ...offer, priceCents: 333 },
        { ...offer, id: 'two', priceCents: 667, priceIncludesTax: true },
      ],
      [],
      promo('fixed', { type: 'FIXED_AMOUNT', value: 101 }),
    );
    expect(result.lines.reduce((s, l) => s + l.couponDiscountCents, 0)).toBe(101);
    expect(result.totalCents).toBe(result.netCents + result.taxCents);
    expect(result.taxCents).toBe((result.addedTaxCents ?? 0) + (result.includedTaxCents ?? 0));
  });
  it('scales fixed automatic discounts with quantity and checks minimums after direct discounts', () => {
    const result = calculatePrices(
      [
        {
          ...offer,
          priceCents: 1000,
          quantity: 3,
          taxable: false,
          discountEnabled: true,
          discountType: 'PERCENT',
          discountValue: 10,
        },
      ],
      [
        promo('fixed', { type: 'FIXED_AMOUNT', value: 100 }),
        promo('minimum', { value: 90, minSubtotalCents: 2800 }),
      ],
    );
    expect(result).toMatchObject({
      directDiscountCents: 300,
      automaticDiscountCents: 300,
      totalCents: 2400,
    });
    expect(result.lines[0].promotionIds).toEqual(['fixed']);
  });
  it('honors targets, minimums, caps, dates and never produces negative prices', () => {
    expect(
      calculatePrices(
        [offer],
        [promo('wrong', { productTypes: ['Grocery'] })],
        promo('too-small', { minSubtotalCents: 20000 }),
      ).automaticDiscountCents,
    ).toBe(0);
    expect(
      calculatePrices([offer], [], promo('cap', { value: 100, maxDiscountCents: 250 }))
        .couponDiscountCents,
    ).toBe(250);
    expect(
      calculatePrices([
        { ...offer, discountEnabled: true, discountValue: 90, discountEndsAt: '2000-01-01' },
      ]).directDiscountCents,
    ).toBe(0);
    expect(
      calculatePrices([offer], [], promo('free', { type: 'FIXED_AMOUNT', value: 100000 }))
        .totalCents,
    ).toBe(0);
  });
});
