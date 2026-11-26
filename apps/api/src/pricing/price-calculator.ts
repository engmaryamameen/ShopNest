export type Discount = {
  type: 'PERCENT' | 'FIXED_AMOUNT';
  value: number;
  maxDiscountCents?: number | null;
};
export type PricingPromotion = Discount & {
  id: string;
  code: string;
  automatic?: boolean;
  scope: string;
  vendorId: string | null;
  productIds?: string[];
  brandIds?: string[];
  categoryIds?: string[];
  productTypes?: string[];
  vendorIds?: string[];
  minSubtotalCents?: number | null;
};
export type PriceInput = {
  id: string;
  productId: string;
  vendorId: string;
  brandId?: string | null;
  categoryId?: string;
  productType?: string | null;
  priceCents: number;
  quantity: number;
  compareAtPriceCents?: number | null;
  discountEnabled?: boolean;
  discountType?: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue?: number;
  discountStartsAt?: Date | string | null;
  discountEndsAt?: Date | string | null;
  taxable?: boolean;
  priceIncludesTax?: boolean;
  taxClass?: { name: string; rateBps: number; isActive?: boolean } | null;
};
export function discountAmount(discount: Discount, base: number): number {
  const amount =
    discount.type === 'PERCENT' ? Math.floor((base * discount.value) / 100) : discount.value;
  return Math.max(0, Math.min(base, amount, discount.maxDiscountCents ?? base));
}
export function promotionMatches(p: PricingPromotion, line: PriceInput): boolean {
  return (
    (p.scope !== 'VENDOR' || p.vendorId === line.vendorId) &&
    (!p.productIds?.length || p.productIds.includes(line.productId)) &&
    (!p.brandIds?.length || (!!line.brandId && p.brandIds.includes(line.brandId))) &&
    (!p.categoryIds?.length || (!!line.categoryId && p.categoryIds.includes(line.categoryId))) &&
    (!p.productTypes?.length ||
      (!!line.productType && p.productTypes.includes(line.productType))) &&
    (!p.vendorIds?.length || p.vendorIds.includes(line.vendorId))
  );
}

function directUnitPrice(input: PriceInput, now: Date): number {
  const inWindow =
    (!input.discountStartsAt || new Date(input.discountStartsAt) <= now) &&
    (!input.discountEndsAt || new Date(input.discountEndsAt) >= now);
  return input.discountEnabled && inWindow
    ? input.priceCents -
        discountAmount(
          { type: input.discountType ?? 'PERCENT', value: input.discountValue ?? 0 },
          input.priceCents,
        )
    : input.priceCents;
}

// Direct discount, then the best automatic promotion per line, then one
// coupon on the eligible remainder. Tax is rounded once per line after all discounts.
export function calculatePrices(
  inputs: PriceInput[],
  automatic: PricingPromotion[] = [],
  coupon?: PricingPromotion | null,
  now = new Date(),
) {
  const lines = inputs.map((input) => {
    const regularUnitPriceCents = input.compareAtPriceCents ?? input.priceCents;
    const unitPriceCents = directUnitPrice(input, now);
    const base = unitPriceCents * input.quantity;
    const winner = automatic
      .filter(
        (p) =>
          promotionMatches(p, input) &&
          (!p.minSubtotalCents ||
            inputs
              .filter((i) => promotionMatches(p, i))
              .reduce((s, i) => s + directUnitPrice(i, now) * i.quantity, 0) >= p.minSubtotalCents),
      )
      .map((p) => ({
        id: p.id,
        code: p.code,
        discount: discountAmount(
          { ...p, value: p.type === 'FIXED_AMOUNT' ? p.value * input.quantity : p.value },
          base,
        ),
      }))
      .sort((a, b) => b.discount - a.discount || a.id.localeCompare(b.id))[0];
    return {
      id: input.id,
      regularUnitPriceCents,
      unitPriceCents,
      quantity: input.quantity,
      directDiscountCents: (regularUnitPriceCents - unitPriceCents) * input.quantity,
      automaticDiscountCents: winner?.discount ?? 0,
      automaticPromotionId: winner?.id ?? null,
      couponDiscountCents: 0,
      taxCents: 0,
      totalCents: 0,
      netCents: 0,
      taxRateBps:
        input.taxable !== false && input.taxClass?.isActive !== false
          ? (input.taxClass?.rateBps ?? 0)
          : 0,
      taxClass: input.taxClass?.name ?? null,
      priceIncludesTax: input.priceIncludesTax ?? false,
      promotionIds: winner?.discount ? [winner.id] : [],
    };
  });
  const eligible = inputs
    .map((input, index) => ({ input, line: lines[index] }))
    .filter(({ input }) => coupon && promotionMatches(coupon, input));
  const couponBase = eligible.reduce(
    (sum, { line }) => sum + line.unitPriceCents * line.quantity - line.automaticDiscountCents,
    0,
  );
  let couponRemaining =
    coupon && (!coupon.minSubtotalCents || couponBase >= coupon.minSubtotalCents)
      ? discountAmount(coupon, couponBase)
      : 0;
  const couponDiscountCents = couponRemaining;
  let baseRemaining = couponBase;
  for (const { line } of eligible) {
    const base = line.unitPriceCents * line.quantity - line.automaticDiscountCents;
    const allocated = baseRemaining > 0 ? Math.floor((couponRemaining * base) / baseRemaining) : 0;
    line.couponDiscountCents = allocated;
    if (allocated && coupon) line.promotionIds.push(coupon.id);
    couponRemaining -= allocated;
    baseRemaining -= base;
  }
  for (const line of lines) {
    const discounted =
      line.unitPriceCents * line.quantity - line.automaticDiscountCents - line.couponDiscountCents;
    line.taxCents = line.priceIncludesTax
      ? Math.round((discounted * line.taxRateBps) / (10000 + line.taxRateBps))
      : Math.round((discounted * line.taxRateBps) / 10000);
    line.netCents = line.priceIncludesTax ? discounted - line.taxCents : discounted;
    line.totalCents = line.netCents + line.taxCents;
  }
  const sum = (key: keyof (typeof lines)[number]) =>
    lines.reduce((total, line) => total + Number(line[key]), 0);
  return {
    lines,
    couponEligibleSubtotalCents: couponBase,
    regularSubtotalCents: lines.reduce((s, l) => s + l.regularUnitPriceCents * l.quantity, 0),
    subtotalCents: lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0),
    directDiscountCents: sum('directDiscountCents'),
    automaticDiscountCents: sum('automaticDiscountCents'),
    couponDiscountCents,
    taxCents: sum('taxCents'),
    includedTaxCents: lines.filter((l) => l.priceIncludesTax).reduce((s, l) => s + l.taxCents, 0),
    addedTaxCents: lines.filter((l) => !l.priceIncludesTax).reduce((s, l) => s + l.taxCents, 0),
    netCents: sum('netCents'),
    shippingCents: 0,
    totalCents: sum('totalCents'),
  };
}
