const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatPrice(priceCents: number): string {
  return currencyFormatter.format(priceCents / 100);
}

export function calculateDiscountPercentage(
  priceCents: number,
  compareAtPriceCents?: number | null,
): number | null {
  if (!compareAtPriceCents || compareAtPriceCents <= priceCents) {
    return null;
  }

  return Math.round(
    ((compareAtPriceCents - priceCents) / compareAtPriceCents) * 100,
  );
}