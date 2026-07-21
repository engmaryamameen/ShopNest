import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AdminOrderStatusForm } from '@/components/admin/admin-order-status-form';

export const dynamic = 'force-dynamic';

interface Order {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  user?: { id: string; email: string };
  items: Array<{
    id: string;
    productName: string;
    productSlug: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    createdAt: string;
  }>;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let order: Order;
  try {
    order = (await api.adminGetOrder(id, cookieHeader)) as Order;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const nextStatuses: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  };

  const available = nextStatuses[order.status] ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          {order.user && <p className="text-gray-500 mt-1">{order.user.email}</p>}
        </div>
        <span className="px-4 py-1.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
          {order.status}
        </span>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b font-semibold text-gray-900">Items</div>
        <div className="divide-y">
          {order.items.map((item) => (
            <div key={item.id} className="px-6 py-4 flex justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.productName}</p>
                <p className="text-sm text-gray-500">× {item.quantity}</p>
              </div>
              <p className="font-medium">{formatPrice(item.unitPriceCents * item.quantity)}</p>
            </div>
          ))}
          <div className="px-6 py-4 flex justify-between bg-gray-50 font-bold">
            <span>Total</span>
            <span>{formatPrice(order.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* Status update */}
      {available.length > 0 && (
        <AdminOrderStatusForm orderId={order.id} availableStatuses={available} />
      )}

      {/* Status history */}
      {order.statusHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
          <div className="px-6 py-4 border-b font-semibold text-gray-900">Status History</div>
          <div className="divide-y">
            {order.statusHistory.map((h) => (
              <div key={h.id} className="px-6 py-3 flex justify-between text-sm">
                <span className="text-gray-600">{h.fromStatus} → {h.toStatus}</span>
                <span className="text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
