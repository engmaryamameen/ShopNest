'use client';

import { usePathname } from 'next/navigation';

const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/admin/products', title: 'Products' },
  { prefix: '/admin/categories', title: 'Categories' },
  { prefix: '/admin/reviews', title: 'Reviews' },
  { prefix: '/admin/imports', title: 'Catalog Imports' },
  { prefix: '/admin/orders', title: 'Order Management' },
  { prefix: '/admin/returns', title: 'Returns' },
  { prefix: '/admin/promotions', title: 'Promotions' },
  { prefix: '/admin/vendors', title: 'Vendors' },
  { prefix: '/admin/users', title: 'Customers' },
  { prefix: '/admin/admins', title: 'Admin Accounts' },
  { prefix: '/admin/audit-log', title: 'Audit Log' },
  { prefix: '/admin', title: 'Dashboard' },
];

/** A slim, honest header: just the current section's name, kept in sync
 * with the sidebar's own nav labels. No search bar, notification bell, or
 * theme toggle — none of those have anything real behind them yet in
 * ShopNest, and this project's standing rule is no decorative dead UI. */
export function AdminTopbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix))?.title ?? 'Admin';

  return (
    <header className="h-16 flex items-center px-8 bg-white border-b border-gray-100">
      <h1 className="font-lato font-bold text-xl text-admin-ink">{title}</h1>
    </header>
  );
}
