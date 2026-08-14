'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
      />
    </svg>
  );
}

export function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        await api.addToWishlist(productId);
        setWishlisted(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/login?returnTo=${encodeURIComponent('/shop')}`);
        }
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || wishlisted}
      aria-label={wishlisted ? `${productName} saved to wishlist` : `Add ${productName} to wishlist`}
      aria-pressed={wishlisted}
      className={`absolute right-2 top-2 flex size-8 items-center justify-center rounded-full shadow-sm transition disabled:cursor-default ${
        wishlisted ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
      }`}
    >
      <HeartIcon filled={wishlisted} />
    </button>
  );
}
