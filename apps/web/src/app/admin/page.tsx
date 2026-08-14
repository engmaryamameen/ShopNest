import { cookies } from 'next/headers';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';

export const dynamic = 'force-dynamic';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const cookieHeader = (await cookies()).toString();
  const summary = await api.adminDashboard(cookieHeader);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total revenue" value={formatPrice(summary.orders.totalRevenueCents)} />
        <StatCard label="Users" value={summary.users.total} />
        <StatCard label="Published products" value={summary.products.published} />
        <StatCard label="Pending vendor applications" value={summary.pendingVendorApplications} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Orders by status</h2>
          <div className="space-y-1 text-sm">
            {Object.entries(summary.orders.byStatus).length === 0 && (
              <p className="text-gray-400">No orders yet</p>
            )}
            {Object.entries(summary.orders.byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span className="text-gray-500">{status}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Vendors by status</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="font-medium text-gray-900">{summary.vendors.pending}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Approved</span><span className="font-medium text-gray-900">{summary.vendors.approved}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Suspended</span><span className="font-medium text-gray-900">{summary.vendors.suspended}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rejected</span><span className="font-medium text-gray-900">{summary.vendors.rejected}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <Link href="/admin/orders" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
          <p className="text-gray-500 mt-1">Manage customer orders and update status</p>
        </Link>
        <Link href="/admin/products" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Products</h2>
          <p className="text-gray-500 mt-1">Add, edit, and remove products</p>
        </Link>
        <Link href="/admin/categories" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Categories</h2>
          <p className="text-gray-500 mt-1">Manage product categories</p>
        </Link>
        <Link href="/admin/vendors" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Vendors</h2>
          <p className="text-gray-500 mt-1">Approve, reject, or suspend vendor applications</p>
        </Link>
        <Link href="/admin/users" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Users</h2>
          <p className="text-gray-500 mt-1">Suspend or reactivate accounts</p>
        </Link>
        <Link href="/admin/reviews" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Reviews</h2>
          <p className="text-gray-500 mt-1">Moderate published customer reviews</p>
        </Link>
        <Link href="/admin/returns" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Returns</h2>
          <p className="text-gray-500 mt-1">Review and decide customer return requests</p>
        </Link>
        <Link href="/admin/promotions" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Promotions</h2>
          <p className="text-gray-500 mt-1">Create platform-wide discount codes</p>
        </Link>
        <Link href="/admin/imports" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-semibold text-gray-900">Catalog imports</h2>
          <p className="text-gray-500 mt-1">Preview, scope, and run supplier synchronizations</p>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent activity</h2>
          <Link href="/admin/audit-log" className="text-sm text-indigo-600 hover:text-indigo-700">View all →</Link>
        </div>
        {summary.recentAuditLogs.length === 0 ? (
          <p className="text-gray-400 text-sm">No activity recorded yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {summary.recentAuditLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
                <span className="text-gray-700">
                  {log.action.replace(/_/g, ' ').toLowerCase()}
                  {log.actor && <span className="text-gray-400"> · {log.actor.email}</span>}
                </span>
                <span className="text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
