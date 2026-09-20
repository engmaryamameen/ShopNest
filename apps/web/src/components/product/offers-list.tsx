'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { CART_QUERY_KEY } from '@/lib/use-cart';
import { formatPrice } from '@/lib/format-price';
import type { ProductVendorOfferResponse } from '@/lib/api-types';

export function OffersList({ offers, productUrl }: { offers: ProductVendorOfferResponse[]; productUrl: string }) {
  const sorted = [...offers].sort((a, b) => a.priceCents - b.priceCents);

  return (
    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
      {sorted.map((offer, i) => (
        <OfferRow key={offer.id} offer={offer} isBuyBox={i === 0} productUrl={productUrl} />
      ))}
    </div>
  );
}

function OfferRow({
  offer,
  isBuyBox,
  productUrl,
}: {
  offer: ProductVendorOfferResponse;
  isBuyBox: boolean;
  productUrl: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  function handleAdd() {
    setMessage(null);
    startTransition(async () => {
      try {
        await api.upsertCartItem({ vendorOfferId: offer.id, quantity: 1 });
        await queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
        setMessage('Added');
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/login?returnTo=${encodeURIComponent(productUrl)}`);
        } else {
          setMessage(err instanceof ApiError ? err.message : 'Could not add to cart');
        }
      }
    });
  }

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{offer.vendor.name}</span>
          {isBuyBox && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Best price</span>
          )}
          {offer.condition !== 'NEW' && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{offer.condition}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {offer.stockQuantity > 0 ? `${offer.stockQuantity} in stock` : 'Out of stock'}
        </p>
        {message && <p className="text-xs text-gray-500 mt-1">{message}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-bold text-gray-900">{formatPrice(offer.priceCents)}</p>
          {offer.compareAtPriceCents && offer.compareAtPriceCents > offer.priceCents && (
            <p className="text-xs text-gray-400 line-through">{formatPrice(offer.compareAtPriceCents)}</p>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={isPending || offer.stockQuantity === 0}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
