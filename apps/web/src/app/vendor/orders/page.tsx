import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { VendorOrderList } from '@/components/vendor/vendor-order-list';

export const dynamic = 'force-dynamic';

export default async function VendorOrdersPage() {
  const cookieHeader = (await cookies()).toString();

  try {
    const vendor = await api.vendorMe(cookieHeader);
    if (vendor.status !== 'APPROVED') redirect('/vendor');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) redirect('/vendor');
    throw err;
  }

  const orders = await api.vendorListOrders(undefined, cookieHeader);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders</h1>
      <VendorOrderList orders={orders} />
    </div>
  );
}
