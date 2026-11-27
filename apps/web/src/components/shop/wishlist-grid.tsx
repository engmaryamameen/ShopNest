'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';
import { isFirstPartyImageUrl } from '@/lib/is-first-party-image';
import type { WishlistItemResponse } from '@/lib/api-types';

export function WishlistGrid({ items }: { items: WishlistItemResponse[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove(productId: string) {
    startTransition(async () => {
      try {
        await api.removeFromWishlist(productId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not remove item');
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Your wishlist is empty.</p>
        <Link href="/shop" className="mt-3 inline-block text-indigo-600 hover:text-indigo-700 font-medium">
          Browse products →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((product) => (
        <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Link href={`/products/${product.slug}`} className="block relative aspect-square bg-gray-100">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                unoptimized={!isFirstPartyImageUrl(product.imageUrl)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300">No image</div>
            )}
          </Link>
          <div className="p-4">
            <Link href={`/products/${product.slug}`} className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-2">
              {product.name}
            </Link>
            <p className="mt-2 font-bold text-gray-900">{formatPrice(product.priceCents)}</p>
            <button
              onClick={() => remove(product.id)}
              disabled={isPending}
              className="mt-3 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
