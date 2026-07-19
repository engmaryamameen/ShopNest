'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    startTransition(async () => {
      try {
        await api.cancelOrder(orderId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Failed to cancel order');
      }
    });
  }

  return (
    <button
      onClick={handleCancel}
      disabled={isPending}
      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? 'Cancelling…' : 'Cancel Order'}
    </button>
  );
}
