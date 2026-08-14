import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { VendorStatusActions } from '@/components/admin/vendor-status-actions';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-gray-100 text-gray-600',
};

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const cookieHeader = (await cookies()).toString();
  const vendors = await api.adminListVendors(status, cookieHeader);

  const tabs = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Vendors</h1>

      <div className="flex gap-2 mb-6 text-sm">
        <a
          href="/admin/vendors"
          className={`px-3 py-1.5 rounded-lg ${!status ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          All
        </a>
        {tabs.map((t) => (
          <a
            key={t}
            href={`/admin/vendors?status=${t}`}
            className={`px-3 py-1.5 rounded-lg ${status === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {t[0] + t.slice(1).toLowerCase()}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Vendor</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Contact</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Applied</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendors.map((vendor) => (
              <tr key={vendor.id}>
                <td className="px-6 py-4 text-gray-900">{vendor.name}</td>
                <td className="px-6 py-4 text-gray-600">{vendor.contactEmail}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[vendor.status] ?? 'bg-gray-100 text-gray-800'}`}
                  >
                    {vendor.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(vendor.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4">
                  <VendorStatusActions vendorId={vendor.id} status={vendor.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {vendors.length === 0 && <p className="text-center text-gray-500 py-12">No vendors found.</p>}
      </div>
    </div>
  );
}
