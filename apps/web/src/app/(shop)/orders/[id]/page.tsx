import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CancelOrderButton } from '@/components/shop/cancel-order-button';

export const dynamic = 'force-dynamic';

interface Order {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
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

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let order: Order;
  try {
    order = (await api.getOrder(id, cookieHeader)) as Order;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/orders');
    }
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
          <p className="text-gray-500 mt-1">#{order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
          {order.status}
        </span>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Items</h2>
        </div>
        <div className="divide-y">
          {order.items.map((item) => (
            <div key={item.id} className="px-6 py-4 flex justify-between">
              <div>
                <Link href={`/products/${item.productSlug}`} className="font-medium text-gray-900 hover:text-indigo-600">
                  {item.productName}
                </Link>
                <p className="text-sm text-gray-500">× {item.quantity}</p>
              </div>
              <p className="font-medium">{formatPrice(item.unitPriceCents * item.quantity)}</p>
            </div>
          ))}
          <div className="px-6 py-4 flex justify-between bg-gray-50">
            <span className="font-bold">Total</span>
            <span className="font-bold text-lg">{formatPrice(order.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* Status history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Status History</h2>
        </div>
        <div className="divide-y">
          {order.statusHistory.map((h) => (
            <div key={h.id} className="px-6 py-3 flex justify-between text-sm">
              <span className="text-gray-600">
                {h.fromStatus} → {h.toStatus}
              </span>
              <span className="text-gray-400">
                {new Date(h.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href="/orders" className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
          Back to orders
        </Link>
        {order.status === 'PENDING' && (
          <CancelOrderButton orderId={order.id} />
        )}
      </div>
    </div>
  );
}
