import Link from 'next/link';
import type { VendorAnalyticsResponse, VendorResponse } from '@/lib/api-types';
import { formatPrice } from '@/lib/format-price';

export function VendorDashboard({ vendor, analytics }: { vendor: VendorResponse; analytics: VendorAnalyticsResponse }) {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">{vendor.name}</h1>
      <p className="text-gray-500 mb-8">Vendor dashboard</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(analytics.totalRevenueCents)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.totalOrders}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Awaiting fulfilment</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.ordersAwaitingFulfilment}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link href="/vendor/offers" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Offers</h2>
          <p className="text-gray-500 mt-1">Manage your listings and inventory</p>
        </Link>
        <Link href="/vendor/orders" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
          <p className="text-gray-500 mt-1">Confirm and ship orders</p>
        </Link>
        <Link href="/vendor/staff" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Staff</h2>
          <p className="text-gray-500 mt-1">Invite teammates to help run your store</p>
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Offer status</h2>
          <p className="text-gray-500 mt-1">
            {Object.entries(analytics.offersByStatus)
              .map(([status, count]) => `${count} ${status.toLowerCase()}`)
              .join(', ') || 'No offers yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
