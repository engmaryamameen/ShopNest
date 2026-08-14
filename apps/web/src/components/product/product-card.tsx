'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { CART_QUERY_KEY } from '@/lib/use-cart';
import {
  calculateDiscountPercentage,
  formatPrice,
} from '@/lib/format-price';

import type { ProductCardData } from './product.types';

interface ProductCardProps {
  product: ProductCardData;
  priority?: boolean;
  showCategory?: boolean;
}

export function ProductCard({
  product,
  priority = false,
  showCategory = false,
}: ProductCardProps) {
  const [isPending, startTransition] = useTransition();
  const [imageFailed, setImageFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistPending, startWishlistTransition] = useTransition();

  const queryClient = useQueryClient();
  const router = useRouter();

  const productUrl = `/products/${product.slug}`;
  const isOutOfStock = product.stockQuantity <= 0;

  const discountPercentage = calculateDiscountPercentage(
    product.priceCents,
    product.compareAtPriceCents,
  );

  function handleAddToCart() {
    if (isOutOfStock || isPending || !product.offerId) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      try {
        await api.upsertCartItem({
          vendorOfferId: product.offerId!,
          quantity: 1,
        });

        await queryClient.invalidateQueries({
          queryKey: CART_QUERY_KEY,
        });

        setMessage('Added to cart');
        router.refresh();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.push(
            `/login?returnTo=${encodeURIComponent(productUrl)}`,
          );
          return;
        }

        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Unable to add this product',
        );
      }
    });
  }

  function handleWishlist() {
    startWishlistTransition(async () => {
      try {
        await api.addToWishlist(product.id);
        setWishlisted(true);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.push(`/login?returnTo=${encodeURIComponent(productUrl)}`);
        }
      }
    });
  }

  return (
    <article className="group min-w-0 w-[300px] h-auto border border-[#eee] p-3">
      <div className="relative overflow-hidden rounded bg-[#f5f5f5]">
        <Link
          href={productUrl}
          aria-label={`View ${product.name}`}
          className="relative block aspect-[270/250] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          {product.imageUrl && !imageFailed ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 70vw, (max-width: 1024px) 33vw, 270px"
              className="object-contain p-7 transition-transform duration-500 ease-out group-hover:scale-105"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <ProductImageFallback />
          )}
        </Link>

        {discountPercentage !== null ? (
          <span className="absolute left-3 top-3 rounded bg-[#db4444] px-3 py-1 text-xs font-normal text-white">
            -{discountPercentage}%
          </span>
        ) : null}

        <button
          type="button"
          onClick={handleWishlist}
          disabled={wishlistPending || wishlisted}
          aria-label={wishlisted ? `${product.name} saved to wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={wishlisted}
          className={`absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-full shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:cursor-default ${
            wishlisted ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
          }`}
        >
          <HeartIcon filled={wishlisted} />
        </button>

        {!isOutOfStock ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isPending}
            className="absolute inset-x-0 bottom-0 translate-y-full cursor-pointer bg-black px-4 py-3 text-sm font-medium text-white transition-transform duration-300 group-hover:translate-y-0 group-focus-within:translate-y-0 disabled:cursor-wait disabled:opacity-70"
          >
            {isPending ? 'Adding…' : 'Add to cart'}
          </button>
        ) : (
          <div className="absolute inset-x-0 bottom-0 bg-black/80 px-4 py-3 text-center text-sm font-medium text-white">
            Out of stock
          </div>
        )}
      </div>

      <div className="pt-4">
        {showCategory && product.category ? (
          <Link
            href={`/shop?category=${product.category.slug}`}
            className="mb-1 inline-block cursor-pointer text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-black"
          >
            {product.category.name}
          </Link>
        ) : null}

        <h3 className="line-clamp-2 min-h-12 text-base font-medium leading-6 text-black">
          <Link
            href={productUrl}
            className="cursor-pointer transition-colors hover:text-[#db4444] focus-visible:outline-none focus-visible:underline"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-medium text-[#db4444]">
            {formatPrice(product.priceCents)}
          </span>

          {product.compareAtPriceCents &&
          product.compareAtPriceCents > product.priceCents ? (
            <span className="text-sm text-gray-500 line-through">
              {formatPrice(product.compareAtPriceCents)}
            </span>
          ) : null}
        </div>

        {product.ratingCount ? (
          <div
            className="mt-2 flex items-center gap-2"
            aria-label={`${product.ratingAverage} out of 5 stars`}
          >
            <div className="flex text-[#ffad33]" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <StarIcon
                  key={index}
                  filled={index < Math.round(product.ratingAverage ?? 0)}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-gray-500">
              ({product.ratingCount})
            </span>
          </div>
        ) : null}

        <p className="mt-2 text-xs font-medium text-gray-500">
          {isOutOfStock
            ? 'Currently unavailable'
            : `${product.stockQuantity} available`}
        </p>

        {message ? (
          <p
            role="status"
            className="mt-2 text-xs font-medium text-gray-600"
          >
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ProductImageFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-100 px-6 text-center text-sm text-gray-400">
      Product image unavailable
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m10 1.7 2.55 5.17 5.7.83-4.12 4.02.97 5.68L10 14.72 4.9 17.4l.97-5.68L1.75 7.7l5.7-.83L10 1.7Z"
      />
    </svg>
  );
}