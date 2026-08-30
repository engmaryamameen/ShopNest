import { cookies } from 'next/headers';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { StatusBreakdownCard } from '@/components/admin/dashboard/status-breakdown-card';
import { TopProductsCard } from '@/components/admin/dashboard/top-products-card';
import { RecentActivityCard } from '@/components/admin/dashboard/recent-activity-card';
import { WeeklyAreaChart } from '@/components/admin/weekly-area-chart';

export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/admin/orders', title: 'Orders', description: 'Manage customer orders and update status' },
  { href: '/admin/products', title: 'Products', description: 'Add, edit, and remove products' },
  { href: '/admin/categories', title: 'Categories', description: 'Manage product categories' },
  { href: '/admin/vendors', title: 'Vendors', description: 'Approve, reject, or suspend vendor applications' },
  { href: '/admin/users', title: 'Customers', description: 'Suspend or reactivate accounts' },
  { href: '/admin/reviews', title: 'Reviews', description: 'Moderate published customer reviews' },
  { href: '/admin/returns', title: 'Returns', description: 'Review and decide customer return requests' },
  { href: '/admin/promotions', title: 'Promotions', description: 'Create platform-wide discount codes' },
  { href: '/admin/imports', title: 'Catalog imports', description: 'Preview, scope, and run supplier synchronizations' },
];

export default async function AdminDashboardPage() {
  const cookieHeader = (await cookies()).toString();
  const summary = await api.adminDashboard(cookieHeader);

  const weeklyRevenueCents = summary.weeklyTrend.reduce((sum, d) => sum + d.revenueCents, 0);
  const weeklyOrderCount = summary.weeklyTrend.reduce((sum, d) => sum + d.orderCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Sales" sublabel="Last 7 days" value={formatPrice(weeklyRevenueCents)} changePercent={summary.revenueChangePercent} />
        <StatCard label="Orders" sublabel="Last 7 days" value={weeklyOrderCount} changePercent={summary.orderCountChangePercent} />
        <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
          <p className="text-[18px] font-bold text-admin-heading font-lato mb-3">Pending &amp; cancelled</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-admin-muted font-lato">Pending</p>
              <p className="text-[22px] font-bold text-admin-ink font-lato">{summary.orders.byStatus.PENDING ?? 0}</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <p className="text-sm text-admin-muted font-lato">Cancelled</p>
              <p className="text-[22px] font-bold text-admin-danger font-lato">{summary.orders.byStatus.CANCELLED ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
        <h2 className="font-bold text-admin-heading font-lato mb-4">Revenue this week</h2>
        <WeeklyAreaChart data={summary.weeklyTrend} />
      </div>

      <TopProductsCard products={summary.topProducts} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusBreakdownCard
          title="Orders by status"
          rows={Object.entries(summary.orders.byStatus).map(([label, value]) => ({ label, value: value ?? 0 }))}
        />
        <StatusBreakdownCard
          title="Vendors by status"
          rows={[
            { label: 'Pending', value: summary.vendors.pending },
            { label: 'Approved', value: summary.vendors.approved },
            { label: 'Suspended', value: summary.vendors.suspended },
            { label: 'Rejected', value: summary.vendors.rejected },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <StatCard label="All-time revenue" value={formatPrice(summary.orders.totalRevenueCents)} />
        <StatCard label="Users" value={summary.users.total} />
        <StatCard label="Published products" value={summary.products.published} />
        <StatCard label="Pending vendor applications" value={summary.pendingVendorApplications} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5 hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-bold text-admin-ink font-lato">{link.title}</h2>
            <p className="text-admin-muted mt-1 text-sm font-lato">{link.description}</p>
          </Link>
        ))}
      </div>

      <RecentActivityCard logs={summary.recentAuditLogs} />
    </div>
  );
}
