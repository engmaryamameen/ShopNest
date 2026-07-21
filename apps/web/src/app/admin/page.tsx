import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/admin/orders"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
          <p className="text-gray-500 mt-1">Manage customer orders and update status</p>
        </Link>
        <Link
          href="/admin/products"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900">Products</h2>
          <p className="text-gray-500 mt-1">Add, edit, and remove products</p>
        </Link>
      </div>
    </div>
  );
}
