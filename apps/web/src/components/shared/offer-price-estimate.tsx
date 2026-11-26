'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PricingSettings, PriceQuote, PriceQuoteContext } from '@/lib/api-types';
import { formatPrice } from '@/lib/format-price';

export function OfferPriceEstimate({
  value,
  priceCents,
  context,
  plain = false,
}: {
  value: PricingSettings;
  priceCents: number;
  context?: PriceQuoteContext;
  plain?: boolean;
}) {
  const configuration = JSON.stringify({ ...value, ...context, priceCents });
  const [result, setResult] = useState<{
    configuration: string;
    quote?: PriceQuote;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .priceQuote(JSON.parse(configuration))
        .then((quote) => {
          if (!cancelled) setResult({ configuration, quote });
        })
        .catch((error) => {
          if (!cancelled)
            setResult({
              configuration,
              error: error instanceof Error ? error.message : 'Could not estimate the price.',
            });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [configuration]);
  const current = result?.configuration === configuration ? result : null;
  if (!current)
    return (
      <p role="status" className="text-xs text-gray-500">
        Updating price estimate…
      </p>
    );
  if (current.error)
    return (
      <p role="alert" className="text-xs text-red-700">
        {current.error}
      </p>
    );
  const quote = current.quote;
  if (!quote) return null;
  return (
    <dl
      className={
        plain
          ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm'
          : 'grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm'
      }
    >
      <dt className="text-gray-600">Regular price</dt>
      <dd className="text-right">{formatPrice(quote.regularSubtotalCents)}</dd>
      <dt className="text-gray-600">Direct discount</dt>
      <dd className="text-right">−{formatPrice(quote.directDiscountCents)}</dd>
      <dt className="text-gray-600">Automatic promotion</dt>
      <dd className="text-right">−{formatPrice(quote.automaticDiscountCents)}</dd>
      <dt className="text-gray-600">Tax {value.priceIncludesTax ? '(included)' : '(added)'}</dt>
      <dd className="text-right">{formatPrice(quote.taxCents)}</dd>
      <dt className="font-semibold">Estimated final price</dt>
      <dd className="text-right font-semibold">{formatPrice(quote.totalCents)}</dd>
      {!plain && (
        <>
          <dt className="sr-only">Estimate information</dt>
          <dd className="col-span-2 mt-1 text-xs text-gray-500">
            Includes the best eligible automatic promotion for one item. Coupons are calculated in
            the cart.
          </dd>
        </>
      )}
    </dl>
  );
}
