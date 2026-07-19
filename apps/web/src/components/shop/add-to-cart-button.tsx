'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface AddToCartButtonProps {
  productId: string;
  stockQuantity: number;
}

export function AddToCartButton({ productId, stockQuantity }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (stockQuantity === 0) {
    return (
      <button
        disabled
        className="w-full py-3 px-6 bg-gray-200 text-gray-500 rounded-xl cursor-not-allowed font-medium"
      >
        Out of Stock
      </button>
    );
  }

  function handleAdd() {
    setMessage(null);
    startTransition(async () => {
      try {
        await api.upsertCartItem({ productId, quantity });
        setMessage({ type: 'success', text: 'Added to cart!' });
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login?returnTo=/cart');
        } else {
          setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Failed to add to cart' });
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`px-4 py-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center border border-gray-300 rounded-lg">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-gray-600 hover:bg-gray-50"
          >
            −
          </button>
          <span className="px-4 py-2 font-medium min-w-[3rem] text-center">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(10, q + 1, stockQuantity))}
            className="px-3 py-2 text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
        </div>

        <button
          onClick={handleAdd}
          disabled={isPending}
          className="flex-1 py-3 px-6 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
