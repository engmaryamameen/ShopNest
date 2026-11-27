'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ProductDetailResponse } from '@/lib/api-types';
import { formatPrice } from '@/lib/format-price';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';
export function ProductPurchaseOptions({ product }: { product: ProductDetailResponse }) {
  const router = useRouter();
  const [variant, setVariant] = useState(product.variants?.length ? '' : null);
  const [saved, setSaved] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .listWishlist()
      .then((items) => setSaved(items.some((item) => item.id === product.id)))
      .catch(() => {});
  }, [product.id]);
  const offers = product.offers
    .filter((o) => !product.variants?.length || o.variantId === variant)
    .sort(
      (a, b) =>
        Number(b.stockQuantity > 0) - Number(a.stockQuantity > 0) || a.priceCents - b.priceCents,
    );
  const best = offers[0];
  async function wishlist() {
    setPending(true);
    setError('');
    try {
      if (saved) await api.removeFromWishlist(product.id);
      else await api.addToWishlist(product.id);
      setSaved(!saved);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        router.push(`/login?returnTo=${encodeURIComponent(`/products/${product.slug}`)}`);
      else setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="my-5 space-y-4">
      <p className="text-3xl font-bold text-gray-900">
        {formatPrice(best?.priceCents ?? product.priceCents)}
        {best?.compareAtPriceCents ? (
          <span className="ml-3 text-lg font-normal text-gray-400 line-through">
            {formatPrice(best.compareAtPriceCents)}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-gray-500">
        Includes applicable tax. Eligible coupon savings are calculated in your cart.
      </p>
      {!!product.variants?.length && (
        <label className="block text-sm font-medium">
          Choose a variant
          <select
            aria-label="Product variant"
            className="mt-1 block w-full rounded-lg border border-gray-200 bg-white p-2"
            value={variant ?? ''}
            onChange={(e) => setVariant(e.target.value)}
          >
            <option value="">Select a variant</option>
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-sm text-gray-500">
        {best
          ? `${best.stockQuantity} in stock · sold by ${best.vendor.name}`
          : product.variants?.length
            ? 'Choose a variant to see availability.'
            : 'Currently unavailable'}
      </p>
      {!!product.variants?.length && !variant ? (
        <button disabled className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-500">
          Select a variant
        </button>
      ) : (
        <AddToCartButton
          key={best?.id ?? 'none'}
          offerId={best?.id ?? null}
          stockQuantity={best?.stockQuantity ?? 0}
        />
      )}
      <button
        type="button"
        disabled={pending}
        aria-pressed={saved}
        onClick={wishlist}
        className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-[#0077b6] disabled:opacity-50"
      >
        {saved ? 'Saved to wishlist' : 'Save to wishlist'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
