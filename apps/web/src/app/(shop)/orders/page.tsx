import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Order {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: Array<{ productName: string; quantity: number; unitPriceCents: number }>;
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

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let orders: Order[];
  try {
    orders = (await api.listOrders(cookieHeader)) as Order[];
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/orders');
    }
    throw err;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Your Orders</h1>

      {orders.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg mb-4">No orders yet.</p>
          <Link href="/shop" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                  <div className="mt-2 text-sm text-gray-600">
                    {order.items.map((item, i) => (
                      <span key={i}>
                        {item.productName} × {item.quantity}
                        {i < order.items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800'}`}
                  >
                    {order.status}
                  </span>
                  <p className="mt-2 text-lg font-bold text-gray-900">{formatPrice(order.totalCents)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
