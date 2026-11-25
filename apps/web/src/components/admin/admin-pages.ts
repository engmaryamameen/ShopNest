export const ADMIN_PAGES = [
  { href: '/admin/products', title: 'Products' },
  { href: '/admin/categories', title: 'Categories' },
  { href: '/admin/reviews', title: 'Reviews' },
  { href: '/admin/imports', title: 'Catalog imports' },
  { href: '/admin/orders', title: 'Orders' },
  { href: '/admin/returns', title: 'Returns' },
  { href: '/admin/promotions', title: 'Promotions' },
  { href: '/admin/vendors', title: 'Vendors' },
  { href: '/admin/users', title: 'Customers' },
  { href: '/admin/admins', title: 'Admin accounts' },
  { href: '/admin/audit-log', title: 'Audit log' },
  { href: '/admin/demo-data', title: 'Demo data' },
  { href: '/admin', title: 'Dashboard' },
];

export function adminPageTitle(path: string): string {
  const page = ADMIN_PAGES.find(({ href }) => path === href || (href !== '/admin' && path.startsWith(`${href}/`)));
  return page ? (path === page.href ? page.title : `${page.title} details`) : 'Admin';
}
