import { cookies } from 'next/headers';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { StatusBreakdownCard } from '@/components/admin/dashboard/status-breakdown-card';
import { TopProductsCard } from '@/components/admin/dashboard/top-products-card';
import { RecentActivityCard } from '@/components/admin/dashboard/recent-activity-card';
import { WeeklyAreaChart } from '@/components/admin/weekly-area-chart';
import { DashboardRangeSelect } from '@/components/admin/dashboard/dashboard-range-select';

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
  { href: '/admin/imports', title: 'Catalog imports', description: 'Review import history; new imports are disabled' },
];

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const selected = cookieStore.get('shopnest_dashboard_range')?.value ?? '30';
  const requestedTimezone = cookieStore.get('shopnest_dashboard_timezone')?.value ?? 'UTC';
  let timezone = requestedTimezone;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { timezone = 'UTC'; }
  const cookieHeader = cookieStore.toString();
  const summary = await api.adminDashboard(cookieHeader, selected, timezone);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4"><h2 className="font-[Inter,sans-serif] text-sm leading-5 font-semibold text-black">Overview</h2><DashboardRangeSelect selected={selected} timezone={timezone} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        <StatCard label="Total Sales" sublabel="Gross merchandise value, excluding cancelled orders" value={typeof summary.periodMerchandiseCents === 'number' && Number.isFinite(summary.periodMerchandiseCents) ? formatPrice(summary.periodMerchandiseCents) : '—'} />
        <StatCard label="Platform Revenue" sublabel="Revenue tracking is not yet available." value="—" />
        <StatCard label="Total Orders" sublabel="All orders placed during the selected period" value={typeof summary.periodOrders === 'number' && Number.isFinite(summary.periodOrders) ? summary.periodOrders.toLocaleString('en-US') : '—'} />
        <StatCard label="Active Vendors" sublabel="Currently approved and active vendors" value={summary.vendors.approved.toLocaleString('en-US')} />
        <StatCard label="Total Customers" sublabel="Total registered customer accounts" value={summary.users.customers.toLocaleString('en-US')} />
        <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
          <p className="mb-3 font-['Inter_Variable',sans-serif] text-sm leading-5 font-semibold text-black [font-feature-settings:'ss01'_on,'cv01'_on]">Pending &amp; Cancelled Orders</p>
          <p className="mb-3 font-['Inter_Variable',sans-serif] text-xs leading-[18px] text-admin-muted">Order status during the selected period</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-admin-muted font-lato">Pending</p>
              <p className="font-[family-name:var(--font-stat-value)] text-[24px] leading-[36px] font-[600] text-[#1c1c1c]">{summary.periodOrderStatuses ? (summary.periodOrderStatuses.PENDING ?? 0).toLocaleString('en-US') : '—'}</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <p className="text-sm text-admin-muted font-lato">Cancelled</p>
              <p className="font-[family-name:var(--font-stat-value)] text-[24px] leading-[36px] font-[600] text-admin-danger">{summary.periodOrderStatuses ? (summary.periodOrderStatuses.CANCELLED ?? 0).toLocaleString('en-US') : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
        <h2 className="font-bold text-admin-heading font-lato mb-4">Simulated order totals · last 30 days (UTC)</h2>
        <WeeklyAreaChart data={summary.weeklyTrend} />
      </div>

      <TopProductsCard products={summary.topProducts} period="Selected period" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusBreakdownCard
          title="Orders by status · all time"
          rows={Object.entries(summary.orders.byStatus).map(([label, value]) => ({ label, value: value ?? 0 }))}
        />
        <StatusBreakdownCard
          title="Vendors by status · current"
          rows={[
            { label: 'Pending', value: summary.vendors.pending },
            { label: 'Approved', value: summary.vendors.approved },
            { label: 'Suspended', value: summary.vendors.suspended },
            { label: 'Rejected', value: summary.vendors.rejected },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <StatCard label="All-time simulated order total" value={formatPrice(summary.orders.totalRevenueCents)} />
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
