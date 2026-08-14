'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { VendorFulfilmentResponse } from '@/lib/api-types';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

// Vendors act only within the seller-authority slice of the state machine —
// PENDING → CONFIRMED → SHIPPED. DELIVERED/CANCELLED are outside a single
// seller's authority (see order-state-machine.ts VENDOR_TRANSITIONS on the API).
const NEXT_STATUS: Record<string, 'CONFIRMED' | 'SHIPPED' | null> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'SHIPPED',
  SHIPPED: null,
  DELIVERED: null,
  CANCELLED: null,
};

export function VendorOrderList({ orders }: { orders: VendorFulfilmentResponse[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function advance(orderId: string, next: 'CONFIRMED' | 'SHIPPED') {
    startTransition(async () => {
      try {
        await api.vendorUpdateOrderStatus(orderId, next);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not update order status');
      }
    });
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-500">
        No orders yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subtotal</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((order) => {
            const next = NEXT_STATUS[order.status];
            return (
              <tr key={order.id} className="hover:bg-gray-50 align-top">
                <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                  {order.orderId.slice(0, 8)}…
                  <div className="text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{order.order.user.email}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      {item.quantity} × {item.productName}
                    </div>
                  ))}
                </td>
                <td className="px-6 py-4 text-sm font-medium">{formatPrice(order.subtotalCents)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[order.status]}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {next && (
                    <button
                      onClick={() => advance(order.id, next)}
                      disabled={isPending}
                      className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
                    >
                      Mark {next === 'CONFIRMED' ? 'confirmed' : 'shipped'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
