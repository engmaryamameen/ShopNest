'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { OrderStatus } from '@/lib/api-types';
import { AdminSelect } from '@/components/ui/admin-form';

interface AdminOrderStatusFormProps {
  orderId: string;
  availableStatuses: OrderStatus[];
}

export function AdminOrderStatusForm({ orderId, availableStatuses }: AdminOrderStatusFormProps) {
  const [status, setStatus] = useState<OrderStatus | ''>(availableStatuses[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!status) return;
    const nextStatus = status;

    startTransition(async () => {
      try {
        await api.adminUpdateOrderStatus(orderId, { status: nextStatus });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Update failed');
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Update Order Status</h2>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="order-next-status" className="sr-only">
            New order status
          </label>
          <AdminSelect
            id="order-next-status"
            value={status}
            onChange={(next) => setStatus(next as OrderStatus)}
            options={availableStatuses.map((next) => ({ value: next, label: next }))}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !status}
          className="px-6 py-2 shopnest-primary rounded-lg font-medium  disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Updating…' : 'Update'}
        </button>
      </form>
    </div>
  );
}
