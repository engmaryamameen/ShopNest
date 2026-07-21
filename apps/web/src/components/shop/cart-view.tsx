'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useCart, useRemoveCartItem, type Cart } from '@/lib/use-cart';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

interface CartViewProps {
  /** Server-fetched initial cart, hydrates the TanStack Query cache. */
  initialCart: Cart;
}

export function CartView({ initialCart }: CartViewProps) {
  const router = useRouter();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, startCheckoutTransition] = useTransition();

  // TanStack Query owns the cart state client-side.
  // initialCart seeds the cache so we render immediately without a waterfall.
  // The page only renders CartView when the user is authenticated, so data is
  // never null here — fall back to initialCart while the query initialises.
  const { data } = useCart();
  const cart: Cart = data ?? initialCart;
  const removeItem = useRemoveCartItem();

  const total = cart.items.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0,
  );

  function handleRemove(productId: string) {
    removeItem.mutate(productId);
  }

  function handleCheckout() {
    setCheckoutError(null);
    startCheckoutTransition(async () => {
      try {
        // Client-generated UUID v4 as idempotency key — stable for this attempt.
        const idempotencyKey = crypto.randomUUID();
        const order = (await api.checkout({ idempotencyKey })) as { id: string };
        router.push(`/orders/${order.id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          setCheckoutError(err.message);
        } else {
          setCheckoutError('Checkout failed. Please try again.');
        }
      }
    });
  }

  if (cart.items.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h1>
        <Link href="/shop" className="text-indigo-600 hover:text-indigo-700 font-medium">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                {item.product.imageUrl ? (
                  <Image
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100" />
                )}
              </div>

              <div className="flex-1">
                <Link
                  href={`/products/${item.product.slug}`}
                  className="font-semibold text-gray-900 hover:text-indigo-600"
                >
                  {item.product.name}
                </Link>
                <p className="text-gray-500 text-sm mt-0.5">
                  {formatPrice(item.product.priceCents)} each
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                  <span className="font-semibold">
                    {formatPrice(item.product.priceCents * item.quantity)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleRemove(item.productId)}
                disabled={removeItem.isPending}
                className="text-red-400 hover:text-red-600 text-sm transition-colors disabled:opacity-50"
                aria-label={`Remove ${item.product.name} from cart`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 h-fit sticky top-24">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>

          <div className="space-y-2 mb-4">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-600">
                <span>
                  {item.product.name} × {item.quantity}
                </span>
                <span>{formatPrice(item.product.priceCents * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 mb-6">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {checkoutError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {checkoutError}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={isCheckingOut}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isCheckingOut ? 'Processing…' : 'Place Order'}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">All amounts in USD</p>
        </div>
      </div>
    </div>
  );
}
